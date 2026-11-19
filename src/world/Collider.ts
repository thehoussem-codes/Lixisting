/**
 * Collisions simples avec les bâtiments, vues du dessus :
 * "ce point est-il à l'intérieur d'une empreinte de bâtiment ?"
 * Les bâtiments sont rangés dans une grille pour ne tester que les voisins.
 */
const CELL = 40;

/**
 * Toit d'un bâtiment : plat (hauteur y) ou à pentes, avec un faîtage au point apex (x, z, hauteur).
 * Un bâtiment qui a un toit ne bloque que sous son toit : au-dessus, on peut y atterrir et marcher.
 */
export interface Roof { y: number; apex?: [number, number, number] }

interface Footprint { minX: number; maxX: number; minZ: number; maxZ: number; points: Float32Array; yMin: number; yMax: number; roof?: Roof }

const TRUNK_CELL = 8;

export class Collider {
  private grid = new Map<string, Footprint[]>();
  /** Troncs d'arbres (les buissons ne bloquent pas) : par case de 8 m, x, z, rayon, hauteur du haut du tronc. */
  private trunks = new Map<number, number[]>();
  /** Nombre de troncs enregistrés (essais). */
  trunkCount = 0;

  private static trunkKey(x: number, z: number): number {
    return (Math.floor(x / TRUNK_CELL) + 50000) * 100003 + (Math.floor(z / TRUNK_CELL) + 50000);
  }

  /** Tronc d'arbre : bloque le joueur et les voitures dans un rayon r, du sol jusqu'à `top`. */
  addTrunk(x: number, z: number, r: number, top: number): void {
    const key = Collider.trunkKey(x, z);
    const list = this.trunks.get(key);
    if (list) list.push(x, z, r, top); else this.trunks.set(key, [x, z, r, top]);
    this.trunkCount++;
  }

  /** Un disque de rayon `radius` à la hauteur y touche-t-il un tronc ? */
  hitsTrunk(x: number, z: number, radius: number, y?: number): boolean {
    const reach = radius + 0.6;
    for (let i = Math.floor((x - reach) / TRUNK_CELL); i <= Math.floor((x + reach) / TRUNK_CELL); i++) {
      for (let j = Math.floor((z - reach) / TRUNK_CELL); j <= Math.floor((z + reach) / TRUNK_CELL); j++) {
        const list = this.trunks.get((i + 50000) * 100003 + (j + 50000));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 4) {
          if (y !== undefined && y > list[k + 3]) continue;
          const dx = x - list[k], dz = z - list[k + 1], r = radius + list[k + 2];
          if (dx * dx + dz * dz < r * r) return true;
        }
      }
    }
    return false;
  }

  /** Troncs proches d'un point (x, z, rayon, haut du tronc à la suite), pour les voitures. */
  trunksNear(x: number, z: number, reach: number): number[] {
    const out: number[] = [];
    for (let i = Math.floor((x - reach) / TRUNK_CELL); i <= Math.floor((x + reach) / TRUNK_CELL); i++) {
      for (let j = Math.floor((z - reach) / TRUNK_CELL); j <= Math.floor((z + reach) / TRUNK_CELL); j++) {
        const list = this.trunks.get((i + 50000) * 100003 + (j + 50000));
        if (list) out.push(...list);
      }
    }
    return out;
  }

  /**
   * points : x, n, x, n... (comme dans le fichier de carte).
   * yMin / yMax (facultatifs) : l'obstacle ne bloque qu'entre ces hauteurs, pour les lieux à deux niveaux
   * (galerie sous une esplanade). Sans hauteur précisée par l'appelant, tous les obstacles comptent.
   */
  addBuilding(points: number[], yMin = -Infinity, yMax = Infinity, roof?: Roof): void {
    const count = points.length / 2;
    const xz = new Float32Array(points.length);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = points[i * 2], z = -points[i * 2 + 1];
      xz[i * 2] = x; xz[i * 2 + 1] = z;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const footprint: Footprint = { minX, maxX, minZ, maxZ, points: xz, yMin, yMax, roof };
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const key = `${cx},${cz}`;
        const cell = this.grid.get(key);
        if (cell) cell.push(footprint); else this.grid.set(key, [footprint]);
      }
    }
  }

  inside(x: number, z: number, y?: number): boolean {
    const cell = this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!cell) return false;
    for (const f of cell) {
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      if (y !== undefined && (y < f.yMin || y > f.yMax)) continue;
      if (!Collider.contains(f, x, z)) continue;
      // Au-dessus du toit : le bâtiment ne bloque plus (on passe par-dessus, on se pose dessus).
      if (y !== undefined && f.roof && y >= Collider.roofHeight(f, x, z)) continue;
      return true;
    }
    return false;
  }

  /**
   * Toit le plus haut sous le point x, z qui ne dépasse pas `reach` (hauteur des pieds + marche franchissable).
   * Renvoie -Infinity s'il n'y en a pas : le sol est alors le terrain.
   */
  roofAt(x: number, z: number, reach: number): number {
    const cell = this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!cell) return -Infinity;
    let best = -Infinity;
    for (const f of cell) {
      if (!f.roof || x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      if (!Collider.contains(f, x, z)) continue;
      const h = Collider.roofHeight(f, x, z);
      if (h <= reach && h > best) best = h;
    }
    return best;
  }

  private static contains(f: Footprint, x: number, z: number): boolean {
    const p = f.points;
    let hit = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if ((p[i + 1] > z) !== (p[j + 1] > z) &&
          x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) hit = !hit;
    }
    return hit;
  }

  /** Hauteur du toit en x, z : plat, ou interpolée dans le pan (triangle mur–faîtage) qui contient le point. */
  private static roofHeight(f: Footprint, x: number, z: number): number {
    const roof = f.roof!;
    if (!roof.apex) return roof.y;
    const [ax, az, ay] = roof.apex, p = f.points;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const bx = p[j], bz = p[j + 1], cx = p[i], cz = p[i + 1];
      const v0x = bx - ax, v0z = bz - az, v1x = cx - ax, v1z = cz - az, px = x - ax, pz = z - az;
      const det = v0x * v1z - v1x * v0z;
      if (Math.abs(det) < 1e-6) continue;
      const u = (px * v1z - v1x * pz) / det, v = (v0x * pz - px * v0z) / det;
      if (u >= -1e-3 && v >= -1e-3 && u + v <= 1.001) return ay + (u + v) * (roof.y - ay);
    }
    return roof.y;
  }

  /** Un disque (le joueur) touche-t-il un bâtiment ou un tronc d'arbre ? */
  blocked(x: number, z: number, radius: number, y?: number): boolean {
    return this.inside(x, z, y) || this.inside(x + radius, z, y) || this.inside(x - radius, z, y) ||
           this.inside(x, z + radius, y) || this.inside(x, z - radius, y) || this.hitsTrunk(x, z, radius, y);
  }
}
