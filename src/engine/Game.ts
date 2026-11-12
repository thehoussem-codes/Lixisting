import * as THREE from 'three';
import { Input } from './Input';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { Car } from '../vehicles/Car';
import { CAR_CATALOG, MOTO_CATALOG, applyVehicleAssets } from '../vehicles/CarModels';
import { assets } from '../assets/AssetLibrary';
import { Traffic } from '../vehicles/Traffic';
import { TrafficLights } from '../world/TrafficLights';
import { buildAnnabaWorld } from '../world/AnnabaWorld';
import { buildTestTrack } from '../world/TestTrack';
import type { Water } from '../world/Water';
import type { Collider } from '../world/Collider';
import { loadTerrain } from '../world/Terrain';
import { buildTrees, loadTrees } from '../world/Trees';
import { loadWorldData, type WorldPlace } from '../world/WorldData';
import { MapView } from '../ui/MapView';

/**
 * Part de la résolution de l'écran réellement calculée. 1 = image nette.
 * Si le jeu rame, ajouter ?res=0.6 à l'adresse pour alléger le calcul.
 */
const RENDER_SCALE = Math.min(1, Math.max(0.3, Number(new URLSearchParams(window.location.search).get('res')) || 1));
const DRONE = new URLSearchParams(window.location.search).get('drone')?.split(',').map(Number);
const SHADOWS = new URLSearchParams(window.location.search).get('ombres') !== '0';
const SHADOW_RANGE = 85; // demi-largeur de la zone ombrée autour du joueur, en mètres
const AUTO_SCALE = !new URLSearchParams(window.location.search).has('res');
const ENTER_DISTANCE = 4.5;
const VIEW_DISTANCE = 1400; // au-delà, tout est noyé dans le brouillard
const ROAD_SURFACE = 0.2;

export interface GameEvents {
  onStatus(text: string): void;
  onPlaces(places: WorldPlace[]): void;
  /** Quartier le plus proche et vitesse (km/h, null à pied), quelques fois par seconde. */
  onHud(zone: string, speed: number | null, fps: number): void;
}

/** Le moteur : crée la scène, fait tourner la boucle de jeu, nettoie à la fin. */
export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.5, 7000);
  private clock = new THREE.Clock();
  private input: Input;
  private player = new Player();
  private cameraRig: ThirdPersonCamera;
  private collider: Collider | null = null;
  /** Hauteur du sol en un point (0 partout tant que le terrain n'est pas chargé). */
  private ground: (x: number, z: number) => number = () => 0;
  private places: WorldPlace[] = [];
  private cars: Car[] = [];
  private map: MapView | null = null;
  private traffic: Traffic | null = null;
  private lights: TrafficLights | null = null;
  private sky: THREE.Mesh | null = null;
  private water: Water | null = null;
  private time = 0;
  /** Résolution de calcul actuelle (s'adapte à la fluidité, sauf si ?res= est fixé). */
  private renderScale = RENDER_SCALE;
  private scaleTimer = 2;
  private sun: THREE.DirectionalLight | null = null;
  private sunDirection = new THREE.Vector3(0.6, 0.75, 0.25);
  private hudTimer = 0;
  /** Blocs de décor masqués quand ils sont au-delà du brouillard (inutile de les dessiner). */
  private chunks: { mesh: THREE.Mesh; x: number; z: number; reach: number }[] = [];
  /** Durée moyenne d'une image (secondes), pour mesurer la fluidité. */
  private frameTime = 1 / 60;
  /** Voiture conduite en ce moment (null = à pied). */
  private driving: Car | null = null;
  /** Ce qui bloque le personnage à pied : bâtiments et voitures. */
  private obstacles = {
    blocked: (x: number, z: number, radius: number): boolean =>
      (this.collider?.blocked(x, z, radius) ?? false) || this.allCars().some((car) => car.contains(x, z, radius)),
  };
  private frameId = 0;
  private disposed = false;

  constructor(private container: HTMLElement, private events: GameEvents) {
    this.renderer.setPixelRatio(1);
    container.appendChild(this.renderer.domElement);

    this.input = new Input(this.renderer.domElement);
    this.cameraRig = new ThirdPersonCamera(this.camera);
    this.scene.background = new THREE.Color(0x9fd0ea);
    this.scene.add(this.player.object);

    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    this.resize();
    void this.loadWorld();
    // Vérifications automatiques : monter dans la voiture la plus proche, quelle que soit la distance.
    (window as unknown as Record<string, unknown>).lixitingDrive = () => { this.toggleCar(Infinity); };
    // Petit accès de diagnostic, utilisé par les vérifications automatiques.
    (window as unknown as Record<string, unknown>).lixitingDebug = () => ({
      traffic: this.traffic?.cars.filter((c) => c.object.visible).length ?? 0,
      nearestTraffic: Math.min(...(this.traffic?.cars ?? []).map((c) => c.object.position.distanceTo(this.player.object.position))),
      player: this.player.object.position.toArray().map((v) => Math.round(v * 10) / 10),
      fps: Math.round(1 / this.frameTime),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      scale: this.renderScale,
      swimming: this.player.swimming,
      character: this.player.probe(),
      car: this.driving ? { kmh: Math.round(this.driving.speed * 3.6), above: Math.round((this.driving.object.position.y - this.ground(this.driving.object.position.x, this.driving.object.position.z)) * 100) / 100, ...this.driving.telemetry } : null,
    });
  }

  start(): void {
    this.clock.start();
    this.frameId = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    this.input.dispose();
    this.map?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Zone d'essai de la physique (?test=1) : terrain fictif, toutes les voitures du catalogue alignées. */
  private loadTestZone(): void {
    this.ground = buildTestTrack(this.scene);
    CAR_CATALOG.forEach((spec, i) => {
      const car = new Car(spec, spec.colors[0]);
      car.place((i - (CAR_CATALOG.length - 1) / 2) * 3.2, 3.6, 0);
      this.cars.push(car);
      this.scene.add(car.object);
    });
    // Les deux-roues, juste à côté du joueur (le maxi-scooter est le plus proche).
    MOTO_CATALOG.forEach((spec, i) => {
      const moto = new Car(spec, spec.colors[0]);
      moto.place(i === 0 ? 1.2 : -2.4, -2.5, Math.PI);
      this.cars.push(moto);
      this.scene.add(moto.object);
    });
    this.player.teleport(0, this.ground(0, 0), 0);
    this.events.onStatus('ZONE DE TEST (terrain fictif) : tremplin droit devant, côte et falaise à gauche, bosses à droite');
  }

  private async loadWorld(): Promise<void> {
    // Catalogue de modèles 3D : véhicules et personnage fournis, s'il y en a.
    await assets.init();
    applyVehicleAssets();
    void this.player.loadModel();
    if (new URLSearchParams(window.location.search).has('test')) { this.loadTestZone(); return; }
    try {
      this.events.onStatus('Chargement de la carte d\'Annaba...');
      const [data, terrain, trees] = await Promise.all([loadWorldData(), loadTerrain(), loadTrees()]);
      if (this.disposed) return;
      // Personnage et voitures roulent sur la surface des rues, posée 20 cm au-dessus du terrain brut.
      // Sans ce décalage, les roues s'enfonçaient dans la chaussée.
      // En mer et sur la pente du rivage (sous 40 cm), pas de décalage : c'est le fond marin.
      this.ground = (x, z) => { const h = terrain.heightAt(x, z); return h > 0.39 ? h + ROAD_SURFACE : h; };
      Car.waterLevel = 0;
      const world = buildAnnabaWorld(this.scene, data, terrain);
      this.collider = world.collider;
      this.sky = world.sky;
      this.water = world.water;
      const treeCount = buildTrees(this.scene, trees, terrain.heightAt);
      // Blocs de décor (bâtiments, arbres, lampadaires) : on notera lesquels sont assez proches pour être affichés.
      this.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.parent !== this.scene || !mesh.frustumCulled) return; // ni la mer ni le ciel
        mesh.geometry.computeBoundingSphere();
        const sphere = mesh.geometry.boundingSphere;
        if (sphere && sphere.radius > 20 && sphere.radius < 700) this.chunks.push({ mesh, x: sphere.center.x, z: sphere.center.z, reach: sphere.radius + ((mesh.userData.viewDistance as number | undefined) ?? VIEW_DISTANCE) });
      });
      this.places = data.places;
      this.traffic = new Traffic(data, (car) => this.scene.add(car.object));
      this.lights = new TrafficLights(this.scene, data, this.ground);
      this.traffic.lights = this.lights;
      this.map = new MapView(data, (index) => this.goToPlace(index));
      this.events.onPlaces(data.places);
      // Une voiture garée à chaque repère, pour en avoir toujours une sous la main.
      data.places.forEach((place, i) => {
        const spec = CAR_CATALOG[i % CAR_CATALOG.length];
        const car = new Car(spec, spec.colors[i % spec.colors.length]);
        // Garée contre le trottoir, dans le sens de la rue (emplacement calculé avec la carte).
        car.place(place.cx, -place.cn, place.ch);
        this.cars.push(car);
        this.scene.add(car.object);
      });
      // Un deux-roues garé à côté de la voiture, un repère sur deux (maxi-scooter et cyclomoteur en alternance).
      data.places.forEach((place, i) => {
        if (i % 2) return;
        const moto = new Car(MOTO_CATALOG[(i / 2) % MOTO_CATALOG.length], MOTO_CATALOG[(i / 2) % MOTO_CATALOG.length].colors[i % 4]);
        moto.place(place.cx + Math.sin(place.ch) * 4.2, -place.cn + Math.cos(place.ch) * 4.2, place.ch);
        this.cars.push(moto);
        this.scene.add(moto.object);
      });
      this.goToPlace(0);
      this.setupShadows();
      // Adresse du type ...?at=x,n : démarre à ce point de la carte (mètres depuis la gare, n = nord).
      const at = new URLSearchParams(window.location.search).get('at')?.split(',').map(Number);
      if (at && at.length === 2 && at.every(Number.isFinite)) this.player.teleport(at[0], this.ground(at[0], -at[1]), -at[1]);
      // Adresse ...?salon=1 : expose tout le catalogue de voitures devant le joueur (pour les comparer).
      if (new URLSearchParams(window.location.search).has('salon')) {
        const me = this.player.object.position;
        [...CAR_CATALOG, ...MOTO_CATALOG].forEach((spec, i) => {
          const car = new Car(spec, spec.colors[0]);
          const column = i % 5, row = Math.floor(i / 5);
          car.place(me.x + (column - 2) * 3.1, me.z + 5 + row * 5.5, Math.PI + (row === 0 ? 0.7 : -2.5));
          if (spec.moto) { car.place(me.x + (spec.moto === 'maxiscooter' ? 1.6 : -1.6), me.z - 2.6, Math.PI / 2 + 0.5); car.rider = spec.moto === 'cyclomoteur'; }
          this.cars.push(car);
          this.scene.add(car.object);
        });
      }
      const estimated = Math.round((100 * data.meta.buildings_height_estimated) / data.meta.buildings);
      this.events.onStatus(`${data.meta.buildings} bâtiments (hauteurs estimées : ${estimated} %) · ${data.meta.roads} tronçons de voies · ${treeCount} arbres · relief réel à 30 m`);
    } catch (error) {
      this.events.onStatus(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private goToPlace(index: number): void {
    const place = this.places[index];
    if (!place) return;
    // Seul le personnage se téléporte : s'il conduisait, la voiture reste sur place.
    if (this.driving) {
      this.driving.speed = 0;
      this.driving = null;
      this.player.object.visible = true;
    }
    this.player.teleport(place.x, this.ground(place.x, -place.n), -place.n);
  }

  /** Nom du repère le plus proche (à moins de 700 m), façon "nom de quartier". */
  private nearestPlace(): string {
    const { x, z } = this.player.object.position;
    let best = 700, name = '';
    for (const place of this.places) {
      const d = Math.hypot(place.x - x, -place.n - z);
      if (d < best) { best = d; name = place.name; }
    }
    return name;
  }

  /** Voitures garées et voitures de la circulation. */
  private allCars(): Car[] {
    return this.traffic ? [...this.cars, ...this.traffic.cars] : this.cars;
  }

  /** Touche F : monter dans la voiture la plus proche, ou en descendre. */
  private toggleCar(reach = ENTER_DISTANCE): void {
    const position = this.player.object.position;
    if (this.driving) {
      const car = this.driving;
      if (Math.abs(car.speed) > 3) return; // on ne descend pas en roulant
      // On sort du côté gauche (conducteur), sinon à droite si un mur gêne.
      const sideX = Math.cos(car.heading), sideZ = -Math.sin(car.heading);
      for (const side of [1.6, -1.6]) {
        const x = car.object.position.x + sideX * side, z = car.object.position.z + sideZ * side;
        if (this.collider?.blocked(x, z, 0.35)) continue;
        this.player.teleport(x, this.ground(x, z), z);
        this.player.object.visible = true;
        car.rider = false;
        this.driving = null;
        return;
      }
      return;
    }
    let nearest: Car | null = null;
    let best = reach;
    for (const car of this.allCars()) {
      const d = car.object.position.distanceTo(position);
      if (d < best) { best = d; nearest = car; }
    }
    if (nearest) {
      // Une voiture de la circulation devient une voiture du joueur.
      if (!this.cars.includes(nearest)) {
        this.traffic?.release(nearest);
        this.cars.push(nearest);
      }
      this.driving = nearest;
      this.player.object.visible = false;
      if (this.driving) this.driving.rider = true;
    }
  }

  /** Ombres portées du soleil (bâtiments, arbres, véhicules) dans un rayon autour du joueur. Désactivables : ?ombres=0. */
  private setupShadows(): void {
    this.scene.traverse((node) => { if ((node as THREE.DirectionalLight).isDirectionalLight) this.sun = node as THREE.DirectionalLight; });
    if (!this.sun || !SHADOWS) return;
    this.sunDirection.copy(this.sun.position).normalize();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const camera = this.sun.shadow.camera;
    camera.left = camera.bottom = -SHADOW_RANGE; camera.right = camera.top = SHADOW_RANGE;
    camera.near = 20; camera.far = 520;
    camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.25;
    this.scene.add(this.sun.target);
    this.scene.traverse((node) => { if ((node as THREE.Mesh).isMesh) node.receiveShadow = true; });
  }

  /** Touches 1 à 9 : téléportation vers un repère. */
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code.startsWith('Digit')) this.goToPlace(Number(e.code.slice(5)) - 1);
    if (e.code === 'KeyF') this.toggleCar();
    if (e.code === 'KeyM') this.map?.toggle();
  };

  private frame = () => {
    this.frameId = requestAnimationFrame(this.frame);
    // dt plafonné : évite un "saut" du personnage après un onglet mis en pause.
    const elapsed = this.clock.getDelta();
    this.frameTime += (elapsed - this.frameTime) * 0.05;
    const dt = Math.min(elapsed, 0.05);

    const everyCar = this.allCars();
    for (const car of this.cars) {
      if (car !== this.driving) car.coast(dt, this.collider, everyCar, this.ground);
    }
    if (this.driving) {
      const car = this.driving;
      car.drive(dt, this.input, this.collider, everyCar, this.ground);
      car.settle(this.ground, true);
      this.player.object.position.copy(car.object.position);
      // En roulant, la caméra revient d'elle-même derrière la voiture.
      const follow = Math.abs(car.speed) > 2 ? car.heading + Math.PI : null;
      this.cameraRig.update(this.input, car.object.position, this.collider, dt, this.ground, 9, follow);
    } else {
      this.player.update(dt, this.input, this.cameraRig.yaw, this.obstacles, this.ground);
      this.cameraRig.update(this.input, this.player.object.position, this.collider, dt, this.ground);
    }
    for (const car of this.cars) if (car !== this.driving) car.settle(this.ground, true);
    const me = this.player.object.position;
    this.lights?.update(dt);
    this.traffic?.update(dt, me.x, me.z, this.driving === null, this.cars, this.ground);
    const heading = this.driving ? this.driving.heading : this.player.object.rotation.y;
    this.map?.update(this.player.object.position.x, this.player.object.position.z, heading);
    if (DRONE) { // vue aérienne de contrôle : ?drone=hauteur,cap
      const target = this.player.object.position.clone(), heading = (DRONE[1] ?? 0) * Math.PI / 180;
      target.z += DRONE[2] ?? 0;
      this.camera.position.set(target.x - Math.sin(heading) * DRONE[0] * 0.9, target.y + DRONE[0], target.z + Math.cos(heading) * DRONE[0] * 0.9);
      this.camera.lookAt(target);
    }
    this.sky?.position.copy(this.camera.position);
    if (this.sun?.castShadow) {
      // L'ombre suit le joueur ; on cale sa position sur la grille de la carte d'ombre pour qu'elle ne scintille pas.
      const focus = this.driving ? this.driving.object.position : this.player.object.position;
      const step = (SHADOW_RANGE * 2) / this.sun.shadow.mapSize.x * 4;
      const fx = Math.round(focus.x / step) * step, fz = Math.round(focus.z / step) * step;
      this.sun.target.position.set(fx, focus.y, fz);
      this.sun.position.set(fx + this.sunDirection.x * 260, focus.y + this.sunDirection.y * 260, fz + this.sunDirection.z * 260);
    }
    this.time += dt;
    this.water?.update(this.time, this.camera.position);
    // Résolution automatique : on allège le calcul si le jeu rame, on le raffine s'il a de la marge.
    this.scaleTimer -= elapsed;
    if (AUTO_SCALE && this.scaleTimer <= 0) {
      this.scaleTimer = 1.5;
      const fps = 1 / this.frameTime;
      // Les ombres coûtent cher : si le jeu rame encore à la résolution minimale, on les coupe.
      if (this.sun?.castShadow && fps < 24 && this.renderScale <= 0.6) { this.sun.castShadow = false; console.info('Ombres coupées pour garder la fluidité.'); }
      const wanted = fps < 33 ? this.renderScale - 0.1 : fps > 52 ? this.renderScale + 0.05 : this.renderScale;
      const next = Math.min(1, Math.max(0.5, wanted));
      if (next !== this.renderScale) { this.renderScale = next; this.resize(); }
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      const eye = this.camera.position;
      for (const chunk of this.chunks) chunk.mesh.visible = Math.hypot(chunk.x - eye.x, chunk.z - eye.z) < chunk.reach;
      this.events.onHud(this.nearestPlace(), this.driving ? Math.abs(this.driving.speed) * 3.6 : null, Math.round(1 / this.frameTime));
    }
    this.renderer.render(this.scene, this.camera);
  };

  private resize = () => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    // false : on ne touche pas à la taille CSS, le canvas est étiré par style.css.
    this.renderer.setSize(Math.round(width * this.renderScale), Math.round(height * this.renderScale), false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
}
