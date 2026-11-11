import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { Collider } from '../world/Collider';

const MAX_SPEED = 32;        // m/s, environ 115 km/h
const MAX_REVERSE = 8;
const ACCELERATION = 10;
const BRAKING = 22;
const DRAG = 1.2;            // ralentissement naturel quand on lâche l'accélérateur
const WHEELBASE = 2.6;
const MAX_STEER = 0.55;      // angle maximal des roues (radians)
const HALF_WIDTH = 0.9;
const HALF_LENGTH = 2.1;

/** Voiture provisoire en blocs, à conduite "arcade" (pas de simulation physique complète). */
export class Car {
  readonly object = new THREE.Group();
  /** Direction du capot (radians). L'avant de la voiture est du côté +Z. */
  heading = 0;
  speed = 0;

  constructor(color: number) {
    const paint = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4.2), paint);
    body.position.y = 0.62;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.1), new THREE.MeshLambertMaterial({ color: 0x26323c }));
    cabin.position.set(0, 1.18, -0.25);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.06, 2.0), paint);
    roof.position.set(0, 1.48, -0.25);
    const lights = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    lights.position.set(0, 0.7, 2.11);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0xc81e1e }));
    rear.position.set(0, 0.7, -2.11);
    this.object.add(body, cabin, roof, lights, rear);

    const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10);
    wheelGeometry.rotateZ(Math.PI / 2);
    const tyre = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    for (const [x, z] of [[0.9, 1.35], [-0.9, 1.35], [0.9, -1.35], [-0.9, -1.35]]) {
      const wheel = new THREE.Mesh(wheelGeometry, tyre);
      wheel.position.set(x, 0.34, z);
      this.object.add(wheel);
    }
  }

  place(x: number, z: number, heading = this.heading): void {
    this.object.position.set(x, 0, z);
    this.heading = heading;
    this.object.rotation.y = heading;
    this.speed = 0;
  }

  /** Conduite : W accélère, S freine puis recule, A/D tournent, Espace = frein à main. */
  drive(dt: number, input: Input, collider: Collider | null): void {
    const gas = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
              - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const steer = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
                - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);

    if (input.isDown('Space')) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKING * 1.5 * dt);
    } else if (gas !== 0) {
      const opposing = this.speed !== 0 && Math.sign(this.speed) !== gas;
      this.speed += gas * (opposing ? BRAKING : ACCELERATION) * dt;
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), DRAG * dt);
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -MAX_REVERSE, MAX_SPEED);
    this.move(dt, steer, collider);
  }

  /** Voiture sans conducteur : elle finit de rouler puis s'arrête. */
  coast(dt: number, collider: Collider | null): void {
    if (this.speed === 0) return;
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    this.move(dt, 0, collider);
  }

  private move(dt: number, steer: number, collider: Collider | null): void {
    // Plus on roule vite, moins les roues braquent (sinon la voiture est incontrôlable).
    const steerAngle = steer * MAX_STEER / (1 + Math.abs(this.speed) / 12);
    const heading = this.heading - (this.speed / WHEELBASE) * Math.tan(steerAngle) * dt;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const position = this.object.position;
    const x = position.x + fx * this.speed * dt;
    const z = position.z + fz * this.speed * dt;

    if (collider && this.hits(collider, x, z, fx, fz)) {
      this.speed *= -0.3; // choc : la voiture rebondit légèrement
      return;
    }
    position.x = x;
    position.z = z;
    this.heading = heading;
    this.object.rotation.y = heading;
  }

  private hits(collider: Collider, x: number, z: number, fx: number, fz: number): boolean {
    const rx = -fz, rz = fx; // vecteur "à droite" de la voiture
    for (const l of [HALF_LENGTH, 0, -HALF_LENGTH]) {
      for (const w of [HALF_WIDTH, -HALF_WIDTH]) {
        if (collider.inside(x + fx * l + rx * w, z + fz * l + rz * w)) return true;
      }
    }
    return false;
  }
}
