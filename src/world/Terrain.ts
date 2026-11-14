import * as THREE from 'three';
import { createGroundTexture } from './Textures';

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
    this.colors = colors;
    this.indices = indices;
    this.index();

    const geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: createGroundTexture() }));
    this.rebuild();
  }

  private colors: Float32Array;

  /** Range chaque triangle dans les cases de 30 m qu'il recouvre (recherche rapide de la hauteur). */
  private index(): void {
    const positions = this.positions, indices = this.indices;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
      const ax = positions[a], az = positions[a + 2], bx = positions[b], bz = positions[b + 2], cx = positions[c], cz = positions[c + 2];
      if (Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) < 0.01) continue; // murs verticaux de la côte
      const c0 = this.cellX(Math.min(ax, bx, cx)), c1 = this.cellX(Math.max(ax, bx, cx));
      const r0 = this.cellY(Math.max(az, bz, cz)), r1 = this.cellY(Math.min(az, bz, cz));
      for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) this.cells[r * this.cols + col].push(t);
    }
  }

  private rebuild(): void {
    const positions = this.positions;
    const geometry = this.mesh.geometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    // Coordonnées de texture tirées de la position : un motif de sol tous les 14 m, partout.
    const uv = new Float32Array((positions.length / 3) * 2);
    for (let i = 0; i < positions.length / 3; i++) { uv[i * 2] = positions[i * 3] / 14; uv[i * 2 + 1] = positions[i * 3 + 2] / 14; }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));
    geometry.deleteAttribute('normal'); // sinon three réutilise l'ancien tableau, trop court après un découpage
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  /**
   * Perce le terrain selon un polygone CONVEXE (x, n), pour un niveau en contrebas (passage souterrain…).
   * Les triangles coupés sont découpés exactement au bord du polygone ; à l'intérieur, la hauteur renvoyée
   * devient celle du fond marin : l'appelant fournit lui-même le sol de la fosse.
   */
  cutHole(polygon: [number, number][]): void {
    // Demi-plans « intérieur » du polygone, sens trigonométrique imposé.
    let area = 0;
    for (let i = 0; i < polygon.length; i++) { const [ax, an] = polygon[i], [bx, bn] = polygon[(i + 1) % polygon.length]; area += ax * bn - bx * an; }
    const ring = area > 0 ? polygon : [...polygon].reverse();
    // En coordonnées (x, z) du monde : z = -n inverse le sens, on teste donc « à droite » de chaque arête.
    const edges = ring.map(([ax, an], i) => { const [bx, bn] = ring[(i + 1) % ring.length]; return [ax, -an, bx, -bn]; });
    const side = (e: number[], x: number, z: number) => (e[2] - e[0]) * (z - e[1]) - (e[3] - e[1]) * (x - e[0]); // < 0 : intérieur
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, n] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, -n); maxZ = Math.max(maxZ, -n); }
    type P = [number, number];
    const clip = (poly: P[], e: number[], keepInside: boolean): P[] => {
      const out: P[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const sa = side(e, a[0], a[1]) * (keepInside ? 1 : -1), sb = side(e, b[0], b[1]) * (keepInside ? 1 : -1);
        if (sa <= 0) out.push(a);
        if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      return out;
    };
    const p = this.positions, c = this.colors, idx = this.indices;
    const newPos: number[] = [], newCol: number[] = [], keep: number[] = [];
    let next = p.length / 3;
    for (let t = 0; t < idx.length; t += 3) {
      const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
      const xs = [p[ia * 3], p[ib * 3], p[ic * 3]], zs = [p[ia * 3 + 2], p[ib * 3 + 2], p[ic * 3 + 2]];
      if (Math.max(...xs) <= minX || Math.min(...xs) >= maxX || Math.max(...zs) <= minZ || Math.min(...zs) >= maxZ) { keep.push(ia, ib, ic); continue; }
      const det = (xs[1] - xs[0]) * (zs[2] - zs[0]) - (xs[2] - xs[0]) * (zs[1] - zs[0]);
      if (Math.abs(det) < 1e-6) { keep.push(ia, ib, ic); continue; } // mur vertical de la côte
      // Morceaux du triangle hors du polygone : hors de l'arête i, mais dans les arêtes 0..i-1 (morceaux disjoints).
      const pieces: P[][] = [];
      for (let i = 0; i < edges.length; i++) {
        let poly: P[] = [[xs[0], zs[0]], [xs[1], zs[1]], [xs[2], zs[2]]];
        poly = clip(poly, edges[i], false);
        for (let j = 0; j < i && poly.length >= 3; j++) poly = clip(poly, edges[j], true);
        if (poly.length >= 3) pieces.push(poly);
      }
      const whole = pieces.length === 1 && pieces[0].length === 3 &&
        pieces[0].every(([x, z]) => xs.some((vx, k) => Math.abs(vx - x) < 1e-6 && Math.abs(zs[k] - z) < 1e-6));
      if (whole) { keep.push(ia, ib, ic); continue; }
      for (const poly of pieces) {
        const ids = poly.map(([x, z]) => {
          const u = ((x - xs[0]) * (zs[2] - zs[0]) - (xs[2] - xs[0]) * (z - zs[0])) / det;
          const v = ((xs[1] - xs[0]) * (z - zs[0]) - (x - xs[0]) * (zs[1] - zs[0])) / det;
          const w = 1 - u - v;
          newPos.push(x, w * p[ia * 3 + 1] + u * p[ib * 3 + 1] + v * p[ic * 3 + 1], z);
          for (let k = 0; k < 3; k++) newCol.push(w * c[ia * 3 + k] + u * c[ib * 3 + k] + v * c[ic * 3 + k]);
          return next++;
        });
        // Le découpage garde l'ordre des sommets : même sens de rotation que le triangle d'origine.
        for (let k = 1; k < ids.length - 1; k++) keep.push(ids[0], ids[k], ids[k + 1]);
      }
    }
    const positions = new Float32Array(p.length + newPos.length); positions.set(p); positions.set(newPos, p.length);
    const colors = new Float32Array(c.length + newCol.length); colors.set(c); colors.set(newCol, c.length);
    this.positions = positions; this.colors = colors; this.indices = new Uint32Array(keep);
    this.index();
    this.rebuild();
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
