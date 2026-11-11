import * as THREE from 'three';

/** Profondeur du fond marin au large (même valeur que dans tools/build_terrain.py). */
export const SEA_FLOOR = -2.6;

/**
 * Terrain en relief, lu depuis public/world/terrain.bin (produit par tools/build_terrain.py).
 * Il fournit le maillage à afficher et la hauteur du sol en n'importe quel point.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  private grid: Float32Array;
  private cols: number; private rows: number;
  private x0: number; private n0: number; private step: number;
  private positions: Float32Array;
  private indices: Uint32Array;
  /** Pour chaque case de 30 m : les triangles qui la recouvrent (recherche rapide de la hauteur). */
  private cells: number[][] = [];

  constructor(buffer: ArrayBuffer) {
    const header = new Uint32Array(buffer, 0, 5);
    if (header[0] !== 0x4c495831) throw new Error('Fichier de terrain invalide');
    const vertexCount = header[1], indexCount = header[2];
    this.cols = header[3]; this.rows = header[4];
    const origin = new Float32Array(buffer, 20, 3);
    this.x0 = origin[0]; this.n0 = origin[1]; this.step = origin[2];

    let offset = 32;
    this.grid = new Float32Array(buffer, offset, this.cols * this.rows);
    offset += this.grid.byteLength;
    const positions = new Float32Array(buffer, offset, vertexCount * 3);
    offset += positions.byteLength;
    const colors = new Float32Array(buffer, offset, vertexCount * 3);
    offset += colors.byteLength;
    const indices = new Uint32Array(buffer, offset, indexCount);

    this.positions = positions;
    this.indices = indices;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    for (let t = 0; t < indexCount; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
      const ax = positions[a], az = positions[a + 2], bx = positions[b], bz = positions[b + 2], cx = positions[c], cz = positions[c + 2];
      if (Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) < 0.01) continue; // murs verticaux de la côte
      const c0 = this.cellX(Math.min(ax, bx, cx)), c1 = this.cellX(Math.max(ax, bx, cx));
      const r0 = this.cellY(Math.max(az, bz, cz)), r1 = this.cellY(Math.min(az, bz, cz));
      for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) this.cells[r * this.cols + col].push(t);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  }

  private cellX(x: number): number {
    return Math.min(Math.max(Math.floor((x - this.x0) / this.step), 0), this.cols - 1);
  }

  private cellY(z: number): number {
    return Math.min(Math.max(Math.floor((-z - this.n0) / this.step), 0), this.rows - 1);
  }

  /**
   * Hauteur du sol (mètres) au point x, z du monde : exactement celle du triangle
   * affiché à cet endroit, pour que routes, bâtiments et joueur touchent le sol.
   */
  heightAt = (x: number, z: number): number => {
    const p = this.positions, idx = this.indices;
    for (const t of this.cells[this.cellY(z) * this.cols + this.cellX(x)]) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const v0x = p[b] - p[a], v0z = p[b + 2] - p[a + 2], v1x = p[c] - p[a], v1z = p[c + 2] - p[a + 2];
      const px = x - p[a], pz = z - p[a + 2];
      const det = v0x * v1z - v1x * v0z;
      const u = (px * v1z - v1x * pz) / det, v = (v0x * pz - px * v0z) / det;
      if (u >= -1e-4 && v >= -1e-4 && u + v <= 1.0001) return p[a + 1] + u * (p[b + 1] - p[a + 1]) + v * (p[c + 1] - p[a + 1]);
    }
    return SEA_FLOOR; // hors de la terre ferme : le fond marin
  };

  /** Altitude brute de la grille à 30 m (conservée pour des usages futurs). */
  gridHeight(x: number, z: number): number {
    const fx = Math.min(Math.max((x - this.x0) / this.step, 0), this.cols - 1.001);
    const fy = Math.min(Math.max((-z - this.n0) / this.step, 0), this.rows - 1.001);
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const ax = fx - ix, ay = fy - iy;
    const i = iy * this.cols + ix;
    const g = this.grid;
    return (g[i] * (1 - ax) + g[i + 1] * ax) * (1 - ay) + (g[i + this.cols] * (1 - ax) + g[i + this.cols + 1] * ax) * ay;
  }
}

export async function loadTerrain(): Promise<Terrain> {
  const response = await fetch(`${import.meta.env.BASE_URL}world/terrain.bin?v=${__BUILD_ID__}`);
  if (!response.ok) throw new Error(`Terrain introuvable (${response.status})`);
  return new Terrain(await response.arrayBuffer());
}
