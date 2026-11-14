import type { WorldData } from '../world/WorldData';
import type { Collider } from '../world/Collider';
import { Car } from './Car';
import { pickCar } from './CarModels';

const COUNT = 24;            // voitures en circulation autour du joueur
const CELL = 200;            // taille des cases servant à trouver des rues proches (m)
const SPAWN_MIN = 110;       // elles apparaissent assez loin pour ne pas surgir sous nos yeux
const DESPAWN = 480;
const LANE_OFFSET = 1.7;     // on roule à droite de l'axe de la rue
const LOOK_AHEAD = 14;       // m : distance à laquelle on repère un obstacle sur sa voie
const CORNER = 7;            // m : rayon de raccord des virages (réduit sur les tronçons courts)
const GRIP = 3.2;            // m/s² : accélération latérale acceptée en virage (conduite tranquille)
const BRAKE = 3.5;           // m/s² : freinage confortable
const HARD_BRAKE = 9;        // m/s² : freinage d'urgence
const ACCEL = 2.6;           // m/s²

interface Edge { to: number; fast: boolean }

/**
 * États d'un conducteur (machine à états, skill game-ai) :
 *  - drive : suit sa voie, ralentit avant les virages et derrière un véhicule plus lent ;
 *  - wait : arrêté derrière un obstacle immobile ; klaxonne, puis double si la voie d'en face est libre ;
 *  - pass : contourne l'obstacle par la gauche, à vitesse réduite, et se rabat une fois qu'il l'a dépassé ;
 *  - crashed : percuté ; plus personne ne conduit, le véhicule glisse puis reste sur place jusqu'à sa réapparition.
 */
type State = 'drive' | 'wait' | 'pass' | 'crashed';

interface Driver {
  car: Car; from: number; to: number; next: number;
  travelled: number; length: number; nextLength: number; cruise: number;
  /** Direction du tronçon précédent (pour finir le virage commencé) et longueur du raccord d'entrée. */
  pdx: number; pdz: number; entry: number;
  /** Le virage en cours d'entrée est un demi-tour. */
  entryU: boolean;
  lane: number;
  state: State;
  /** Secondes passées dans l'état courant. */
  timer: number;
  honked: boolean;
  /** Obstacle que l'on contourne (position au moment de la décision). */
  obstacle: { x: number; z: number; halfWidth: number } | null;
}

/**
 * Circulation automatique : des voitures suivent le vrai réseau de rues, respectent
 * les sens uniques et les feux, prennent les virages en courbe, et doublent un obstacle arrêté.
 */
export class Traffic {
  readonly cars: Car[] = [];
  private drivers: Driver[] = [];
  private nodes: number[];
  private out: Edge[][] = [];
  private cells = new Map<string, number[]>();
  private seed = 12345;
  /** Feux tricolores (fournis par le jeu une fois la ville construite). */
  lights: { stateFor(node: number, dx: number, dz: number): 'green' | 'amber' | 'red' | null } | null = null;
  /** Coup de klaxon (distance au joueur en m), pour le son. */
  onHonk: ((distance: number) => void) | null = null;

  constructor(data: WorldData, private addToScene: (car: Car) => void) {
    this.nodes = data.graph.nodes;
    const count = this.nodes.length / 2;
    this.out = Array.from({ length: count }, () => []);
    const e = data.graph.edges;
    for (let i = 0; i < e.length; i += 4) {
      this.out[e[i]].push({ to: e[i + 1], fast: e[i + 3] === 1 });
      if (e[i + 2] === 0) this.out[e[i + 1]].push({ to: e[i], fast: e[i + 3] === 1 });
    }
    for (let i = 0; i < count; i++) {
      if (this.out[i].length === 0) continue;
      const key = `${Math.floor(this.nodes[i * 2] / CELL)},${Math.floor(-this.nodes[i * 2 + 1] / CELL)}`;
      const cell = this.cells.get(key);
      if (cell) cell.push(i); else this.cells.set(key, [i]);
    }
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private nodeX(i: number): number { return this.nodes[i * 2]; }
  private nodeZ(i: number): number { return -this.nodes[i * 2 + 1]; }
  private span(a: number, b: number): number { return Math.hypot(this.nodeX(b) - this.nodeX(a), this.nodeZ(b) - this.nodeZ(a)); }

  /** Choisit un point de rue à bonne distance du joueur, ou -1 si aucun n'est trouvé cette fois. */
  private pickSpawn(px: number, pz: number): number {
    const cx = Math.floor(px / CELL) + Math.floor(this.random() * 5) - 2;
    const cz = Math.floor(pz / CELL) + Math.floor(this.random() * 5) - 2;
    const cell = this.cells.get(`${cx},${cz}`);
    if (!cell) return -1;
    const node = cell[Math.floor(this.random() * cell.length)];
    const d = Math.hypot(this.nodeX(node) - px, this.nodeZ(node) - pz);
    return d > SPAWN_MIN && d < DESPAWN - 60 ? node : -1;
  }

  /** Tronçon suivant au carrefour `at` (arrivé depuis `previous`) : pas de demi-tour, sauf en impasse. */
  private chooseNext(at: number, previous: number): number {
    const options = this.out[at];
    if (options.length === 0) return -1;
    const forward = options.filter((o) => o.to !== previous);
    const pool = forward.length > 0 ? forward : options;
    return pool[Math.floor(this.random() * pool.length)].to;
  }

  private cruiseFor(from: number, to: number): number {
    const edge = this.out[from].find((o) => o.to === to);
    return (edge?.fast ? 14 : 8.5) * (0.85 + this.random() * 0.3);
  }

  private respawn(driver: Driver, px: number, pz: number, others: Car[]): boolean {
    const node = this.pickSpawn(px, pz);
    if (node < 0) return false;
    const to = this.chooseNext(node, -1);
    if (to < 0 || this.span(node, to) < 0.5) return false;
    const x = this.nodeX(node), z = this.nodeZ(node);
    // Pas d'apparition sur une voiture déjà présente.
    for (const other of others) {
      if (other !== driver.car && other.object.visible && Math.hypot(other.object.position.x - x, other.object.position.z - z) < 12) return false;
    }
    driver.from = node; driver.to = to; driver.length = this.span(node, to); driver.travelled = 0; driver.entry = 0; driver.entryU = false;
    driver.next = this.chooseNext(to, node);
    driver.nextLength = driver.next >= 0 ? this.span(to, driver.next) : 0;
    driver.cruise = this.cruiseFor(node, to);
    driver.pdx = (this.nodeX(to) - x) / driver.length; driver.pdz = (this.nodeZ(to) - z) / driver.length;
    driver.lane = LANE_OFFSET; driver.state = 'drive'; driver.timer = 0; driver.honked = false; driver.obstacle = null;
    driver.car.recover();
    driver.car.rider = true;
    driver.car.speed = driver.cruise * 0.7;
    driver.car.setPose(x, z, Math.atan2(driver.pdx, driver.pdz));
    driver.car.object.visible = true;
    return true;
  }

  /** Pour les essais : état de chaque voiture visible. */
  snapshot(): { x: number; z: number; h: number; v: number; state: State }[] {
    return this.drivers.filter((d) => d.car.object.visible).map((d) => ({ x: d.car.object.position.x, z: d.car.object.position.z, h: d.car.heading, v: d.car.speed, state: d.state }));
  }

  /** Le joueur prend cette voiture : elle sort de la circulation. */
  release(car: Car): void {
    this.drivers = this.drivers.filter((d) => d.car !== car);
    const index = this.cars.indexOf(car);
    if (index >= 0) this.cars.splice(index, 1);
  }

  /** Rayon du raccord entre le tronçon courant et le suivant (0 en impasse). */
  private cornerRadius(driver: Driver): number {
    if (driver.next < 0) return 0;
    // Demi-tour (impasse) : un demi-cercle d'un côté de la rue à l'autre, de longueur π × écart de voie.
    if (this.turnAngle(driver) > 2.6) return Math.min(Math.PI * LANE_OFFSET / 2, driver.length * 0.45, driver.nextLength * 0.45);
    return Math.min(CORNER, driver.length * 0.45, driver.nextLength * 0.45);
  }

  /** Angle du virage au bout du tronçon courant (0 = tout droit, π = demi-tour). */
  private turnAngle(driver: Driver): number {
    if (driver.next < 0) return Math.PI;
    const ax = this.nodeX(driver.from), az = this.nodeZ(driver.from), bx = this.nodeX(driver.to), bz = this.nodeZ(driver.to);
    const dx = (bx - ax) / driver.length, dz = (bz - az) / driver.length;
    const nx = (this.nodeX(driver.next) - bx) / driver.nextLength, nz = (this.nodeZ(driver.next) - bz) / driver.nextLength;
    return Math.acos(Math.max(-1, Math.min(1, dx * nx + dz * nz)));
  }

  /**
   * px, pz : position du joueur. onFoot : il est à pied (et compte comme obstacle).
   * others : toutes les autres voitures du jeu (garées, conduite par le joueur).
   */
  update(dt: number, px: number, pz: number, onFoot: boolean, others: Car[], ground: (x: number, z: number) => number, collider: Collider | null = null): void {
    const everyCar = [...others, ...this.cars];
    // On complète peu à peu l'effectif (une tentative par image, pour ne pas ralentir le jeu).
    if (this.drivers.length < COUNT) {
      const choice = pickCar(() => this.random());
      const car = new Car(choice.spec, choice.color);
      car.rider = true;
      const driver: Driver = { car, from: 0, to: 0, next: -1, travelled: 0, length: 1, nextLength: 0, cruise: 8, pdx: 0, pdz: 1, entry: 0,
        lane: LANE_OFFSET, state: 'drive', timer: 0, honked: false, obstacle: null, entryU: false };
      if (this.respawn(driver, px, pz, everyCar)) {
        this.drivers.push(driver);
        this.cars.push(car);
        this.addToScene(car);
      }
    }

    for (const driver of this.drivers) {
      const car = driver.car;
      const position = car.object.position;
      const distance = Math.hypot(position.x - px, position.z - pz);
      driver.timer += dt;
      // Trop loin, ou bloquée (ou accidentée) depuis longtemps hors de la vue proche : on la replace ailleurs.
      const stale = (driver.state === 'wait' && driver.timer > 15) || (driver.state === 'crashed' && driver.timer > 20);
      if (distance > DESPAWN || !car.object.visible || (stale && distance > 70)) {
        if (!this.respawn(driver, px, pz, everyCar)) { if (distance > DESPAWN) car.object.visible = false; }
        if (!car.object.visible) continue;
      }

      // Percutée : plus personne ne conduit.
      if (driver.state !== 'crashed' && car.sinceImpact < 0.2 && car.lastImpact > 1) { driver.state = 'crashed'; driver.timer = 0; }
      if (driver.state === 'crashed') {
        car.coast(dt, collider, everyCar, ground);
        car.settle(ground, true);
        continue;
      }

      const ax = this.nodeX(driver.from), az = this.nodeZ(driver.from);
      const dx = (this.nodeX(driver.to) - ax) / driver.length, dz = (this.nodeZ(driver.to) - az) / driver.length;
      const along = (x: number, z: number) => (x - position.x) * dx + (z - position.z) * dz;           // distance devant
      const across = (x: number, z: number) => (x - ax) * -dz + (z - az) * dx;                          // écart à l'axe (droite > 0)

      // --- Perception : premier obstacle sur la voie (voiture ou joueur à pied), sa distance et sa vitesse.
      const myHalf = car.spec.width / 2, myLength = car.spec.length / 2;
      const scan = (lane: number, reach: number, ignoreOncoming = false, from = -myLength) => {
        let best: { gap: number; speed: number; x: number; z: number; halfWidth: number; car: Car | null } | null = null;
        const consider = (x: number, z: number, halfWidth: number, halfLength: number, speed: number, other: Car | null) => {
          const ahead = along(x, z) - myLength - halfLength;
          if (ahead < from || ahead > reach) return;
          if (Math.abs(across(x, z) - lane) > halfWidth + myHalf + 0.25) return;
          if (ignoreOncoming && speed < -1) return;
          if (!best || ahead < best.gap) best = { gap: Math.max(0, ahead), speed, x, z, halfWidth, car: other };
        };
        if (onFoot) consider(px, pz, 0.45, 0.45, 0, null);
        for (const other of everyCar) {
          if (other === car || !other.object.visible) continue;
          const o = other.object.position;
          if (Math.abs(o.x - position.x) > reach + 8 || Math.abs(o.z - position.z) > reach + 8) continue;
          const heading = Math.sin(other.heading) * dx + Math.cos(other.heading) * dz; // sens de marche par rapport au nôtre
          consider(o.x, o.z, other.spec.width / 2, other.spec.length / 2 * Math.abs(heading) + other.spec.width / 2 * (1 - Math.abs(heading)), other.speed * heading, other);
        }
        return best as { gap: number; speed: number; x: number; z: number; halfWidth: number; car: Car | null } | null;
      };

      const remaining = driver.length - driver.travelled;
      const light = this.lights?.stateFor(driver.to, dx, dz);
      const redAhead = (light === 'red' || light === 'amber') && remaining > 4;
      const ahead = scan(driver.lane, LOOK_AHEAD + car.speed * 1.2);

      // --- Décision
      if (driver.state === 'drive') {
        if (ahead && ahead.gap < 3 && Math.abs(ahead.speed) < 0.5 && car.speed < 0.5 && !redAhead) { driver.state = 'wait'; driver.timer = 0; driver.honked = false; }
      } else if (driver.state === 'wait') {
        if (!ahead || ahead.gap > 6 || Math.abs(ahead.speed) > 1.5) { driver.state = 'drive'; driver.timer = 0; }
        else {
          if (!driver.honked && driver.timer > 1.2 && (ahead.car === null || ahead.car.object.position.distanceTo(position) < 9)) {
            driver.honked = true;
            this.onHonk?.(distance);
          }
          // Doubler : obstacle immobile depuis 2 s, voie d'en face libre sur 30 m (y compris les voitures qui arrivent).
          const passLane = Math.min(-LANE_OFFSET, across(ahead.x, ahead.z) - ahead.halfWidth - myHalf - 0.7);
          if (driver.timer > 2 && passLane > -5 && !scan(passLane, 30)) {
            driver.state = 'pass'; driver.timer = 0;
            driver.obstacle = { x: ahead.x, z: ahead.z, halfWidth: ahead.halfWidth };
          }
        }
      } else if (driver.state === 'pass' && driver.obstacle) {
        // File d'attente : si un autre véhicule arrêté occupe encore la voie de droite à notre hauteur ou juste devant,
        // c'est lui qu'il faut dépasser maintenant (on double toute la file avant de se rabattre).
        const beside = scan(LANE_OFFSET, 8, false, -2 * myLength - 1);
        if (beside && Math.abs(beside.speed) < 1 && -along(beside.x, beside.z) < myLength + 4) driver.obstacle = { x: beside.x, z: beside.z, halfWidth: beside.halfWidth };
        const behind = -along(driver.obstacle.x, driver.obstacle.z);
        // Rabattement quand l'obstacle est dépassé et que la voie de droite est libre.
        if ((behind > myLength + 4 && !beside) || driver.timer > 20) { driver.state = 'drive'; driver.timer = 0; driver.obstacle = null; }
      }

      // --- Voie visée et vitesse visée
      let wantedLane = LANE_OFFSET;
      if (driver.state === 'pass' && driver.obstacle) wantedLane = Math.min(-LANE_OFFSET, across(driver.obstacle.x, driver.obstacle.z) - driver.obstacle.halfWidth - myHalf - 0.7);
      let target = driver.state === 'pass' ? Math.min(driver.cruise, 6) : driver.cruise;
      // Virage au bout du tronçon : vitesse limitée par l'adhérence, freinage anticipé.
      const radius = this.cornerRadius(driver), turn = this.turnAngle(driver);
      if (driver.next < 0) target = Math.min(target, Math.sqrt(2 * BRAKE * Math.max(0, remaining - 2)));
      else if (turn > 0.15) {
        const arc = radius / Math.tan(Math.min(turn, 3) / 2); // rayon de la courbe réellement suivie
        const cornerSpeed = Math.max(3, Math.sqrt(GRIP * Math.max(arc, 2)));
        target = Math.min(target, Math.sqrt(cornerSpeed ** 2 + 2 * BRAKE * Math.max(0, remaining - radius)));
      }
      if (redAhead) target = Math.min(target, Math.sqrt(2 * BRAKE * Math.max(0, remaining - 6)));
      if (ahead && driver.state !== 'pass') {
        // On garde une distance de sécurité d'environ 1,5 s, sans jamais rouler plus vite que ce qui permet de s'arrêter.
        const room = Math.max(0, ahead.gap - 2 - Math.max(0, car.speed) * 0.6);
        target = Math.min(target, Math.max(0, ahead.speed) + Math.sqrt(2 * BRAKE * room));
      }
      const urgent = ahead !== null && ahead.gap < 3;
      const change = target < car.speed ? (urgent ? HARD_BRAKE : BRAKE * 1.4) : ACCEL;
      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), change * dt);
      if (car.speed < 0) car.speed = 0;
      // Changement de voie progressif (environ 1,6 m/s latéralement, moins à basse vitesse).
      driver.lane += Math.sign(wantedLane - driver.lane) * Math.min(Math.abs(wantedLane - driver.lane), 1.6 * dt * Math.min(1, car.speed / 3 + 0.2));

      // --- Avancer sur le tronçon, puis enchaîner sur le suivant en gardant la courbe commencée.
      driver.travelled += car.speed * dt;
      if (driver.travelled >= driver.length) {
        if (driver.next < 0) { car.object.visible = false; continue; }
        const extra = driver.travelled - driver.length, entry = radius, uTurn = turn > 2.6;
        driver.pdx = dx; driver.pdz = dz;
        driver.from = driver.to; driver.to = driver.next; driver.length = driver.nextLength;
        driver.cruise = this.cruiseFor(driver.from, driver.to);
        driver.next = this.chooseNext(driver.to, driver.from);
        driver.nextLength = driver.next >= 0 ? this.span(driver.to, driver.next) : 0;
        driver.entry = entry;
        driver.entryU = uTurn;
        driver.travelled = Math.min(extra, driver.length);
      }
      this.place(driver, ground);
    }
  }

  /**
   * Position sur la rue : ligne droite au milieu du tronçon, courbe de Bézier (centrée sur le carrefour)
   * dans les derniers et les premiers mètres. La direction suit la tangente de la courbe : plus de virage « en équerre ».
   */
  private place(driver: Driver, ground: (x: number, z: number) => number): void {
    const car = driver.car;
    const ax = this.nodeX(driver.from), az = this.nodeZ(driver.from), bx = this.nodeX(driver.to), bz = this.nodeZ(driver.to);
    const dx = (bx - ax) / driver.length, dz = (bz - az) / driver.length;
    const s = driver.travelled, radius = this.cornerRadius(driver);
    let x: number, z: number, tx = dx, tz = dz;
    let laned = false; // vrai si la position calculée tient déjà compte de la voie (demi-tour)
    // Demi-tour : demi-cercle autour d'un point de l'axe, de la voie de droite à l'autre voie de droite.
    const uTurn = (cx: number, cz: number, fx: number, fz: number, t: number) => {
      const lane = driver.lane, ox = -fz * lane, oz = fx * lane, a = Math.PI * t;
      x = cx + ox * Math.cos(a) + fx * lane * Math.sin(a);
      z = cz + oz * Math.cos(a) + fz * lane * Math.sin(a);
      tx = -ox * Math.sin(a) + fx * lane * Math.cos(a);
      tz = -oz * Math.sin(a) + fz * lane * Math.cos(a);
      laned = true;
    };
    const bezier = (p0x: number, p0z: number, p1x: number, p1z: number, p2x: number, p2z: number, t: number) => {
      const u = 1 - t;
      x = u * u * p0x + 2 * u * t * p1x + t * t * p2x;
      z = u * u * p0z + 2 * u * t * p1z + t * t * p2z;
      tx = 2 * u * (p1x - p0x) + 2 * t * (p2x - p1x);
      tz = 2 * u * (p1z - p0z) + 2 * t * (p2z - p1z);
    };
    if (driver.entry > 0 && s < driver.entry) {
      // Fin du virage commencé sur le tronçon précédent.
      const e = driver.entry;
      if (driver.entryU) uTurn(ax + dx * e, az + dz * e, driver.pdx, driver.pdz, 0.5 + 0.5 * s / e);
      else bezier(ax - driver.pdx * e, az - driver.pdz * e, ax, az, ax + dx * e, az + dz * e, 0.5 + 0.5 * s / e);
    } else if (radius > 0 && s > driver.length - radius && driver.next >= 0) {
      const nx = (this.nodeX(driver.next) - bx) / driver.nextLength, nz = (this.nodeZ(driver.next) - bz) / driver.nextLength;
      if (this.turnAngle(driver) > 2.6) uTurn(bx - dx * radius, bz - dz * radius, dx, dz, 0.5 * (s - (driver.length - radius)) / radius);
      else bezier(bx - dx * radius, bz - dz * radius, bx, bz, bx + nx * radius, bz + nz * radius, 0.5 * (s - (driver.length - radius)) / radius);
    } else {
      x = ax + dx * s; z = az + dz * s;
    }
    const t = Math.hypot(tx, tz) || 1;
    tx /= t; tz /= t;
    // Décalage sur la voie, perpendiculaire à la tangente.
    car.setPose(laned ? x! : x! - tz * driver.lane, laned ? z! : z! + tx * driver.lane, Math.atan2(tx, tz));
    car.settle(ground);
  }
}
