/**
 * Collisions simples avec les bâtiments, vues du dessus :
 * "ce point est-il à l'intérieur d'une empreinte de bâtiment ?"
 * Les bâtiments sont rangés dans une grille pour ne tester que les voisins.
 */
const CELL = 40;

interface Footprint { minX: number; maxX: number; minZ: number; maxZ: number; points: Float32Array }

export class Collider {
  private grid = new Map<string, Footprint[]>();

  /** points : x, n, x, n... (comme dans le fichier de carte). */
  addBuilding(points: number[]): void {
    const count = points.length / 2;
    const xz = new Float32Array(points.length);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = points[i * 2], z = -points[i * 2 + 1];
      xz[i * 2] = x; xz[i * 2 + 1] = z;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const footprint: Footprint = { minX, maxX, minZ, maxZ, points: xz };
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const key = `${cx},${cz}`;
        const cell = this.grid.get(key);
        if (cell) cell.push(footprint); else this.grid.set(key, [footprint]);
      }
    }
  }

  inside(x: number, z: number): boolean {
    const cell = this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!cell) return false;
    for (const f of cell) {
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      const p = f.points;
      let hit = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        if ((p[i + 1] > z) !== (p[j + 1] > z) &&
            x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) hit = !hit;
      }
      if (hit) return true;
    }
    return false;
  }

  /** Un disque (le joueur) touche-t-il un bâtiment ? */
  blocked(x: number, z: number, radius: number): boolean {
    return this.inside(x, z) || this.inside(x + radius, z) || this.inside(x - radius, z) ||
           this.inside(x, z + radius) || this.inside(x, z - radius);
  }
}
