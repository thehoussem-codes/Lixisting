import * as THREE from 'three';
import { Input } from './Input';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { Car } from '../vehicles/Car';
import { CAR_CATALOG } from '../vehicles/CarModels';
import { Traffic } from '../vehicles/Traffic';
import { buildAnnabaWorld } from '../world/AnnabaWorld';
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
const ENTER_DISTANCE = 4.5;
const ROAD_SURFACE = 0.2;

export interface GameEvents {
  onStatus(text: string): void;
  onPlaces(places: WorldPlace[]): void;
  /** Quartier le plus proche et vitesse (km/h, null à pied), quelques fois par seconde. */
  onHud(zone: string, speed: number | null): void;
}

/** Le moteur : crée la scène, fait tourner la boucle de jeu, nettoie à la fin. */
export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2200);
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
  private sky: THREE.Mesh | null = null;
  private hudTimer = 0;
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
    // Petit accès de diagnostic, utilisé par les vérifications automatiques.
    (window as unknown as Record<string, unknown>).lixitingDebug = () => ({
      traffic: this.traffic?.cars.filter((c) => c.object.visible).length ?? 0,
      nearestTraffic: Math.min(...(this.traffic?.cars ?? []).map((c) => c.object.position.distanceTo(this.player.object.position))),
      player: this.player.object.position.toArray().map((v) => Math.round(v)),
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

  private async loadWorld(): Promise<void> {
    try {
      this.events.onStatus('Chargement de la carte d\'Annaba...');
      const [data, terrain, trees] = await Promise.all([loadWorldData(), loadTerrain(), loadTrees()]);
      if (this.disposed) return;
      // Personnage et voitures roulent sur la surface des rues, posée 20 cm au-dessus du terrain brut.
      // Sans ce décalage, les roues s'enfonçaient dans la chaussée.
      this.ground = (x, z) => terrain.heightAt(x, z) + ROAD_SURFACE;
      const world = buildAnnabaWorld(this.scene, data, terrain);
      this.collider = world.collider;
      this.sky = world.sky;
      const treeCount = buildTrees(this.scene, trees, terrain.heightAt);
      this.places = data.places;
      this.traffic = new Traffic(data, (car) => this.scene.add(car.object));
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
      this.goToPlace(0);
      // Adresse du type ...?at=x,n : démarre à ce point de la carte (mètres depuis la gare, n = nord).
      const at = new URLSearchParams(window.location.search).get('at')?.split(',').map(Number);
      if (at && at.length === 2 && at.every(Number.isFinite)) this.player.teleport(at[0], this.ground(at[0], -at[1]), -at[1]);
      // Adresse ...?salon=1 : expose tout le catalogue de voitures devant le joueur (pour les comparer).
      if (new URLSearchParams(window.location.search).has('salon')) {
        const me = this.player.object.position;
        CAR_CATALOG.forEach((spec, i) => {
          const car = new Car(spec, spec.colors[0]);
          const column = i % 5, row = Math.floor(i / 5);
          car.place(me.x + (column - 2) * 3.1, me.z + 5 + row * 5.5, Math.PI + (row === 0 ? 0.7 : -2.5));
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
  private toggleCar(): void {
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
        this.driving = null;
        return;
      }
      return;
    }
    let nearest: Car | null = null;
    let best = ENTER_DISTANCE;
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
    }
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
    const dt = Math.min(this.clock.getDelta(), 0.05);

    const everyCar = this.allCars();
    for (const car of this.cars) {
      if (car !== this.driving) car.coast(dt, this.collider, everyCar);
    }
    if (this.driving) {
      const car = this.driving;
      car.drive(dt, this.input, this.collider, everyCar);
      car.settle(this.ground);
      this.player.object.position.copy(car.object.position);
      // En roulant, la caméra revient d'elle-même derrière la voiture.
      const follow = Math.abs(car.speed) > 2 ? car.heading + Math.PI : null;
      this.cameraRig.update(this.input, car.object.position, this.collider, dt, this.ground, 9, follow);
    } else {
      this.player.update(dt, this.input, this.cameraRig.yaw, this.obstacles, this.ground);
      this.cameraRig.update(this.input, this.player.object.position, this.collider, dt, this.ground);
    }
    for (const car of this.cars) if (car !== this.driving) car.settle(this.ground);
    const me = this.player.object.position;
    this.traffic?.update(dt, me.x, me.z, this.driving === null, this.cars, this.ground);
    const heading = this.driving ? this.driving.heading : this.player.object.rotation.y;
    this.map?.update(this.player.object.position.x, this.player.object.position.z, heading);
    this.sky?.position.copy(this.camera.position);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.events.onHud(this.nearestPlace(), this.driving ? Math.abs(this.driving.speed) * 3.6 : null);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private resize = () => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    // false : on ne touche pas à la taille CSS, le canvas est étiré par style.css.
    this.renderer.setSize(Math.round(width * RENDER_SCALE), Math.round(height * RENDER_SCALE), false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
}
