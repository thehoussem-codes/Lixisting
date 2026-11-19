import * as THREE from 'three';
import { splitIntoSectors } from '../world/Sectors';
import { MOBILE } from './Mobile';
import { TouchControls } from '../ui/TouchControls';
import { Sound } from './Sound';
import { Harbor } from '../world/Harbor';
import { Input } from './Input';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { Car } from '../vehicles/Car';
import { Boat } from '../vehicles/Boat';
import type { Marina } from '../world/TocheMarina';
import { Region } from '../world/Region';
import { CAR_CATALOG, MOTO_CATALOG, applyVehicleAssets } from '../vehicles/CarModels';
import { assets } from '../assets/AssetLibrary';
import { Traffic } from '../vehicles/Traffic';
import { TrafficLights } from '../world/TrafficLights';
import { buildAnnabaWorld, createSky } from '../world/AnnabaWorld';
import { buildTestTrack } from '../world/TestTrack';
import type { Water } from '../world/Water';
import type { Collider } from '../world/Collider';
import { loadTerrain } from '../world/Terrain';
import { type TreeStream, buildTrees, loadTrees } from '../world/Trees';
import { buildWalls } from '../world/Walls';
import { loadPhotoTextures } from '../world/Textures';
import { Locations } from '../world/Locations';
import { loadWorldData, type WorldPlace } from '../world/WorldData';
import { MapView } from '../ui/MapView';

/**
 * Part de la résolution de l'écran réellement calculée. 1 = image nette.
 * Si le jeu rame, ajouter ?res=0.6 à l'adresse pour alléger le calcul.
 */
const RENDER_SCALE = Math.min(1, Math.max(0.3, Number(new URLSearchParams(window.location.search).get('res')) || (MOBILE ? 0.7 : 1)));
const DRONE = new URLSearchParams(window.location.search).get('drone')?.split(',').map(Number);
const SHADOWS = new URLSearchParams(window.location.search).get('ombres') !== '0' && !MOBILE; // pas d'ombres sur téléphone
const SHADOW_RANGE = 85; // demi-largeur de la zone ombrée autour du joueur, en mètres
const AUTO_SCALE = !new URLSearchParams(window.location.search).has('res');
// Écran Retina (Mac) : le jeu peut monter jusqu'à 1,5 pixel par point quand il est fluide (image bien plus nette).
const MAX_SCALE = MOBILE ? 1 : Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
const ENTER_DISTANCE = 4.5;
const SECTOR = 400;          // taille des secteurs du monde (m)
const VIEW_DISTANCE = MOBILE ? 850 : 1400; // au-delà, tout est noyé dans le brouillard
const ROAD_SURFACE = 0.2;
const KEEP_GEOMETRY = new URLSearchParams(window.location.search).has('garder'); // essais : garder les maillages en mémoire

export interface GameEvents {
  onStatus(text: string): void;
  onPlaces(places: WorldPlace[]): void;
  /** Quartier le plus proche et vitesse (km/h, null à pied), quelques fois par seconde. */
  onHud(zone: string, speed: number | null, fps: number, gear?: string): void;
  /** Ligne d'identification du lieu, et fiche détaillée quand le mode inspection est ouvert (touche I). */
  onLocation(line: string, detail: string | null): void;
}

/** Le moteur : crée la scène, fait tourner la boucle de jeu, nettoie à la fin. */
export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, // arêtes lissées
    powerPreference: 'high-performance' });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.5, 7000);
  private clock = new THREE.Clock();
  private input: Input;
  private player = new Player();
  private cameraRig: ThirdPersonCamera;
  private sound = new Sound();
  private collider: Collider | null = null;
  /** Hauteur du sol en un point (0 partout tant que le terrain n'est pas chargé). */
  /** Hauteur du sol en x, z. Avec y (hauteur actuelle de ce qui se pose) : les toits atteignables comptent aussi. */
  private ground: (x: number, z: number, y?: number) => number = () => 0;
  private places: WorldPlace[] = [];
  private trees: TreeStream | null = null;
  private touch: TouchControls | null = null;
  private labels: { name: string; x: number; n: number; radius: number }[] = [];
  private cars: Car[] = [];
  private map: MapView | null = null;
  private traffic: Traffic | null = null;
  /** Port de pêche et de plaisance (bateaux amarrés qui flottent). */
  private harbor: Harbor | null = null;
  private lights: TrafficLights | null = null;
  private sky: THREE.Mesh | null = null;
  private water: Water | null = null;
  private time = 0;
  /** Résolution de calcul actuelle (s'adapte à la fluidité, sauf si ?res= est fixé). */
  private renderScale = RENDER_SCALE;
  private scaleTimer = 2;
  private locations: Locations | null = null;
  private inspecting = false;
  private district = '';
  private copied = false;
  private lastDetail = '';
  private sun: THREE.DirectionalLight | null = null;
  private sunDirection = new THREE.Vector3(0.6, 0.75, 0.25);
  private hudTimer = 0;
  /** Blocs de décor masqués quand ils sont au-delà du brouillard (inutile de les dessiner). */
  private chunks: { mesh: THREE.Mesh; x: number; z: number; reach: number }[] = [];
  /** Durée moyenne d'une image (secondes), pour mesurer la fluidité. */
  private frameTime = 1 / 60;
  /** Voiture conduite en ce moment (null = à pied). */
  private driving: Car | null = null;
  /** Bateaux à moteur du joueur (ponton de la plage Toche) et celui qu'il pilote. */
  private boats: Boat[] = [];
  private boating: Boat | null = null;
  private marina: Marina | null = null;
  /** Toute la wilaya en détail léger, autour de la ville (chargée après elle). */
  private region: Region | null = null;
  private helm = new THREE.Vector3();
  /** Ce qui bloque le personnage à pied : bâtiments et voitures. */
  private obstacles = {
    blocked: (x: number, z: number, radius: number, y?: number): boolean =>
      (this.collider?.blocked(x, z, radius, y) ?? false) ||
      // Une voiture ne bloque plus quand on est au-dessus de son toit (y = hauteur des pieds + 0,6 m).
      this.allCars().some((car) => car.contains(x, z, radius) && (y === undefined || y - 0.6 < car.top() - 0.15)),
  };
  /** Sol du piéton : le sol, les toits, et le toit d'une voiture quand il saute dessus. */
  private playerGround = (x: number, z: number, y?: number): number => {
    let floor = this.ground(x, z, y);
    if (y !== undefined) {
      for (const car of this.allCars()) {
        const top = car.top();
        if (top > floor && top <= y + 0.6 && car.contains(x, z, -0.1)) floor = top;
      }
    }
    return floor;
  };
  private frameId = 0;
  private disposed = false;

  constructor(private container: HTMLElement, private events: GameEvents) {
    this.renderer.setPixelRatio(1);
    // Rendu filmique : hautes lumières adoucies, couleurs plus denses (skill threejs-materials-lighting).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.input = new Input(this.renderer.domElement);
    // Téléphone : joystick, boutons, caméra au doigt ; le premier contact débloque le son.
    if (MOBILE) this.touch = new TouchControls(this.input, () => this.sound.unlock());
    this.cameraRig = new ThirdPersonCamera(this.camera);
    this.scene.background = new THREE.Color(0x9fd0ea);
    this.scene.add(this.player.object);

    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    this.resize();
    void this.loadWorld();
    // Vérifications automatiques : monter dans la voiture la plus proche, quelle que soit la distance.
    // Essais : la voiture conduite est lâchée de h mètres au-dessus du sol en x, n (cap en degrés), à vitesse v.
    (window as unknown as Record<string, unknown>).lixitingCarDrop = (x: number, n: number, h: number, headingDeg = 0, v = 0) => {
      const car = this.driving;
      if (!car) return null;
      const heading = (headingDeg * Math.PI) / 180;
      car.place(x, -n, heading);
      // La simulation repart de cette position et de cette vitesse au prochain pas.
      car.object.position.y = this.ground(x, -n) + h;
      car.speed = v;
      // Conduite arcade : la voiture repart en l'air, sans souvenir de sa position précédente.
      Object.assign(car as unknown as Record<string, unknown>, { baseY: car.object.position.y, vy: 0, airborne: true, lastFree: null });
      return true;
    };
    // Essais : la voiture conduite est-elle dans un bâtiment (sous son toit) ?
    (window as unknown as Record<string, unknown>).lixitingCarState = () => {
      const car = this.driving;
      if (!car) return null;
      const p = car.object.position;
      return { x: Math.round(p.x * 10) / 10, n: Math.round(-p.z * 10) / 10, y: Math.round(p.y * 100) / 100, ground: Math.round(this.ground(p.x, p.z) * 100) / 100,
        roof: Math.round((this.collider?.roofAt(p.x, p.z, Infinity) ?? -Infinity) * 100) / 100, inside: this.collider?.inside(p.x, p.z, p.y + 0.3) ?? false, kmh: Math.round(car.speed * 3.6) };
    };
    (window as unknown as Record<string, unknown>).lixitingDrive = () => {
      // Essais : avec ?voiture=identifiant, on amène ce modèle sous le joueur avant de monter dedans.
      const wanted = new URLSearchParams(window.location.search).get('voiture');
      const car = wanted ? this.cars.find((c) => c.spec.id === wanted) : undefined;
      if (car) car.place(this.player.object.position.x, this.player.object.position.z, car.heading);
      this.toggleCar(Infinity);
    };
    // Essais : lâcher le personnage à `h` mètres au-dessus du point x, n (toits, chutes).
    (window as unknown as Record<string, unknown>).lixitingDrop = (x: number, n: number, h: number) => {
      this.player.teleport(x, this.ground(x, -n) + h, -n);
      (this.player as unknown as { airborne: boolean }).airborne = true;
    };
    // Petit accès de diagnostic, utilisé par les vérifications automatiques.
    (window as unknown as Record<string, unknown>).lixitingTraffic = () => this.traffic?.snapshot() ?? [];
    (window as unknown as Record<string, unknown>).lixitingBoats = () => this.harbor?.census() ?? {};
    (window as unknown as Record<string, unknown>).lixitingGround = (x: number, n: number) => this.ground(x, -n);
    (window as unknown as Record<string, unknown>).lixitingBlocked = (x: number, n: number, y?: number) => this.collider?.inside(x, -n, y);
    // Essais : les plus gros objets affichés (triangles, rayon, nom du matériau ou de la texture).
    (window as unknown as Record<string, unknown>).lixitingMeshes = () => {
      const rows: { tris: number; radius: number; chunked: boolean; name: string }[] = [];
      this.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
        let shown = true;
        for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (!o.visible) shown = false;
        if (!shown) return;
        const g = mesh.geometry, count = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
        const instances = (mesh as unknown as THREE.InstancedMesh).count ?? 1;
        rows.push({ tris: Math.round(count * instances), radius: Math.round(g.boundingSphere?.radius ?? -1), chunked: this.chunks.some((c) => c.mesh === mesh), name: mesh.name || mesh.userData.kind || (mesh.material as THREE.Material).name || (mesh.material as THREE.Material).type });
      });
      rows.sort((a, b) => b.tris - a.tris);
      return { total: rows.length, unchunked: rows.filter((r) => !r.chunked).reduce((s, r) => s + r.tris, 0), top: rows.slice(0, 25) };
    };
    // Essais : mémoire des maillages envoyés à la carte graphique (Mo), par type de matériau.
    (window as unknown as Record<string, unknown>).__scene = this.scene;
    (window as unknown as Record<string, unknown>).__camera = this.camera;
    Object.defineProperty(window, '__collider', { get: () => this.collider, configurable: true });
    // Essais : ce qui est sous le point (sx, sy) de l'écran (0 à 1) ; avec ?garder=1 pour le décor fixe.
    (window as unknown as Record<string, unknown>).lixitingPick = (sx: number, sy: number) => {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(sx * 2 - 1, -(sy * 2 - 1)), this.camera);
      const hits = ray.intersectObjects(this.scene.children, true).filter((h) => (h.object as THREE.Mesh).isMesh && h.object.visible && (h.object as THREE.Mesh).geometry.attributes.position.array);
      const hit = hits[0];
      if (!hit) return null;
      const mesh = hit.object as THREE.Mesh, material = mesh.material as THREE.MeshLambertMaterial, color = mesh.geometry.attributes.color;
      return { name: mesh.name, type: material.type, map: material.map ? (material.map.image as HTMLCanvasElement)?.width : null, side: material.side, order: mesh.renderOrder,
        distance: Math.round(hit.distance), point: hit.point.toArray().map(Math.round), normal: hit.face?.normal.toArray().map((v) => Math.round(v * 100) / 100),
        color: color && hit.face ? [color.getX(hit.face.a), color.getY(hit.face.a), color.getZ(hit.face.a)].map((v) => Math.round(v * 100) / 100) : null, uv: hit.uv?.toArray().map((v) => Math.round(v * 100) / 100) };
    };
    (window as unknown as Record<string, unknown>).lixitingGpu = () => {
      const seen = new Set<THREE.BufferGeometry>(), out: Record<string, number> = {};
      let total = 0;
      this.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry || seen.has(mesh.geometry)) return;
        seen.add(mesh.geometry);
        let bytes = mesh.geometry.index ? mesh.geometry.index.count * 2 : 0;
        for (const a of Object.values(mesh.geometry.attributes)) bytes += (a as THREE.BufferAttribute).count * (a as THREE.BufferAttribute).itemSize * 4;
        const key = (mesh.material as THREE.Material).type + (((mesh.material as THREE.MeshLambertMaterial).map) ? '+map' : '') + ':' + (mesh.name || ((mesh.material as THREE.MeshLambertMaterial).vertexColors ? 'vc' : '') + (mesh.renderOrder ? 'r' + mesh.renderOrder : ''));
        out[key] = (out[key] ?? 0) + bytes / 1e6; total += bytes / 1e6;
      });
      for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
      return { total: Math.round(total), geometries: seen.size, ...out };
    };
    // Essais : monter à bord du bateau le plus proche, quelle que soit la distance ; état des bateaux.
    (window as unknown as Record<string, unknown>).lixitingBoat = (board = true) => {
      if (board && !this.boating) { if (this.driving) this.toggleCar(); const near = this.nearestBoat(Infinity); if (near) this.board(near.boat); }
      return this.boats.map((b) => ({ x: Math.round(b.position.x * 10) / 10, n: Math.round(-b.position.z * 10) / 10, y: Math.round(b.position.y * 100) / 100, kmh: Math.round(b.speed * 3.6), heading: Math.round((b.heading * 180) / Math.PI), piloted: b === this.boating }));
    };
    // Essais : fait naviguer le bateau piloté `seconds` secondes (pas de 1/60 s) avec les touches données.
    (window as unknown as Record<string, unknown>).lixitingBoatSim = (seconds: number, keys: string[]) => {
      const boat = this.boating, water = this.water;
      if (!boat || !water) return null;
      const fake = { isDown: (code: string) => keys.includes(code) } as unknown as Input;
      const rows: unknown[] = [];
      for (let i = 1; i <= Math.round(seconds * 60); i++) {
        this.time += 1 / 60;
        boat.update(1 / 60, fake, water, this.time, this.collider, this.ground);
        if (i % 30 === 0) rows.push({ t: i / 60, kmh: Math.round(boat.speed * 36) / 10, x: Math.round(boat.position.x * 10) / 10, n: Math.round(-boat.position.z * 10) / 10, y: Math.round(boat.position.y * 100) / 100, heading: Math.round((boat.heading * 180) / Math.PI), ...boat.attitude });
      }
      return rows;
    };
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
      regionTiles: this.region?.built ?? null,
      trunks: this.collider?.trunkCount ?? null,
      boat: this.boating ? { kmh: Math.round(this.boating.speed * 3.6), y: Math.round(this.boating.position.y * 100) / 100 } : null,
      car: this.driving ? { id: this.driving.spec.id, topKmh: Math.round(this.driving.topSpeed * 3.6), sprint: this.driving.spec.sprint ?? 1, gear: this.driving.gear, kmh: Math.round(this.driving.speed * 3.6), above: Math.round((this.driving.object.position.y - this.ground(this.driving.object.position.x, this.driving.object.position.z)) * 100) / 100, ...this.driving.telemetry } : null,
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
    this.touch?.dispose();
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
      await loadPhotoTextures(); // avant tout le reste : le terrain et les rues s'en servent pour leurs matières
      const [data, terrain, trees] = await Promise.all([loadWorldData(), loadTerrain(), loadTrees()]);
      if (this.disposed) return;
      // Personnage et voitures roulent sur la surface des rues, posée 20 cm au-dessus du terrain brut.
      // Sans ce décalage, les roues s'enfonçaient dans la chaussée.
      // En mer et sur la pente du rivage (sous 40 cm), pas de décalage : c'est le fond marin.
      this.ground = (x, z) => {
        // Hors du rectangle de la ville détaillée : le relief léger de la wilaya (dès qu'il est chargé).
        const region = this.region;
        const h = region && !region.inCity(x, -z) && region.covers(x, -z) ? region.height(x, z) : terrain.heightAt(x, z);
        return h > 0.39 ? h + ROAD_SURFACE : h;
      };
      Car.waterLevel = 0;
      const heap = () => Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6);
      const h0 = heap();
      const t0 = performance.now();
      const world = buildAnnabaWorld(this.scene, data, terrain);
      const t1 = performance.now();
      const h1 = heap();
      this.collider = world.collider;
      this.sky = world.sky;
      this.water = world.water;
      // Passage souterrain : sol en contrebas (paliers, marches, niveau commerçant) au lieu du terrain.
      const terrainGround = this.ground, patch = world.edits.ground;
      // La hauteur actuelle du joueur départage les lieux à deux niveaux (esplanade au-dessus des galeries).
      const collider = world.collider;
      this.ground = (x, z, y) => {
        const floor = patch(x, z, this.player?.object.position.y) ?? terrainGround(x, z);
        if (y === undefined) return floor;
        // Toits : on s'y pose quand on arrive par-dessus (saut, voiture lancée depuis une pente) ;
        // 60 cm de marche franchissable, comme un trottoir haut.
        return Math.max(floor, collider.roofAt(x, z, y + 0.6));
      };
      // Végétation : arbres retirés des lieux réaménagés, palmiers alignés ajoutés (abords du Sheraton).
      for (const [species, values] of Object.entries(trees)) {
        if (species === 'wall' || !Array.isArray(values)) continue;
        const kept: number[] = [];
        for (let i = 0; i < values.length; i += 3) if (world.edits.keepTree(values[i], values[i + 1])) kept.push(values[i], values[i + 1], values[i + 2]);
        (trees as unknown as Record<string, number[]>)[species] = kept;
      }
      for (const [species, x, n, size] of world.edits.trees) ((trees as unknown as Record<string, number[]>)[species] ??= []).push(x, n, size);
      this.labels = world.edits.labels;
      // Bateaux à moteur amarrés au ponton de la plage Toche (on les prend avec F, comme une voiture).
      this.marina = world.edits.marina;
      for (const spawn of this.marina.boats) this.boats.push(new Boat(this.scene, spawn.x, -spawn.n, spawn.heading, spawn.hull, spawn.stripe));
      // Port de pêche d'Annaba (36.90375, 7.77451) : bassin abrité par les jetées, rayon 330 m.
      this.harbor = new Harbor(this.scene, data, 1392, 920, 330, this.ground);
      // Troncs solides : on ne traverse plus les arbres (les buissons, eux, se traversent).
      const TRUNK: Record<string, number> = { pine: 0.26, palm: 0.24, ficus: 0.36, cypress: 0.2, araucaria: 0.24, fpine: 0.22, oak: 0.26,
        ficus_plain: 0.36, palm_plain: 0.24, rock: 0.5 };
      for (const [species, values] of Object.entries(trees)) {
        const r = TRUNK[species];
        if (!r || !Array.isArray(values)) continue;
        for (let i = 0; i < values.length; i += 3) {
          const x = values[i], z = -values[i + 1], size = values[i + 2];
          this.collider.addTrunk(x, z, Math.min(0.55, Math.max(0.15, r * size)), terrain.heightAt(x, z) + 2.5 + 1.5 * size);
        }
      }
      this.trees = buildTrees(this.scene, trees, terrain.heightAt);
      const treeCount = this.trees.count;
      buildWalls(this.scene, trees.wall, this.collider);
      const t2 = performance.now();
      const h2 = heap();
      Locations.load(data).then((locations) => { this.locations = locations; });
      // Grands maillages d'un seul tenant (terrain, chaussées, trottoirs…) : découpés en secteurs de 400 m.
      const whole: THREE.Mesh[] = [];
      this.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.parent !== this.scene || !mesh.frustumCulled || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
        if (Array.isArray(mesh.material) || !mesh.geometry.attributes.position) return;
        mesh.geometry.computeBoundingSphere();
        if ((mesh.geometry.boundingSphere?.radius ?? 0) >= 700) whole.push(mesh);
      });
      for (const mesh of whole) {
        this.scene.remove(mesh);
        for (const part of splitIntoSectors(mesh, SECTOR)) this.scene.add(part);
        mesh.geometry.dispose();
      }
      // Blocs de décor (bâtiments, arbres, lampadaires) : on notera lesquels sont assez proches pour être affichés.
      // Décor fixe : une fois envoyé à la carte graphique, la copie en mémoire n'est plus utile ; on la libère
      // (le téléphone n'a pas assez de mémoire pour garder les deux). Terrain, eau et objets animés exclus.
      const release = function (this: THREE.BufferAttribute) { (this as unknown as { array: unknown }).array = null; };
      this.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.parent !== this.scene || !mesh.geometry || mesh.geometry === terrain.mesh.geometry || KEEP_GEOMETRY) return;
        if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh || !(mesh.material instanceof THREE.MeshLambertMaterial)) return;
        mesh.geometry.computeBoundingSphere();
        for (const attribute of Object.values(mesh.geometry.attributes)) (attribute as THREE.BufferAttribute).onUpload(release);
        mesh.geometry.index?.onUpload(release);
      });
      this.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.parent !== this.scene || !mesh.frustumCulled) return; // ni la mer ni le ciel
        mesh.geometry.computeBoundingSphere();
        const sphere = mesh.geometry.boundingSphere;
        if (sphere && sphere.radius > 6 && sphere.radius < 700) this.chunks.push({ mesh, x: sphere.center.x, z: sphere.center.z, reach: sphere.radius + ((mesh.userData.viewDistance as number | undefined) ?? VIEW_DISTANCE) });
      });
      console.info(`Construction : ville ${Math.round(t1 - t0)} ms, végétation ${Math.round(t2 - t1)} ms, secteurs ${Math.round(performance.now() - t2)} ms, ${this.chunks.length} blocs ; mémoire ${h0} → ${h1} → ${h2} → ${heap()} Mo`);
      this.places = data.places;
      this.traffic = new Traffic(data, (car) => this.scene.add(car.object));
      this.lights = new TrafficLights(this.scene, data, this.ground);
      this.traffic.lights = this.lights;
      this.traffic.onHonk = (distance) => this.sound.honk(distance);
      // Garage de l'Est : repère sur la carte, et toutes les voitures normales du jeu exposées à l'intérieur.
      const garage = world.edits.garage;
      if (garage) data.places.push({ name: garage.name, ...garage.place });
      this.map = new MapView(data, (index) => this.goToPlace(index), (x, n) => this.goToPoint(x, n));
      this.events.onPlaces(data.places);
      // Une voiture garée à chaque repère, pour en avoir toujours une sous la main.
      data.places.forEach((place, i) => {
        // ?voiture=identifiant : choisit le modèle garé au premier repère (essais).
        const wanted = new URLSearchParams(window.location.search).get('voiture');
        const spec = (i === 0 && CAR_CATALOG.find((c) => c.id === wanted)) || CAR_CATALOG[i % CAR_CATALOG.length];
        const car = new Car(spec, spec.colors[i % spec.colors.length]);
        // Garée contre le trottoir, dans le sens de la rue (emplacement calculé avec la carte).
        car.place(place.cx, -place.cn, place.ch);
        this.cars.push(car);
        this.scene.add(car.object);
      });
      if (garage) {
        const showroom = [...CAR_CATALOG.filter((spec) => spec.topSpeed !== null && spec.id !== 'exemple'), ...MOTO_CATALOG];
        showroom.forEach((spec, i) => {
          const slot = garage.slots[i];
          if (!slot) return;
          const car = new Car(spec, spec.colors[(i * 3) % spec.colors.length]);
          car.place(slot.x, -slot.n, slot.heading);
          this.cars.push(car);
          this.scene.add(car.object);
        });
        console.info(`Garage : ${Math.min(showroom.length, garage.slots.length)} véhicules exposés sur ${garage.slots.length} places`);
      }
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
      this.setupReflections();
      Car.onCrash = (strength) => this.sound.crash(strength);
      Boat.onBump = (strength) => this.sound.crash(3 + strength * 10);
      // Retombée sur l'eau (en sautant une vague) : éclaboussure, secousse de la caméra si on pilote.
      Boat.onSlam = (boat, strength) => {
        if (boat !== this.boating) return;
        this.sound.splash(strength);
        this.cameraRig.shake(0.25 + 0.5 * strength);
      };
      // Adresse du type ...?at=x,n : démarre à ce point de la carte (mètres depuis la gare, n = nord).
      const at = new URLSearchParams(window.location.search).get('at')?.split(',').map(Number);
      if (at && at.length === 2 && at.every(Number.isFinite)) this.player.teleport(at[0], this.ground(at[0], -at[1]), -at[1]);
      // Adresse ...?salon=1 : expose tout le catalogue de voitures devant le joueur (pour les comparer).
      if (new URLSearchParams(window.location.search).has('salon')) {
        const me = this.player.object.position;
        [...CAR_CATALOG, ...MOTO_CATALOG].forEach((spec, i) => {
          const car = new Car(spec, spec.colors[0]);
          const column = i % 5, row = Math.floor(i / 5);
          car.place(me.x + (column - 2) * 6.2, me.z + 6 + row * 4.2, Math.PI / 2);
          window.setTimeout(() => car.poseWheels(0.45), 5000); // après le chargement des modèles
          if (spec.moto) { car.place(me.x + (spec.moto === 'maxiscooter' ? 1.6 : -1.6), me.z - 2.6, Math.PI / 2 + 0.5); car.rider = spec.moto === 'cyclomoteur'; }
          this.cars.push(car);
          this.scene.add(car.object);
        });
      }
      // Le reste de la wilaya (relief, routes, villes, forêts), chargé une fois la ville prête.
      Region.load(import.meta.env.BASE_URL, __BUILD_ID__).then((region) => {
        if (this.disposed) return;
        region.attach(this.scene, world.collider);
        this.region = region;
        this.map?.setRegion(region.data);
        // Une voiture garée au bord de la route principale de chaque ville et de chaque village.
        let parked = 0;
        const fleet = CAR_CATALOG.filter((spec) => spec.topSpeed !== null && spec.id !== 'exemple');
        for (const place of region.data.places) {
          if (place.k === 'hamlet' || place.k === 'suburb' || parked >= 45) continue;
          const road = region.nearestRoad(place.x, place.n, 250);
          if (!road) continue;
          const { x, n, heading, w } = road;
          const spec = fleet[parked % fleet.length];
          const car = new Car(spec, spec.colors[parked % spec.colors.length]);
          // Côté droit de la chaussée, dans le sens de la route.
          const side = w / 2 - 1.3;
          car.place(x - Math.cos(heading) * side, -n + Math.sin(heading) * side, heading);
          this.cars.push(car);
          this.scene.add(car.object);
          parked++;
        }
        console.info(`Wilaya : ${region.data.places.length} villes et villages, ${region.data.meta.roads} routes, ${region.data.meta.buildings} bâtiments`);
      }).catch((error) => console.warn('Wilaya indisponible :', error));
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
    if (this.boating) this.leaveBoat();
    this.player.teleport(place.x, this.ground(place.x, -place.n), -place.n);
  }

  /** Téléportation vers un point de la carte (ville ou village de la wilaya). */
  private goToPoint(x: number, n: number): void {
    if (this.driving) { this.driving.speed = 0; this.driving = null; this.player.object.visible = true; }
    if (this.boating) this.leaveBoat();
    // Les cases autour du point d'arrivée sont construites tout de suite (la première image est un peu plus longue).
    // On arrive au bord de la rue la plus proche (le point d'une ville tombe souvent sur un bâtiment).
    const road = this.region?.nearestRoad(x, n, 600);
    if (road) { x = road.x - Math.cos(road.heading) * (road.w / 2 + 1.2); n = road.n - Math.sin(road.heading) * (road.w / 2 + 1.2); }
    this.region?.update(x, -n, 600);
    this.player.teleport(x, this.ground(x, -n), -n);
  }

  /** Nom du repère le plus proche (à moins de 700 m), façon "nom de quartier". */
  private nearestPlace(): string {
    const { x, z } = this.player.object.position;
    for (const label of this.labels) if (Math.hypot(label.x - x, -label.n - z) < label.radius) return label.name;
    // Hors de la ville : la ville ou le village le plus proche de la wilaya.
    if (this.region && !this.region.inCity(x, -z)) {
      let best = Infinity, name = '';
      for (const place of this.region.data.places) {
        const reach = place.k === 'city' ? 4000 : place.k === 'town' ? 2500 : place.k === 'village' || place.k === 'suburb' ? 1400 : 700;
        const d = Math.hypot(place.x - x, -place.n - z);
        if (d < reach && d / reach < best) { best = d / reach; name = place.name; }
      }
      return name;
    }
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
    if (this.boating) {
      if (Math.abs(this.boating.speed) > 3) return; // on ne saute pas d'un bateau lancé
      this.leaveBoat();
      return;
    }
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
    // Un bateau à portée (depuis le ponton ou en nageant) passe avant une voiture plus lointaine.
    const boat = this.nearestBoat(reach === ENTER_DISTANCE ? 5.5 : reach);
    if (boat && boat.distance < best + 1) { this.board(boat.boat); return; }
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

  /** Bateau le plus proche du joueur (distance à plat), dans la limite `reach`. */
  private nearestBoat(reach: number): { boat: Boat; distance: number } | null {
    const me = this.player.object.position;
    let found: { boat: Boat; distance: number } | null = null;
    for (const boat of this.boats) {
      const d = Math.hypot(boat.position.x - me.x, boat.position.z - me.z);
      if (d < reach && (!found || d < found.distance)) found = { boat, distance: d };
    }
    return found;
  }

  /** Prendre la barre : le personnage se tient debout au poste de pilotage. */
  private board(boat: Boat): void {
    this.boating = boat;
    boat.rider = true;
    this.player.swimming = false;
  }

  /** Débarquer : sur le ponton s'il est tout près, sinon à l'eau à côté du bateau (on nage). */
  private leaveBoat(): void {
    const boat = this.boating;
    if (!boat) return;
    this.boating = null;
    boat.rider = false;
    const p = boat.position;
    const deck = this.marina?.nearestDeck(p.x, -p.z);
    let x: number, z: number;
    if (deck && deck.distance < 6) {
      x = deck.x; z = -deck.n;
    } else {
      const sideX = Math.cos(boat.heading), sideZ = -Math.sin(boat.heading);
      x = p.x + sideX * 2.3; z = p.z + sideZ * 2.3;
    }
    this.player.teleport(x, Math.max(this.ground(x, z), -0.4), z);
    this.player.object.rotation.set(0, boat.heading, 0);
  }

  /** Ombres portées du soleil (bâtiments, arbres, véhicules) dans un rayon autour du joueur. Désactivables : ?ombres=0. */
  /**
   * Ciel des reflets : une petite copie du ciel (avec un sol sombre et un soleil très lumineux) est convertie en
   * carte d'environnement. Seuls les matériaux physiques (carrosseries, vitres) l'utilisent : les façades n'en paient pas le prix.
   */
  private setupReflections(): void {
    const room = new THREE.Scene();
    room.add(createSky(50, 0x5f574c));
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.4, 4.4) }));
    sun.position.copy(this.sun ? this.sun.position : new THREE.Vector3(0.6, 0.6, 0.25)).normalize().multiplyScalar(40);
    room.add(sun);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(room, 0.02, 0.1, 100).texture;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();
  }

  private setupShadows(): void {
    this.scene.traverse((node) => { if ((node as THREE.DirectionalLight).isDirectionalLight) this.sun = node as THREE.DirectionalLight; });
    if (this.sun) this.water?.setSun(this.sun.position.clone().normalize());
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
    this.sound.unlock(); // le navigateur n'autorise le son qu'après une première touche
    if (e.code === 'KeyP') this.sound.muted = !this.sound.muted;
    if (e.repeat) return;
    if (e.code.startsWith('Digit')) this.goToPlace(Number(e.code.slice(5)) - 1);
    if (e.code === 'KeyF') this.toggleCar();
    if (e.code === 'KeyM') this.map?.toggle();
    // I : fiche détaillée du lieu ; C : la copier dans le presse-papiers.
    if (e.code === 'KeyI') { this.inspecting = !this.inspecting; this.copied = false; this.hudTimer = 0; }
    if (e.code === 'KeyC' && this.inspecting && this.lastDetail) {
      navigator.clipboard?.writeText(this.lastDetail).then(() => { this.copied = true; this.hudTimer = 0; }).catch(() => undefined);
    }
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
    // Bateaux : flottent sur la houle ; celui qu'on pilote suit les commandes (mêmes touches que la voiture).
    if (this.water) for (const boat of this.boats) boat.update(dt, boat === this.boating ? this.input : null, this.water, this.time, this.collider, this.ground);
    if (this.boating) {
      const boat = this.boating;
      const pace = Math.min(1, Math.abs(boat.speed) / 17);
      this.sound.update({ rpm: Math.min(1, 0.14 + pace * 0.78 + boat.throttle * 0.08), throttle: boat.throttle, skid: 0, small: false });
      // Le pilote se tient derrière la console (à tribord), et bouge avec le bateau.
      this.player.object.position.copy(boat.object.localToWorld(this.helm.set(-0.35, 0.43, -0.4)));
      this.player.object.quaternion.copy(boat.object.quaternion);
      this.player.stand(dt);
      const follow = Math.abs(boat.speed) > 1.5 ? boat.heading + Math.PI : null;
      this.cameraRig.update(this.input, boat.position, this.collider, dt, this.ground, 9 + Math.min(3, Math.abs(boat.speed) * 0.15), follow);
    } else if (this.driving) {
      const car = this.driving;
      car.drive(dt, this.input, this.collider, everyCar, this.ground);
      car.settle(this.ground, true, this.collider);
      this.sound.update({ rpm: car.rpm, throttle: car.throttle, skid: car.skid, small: !!car.spec.moto });
      this.player.object.position.copy(car.object.position);
      // En roulant, la caméra revient d'elle-même derrière la voiture.
      const follow = Math.abs(car.speed) > 2 ? car.heading + Math.PI : null;
      // La caméra recule un peu avec la vitesse : on voit plus loin quand on roule vite.
      this.cameraRig.update(this.input, car.object.position, this.collider, dt, this.ground, 8 + Math.min(3.5, Math.abs(car.speed) * 0.09), follow);
    } else {
      this.sound.update(null);
      this.player.update(dt, this.input, this.cameraRig.yaw, this.obstacles, this.playerGround);
      this.cameraRig.update(this.input, this.player.object.position, this.collider, dt, this.ground);
    }
    for (const car of this.cars) if (car !== this.driving) car.settle(this.ground, true, this.collider);
    const me = this.player.object.position;
    this.lights?.update(dt);
    this.traffic?.update(dt, me.x, me.z, this.driving === null, this.cars, this.ground, this.collider);
    const heading = this.driving ? this.driving.heading : this.boating ? this.boating.heading : this.player.object.rotation.y;
    this.map?.update(this.player.object.position.x, this.player.object.position.z, heading);
    if (DRONE) { // vue aérienne de contrôle : ?drone=hauteur,cap
      const target = this.player.object.position.clone(), heading = (DRONE[1] ?? 0) * Math.PI / 180;
      target.z += DRONE[2] ?? 0;
      target.y += DRONE[3] ?? 0;
      const reach = DRONE[4] ?? DRONE[0] * 0.9; // 5e valeur : recul horizontal en mètres (vue rasante)
      this.camera.position.set(target.x - Math.sin(heading) * reach, target.y + DRONE[0], target.z + Math.cos(heading) * reach);
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
    this.harbor?.update(this.time, this.camera.position);
    this.touch?.setDriving(this.driving !== null || this.boating !== null);
    this.trees?.update(this.camera.position.x, this.camera.position.z);
    this.region?.update(this.camera.position.x, this.camera.position.z, this.region.built ? 5 : 400);
    // Résolution automatique : on allège le calcul si le jeu rame, on le raffine s'il a de la marge.
    this.scaleTimer -= elapsed;
    if (AUTO_SCALE && this.scaleTimer <= 0) {
      this.scaleTimer = 3; // changer de résolution coûte une image saccadée : pas trop souvent
      const fps = 1 / this.frameTime;
      // Les ombres coûtent cher : si le jeu rame encore à la résolution minimale, on les coupe.
      if (this.sun?.castShadow && fps < 24 && this.renderScale <= 0.7) { this.sun.castShadow = false; console.info('Ombres coupées pour garder la fluidité.'); }
      const wanted = fps < 30 ? this.renderScale - 0.1 : fps > 57 ? this.renderScale + 0.05 : this.renderScale;
      const next = Math.min(MAX_SCALE, Math.max(0.7, wanted)); // jamais sous 0,7 ; au-delà de 1 sur écran Retina si la fluidité le permet
      if (next !== this.renderScale) { this.renderScale = next; this.resize(); }
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      const eye = this.camera.position;
      for (const chunk of this.chunks) chunk.mesh.visible = Math.hypot(chunk.x - eye.x, chunk.z - eye.z) < chunk.reach;
      if (this.locations) {
        const at = this.driving ? this.driving.object.position : this.player.object.position;
        const fix = this.locations.locate(at.x, this.ground(at.x, at.z), at.z);
        this.lastDetail = this.inspecting ? this.locations.inspect(fix) : '';
        this.district = fix.district;
        this.events.onLocation(this.locations.line(fix), this.inspecting ? `${this.lastDetail}\n\n${this.copied ? 'Copié dans le presse-papiers.' : 'C : copier cette fiche · I : fermer'}` : null);
      }
      this.events.onHud(this.nearestPlace(), this.driving ? Math.abs(this.driving.speed) * 3.6 : this.boating ? Math.abs(this.boating.speed) * 3.6 : null, Math.round(1 / this.frameTime), this.driving ? (this.driving.gear === 0 ? 'R' : String(this.driving.gear)) : this.boating ? `${Math.round(Math.abs(this.boating.speed) * 1.944)} nœuds` : undefined);
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
