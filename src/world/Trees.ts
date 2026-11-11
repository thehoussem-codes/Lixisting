import * as THREE from 'three';
import { MeshBuilder } from './MeshBuilder';

/** Pour chaque espèce : x, n, taille, x, n, taille... (produit par tools/build_terrain.py). */
export type TreeData = Record<string, number[]>;

const CHUNK = 200;          // regroupement par blocs de 200 m
const VIEW_DISTANCE = 520;  // au-delà, la végétation d'un bloc n'est plus affichée

const BARK = new THREE.Color(0x6b4f35), PALM_BARK = new THREE.Color(0x8a745a);
const GREENS: Record<string, THREE.Color[]> = {
  pine: [0x2f6b34, 0x3d7a3a, 0x4a8040, 0x356f45].map((c) => new THREE.Color(c)),
  palm: [0x3f8a3c, 0x56963f, 0x4b8f47].map((c) => new THREE.Color(c)),
  ficus: [0x1f5a2a, 0x2a6a31, 0x256133, 0x33703a].map((c) => new THREE.Color(c)),
  cypress: [0x1d4a2a, 0x24552f, 0x1a4326].map((c) => new THREE.Color(c)),
  bush: [0x4f7f3a, 0x5d8a44, 0x6b8f4a, 0x44733a, 0x7a9450].map((c) => new THREE.Color(c)),
};
const FLOWER = new THREE.Color(0xd9588a); // laurier-rose

export async function loadTrees(): Promise<TreeData> {
  const response = await fetch(`${import.meta.env.BASE_URL}world/trees.json?v=${__BUILD_ID__}`);
  if (!response.ok) throw new Error(`Végétation introuvable (${response.status})`);
  return (await response.json()) as TreeData;
}

/** Nombre pseudo-aléatoire stable (0 à 1) pour la plante n° i : même arbre à chaque chargement. */
function noise(i: number, salt: number): number {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Tronc effilé en plusieurs tronçons, qui peut pencher. Renvoie la position du sommet. */
function trunk(b: MeshBuilder, x: number, y: number, z: number, radius: number, height: number, leanX: number, leanZ: number,
               sides: number, color: THREE.Color): [number, number, number] {
  const SEGMENTS = 3;
  let previous: number[] = [];
  for (let s = 0; s <= SEGMENTS; s++) {
    const t = s / SEGMENTS, r = radius * (1 - 0.45 * t);
    const cx = x + leanX * t * t, cz = z + leanZ * t * t, cy = y - 0.4 + (height + 0.4) * t;
    const ring: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      ring.push(b.vertex(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r, color, 0.7 + 0.3 * t));
    }
    if (s > 0) {
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        b.triangle(previous[i], previous[j], ring[j]);
        b.triangle(previous[i], ring[j], ring[i]);
      }
    }
    previous = ring;
  }
  return [x + leanX, y + height, z + leanZ];
}

/** Masse de feuillage arrondie (ellipsoïde à facettes lissées), plus sombre en dessous. */
function blob(b: MeshBuilder, x: number, y: number, z: number, rx: number, ry: number, rz: number,
              segments: number, rings: number, color: THREE.Color, topColor = color): void {
  const rows: number[][] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI, sin = Math.sin(phi), cos = Math.cos(phi);
    const row: number[] = [];
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2 + r * 0.4;
      row.push(b.vertex(x + Math.cos(a) * sin * rx, y - cos * ry, z + Math.sin(a) * sin * rz, r > rings * 0.6 ? topColor : color, 0.55 + 0.55 * (r / rings)));
    }
    rows.push(row);
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const t = (s + 1) % segments;
      b.triangle(rows[r][s], rows[r][t], rows[r + 1][t]);
      b.triangle(rows[r][s], rows[r + 1][t], rows[r + 1][s]);
    }
  }
}

/** Pin d'Alep / pin parasol : tronc penché, houppier irrégulier fait de 3 masses aplaties. */
function pine(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = GREENS.pine[i % GREENS.pine.length];
  const height = (4 + noise(i, 1) * 2.5) * s;
  const [tx, ty, tz] = trunk(b, x, y, z, 0.24 * s, height, (noise(i, 2) - 0.5) * 1.6 * s, (noise(i, 3) - 0.5) * 1.6 * s, 5, BARK);
  const spread = (2.4 + noise(i, 4) * 1.2) * s;
  blob(b, tx, ty + 0.5 * s, tz, spread, 1.1 * s, spread, 7, 3, color);
  for (let k = 0; k < 2; k++) {
    const a = noise(i, 5 + k) * Math.PI * 2, d = spread * 0.55;
    blob(b, tx + Math.cos(a) * d, ty + (0.1 + noise(i, 7 + k) * 0.7) * s, tz + Math.sin(a) * d, spread * 0.62, 0.85 * s, spread * 0.62, 6, 3, color);
  }
}

/** Palmier : stipe élancé légèrement courbé, couronne de palmes arquées qui retombent. */
function palm(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = GREENS.palm[i % GREENS.palm.length];
  const height = (6.5 + noise(i, 1) * 3.5) * s;
  const [tx, ty, tz] = trunk(b, x, y, z, 0.2 * s, height, (noise(i, 2) - 0.5) * 1.2 * s, (noise(i, 3) - 0.5) * 1.2 * s, 6, PALM_BARK);
  blob(b, tx, ty - 0.1 * s, tz, 0.42 * s, 0.5 * s, 0.42 * s, 6, 2, PALM_BARK); // base de la couronne
  const FRONDS = 11, length = (3 + noise(i, 4) * 0.9) * s;
  for (let f = 0; f < FRONDS; f++) {
    const a = (f / FRONDS) * Math.PI * 2 + noise(i, 9) * 6, lift = 0.25 + noise(i * 13 + f, 5) * 0.75; // certaines dressées, d'autres basses
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    // Trois points le long de la palme : départ, sommet de l'arc, pointe retombante.
    const points = [[0, 0.15 * s, 0.05 * s], [0.5, (0.5 + lift) * s, 0.34 * s], [1, (lift * 1.3 - 1.25) * s, 0.04 * s]];
    let previous: number[] = [];
    points.forEach(([t, h, w], k) => {
      const cx = tx + dx * length * t, cz = tz + dz * length * t, cy = ty + h;
      const row = [b.vertex(cx + px * w, cy, cz + pz * w, color, 0.7 + 0.15 * k), b.vertex(cx, cy + 0.12 * s, cz, color, 1), b.vertex(cx - px * w, cy, cz - pz * w, color, 0.7 + 0.15 * k)];
      if (k > 0) {
        b.triangle(previous[0], row[0], row[1]); b.triangle(previous[0], row[1], previous[1]);
        b.triangle(previous[1], row[1], row[2]); b.triangle(previous[1], row[2], previous[2]);
      }
      previous = row;
    });
  }
}

/** Ficus d'alignement : tronc court et large, houppier dense et arrondi. */
function ficus(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = GREENS.ficus[i % GREENS.ficus.length];
  const height = (2.6 + noise(i, 1) * 0.9) * s;
  const [tx, ty, tz] = trunk(b, x, y, z, 0.3 * s, height, (noise(i, 2) - 0.5) * 0.4, (noise(i, 3) - 0.5) * 0.4, 6, BARK);
  const r = (2.3 + noise(i, 4) * 0.8) * s;
  blob(b, tx, ty + r * 0.7, tz, r, r * 0.82, r, 8, 4, color);
}

/** Cyprès : fuseau étroit et sombre. */
function cypress(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = GREENS.cypress[i % GREENS.cypress.length];
  const height = (7 + noise(i, 1) * 4) * s, r = (0.75 + noise(i, 2) * 0.3) * s;
  trunk(b, x, y, z, 0.16 * s, 0.9 * s, 0, 0, 4, BARK);
  blob(b, x, y + 0.6 * s + height / 2, z, r, height / 2, r, 6, 4, color);
}

/** Buisson : petit dôme irrégulier ; un sur cinq est un laurier-rose en fleurs. */
function bush(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = GREENS.bush[i % GREENS.bush.length];
  const r = (0.8 + noise(i, 1) * 0.9) * s, h = (0.7 + noise(i, 2) * 0.7) * s;
  blob(b, x, y + h * 0.55, z, r, h, r * (0.7 + noise(i, 3) * 0.5), 6, 3, color, i % 5 === 0 ? FLOWER : color);
}

const SHAPES: Record<string, (b: MeshBuilder, i: number, x: number, y: number, z: number, s: number) => void> = { pine, palm, ficus, cypress, bush };

/** Ajoute toute la végétation à la scène, regroupée par blocs. Renvoie le nombre de plantes. */
export function buildTrees(scene: THREE.Scene, data: TreeData, ground: (x: number, z: number) => number): number {
  const chunks = new Map<string, MeshBuilder>();
  let count = 0;
  for (const [species, values] of Object.entries(data)) {
    const shape = SHAPES[species];
    if (!shape) continue;
    for (let i = 0; i < values.length; i += 3) {
      const x = values[i], n = values[i + 1];
      const key = `${Math.floor(x / CHUNK)},${Math.floor(n / CHUNK)}`;
      let builder = chunks.get(key);
      if (!builder) { builder = new MeshBuilder(); chunks.set(key, builder); }
      shape(builder, count, x, ground(x, -n), -n, values[i + 2]);
      count++;
    }
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const builder of chunks.values()) {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.userData.viewDistance = VIEW_DISTANCE;
    scene.add(mesh);
  }
  return count;
}
