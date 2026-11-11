import type { WorldData } from '../world/WorldData';
import { Car } from './Car';

const COUNT = 24;            // voitures en circulation autour du joueur
const CELL = 200;            // taille des cases servant à trouver des rues proches (m)
const SPAWN_MIN = 110;       // elles apparaissent assez loin pour ne pas surgir sous nos yeux
const DESPAWN = 480;
const LANE_OFFSET = 1.7;     // on roule à droite de l'axe de la rue
const COLORS = [0xf2f2f2, 0xd9d9d9, 0x9aa0a6, 0x2c3e50, 0x1b1b1b, 0xb03a2e, 0x1f618d, 0xd4ac0d, 0x7d6608, 0x196f3d];

interface Edge { to: number; fast: boolean }
interface Driver { car: Car; from: number; to: number; travelled: number; length: number; cruise: number }

/** Un point devant lequel une voiture doit s'arrêter (joueur, autre véhicule). */
export interface Obstacle { x: number; z: number }

/**
 * Circulation automatique : des voitures suivent le vrai réseau de rues,
 * respectent les sens uniques, et freinent quand quelque chose est devant elles.
 */
export class Traffic {
  readonly cars: Car[] = [];
  private drivers: Driver[] = [];
  private nodes: number[];
  private out: Edge[][] = [];
  private cells = new Map<string, number[]>();
  private seed = 12345;

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

  private startEdge(driver: Driver, from: number, previous: number): boolean {
    const options = this.out[from];
    if (options.length === 0) return false;
    // On évite le demi-tour, sauf en impasse.
    const forward = options.filter((o) => o.to !== previous);
    const pool = forward.length > 0 ? forward : options;
    const edge = pool[Math.floor(this.random() * pool.length)];
    driver.from = from;
    driver.to = edge.to;
    driver.travelled = 0;
    driver.length = Math.hypot(this.nodeX(edge.to) - this.nodeX(from), this.nodeZ(edge.to) - this.nodeZ(from));
    driver.cruise = (edge.fast ? 14 : 8.5) * (0.85 + this.random() * 0.3);
    return driver.length > 0.01;
  }

  private respawn(driver: Driver, px: number, pz: number): boolean {
    const node = this.pickSpawn(px, pz);
    if (node < 0 || !this.startEdge(driver, node, -1)) return false;
    const heading = Math.atan2(this.nodeX(driver.to) - this.nodeX(node), this.nodeZ(driver.to) - this.nodeZ(node));
    driver.car.speed = driver.cruise;
    driver.car.setPose(this.nodeX(node), this.nodeZ(node), heading);
    driver.car.object.visible = true;
    return true;
  }

  /** Le joueur prend cette voiture : elle sort de la circulation. */
  release(car: Car): void {
    this.drivers = this.drivers.filter((d) => d.car !== car);
    const index = this.cars.indexOf(car);
    if (index >= 0) this.cars.splice(index, 1);
  }

  update(dt: number, px: number, pz: number, obstacles: Obstacle[], ground: (x: number, z: number) => number): void {
    // On complète peu à peu l'effectif (une tentative par image, pour ne pas ralentir le jeu).
    if (this.drivers.length < COUNT) {
      const car = new Car(COLORS[Math.floor(this.random() * COLORS.length)]);
      const driver: Driver = { car, from: 0, to: 0, travelled: 0, length: 1, cruise: 8 };
      if (this.respawn(driver, px, pz)) {
        this.drivers.push(driver);
        this.cars.push(car);
        this.addToScene(car);
      }
    }

    for (const driver of this.drivers) {
      const car = driver.car;
      const position = car.object.position;
      if (Math.hypot(position.x - px, position.z - pz) > DESPAWN) {
        if (!this.respawn(driver, px, pz)) { car.object.visible = false; continue; }
      }
      if (!car.object.visible) continue;

      const ax = this.nodeX(driver.from), az = this.nodeZ(driver.from);
      const dx = (this.nodeX(driver.to) - ax) / driver.length, dz = (this.nodeZ(driver.to) - az) / driver.length;

      // Quelque chose devant, à moins de 10 m et à peu près dans l'axe ? On freine.
      let target = driver.cruise;
      const check = (ox: number, oz: number) => {
        const rx = ox - position.x, rz = oz - position.z;
        const ahead = rx * dx + rz * dz;
        if (ahead > 0.5 && ahead < 10 && Math.abs(-rx * dz + rz * dx) < 2.2) target = 0;
      };
      for (const o of obstacles) check(o.x, o.z);
      for (const other of this.drivers) if (other !== driver && other.car.object.visible) check(other.car.object.position.x, other.car.object.position.z);

      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), (target < car.speed ? 14 : 4) * dt);
      if (car.speed < 0) car.speed = 0;
      driver.travelled += car.speed * dt;
      if (driver.travelled >= driver.length) {
        const extra = driver.travelled - driver.length;
        if (!this.startEdge(driver, driver.to, driver.from)) { car.object.visible = false; continue; }
        driver.travelled = Math.min(extra, driver.length);
        continue; // la position sera mise à jour à l'image suivante, sur le nouveau tronçon
      }

      // Position : sur le tronçon, décalée à droite ; la direction tourne en douceur.
      let diff = Math.atan2(dx, dz) - car.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const heading = car.heading + diff * Math.min(1, 5 * dt);
      car.setPose(ax + dx * driver.travelled - dz * LANE_OFFSET, az + dz * driver.travelled + dx * LANE_OFFSET, heading);
      car.settle(ground);
    }
  }
}
