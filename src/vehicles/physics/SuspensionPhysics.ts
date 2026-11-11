/**
 * Physique automobile "sur mesure" : une caisse rigide portée par quatre suspensions
 * indépendantes. Ce fichier ne dépend ni du moteur 3D ni du reste du jeu : il reçoit
 * des commandes et une fonction "hauteur du sol", et calcule le mouvement. On peut
 * donc le tester seul, et le remplacer plus tard par un autre moteur (Rapier) sans
 * toucher au reste.
 *
 * Repère : x vers l'est, y vers le haut, z vers le sud. Cap (yaw) : l'avant de la
 * voiture pointe vers (sin yaw, cos yaw). Tangage (pitch) positif = nez levé.
 * Roulis (roll) positif = côté gauche levé.
 */

export interface Handling {
  mass: number;              // kg
  engineForce: number;       // poussée maximale du moteur (N)
  brakeForce: number;        // force de freinage maximale (N)
  maxSpeed: number;          // vitesse de pointe sur le plat (m/s)
  reverseSpeed: number;      // vitesse maximale en marche arrière (m/s)
  grip: number;              // adhérence des pneus (1 = bitume sec)
  cornering: number;         // raideur de dérive : réactivité de la direction
  steerMax: number;          // braquage maximal des roues (radians)
  springRate: number;        // raideur de chaque ressort (N/m)
  damping: number;           // amortissement de chaque amortisseur (N·s/m)
  restLength: number;        // longueur du ressort détendu (m)
  travel: number;            // course avant la butée (m)
  cgHeight: number;          // hauteur du centre de gravité (m)
  engineBrake: number;       // frein moteur à l'accélérateur relâché (m/s²)
  airDrag: number;           // résistance de l'air (N par (m/s)²)
}

/** Point d'ancrage d'une roue dans la voiture : x > 0 = côté gauche, z > 0 = avant. */
export interface WheelPoint { x: number; z: number }

export interface VehicleSetup {
  handling: Handling;
  /** Ordre : arrière gauche, arrière droite, avant gauche, avant droite. */
  wheels: WheelPoint[];
  wheelRadius: number;
}

export interface Controls {
  throttle: number;   // -1 (frein / marche arrière) à 1 (accélérateur)
  steer: number;      // -1 (gauche) à 1 (droite)
  handbrake: boolean;
  /** Vitesse de pointe du moment (permet l'élan en ligne droite). */
  speedLimit: number;
}

export interface Surroundings {
  ground(x: number, z: number): number;
  /** Niveau de la mer (m), ou null s'il n'y a pas d'eau. */
  waterLevel: number | null;
  /** La voiture placée ici toucherait-elle un mur ou un autre véhicule ? */
  collides(x: number, z: number, yaw: number): boolean;
}

const GRAVITY = 9.81;
const STEP = 1 / 240; // pas de calcul : assez fin pour des ressorts raides

export class SuspensionPhysics {
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  yaw = 0; yawRate = 0;
  pitch = 0; pitchRate = 0;
  roll = 0; rollRate = 0;
  /** Angle actuel des roues avant (radians, positif = à droite). */
  steer = 0;
  /** Longueur actuelle de chaque suspension (m) et contact de chaque roue avec le sol. */
  readonly length: number[];
  readonly contact: boolean[] = [false, false, false, false];
  forwardSpeed = 0;
  /** Vrai quand aucune roue ne touche le sol. */
  airborne = false;
  /** 0 = au sec, 1 = caisse entièrement sous l'eau. */
  submerged = 0;
  /** Plus forte compression subie au dernier pas (pour détecter les réceptions brutales). */
  impact = 0;

  /** Hauteur des ancrages de suspension au-dessus de l'origine de la voiture. */
  readonly attachHeight: number;
  private toFront: number; private toRear: number; private track: number;

  constructor(readonly setup: VehicleSetup) {
    const h = setup.handling;
    const staticCompression = (h.mass * GRAVITY) / (4 * h.springRate);
    // Au repos sur sol plat, le bas des roues est exactement à y.
    this.attachHeight = setup.wheelRadius + h.restLength - staticCompression;
    this.length = setup.wheels.map(() => h.restLength - staticCompression);
    this.toFront = Math.max(...setup.wheels.map((w) => w.z));
    this.toRear = -Math.min(...setup.wheels.map((w) => w.z));
    this.track = Math.max(...setup.wheels.map((w) => w.x)) * 2;
  }

  /** Pose la voiture à un endroit, à l'arrêt ou avec une vitesse vers l'avant. */
  reset(x: number, y: number, z: number, yaw: number, forwardSpeed = 0): void {
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.vy = 0; this.yawRate = 0; this.pitch = 0; this.pitchRate = 0; this.roll = 0; this.rollRate = 0; this.steer = 0;
    this.setForwardSpeed(forwardSpeed);
  }

  /** Impose la vitesse vers l'avant (choc reçu d'une autre voiture, par exemple). */
  setForwardSpeed(speed: number): void {
    this.vx = Math.sin(this.yaw) * speed;
    this.vz = Math.cos(this.yaw) * speed;
    this.forwardSpeed = speed;
  }

  get isMoving(): boolean {
    return this.airborne || Math.abs(this.vx) + Math.abs(this.vz) + Math.abs(this.vy) > 0.05 ||
      Math.abs(this.pitchRate) + Math.abs(this.rollRate) > 0.02;
  }

  /** Avance la simulation de dt secondes (découpées en petits pas réguliers). */
  step(dt: number, controls: Controls, world: Surroundings): void {
    const count = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / count;
    this.impact = 0;
    for (let i = 0; i < count; i++) this.substep(h, controls, world);
  }

  private substep(h: number, controls: Controls, world: Surroundings): void {
    const { handling: p, wheels, wheelRadius } = this.setup;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = sin, fz = cos;     // vers l'avant
    const rx = -cos, rz = sin;    // vers la droite
    const sinPitch = Math.sin(this.pitch), sinRoll = Math.sin(this.roll);

    // --- Suspensions : chaque roue pousse la caisse selon l'écrasement de son ressort.
    let lift = 0, pitchTorque = 0, rollTorque = 0, frontLoad = 0, rearLoad = 0, contacts = 0;
    let groundFront = 0, groundRear = 0, groundLeft = 0, groundRight = 0;
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      const px = this.x + fx * w.z - rx * w.x, pz = this.z + fz * w.z - rz * w.x;
      const groundY = world.ground(px, pz);
      if (w.z > 0) groundFront += groundY / 2; else groundRear += groundY / 2;
      if (w.x > 0) groundLeft += groundY / 2; else groundRight += groundY / 2;

      const attachY = this.y + this.attachHeight + w.z * sinPitch + w.x * sinRoll;
      const length = attachY - groundY - wheelRadius;
      const compression = p.restLength - length;
      let force = 0;
      if (compression > 0) {
        const closing = -(this.vy + w.z * this.pitchRate + w.x * this.rollRate); // vitesse d'écrasement
        force = p.springRate * compression + p.damping * closing;
        if (compression > p.travel) force += p.springRate * 14 * (compression - p.travel); // butée
        if (force < 0) force = 0;
        if (compression > this.impact) this.impact = compression;
      }
      this.contact[i] = force > 0;
      if (force > 0) contacts++;
      this.length[i] = Math.min(p.restLength, Math.max(p.restLength - p.travel * 1.3, length));
      lift += force;
      pitchTorque += force * w.z;
      rollTorque += force * w.x;
      if (w.z > 0) frontLoad += force; else rearLoad += force;
    }
    this.airborne = contacts === 0;
    const grounded = contacts / wheels.length;

    // --- Vitesse dans le repère de la voiture.
    let forward = this.vx * fx + this.vz * fz;
    let sideways = this.vx * rx + this.vz * rz;

    // --- Direction : les roues tournent progressivement, et moins à haute vitesse.
    const steerTarget = (controls.steer * p.steerMax) / (1 + Math.abs(forward) / 16);
    this.steer += Math.max(-3 * h, Math.min(3 * h, steerTarget - this.steer));
    const sinSteer = Math.sin(this.steer), cosSteer = Math.cos(this.steer);

    // --- Pente : la gravité tire la voiture vers le bas de la côte.
    const slopeForward = (groundFront - groundRear) / (this.toFront + this.toRear);
    const slopeSide = (groundRight - groundLeft) / this.track;

    // --- Moteur et freins.
    const load = frontLoad + rearLoad;
    let drive = 0;
    if (controls.handbrake) {
      drive = -Math.sign(forward) * p.brakeForce * 0.6;
    } else if (controls.throttle > 0) {
      drive = forward < -0.5 ? p.brakeForce
        : controls.throttle * p.engineForce * Math.max(0, 1 - (forward / controls.speedLimit) ** 4); // pleine poussée presque jusqu'à la pointe
    } else if (controls.throttle < 0) {
      drive = forward > 0.5 ? -p.brakeForce
        : controls.throttle * p.engineForce * 0.6 * Math.max(0, 1 - (forward / p.reverseSpeed) ** 2);
    } else {
      // Frein moteur. Il s'efface dans les descentes (au-delà de 8 %, la voiture est en roue libre),
      // pour que la gravité puisse l'entraîner.
      const downhill = -Math.sign(forward) * slopeForward;
      const engine = Math.max(0, 1 - Math.max(0, downhill) / 0.08);
      drive = -Math.sign(forward) * p.mass * Math.min((p.engineBrake + 0.18 * Math.abs(forward)) * engine, Math.abs(forward) / h);
    }
    // Dans l'eau : le moteur se noie dès que la caisse est à moitié immergée.
    this.submerged = world.waterLevel === null ? 0 : Math.max(0, Math.min(1, (world.waterLevel + 0.35 - this.y) / 1.1));
    if (this.submerged > 0.5 && !controls.handbrake) drive = 0;
    // Les pneus ne transmettent pas plus que leur adhérence : rien du tout en l'air.
    const tractionLimit = p.grip * load;
    drive = Math.max(-tractionLimit, Math.min(tractionLimit, drive));

    // --- Adhérence latérale : chaque essieu résiste au glissement de côté.
    const reference = Math.max(Math.abs(forward), 3);
    const frontSlip = ((sideways - this.yawRate * this.toFront) * cosSteer - forward * sinSteer) / reference;
    const rearSlip = (sideways + this.yawRate * this.toRear) / reference;
    const frontGrip = p.grip * frontLoad, rearGrip = p.grip * rearLoad * (controls.handbrake ? 0.35 : 1);
    const frontSide = Math.max(-frontGrip, Math.min(frontGrip, -p.cornering * frontSlip * frontLoad));
    const rearSide = Math.max(-rearGrip, Math.min(rearGrip, -p.cornering * rearSlip * rearLoad));

    const tyreForward = (drive - frontSide * sinSteer) / p.mass;
    const tyreSide = (frontSide * cosSteer + rearSide) / p.mass;
    const accelForward = tyreForward - GRAVITY * slopeForward * grounded - (p.airDrag * forward * Math.abs(forward)) / p.mass;
    const accelSide = tyreSide - GRAVITY * slopeSide * grounded;

    forward += accelForward * h;
    sideways += accelSide * h;
    // À très basse vitesse, les pneus accrochent : la voiture s'immobilise au lieu de dériver.
    if (grounded > 0 && controls.throttle === 0 && Math.abs(forward) < 1.5) {
      const hold = Math.min(1, 8 * h);
      sideways -= sideways * hold;
      this.yawRate -= this.yawRate * hold;
      if (Math.abs(forward) < 0.4 && Math.abs(slopeForward) < 0.07) forward -= forward * hold; // tient à l'arrêt jusqu'à 7 % de pente
    }
    this.vx = fx * forward + rx * sideways;
    this.vz = fz * forward + rz * sideways;
    this.forwardSpeed = forward;

    // --- Mouvements de caisse : pompage, tangage (transfert de poids), roulis, lacet.
    const length = this.toFront + this.toRear;
    const pitchInertia = (p.mass * length * length) / 12, rollInertia = (p.mass * this.track * this.track) / 8;
    const yawInertia = p.mass * this.toFront * this.toRear * 1.1;
    this.vy += (lift / p.mass - GRAVITY) * h;
    if (this.submerged > 0) {
      // L'eau porte en partie la voiture (elle coule lentement) et la freine fortement.
      const water = this.submerged;
      this.vy += GRAVITY * 0.86 * water * h;
      this.vy -= this.vy * Math.min(1, 3 * water * h);
      const slow = Math.min(1, 2.2 * water * h);
      this.vx -= this.vx * slow; this.vz -= this.vz * slow;
      this.forwardSpeed -= this.forwardSpeed * slow;
      this.yawRate -= this.yawRate * slow;
    }
    this.pitchRate += ((pitchTorque + p.mass * tyreForward * p.cgHeight) / pitchInertia) * h;
    this.rollRate += ((rollTorque - p.mass * tyreSide * p.cgHeight) / rollInertia) * h;
    this.yawRate += (-(this.toFront * frontSide * cosSteer - this.toRear * rearSide) / yawInertia) * h;
    this.pitchRate -= this.pitchRate * Math.min(1, 0.6 * h);
    this.rollRate -= this.rollRate * Math.min(1, 0.6 * h);

    // --- Déplacement, avec arrêt contre les murs et les autres véhicules.
    const nx = this.x + this.vx * h, nz = this.z + this.vz * h, nyaw = this.yaw + this.yawRate * h;
    if (world.collides(nx, nz, nyaw)) {
      this.vx *= -0.3; this.vz *= -0.3; this.yawRate *= -0.2;
      this.forwardSpeed *= -0.3;
    } else {
      this.x = nx; this.z = nz; this.yaw = nyaw;
    }
    this.y += this.vy * h;
    this.pitch = Math.max(-0.9, Math.min(0.9, this.pitch + this.pitchRate * h));
    this.roll = Math.max(-0.7, Math.min(0.7, this.roll + this.rollRate * h));
    // Sécurité : la caisse ne peut pas passer sous le sol.
    const floor = world.ground(this.x, this.z) - 0.22;
    if (this.y < floor) { this.y = floor; if (this.vy < 0) this.vy = 0; }
  }
}

/** Réglages par défaut, déduits des dimensions d'une voiture. */
export function defaultHandling(length: number, width: number, height: number): Handling {
  const mass = Math.round(110 * length * width * height);
  const springRate = (mass * GRAVITY) / (4 * 0.09);          // 9 cm d'écrasement au repos
  return {
    mass,
    engineForce: mass * 10,   // même accélération qu'avant la refonte
    brakeForce: mass * 14,
    maxSpeed: 32,
    reverseSpeed: 8,
    grip: 1.3,
    cornering: 9,
    steerMax: 0.55,
    springRate,
    damping: 2 * 0.45 * Math.sqrt(springRate * (mass / 4)),  // amortissement à 45 % du critique
    restLength: 0.26,
    travel: 0.2,
    cgHeight: height * 0.36,
    engineBrake: 3.2,
    airDrag: 0.2,
  };
}
