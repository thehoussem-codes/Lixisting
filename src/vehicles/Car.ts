import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { Collider } from '../world/Collider';

const MAX_SPEED = 32;        // m/s, environ 115 km/h
const BOOST_SPEED = 14;      // bonus en ligne droite : jusqu'à environ 165 km/h
const BOOST_BUILD = 0.12;    // le bonus met environ 8 secondes à se remplir
const BOOST_LOSS = 0.8;      // et se perd vite dès qu'on tourne ou qu'on lâche
const MAX_REVERSE = 8;
const ACCELERATION = 10;
const BRAKING = 22;
const DRAG = 5.5;            // frein moteur quand on lâche l'accélérateur (m/s²)
const DRAG_SPEED = 0.18;     // + une part proportionnelle à la vitesse (résistance de l'air)
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
  /** 0 à 1 : élan accumulé en roulant droit, qui relève la vitesse maximale. */
  private boost = 0;

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
    this.object.rotation.order = 'YXZ'; // d'abord la direction, puis l'inclinaison sur la pente

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
    this.boost = 0;
  }

  /** Pose la voiture sur le sol et l'incline selon la pente. */
  settle(ground: (x: number, z: number) => number): void {
    const { x, z } = this.object.position;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = fz, lz = -fx; // vecteur "à gauche" de la voiture
    const front = ground(x + fx * HALF_LENGTH, z + fz * HALF_LENGTH), back = ground(x - fx * HALF_LENGTH, z - fz * HALF_LENGTH);
    const left = ground(x + lx * HALF_WIDTH, z + lz * HALF_WIDTH), right = ground(x - lx * HALF_WIDTH, z - lz * HALF_WIDTH);
    this.object.position.y = (front + back + left + right) / 4;
    this.object.rotation.x = -Math.atan2(front - back, HALF_LENGTH * 2);
    this.object.rotation.z = Math.atan2(left - right, HALF_WIDTH * 2);
  }

  /** Place directement la voiture (utilisé par la circulation automatique). */
  setPose(x: number, z: number, heading: number): void {
    this.object.position.x = x;
    this.object.position.z = z;
    this.heading = heading;
    this.object.rotation.y = heading;
  }

  /** Ce point (vu du dessus) est-il sous la voiture ? */
  contains(x: number, z: number, margin = 0): boolean {
    const dx = x - this.object.position.x, dz = z - this.object.position.z;
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    return Math.abs(dx * sin + dz * cos) < HALF_LENGTH + margin && Math.abs(-dx * cos + dz * sin) < HALF_WIDTH + margin;
  }

  /** Conduite : W accélère, S freine puis recule, A/D tournent, Espace = frein à main. */
  drive(dt: number, input: Input, collider: Collider | null, others: Car[]): void {
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
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (DRAG + DRAG_SPEED * Math.abs(this.speed)) * dt);
    }
    // Élan : il monte peu à peu tant qu'on accélère tout droit, et retombe sinon.
    if (gas > 0 && steer === 0 && this.speed > MAX_SPEED * 0.8) this.boost = Math.min(1, this.boost + BOOST_BUILD * dt);
    else this.boost = Math.max(0, this.boost - BOOST_LOSS * dt);
    const limit = MAX_SPEED + BOOST_SPEED * this.boost;
    if (this.speed > limit) this.speed = Math.max(limit, this.speed - BRAKING * 0.5 * dt);
    this.speed = Math.max(this.speed, -MAX_REVERSE);
    this.move(dt, steer, collider, others);
  }

  /** Voiture sans conducteur : elle finit de rouler puis s'arrête. */
  coast(dt: number, collider: Collider | null, others: Car[]): void {
    if (this.speed === 0) return;
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    this.boost = 0;
    this.move(dt, 0, collider, others);
  }

  private move(dt: number, steer: number, collider: Collider | null, others: Car[]): void {
    // Plus on roule vite, moins les roues braquent (sinon la voiture est incontrôlable).
    const steerAngle = steer * MAX_STEER / (1 + Math.abs(this.speed) / 12);
    const heading = this.heading - (this.speed / WHEELBASE) * Math.tan(steerAngle) * dt;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const position = this.object.position;
    const x = position.x + fx * this.speed * dt;
    const z = position.z + fz * this.speed * dt;

    const other = this.hitCar(others, x, z, fx, fz);
    if (other || (collider && this.hits(collider, x, z, fx, fz))) {
      // La voiture percutée est poussée dans le sens du choc.
      if (other) other.speed = this.speed * 0.5 * Math.cos(other.heading - heading);
      this.speed *= -0.3; // choc : la voiture rebondit légèrement
      this.boost = 0;
      return;
    }
    position.x = x;
    position.z = z;
    this.heading = heading;
    this.object.rotation.y = heading;
  }

  private hitCar(others: Car[], x: number, z: number, fx: number, fz: number): Car | null {
    const rx = -fz, rz = fx;
    for (const other of others) {
      if (other === this) continue;
      if (Math.abs(other.object.position.x - x) > 6 || Math.abs(other.object.position.z - z) > 6) continue;
      for (const l of [HALF_LENGTH, 0, -HALF_LENGTH]) {
        for (const w of [HALF_WIDTH, -HALF_WIDTH]) {
          if (other.contains(x + fx * l + rx * w, z + fz * l + rz * w)) return other;
        }
      }
    }
    return null;
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
