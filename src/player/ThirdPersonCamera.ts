import * as THREE from 'three';
import type { Input } from '../engine/Input';

const SENSITIVITY = 0.0025;
const DISTANCE = 6;
const TARGET_HEIGHT = 1.5;
const MIN_PITCH = -0.1;
const MAX_PITCH = 1.2;

/** Caméra qui tourne autour du joueur, pilotée à la souris. */
export class ThirdPersonCamera {
  /** Angle horizontal (radians). Le joueur s'en sert pour avancer "vers l'écran". */
  yaw = 0;
  private pitch = 0.3;
  private target = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {}

  update(input: Input, playerPosition: THREE.Vector3): void {
    const { dx, dy } = input.consumeMouse();
    this.yaw -= dx * SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * SENSITIVITY, MIN_PITCH, MAX_PITCH);

    this.target.copy(playerPosition);
    this.target.y += TARGET_HEIGHT;

    const horizontal = Math.cos(this.pitch) * DISTANCE;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      Math.max(0.3, this.target.y + Math.sin(this.pitch) * DISTANCE),
      this.target.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.target);
  }
}
