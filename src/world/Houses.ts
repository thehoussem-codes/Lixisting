import * as THREE from 'three';
import type { MeshBuilder } from './MeshBuilder';
import type { FacadeStyle } from './Textures';

/**
 * Maisons individuelles : plus de bloc couvert de fenêtres répétées. Chaque emprise OSM classée « maison »
 * devient l'un de ces types, choisi de façon stable d'après son rang (toujours le même d'une partie à l'autre) :
 *
 *  - villa      : la villa algérienne du modèle fourni par Houssem (« Algerian villa ») : façade sur rue tirée d'un
 *                 rendu du modèle (garage à rideau, soubassement de pierre, porte, fenêtres à barreaux), vrai balcon
 *                 à balustres en saillie, dalle de toit débordante couleur terre cuite, pignons en brique ou enduits ;
 *  - finished   : villa enduite et peinte, peu d'ouvertures (garage, porte en fer, fenêtres à persiennes), balcon en
 *                 fer forgé, toit de tuiles à quatre pentes avec débord ;
 *  - unfinished : maison en cours de construction, typique des quartiers algériens : étage en brique creuse rouge,
 *                 ossature béton, poteaux et fers en attente sur la dalle ;
 *  - medina     : maison de la vieille ville (d'après le modèle « Casbah of Algiers house ») : volumes blancs
 *                 empilés, petites fenêtres grillées, porte cintrée bleue, terrasse à acrotère.
 *
 * La façade principale est le mur le plus proche d'une rue. Le type et les détails sont un décor plausible :
 * OpenStreetMap ne dit rien de l'aspect de chaque maison.
 */

type P = [number, number]; // x, n

export interface HouseContext {
  p: number[];                       // emprise, sens trigonométrique
  index: number;
  low: number; base: number; top: number;
  wall: THREE.Color; roofColor: THREE.Color;
  walls: (style: FacadeStyle | 'rail') => MeshBuilder;   // maillage texturé du style, dans le bloc du bâtiment
  solid: MeshBuilder;                // maillage à couleurs seules (toits, dalles, détails)
  roadDistance: (x: number, n: number) => number;
  oldTown: boolean;
}

const WHITE = new THREE.Color(0xffffff);
const TERRACOTTA = new THREE.Color(0xa8643c), CONCRETE = new THREE.Color(0xa9a59c), RUST = new THREE.Color(0x5a3a2a);
const SLAB = new THREE.Color(0xd9d4c6), LIME = [0xfbfaf4, 0xf4f1e6, 0xe6eef2, 0xf7f0de].map((c) => new THREE.Color(c));
const TANK = [0x3f6fae, 0xc9c9c4, 0x2f7d5b].map((c) => new THREE.Color(c));

function quad(b: MeshBuilder, a: P, c: P, y0: number, y1: number, color: THREE.Color, shade0: number, shade1: number, u0: number, u1: number, v0: number, v1: number): void {
  const i0 = b.vertex(a[0], y0, -a[1], color, shade0, u0, v0), i1 = b.vertex(c[0], y0, -c[1], color, shade0, u1, v0);
  const i2 = b.vertex(c[0], y1, -c[1], color, shade1, u1, v1), i3 = b.vertex(a[0], y1, -a[1], color, shade1, u0, v1);
  b.triangle(i0, i1, i2); b.triangle(i0, i2, i3);
}

/** Dalle horizontale (dessus, dessous, chants) sur un contour quelconque. */
function plate(b: MeshBuilder, ring: P[], y: number, thickness: number, color: THREE.Color): void {
  const flat = ring.flat();
  b.flatPolygon(flat, y, color);
  b.flatPolygon(flat, y - thickness, color);
  for (let i = 0; i < ring.length; i++) quad(b, ring[i], ring[(i + 1) % ring.length], y - thickness, y, color, 0.8, 0.9, 0, 0, 0, 0);
}

/** Contour décalé vers l'extérieur (sommets poussés le long de la bissectrice). */
export function grow(ring: P[], d: number): P[] {
  const n = ring.length;
  return ring.map(([x, y], i) => {
    const [ax, ay] = ring[(i + n - 1) % n], [bx, by] = ring[(i + 1) % n];
    let ix = x - ax, iy = y - ay, ox = bx - x, oy = by - y;
    const il = Math.hypot(ix, iy) || 1, ol = Math.hypot(ox, oy) || 1;
    ix /= il; iy /= il; ox /= ol; oy /= ol;
    // Normales extérieures (contour trigonométrique : l'extérieur est à droite du sens de parcours).
    let nx = iy + oy, ny = -ix - ox;
    const l = Math.hypot(nx, ny);
    if (l < 0.2) return [x + iy * d, y - ix * d] as P;
    nx /= l; ny /= l;
    const k = Math.min(2.2, 1 / Math.max(0.45, nx * iy - ny * ix)); // coin : on allonge pour garder le débord constant
    return [x + nx * d * k, y + ny * d * k] as P;
  });
}

function boxAt(b: MeshBuilder, x: number, n: number, half: number, y0: number, y1: number, color: THREE.Color): void {
  const c: P[] = [[x - half, n - half], [x + half, n - half], [x + half, n + half], [x - half, n + half]];
  for (let i = 0; i < 4; i++) quad(b, c[i], c[(i + 1) % 4], y0, y1, color, 0.8, 1, 0, 0, 0, 0);
  b.flatPolygon(c.flat(), y1, color);
}

export function buildHouse(h: HouseContext): void {
  const ring: P[] = [];
  for (let i = 0; i < h.p.length; i += 2) ring.push([h.p[i], h.p[i + 1]]);
  const count = ring.length;
  let area = 0, cx = 0, cn = 0;
  for (let i = 0; i < count; i++) { const [x1, n1] = ring[i], [x2, n2] = ring[(i + 1) % count]; area += x1 * n2 - x2 * n1; cx += x1 / count; cn += n1 / count; }
  area = Math.abs(area / 2);
  const lengths = ring.map((a, i) => Math.hypot(ring[(i + 1) % count][0] - a[0], ring[(i + 1) % count][1] - a[1]));

  // Façade principale : le mur d'au moins 4,5 m le plus proche d'une rue (à défaut, le plus long).
  let front = lengths.indexOf(Math.max(...lengths)), best = Infinity;
  for (let i = 0; i < count; i++) {
    if (lengths[i] < 4.5) continue;
    const j = (i + 1) % count;
    const d = h.roadDistance((ring[i][0] + ring[j][0]) / 2, (ring[i][1] + ring[j][1]) / 2);
    if (d < best - 0.5) { best = d; front = i; }
  }

  const hash = (Math.imul(h.index + 1, 2654435761) >>> 0) % 100;
  const complex = count > 8 || area > 420;
  const kind = h.oldTown ? 'medina' : complex ? 'finished' : hash < 42 ? 'villa' : hash < 70 ? 'finished' : 'unfinished';
  const storeys = Math.max(1, Math.round((h.top - h.base - 0.5) / 3));
  const storeyH = (h.top - h.base) / storeys;
  const level = (k: number) => h.base + k * storeyH;
  const paintedSides = kind !== 'villa' || hash % 3 !== 0;
  const tint = kind === 'medina' ? LIME[h.index % LIME.length] : h.wall;

  for (let i = 0; i < count; i++) {
    const a = ring[i], c = ring[(i + 1) % count], length = lengths[i];
    if (length < 0.05) continue;
    // Soubassement jusqu'au point bas du terrain.
    quad(h.walls('cement'), a, c, h.low - 1, h.base, WHITE, 0.7, 0.8, 0, Math.max(1, Math.round(length / 4)), 0, 0.3);
    const isFront = i === front;
    const wide = length > 16 ? 2 : 1;
    for (let k = 0; k < storeys; k++) {
      const y0 = level(k), y1 = level(k + 1), ground = k === 0;
      let style: FacadeStyle, color = WHITE, u = Math.max(1, Math.round(length / 4));
      if (kind === 'villa') {
        if (isFront) { style = ground ? 'villaGround' : 'villaUpper'; u = wide; }
        else if (paintedSides) { style = ground ? 'plaster' : 'houseSide'; color = tint; u = ground ? u : Math.floor(length / 6); }
        else style = ground ? 'cement' : 'brick';
      } else if (kind === 'unfinished') {
        if (isFront) { style = ground ? 'villaGround' : 'brickOpen'; u = wide; }
        else style = ground && hash % 2 === 0 ? 'cement' : 'brick';
      } else if (kind === 'finished') {
        if (isFront && length <= 22) { style = ground ? 'houseFront' : 'houseUpper'; u = wide; }
        else { style = ground ? 'plaster' : 'houseSide'; u = ground ? u : Math.floor(length / 6); }
        color = tint;
      } else {
        style = 'casbah'; color = tint; u = (k + i) % 2 === 0 ? Math.floor(length / 5) : 0;
      }
      if (kind === 'medina' && isFront && ground && length > 3.2) {
        // Porte cintrée au milieu de la façade, murs nus de part et d'autre.
        const t0 = 0.5 - 1.1 / length, t1 = 0.5 + 1.1 / length;
        const m0: P = [a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0], m1: P = [a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1];
        quad(h.walls('casbah'), a, m0, y0, y1, color, 0.88, 1, 0, 0, 0, 1);
        quad(h.walls('casbahDoor'), m0, m1, y0, y1, WHITE, 0.9, 1, 0, 1, 0, 1);
        quad(h.walls('casbah'), m1, c, y0, y1, color, 0.88, 1, 0, 0, 0, 1);
        continue;
      }
      quad(h.walls(style), a, c, y0, y1, color, ground ? 0.86 : 0.94, 1, 0, u, 0, 1);
    }

    // Balcon en saillie sur la façade principale, à chaque étage.
    if (isFront && kind !== 'medina' && kind !== 'unfinished' && length >= 5) {
      const dx = (c[0] - a[0]) / length, dn = (c[1] - a[1]) / length, ox = dn, on = -dx; // extérieur : à droite du sens de parcours
      const DEPTH = 0.9, from = 0.07, to = kind === 'villa' ? 0.93 : 0.55;
      for (let k = 1; k < storeys; k++) {
        const y = level(k);
        const s: P = [a[0] + dx * length * from, a[1] + dn * length * from], e: P = [a[0] + dx * length * to, a[1] + dn * length * to];
        const so: P = [s[0] + ox * DEPTH, s[1] + on * DEPTH], eo: P = [e[0] + ox * DEPTH, e[1] + on * DEPTH];
        plate(h.solid, [s, e, eo, so], y + 0.02, 0.16, kind === 'villa' ? TERRACOTTA : SLAB);
        if (kind === 'villa') {
          quad(h.walls('villaRail'), so, eo, y, y + 0.95, WHITE, 0.95, 1, 0, wide, 0, 1);
          quad(h.walls('villaRail'), s, so, y, y + 0.95, WHITE, 0.85, 0.9, 0, 0.12, 0, 1);
          quad(h.walls('villaRail'), eo, e, y, y + 0.95, WHITE, 0.85, 0.9, 0, 0.12, 0, 1);
        } else {
          const bays = Math.max(1, Math.round(length * (to - from) / 1.1));
          quad(h.walls('rail'), so, eo, y, y + 1.0, WHITE, 1, 1, 0, bays, 0, 1);
          quad(h.walls('rail'), s, so, y, y + 1.0, WHITE, 1, 1, 0, 1, 0, 1);
          quad(h.walls('rail'), eo, e, y, y + 1.0, WHITE, 1, 1, 0, 1, 0, 1);
        }
      }
      // Petit auvent au-dessus de l'entrée des villas enduites.
      if (kind === 'finished' && length <= 22) {
        const s: P = [a[0] + dx * length * 0.42, a[1] + dn * length * 0.42], e: P = [a[0] + dx * length * 0.64, a[1] + dn * length * 0.64];
        plate(h.solid, [s, e, [e[0] + ox * 1.0, e[1] + on * 1.0], [s[0] + ox * 1.0, s[1] + on * 1.0]], level(0) + storeyH * 0.93, 0.12, h.roofColor);
      }
    }
  }

  // --- Toits.
  const top = h.top;
  if (kind === 'villa') {
    // Dalle débordante couleur terre cuite, comme sur le modèle.
    plate(h.solid, grow(ring, 0.45), top + 0.22, 0.22, TERRACOTTA);
  } else if (kind === 'finished') {
    // Tuiles à quatre pentes, avec débord de toit.
    const eave = grow(ring, 0.4), rise = 1.5 + (hash % 5) * 0.2;
    const apex = h.solid.vertex(cx, top + rise, -cn, h.roofColor, 1.05);
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      h.solid.triangle(h.solid.vertex(eave[i][0], top, -eave[i][1], h.roofColor, 0.8), h.solid.vertex(eave[j][0], top, -eave[j][1], h.roofColor, 0.8), apex);
    }
    h.solid.flatPolygon(eave.flat(), top - 0.02, SLAB);
  } else if (kind === 'unfinished') {
    h.solid.flatPolygon(h.p, top, CONCRETE);
    // Poteaux et fers en attente : l'étage suivant viendra plus tard.
    for (let i = 0; i < count && i < 8; i++) {
      const [x, n] = ring[i], px = x + (cx - x) * 0.06, pn = n + (cn - n) * 0.06;
      boxAt(h.solid, px, pn, 0.14, top, top + 0.9, CONCRETE);
      for (const [dx, dn] of [[-0.08, -0.08], [0.08, 0.08]]) boxAt(h.solid, px + dx, pn + dn, 0.02, top + 0.9, top + 1.55, RUST);
    }
  } else {
    // Terrasse à acrotère, et un petit volume en retrait sur le toit (escalier, chambre haute).
    h.solid.flatPolygon(h.p, top - 0.75, SLAB);
    for (let i = 0; i < count; i++) quad(h.solid, ring[(i + 1) % count], ring[i], top - 0.75, top, tint, 0.8, 0.85, 0, 0, 0, 0);
    if (area > 45) {
      const anchor = ring[h.index % count];
      const small = ring.map(([x, n]) => [anchor[0] + (x - anchor[0]) * 0.52 + (cx - anchor[0]) * 0.1, anchor[1] + (n - anchor[1]) * 0.52 + (cn - anchor[1]) * 0.1] as P);
      for (let i = 0; i < count; i++) {
        const l = Math.hypot(small[(i + 1) % count][0] - small[i][0], small[(i + 1) % count][1] - small[i][1]);
        quad(h.walls('casbah'), small[i], small[(i + 1) % count], top - 0.75, top + 2.3, tint, 0.9, 1, 0, i === 0 && l > 3 ? 1 : 0, 0, 1);
      }
      h.solid.flatPolygon(small.flat(), top + 2.3, SLAB);
    }
  }

  // Citerne d'eau sur le toit plat (très courante), une maison sur deux.
  if ((kind === 'villa' || kind === 'unfinished') && hash % 2 === 0 && area > 40) {
    const [x, n] = ring[(h.index * 3) % count], tx = cx + (x - cx) * 0.45, tn = cn + (n - cn) * 0.45, y = top + (kind === 'villa' ? 0.22 : 0);
    boxAt(h.solid, tx, tn, 0.1, y, y + 0.6, CONCRETE);
    boxAt(h.solid, tx, tn, 0.5, y + 0.6, y + 1.55, TANK[h.index % TANK.length]);
  }
}
