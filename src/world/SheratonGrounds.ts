import * as THREE from 'three';
import type { Collider } from './Collider';
import { type Ground, type Ring, boxAt, canvasTexture, findFootprint, lowestGround } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';
import type { WorldData } from './WorldData';

/**
 * Abords de l'hôtel Sheraton (le bâtiment lui-même est dans Landmarks.ts et n'est pas modifié).
 *
 * Sources : voies de service OpenStreetMap (allée d'entrée et sa voie de retour depuis le boulevard Victor Hugo,
 * allées des deux parkings) et vue satellite de Houssem pour l'organisation : pelouses plantées de palmiers le
 * long du boulevard et entre les deux voies de l'allée, ombrières blanches sur les deux parkings, piscine
 * extérieure au nord-ouest, court de tennis au nord sur le toit du socle, parvis devant l'entrée.
 * Les clôtures, le poste de garde, la marquise et les mâts sont placés d'après cette organisation : leurs
 * détails (hauteurs, motifs) sont des choix de reconstitution, aucune photo rapprochée ne les montre.
 */

type P = [number, number];

const SITE_ANGLE = Math.atan2(12, 50); // orientation du socle (OSM) : la trame du site
const FENCE_OFFSET = 6.2;              // clôture : 3 m de demi-chaussée + 3,2 m de trottoir au nord du boulevard
const WEST_EDGE = 199;                 // limite ouest de la propriété
const GRASS = new THREE.Color(0x6f9a45);
const PAVING = new THREE.Color(0xd8d0bf);
const ASPHALT = new THREE.Color(0x6e6b66);
const WHITE = new THREE.Color(0xf3f2ee);
const STEEL = new THREE.Color(0x4a4f54);

function grassTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128);
    let seed = 3;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 900; i++) {
      const v = 200 + Math.floor(r() * 55);
      ctx.fillStyle = `rgba(${v - 30},${v},${v - 60},0.5)`;
      ctx.fillRect(r() * 128, r() * 128, 1 + r() * 2, 2 + r() * 3);
    }
  });
}

/** Grille en fer forgé noire (barreaux à pointes) sur fond transparent. */
function railing(): THREE.CanvasTexture {
  const texture = canvasTexture(128, 64, (ctx) => {
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = '#1e2124';
    ctx.fillRect(0, 4, 128, 4); ctx.fillRect(0, 54, 128, 4);
    for (let x = 4; x < 128; x += 11) {
      ctx.fillRect(x, 0, 3, 64);
      ctx.beginPath(); ctx.moveTo(x - 2, 4); ctx.lineTo(x + 1.5, -3); ctx.lineTo(x + 5, 4); ctx.fill();
    }
  });
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Grillage du court de tennis (vert foncé, mailles losanges). */
function wireMesh(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(30,60,40,0.9)'; ctx.lineWidth = 1.5;
    for (let k = -64; k < 128; k += 8) {
      ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + 64, 64); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(k + 64, 0); ctx.lineTo(k, 64); ctx.stroke();
    }
  });
}

/** Drapeau algérien : vert et blanc, croissant et étoile rouges. */
function algerianFlag(): THREE.CanvasTexture {
  return canvasTexture(192, 128, (ctx) => {
    ctx.fillStyle = '#006233'; ctx.fillRect(0, 0, 96, 128);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(96, 0, 96, 128);
    ctx.fillStyle = '#d21034';
    ctx.beginPath(); ctx.arc(96, 64, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(104, 64, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#006233'; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 96, 128); ctx.clip();
    ctx.beginPath(); ctx.arc(104, 64, 26, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#d21034'; ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5 + Math.PI / 2, rad = k % 2 ? 7 : 17;
      ctx.lineTo(112 + Math.cos(a) * rad, 64 + Math.sin(a) * rad);
    }
    ctx.fill();
  }, false);
}

function pointInRing(x: number, n: number, ring: P[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, ni] = ring[i], [xj, nj] = ring[j];
    if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) hit = !hit;
  }
  return hit;
}

function distToLine(x: number, n: number, line: P[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, an] = line[i], [bx, bn] = line[i + 1];
    const dx = bx - ax, dn = bn - an, l2 = dx * dx + dn * dn || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, n - an - dn * t));
  }
  return best;
}

/** Ligne décalée vers sa gauche (offset > 0) ou sa droite, avec des normales lissées aux sommets. */
function offsetLine(line: P[], offset: number): P[] {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dn = b[1] - a[1], l = Math.hypot(dx, dn) || 1;
    return [p[0] - (dn / l) * offset, p[1] + (dx / l) * offset];
  });
}

/** Rééchantillonne une ligne tous les `step` mètres, en retirant `trim` mètres à chaque bout. */
function resample(line: P[], step: number, trim = 0): P[] {
  const lengths = [0];
  for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const total = lengths[lengths.length - 1], out: P[] = [];
  const count = Math.max(1, Math.round((total - trim * 2) / step));
  for (let k = 0; k <= count; k++) {
    const s = trim + (k / count) * (total - trim * 2);
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < s) i++;
    const t = (s - lengths[i - 1]) / ((lengths[i] - lengths[i - 1]) || 1);
    out.push([line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]);
  }
  return out;
}

const pairs = (p: number[]): P[] => { const out: P[] = []; for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]); return out; };

/** La voie OSM la plus proche d'un point de départ donné (pour retrouver les allées par leur extrémité). */
function roadFrom(data: WorldData, x: number, n: number): P[] | null {
  for (const road of data.roads) {
    const line = pairs(road.p);
    const [sx, sn] = line[0], [ex, en] = line[line.length - 1];
    if (Math.hypot(sx - x, sn - n) < 1.5) return line;
    if (Math.hypot(ex - x, en - n) < 1.5) return line.reverse();
  }
  return null;
}

export interface SheratonGrounds { keepTree: (x: number, n: number) => boolean; palms: [number, number, number][]; }

export function buildSheratonGrounds(scene: THREE.Scene, data: WorldData, ground: Ground, collider: Collider): SheratonGrounds {
  const tower = findFootprint(data, 328.6, 774.8), bubble = findFootprint(data, 281.8, 755.8);
  const link = findFootprint(data, 303.9, 765.8), podium = findFootprint(data, 323.3, 823.5);
  const hotel = [tower, bubble, link, podium].filter((r): r is Ring => r !== null);

  // --- Clôture le long du boulevard Victor Hugo (côté nord), de la limite ouest jusqu'à la fourche est.
  const boulevard: P[] = [];
  for (const road of data.roads) {
    if (road.n !== 'Boulevard Victor Hugo') continue;
    for (const p of pairs(road.p)) if (p[0] >= 190 && p[0] <= 357 && !boulevard.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1)) boulevard.push(p);
  }
  boulevard.sort((a, b) => a[0] - b[0]);
  const fence = offsetLine(boulevard, FENCE_OFFSET).filter(([x]) => x >= WEST_EDGE - 0.5);
  const fenceAt = (x: number) => { // n de la clôture à l'abscisse x
    for (let i = 0; i + 1 < fence.length; i++) if (fence[i][0] <= x && x <= fence[i + 1][0]) return fence[i][1] + (fence[i + 1][1] - fence[i][1]) * (x - fence[i][0]) / (fence[i + 1][0] - fence[i][0]);
    return fence[x < fence[0][0] ? 0 : fence.length - 1][1];
  };
  // Propriété : au nord de la clôture, à l'est de la limite ouest, jusqu'au nord de la piscine et des parkings.
  const property: P[] = [[WEST_EDGE, fenceAt(WEST_EDGE)], ...fence.filter(([x]) => x > WEST_EDGE), [356, fenceAt(356)], [362, 722], [370, 727], [387, 732], [404, 736], [404, 800], [300, 806], [238, 806], [WEST_EDGE, 800]];

  // --- Voies OSM du site : allée d'entrée et voie de retour, allées des parkings.
  const site = data.roads.filter((road) => { const l = pairs(road.p); return l.some(([x, n]) => x > 190 && x < 420 && n > 655 && n < 870); })
    .map((road) => ({ line: pairs(road.p), half: road.w / 2 }));
  const driveIn = roadFrom(data, 216, 668), driveOut = roadFrom(data, 298, 732);
  const aisles = {
    west: [roadFrom(data, 204, 772), roadFrom(data, 217, 780), roadFrom(data, 230, 792)],
    east: [roadFrom(data, 357, 743), roadFrom(data, 364, 793), roadFrom(data, 380, 796)],
  };

  // --- Ombrières blanches des parkings : une voile de 5 m de chaque côté des allées (places de 5 m).
  const shade = new MeshBuilder(), posts = new MeshBuilder();
  const strips: [P[] | null, number][] = [
    [aisles.west[0], 1], [aisles.west[1], -1], [aisles.west[1], 1], [aisles.west[2], -1], [aisles.west[2], 1],
    [aisles.east[0], 1], [aisles.east[1], -1], [aisles.east[1], 1], [aisles.east[2], -1], [aisles.east[2], 1],
  ];
  const canopyZones: P[][] = [];
  for (const [line, side] of strips) {
    if (!line) continue;
    const straight = line.filter(([, n]) => n < 789 || line === aisles.west[2]);
    // « side » : 1 = côté est de l'allée, -1 = côté ouest.
    const dx = straight[straight.length - 1][0] - straight[0][0], dn = straight[straight.length - 1][1] - straight[0][1];
    const leftIsEast = -dn > 0 ? 1 : -1; // la gauche de la direction (−dn, dx) pointe-t-elle vers l'est ?
    void dx;
    const centre = resample(offsetLine(straight, 4.75 * side * leftIsEast), 5, 3);
    const inner = offsetLine(centre, -2.5 * side * leftIsEast), outer = offsetLine(centre, 2.5 * side * leftIsEast);
    canopyZones.push(centre);
    for (let i = 0; i + 1 < centre.length; i++) {
      const y = (p: P, h: number) => ground(p[0], -p[1]) + h;
      const a = shade.vertex(inner[i][0], y(inner[i], 3.1), -inner[i][1], WHITE), b = shade.vertex(inner[i + 1][0], y(inner[i + 1], 3.1), -inner[i + 1][1], WHITE);
      const c = shade.vertex(outer[i + 1][0], y(outer[i + 1], 2.6), -outer[i + 1][1], WHITE, 0.9), d = shade.vertex(outer[i][0], y(outer[i], 2.6), -outer[i][1], WHITE, 0.9);
      shade.triangle(a, b, c); shade.triangle(a, c, d);
      // Poutre de rive et poteau côté fond de place.
      const g = ground(outer[i][0], -outer[i][1]);
      boxAt(posts, outer[i][0], -outer[i][1], 0.14, 0.14, g, g + 2.65, STEEL);
      collider.addBuilding([outer[i][0] - 0.12, outer[i][1] - 0.12, outer[i][0] + 0.12, outer[i][1] - 0.12, outer[i][0] + 0.12, outer[i][1] + 0.12, outer[i][0] - 0.12, outer[i][1] + 0.12]);
    }
    const last = outer[outer.length - 1], g = ground(last[0], -last[1]);
    boxAt(posts, last[0], -last[1], 0.14, 0.14, g, g + 2.65, STEEL);
  }
  const canopy = new THREE.Mesh(shade.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  canopy.castShadow = true;
  scene.add(canopy);

  // --- Piscine extérieure au nord-ouest (vue satellite : bassin d'environ 20 × 7 m, plage dallée autour).
  const pool: P = [262, 792], deck = { w: 32, d: 18 }, angle = -SITE_ANGLE;
  const local = (u: number, v: number): P => [pool[0] + u * Math.cos(SITE_ANGLE) - v * Math.sin(SITE_ANGLE), pool[1] + u * Math.sin(SITE_ANGLE) + v * Math.cos(SITE_ANGLE)];
  const inDeck = (x: number, n: number) => {
    const dx = x - pool[0], dn = n - pool[1];
    const u = dx * Math.cos(SITE_ANGLE) + dn * Math.sin(SITE_ANGLE), v = -dx * Math.sin(SITE_ANGLE) + dn * Math.cos(SITE_ANGLE);
    return Math.abs(u) < deck.w / 2 && Math.abs(v) < deck.d / 2;
  };
  const poolBuilder = new MeshBuilder();
  const deckY = Math.max(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const [x, n] = local(a * deck.w / 2, b * deck.d / 2); return ground(x, -n); })) + 0.25;
  boxAt(poolBuilder, pool[0], -pool[1], deck.w, deck.d, deckY - 3, deckY, new THREE.Color(0xd9c7a6), angle);
  boxAt(poolBuilder, pool[0], -pool[1], 21.2, 8.2, deckY, deckY + 0.06, WHITE, angle); // margelle
  const water = new THREE.Mesh(new THREE.PlaneGeometry(20, 7), new THREE.MeshStandardMaterial({ color: 0x2fb4e6, roughness: 0.08, metalness: 0.1, emissive: 0x0b3a55 }));
  water.rotation.x = -Math.PI / 2; water.rotation.z = SITE_ANGLE;
  water.position.set(pool[0], deckY + 0.08, -pool[1]);
  scene.add(water);
  for (let k = 0; k < 8; k++) { // transats blancs et parasols, côté sud du bassin
    const [x, n] = local(-12 + k * 3.4, -6.2);
    boxAt(poolBuilder, x, -n, 0.7, 1.9, deckY, deckY + 0.35, WHITE, angle);
    if (k % 2 === 0) {
      boxAt(poolBuilder, x + 1.7, -n, 0.06, 0.06, deckY, deckY + 2.3, STEEL, angle);
      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.4, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xf1ead8, side: THREE.DoubleSide }));
      umbrella.position.set(x + 1.7, deckY + 2.45, -n);
      umbrella.castShadow = true;
      scene.add(umbrella);
    }
  }
  for (let k = 0; k < 5; k++) { const [x, n] = local(-10 + k * 5, 6.4); boxAt(poolBuilder, x, -n, 0.7, 1.9, deckY, deckY + 0.35, WHITE, angle); }
  // Garde-corps vitré autour de la plage (bord de la terrasse, plus haute que le terrain au sud).
  const glassRail = new MeshBuilder();
  for (const [u0, v0, u1, v1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    const [ax, an] = local(u0 * deck.w / 2, v0 * deck.d / 2), [bx, bn] = local(u1 * deck.w / 2, v1 * deck.d / 2);
    const mid: P = [(ax + bx) / 2, (an + bn) / 2], len = Math.hypot(bx - ax, bn - an);
    boxAt(glassRail, mid[0], -mid[1], len, 0.05, deckY, deckY + 1.1, new THREE.Color(0x9fc9d3), Math.atan2(-(bn - an), bx - ax));
    boxAt(poolBuilder, mid[0], -mid[1], len, 0.08, deckY + 1.1, deckY + 1.16, STEEL, Math.atan2(-(bn - an), bx - ax));
    collider.addBuilding([ax, an, bx, bn, bx + 0.01, bn + 0.3, ax + 0.01, an + 0.3]);
  }
  const deckRing: P[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => local(a * deck.w / 2, b * deck.d / 2));
  collider.addBuilding(deckRing.flat());
  scene.add(new THREE.Mesh(glassRail.build(), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })));

  // --- Court de tennis sur le toit du socle (satellite : court vert à lignes blanches, entouré de grillage).
  const tennis = new MeshBuilder();
  const fenceMeshes = new MeshBuilder();
  if (podium) {
    const roof = lowestGround(podium, ground) - 0.5 + 9;
    const c: P = [323.5 + 5 * Math.sin(SITE_ANGLE), 823.5 - 5 * Math.cos(SITE_ANGLE)];
    const at = (u: number, v: number): P => [c[0] + u * Math.cos(SITE_ANGLE) - v * Math.sin(SITE_ANGLE), c[1] + u * Math.sin(SITE_ANGLE) + v * Math.cos(SITE_ANGLE)];
    boxAt(tennis, c[0], -c[1], 34.8, 17.6, roof, roof + 0.06, new THREE.Color(0x4f8a4a), angle);
    boxAt(tennis, c[0], -c[1], 23.77, 10.97, roof + 0.06, roof + 0.08, new THREE.Color(0x3f7a5a), angle);
    const line = (u0: number, v0: number, u1: number, v1: number) => {
      const [ax, an] = at(u0, v0), [bx, bn] = at(u1, v1);
      const len = Math.hypot(bx - ax, bn - an) + 0.05;
      boxAt(tennis, (ax + bx) / 2, -(an + bn) / 2, len, 0.06, roof + 0.08, roof + 0.095, WHITE, Math.atan2(-(bn - an), bx - ax));
    };
    const L = 23.77 / 2, W = 10.97 / 2, S = 8.23 / 2, SV = 6.4;
    line(-L, -W, L, -W); line(-L, W, L, W); line(-L, -S, L, -S); line(-L, S, L, S);
    line(-L, -W, -L, W); line(L, -W, L, W); line(-SV, -S, -SV, S); line(SV, -S, SV, S); line(-SV, 0, SV, 0);
    // Filet.
    const [nx, nn] = at(0, 0);
    boxAt(tennis, nx, -nn, 0.04, 12.8, roof + 0.08, roof + 0.95, new THREE.Color(0x222222), angle);
    boxAt(tennis, nx, -nn, 0.06, 12.8, roof + 0.95, roof + 1.02, WHITE, angle);
    // Grillage de 4 m sur poteaux.
    for (const [u0, v0, u1, v1] of [[-17.4, -8.8, 17.4, -8.8], [17.4, -8.8, 17.4, 8.8], [17.4, 8.8, -17.4, 8.8], [-17.4, 8.8, -17.4, -8.8]]) {
      const [ax, an] = at(u0, v0), [bx, bn] = at(u1, v1);
      const len = Math.hypot(bx - ax, bn - an), steps = Math.round(len / 3);
      const v0i = fenceMeshes.vertex(ax, roof, -an, WHITE, 1, 0, 0), v1i = fenceMeshes.vertex(bx, roof, -bn, WHITE, 1, len / 2, 0);
      const v2i = fenceMeshes.vertex(bx, roof + 4, -bn, WHITE, 1, len / 2, 2), v3i = fenceMeshes.vertex(ax, roof + 4, -an, WHITE, 1, 0, 2);
      fenceMeshes.triangle(v0i, v1i, v2i); fenceMeshes.triangle(v0i, v2i, v3i);
      for (let k = 0; k <= steps; k++) boxAt(tennis, ax + (bx - ax) * k / steps, -(an + (bn - an) * k / steps), 0.08, 0.08, roof, roof + 4, new THREE.Color(0x2d4a35));
    }
    // Locaux techniques sur la partie nord du toit.
    for (const [u, v, w, d, h] of [[-12, 12.5, 6, 3, 2.2], [-3, 13, 4, 2.5, 1.6], [6, 12.8, 8, 3, 2.6], [14, 12, 3, 3, 1.8]]) {
      const [x, n] = at(u, v);
      boxAt(tennis, x, -n, w, d, roof, roof + h, new THREE.Color(0xd5d3cc), angle);
    }
  }
  scene.add(new THREE.Mesh(tennis.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  const wire = wireMesh(); wire.repeat.set(1, 1);
  scene.add(new THREE.Mesh(fenceMeshes.build(), new THREE.MeshLambertMaterial({ map: wire, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })));

  // --- Entrée principale : marquise blanche devant la façade sud-est de la liaison, portes vitrées, mâts.
  const props = new MeshBuilder();
  const entrance: P = [309, 760], facing = Math.atan2(8, 22); // façade (298,756) → (320,764)
  const nrm: P = [Math.sin(facing), -Math.cos(facing)];       // vers le sud-est, côté allée
  const along: P = [Math.cos(facing), Math.sin(facing)];
  const g0 = ground(entrance[0], -entrance[1]);
  const out = (d: number, s = 0): P => [entrance[0] + nrm[0] * d + along[0] * s, entrance[1] + nrm[1] * d + along[1] * s];
  const ang = -facing;
  { const [x, n] = out(0.15); boxAt(props, x, -n, 9, 0.25, g0, g0 + 3.4, new THREE.Color(0x2c3e48), ang); }
  { const [x, n] = out(0.25); boxAt(props, x, -n, 9.4, 0.3, g0 + 3.4, g0 + 3.7, WHITE, ang); }
  { const [x, n] = out(4.2); boxAt(props, x, -n, 14, 8.4, g0 + 4.6, g0 + 5.1, WHITE, ang); }
  for (const s of [-6, 6]) { const [x, n] = out(7.6, s); boxAt(props, x, -n, 0.35, 0.35, ground(x, -n), g0 + 4.6, WHITE); collider.addBuilding([x - 0.25, n - 0.25, x + 0.25, n - 0.25, x + 0.25, n + 0.25, x - 0.25, n + 0.25]); }
  // Jardinières de part et d'autre des portes.
  for (const s of [-6.2, 6.2]) { const [x, n] = out(1.2, s); boxAt(props, x, -n, 2.2, 1.0, g0, g0 + 0.6, new THREE.Color(0xcfc6b2), ang); }
  const flagTexture = algerianFlag();
  for (const s of [-4, 0, 4]) {
    const [x, n] = out(12.5, s), g = ground(x, -n);
    boxAt(props, x, -n, 0.12, 0.12, g, g + 9, new THREE.Color(0xdcdcdc));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshLambertMaterial({ map: flagTexture, side: THREE.DoubleSide }));
    flag.position.set(x + along[0] * 1.25, g + 8.1, -(n + along[1] * 1.25));
    flag.rotation.y = facing;
    scene.add(flag);
  }

  // --- Poste de garde et barrière à l'entrée de l'allée.
  if (driveIn) {
    const [gx, gn] = driveIn[0], gateN = fenceAt(gx);
    const booth: P = [gx + 8.5, gateN + 3.5], gb = ground(booth[0], -booth[1]);
    boxAt(props, booth[0], -booth[1], 2.6, 2.6, gb, gb + 2.6, WHITE);
    boxAt(props, booth[0], -booth[1], 2.7, 2.7, gb + 1.1, gb + 2.2, new THREE.Color(0x30424c));
    boxAt(props, booth[0], -booth[1], 3.4, 3.4, gb + 2.6, gb + 2.85, WHITE);
    collider.addBuilding([booth[0] - 1.4, booth[1] - 1.4, booth[0] + 1.4, booth[1] - 1.4, booth[0] + 1.4, booth[1] + 1.4, booth[0] - 1.4, booth[1] + 1.4]);
    // Barrière levante rouge et blanche, en travers de la voie d'entrée.
    const post: P = [gx + 4.2, gateN + 1.0], gp = ground(post[0], -post[1]);
    boxAt(props, post[0], -post[1], 0.4, 0.4, gp, gp + 1.1, new THREE.Color(0xd8d8d8));
    for (let k = 0; k < 6; k++) boxAt(props, post[0] - 0.6 - k * 0.9, -post[1], 0.9, 0.12, gp + 0.95, gp + 1.07, k % 2 ? WHITE : new THREE.Color(0xc8282c));
  }
  const propsMesh = new THREE.Mesh(props.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  propsMesh.castShadow = true;
  scene.add(propsMesh);

  // --- Clôture : muret blanc, grille noire, piliers ; ouvertures pour l'allée et pour le portillon piéton.
  const wall = new MeshBuilder(), grille = new MeshBuilder();
  const gates: [number, number][] = [[driveIn ? driveIn[0][0] - 6 : 205, driveIn ? driveIn[0][0] + 12 : 228], [259.5, 263]];
  const fenceRun = (points: P[]) => {
    const line = resample(points, 3.5);
    let along = 0;
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, an] = line[i], [bx, bn] = line[i + 1];
      const mx = (ax + bx) / 2, mn = (an + bn) / 2;
      const open = gates.some(([x0, x1]) => mx > x0 && mx < x1) && points === fence;
      const len = Math.hypot(bx - ax, bn - an), angle2 = Math.atan2(-(bn - an), bx - ax);
      const ga = ground(ax, -an), gbb = ground(bx, -bn), g = Math.min(ga, gbb);
      if (!open) {
        boxAt(wall, mx, -mn, len + 0.02, 0.35, g - 0.4, Math.max(ga, gbb) + 0.6, WHITE, angle2);
        const v0 = grille.vertex(ax, ga + 0.6, -an, WHITE, 1, along / 3.5, 0), v1 = grille.vertex(bx, gbb + 0.6, -bn, WHITE, 1, (along + len) / 3.5, 0);
        const v2 = grille.vertex(bx, gbb + 2.1, -bn, WHITE, 1, (along + len) / 3.5, 1), v3 = grille.vertex(ax, ga + 2.1, -an, WHITE, 1, along / 3.5, 1);
        grille.triangle(v0, v1, v2); grille.triangle(v0, v2, v3);
        const ox = -(bn - an) / len * 0.25, on = (bx - ax) / len * 0.25;
        collider.addBuilding([ax - ox, an - on, bx - ox, bn - on, bx + ox, bn + on, ax + ox, an + on]);
      }
      const prevOpen = i > 0 && gates.some(([x0, x1]) => { const px = (line[i - 1][0] + ax) / 2; return px > x0 && px < x1; }) && points === fence;
      if (!open || !prevOpen) boxAt(wall, ax, -an, 0.55, 0.55, ga - 0.4, ga + 2.4, WHITE);
      along += len;
    }
    const [ex, en] = line[line.length - 1];
    boxAt(wall, ex, -en, 0.55, 0.55, ground(ex, -en) - 0.4, ground(ex, -en) + 2.4, WHITE);
  };
  fenceRun(fence);
  fenceRun([[WEST_EDGE, fenceAt(WEST_EDGE)], [WEST_EDGE, 712], [WEST_EDGE + 1, 760], [WEST_EDGE + 3, 795]]);
  const wallMesh = new THREE.Mesh(wall.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  wallMesh.castShadow = true;
  scene.add(wallMesh);
  scene.add(new THREE.Mesh(grille.build(), new THREE.MeshLambertMaterial({ map: railing(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })));
  scene.add(new THREE.Mesh(posts.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));

  // --- Sols : pelouses, parvis dallé et allée d'accès au parvis, chemin piéton depuis le portillon.
  const footpath: P[] = [[261.2, fenceAt(261.2)], [268, 712], [292, 744], [300, 752]];
  const forecourtDrive: P[] = driveOut ? [driveOut[0], [306, 740], [313, 750]] : [[300, 728], [306, 740], [313, 750]];
  const nearHotel = (x: number, n: number) => hotel.some((ring) => pointInRing(x, n, ring) || distToLine(x, n, [...ring, ring[0]]) < 8);
  const onRoad = (x: number, n: number, margin: number) => site.some(({ line, half }) => distToLine(x, n, line) < half + margin);
  const inCanopy = (x: number, n: number) => canopyZones.some((line) => distToLine(x, n, line) < 2.7) ||
    [...aisles.west, ...aisles.east].some((line) => line !== null && distToLine(x, n, line) < 2.4);
  const lawn = new MeshBuilder(), paving = new MeshBuilder();
  const classify = (x: number, n: number): string => {
    if (!pointInRing(x, n, property) || inDeck(x, n) || hotel.some((ring) => pointInRing(x, n, ring))) return '';
    if (distToLine(x, n, forecourtDrive) < 4.5) return 'drive';
    if (distToLine(x, n, footpath) < 1.5 && !onRoad(x, n, 0)) return 'path';
    if (onRoad(x, n, 0.6)) return '';
    if (nearHotel(x, n)) return 'path';
    if (!inCanopy(x, n) && n > fenceAt(x) + 0.4 && x > WEST_EDGE + 0.4) return 'lawn';
    return '';
  };
  // Bord exact d'une plage de même nature sur la ligne n : on part d'un point dedans (x) vers l'extérieur (dir).
  const edge = (x: number, n: number, kind: string, dir: number): number => {
    let inside = x, outside = x + dir * 0.75;
    for (let k = 0; k < 6 && classify(outside, n) === kind; k++) { inside = outside; outside += dir * 0.75; }
    if (classify(inside, n) !== kind) return x;
    for (let k = 0; k < 7; k++) { const mid = (inside + outside) / 2; if (classify(mid, n) === kind) inside = mid; else outside = mid; }
    return inside;
  };
  // Bandes de 1 m de haut ; chaque plage devient un trapèze dont les bords suivent ceux des allées et du parvis.
  const ROW = 1, STEP = 0.5;
  for (let n = 660; n < 808; n += ROW) {
    const cn = n + ROW / 2;
    let runStart = -1, runKind = '';
    const flush = (xEnd: number) => {
      if (runStart < 0 || !runKind) { runStart = -1; return; }
      const mid = (runStart + xEnd) / 2;
      const l0 = edge(Math.min(runStart + 0.25, mid), n + 0.02, runKind, -1), l1 = edge(Math.min(runStart + 0.25, mid), n + ROW - 0.02, runKind, -1);
      const r0 = edge(Math.max(xEnd - 0.25, mid), n + 0.02, runKind, 1), r1 = edge(Math.max(xEnd - 0.25, mid), n + ROW - 0.02, runKind, 1);
      const b = runKind === 'lawn' ? lawn : paving;
      const color = runKind === 'lawn' ? GRASS : runKind === 'drive' ? ASPHALT : PAVING;
      const lift = runKind === 'lawn' ? 0.09 : 0.1;
      const pieces = Math.max(1, Math.ceil(Math.max(r0 - l0, r1 - l1) / 6));
      for (let k = 0; k < pieces; k++) {
        const t0 = k / pieces, t1 = (k + 1) / pieces;
        const corners: P[] = [[l0 + (r0 - l0) * t0, n], [l0 + (r0 - l0) * t1, n], [l1 + (r1 - l1) * t1, n + ROW], [l1 + (r1 - l1) * t0, n + ROW]];
        const ids = corners.map(([x, nn]) => b.vertex(x, ground(x, -nn) + lift, -nn, color, 1, x / 4, nn / 4));
        b.triangle(ids[0], ids[1], ids[2]); b.triangle(ids[0], ids[2], ids[3]);
      }
      runStart = -1;
    };
    for (let x = 196; x <= 410; x += STEP) {
      const kind = x < 410 ? classify(x + STEP / 2, cn) : '';
      if (kind !== runKind) { flush(x); if (kind) runStart = x; runKind = kind; }
    }
  }
  const lawnMesh = new THREE.Mesh(lawn.build(), new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  lawnMesh.receiveShadow = true;
  scene.add(lawnMesh);
  const pavingMesh = new THREE.Mesh(paving.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  pavingMesh.receiveShadow = true;
  scene.add(pavingMesh);

  // --- Palmiers alignés : le long de la clôture, sur le terre-plein entre les deux voies de l'allée, en bordure
  // ouest, et aux angles de la piscine. Les arbres posés au hasard par le générateur sont retirés du site.
  const palms: [number, number, number][] = [];
  const isLawn = (x: number, n: number) => pointInRing(x, n, property) && !onRoad(x, n, 1.5) && !inCanopy(x, n) && !nearHotel(x, n) && !inDeck(x, n) &&
    distToLine(x, n, footpath) > 2.5 && distToLine(x, n, forecourtDrive) > 6;
  const plant = (x: number, n: number, i: number) => { if (isLawn(x, n) && !palms.some(([px, pn]) => Math.hypot(px - x, pn - n) < 6)) palms.push([x, n, 1.0 + ((i * 37) % 10) / 40]); };
  resample(offsetLine(fence, 3.2), 9).forEach(([x, n], i) => plant(x, n, i));
  if (driveIn && driveOut) {
    resample(driveIn, 10, 6).forEach(([x, n], i) => {
      const toward = driveOut.reduce((best, p) => (Math.hypot(p[0] - x, p[1] - n) < Math.hypot(best[0] - x, best[1] - n) ? p : best), driveOut[0]);
      const gap = distToLine(x, n, driveOut);
      if (gap > 6 && gap < 16) plant((x + toward[0]) / 2, (n + toward[1]) / 2, i + 50);
    });
  }
  for (let n = fenceAt(WEST_EDGE) + 5; n < 790; n += 9) plant(WEST_EDGE + 3.5, n, Math.round(n));
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [x, n] = local(a * (deck.w / 2 + 2.5), b * (deck.d / 2 + 2.5)); plant(x, n, a + b * 3 + 90); }

  return {
    keepTree: (x, n) => !pointInRing(x, n, property),
    palms,
  };
}
