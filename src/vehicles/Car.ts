import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { Collider } from '../world/Collider';
import { createCarVisual, type CarSpec } from './CarModels';
import { SuspensionPhysics, defaultHandling, type Controls } from './physics/SuspensionPhysics';

/**
 * Ancienne conduite simplifiée, conservée comme solution de repli :
 * ajouter ?physique=arcade à l'adresse du jeu pour y revenir.
 */
export const USE_ARCADE = new URLSearchParams(window.location.search).get('physique') === 'arcade';

const MAX_SPEED = 32;        // m/s, environ 115 km/h
const BOOST_SPEED = 14;      // bonus en ligne droite : jusqu'à environ 165 km/h
const BOOST_BUILD = 0.12;    // le bonus met environ 8 secondes à se remplir
const BOOST_LOSS = 0.8;      // et se perd vite dès qu'on tourne ou qu'on lâche
const MAX_REVERSE = 8;
const ACCELERATION = 10;
const BRAKING = 22;
const DRAG = 5.5;            // frein moteur quand on lâche l'accélérateur (m/s²)
const DRAG_SPEED = 0.18;     // + une part proportionnelle à la vitesse (résistance de l'air)
const MAX_STEER = 0.55;      // angle maximal des roues (radians)

/** Une voiture du jeu, à conduite "arcade" (pas de simulation physique complète). Son apparence vient du catalogue. */
export class Car {
  readonly object: THREE.Group;
  /** Direction du capot (radians). L'avant de la voiture est du côté +Z. */
  heading = 0;
  speed = 0;
  /** 0 à 1 : élan accumulé en roulant droit, qui relève la vitesse maximale. */
  private boost = 0;
  private wheels: THREE.Object3D[];
  private halfLength: number;
  private halfWidth: number;
  private wheelbase: number;
  private lastSettle = 0;
  /** Simulation à quatre suspensions : créée quand la voiture est conduite ou percutée. */
  private physics: SuspensionPhysics | null = null;
  private restTime = 0;

  constructor(readonly spec: CarSpec, color: number) {
    const visual = createCarVisual(spec, color);
    this.object = visual.group;
    this.wheels = visual.wheels;
    this.object.rotation.order = 'YXZ'; // d'abord la direction, puis l'inclinaison sur la pente
    this.halfLength = spec.length / 2;
    this.halfWidth = spec.width / 2;
    this.wheelbase = (spec.axleFront - spec.axleRear) * spec.length;
  }

  place(x: number, z: number, heading = this.heading): void {
    this.dropPhysics();
    this.object.position.set(x, 0, z);
    this.heading = heading;
    this.object.rotation.y = heading;
    this.speed = 0;
    this.boost = 0;
  }

  /** Pose la voiture sur le sol et l'incline selon la pente. */
  settle(ground: (x: number, z: number) => number): void {
    if (this.physics) return; // la simulation gère déjà sa position
    const { x, z } = this.object.position;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = fz, lz = -fx; // vecteur "à gauche" de la voiture
    const front = ground(x + fx * this.halfLength, z + fz * this.halfLength), back = ground(x - fx * this.halfLength, z - fz * this.halfLength);
    const left = ground(x + lx * this.halfWidth, z + lz * this.halfWidth), right = ground(x - lx * this.halfWidth, z - lz * this.halfWidth);
    // Hauteur : la plus haute entre la moyenne des quatre côtés et le sol sous le centre (évite de s'enfoncer sur une bosse).
    this.object.position.y = Math.max((front + back + left + right) / 4, ground(x, z));
    this.object.rotation.x = -Math.atan2(front - back, this.halfLength * 2);
    this.object.rotation.z = Math.atan2(left - right, this.halfWidth * 2);
    // Les roues tournent selon la vitesse.
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastSettle) / 1000);
    this.lastSettle = now;
    for (const wheel of this.wheels) wheel.rotation.x += (this.speed * dt) / this.spec.wheelRadius;
  }

  /** Place directement la voiture (utilisé par la circulation automatique). */
  setPose(x: number, z: number, heading: number): void {
    this.dropPhysics();
    this.object.position.x = x;
    this.object.position.z = z;
    this.heading = heading;
    this.object.rotation.y = heading;
  }

  /**
   * Cette voiture, si elle était placée en (x, z) avec cette direction, toucherait-elle `other` ?
   * Test exact entre deux rectangles orientés (méthode des axes séparateurs).
   */
  wouldOverlap(other: Car, x: number, z: number, heading: number): boolean {
    const dx = other.object.position.x - x, dz = other.object.position.z - z;
    if (Math.abs(dx) > 6 || Math.abs(dz) > 6) return false;
    const a = [Math.sin(heading), Math.cos(heading)], b = [Math.sin(other.heading), Math.cos(other.heading)];
    // Les 4 axes à tester : avant et côté de chaque voiture.
    for (const [ux, uz] of [[a[0], a[1]], [-a[1], a[0]], [b[0], b[1]], [-b[1], b[0]]]) {
      const reach = (car: Car, f: number[]) => car.halfLength * Math.abs(f[0] * ux + f[1] * uz) + car.halfWidth * Math.abs(-f[1] * ux + f[0] * uz);
      if (Math.abs(dx * ux + dz * uz) > reach(this, a) + reach(other, b)) return false;
    }
    return true;
  }

  /** Ce point (vu du dessus) est-il sous la voiture ? */
  contains(x: number, z: number, margin = 0): boolean {
    const dx = x - this.object.position.x, dz = z - this.object.position.z;
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    return Math.abs(dx * sin + dz * cos) < this.halfLength + margin && Math.abs(-dx * cos + dz * sin) < this.halfWidth + margin;
  }

  /** Télémétrie pour l'affichage et les tests. */
  get telemetry(): { airborne: boolean; wheelsOnGround: number; pitch: number; roll: number; impact: number } {
    const p = this.physics;
    return p ? { airborne: p.airborne, wheelsOnGround: p.contact.filter(Boolean).length, pitch: p.pitch, roll: p.roll, impact: p.impact }
      : { airborne: false, wheelsOnGround: 4, pitch: 0, roll: 0, impact: 0 };
  }

  /** Choc reçu : la voiture est poussée à cette vitesse vers l'avant. */
  shove(speed: number): void {
    this.speed = speed;
    if (USE_ARCADE) return;
    this.wake().setForwardSpeed(speed);
    this.restTime = 0;
  }

  private dropPhysics(): void {
    if (!this.physics) return;
    this.physics = null;
    for (const wheel of this.wheels) { wheel.position.y = this.spec.wheelRadius; wheel.rotation.y = 0; }
  }

  /** Démarre la simulation à partir de la position actuelle. */
  private wake(): SuspensionPhysics {
    if (!this.physics) {
      this.physics = new SuspensionPhysics({
        handling: { ...defaultHandling(this.spec.length, this.spec.width, this.spec.height), ...this.spec.handling },
        wheels: this.wheels.map((wheel) => ({ x: wheel.position.x, z: wheel.position.z })),
        wheelRadius: this.spec.wheelRadius,
      });
      const { x, y, z } = this.object.position;
      this.physics.reset(x, y, z, this.heading, this.speed);
    }
    return this.physics;
  }

  private simulate(dt: number, controls: Controls, collider: Collider | null, others: Car[], ground: (x: number, z: number) => number): void {
    const physics = this.wake();
    physics.step(dt, controls, {
      ground,
      collides: (x, z, yaw) => {
        const other = this.hitCar(others, x, z, yaw);
        if (other) other.shove(physics.forwardSpeed * 0.5 * Math.cos(other.heading - yaw));
        return other !== null || (collider !== null && this.hits(collider, x, z, Math.sin(yaw), Math.cos(yaw)));
      },
    });
    this.object.position.set(physics.x, physics.y, physics.z);
    this.heading = physics.yaw;
    this.speed = physics.forwardSpeed;
    this.object.rotation.set(-physics.pitch, physics.yaw, physics.roll);
    // Roues : elles suivent le sol (débattement), braquent à l'avant et tournent.
    this.wheels.forEach((wheel, i) => {
      wheel.position.y = physics.attachHeight - physics.length[i];
      wheel.rotation.order = 'YXZ';
      if (i >= 2) wheel.rotation.y = -physics.steer;
      wheel.rotation.x += (physics.forwardSpeed * dt) / this.spec.wheelRadius;
    });
  }

  /** Conduite : W accélère, S freine puis recule, A/D tournent, Espace = frein à main. */
  drive(dt: number, input: Input, collider: Collider | null, others: Car[], ground: (x: number, z: number) => number): void {
    const gas = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
              - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const steer = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
                - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);

    if (!USE_ARCADE) {
      // Élan : il monte peu à peu tant qu'on accélère tout droit, et retombe sinon.
      const top = this.wake().setup.handling.maxSpeed;
      if (gas > 0 && steer === 0 && this.speed > top * 0.8) this.boost = Math.min(1, this.boost + BOOST_BUILD * dt);
      else this.boost = Math.max(0, this.boost - BOOST_LOSS * dt);
      this.restTime = 0;
      this.simulate(dt, { throttle: gas, steer, handbrake: input.isDown('Space'), speedLimit: top + BOOST_SPEED * this.boost }, collider, others, ground);
      return;
    }
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
  coast(dt: number, collider: Collider | null, others: Car[], ground: (x: number, z: number) => number): void {
    if (this.physics) {
      // La simulation continue tant que la voiture bouge, puis se met en veille.
      this.restTime = this.physics.isMoving ? 0 : this.restTime + dt;
      if (this.restTime < 1) this.simulate(dt, { throttle: 0, steer: 0, handbrake: false, speedLimit: 30 }, collider, others, ground);
      return;
    }
    if (this.speed === 0) return;
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    this.boost = 0;
    this.move(dt, 0, collider, others);
  }

  private move(dt: number, steer: number, collider: Collider | null, others: Car[]): void {
    // Plus on roule vite, moins les roues braquent (sinon la voiture est incontrôlable).
    const steerAngle = steer * MAX_STEER / (1 + Math.abs(this.speed) / 12);
    const heading = this.heading - (this.speed / this.wheelbase) * Math.tan(steerAngle) * dt;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const position = this.object.position;
    const x = position.x + fx * this.speed * dt;
    const z = position.z + fz * this.speed * dt;

    const other = this.hitCar(others, x, z, heading);
    if (other || (collider && this.hits(collider, x, z, fx, fz))) {
      // La voiture percutée est poussée dans le sens du choc.
      if (other) other.shove(this.speed * 0.5 * Math.cos(other.heading - heading));
      this.speed *= -0.3; // choc : la voiture rebondit légèrement
      this.boost = 0;
      return;
    }
    position.x = x;
    position.z = z;
    this.heading = heading;
    this.object.rotation.y = heading;
  }

  private hitCar(others: Car[], x: number, z: number, heading: number): Car | null {
    for (const other of others) {
      if (other === this || !other.object.visible) continue;
      // Si les deux voitures se touchaient déjà (apparition, poussée), on laisse repartir pour se dégager.
      if (this.wouldOverlap(other, x, z, heading) &&
          !this.wouldOverlap(other, this.object.position.x, this.object.position.z, this.heading)) return other;
    }
    return null;
  }

  private hits(collider: Collider, x: number, z: number, fx: number, fz: number): boolean {
    const rx = -fz, rz = fx; // vecteur "à droite" de la voiture
    for (const l of [this.halfLength, 0, -this.halfLength]) {
      for (const w of [this.halfWidth, -this.halfWidth]) {
        if (collider.inside(x + fx * l + rx * w, z + fz * l + rz * w)) return true;
      }
    }
    return false;
  }
}
