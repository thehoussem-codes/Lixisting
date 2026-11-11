import * as THREE from 'three';
import { MeshBuilder } from './MeshBuilder';

export interface TreeData { pine: number[]; palm: number[] }

const CHUNK = 400;
const TRUNK = new THREE.Color(0x6b4f35);
const PINE = [new THREE.Color(0x2f6b34), new THREE.Color(0x3d7a3a), new THREE.Color(0x4a8040)];
const PALM = [new THREE.Color(0x3f8a3c), new THREE.Color(0x56963f)];

export async function loadTrees(): Promise<TreeData> {
  const response = await fetch(`${import.meta.env.BASE_URL}world/trees.json`);
  if (!response.ok) throw new Error(`Arbres introuvables (${response.status})`);
  return (await response.json()) as TreeData;
}

/** Tronc : prisme à 4 faces. */
function trunk(b: MeshBuilder, x: number, y: number, z: number, radius: number, height: number): void {
  const base = [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2;
    return [x + Math.cos(a) * radius, z + Math.sin(a) * radius];
  });
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = base[i], [x2, z2] = base[(i + 1) % 4];
    const v0 = b.vertex(x1, y - 0.5, z1, TRUNK, 0.8), v1 = b.vertex(x2, y - 0.5, z2, TRUNK, 0.8);
    const v2 = b.vertex(x2, y + height, z2, TRUNK), v3 = b.vertex(x1, y + height, z1, TRUNK);
    b.triangle(v0, v1, v2); b.triangle(v0, v2, v3);
  }
}

/** Pin parasol : tronc + houppier large et aplati (double pyramide à 6 côtés). */
function pine(b: MeshBuilder, x: number, y: number, z: number, s: number, color: THREE.Color): void {
  trunk(b, x, y, z, 0.22 * s, 4.2 * s);
  const mid = y + 4.6 * s, r = 3.0 * s;
  const top = b.vertex(x, mid + 1.9 * s, z, color, 1.1), bottom = b.vertex(x, mid - 0.9 * s, z, color, 0.6);
  const ring: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ring.push(b.vertex(x + Math.cos(a) * r, mid, z + Math.sin(a) * r, color, 0.85));
  }
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    b.triangle(top, ring[j], ring[i]);
    b.triangle(bottom, ring[i], ring[j]);
  }
}

/** Palmier : tronc fin et haut + 7 palmes qui retombent. */
function palm(b: MeshBuilder, x: number, y: number, z: number, s: number, color: THREE.Color): void {
  const height = 7.5 * s;
  trunk(b, x, y, z, 0.16 * s, height);
  const cy = y + height;
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7, w = 0.32;
    const tipX = x + Math.cos(a) * 3.2 * s, tipZ = z + Math.sin(a) * 3.2 * s;
    const lx = x + Math.cos(a - w) * 1.6 * s, lz = z + Math.sin(a - w) * 1.6 * s;
    const rx = x + Math.cos(a + w) * 1.6 * s, rz = z + Math.sin(a + w) * 1.6 * s;
    const c = b.vertex(x, cy + 0.2 * s, z, color), l = b.vertex(lx, cy + 0.7 * s, lz, color);
    const r = b.vertex(rx, cy + 0.7 * s, rz, color), tip = b.vertex(tipX, cy - 1.2 * s, tipZ, color, 0.75);
    b.triangle(c, l, r); b.triangle(l, tip, r);
  }
}

/** Ajoute tous les arbres à la scène, regroupés par blocs de 400 m. */
export function buildTrees(scene: THREE.Scene, data: TreeData, ground: (x: number, z: number) => number): number {
  const chunks = new Map<string, MeshBuilder>();
  const builderAt = (x: number, n: number): MeshBuilder => {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(n / CHUNK)}`;
    let builder = chunks.get(key);
    if (!builder) { builder = new MeshBuilder(); chunks.set(key, builder); }
    return builder;
  };
  for (let i = 0; i < data.pine.length; i += 3) {
    const x = data.pine[i], n = data.pine[i + 1];
    pine(builderAt(x, n), x, ground(x, -n), -n, data.pine[i + 2], PINE[(i / 3) % PINE.length]);
  }
  for (let i = 0; i < data.palm.length; i += 3) {
    const x = data.palm[i], n = data.palm[i + 1];
    palm(builderAt(x, n), x, ground(x, -n), -n, data.palm[i + 2], PALM[(i / 3) % PALM.length]);
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const builder of chunks.values()) scene.add(new THREE.Mesh(builder.build(), material));
  return (data.pine.length + data.palm.length) / 3;
}
