import * as THREE from 'three';
import { Input } from './Input';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { Car } from '../vehicles/Car';
import { buildAnnabaWorld } from '../world/AnnabaWorld';
import type { Collider } from '../world/Collider';
import { loadTerrain } from '../world/Terrain';
import { buildTrees, loadTrees } from '../world/Trees';
import { loadWorldData, type WorldPlace } from '../world/WorldData';
import { MapView } from '../ui/MapView';

/** Part de la résolution de l'écran réellement calculée (style rétro + fluidité). */
const RENDER_SCALE = 0.6;
const CAR_COLORS = [0xf2f2f2, 0xc0392b, 0x2c3e50, 0xd4ac0d, 0x7f8c8d, 0x1e8449];
const ENTER_DISTANCE = 4.5;

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
  private sky: THREE.Mesh | null = null;
  private hudTimer = 0;
  /** Voiture conduite en ce moment (null = à pied). */
  private driving: Car | null = null;
  /** Ce qui bloque le personnage à pied : bâtiments et voitures. */
  private obstacles = {
    blocked: (x: number, z: number, radius: number): boolean =>
      (this.collider?.blocked(x, z, radius) ?? false) || this.cars.some((car) => car.contains(x, z, radius)),
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
      this.ground = terrain.heightAt;
      const world = buildAnnabaWorld(this.scene, data, terrain);
      this.collider = world.collider;
      this.sky = world.sky;
      const treeCount = buildTrees(this.scene, trees, terrain.heightAt);
      this.places = data.places;
      this.map = new MapView(data, (index) => this.goToPlace(index));
      this.events.onPlaces(data.places);
      // Une voiture garée à chaque repère, pour en avoir toujours une sous la main.
      data.places.forEach((place, i) => {
        const car = new Car(CAR_COLORS[i % CAR_COLORS.length]);
        // Garée à 3 m du repère, du premier côté où il n'y a pas de bâtiment.
        const spot = [[3, 0], [-3, 0], [0, 3], [0, -3]].find(
          ([dx, dz]) => !this.collider?.blocked(place.x + dx, -place.n + dz, 2.2),
        ) ?? [0, 0];
        car.place(place.x + spot[0], -place.n + spot[1]);
        this.cars.push(car);
        this.scene.add(car.object);
      });
      this.goToPlace(0);
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
    for (const car of this.cars) {
      const d = car.object.position.distanceTo(position);
      if (d < best) { best = d; nearest = car; }
    }
    if (nearest) {
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

    for (const car of this.cars) {
      if (car !== this.driving) car.coast(dt, this.collider, this.cars);
    }
    if (this.driving) {
      const car = this.driving;
      car.drive(dt, this.input, this.collider, this.cars);
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
