import * as THREE from 'three';
import type { Collider } from './Collider';
import { type Ground, boxAt, canvasTexture, cap, extrude } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';
import type { Terrain } from './Terrain';

/**
 * « Sous-Terrain » de la place au nord du Cours (ex-église Sainte-Monique), 36.9016, 7.7604.
 *
 * Sources : vue satellite (édifice octogonal à toit rouge d'environ 19 × 21 m, au milieu de la place, entre la
 * rue Zighout Youcef et la rue du 24 Février) et description de Houssem : bâtiment jaune à angle arrondi, deux
 * entrées (une de chaque côté) qui descendent vers un passage commerçant semi-enterré, petites boutiques et
 * vendeurs. L'intérieur, les enseignes et la disposition des boutiques sont une reconstitution : aucune photo de
 * l'intérieur n'a été fournie et OpenStreetMap n'a que le point « rest_area » de la place.
 */

const CX = 135, CN = 690;          // centre (x, n) mesuré sur la vue satellite
const A = 9, B = 10;               // demi-largeur est-ouest, demi-profondeur nord-sud
const CHAMFER = 3.5, ROUND = 6;    // pans coupés ; angle arrondi au sud-ouest (côté Cours)
const WALL = 0.35;
const DOOR = 2;                    // portes : v de -2 à +2 sur les façades ouest et est
const DOOR_H = 3.1;
const LANDING = 1.5;
const STAIR_SLOPE = 0.62;
const SURFACE = 0.2;               // le joueur marche 20 cm au-dessus du terrain brut (comme dans Game)

const YELLOW = new THREE.Color(0xe9be45);
const CREAM = new THREE.Color(0xeee3c8);
const WHITE = new THREE.Color(0xf4f1e8);
const STONE = new THREE.Color(0xb9b2a4);
const FLOOR = new THREE.Color(0xc9c1b2);

/** Contour du bâtiment, en coordonnées locales (u vers l'est, v vers le nord), sens trigonométrique. */
function outline(shrink = 0): [number, number][] {
  const a = A - shrink, b = B - shrink, k = CHAMFER * (1 - shrink / A), r = ROUND - shrink;
  const pts: [number, number][] = [
    [-a + r, -b], [a - k, -b], [a, -b + k], [a, b - k], [a - k, b], [-a + k, b], [-a, b - k], [-a, -b + r],
  ];
  for (let i = 1; i < 6; i++) { // quart de cercle du coin sud-ouest
    const t = Math.PI + (i / 6) * Math.PI / 2;
    pts.push([-a + r + Math.cos(t) * r, -b + r + Math.sin(t) * r]);
  }
  return pts;
}

const world = (u: number, v: number): [number, number] => [CX + u, CN + v];

/** Enduit jaune légèrement taché, avec un soubassement de pierre. */
function plaster(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#e9be45'; ctx.fillRect(0, 0, 128, 128);
    let seed = 5;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(255,240,190,0.18)' : 'rgba(150,110,30,0.10)';
      ctx.fillRect(r() * 128, r() * 128, 2 + r() * 10, 2 + r() * 6);
    }
    ctx.fillStyle = 'rgba(120,90,40,0.12)';
    for (let x = 0; x < 128; x += 32) ctx.fillRect(x + r() * 20, 0, 2, 128); // coulures
  });
}

function roofTiles(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#b5532e'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = 'rgba(70,25,10,0.45)'; ctx.fillRect(0, y, 128, 3);
      for (let x = (y / 16) % 2 ? 8 : 0; x < 128; x += 16) {
        ctx.fillStyle = `rgba(${200 + (x * 7 + y) % 40},${90 + (x + y * 3) % 30},50,0.35)`;
        ctx.fillRect(x + 1, y + 3, 14, 13);
      }
    }
  });
}

interface ShopKind { ar: string; fr: string; sign: string; goods: string[]; }
const SHOPS: ShopKind[] = [
  { ar: 'هواتف', fr: 'TÉLÉPHONIE', sign: '#1d5fb8', goods: ['#222', '#3a3a3a', '#e8e8e8', '#2a6fd6', '#d63a3a'] },
  { ar: 'ملابس', fr: 'VÊTEMENTS', sign: '#b8262f', goods: ['#e85d75', '#3d6cc9', '#f2d24b', '#2e9e5b', '#f4f4f4', '#7a4fc9'] },
  { ar: 'أحذية', fr: 'CHAUSSURES', sign: '#3d3d3d', goods: ['#5a3a22', '#1e1e1e', '#f2f2f2', '#a0522d', '#c8102e'] },
  { ar: 'عطور', fr: 'PARFUMERIE', sign: '#8a2fa0', goods: ['#f5d76e', '#e8a0c8', '#9fd8f0', '#f0f0f0', '#d4af37'] },
  { ar: 'مجوهرات', fr: 'BIJOUX', sign: '#1f1f1f', goods: ['#d4af37', '#e6e6e6', '#d4af37', '#c0c0c0', '#b8860b'] },
  { ar: 'لعب', fr: 'JOUETS', sign: '#e8731c', goods: ['#e83a3a', '#3ab0e8', '#f2d24b', '#4ccf6a', '#f08ad0'] },
  { ar: 'مواد غذائية', fr: 'ALIMENTATION', sign: '#2e8b3e', goods: ['#f2c14b', '#c8442c', '#e8e0c8', '#5a8f3a', '#f08a2c'] },
];

/** Devanture : rideau métallique relevé, enseigne bilingue, rayonnages chargés de marchandises. */
function shopFront(kind: ShopKind, seed: number): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    let s = seed * 7919 + 13;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    ctx.fillStyle = '#f3ecd9'; ctx.fillRect(0, 0, 256, 256);
    // Intérieur éclairé.
    ctx.fillStyle = '#efe9da'; ctx.fillRect(12, 70, 232, 186);
    // Rayonnages.
    for (let y = 92; y < 240; y += 36) {
      ctx.fillStyle = '#9b8c74'; ctx.fillRect(16, y + 26, 224, 4);
      for (let x = 18; x < 236;) {
        const w = 8 + r() * 18;
        ctx.fillStyle = kind.goods[Math.floor(r() * kind.goods.length)];
        ctx.fillRect(x, y + 26 - (10 + r() * 16), w - 2, 26);
        x += w;
      }
    }
    // Comptoir vitré.
    ctx.fillStyle = 'rgba(160,200,210,0.55)'; ctx.fillRect(30, 210, 196, 40);
    ctx.fillStyle = '#6a6a6a'; ctx.fillRect(30, 246, 196, 10);
    // Rideau métallique relevé et enseigne.
    ctx.fillStyle = '#8d9295'; ctx.fillRect(8, 52, 240, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 54; y < 70; y += 4) ctx.fillRect(8, y, 240, 1);
    ctx.fillStyle = kind.sign; ctx.fillRect(0, 0, 256, 52);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px "Noto Naskh Arabic", "Geeza Pro", Arial, sans-serif'; ctx.fillText(kind.ar, 128, 18);
    ctx.font = 'bold 15px Arial, sans-serif'; ctx.fillText(kind.fr, 128, 41);
    // Montants.
    ctx.fillStyle = '#d8d0bc'; ctx.fillRect(0, 52, 10, 204); ctx.fillRect(246, 52, 10, 204);
  }, false);
}

export interface SousTerrain { ground: (x: number, z: number) => number | null; inside: (x: number, n: number) => boolean; }

export function buildSousTerrain(scene: THREE.Scene, terrain: Terrain, ground: Ground, collider: Collider): SousTerrain {
  const outer = outline(0).map(([u, v]) => world(u, v));
  const inner = outline(WALL).map(([u, v]) => world(u, v));
  const raw = (u: number, v: number) => ground(CX + u, -(CN + v));
  let gMin = Infinity, gMax = -Infinity;
  for (const [x, n] of outer) { const g = ground(x, -n); gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); }
  const floor = gMin + SURFACE - 1.9;           // niveau commerçant : 1,9 m sous le point bas de la place
  const top = gMax + 4.4;                        // haut des murs
  const west = raw(-A - 0.6, 0) + SURFACE, east = raw(A + 0.6, 0) + SURFACE; // seuils des deux portes
  const stairs = [
    { sign: -1, h: west, start: -A + WALL + LANDING, end: -A + WALL + LANDING + (west - floor) / STAIR_SLOPE },
    { sign: 1, h: east, start: A - WALL - LANDING, end: A - WALL - LANDING - (east - floor) / STAIR_SLOPE },
  ];

  terrain.cutHole(outline(WALL * 0.5).map(([u, v]) => world(u, v)));

  const shell = new MeshBuilder(), inside = new MeshBuilder(), trim = new MeshBuilder();
  const wallMaterial = new THREE.MeshLambertMaterial({ map: plaster(), side: THREE.DoubleSide });

  // --- Murs : faces extérieures jaunes, faces intérieures crème, ouvertes aux deux portes.
  const segments = (ring: [number, number][], local: [number, number][]) => ring.map((p, i) => ({ a: p, b: ring[(i + 1) % ring.length], la: local[i], lb: local[(i + 1) % ring.length] }));
  const quad = (b: MeshBuilder, ax: number, an: number, bx: number, bn: number, y0: number, y1: number, color: THREE.Color, u0: number, u1: number) => {
    const v0 = b.vertex(ax, y0, -an, color, 1, u0, y0 / 4), v1 = b.vertex(bx, y0, -bn, color, 1, u1, y0 / 4);
    const v2 = b.vertex(bx, y1, -bn, color, 1, u1, y1 / 4), v3 = b.vertex(ax, y1, -an, color, 1, u0, y1 / 4);
    b.triangle(v0, v1, v2); b.triangle(v0, v2, v3);
  };
  const doorOn = (la: [number, number], lb: [number, number]) => Math.abs(la[0] - lb[0]) < 0.01 && Math.abs(Math.abs(la[0]) - (A - 0)) < WALL + 0.01 && la[1] * lb[1] < 0;
  const wallRing = (ring: [number, number][], local: [number, number][], b: MeshBuilder, color: THREE.Color, collide: boolean) => {
    let along = 0;
    for (const { a, b: e, la, lb } of segments(ring, local)) {
      const length = Math.hypot(e[0] - a[0], e[1] - a[1]);
      if (doorOn(la, lb)) {
        // Façade à porte : trumeaux de part et d'autre, linteau au-dessus.
        const dir = Math.sign(lb[1] - la[1]); // sens de parcours en v
        const sill = la[0] < 0 ? west : east;
        const cut = (v: number) => (v - la[1]) / (lb[1] - la[1]);
        const t0 = cut(-DOOR * dir), t1 = cut(DOOR * dir);
        const at = (t: number): [number, number] => [a[0] + (e[0] - a[0]) * t, a[1] + (e[1] - a[1]) * t];
        const [px, pn] = at(t0), [qx, qn] = at(t1);
        quad(b, a[0], a[1], px, pn, floor - 0.3, top, color, along / 4, (along + length * t0) / 4);
        quad(b, qx, qn, e[0], e[1], floor - 0.3, top, color, (along + length * t1) / 4, (along + length) / 4);
        quad(b, px, pn, qx, qn, sill + DOOR_H, top, color, (along + length * t0) / 4, (along + length * t1) / 4);
        quad(b, px, pn, qx, qn, floor - 0.3, sill - 0.05, color, 0, 1);
        if (collide) {
          for (const [sx, sn, tx, tn] of [[a[0], a[1], px, pn], [qx, qn, e[0], e[1]]]) addWall(sx, sn, tx, tn);
        }
      } else {
        quad(b, a[0], a[1], e[0], e[1], floor - 0.3, top, color, along / 4, (along + length) / 4);
        if (collide) addWall(a[0], a[1], e[0], e[1]);
      }
      along += length;
    }
  };
  const addWall = (ax: number, an: number, bx: number, bn: number) => {
    const dx = bx - ax, dn = bn - an, l = Math.hypot(dx, dn), ox = -dn / l * 0.5, on = dx / l * 0.5;
    collider.addBuilding([ax - ox, an - on, bx - ox, bn - on, bx + ox, bn + on, ax + ox, an + on]);
  };
  wallRing(outer, outline(0), shell, new THREE.Color(0xffffff), true);
  wallRing(inner, outline(WALL), inside, CREAM, false);

  // Soubassement de pierre, corniche blanche, embrasures et auvents des portes.
  const base = new MeshBuilder();
  for (const { a, b: e, la, lb } of segments(outer, outline(0))) {
    if (doorOn(la, lb)) continue;
    const g0 = Math.min(ground(a[0], -a[1]), ground(e[0], -e[1]));
    const offset = (p: [number, number]): [number, number] => [p[0] + (p[0] - CX) * 0.012, p[1] + (p[1] - CN) * 0.012];
    const [ax, an] = offset(a), [bx, bn] = offset(e);
    quad(base, ax, an, bx, bn, g0 - 0.5, g0 + 0.7 + (Math.max(ground(a[0], -a[1]), ground(e[0], -e[1])) - g0), STONE, 0, 1);
  }
  extrude(trim, outer, top - 0.5, top, WHITE, 4, () => 1.035);
  cap(trim, outer, top - 0.5, WHITE, 1.035, false);
  for (const s of stairs) {
    const u = s.sign * A;
    // Embrasures blanches (couvrent l'épaisseur du mur) et auvent au-dessus de la porte.
    for (const v of [-DOOR - 0.15, DOOR + 0.15]) boxAt(trim, CX + u - s.sign * WALL / 2, -(CN + v), WALL + 0.25, 0.3, s.h - 0.1, s.h + DOOR_H + 0.2, WHITE);
    boxAt(trim, CX + u - s.sign * WALL / 2, -CN, WALL + 0.25, DOOR * 2 + 0.6, s.h + DOOR_H, s.h + DOOR_H + 0.35, WHITE);
    boxAt(trim, CX + u + s.sign * 0.7, -CN, 1.5, DOOR * 2 + 1.4, s.h + DOOR_H + 0.35, s.h + DOOR_H + 0.55, WHITE);
  }
  // Fenêtres hautes (bandeau d'impostes qui éclaire la halle).
  const glass = new THREE.Color(0x35505c);
  for (const { a, b: e, la, lb } of segments(outer, outline(0))) {
    const length = Math.hypot(e[0] - a[0], e[1] - a[1]);
    const count = Math.floor(length / 2.6);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const lv = la[1] + (lb[1] - la[1]) * t;
      if (doorOn(la, lb) && Math.abs(lv) < DOOR + 0.8) continue;
      const x = a[0] + (e[0] - a[0]) * t, n = a[1] + (e[1] - a[1]) * t;
      const ox = (x - CX) * 0.004, on = (n - CN) * 0.004;
      const angle = Math.atan2(-(e[1] - a[1]), e[0] - a[0]);
      boxAt(trim, x + ox, -(n + on), 1.5, 0.12, top - 2.4, top - 1.0, glass, angle);
      boxAt(trim, x + ox * 1.3, -(n + on * 1.3), 1.7, 0.1, top - 2.5, top - 2.35, WHITE, angle);
    }
  }

  // --- Toit en croupe de tuiles rouges (vu sur le satellite), débord de 0,6 m.
  const roof = new MeshBuilder();
  extrude(roof, outer, top, top + 2.6, new THREE.Color(0xffffff), 3, (t) => 1.07 - 0.8 * t);
  cap(roof, outer, top + 2.6, new THREE.Color(0xffffff), 0.27); // petit plat au sommet de la croupe
  cap(trim, outer, top, CREAM, 1.07, false);                 // sous-face du débord
  cap(inside, inner, top - 0.25, WHITE, 1, false);            // plafond de la halle

  // --- Niveau bas : sol, escaliers avec leurs murets, boutiques et étals.
  cap(inside, inner, floor, FLOOR, 1, true);
  const props = new MeshBuilder();
  for (const s of stairs) {
    const sill = s.h;
    // Palier au niveau de la place, puis marches de 17 cm jusqu'au sol commerçant.
    const landFrom = s.sign * (A - WALL), landTo = s.start;
    boxAt(inside, CX + (landFrom + landTo) / 2, -CN, Math.abs(landTo - landFrom), DOOR * 2, floor, sill, STONE);
    const steps = Math.max(1, Math.round((sill - floor) / 0.17)), rise = (sill - floor) / steps;
    const run = Math.abs(s.end - s.start) / steps;
    for (let k = 0; k < steps; k++) {
      // Le nez de chaque marche suit la pente sur laquelle marche le joueur.
      boxAt(inside, CX + s.start - s.sign * (k + 0.5) * run, -CN, run + 0.02, DOOR * 2, floor, sill - (k + 0.5) * rise, k % 2 ? STONE : FLOOR);
    }
    // Murets latéraux jaunes (garde-corps pleins), et rampe.
    const uMid = (s.sign * (A - WALL) + s.end) / 2, length = Math.abs(s.sign * (A - WALL) - s.end);
    for (const v of [-DOOR - 0.15, DOOR + 0.15]) {
      boxAt(shell, CX + uMid, -(CN + v), length, 0.3, floor, sill + 1.0, YELLOW);
      boxAt(trim, CX + uMid, -(CN + v), length + 0.1, 0.4, sill + 1.0, sill + 1.1, WHITE);
      const [ax, an] = world(s.sign * (A - WALL), v - 0.15), [bx, bn] = world(s.end, v + 0.15);
      collider.addBuilding([ax, an, bx, an, bx, bn, ax, bn]);
    }
  }
  // Boutiques le long des murs nord et sud (devantures face au passage), une sur chaque pan coupé du nord.
  const fronts: { u: number; v: number; width: number; facing: number; kind: number }[] = [];
  for (let k = 0; k < 3; k++) fronts.push({ u: -3.7 + k * 3.7, v: B - WALL - 2.6, width: 3.5, facing: -1, kind: k });
  for (let k = 0; k < 2; k++) fronts.push({ u: -0.9 + k * 4.0, v: -B + WALL + 2.6, width: 3.8, facing: 1, kind: 3 + k });
  const shopMaterials = new Map<number, THREE.MeshLambertMaterial>();
  for (const f of fronts) {
    const kind = f.kind % SHOPS.length;
    let material = shopMaterials.get(f.kind);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ map: shopFront(SHOPS[kind], f.kind + 3), emissive: 0x3a3a3a, emissiveMap: null });
      shopMaterials.set(f.kind, material);
    }
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(f.width, 3.2), material);
    plane.position.set(CX + f.u, floor + 1.6, -(CN + f.v));
    plane.rotation.y = f.facing > 0 ? Math.PI : 0;
    scene.add(plane);
    // Volume de la boutique derrière la devanture (jusqu'au mur), cloisons et bandeau.
    const depth = B - WALL - Math.abs(f.v);
    const vc = f.v + Math.sign(f.v) * depth / 2;
    boxAt(inside, CX + f.u, -(CN + vc), f.width + 0.2, depth, floor + 3.2, floor + 3.5, CREAM);
    boxAt(inside, CX + f.u - f.width / 2 - 0.1, -(CN + vc), 0.2, depth, floor, floor + 3.5, CREAM);
    boxAt(inside, CX + f.u + f.width / 2 + 0.1, -(CN + vc), 0.2, depth, floor, floor + 3.5, CREAM);
    const [ax, an] = world(f.u - f.width / 2 - 0.2, f.v), [bx, bn] = world(f.u + f.width / 2 + 0.2, f.v + Math.sign(f.v) * depth);
    collider.addBuilding([ax, an, bx, an, bx, bn, ax, bn]);
  }
  // Étals de vendeurs dans le passage : tréteaux, nappes de couleur, cageots et portants de vêtements.
  const stalls: [number, number, number][] = [[-5.2, 4.2, 0], [3.0, 4.6, 1], [-1.8, -4.6, 2], [5.0, -4.4, 3], [0.6, 0, 4]];
  const cloth = [0xc8342c, 0x2f6fb8, 0x3c9a4c, 0xe8a21c, 0x7d3fa0].map((c) => new THREE.Color(c));
  const goods = [0xf2c14b, 0xe85d75, 0x3d6cc9, 0xf4f4f4, 0x2e9e5b, 0xd63a3a, 0x222222, 0xf08a2c].map((c) => new THREE.Color(c));
  for (const [u, v, i] of stalls) {
    const [x, n] = world(u, v), z = -n;
    if (i === 4) {
      // Portant de vêtements au pied des escaliers.
      boxAt(props, x, z, 2.4, 0.06, floor + 1.7, floor + 1.76, new THREE.Color(0x777777));
      for (const du of [-1.2, 1.2]) { boxAt(props, x + du, z, 0.06, 0.06, floor, floor + 1.76, new THREE.Color(0x777777)); boxAt(props, x + du, z, 0.08, 0.6, floor, floor + 0.05, new THREE.Color(0x777777)); }
      for (let k = 0; k < 9; k++) boxAt(props, x - 1.05 + k * 0.26, z, 0.2, 0.5, floor + 0.75, floor + 1.68, goods[(k * 3) % goods.length]);
      collider.addBuilding([x - 1.3, n - 0.4, x + 1.3, n - 0.4, x + 1.3, n + 0.4, x - 1.3, n + 0.4]);
      continue;
    }
    boxAt(props, x, z, 2.0, 0.9, floor + 0.75, floor + 0.85, cloth[i]);
    boxAt(props, x, z, 2.05, 0.95, floor + 0.35, floor + 0.75, cloth[i], 0);
    for (let k = 0; k < 6; k++) boxAt(props, x - 0.8 + (k % 3) * 0.8, z - 0.2 + Math.floor(k / 3) * 0.4, 0.5, 0.3, floor + 0.85, floor + 0.95 + (k % 2) * 0.12, goods[(i * 2 + k) % goods.length]);
    for (let k = 0; k < 3; k++) boxAt(props, x - 0.7 + k * 0.7, z + 0.8, 0.55, 0.4, floor, floor + 0.32 + k * 0.08, new THREE.Color(0x9a7b4f));
    collider.addBuilding([x - 1.1, n - 0.6, x + 1.1, n - 0.6, x + 1.1, n + 1.1, x - 1.1, n + 1.1]);
  }
  // Néons au plafond.
  const tubes = new MeshBuilder();
  for (let k = -2; k <= 2; k++) for (const v of [-4.5, 0, 4.5]) boxAt(tubes, CX + k * 3.2, -(CN + v), 1.2, 0.12, top - 0.45, top - 0.3, WHITE);
  scene.add(new THREE.Mesh(tubes.build(), new THREE.MeshBasicMaterial({ color: 0xfafff5 })));

  // Deux vendeurs à parasol sur la place, à côté des entrées.
  for (const [u, v, i] of [[-A - 3.5, 3.5, 0], [A + 3.2, -4.0, 3]] as [number, number, number][]) {
    const [x, n] = world(u, v), z = -n, g = ground(x, z) + SURFACE;
    boxAt(props, x, z, 1.8, 0.8, g + 0.75, g + 0.85, cloth[i]);
    for (const [dx, dz] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]]) boxAt(props, x + dx, z + dz, 0.05, 0.05, g, g + 0.75, new THREE.Color(0x555555));
    for (let k = 0; k < 4; k++) boxAt(props, x - 0.6 + k * 0.4, z, 0.3, 0.5, g + 0.85, g + 1.0, goods[(k + i) % goods.length]);
    boxAt(props, x, z, 0.05, 0.05, g, g + 2.3, new THREE.Color(0x555555));
    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.45, 8, 1, true), new THREE.MeshLambertMaterial({ color: i ? 0xf2f2ea : 0xd2382c, side: THREE.DoubleSide }));
    umbrella.position.set(x, g + 2.45, z);
    umbrella.castShadow = true;
    scene.add(umbrella);
    collider.addBuilding([x - 1.0, n - 0.5, x + 1.0, n - 0.5, x + 1.0, n + 0.5, x - 1.0, n + 0.5]);
  }

  const roofMaterial = new THREE.MeshLambertMaterial({ map: roofTiles(), side: THREE.DoubleSide });
  const lit = (builder: MeshBuilder, material: THREE.Material, shadow = true) => {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.castShadow = shadow;
    scene.add(mesh);
  };
  lit(shell, wallMaterial);
  lit(roof, roofMaterial);
  lit(base, new THREE.MeshLambertMaterial({ vertexColors: true }));
  lit(trim, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  // Intérieur : éclairé par les néons (léger auto-éclairage), il ne reçoit pas l'ombre du toit.
  lit(inside, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x2e2a22 }), false);
  lit(props, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x1c1a16 }));

  // --- Sol praticable : paliers, marches en pente douce pour le joueur, niveau bas partout ailleurs.
  const innerLocal = outline(WALL * 0.5); // tout l'intérieur du trou percé dans le terrain
  const insideLocal = (u: number, v: number) => {
    let hit = false;
    for (let i = 0, j = innerLocal.length - 1; i < innerLocal.length; j = i++) {
      const [ui, vi] = innerLocal[i], [uj, vj] = innerLocal[j];
      if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) hit = !hit;
    }
    return hit;
  };
  const patch = (x: number, z: number): number | null => {
    const u = x - CX, v = -z - CN;
    if (Math.abs(u) > A + 0.2 || Math.abs(v) > B + 0.2) return null;
    if (Math.abs(v) <= DOOR) {
      for (const s of stairs) {
        const from = s.sign * (A + 0.2), d = (u - from) * -s.sign; // distance depuis le seuil vers l'intérieur
        if (d < 0) continue;
        const landing = Math.abs(s.start - from), length = Math.abs(s.end - s.start);
        if (d <= landing) return s.h;
        if (d <= landing + length) return s.h + (floor - s.h) * (d - landing) / length;
      }
    }
    return insideLocal(u, v) ? floor : null;
  };
  return {
    ground: patch,
    inside: (x, n) => Math.abs(x - CX) < A + 1.5 && Math.abs(n - CN) < B + 1.5,
  };
}
