import * as THREE from 'three';
import type { Collider } from './Collider';
import { type Ground, boxAt, canvasTexture } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';
import { createStoneWallTexture } from './Textures';
import type { WorldData } from './WorldData';

/**
 * Détails de rue cartographiés dans OpenStreetMap, posés à leur emplacement réel dans toute la ville :
 * murs et clôtures de propriété (avec leurs portails), remparts, murs de soutènement, parkings (enrobé et
 * places tracées), bancs et arrêts de bus. Rien n'est placé au hasard : ce qui n'est pas dans OSM n'est pas ici.
 * Limite : OSM ne décrit ni la hauteur ni l'aspect de ces murs ; les valeurs ci-dessous sont des valeurs types.
 */

type P = [number, number];
const pairs = (p: number[]): P[] => { const out: P[] = []; for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]); return out; };

const HEIGHT: Record<string, number> = { wall: 2.2, fence: 1.9, city_wall: 6, retaining: 1.6 };
const GATE = 3.6;          // largeur d'un portail (m)
const CREAM = new THREE.Color(0xe9e0cb), WHITE = new THREE.Color(0xf4f1e8), IRON = new THREE.Color(0x24272b);
const ASPHALT = new THREE.Color(0x85888c), LINE = new THREE.Color(0xf2f0e8);

function grille(): THREE.CanvasTexture {
  const texture = canvasTexture(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = '#23262a';
    ctx.fillRect(0, 3, 64, 4); ctx.fillRect(0, 56, 64, 4);
    for (let x = 3; x < 64; x += 9) ctx.fillRect(x, 0, 3, 64);
  });
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function inRing(x: number, n: number, ring: P[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, ni] = ring[i], [xj, nj] = ring[j];
    if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) hit = !hit;
  }
  return hit;
}

export function buildStreetDetails(scene: THREE.Scene, data: WorldData, ground: Ground, collider: Collider): { keepTree: (x: number, n: number) => boolean } {
  const plaster = new MeshBuilder(), stone = new MeshBuilder(), bars = new MeshBuilder(), solid = new MeshBuilder();

  // --- Murs et clôtures.
  for (const barrier of data.barriers ?? []) {
    const h = HEIGHT[barrier.k] ?? 2;
    const gates = pairs(barrier.g ?? []);
    const line = pairs(barrier.p);
    let travelled = 0;
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, an] = line[i], [bx, bn] = line[i + 1];
      const length = Math.hypot(bx - ax, bn - an);
      if (length < 0.05) continue;
      // Tronçons de 4 m au plus : le mur suit le relief ; les portails laissent une ouverture entre deux piliers.
      const steps = Math.max(1, Math.ceil(length / 4));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const x0 = ax + (bx - ax) * t0, n0 = an + (bn - an) * t0, x1 = ax + (bx - ax) * t1, n1 = an + (bn - an) * t1;
        const mx = (x0 + x1) / 2, mn = (n0 + n1) / 2;
        const gate = gates.find(([gx, gn]) => Math.hypot(gx - mx, gn - mn) < GATE / 2 + length / steps / 2);
        if (gate && Math.hypot(gate[0] - mx, gate[1] - mn) < GATE / 2) continue;
        const g0 = ground(x0, -n0), g1 = ground(x1, -n1), u0 = travelled + length * t0, u1 = travelled + length * t1;
        const quad = (b: MeshBuilder, y0: number, y1: number, color: THREE.Color, scale: number) => {
          const v = [b.vertex(x0, g0 + y0, -n0, color, 0.85, u0 / scale, y0 / scale), b.vertex(x1, g1 + y0, -n1, color, 0.85, u1 / scale, y0 / scale),
                     b.vertex(x1, g1 + y1, -n1, color, 1, u1 / scale, y1 / scale), b.vertex(x0, g0 + y1, -n0, color, 1, u0 / scale, y1 / scale)];
          b.triangle(v[0], v[1], v[2]); b.triangle(v[0], v[2], v[3]);
        };
        if (barrier.k === 'fence') { quad(plaster, -0.3, 0.5, CREAM, 3); quad(bars, 0.5, h, WHITE, 1.4); }
        else if (barrier.k === 'wall') { quad(plaster, -0.3, h, CREAM, 3); quad(plaster, h, h + 0.12, WHITE, 3); }
        else quad(stone, -0.4, h, WHITE, 3);
        const px = (-(n1 - n0) / (length / steps)) * 0.3, pn = ((x1 - x0) / (length / steps)) * 0.3;
        collider.addBuilding([x0 - px, n0 - pn, x1 - px, n1 - pn, x1 + px, n1 + pn, x0 + px, n0 + pn]);
      }
      travelled += length;
    }
    // Piliers de portail.
    for (const [gx, gn] of gates) {
      let best = Infinity, dir: P = [1, 0];
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, an] = line[i], [bx, bn] = line[i + 1], l = Math.hypot(bx - ax, bn - an) || 1;
        const t = Math.max(0, Math.min(1, ((gx - ax) * (bx - ax) + (gn - an) * (bn - an)) / (l * l)));
        const d = Math.hypot(ax + (bx - ax) * t - gx, an + (bn - an) * t - gn);
        if (d < best) { best = d; dir = [(bx - ax) / l, (bn - an) / l]; }
      }
      for (const side of [-1, 1]) {
        const x = gx + dir[0] * side * GATE / 2, n = gn + dir[1] * side * GATE / 2, g = ground(x, -n);
        boxAt(solid, x, -n, 0.5, 0.5, g - 0.3, g + h + 0.35, WHITE);
        boxAt(solid, x, -n, 0.62, 0.62, g + h + 0.35, g + h + 0.47, CREAM);
      }
    }
  }

  // --- Portails en travers d'une voie : piliers de part et d'autre, vantaux ouverts le long de la voie.
  const roadGates = data.gates ?? [];
  for (let i = 0; i + 4 < roadGates.length; i += 5) {
    const [x, n, dx, dn, half] = roadGates.slice(i, i + 5);
    for (const side of [-1, 1]) {
      const px = x - dn * side * (half + 0.5), pn = n + dx * side * (half + 0.5), g = ground(px, -pn);
      boxAt(solid, px, -pn, 0.55, 0.55, g - 0.3, g + 2.5, WHITE);
      boxAt(solid, px, -pn, 0.68, 0.68, g + 2.5, g + 2.62, CREAM);
      collider.addBuilding([px - 0.35, pn - 0.35, px + 0.35, pn - 0.35, px + 0.35, pn + 0.35, px - 0.35, pn + 0.35]);
      const ex = px + dx * half, en = pn + dn * half, ge = ground(ex, -en);
      const v = [bars.vertex(px, g + 0.25, -pn, WHITE, 1, 0, 0), bars.vertex(ex, ge + 0.25, -en, WHITE, 1, half / 1.4, 0),
                 bars.vertex(ex, ge + 2.1, -en, WHITE, 1, half / 1.4, 1), bars.vertex(px, g + 2.1, -pn, WHITE, 1, 0, 1)];
      bars.triangle(v[0], v[1], v[2]); bars.triangle(v[0], v[2], v[3]);
    }
  }

  // --- Parkings : enrobé posé sur le sol, places tracées en épi droit le long du grand axe.
  const tarmac = new MeshBuilder(), lines = new MeshBuilder();
  const parkings: { ring: P[]; x0: number; x1: number; n0: number; n1: number }[] = [];
  for (const area of data.areas) {
    if (area.k !== 'parking') continue;
    const ring = pairs(area.p);
    const xs = ring.map((q) => q[0]), ns = ring.map((q) => q[1]);
    parkings.push({ ring, x0: Math.min(...xs), x1: Math.max(...xs), n0: Math.min(...ns), n1: Math.max(...ns) });
    // Rectangle orienté d'aire minimale.
    let best = { area: Infinity, angle: 0, u0: 0, u1: 0, v0: 0, v1: 0 };
    for (let i = 0; i < ring.length; i++) {
      const [x1, n1] = ring[i], [x2, n2] = ring[(i + 1) % ring.length];
      const angle = Math.atan2(n2 - n1, x2 - x1), c = Math.cos(angle), s = Math.sin(angle);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const [x, n] of ring) { const u = x * c + n * s, v = -x * s + n * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      if ((u1 - u0) * (v1 - v0) < best.area) best = { area: (u1 - u0) * (v1 - v0), angle, u0, u1, v0, v1 };
    }
    let { angle, u0, u1, v0, v1 } = best;
    if (u1 - u0 < v1 - v0) { angle += Math.PI / 2; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; }
    const c = Math.cos(angle), s = Math.sin(angle);
    const world = (u: number, v: number): P => [u * c - v * s, u * s + v * c];
    const inside = (u: number, v: number) => { const [x, n] = world(u, v); return inRing(x, n, ring); };
    // Enrobé : cases de 3 m dont le centre est dans l'emprise.
    const CELL = 3;
    for (let v = v0; v < v1; v += CELL) {
      let start: number | null = null;
      for (let u = u0; u <= u1 + CELL; u += CELL) {
        const ok = u < u1 && inside(u + CELL / 2, v + CELL / 2);
        if (ok && start === null) start = u;
        if (!ok && start !== null) {
          for (let a = start; a < u; a += CELL) {
            const b = Math.min(u, a + CELL);
            const ids = [world(a, v), world(b, v), world(b, v + CELL), world(a, v + CELL)].map(([x, n]) => tarmac.vertex(x, ground(x, -n) + 0.1, -n, ASPHALT, 1, x / 5, n / 5));
            tarmac.triangle(ids[0], ids[1], ids[2]); tarmac.triangle(ids[0], ids[2], ids[3]);
          }
          start = null;
        }
      }
    }
    // Places : rangées de 5 m de profondeur, de part et d'autre d'allées de 6 m ; un trait tous les 2,5 m.
    const stripe = (ua: number, va: number, ub: number, vb: number) => {
      if (!inside(ua, va) || !inside(ub, vb)) return;
      const [ax, an] = world(ua, va), [bx, bn] = world(ub, vb), l = Math.hypot(bx - ax, bn - an) || 1;
      const px = (-(bn - an) / l) * 0.07, pn = ((bx - ax) / l) * 0.07;
      const y = (x: number, n: number) => ground(x, -n) + 0.14;
      const q = [lines.vertex(ax + px, y(ax, an), -(an + pn), LINE), lines.vertex(bx + px, y(bx, bn), -(bn + pn), LINE),
                 lines.vertex(bx - px, y(bx, bn), -(bn - pn), LINE), lines.vertex(ax - px, y(ax, an), -(an - pn), LINE)];
      lines.triangle(q[0], q[2], q[1]); lines.triangle(q[0], q[3], q[2]);
    };
    let v = v0 + 0.6, row = 0;
    while (v + 5 <= v1 - 0.4) {
      for (let u = u0 + 0.6; u <= u1 - 0.6; u += 2.5) stripe(u, v + 0.2, u, v + 4.8);
      v += row % 2 === 0 ? 5 + 6 : 5; // rangée, allée, rangée, rangée, allée…
      row++;
    }
  }

  // --- Bancs et arrêts de bus (tournés vers la chaussée la plus proche).
  const wood = new THREE.Color(0x7a5a3c), glass = new THREE.Color(0x9fc4cf), red = new THREE.Color(0xc23a2e);
  const items = data.furniture ?? [];
  for (let i = 0; i + 3 < items.length; i += 4) {
    const kind = items[i], x = items[i + 1], n = items[i + 2], toRoad = items[i + 3];
    const g = ground(x, -n) + 0.2, angle = -toRoad + Math.PI / 2; // le grand côté est parallèle à la chaussée
    if (kind === 0) {
      boxAt(solid, x, -n, 1.7, 0.45, g + 0.38, g + 0.46, wood, angle);
      boxAt(solid, x - Math.cos(toRoad) * 0.25, -(n - Math.sin(toRoad) * 0.25), 1.7, 0.06, g + 0.46, g + 0.9, wood, angle);
      for (const side of [-0.7, 0.7]) boxAt(solid, x + Math.sin(toRoad) * side, -(n - Math.cos(toRoad) * side), 0.08, 0.42, g - 0.2, g + 0.38, IRON, angle);
    } else {
      const bx = x - Math.cos(toRoad) * 0.7, bn = n - Math.sin(toRoad) * 0.7; // paroi du fond, côté opposé à la chaussée
      boxAt(solid, bx, -bn, 3.4, 0.06, g + 0.3, g + 2.2, glass, angle);
      boxAt(solid, x, -n, 3.8, 1.6, g + 2.3, g + 2.42, red, angle);
      for (const side of [-1.65, 1.65]) boxAt(solid, bx + Math.sin(toRoad) * side, -(bn - Math.cos(toRoad) * side), 0.08, 0.08, g - 0.2, g + 2.3, IRON, angle);
      boxAt(solid, bx + Math.cos(toRoad) * 0.3, -(bn + Math.sin(toRoad) * 0.3), 2.6, 0.4, g + 0.42, g + 0.5, wood, angle);
    }
  }

  const add = (builder: MeshBuilder, material: THREE.Material, shadow: boolean) => {
    const geometry = builder.build();
    if (!geometry.attributes.position || geometry.attributes.position.count === 0) return;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = shadow; mesh.receiveShadow = !shadow;
    scene.add(mesh);
  };
  add(plaster, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), true);
  add(stone, new THREE.MeshLambertMaterial({ map: createStoneWallTexture(), vertexColors: true, side: THREE.DoubleSide }), true);
  add(bars, new THREE.MeshLambertMaterial({ map: grille(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), false);
  add(solid, new THREE.MeshLambertMaterial({ vertexColors: true }), true);
  add(tarmac, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), false);
  add(lines, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), false);

  return {
    // Pas d'arbre posé par le générateur au milieu d'un parking.
    keepTree: (x, n) => !parkings.some((p) => x > p.x0 && x < p.x1 && n > p.n0 && n < p.n1 && inRing(x, n, p.ring)),
  };
}
