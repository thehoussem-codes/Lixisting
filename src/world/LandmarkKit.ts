import * as THREE from 'three';
import { MeshBuilder } from './MeshBuilder';
import type { WorldData } from './WorldData';

/** Outils partagés par les bâtiments et lieux modélisés à la main (Landmarks, Sous-Terrain, abords du Sheraton). */

export type Ground = (x: number, z: number) => number;
export type Ring = [number, number][]; // [x, n] ; n = nord (z = -n)

export function ringOf(p: number[]): Ring {
  const out: Ring = [];
  for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]);
  return out;
}

export function centroid(ring: Ring): [number, number] {
  let x = 0, n = 0;
  for (const [a, b] of ring) { x += a / ring.length; n += b / ring.length; }
  return [x, n];
}

export function findFootprint(data: WorldData, x: number, n: number): Ring | null {
  for (const b of data.buildings) {
    const ring = ringOf(b.p), [cx, cn] = centroid(ring);
    if (Math.hypot(cx - x, cn - n) < 4) return ring;
  }
  return null;
}

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  draw(element.getContext('2d')!);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Extrusion d'un contour, avec un renflement optionnel (scale(t), t = 0 en bas, 1 en haut) et des UV en mètres. */
export function extrude(b: MeshBuilder, ring: Ring, y0: number, y1: number, color: THREE.Color, tile: number, scale = (_t: number) => 1, rings = 1): void {
  const [cx, cn] = centroid(ring);
  let perimeter = 0;
  const along = [0];
  for (let i = 0; i < ring.length; i++) {
    const [ax, an] = ring[i], [bx, bn] = ring[(i + 1) % ring.length];
    perimeter += Math.hypot(bx - ax, bn - an); along.push(perimeter);
  }
  for (let r = 0; r < rings; r++) {
    const t0 = r / rings, t1 = (r + 1) / rings;
    const ya = y0 + (y1 - y0) * t0, yb = y0 + (y1 - y0) * t1, sa = scale(t0), sb = scale(t1);
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      const p = (k: number, s: number) => [cx + (ring[k][0] - cx) * s, -(cn + (ring[k][1] - cn) * s)];
      const [ax, az] = p(i, sa), [bx, bz] = p(j, sa), [cx2, cz2] = p(j, sb), [dx, dz] = p(i, sb);
      const ua = along[i] / tile, ub = along[i + 1] / tile;
      const v0 = b.vertex(ax, ya, az, color, 1, ua, ya / tile), v1 = b.vertex(bx, ya, bz, color, 1, ub, ya / tile);
      const v2 = b.vertex(cx2, yb, cz2, color, 1, ub, yb / tile), v3 = b.vertex(dx, yb, dz, color, 1, ua, yb / tile);
      b.triangle(v0, v1, v2); b.triangle(v0, v2, v3);
    }
  }
}

/** Dalle horizontale sur un contour (triangulée), à l'échelle s autour du centre. */
export function cap(b: MeshBuilder, ring: Ring, y: number, color: THREE.Color, s = 1, up = true): void {
  const [cx, cn] = centroid(ring);
  const pts = ring.map(([x, n]) => new THREE.Vector2(cx + (x - cx) * s, cn + (n - cn) * s));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const ids = pts.map((p) => b.vertex(p.x, y, -p.y, color, 1, p.x / 4, p.y / 4));
  for (const [a, c, d] of tris) up ? b.triangle(ids[a], ids[d], ids[c]) : b.triangle(ids[a], ids[c], ids[d]);
}

export function boxAt(b: MeshBuilder, x: number, z: number, w: number, d: number, y0: number, y1: number, color: THREE.Color, angle = 0): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  const corner = (u: number, v: number): [number, number] => [x + u * c - v * s, z + u * s + v * c];
  const pts = [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4];
    const v0 = b.vertex(ax, y0, az, color, 0.85), v1 = b.vertex(bx, y0, bz, color, 0.85), v2 = b.vertex(bx, y1, bz, color), v3 = b.vertex(ax, y1, az, color);
    b.triangle(v0, v2, v1); b.triangle(v0, v3, v2);
  }
  const t = pts.map(([px, pz]) => b.vertex(px, y1, pz, color));
  b.triangle(t[0], t[2], t[1]); b.triangle(t[0], t[3], t[2]);
}

export function lowestGround(ring: Ring, ground: Ground): number {
  return Math.min(...ring.map(([x, n]) => ground(x, -n)));
}

