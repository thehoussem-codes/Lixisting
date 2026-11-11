import * as THREE from 'three';
import { Input } from './Input';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { Car } from '../vehicles/Car';
import { buildAnnabaWorld } from '../world/AnnabaWorld';
import type { Collider } from '../world/Collider';
import { loadWorldData, type WorldPlace } from '../world/WorldData';

/** Part de la résolution de l'écran réellement calculée (style rétro + fluidité). */
const RENDER_SCALE = 0.6;
const CAR_COLORS = [0xf2f2f2, 0xc0392b, 0x2c3e50, 0xd4ac0d, 0x7f8c8d, 0x1e8449];
const ENTER_DISTANCE = 4.5;

export interface GameEvents {
  onStatus(text: string): void;
  onPlaces(places: WorldPlace[]): void;
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
  private places: WorldPlace[] = [];
  private cars: Car[] = [];
  /** Voiture conduite en ce moment (null = à pied). */
  private driving: Car | null = null;
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private async loadWorld(): Promise<void> {
    try {
      this.events.onStatus('Chargement de la carte d\'Annaba...');
      const data = await loadWorldData();
      if (this.disposed) return;
      this.collider = buildAnnabaWorld(this.scene, data);
      this.places = data.places;
      this.events.onPlaces(data.places);
      // Une voiture garée à chaque repère, pour en avoir toujours une sous la main.
      data.places.forEach((place, i) => {
        const car = new Car(CAR_COLORS[i % CAR_COLORS.length]);
        car.place(place.x + 3, -place.n);
        this.cars.push(car);
        this.scene.add(car.object);
      });
      this.goToPlace(0);
      const estimated = Math.round((100 * data.meta.buildings_height_estimated) / data.meta.buildings);
      this.events.onStatus(`${data.meta.buildings} bâtiments, ${data.meta.roads} tronçons de voies · hauteurs estimées : ${estimated} % · relief : plat pour l'instant`);
    } catch (error) {
      this.events.onStatus(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private goToPlace(index: number): void {
    const place = this.places[index];
    if (!place) return;
    if (this.driving) this.driving.place(place.x, -place.n);
    else this.player.teleport(place.x, -place.n);
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
        this.player.teleport(x, z);
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
  };

  private frame = () => {
    this.frameId = requestAnimationFrame(this.frame);
    // dt plafonné : évite un "saut" du personnage après un onglet mis en pause.
    const dt = Math.min(this.clock.getDelta(), 0.05);

    for (const car of this.cars) if (car !== this.driving) car.coast(dt, this.collider);
    if (this.driving) {
      const car = this.driving;
      car.drive(dt, this.input, this.collider);
      this.player.object.position.copy(car.object.position);
      // En roulant, la caméra revient d'elle-même derrière la voiture.
      const follow = Math.abs(car.speed) > 2 ? car.heading + Math.PI : null;
      this.cameraRig.update(this.input, car.object.position, this.collider, dt, 9, follow);
    } else {
      this.player.update(dt, this.input, this.cameraRig.yaw, this.collider);
      this.cameraRig.update(this.input, this.player.object.position, this.collider, dt);
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
