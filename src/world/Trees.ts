import * as THREE from 'three';
import { createFoliageTexture } from './Textures';
import { MeshBuilder } from './MeshBuilder';

/** Pour chaque espèce : x, n, taille, x, n, taille... (produit par tools/build_terrain.py). */
export type TreeData = Record<string, number[]>;

const CHUNK = 200;          // regroupement par blocs de 200 m
const VIEW_DISTANCE = 520;  // au-delà, la végétation d'un bloc n'est plus affichée

const FICUS_BARK = new THREE.Color(0x9a958a); // écorce grise et lisse des ficus (photo du Cours)
const BARK = new THREE.Color(0x6b4f35), PALM_BARK = new THREE.Color(0x7a5a3c);
const GREENS: Record<string, THREE.Color[]> = {
  pine: [0x2f6b34, 0x3d7a3a, 0x4a8040, 0x356f45].map((c) => new THREE.Color(c)),
  palm: [0x3d7a33, 0x4a8638, 0x356f2f].map((c) => new THREE.Color(c)),
  ficus: [0x1f5a2a, 0x2a6a31, 0x256133, 0x33703a].map((c) => new THREE.Color(c)),
  cypress: [0x1d4a2a, 0x24552f, 0x1a4326].map((c) => new THREE.Color(c)),
  bush: [0x4f7f3a, 0x5d8a44, 0x6b8f4a, 0x44733a, 0x7a9450].map((c) => new THREE.Color(c)),
};
const lightCache = new Map<THREE.Color, THREE.Color>();
/** Teinte éclaircie et un peu plus jaune : le dessus du feuillage, au soleil. */
function LIGHT(color: THREE.Color): THREE.Color {
  let light = lightCache.get(color);
  if (!light) { light = color.clone().lerp(new THREE.Color(0xb7c95a), 0.32); lightCache.set(color, light); }
  return light;
}
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

function wrap(value: number): number { return ((value % 1) + 1) % 1; }

/** Masse de feuillage arrondie (ellipsoïde à facettes lissées), plus sombre en dessous. */
function blob(b: MeshBuilder, x: number, y: number, z: number, rx: number, ry: number, rz: number,
              segments: number, rings: number, color: THREE.Color, topColor = color, leafy = false): void {
  const rows: number[][] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI, sin = Math.sin(phi), cos = Math.cos(phi);
    const row: number[] = [];
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2 + r * 0.4;
      row.push(b.vertex(x + Math.cos(a) * sin * rx, y - cos * ry, z + Math.sin(a) * sin * rz, r > rings * 0.6 ? topColor : color, 0.55 + 0.55 * (r / rings),
        leafy ? 0.03 + 0.44 * wrap(s / segments * 3 + x * 0.37) : 0, leafy ? 0.04 + 0.92 * wrap(r / rings + z * 0.23) : 0));
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

/**
 * Houppier feuillu : plusieurs masses qui se chevauchent, au contour irrégulier, avec une image de feuilles à trous.
 * On voit le ciel à travers les bords, comme sur un vrai arbre.
 */
function crown(b: MeshBuilder, i: number, x: number, y: number, z: number, rx: number, ry: number, lumps: number, color: THREE.Color, light: THREE.Color): void {
  blob(b, x, y, z, rx * 0.78, ry * 0.8, rx * 0.78, 8, 4, color, light, true);
  for (let k = 0; k < lumps; k++) {
    const a = (k / lumps) * Math.PI * 2 + noise(i, 20 + k) * 1.2, d = rx * (0.42 + noise(i, 30 + k) * 0.25);
    const r = rx * (0.5 + noise(i, 40 + k) * 0.22);
    blob(b, x + Math.cos(a) * d, y + (noise(i, 50 + k) - 0.45) * ry * 0.7, z + Math.sin(a) * d, r, r * (ry / rx) * (0.85 + noise(i, 60 + k) * 0.3), r, 7, 3,
      k % 2 ? color : light, light, true);
  }
}

/** Pin d'Alep / pin parasol : tronc penché, houppier irrégulier fait de 3 masses aplaties. */
function pine(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = GREENS.pine[i % GREENS.pine.length];
  const height = (4 + noise(i, 1) * 2.5) * s;
  const [tx, ty, tz] = trunk(b, x, y, z, 0.24 * s, height, (noise(i, 2) - 0.5) * 1.6 * s, (noise(i, 3) - 0.5) * 1.6 * s, 5, BARK);
  const spread = (2.4 + noise(i, 4) * 1.2) * s;
  const light = LIGHT(color);
  blob(b, tx, ty + 0.5 * s, tz, spread, 1.1 * s, spread, 8, 3, color, light, true);
  for (let k = 0; k < 4; k++) {
    const a = noise(i, 5 + k) * Math.PI * 2, d = spread * (0.45 + noise(i, 11 + k) * 0.35);
    blob(b, tx + Math.cos(a) * d, ty + (0.1 + noise(i, 7 + k) * 0.9) * s, tz + Math.sin(a) * d, spread * 0.6, 0.8 * s, spread * 0.6, 7, 3, k % 2 ? light : color, light, true);
  }
  // Une branche basse dégarnie, typique du pin d'Alep.
  const a = noise(i, 15) * Math.PI * 2;
  trunk(b, x + (tx - x) * 0.5, y + height * 0.55, z + (tz - z) * 0.5, 0.09 * s, height * 0.3, Math.cos(a) * 1.4 * s, Math.sin(a) * 1.4 * s, 4, BARK);
}

const BARK_SPAN = 12; // m de tronc couverts par la texture d'écorce (de bas en haut, sans répétition)

/**
 * Écorce de palmier des Canaries (Phoenix canariensis), d'après la photo des palmiers devant la gare :
 * cicatrices de palmes en losanges brun-gris, et pied blanchi à la chaux. La limite du blanc est irrégulière :
 * hauteur différente sur chaque colonne, coulures, éclaboussures, et taches d'écorce qui transparaissent.
 */
export function createPalmBarkTexture(kind: 'palm' | 'ficus' = 'palm'): THREE.CanvasTexture {
  const W = 128, H = 512; // H couvre BARK_SPAN mètres ; ligne 0 du canevas = haut du tronc
  const element = document.createElement('canvas');
  element.width = W; element.height = H;
  const ctx = element.getContext('2d')!;
  let seed = kind === 'palm' ? 23 : 41;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const palmBark = kind === 'palm';
  // Fond d'écorce : palmier brun chaud en haut, plus gris vers le bas ; ficus brun-gris lisse.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (palmBark) { g.addColorStop(0, '#94704c'); g.addColorStop(0.55, '#86684c'); g.addColorStop(1, '#8f8170'); }
  else { g.addColorStop(0, '#8a7a66'); g.addColorStop(0.6, '#867664'); g.addColorStop(1, '#8c806f'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!palmBark) {
    // Ficus : écorce lisse, plis horizontaux et longues veines verticales (contreforts du tronc).
    for (let k = 0; k < 40; k++) { ctx.fillStyle = `rgba(70,58,45,${0.15 + r() * 0.2})`; ctx.fillRect(r() * W, 0, 1 + r() * 3, H); }
    for (let k = 0; k < 300; k++) { ctx.fillStyle = `rgba(60,50,40,${0.12 + r() * 0.2})`; ctx.fillRect(r() * W, r() * H, 4 + r() * 10, 1); }
  }
  // Cicatrices des anciennes palmes : losanges en quinconce, bord clair en haut, ombre en bas.
  const rowH = 14;
  for (let y = 0, row = 0; palmBark && y < H + rowH; y += rowH, row++) {
    for (let x = (row % 2) * 8 - 8; x < W + 16; x += 16) {
      const jitter = (r() - 0.5) * 3;
      ctx.fillStyle = `rgba(${70 + r() * 25},${52 + r() * 15},${36 + r() * 10},0.5)`;
      ctx.beginPath(); ctx.moveTo(x, y + jitter); ctx.lineTo(x + 8, y + rowH / 2); ctx.lineTo(x, y + rowH); ctx.lineTo(x - 8, y + rowH / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(${150 + r() * 40},${120 + r() * 30},${90 + r() * 25},0.35)`;
      ctx.fillRect(x - 6, y + 1 + jitter, 12, 2);
    }
  }
  // Fibres et grain.
  for (let k = 0; k < 2600; k++) {
    const v = 20 + r() * 70;
    ctx.fillStyle = `rgba(${v + 20},${v + 8},${v},${0.12 + r() * 0.2})`;
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 4);
  }
  // Chaux : de 1,2 à 1,7 m selon la colonne, bord déchiqueté, coulures et éclats.
  const metre = H / BARK_SPAN;
  const edge: number[] = [];
  let level = 1.7;
  for (let x = 0; x < W; x++) {
    level += (r() - 0.5) * 0.08;
    level = Math.max(1.45, Math.min(2.0, level * 0.98 + 1.7 * 0.02));
    edge.push(level);
  }
  for (let x = 0; x < W; x++) {
    const top = H - edge[x] * metre;
    const lime = ctx.createLinearGradient(0, top, 0, H);
    lime.addColorStop(0, 'rgba(246,244,238,0.75)'); lime.addColorStop(0.1, 'rgba(250,249,245,0.97)'); lime.addColorStop(1, 'rgba(238,236,228,1)');
    ctx.fillStyle = lime; ctx.fillRect(x, top, 1, H - top);
  }
  // Coulures vers le haut et vers le bas, éclaboussures au-dessus de la limite.
  for (let k = 0; k < 70; k++) {
    const x = r() * W, top = H - edge[Math.floor(x)] * metre;
    ctx.fillStyle = `rgba(235,232,222,${0.35 + r() * 0.5})`;
    ctx.fillRect(x, top - r() * 26, 1 + r() * 2.5, 4 + r() * 22);
  }
  for (let k = 0; k < 160; k++) {
    const x = r() * W, top = H - edge[Math.floor(x)] * metre, y = top - 6 - r() * 40;
    ctx.fillStyle = `rgba(232,229,219,${0.2 + r() * 0.45})`;
    ctx.beginPath(); ctx.arc(x, y, 0.6 + r() * 1.8, 0, Math.PI * 2); ctx.fill();
  }
  // L'écorce transparaît sous la chaux usée (relief des losanges), surtout près de la limite.
  for (let y = H - 2.1 * metre; y < H; y += rowH) {
    for (let x = 0; palmBark && x < W; x += 16) {
      const near = 1 - (H - y) / (2.1 * metre);
      ctx.fillStyle = `rgba(120,100,78,${0.05 + near * 0.18 * r()})`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, y + rowH / 2); ctx.lineTo(x, y + rowH); ctx.lineTo(x - 8, y + rowH / 2); ctx.closePath(); ctx.fill();
    }
  }
  for (let k = 0; k < 220; k++) {
    const x = r() * W, y = H - r() * 1.6 * metre;
    ctx.fillStyle = `rgba(${95 + r() * 40},${80 + r() * 30},${62 + r() * 20},${0.15 + r() * 0.35})`;
    ctx.fillRect(x, y, 1 + r() * 3, 1 + r() * 3);
  }
  // Salissure de terre au ras du sol.
  const dirt = ctx.createLinearGradient(0, H - 0.25 * metre, 0, H);
  dirt.addColorStop(0, 'rgba(120,100,75,0)'); dirt.addColorStop(1, 'rgba(120,100,75,0.55)');
  ctx.fillStyle = dirt; ctx.fillRect(0, H - 0.25 * metre, W, 0.25 * metre);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Stipe de palmier épais, presque cylindrique, avec coordonnées de texture en mètres (v = hauteur / BARK_SPAN). */
function palmStem(b: MeshBuilder, x: number, y: number, z: number, radius: number, height: number, leanX: number, leanZ: number): [number, number, number] {
  const SIDES = 9, SEGMENTS = 6, white = new THREE.Color(0xffffff);
  let previous: number[] = [];
  for (let s = 0; s <= SEGMENTS; s++) {
    const t = s / SEGMENTS, r = radius * (1.12 - 0.22 * t) * (s === 0 ? 1.08 : 1); // pied un peu évasé
    const cx = x + leanX * t * t, cz = z + leanZ * t * t, cy = y - 0.3 + (height + 0.3) * t;
    const ring: number[] = [];
    for (let i = 0; i <= SIDES; i++) { // un sommet en double à la couture de la texture
      const a = (i / SIDES) * Math.PI * 2;
      ring.push(b.vertex(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r, white, 1, i / SIDES * 2, Math.min(0.999, Math.max(0.001, (cy - y + 0.3) / BARK_SPAN))));
    }
    if (s > 0) for (let i = 0; i < SIDES; i++) { b.triangle(previous[i], previous[i + 1], ring[i + 1]); b.triangle(previous[i], ring[i + 1], ring[i]); }
    previous = ring;
  }
  return [x + leanX, y + height, z + leanZ];
}

/**
 * Palmier des Canaries, comme ceux des places d'Annaba : tronc épais chaulé au pied, « ananas » brun au sommet,
 * couronne dense d'une trentaine de longues palmes arquées. `bark` : constructeur du tronc texturé (sinon tronc simple).
 */
function palm(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number, bark?: MeshBuilder): void {
  const color = GREENS.palm[i % GREENS.palm.length];
  const height = (7 + noise(i, 1) * 3.5) * s;
  const leanX = (noise(i, 2) - 0.5) * 0.7 * s, leanZ = (noise(i, 3) - 0.5) * 0.7 * s;
  const [tx, ty, tz] = bark ? palmStem(bark, x, y, z, 0.34 * s, height, leanX, leanZ)
    : trunk(b, x, y, z, 0.32 * s, height, leanX, leanZ, 6, PALM_BARK);
  blob(b, tx, ty + 0.1 * s, tz, 0.62 * s, 0.75 * s, 0.62 * s, 7, 3, PALM_BARK); // « ananas » : base des palmes
  const FRONDS = 30, length = (3.9 + noise(i, 4) * 1.0) * s;
  for (let f = 0; f < FRONDS; f++) {
    const a = (f / FRONDS) * Math.PI * 2 + noise(i, 9) * 6 + noise(i * 7 + f, 8) * 0.25;
    const lift = f % 3 === 0 ? 0.85 + noise(i * 13 + f, 5) * 0.25 : 0.2 + noise(i * 13 + f, 5) * 0.65; // un tiers dressées, les autres arquées
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    // Trois points le long de la palme : départ, sommet de l'arc, pointe retombante.
    const points = [[0, 0.15 * s, 0.5 * s], [0.34, (0.42 + lift * 0.8) * s, 0.62 * s], [0.68, (0.3 + lift * 0.9) * s, 0.55 * s], [1, (lift * 1.3 - 1.3) * s, 0.3 * s]];
    let previous: number[] = [];
    points.forEach(([t, h, w], k) => {
      const cx = tx + dx * length * t, cz = tz + dz * length * t, cy = ty + 0.5 * s + h;
      const v = 0.02 + 0.96 * t;
      const row = [b.vertex(cx + px * w, cy - 0.18 * s, cz + pz * w, color, 0.7 + 0.1 * k, 0.52, v), b.vertex(cx, cy + 0.1 * s, cz, color, 1, 0.75, v), b.vertex(cx - px * w, cy - 0.18 * s, cz - pz * w, color, 0.7 + 0.1 * k, 0.98, v)];
      if (k > 0) {
        b.triangle(previous[0], row[0], row[1]); b.triangle(previous[0], row[1], previous[1]);
        b.triangle(previous[1], row[1], row[2]); b.triangle(previous[1], row[2], previous[2]);
      }
      previous = row;
    });
  }
}

/** Ficus d'alignement : tronc court et large, houppier dense et arrondi. */
function ficus(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number, bark?: MeshBuilder): void {
  const color = GREENS.ficus[i % GREENS.ficus.length];
  const height = (2.6 + noise(i, 1) * 0.9) * s;
  const leanX = (noise(i, 2) - 0.5) * 0.4, leanZ = (noise(i, 3) - 0.5) * 0.4;
  // Tronc chaulé au pied comme dans les rues d'Annaba (même chaux irrégulière que les palmiers).
  const [tx, ty, tz] = bark ? palmStem(bark, x, y, z, 0.3 * s, height, leanX, leanZ)
    : trunk(b, x, y, z, 0.3 * s, height, leanX, leanZ, 6, FICUS_BARK);
  const r = (2.3 + noise(i, 4) * 0.8) * s;
  crown(b, i, tx, ty + r * 0.62, tz, r, r * 0.8, 5, color, LIGHT(color));
  // Deux grosses branches visibles sous le feuillage.
  for (let k = 0; k < 2; k++) {
    const a = noise(i, 70 + k) * Math.PI * 2;
    trunk(b, tx, ty - 0.3, tz, 0.13 * s, r * 0.55, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, 4, FICUS_BARK);
  }
}

/** Araucaria (pin de Norfolk), fréquent dans les squares d'Annaba (photo du Cours) : tronc droit, étages de branches plates. */
function araucaria(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = GREENS.cypress[i % GREENS.cypress.length].clone().lerp(new THREE.Color(0x3d6b3a), 0.4);
  const height = (13 + noise(i, 1) * 4) * s;
  trunk(b, x, y, z, 0.22 * s, height, 0, 0, 6, BARK);
  const TIERS = 8;
  for (let k = 0; k < TIERS; k++) {
    const t = k / (TIERS - 1), r = (3.0 - 2.5 * t) * s * (0.9 + noise(i, 10 + k) * 0.2);
    blob(b, x, y + height * (0.25 + 0.72 * t), z, r, 0.45 * s, r, 9, 2, color, LIGHT(color), true);
  }
}

/** Cyprès : fuseau étroit et sombre. */
function cypress(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = GREENS.cypress[i % GREENS.cypress.length];
  const height = (7 + noise(i, 1) * 4) * s, r = (0.75 + noise(i, 2) * 0.3) * s;
  trunk(b, x, y, z, 0.16 * s, 0.9 * s, 0, 0, 4, BARK);
  blob(b, x, y + 0.6 * s + height / 2, z, r, height / 2, r, 7, 5, color, LIGHT(color), true);
}

/** Buisson : petit dôme irrégulier ; un sur cinq est un laurier-rose en fleurs. */
function bush(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = GREENS.bush[i % GREENS.bush.length];
  const r = (0.8 + noise(i, 1) * 0.9) * s, h = (0.7 + noise(i, 2) * 0.7) * s;
  blob(b, x, y + h * 0.55, z, r, h, r * (0.7 + noise(i, 3) * 0.5), 7, 3, color, i % 5 === 0 ? FLOWER : LIGHT(color), true);
  blob(b, x + r * 0.5, y + h * 0.4, z + r * 0.3, r * 0.6, h * 0.7, r * 0.6, 6, 3, LIGHT(color), LIGHT(color), true);
}

const STRAW = new THREE.Color(0xc9a45c), STRAW_DARK = new THREE.Color(0x9c7a3e), POLE = new THREE.Color(0x7a5a3a);
const ROCKS = [0x8d857a, 0x9a9184, 0x7c766d, 0xa39a88].map((c) => new THREE.Color(c));

/** Parasol de paille des plages : mât en bois, chapeau conique à franges. */
function parasol(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const [tx, ty, tz] = trunk(b, x, y, z, 0.06, 2.3 * s, 0, 0, 4, POLE);
  const SIDES = 10, r = 1.7 * s, tip = b.vertex(tx, ty + 0.25, tz, STRAW, 1);
  const rim: number[] = [], fringe: number[] = [];
  for (let k = 0; k < SIDES; k++) {
    const a = (k / SIDES) * Math.PI * 2 + i;
    rim.push(b.vertex(tx + Math.cos(a) * r, ty - 0.45 * s, tz + Math.sin(a) * r, STRAW, 0.9));
    fringe.push(b.vertex(tx + Math.cos(a) * r * 1.04, ty - 0.75 * s, tz + Math.sin(a) * r * 1.04, STRAW_DARK, 0.75));
  }
  for (let k = 0; k < SIDES; k++) {
    const j = (k + 1) % SIDES;
    b.triangle(tip, rim[j], rim[k]);
    b.triangle(rim[k], rim[j], fringe[j]); b.triangle(rim[k], fringe[j], fringe[k]);
  }
}

/** Rocher du rivage : bloc irrégulier à moitié enfoui. */
function rock(b: MeshBuilder, i: number, x: number, y: number, z: number, s: number): void {
  const color = ROCKS[i % ROCKS.length];
  const rx = (0.9 + noise(i, 1) * 1.1) * s, rz = (0.8 + noise(i, 2) * 1.0) * s, ry = (0.5 + noise(i, 3) * 0.7) * s;
  blob(b, x, Math.max(y, -0.5) + ry * 0.25, z, rx, ry, rz, 5, 3, color);
  if (noise(i, 4) > 0.5) blob(b, x + rx * 0.8, Math.max(y, -0.5) + ry * 0.1, z + rz * 0.5, rx * 0.55, ry * 0.6, rz * 0.6, 5, 3, ROCKS[(i + 1) % ROCKS.length]);
}

/** Ajoute une plante isolée (îlots de ronds-points, places...). */
export function addPlant(b: MeshBuilder, species: string, i: number, x: number, y: number, z: number, size: number): void {
  SHAPES[species]?.(b, i, x, y, z, size);
}

const SHAPES: Record<string, (b: MeshBuilder, i: number, x: number, y: number, z: number, s: number) => void> = { pine, palm: (b, i, x, y, z, s) => palm(b, i, x, y, z, s), ficus, cypress, araucaria, bush, parasol, rock };

/** Ajoute toute la végétation à la scène, regroupée par blocs. Renvoie le nombre de plantes. */
export function buildTrees(scene: THREE.Scene, data: TreeData, ground: (x: number, z: number) => number): number {
  const chunks = new Map<string, MeshBuilder>();
  const barks = new Map<string, MeshBuilder>();
  const ficusBarks = new Map<string, MeshBuilder>();
  let count = 0;
  for (const [species, values] of Object.entries(data)) {
    const shape = SHAPES[species];
    if (!shape) continue;
    for (let i = 0; i < values.length; i += 3) {
      const x = values[i], n = values[i + 1];
      const key = `${Math.floor(x / CHUNK)},${Math.floor(n / CHUNK)}`;
      let builder = chunks.get(key);
      if (!builder) { builder = new MeshBuilder(); chunks.set(key, builder); }
      if (species === 'palm') {
        let bark = barks.get(key);
        if (!bark) { bark = new MeshBuilder(); barks.set(key, bark); }
        palm(builder, count, x, ground(x, -n), -n, values[i + 2], bark);
      } else if (species === 'ficus') {
        let bark = ficusBarks.get(key);
        if (!bark) { bark = new MeshBuilder(); ficusBarks.set(key, bark); }
        ficus(builder, count, x, ground(x, -n), -n, values[i + 2], bark);
      } else shape(builder, count, x, ground(x, -n), -n, values[i + 2]);
      count++;
    }
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: createFoliageTexture(), alphaTest: 0.4 });
  for (const builder of chunks.values()) {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.userData.viewDistance = VIEW_DISTANCE;
    mesh.castShadow = true;
    scene.add(mesh);
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, map: createPalmBarkTexture() });
  const ficusMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, map: createPalmBarkTexture('ficus') });
  for (const [builder, material] of [...[...barks.values()].map((v) => [v, barkMaterial] as const), ...[...ficusBarks.values()].map((v) => [v, ficusMaterial] as const)]) {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.userData.viewDistance = VIEW_DISTANCE;
    mesh.castShadow = true;
    scene.add(mesh);
  }
  return count;
}
