import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { Collider } from '../world/Collider';
import { createCarVisual, type CarSpec } from './CarModels';
import { SuspensionPhysics, defaultHandling, type Controls } from './physics/SuspensionPhysics';

let shadowTexture: THREE.Texture | null = null;

/** Ombre portée simple : une tache sombre aux bords flous, posée sous l'objet. Presque gratuite à afficher. */
export function createBlobShadow(width: number, length: number): THREE.Mesh {
  if (!shadowTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 6, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.75)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    shadowTexture = new THREE.CanvasTexture(canvas);
  }
  const material = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.renderOrder = 2;
  return shadow;
}

/**
 * Deux conduites :
 *  - "arcade" (par défaut) : la conduite simple d'origine. Aucun dérapage, aucun effet des pentes :
 *    sans appui sur les touches, la voiture freine seule puis reste immobile. Seule différence :
 *    sur un vrai tremplin ou une falaise, elle décolle et retombe au lieu de rester collée au sol ;
 *  - "simulation" (?physique=simulation) : la physique complète à quatre suspensions, plus exigeante.
 */
export const USE_ARCADE = new URLSearchParams(window.location.search).get('physique') !== 'simulation';

const GRAVITY = 9.81;
const TAKEOFF_GAP = 0.3;    // la voiture ne décolle que si le sol se dérobe de plus de 30 cm sous sa trajectoire (vrais sauts)

const MAX_SPEED = 32;        // m/s, environ 115 km/h
const BOOST_SPEED = 14;      // bonus en ligne droite : jusqu'à environ 165 km/h
const BOOST_BUILD = 0.12;    // le bonus met environ 8 secondes à se remplir
const BOOST_LOSS = 0.8;      // et se perd vite dès qu'on tourne ou qu'on lâche
const MAX_REVERSE = 8;
// Essai : ?vitesse=libre retire la vitesse maximale (seuls le moteur et la résistance de l'air freinent encore).
const FREE_SPEED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('vitesse') === 'libre';
const ACCELERATION = 10;
const BRAKING = 22;
const DRAG = 5.5;            // frein moteur quand on lâche l'accélérateur (m/s²)
const DRAG_SPEED = 0.18;     // + une part proportionnelle à la vitesse (résistance de l'air)
const MAX_STEER = 0.55;      // angle maximal des roues (radians)
// Volant : il ne saute pas d'un bord à l'autre, il tourne à vitesse limitée (plus lentement quand on roule vite)
// et revient plus vite au centre quand on le lâche. Principe repris du jeu libre codingedger/car-game (SteerManager).
// Boîte automatique : vitesse (m/s) à laquelle chaque rapport atteint la zone rouge, et force de chaque rapport.
// Les premiers rapports poussent fort, les derniers allongent. Principe (régime lié à la vitesse et au rapport,
// passage près de la zone rouge, creux pendant le passage) inspiré de codingedger/car-game (EngineManager).
const GEAR_TOP = [9, 16, 24, 34, 50];
const GEAR_PULL = [1.55, 1.2, 0.95, 0.75, 0.55];
const SHIFT_TIME = 0.28;     // durée d'un passage de rapport : le moteur ne pousse presque plus
const STEER_TURN = 3.2;      // demi-course du volant par seconde, à l'arrêt
const STEER_RETURN = 5.5;    // retour au centre
const STEER_SLOW = 28;       // m/s : vitesse à laquelle le volant tourne deux fois moins vite

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
  // --- Conduite arcade : mouvement vertical et attitudes de caisse
  private baseY: number | null = null; // hauteur des roues (sans l'écrasement visuel)
  private vy = 0;
  private airborne = false;
  private dip = 0;        // écrasement des suspensions après une réception (m)
  private tiltX = 0;      // tangage affiché
  private tiltZ = 0;      // roulis affiché
  private slopePitch = 0; // pente du sol sous la voiture, dans le sens de la marche
  private steerInput = 0;
  /** Rapport engagé (1 à 5 ; 0 : marche arrière) et régime moteur de 0 (ralenti) à 1 (zone rouge). */
  gear = 1;
  rpm = 0;
  /** Accélérateur réellement appliqué (0 à 1) et intensité du crissement des pneus (0 à 1), pour le son. */
  throttle = 0;
  skid = 0;
  private shifting = 0;
  /** Position réelle du volant, de -1 à 1 : elle rejoint peu à peu la touche appuyée. */
  private steering = 0;
  /** Angle des roues avant (radians) réellement appliqué à la trajectoire. */
  private steerAngle = 0;
  private leanNode: THREE.Object3D | null;
  private riderNode: THREE.Object3D | null;
  private leanFrom = 0;
  private wheelieHeld = false;
  private wheelie = 0; // angle de la roue arrière (radians)

  /** Deux-roues : affiche ou cache le conducteur assis dessus. */
  set rider(shown: boolean) { if (this.riderNode) this.riderNode.visible = shown; if (!shown) this.wheelieHeld = false; }
  private lastSpeed = 0;
  private lastHeading = 0;
  /** Niveau de la mer pour toutes les voitures (null dans la zone de test). */
  static waterLevel: number | null = null;
  private shadow: THREE.Mesh;

  constructor(readonly spec: CarSpec, color: number) {
    const visual = createCarVisual(spec, color);
    this.object = visual.group;
    this.object.traverse((node) => { node.castShadow = true; });
    this.wheels = visual.wheels;
    this.leanNode = visual.lean ?? null;
    this.riderNode = visual.rider ?? null;
    this.object.rotation.order = 'YXZ'; // d'abord la direction, puis l'inclinaison sur la pente
    this.halfLength = spec.collision?.halfLength ?? spec.length / 2;
    this.halfWidth = spec.collision?.halfWidth ?? spec.width / 2;
    this.wheelbase = (spec.axleFront - spec.axleRear) * spec.length;
    this.shadow = createBlobShadow(spec.width * 1.35, spec.length * 1.15);
    this.object.add(this.shadow);
  }

  place(x: number, z: number, heading = this.heading): void {
    this.dropPhysics();
    this.baseY = null;
    this.object.position.set(x, 0, z);
    this.heading = heading;
    this.object.rotation.y = heading;
    this.speed = 0;
    this.boost = 0;
  }

  /**
   * Pose la voiture sur le sol et l'incline selon la pente.
   * dynamic = vrai pour les voitures du joueur : elles peuvent quitter le sol, retomber,
   * s'écraser à la réception et pencher en virage. Sinon (circulation) : simple suivi du sol.
   */
  settle(ground: (x: number, z: number) => number, dynamic = false): void {
    if (this.physics) return; // la simulation gère déjà sa position
    const position = this.object.position;
    const { x, z } = position;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = fz, lz = -fx; // vecteur "à gauche" de la voiture
    const front = ground(x + fx * this.halfLength, z + fz * this.halfLength), back = ground(x - fx * this.halfLength, z - fz * this.halfLength);
    const left = ground(x + lx * this.halfWidth, z + lz * this.halfWidth), right = ground(x - lx * this.halfWidth, z - lz * this.halfWidth);
    // Sol : le plus haut entre la moyenne des quatre côtés et le point sous le centre (évite de s'enfoncer sur une bosse).
    const floor = Math.max((front + back + left + right) / 4, ground(x, z));
    const slopePitch = Math.atan2(front - back, this.halfLength * 2), slopeRoll = Math.atan2(left - right, this.halfWidth * 2);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastSettle) / 1000);
    this.lastSettle = now;
    for (const wheel of this.wheels) wheel.rotation.x += (this.speed * dt) / this.spec.wheelRadius;
    if (this.leanNode && dt > 0) {
      // Un deux-roues penche vers l'intérieur du virage, d'autant plus qu'il tourne vite.
      let turn = this.heading - this.leanFrom;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / dt;
      this.leanFrom = this.heading;
      const target = Math.max(-0.5, Math.min(0.5, -turn * Math.abs(this.speed) * 0.09));
      this.leanNode.rotation.z += (target - this.leanNode.rotation.z) * (1 - Math.exp(-5 * dt));
      // Roue arrière : la moto pivote autour du point de contact de sa roue arrière.
      const lift = this.wheelieHeld && Math.abs(this.speed) > 1.5 ? 0.78 : 0;
      this.wheelie += (lift - this.wheelie) * Math.min(1, (lift ? 4 : 7) * dt);
      const rear = (this.spec.axleRear - 0.5) * this.spec.length;
      this.leanNode.rotation.x = -this.wheelie;
      this.leanNode.position.set(0, -rear * Math.sin(this.wheelie), rear * (1 - Math.cos(this.wheelie)));
    }

    if (!dynamic || dt <= 0 || this.baseY === null) {
      this.baseY = floor; this.vy = 0; this.airborne = false; this.dip = 0;
      this.tiltX = -slopePitch; this.tiltZ = slopeRoll; this.slopePitch = slopePitch;
      this.lastSpeed = this.speed; this.lastHeading = this.heading;
      position.y = floor;
      this.object.rotation.x = this.tiltX; this.object.rotation.z = this.tiltZ;
      return;
    }

    // --- Mouvement vertical
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.baseY += this.vy * dt;
      if (this.baseY <= floor) { // réception : les suspensions s'écrasent, sans rebond
        this.dip = Math.min(0.24, -this.vy * 0.035);
        this.baseY = floor; this.vy = 0; this.airborne = false;
      }
    } else {
      // Où serait la voiture si elle continuait sur sa lancée, en chute libre ?
      const ballistic = this.baseY + this.vy * dt - 0.5 * GRAVITY * dt * dt;
      if (ballistic > floor + TAKEOFF_GAP) { // le sol se dérobe : elle décolle
        this.airborne = true;
        this.vy -= GRAVITY * dt;
        this.baseY = ballistic;
      } else {                               // elle suit le relief
        this.vy = Math.max(-40, Math.min(40, (floor - this.baseY) / dt));
        this.baseY = floor;
      }
    }
    this.dip *= Math.exp(-7 * dt);
    position.y = this.baseY - this.dip;
    this.slopePitch = this.airborne ? 0 : slopePitch;

    // --- Attitudes de caisse : discrètes, lissées
    const acceleration = (this.speed - this.lastSpeed) / dt;
    let turn = this.heading - this.lastHeading;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / dt;
    this.lastSpeed = this.speed; this.lastHeading = this.heading;
    const squat = Math.max(-0.025, Math.min(0.025, acceleration * 0.002)); // se cabre à l'accélération, plonge au freinage
    const lean = Math.max(-0.035, Math.min(0.035, this.speed * turn * 0.004)); // penche à peine vers l'extérieur du virage
    const targetX = this.airborne ? this.tiltX + 0.25 * dt : -slopePitch - squat; // en l'air, le nez pique doucement
    const targetZ = this.airborne ? this.tiltZ : slopeRoll + lean;
    const follow = 1 - Math.exp(-9 * dt); // même douceur quel que soit le nombre d'images par seconde
    this.tiltX += (targetX - this.tiltX) * follow;
    this.tiltZ += (targetZ - this.tiltZ) * follow;
    this.object.rotation.x = this.tiltX; this.object.rotation.z = this.tiltZ;
    // Roues : elles restent au sol quand la caisse s'écrase, et les roues avant braquent.
    // La roue intérieure au virage braque un peu plus que l'autre (épure d'Ackermann), comme sur une vraie voiture.
    const angle = Math.abs(this.steerAngle), track = this.halfWidth * 2 - 0.3;
    const radius = angle > 1e-3 ? this.wheelbase / Math.tan(angle) : 0;
    this.wheels.forEach((wheel, i) => {
      wheel.position.y = this.spec.wheelRadius + this.dip;
      wheel.rotation.order = 'YXZ';
      if (i < 2 || this.wheels.length < 4) { if (i >= 1 && this.wheels.length < 4) wheel.rotation.y = -this.steerAngle; return; }
      const inner = (this.steerAngle > 0) === (i === 3) ? 1 : -1; // roue 2 : gauche, roue 3 : droite
      wheel.rotation.y = radius ? -Math.sign(this.steerAngle) * Math.atan(this.wheelbase / Math.max(0.5, radius - inner * track / 2)) : 0;
    });
  }

  /** Braque les roues avant d'un véhicule à l'arrêt (salon d'exposition : montre que les roues sont mobiles). */
  poseWheels(steer: number): void {
    this.steerInput = -steer / 0.45;
    this.steerAngle = -steer;
    this.wheels.forEach((wheel, i) => { wheel.rotation.order = 'YXZ'; if (i >= 2) wheel.rotation.y = steer; });
  }

  /** Place directement la voiture (utilisé par la circulation automatique). */
  setPose(x: number, z: number, heading: number): void {
    this.dropPhysics();
    this.baseY = null;
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
  get telemetry(): { airborne: boolean; wheelsOnGround: number; pitch: number; roll: number; impact: number; submerged: number } {
    const p = this.physics;
    return p ? { airborne: p.airborne, wheelsOnGround: p.contact.filter(Boolean).length, pitch: p.pitch, roll: p.roll, impact: p.impact, submerged: p.submerged }
      : { airborne: this.airborne, wheelsOnGround: this.airborne ? 0 : 4, pitch: -this.tiltX, roll: this.tiltZ, impact: this.dip,
          submerged: Math.max(0, Math.min(1, (-0.25 - (this.baseY ?? 0)) / 1.0)) };
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
    this.shadow.position.y = 0.04;
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
      waterLevel: Car.waterLevel,
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
    // Ombre : elle reste au sol quand la voiture décolle, et s'estompe avec la hauteur.
    const above = Math.max(0, physics.y - ground(physics.x, physics.z));
    this.shadow.position.y = 0.04 - above;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = physics.submerged > 0.2 ? 0 : 0.55 / (1 + above * 0.6);
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
    const up = input.isDown('KeyW') || input.isDown('ArrowUp'), down = input.isDown('KeyS') || input.isDown('ArrowDown');
    // Maxi-scooter : haut + bas en même temps = roue arrière (la moto continue d'avancer).
    this.wheelieHeld = this.spec.moto === 'maxiscooter' && up && down && !this.airborne;
    const gas = this.wheelieHeld ? 1 : (up ? 1 : 0) - (down ? 1 : 0);
    const steer = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
                - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);

    if (!USE_ARCADE) {
      // Élan : il monte peu à peu tant qu'on accélère tout droit, et retombe sinon.
      const top = this.wake().setup.handling.maxSpeed;
      if (gas > 0 && steer === 0 && this.speed > top * 0.8) this.boost = Math.min(1, this.boost + BOOST_BUILD * dt);
      else this.boost = Math.max(0, this.boost - BOOST_LOSS * dt);
      this.restTime = 0;
      this.simulate(dt, { throttle: gas, steer, handbrake: input.isDown('Space'), speedLimit: FREE_SPEED ? Infinity : top + BOOST_SPEED * this.boost }, collider, others, ground);
      return;
    }
    this.steerInput = steer;
    this.turnWheel(steer, dt);
    if (this.airborne) {
      // En l'air : ni moteur, ni freins, ni direction. La voiture garde son élan.
      this.move(dt, 0, collider, others);
      return;
    }
    // Dans l'eau profonde, le moteur cale et la voiture est freinée.
    const underwater = Car.waterLevel !== null && (this.baseY ?? 0) < Car.waterLevel - 0.9;
    if (underwater) this.speed -= this.speed * Math.min(1, 3 * dt);
    if (input.isDown('Space')) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKING * 1.5 * dt);
    } else if (gas !== 0 && !underwater) {
      const opposing = this.speed !== 0 && Math.sign(this.speed) !== gas;
      this.speed += gas * (opposing ? BRAKING : ACCELERATION * this.pull(dt)) * dt;
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (DRAG + DRAG_SPEED * Math.abs(this.speed)) * dt);
    }
    // Élan : il monte peu à peu tant qu'on accélère tout droit, et retombe sinon.
    if (gas > 0 && steer === 0 && this.speed > MAX_SPEED * 0.8) this.boost = Math.min(1, this.boost + BOOST_BUILD * dt);
    else this.boost = Math.max(0, this.boost - BOOST_LOSS * dt);
    const limit = FREE_SPEED ? Infinity : MAX_SPEED + BOOST_SPEED * this.boost;
    if (this.speed > limit) this.speed = Math.max(limit, this.speed - BRAKING * 0.5 * dt);
    this.speed = Math.max(this.speed, -MAX_REVERSE);
    this.revs(dt, gas > 0 && !underwater ? 1 : 0);
    // Crissement : frein à main en roulant, ou virage serré pris trop vite.
    const cornering = Math.abs(this.steerAngle) * this.speed * this.speed / this.wheelbase; // accélération latérale (m/s²)
    const wanted = (input.isDown('Space') && Math.abs(this.speed) > 4 ? 1 : 0) + Math.max(0, Math.min(1, (cornering - 7) / 5));
    this.skid += (Math.min(1, wanted) - this.skid) * (1 - Math.exp(-12 * dt));
    this.move(dt, this.steering, collider, others);
  }

  /** Force du moteur selon le rapport et le régime (1 = poussée de référence). Gère aussi les passages de rapport. */
  private pull(dt: number): number {
    if (this.speed < -0.2) { this.gear = 0; return 1; }
    if (this.gear === 0) this.gear = 1;
    const v = Math.abs(this.speed);
    if (this.shifting > 0) { this.shifting -= dt; return 0.15; }
    if (v > GEAR_TOP[this.gear - 1] * 0.93 && this.gear < GEAR_TOP.length) { this.gear++; this.shifting = SHIFT_TIME; return 0.15; }
    // Le moteur pousse le mieux à mi-régime et s'essouffle près de la zone rouge.
    const r = v / GEAR_TOP[this.gear - 1];
    const push = GEAR_PULL[this.gear - 1] * (0.75 + 0.5 * r - 0.45 * r * r);
    return FREE_SPEED ? Math.max(0.35, push) : push; // sans limite, le dernier rapport continue de pousser
  }

  /** Régime moteur affiché et entendu : il suit la vitesse dans le rapport engagé, et rétrograde en ralentissant. */
  private revs(dt: number, throttle: number): void {
    const v = Math.abs(this.speed);
    while (this.gear > 1 && v < GEAR_TOP[this.gear - 2] * 0.62) this.gear--;
    const top = this.gear === 0 ? MAX_REVERSE * 1.3 : GEAR_TOP[this.gear - 1];
    const target = Math.min(1, v / top) * (this.shifting > 0 ? 0.8 : 1) + (throttle && v < 1 ? 0.15 : 0);
    this.rpm += (target - this.rpm) * (1 - Math.exp(-9 * dt));
    this.throttle += (throttle - this.throttle) * (1 - Math.exp(-10 * dt));
  }

  /** Voiture sans conducteur : elle finit de rouler puis s'arrête. */
  coast(dt: number, collider: Collider | null, others: Car[], ground: (x: number, z: number) => number): void {
    if (this.physics) {
      // La simulation continue tant que la voiture bouge, puis se met en veille.
      this.restTime = this.physics.isMoving ? 0 : this.restTime + dt;
      if (this.restTime < 1) this.simulate(dt, { throttle: 0, steer: 0, handbrake: false, speedLimit: 30 }, collider, others, ground);
      return;
    }
    this.steerInput = 0;
    this.turnWheel(0, dt);
    if (this.speed === 0) return;
    if (!this.airborne) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    this.boost = 0;
    this.move(dt, 0, collider, others);
  }

  /** Fait tourner le volant vers la touche appuyée, à vitesse limitée. */
  private turnWheel(input: number, dt: number): void {
    const moto = this.spec.moto ? 1.5 : 1; // un guidon répond plus vite qu'un volant
    const rate = input !== 0 && Math.sign(input) === Math.sign(this.steering || input)
      ? STEER_TURN * moto / (1 + Math.abs(this.speed) / STEER_SLOW) : STEER_RETURN * moto;
    const gap = input - this.steering;
    this.steering += Math.sign(gap) * Math.min(Math.abs(gap), rate * dt);
  }

  private move(dt: number, steer: number, collider: Collider | null, others: Car[]): void {
    // Plus on roule vite, moins les roues braquent (sinon la voiture est incontrôlable).
    const steerAngle = steer * MAX_STEER / (1 + Math.abs(this.speed) / 12);
    this.steerAngle = steerAngle;
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
