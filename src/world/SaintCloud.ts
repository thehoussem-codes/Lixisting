import * as THREE from 'three';
import { beam, distToLine, grownRing, inRing, noise, pavers, samples, textSign, walls } from './Chapuis';
import type { Collider } from './Collider';
import { type Ground, type Ring, boxAt, canvasTexture, cap } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';
import type { WorldData } from './WorldData';

/**
 * Corniche Saint-Cloud (boulevard Fellah Rachid, plage Saint-Cloud), d'après la vidéo « CORNICHE SAINT-CLOUD »
 * de Houssem (trajet vers le nord-ouest, la mer à droite) et la vue aérienne de référence.
 *
 * Vu sur la vidéo, du début (sud-est) à la fin (virage vers le Jasmin) :
 * - route à double sens, plate et droite ; à gauche bordure rouge et blanche, voitures garées, hauts murs crème
 *   et portails ; passages piétons jaunes ;
 * - à droite une large promenade en grandes dalles grises (claires et foncées mêlées), un garde-corps métallique
 *   gris foncé au-dessus du sable, de grands lampadaires gris au mât courbe, des palmiers surtout dans la
 *   seconde moitié, bancs, corbeilles, deux cabines rouge et bleue ;
 * - à gauche : immeuble crème à balcons, pizzeria « MEGA PIZZA » (piliers rouges, grille noire), immeuble crème à
 *   bandes cyan et portail bleu, la grande tour crème sur pilotis, villas jaunes à toits rouges, le mur peint
 *   « EDEN DES ANGES », un immeuble à cage d'escalier vitrée bleue, un long bâtiment à véranda brune,
 *   au bout la rangée de commerces « BOUREK ANNABA » à soubassement bleu.
 * Emplacements le long de la route estimés d'après l'avancement de la vidéo (vitesse supposée constante, ±20 m),
 * rattachés aux bâtiments d'OSM les plus proches ; la tour reprend l'emprise OSM (way du bâtiment 12021).
 */

/** Axe de la route (OSM), du sud-est au nord-ouest ; la mer est à droite. */
const AXIS: Ring = [[808.7, 2345.5], [795.0, 2359.5], [781.3, 2373.6], [767.6, 2387.7], [754.0, 2401.7], [740.9, 2415.5], [728.6, 2428.8], [717.0, 2441.4], [707.0, 2452.9], [696.6, 2465.4], [685.6, 2478.9], [674.7, 2492.4], [663.7, 2505.8], [651.4, 2521.4], [639.0, 2537.0], [626.7, 2552.5], [614.4, 2568.1], [602.1, 2583.6], [589.7, 2599.2], [577.4, 2614.8], [565.1, 2630.3], [553.2, 2645.1], [541.3, 2659.9], [529.5, 2674.7], [518.2, 2688.6], [506.9, 2702.5], [495.6, 2716.4], [485.1, 2729.5], [475.4, 2741.7], [464.9, 2755.2], [454.0, 2769.2], [442.8, 2783.8], [431.6, 2798.3], [420.4, 2812.9], [412.0, 2825.1], [405.5, 2836.4], [397.4, 2855.4], [391.0, 2871.8], [387.8, 2879.9]];
const HALF = 4.0, SIDEWALK = 1.4, PROMENADE = 8.0;
export const SAINT_CLOUD_REPLACED: [number, number][] = [[629.17, 2518.11]]; // la tour crème (emprise OSM gardée)
const TOWER_AT: [number, number] = [629.17, 2518.11];

const CREAM = new THREE.Color(0xeedcb8), WHITE = new THREE.Color(0xffffff), DARK = new THREE.Color(0x2a2d31);
const RAIL = new THREE.Color(0x3a3e44), POLE = new THREE.Color(0x9aa0a6), RED = new THREE.Color(0xb3262a);

/** Point de l'axe à l'abscisse s (mètres depuis le début), sa direction et sa normale vers la mer. */
function along(s: number): { x: number; n: number; tx: number; tn: number; ex: number; en: number } {
  let rest = s;
  for (let i = 0; i + 1 < AXIS.length; i++) {
    const [ax, an] = AXIS[i], [bx, bn] = AXIS[i + 1], l = Math.hypot(bx - ax, bn - an);
    if (rest <= l || i + 2 === AXIS.length) {
      const tx = (bx - ax) / l, tn = (bn - an) / l, t = Math.min(rest, l);
      return { x: ax + tx * t, n: an + tn * t, tx, tn, ex: tn, en: -tx };
    }
    rest -= l;
  }
  return { x: AXIS[0][0], n: AXIS[0][1], tx: 0, tn: 1, ex: 1, en: 0 };
}
const LENGTH = AXIS.slice(1).reduce((sum, [x, n], i) => sum + Math.hypot(x - AXIS[i][0], n - AXIS[i][1]), 0);

// ---------------------------------------------------------------- textures

/** Tour crème : loggias sombres en retrait, fenêtres, allèges claires (travée 6 m × 3 m). */
function towerFloor(): THREE.CanvasTexture {
  return canvasTexture(192, 96, (ctx) => {
    ctx.fillStyle = '#efdcb6'; ctx.fillRect(0, 0, 192, 96); noise(ctx, 192, 96, '150,120,80', 60, 21);
    ctx.fillStyle = '#3a3431'; ctx.fillRect(12, 14, 70, 56);
    ctx.fillStyle = '#5b5550'; ctx.fillRect(12, 56, 70, 14);
    ctx.fillStyle = '#e4cfa6'; ctx.fillRect(8, 68, 78, 6);
    ctx.fillStyle = '#2f3a44'; ctx.fillRect(110, 20, 26, 36); ctx.fillRect(152, 20, 26, 36);
    ctx.fillStyle = '#d9c39a'; ctx.fillRect(106, 56, 34, 4); ctx.fillRect(148, 56, 34, 4);
    ctx.fillStyle = 'rgba(120,90,60,0.25)'; ctx.fillRect(0, 92, 192, 4);
  });
}

/** Immeuble crème à bandes verticales cyan (vidéo), portail bleu. */
function stripes(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#f2e6cc'; ctx.fillRect(0, 0, 128, 128); noise(ctx, 128, 128, '150,120,80', 30, 4);
    ctx.fillStyle = '#7fd1d6'; for (const x of [10, 58, 106]) ctx.fillRect(x, 0, 12, 128);
    ctx.fillStyle = '#3c4a55'; for (const x of [30, 78]) for (const y of [14, 54]) ctx.fillRect(x, y, 18, 22);
    ctx.fillStyle = '#5aa9d6'; ctx.fillRect(28, 92, 72, 36);
    ctx.fillStyle = '#3f86b8'; for (let x = 30; x < 100; x += 8) ctx.fillRect(x, 92, 2, 36);
  }, false);
}

/** Grandes dalles grises claires et foncées mêlées (vidéo et photo de la promenade). */
function slabs(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    let seed = 31;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? -24 : 0; x < 256; x += 48) {
      const v = r(), g = v < 0.12 ? 92 : v < 0.2 ? 168 : v < 0.26 ? 128 : 140 + Math.floor(r() * 16);
      ctx.fillStyle = v > 0.94 ? '#8a7470' : `rgb(${g},${g},${g + 4})`;
      ctx.fillRect(x, y, 48, 32);
    }
    ctx.fillStyle = 'rgba(40,40,45,0.6)';
    for (let y = 0; y < 256; y += 32) { ctx.fillRect(0, y, 256, 2); for (let x = (y / 32) % 2 ? -24 : 0; x < 256; x += 48) ctx.fillRect(x, y, 2, 32); }
    noise(ctx, 256, 256, '30,30,30', 160, 7);
  });
}

/** Mur peint « EDEN DES ANGES » : taches de couleur vives sur enduit crème. */
function mural(): THREE.CanvasTexture {
  return canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = '#f1e4c8'; ctx.fillRect(0, 0, 256, 64);
    const colors = ['#e94b3c', '#f6b93b', '#38ada9', '#6a89cc', '#78e08f', '#e15f99'];
    let seed = 5;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 40; i++) { ctx.fillStyle = colors[i % colors.length]; ctx.beginPath(); ctx.ellipse(r() * 256, 30 + r() * 34, 6 + r() * 16, 5 + r() * 12, r() * 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#5b4636'; ctx.font = 'bold 14px Georgia, serif'; ctx.fillText('EDEN', 14, 18); ctx.fillText('ANGES', 14, 34);
  }, false);
}

/** Cage d'escalier vitrée bleue (vidéo) : verre bleu, montants sombres. */
function blueGlass(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, '#4c86c6'); g.addColorStop(1, '#244f86');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0, 0, 64, 18);
    ctx.fillStyle = '#1d2a36'; ctx.fillRect(0, 0, 64, 3); ctx.fillRect(0, 0, 3, 64); ctx.fillRect(31, 0, 2, 64);
  });
}

// ---------------------------------------------------------------- outils

/** Le côté d'une emprise tourné vers la route : départ, fin, normale sortante (x, n). */
function frontEdge(ring: Ring): { a: [number, number]; b: [number, number]; nx: number; nn: number } {
  let best = Infinity, out = { a: ring[0], b: ring[1], nx: 1, nn: 0 };
  const [cx, cn] = ring.reduce(([x, n], [a, c]) => [x + a / ring.length, n + c / ring.length], [0, 0]);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 4) continue;
    const mx = (a[0] + b[0]) / 2, mn = (a[1] + b[1]) / 2;
    let nx = (b[1] - a[1]) / l, nn = -(b[0] - a[0]) / l;
    if (nx * (mx - cx) + nn * (mn - cn) < 0) { nx = -nx; nn = -nn; }
    const d = distToLine(AXIS, mx + nx * 2, mn + nn * 2) - distToLine(AXIS, mx, mn);
    const score = distToLine(AXIS, mx, mn) + d * 20;
    if (score < best) { best = score; out = { a, b, nx, nn }; }
  }
  return out;
}

/** Panneau vertical texturé devant une façade (de t0 à t1 le long du côté, de y0 à y1). */
function facePanel(scene: THREE.Scene, edge: ReturnType<typeof frontEdge>, t0: number, t1: number, y0: number, y1: number, map: THREE.Texture, out = 0.06): void {
  const [ax, an] = edge.a, [bx, bn] = edge.b;
  const p = (t: number): [number, number] => [ax + (bx - ax) * t + edge.nx * out, an + (bn - an) * t + edge.nn * out];
  const [x0, n0] = p(t0), [x1, n1] = p(t1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, -n0, x1, y0, -n1, x1, y1, -n1, x0, y1, -n0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
}

function ringNear(data: WorldData, x: number, n: number): Ring | null {
  let best: Ring | null = null, bestD = 8;
  for (const b of data.buildings) {
    let cx = 0, cn = 0;
    const count = b.p.length / 2;
    for (let i = 0; i < count; i++) { cx += b.p[i * 2] / count; cn += b.p[i * 2 + 1] / count; }
    const d = Math.hypot(cx - x, cn - n);
    if (d < bestD) { bestD = d; best = []; for (let i = 0; i < count; i++) best.push([b.p[i * 2], b.p[i * 2 + 1]]); }
  }
  return best;
}

/** Bâtiments d'OSM le long de la route, côté terre : enduits crème et ocre de la vidéo ; villas jaunes à toits rouges. */
export function restyleSaintCloud(data: WorldData): void {
  const warm = [0xeedcb8, 0xf1e2c2, 0xe8d3a8, 0xf3e9d6, 0xe3c48a];
  data.buildings.forEach((b, i) => {
    let cx = 0, cn = 0;
    const count = b.p.length / 2;
    for (let k = 0; k < count; k++) { cx += b.p[k * 2] / count; cn += b.p[k * 2 + 1] / count; }
    if (cx < 330 || cx > 830 || cn < 2320 || cn > 2900 || distToLine(AXIS, cx, cn) > 45) return;
    if (b.t === 'house' || b.t === 'apartment') b.c = warm[i % warm.length];
    if (Math.hypot(cx - 572.5, cn - 2569.3) < 3) { b.t = 'house'; b.h = Math.min(b.h, 10); b.c = 0xe3c48a; } // villa jaune (vidéo)
  });
}

export interface SaintCloudEdits {
  ground: (x: number, z: number) => number | null;
  keepTree: (x: number, n: number) => boolean;
  trees: [string, number, number, number][];
}

export function buildSaintCloud(scene: THREE.Scene, data: WorldData, ground: Ground, collider: Collider): SaintCloudEdits {
  const meshes: [MeshBuilder, THREE.Material][] = [];
  const builder = (material: THREE.Material) => { const b = new MeshBuilder(); meshes.push([b, material]); return b; };
  const mat = (map?: THREE.Texture) => new THREE.MeshLambertMaterial(map ? { vertexColors: true, map, side: THREE.DoubleSide } : { vertexColors: true, side: THREE.DoubleSide });
  const plain = builder(mat());
  const post = (x: number, n: number, r = 0.2) => collider.addBuilding([x - r, n - r, x + r, n - r, x + r, n + r, x - r, n + r]);

  // --- La grande tour crème sur pilotis (emprise OSM).
  const tower = ringNear(data, TOWER_AT[0], TOWER_AT[1]);
  if (tower) {
    const g = tower.map(([x, n]) => ground(x, -n)), low = Math.min(...g), base = Math.max(...g), top = base + 5 + 14 * 3;
    const inner = grownRing(tower, -2.2);
    walls(plain, inner, low - 0.4, base + 5, 1, 1, new THREE.Color(0x4a4643));       // rez-de-chaussée en retrait, sombre
    for (let i = 0; i < tower.length; i++) {                                         // pilotis le long du contour
      const [ax, an] = tower[i], [bx, bn] = tower[(i + 1) % tower.length], l = Math.hypot(bx - ax, bn - an);
      for (let t = 0; t <= l; t += 6) {
        const x = ax + (bx - ax) * (t / l), n = an + (bn - an) * (t / l);
        boxAt(plain, x, -n, 0.9, 0.9, low - 0.3, base + 5, CREAM);
        post(x, n, 0.45);
      }
    }
    collider.addBuilding(inner.flat(), -Infinity, Infinity, { y: base + 5 });
    walls(builder(mat(towerFloor())), tower, base + 5, top, 6, 3, WHITE, base + 5);
    walls(plain, grownRing(tower, 0.3), base + 4.6, base + 5.1, 1, 1, CREAM);
    walls(plain, tower, top, top + 1.1, 1, 1, CREAM);
    cap(plain, tower, base + 5, new THREE.Color(0xd8c7a6));
    cap(plain, tower, top, new THREE.Color(0xbdb4a4));
    collider.addBuilding(tower.flat(), base + 4.4, Infinity, { y: top });
  }

  // --- Décors de façade sur les bâtiments d'OSM (vidéo).
  const stripeBuilding = ringNear(data, 672.2, 2471.7);
  if (stripeBuilding) {
    const e = frontEdge(stripeBuilding), base = Math.max(...stripeBuilding.map(([x, n]) => ground(x, -n)));
    facePanel(scene, e, 0, 1, base, base + 13, stripes());
  }
  const glassBuilding = ringNear(data, 534.5, 2635.3);
  if (glassBuilding) {
    const e = frontEdge(glassBuilding), base = Math.max(...glassBuilding.map(([x, n]) => ground(x, -n)));
    const mx = (e.a[0] + e.b[0]) / 2 + e.nx * 1.7, mn = (e.a[1] + e.b[1]) / 2 + e.nn * 1.7;
    const glass = builder(mat(blueGlass()));
    const r: Ring = [[-1.8, -1.7], [1.8, -1.7], [1.8, 1.7], [-1.8, 1.7]].map(([u, v]) => {
      const tx = (e.b[0] - e.a[0]), tn = (e.b[1] - e.a[1]), l = Math.hypot(tx, tn);
      return [mx + (tx / l) * u + e.nx * v, mn + (tn / l) * u + e.nn * v] as [number, number];
    });
    walls(glass, r, base - 0.3, base + 14.5, 3, 3, WHITE, base);
    cap(plain, r, base + 14.5, DARK);
    collider.addBuilding(r.flat(), -Infinity, Infinity, { y: base + 14.5 });
  }
  const verandaBuilding = ringNear(data, 486.1, 2702.4);
  if (verandaBuilding) { // long bâtiment à véranda : auvent brun sur poteaux le long de la façade
    const e = frontEdge(verandaBuilding), base = Math.max(...verandaBuilding.map(([x, n]) => ground(x, -n)));
    const [ax, an] = e.a, [bx, bn] = e.b, l = Math.hypot(bx - ax, bn - an), tx = (bx - ax) / l, tn = (bn - an) / l;
    const roof = builder(mat());
    const brown = new THREE.Color(0x8a4b32);
    const q = (t: number, d: number, y: number) => roof.vertex(ax + tx * t + e.nx * d, y, -(an + tn * t + e.nn * d), brown);
    const v = [q(0, 0, base + 4.6), q(l, 0, base + 4.6), q(l, 3.6, base + 3.7), q(0, 3.6, base + 3.7)];
    roof.triangle(v[0], v[1], v[2]); roof.triangle(v[0], v[2], v[3]);
    for (let t = 0.5; t <= l; t += 3) {
      const x = ax + tx * t + e.nx * 3.4, n = an + tn * t + e.nn * 3.4, y = ground(x, -n);
      boxAt(plain, x, -n, 0.32, 0.32, y, base + 3.8, CREAM);
      post(x, n, 0.2);
    }
  }
  const shopRow = ringNear(data, 386.2, 2842.0);
  if (shopRow) {
    const e = frontEdge(shopRow), base = Math.max(...shopRow.map(([x, n]) => ground(x, -n)));
    facePanel(scene, e, 0, 1, base - 0.3, base + 1.1, canvasTexture(64, 16, (ctx) => { ctx.fillStyle = '#2f5fa8'; ctx.fillRect(0, 0, 64, 16); }, false));
    facePanel(scene, e, 0.05, 0.95, base + 3.0, base + 3.9, textSign(512, 64, '#f3ead5', '#7a5a2e', [['BOUREK ANNABA', 40]]));
  }

  // --- Pizzeria « MEGA PIZZA » : pavillon au bord du trottoir, piliers rouges et grille noire.
  {
    const k = along(118), off = HALF + SIDEWALK + 4.5;
    const cx = k.x - k.ex * (off + 4), cn = k.n - k.en * (off + 4);
    const ring: Ring = [[-7, -4], [7, -4], [7, 4], [-7, 4]].map(([u, v]) => [cx + k.tx * u + k.ex * v, cn + k.tn * u + k.en * v] as [number, number]);
    const g = ring.map(([x, n]) => ground(x, -n)), low = Math.min(...g), base = Math.max(...g);
    walls(plain, ring, low - 0.3, base + 4.2, 1, 1, new THREE.Color(0xf4efe6));
    cap(plain, ring, base + 4.2, new THREE.Color(0xd6d0c5));
    collider.addBuilding(ring.flat(), -Infinity, Infinity, { y: base + 4.2 });
    const e = { a: ring[1], b: ring[0], nx: k.ex, nn: k.en };
    facePanel(scene, e, 0.05, 0.95, base + 2.9, base + 3.9, textSign(512, 72, '#c8202a', '#ffffff', [['MEGA PIZZA', 46]]));
    facePanel(scene, e, 0.1, 0.9, base + 0.2, base + 2.6, canvasTexture(64, 32, (ctx) => { ctx.fillStyle = '#28323a'; ctx.fillRect(0, 0, 64, 32); ctx.fillStyle = 'rgba(255,230,180,0.5)'; ctx.fillRect(4, 4, 24, 20); ctx.fillRect(36, 4, 24, 20); }, false));
    const fence = builder(new THREE.MeshLambertMaterial({ map: canvasTexture(64, 64, (ctx) => { ctx.clearRect(0, 0, 64, 64); ctx.fillStyle = '#141516'; for (let x = 2; x < 64; x += 8) ctx.fillRect(x, 0, 3, 64); ctx.fillRect(0, 0, 64, 5); }), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true }));
    for (let u = -7; u < 7; u += 3.5) {
      const ax = cx + k.tx * u + k.ex * 6.5, an = cn + k.tn * u + k.en * 6.5, bx = ax + k.tx * 3.5, bn = an + k.tn * 3.5;
      const ga = ground(ax, -an) + 0.12, gb = ground(bx, -bn) + 0.12;
      boxAt(plain, ax, -an, 0.5, 0.5, ga - 0.2, ga + 1.9, RED);
      const p = fence.vertex(ax, ga + 0.3, -an, WHITE, 1, 0, 0), q = fence.vertex(bx, gb + 0.3, -bn, WHITE, 1, 3.5, 0);
      const r2 = fence.vertex(bx, gb + 1.7, -bn, WHITE, 1, 3.5, 1), s2 = fence.vertex(ax, ga + 1.7, -an, WHITE, 1, 0, 1);
      fence.triangle(p, q, r2); fence.triangle(p, r2, s2);
      post(ax, an, 0.25);
    }
  }

  // --- Mur peint « EDEN DES ANGES » et panneau, côté terre.
  {
    const off = HALF + SIDEWALK + 0.3;
    const m = builder(mat(mural()));
    let u = 0;
    for (let s = 362; s < 386; s += 4) {
      const a = along(s), b = along(s + 4);
      const ax = a.x - a.ex * off, an = a.n - a.en * off, bx = b.x - b.ex * off, bn = b.n - b.en * off;
      const ga = ground(ax, -an), gb = ground(bx, -bn);
      const v0 = m.vertex(ax, ga - 0.3, -an, WHITE, 1, u, 0), v1 = m.vertex(bx, gb - 0.3, -bn, WHITE, 1, u + 4 / 24, 0);
      const v2 = m.vertex(bx, gb + 2.4, -bn, WHITE, 1, u + 4 / 24, 1), v3 = m.vertex(ax, ga + 2.4, -an, WHITE, 1, u, 1);
      m.triangle(v0, v1, v2); m.triangle(v0, v2, v3);
      collider.addBuilding([ax - 0.2, an - 0.2, bx + 0.2, bn - 0.2, bx + 0.2, bn + 0.2, ax - 0.2, an + 0.2]);
      u += 4 / 24;
    }
    const k = along(368), x = k.x - k.ex * (off + 0.6), n = k.n - k.en * (off + 0.6), y = ground(x, -n);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.8), new THREE.MeshLambertMaterial({ map: textSign(512, 150, '#2d5aa6', '#ffffff', [['EDEN DES ANGES', 56]]), side: THREE.DoubleSide }));
    sign.position.set(x, y + 4.0, -n);
    sign.rotation.y = Math.atan2(k.ex, -k.en);
    scene.add(sign);
    for (const d of [-2.6, 2.6]) boxAt(plain, x + k.tx * d, -(n + k.tn * d), 0.14, 0.14, y, y + 3.1, DARK);
  }

  // --- Hauts murs crème côté terre, coupés aux rues transversales et devant les bâtiments.
  const others = data.roads.filter((r) => r.n !== 'Boulevard Fellah Rachid' && r.k !== 'footway' && r.k !== 'path' && r.k !== 'steps');
  const nearRoad = (x: number, n: number) => others.some((r) => {
    for (let i = 0; i + 2 < r.p.length; i += 2) {
      const ax = r.p[i], an = r.p[i + 1], bx = r.p[i + 2], bn = r.p[i + 3];
      if (Math.max(ax, bx) < x - 20 || Math.min(ax, bx) > x + 20 || Math.max(an, bn) < n - 20 || Math.min(an, bn) > n + 20) continue;
      const dx = bx - ax, dn = bn - an, L = dx * dx + dn * dn, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / L)) : 0;
      if (Math.hypot(x - ax - dx * t, n - an - dn * t) < r.w / 2 + 3) return true;
    }
    return false;
  });
  {
    const off = HALF + SIDEWALK + 0.3, step = 2.5;
    for (let s = 6; s + step < LENGTH - 30; s += step) {
      if (s > 358 && s < 390) continue; // mur peint
      if (s > 108 && s < 128) continue; // pizzeria
      const a = along(s), b = along(s + step);
      const ax = a.x - a.ex * off, an = a.n - a.en * off, bx = b.x - b.ex * off, bn = b.n - b.en * off;
      if (nearRoad((ax + bx) / 2, (an + bn) / 2) || collider.inside(ax, -an) || collider.inside(bx, -bn)) continue;
      const ga = ground(ax, -an), gb = ground(bx, -bn);
      const gate = Math.floor(s / step) % 11 === 5;
      const color = gate ? DARK : new THREE.Color().setHSL(0.1, 0.42, 0.82 + ((Math.floor(s / 30) % 3) * 0.03));
      boxAt(plain, (ax + bx) / 2, -(an + bn) / 2, 0.3, step + 0.05, Math.min(ga, gb) - 0.3, Math.max(ga, gb) + (gate ? 2.0 : 2.3), color, Math.atan2(-(bn - an), bx - ax) + Math.PI / 2);
      collider.addBuilding([ax - 0.15, an - 0.15, bx + 0.15, bn - 0.15, bx + 0.15, bn + 0.15, ax - 0.15, an + 0.15]);
    }
  }

  // --- Promenade côté mer : grandes dalles grises, garde-corps au-dessus du sable.
  type Cut = { x: number; n: number; ex: number; en: number; tx: number; tn: number; y: number; s: number };
  const land = data.land;
  const onLand = (x: number, n: number) => land.some((p) => { let hit = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > n) !== (p[j + 1] > n) && x < ((p[j] - p[i]) * (n - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) hit = !hit; return hit; });
  const cuts: Cut[] = [];
  for (let s = 0; s <= LENGTH - 20; s += 3) {
    const k = along(s);
    if (!onLand(k.x + k.ex * (HALF + PROMENADE), k.n + k.en * (HALF + PROMENADE))) { cuts.push({ ...k, y: NaN, s }); continue; }
    cuts.push({ ...k, y: ground(k.x + k.ex * HALF, -(k.n + k.en * HALF)) + 0.17, s });
  }
  const path = new MeshBuilder();
  const railing = builder(mat());
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], c = cuts[i + 1];
    if (Number.isNaN(a.y) || Number.isNaN(c.y)) continue;
    const pt = (k: Cut, d: number): [number, number] => [k.x + k.ex * (HALF + d), k.n + k.en * (HALF + d)];
    const q = [pt(a, 0), pt(a, PROMENADE), pt(c, PROMENADE), pt(c, 0)], y = [a.y, a.y, c.y, c.y];
    const ids = q.map(([x, n], j) => path.vertex(x, y[j], -n, WHITE, 1, x / 6, n / 6));
    path.triangle(ids[0], ids[1], ids[2]); path.triangle(ids[0], ids[2], ids[3]);
    // Parement côté sable (bord de la dalle jusqu'au sol de la plage).
    const [ox, on] = pt(a, PROMENADE), [px, pn] = pt(c, PROMENADE);
    const w0 = plain.vertex(ox, Math.min(ground(ox, -on), a.y) - 0.6, -on, new THREE.Color(0xb9b3a8), 0.8), w1 = plain.vertex(px, Math.min(ground(px, -pn), c.y) - 0.6, -pn, new THREE.Color(0xb9b3a8), 0.8);
    const w2 = plain.vertex(px, c.y, -pn, new THREE.Color(0xb9b3a8)), w3 = plain.vertex(ox, a.y, -on, new THREE.Color(0xb9b3a8));
    plain.triangle(w0, w1, w2); plain.triangle(w0, w2, w3);
    // Garde-corps : poteaux tous les 3 m, main courante et lisse.
    const [rx, rn] = pt(a, PROMENADE - 0.25), [sx, sn] = pt(c, PROMENADE - 0.25);
    boxAt(railing, rx, -rn, 0.09, 0.09, a.y, a.y + 1.1, RAIL);
    beam(railing, [rx, a.y + 1.05, -rn], [sx, c.y + 1.05, -sn], 0.07, RAIL);
    beam(railing, [rx, a.y + 0.55, -rn], [sx, c.y + 0.55, -sn], 0.04, RAIL);
    collider.addBuilding([rx - 0.12, rn - 0.12, sx + 0.12, sn - 0.12, sx + 0.12, sn + 0.12, rx - 0.12, rn + 0.12]);
  }
  const pathMesh = new THREE.Mesh(path.build(), new THREE.MeshLambertMaterial({ map: slabs(), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  pathMesh.receiveShadow = true;
  scene.add(pathMesh);

  // --- Lampadaires gris au mât courbe, palmiers, bancs, corbeilles, cabines.
  const trees: [string, number, number, number][] = [];
  const lamps = builder(mat());
  for (const k of cuts) {
    if (Number.isNaN(k.y)) continue;
    const at = (d: number): [number, number] => [k.x + k.ex * (HALF + d), k.n + k.en * (HALF + d)];
    const step = Math.round(k.s);
    if (step % 33 === 0) {
      const [x, n] = at(0.8);
      let prev: [number, number, number] = [x, k.y, -n];
      for (let j = 1; j <= 8; j++) { // mât qui se courbe vers la chaussée
        const t = j / 8, lean = 2.6 * t * t, h = k.y + 10.5 * t;
        const next: [number, number, number] = [x - k.ex * lean, h, -(n - k.en * lean)];
        beam(lamps, prev, next, 0.16 - 0.05 * t, POLE); prev = next;
      }
      boxAt(lamps, prev[0] - k.ex * 0.5, prev[2] + k.en * 0.5, 0.9, 0.38, prev[1] - 0.18, prev[1] + 0.05, DARK, Math.atan2(k.en, k.ex));
      beam(lamps, [x - k.ex * 0.4, k.y + 6.2, -(n - k.en * 0.4)], [x - k.ex * 1.6, k.y + 6.6, -(n - k.en * 1.6)], 0.06, POLE); // petite ailette
      post(x, n);
    }
    if ((k.s > 300 ? step % 27 === 12 : step % 90 === 45)) {
      const [x, n] = at(1.7);
      trees.push(['palm', x, n, 1.0 + (step % 4) * 0.08]);
    }
    if (step % 45 === 21) { // banc tourné vers la mer
      const [x, n] = at(PROMENADE - 1.6);
      const ang = Math.atan2(-k.tn, k.tx);
      boxAt(plain, x, -n, 1.9, 0.5, k.y + 0.4, k.y + 0.48, new THREE.Color(0x6b5a48), ang);
      boxAt(plain, x - k.ex * 0.25, -(n - k.en * 0.25), 1.9, 0.08, k.y + 0.48, k.y + 0.95, new THREE.Color(0x6b5a48), ang);
      for (const d of [-0.8, 0.8]) boxAt(plain, x + k.tx * d, -(n + k.tn * d), 0.1, 0.45, k.y, k.y + 0.4, DARK, ang);
    }
    if (step % 54 === 9) {
      const [x, n] = at(1.1);
      boxAt(plain, x, -n, 0.5, 0.5, k.y, k.y + 0.9, new THREE.Color(0x4a4d52));
    }
  }
  for (const [s, color] of [[331, 0xc8262c], [335, 0x2f5fa8]] as [number, number][]) {
    const k = along(s), x = k.x + k.ex * (HALF + 5.2), n = k.n + k.en * (HALF + 5.2), y = ground(k.x + k.ex * HALF, -(k.n + k.en * HALF)) + 0.17;
    boxAt(plain, x, -n, 2.4, 2.4, y, y + 2.5, new THREE.Color(color), Math.atan2(-k.tn, k.tx));
    boxAt(plain, x, -n, 2.8, 2.8, y + 2.5, y + 2.7, WHITE, Math.atan2(-k.tn, k.tx));
    post(x, n, 1.2);
  }

  // --- Passages piétons jaunes.
  const zebra = builder(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const yellow = new THREE.Color(0xe3c443);
  for (const s of [22, 150, 395, 462, 600]) {
    const k = along(s);
    for (let d = -HALF + 0.4; d < HALF - 0.3; d += 1.1) {
      const cx = k.x + k.ex * (d + 0.3), cn = k.n + k.en * (d + 0.3), y = ground(cx, -cn) + 0.16;
      const corners = [[-1.5, 0], [1.5, 0], [1.5, 0.6], [-1.5, 0.6]].map(([u, v]) => [cx + k.tx * u + k.ex * v, cn + k.tn * u + k.en * v]);
      const ids = corners.map(([x, n]) => zebra.vertex(x, y, -n, yellow));
      zebra.triangle(ids[0], ids[1], ids[2]); zebra.triangle(ids[0], ids[2], ids[3]);
    }
  }

  for (const [b, material] of meshes) {
    const mesh = new THREE.Mesh(b.build(), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Sol praticable de la promenade.
  const promenadeGround = (x: number, z: number): number | null => {
    const n = -z;
    if (x < 360 || x > 850 || n < 2330 || n > 2890) return null;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], c = cuts[i + 1];
      if (Number.isNaN(a.y) || Number.isNaN(c.y)) continue;
      if (Math.abs(a.n - n) > 6 && Math.abs(c.n - n) > 6) continue;
      const tx = c.x - a.x, tn = c.n - a.n, L = tx * tx + tn * tn;
      const t = ((x - a.x) * tx + (n - a.n) * tn) / L;
      if (t < 0 || t > 1) continue;
      const d = (x - a.x) * a.ex + (n - a.n) * a.en - HALF;
      if (d < 0 || d > PROMENADE - 0.3) continue;
      return a.y + (c.y - a.y) * t;
    }
    return null;
  };
  const towerZone = tower ? grownRing(tower, 3) : null;
  return {
    ground: promenadeGround,
    keepTree: (x, n) => promenadeGround(x, -n) === null && !(towerZone && inRing(towerZone, x, n)),
    trees,
  };
}
