import * as THREE from 'three';
import type { Input } from '../engine/Input';

const WALK_SPEED = 2.5; // mètres par seconde
const RUN_SPEED = 6;
const TURN_SPEED = 12;

/** Personnage provisoire (formes simples), sans collisions pour l'instant. */
export class Player {
  readonly object = new THREE.Group();
  private move = new THREE.Vector3();

  constructor() {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.0, 2, 8),
      new THREE.MeshLambertMaterial({ color: 0xd94f30 }),
    );
    body.position.y = 0.8;

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshLambertMaterial({ color: 0xe0b48c }),
    );
    head.position.y = 1.75;

    // Petit repère sombre pour voir de quel côté le personnage regarde (+Z).
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.08, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    );
    face.position.set(0, 1.8, 0.18);

    this.object.add(body, head, face);
  }

  update(dt: number, input: Input, cameraYaw: number): void {
    const forward = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
                  - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const right = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
                - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    if (forward === 0 && right === 0) return;

    // Directions "devant" et "à droite" vues depuis la caméra, à plat sur le sol.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    this.move.set(-sin * forward + cos * right, 0, -cos * forward - sin * right).normalize();

    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.object.position.addScaledVector(this.move, (running ? RUN_SPEED : WALK_SPEED) * dt);

    // Le personnage se tourne progressivement vers sa direction de marche.
    const targetAngle = Math.atan2(this.move.x, this.move.z);
    let diff = targetAngle - this.object.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.object.rotation.y += diff * Math.min(1, TURN_SPEED * dt);
  }
}
