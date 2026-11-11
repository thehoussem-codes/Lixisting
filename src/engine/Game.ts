import * as THREE from 'three';
import { Input } from './Input';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { buildTestWorld } from '../world/TestWorld';

/** Part de la résolution de l'écran réellement calculée (style PS2 + fluidité). */
const RENDER_SCALE = 0.6;

/** Le moteur : crée la scène, fait tourner la boucle de jeu, nettoie à la fin. */
export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  private clock = new THREE.Clock();
  private input: Input;
  private player = new Player();
  private cameraRig: ThirdPersonCamera;
  private frameId = 0;

  constructor(private container: HTMLElement) {
    this.renderer.setPixelRatio(1);
    container.appendChild(this.renderer.domElement);

    this.input = new Input(this.renderer.domElement);
    this.cameraRig = new ThirdPersonCamera(this.camera);

    buildTestWorld(this.scene);
    this.scene.add(this.player.object);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  start(): void {
    this.clock.start();
    this.frameId = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.resize);
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private frame = () => {
    this.frameId = requestAnimationFrame(this.frame);
    // dt plafonné : évite un "saut" du personnage après un onglet mis en pause.
    const dt = Math.min(this.clock.getDelta(), 0.05);

    this.player.update(dt, this.input, this.cameraRig.yaw);
    this.cameraRig.update(this.input, this.player.object.position);
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
