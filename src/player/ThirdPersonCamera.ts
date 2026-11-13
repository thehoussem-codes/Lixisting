import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { Collider } from '../world/Collider';

const SENSITIVITY = 0.0025;
const TARGET_HEIGHT = 1.6;
const MIN_PITCH = -0.1;
const MAX_PITCH = 1.3;
const STEPS = 13;

/** Caméra qui tourne autour du joueur, pilotée à la souris. */
export class ThirdPersonCamera {
  /** Angle horizontal (radians). Le joueur s'en sert pour avancer "vers l'écran". */
  yaw = Math.PI;
  private pitch = 0.3;
  private distance = 6.5;
  private target = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {}

  /**
   * maxDistance : recul de la caméra (plus grand en voiture).
   * followYaw : si fourni, la caméra revient doucement derrière cette direction.
   */
  update(input: Input, playerPosition: THREE.Vector3, collider: Collider | null, dt: number, ground: (x: number, z: number) => number, maxDistance = 6.5, followYaw: number | null = null): void {
    const DISTANCE = maxDistance;
    const { dx, dy } = input.consumeMouse();
    if (followYaw !== null && dx === 0) {
      let diff = followYaw - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * (1 - Math.exp(-3.2 * dt)); // lissage indépendant du nombre d'images par seconde
    }
    this.yaw -= dx * SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * SENSITIVITY, MIN_PITCH, MAX_PITCH);

    // La cible suit le joueur exactement à l'horizontale, mais en douceur à la verticale :
    // les bosses et les réceptions ne secouent plus l'image.
    const wantedY = playerPosition.y + TARGET_HEIGHT;
    const jump = Math.abs(wantedY - this.target.y) > 6 || this.target.lengthSq() === 0; // téléportation : pas de glissade
    this.target.set(playerPosition.x, jump ? wantedY : this.target.y + (wantedY - this.target.y) * (1 - Math.exp(-10 * dt)), playerPosition.z);
    const dirX = Math.sin(this.yaw) * Math.cos(this.pitch);
    const dirZ = Math.cos(this.yaw) * Math.cos(this.pitch);
    const dirY = Math.sin(this.pitch);

    // On avance du joueur vers la caméra : si un bâtiment est sur le chemin,
    // la caméra se rapproche pour ne pas passer à travers le mur.
    let wanted = DISTANCE;
    if (collider) {
      for (let i = 1; i <= STEPS; i++) {
        const d = (DISTANCE * i) / STEPS;
        if (collider.inside(this.target.x + dirX * d, this.target.z + dirZ * d)) {
          wanted = Math.max(0.8, (DISTANCE * (i - 1)) / STEPS);
          break;
        }
      }
    }
    // Se rapproche tout de suite, s'éloigne en douceur.
    this.distance = wanted < this.distance ? wanted : this.distance + (wanted - this.distance) * (1 - Math.exp(-6 * dt));

    const camX = this.target.x + dirX * this.distance, camZ = this.target.z + dirZ * this.distance;
    // La caméra reste toujours au-dessus du sol, même au pied d'une colline.
    this.camera.position.set(camX, Math.max(ground(camX, camZ) + 0.7, this.target.y + dirY * this.distance), camZ);
    this.camera.lookAt(this.target);
  }
}
