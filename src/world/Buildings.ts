import { MOBILE } from '../engine/Mobile';
import * as THREE from 'three';
import { ownedByLandmark } from './Landmarks';
import { Collider } from './Collider';
import { buildHouse, grow } from './Houses';
import { MeshBuilder } from './MeshBuilder';
import { FACADE_WIDTH, createClockTexture, createFacadeTexture, createRailTexture, type FacadeStyle } from './Textures';
import type { WorldData } from './WorldData';

const CHUNK = 400;        // regroupement par blocs de 400 m
const FLOOR_HEIGHT = 3;
const GROUND_FLOOR = 3.6; // hauteur du rez-de-chaussée (commerces, entrées)
const PARAPET = 0.6;      // rebord du toit plat

/** Apparence de chaque usage : texture des étages, couleurs de murs et de toit. */
const LOOK: Record<string, { style: FacadeStyle; walls: number[]; roofs: number[] }> = {
  apartment: { style: 'apartment', walls: [0xf6efe0, 0xecd2a4, 0xfaf6ec, 0xe7c08e, 0xf1d9b8, 0xebe6dc, 0xf3dfa8, 0xe8c2ae, 0xf2ecdf], roofs: [0xb9b2a3, 0xa9a394, 0xc2bcae] },
  house: { style: 'house', walls: [0xfaf5ea, 0xf3e2c0, 0xf7efe0, 0xe8c9a0, 0xf2d9b0, 0xffffff, 0xeec7a6, 0xf5e6b0], roofs: [0xb55d3f, 0xc0694a, 0xa9523a, 0xbb6a48] },
  tower: { style: 'tower', walls: [0xf4f1ea, 0xe9e4d8, 0xdfe6ea, 0xf0e6d2], roofs: [0x9a9c9e, 0xaeb0b2] },
  hotel: { style: 'tower', walls: [0xf3ede0, 0xe8dccb], roofs: [0xa9a394] },
  school: { style: 'school', walls: [0xf0dfb0, 0xecd9a8, 0xf3e6c2], roofs: [0xb8b0a0] },
  hospital: { style: 'school', walls: [0xf4f6f2, 0xe6efe8], roofs: [0xb4b8b4] },
  public: { style: 'public', walls: [0xf2ead6, 0xefe2c4, 0xf7f2e6], roofs: [0xb0a898, 0xa9523a] },
  industrial: { style: 'industrial', walls: [0xb9c0c4, 0xa7b2b8, 0xc8c2b4, 0x9fb0c0], roofs: [0x8f989c, 0x9aa3a6] },
  mosque: { style: 'mosque', walls: [0xfbfaf4], roofs: [0xdedbd0] },
  colonial: { style: 'colonial', walls: [0xfbf8ef, 0xf6f1e2, 0xfaf5e6, 0xf3efe6], roofs: [0xb9b2a3, 0xa9523a, 0xc2bcae] },
  station: { style: 'station', walls: [0xf3ead6], roofs: [0xc9bfa8] },
};
const DOME = new THREE.Color(0x2f8a5b);
const MINARET = new THREE.Color(0xf7f5ee);

function wallQuad(b: MeshBuilder, ax: number, az: number, bx: number, bz: number, y0: number, y1: number,
                  color: THREE.Color, shade0: number, shade1: number, u: number, v0: number, v1: number): void {
  const a = b.vertex(ax, y0, az, color, shade0, 0, v0), c = b.vertex(bx, y0, bz, color, shade0, u, v0);
  const d = b.vertex(bx, y1, bz, color, shade1, u, v1), e = b.vertex(ax, y1, az, color, shade1, 0, v1);
  b.triangle(a, c, d); b.triangle(a, d, e);
}

const ARCADE_DEPTH = 2.8;
const CORNICE = new THREE.Color(0xf1ead8), STONE_PIER = new THREE.Color(0xe6dfcc);
const AWNINGS = [0xb8322c, 0x2f6f9f, 0x2f7d4f, 0xd98a1f, 0x7a2f2f, 0xe8e0c8].map((c) => new THREE.Color(c));

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const [x1, n1] = ring[i], [x2, n2] = ring[(i + 1) % ring.length]; a += x1 * n2 - x2 * n1; }
  return a / 2;
}

/** Recule vers l'intérieur les murs choisis d'un contour (sens trigonométrique) ; les autres ne bougent pas. */
function insetEdges(ring: [number, number][], chosen: Set<number>, depth: number): [number, number][] {
  const n = ring.length;
  const line = (i: number) => {
    const [ax, an] = ring[i], [bx, bn] = ring[(i + 1) % n], l = Math.hypot(bx - ax, bn - an) || 1;
    const dx = (bx - ax) / l, dn = (bn - an) / l, d = chosen.has(i) ? depth : 0;
    return { x: ax - dn * d, n: an + dx * d, dx, dn }; // intérieur : à gauche du sens de parcours
  };
  return ring.map((vertex, i) => {
    const a = line((i + n - 1) % n), b = line(i);
    const cross = a.dx * b.dn - a.dn * b.dx;
    if (Math.abs(cross) < 0.05) return [b.x, b.n] as [number, number];
    const t = ((b.x - a.x) * b.dn - (b.n - a.n) * b.dx) / cross;
    const x = a.x + a.dx * t, m = a.n + a.dn * t;
    return (Math.hypot(x - vertex[0], m - vertex[1]) > depth * 4 ? vertex : [x, m]) as [number, number];
  });
}

/**
 * Galerie à arcades d'un mur : piliers et arcs en plein cintre sur l'alignement de la façade, plafond, et fond de
 * galerie (vitrines) en retrait. (ax, az)-(bx, bz) : mur en façade ; ia, ib : ses extrémités reculées (x, n).
 */
function buildArcade(solid: MeshBuilder, shops: MeshBuilder, ax: number, az: number, bx: number, bz: number, ia: [number, number], ib: [number, number],
                     base: number, ceiling: number, wall: THREE.Color, collider: Collider): void {
  const length = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / length, dz = (bz - az) / length;
  const inX = (bz - az) / length, inZ = -(bx - ax) / length; // vers l'intérieur du bâtiment
  const H = ceiling - base, stone = STONE_PIER.clone().lerp(wall, 0.5);
  const bays = Math.max(1, Math.round(length / 3.7)), bay = length / bays;
  const r = Math.min(bay / 2 - 0.42, H - 0.5 - 1.9), spring = H - 0.5 - r;
  const at = (s: number, y: number, depth = 0) => solid.vertex(ax + dx * s + inX * depth, base + y, az + dz * s + inZ * depth, stone, depth ? 0.78 : 0.7 + 0.3 * (y / H));
  const face = (s0: number, y0: number, s1: number, y1: number, s2: number, y2: number, s3: number, y3: number) => {
    const v = [at(s0, y0), at(s1, y1), at(s2, y2), at(s3, y3)];
    solid.triangle(v[0], v[1], v[2]); solid.triangle(v[0], v[2], v[3]);
  };
  for (let k = 0; k < bays; k++) {
    const s0 = k * bay, s1 = s0 + bay, c = s0 + bay / 2;
    face(s0, 0, c - r, 0, c - r, H, s0, H);          // pilier gauche (jusqu'au plafond)
    face(c + r, 0, s1, 0, s1, H, c + r, H);          // pilier droit
    const SEG = 8;
    for (let a = 0; a < SEG; a++) {                   // écoinçons au-dessus de l'arc
      const t0 = Math.PI - (a / SEG) * Math.PI, t1 = Math.PI - ((a + 1) / SEG) * Math.PI;
      face(c + Math.cos(t0) * r, spring + Math.sin(t0) * r, c + Math.cos(t1) * r, spring + Math.sin(t1) * r, c + Math.cos(t1) * r, H, c + Math.cos(t0) * r, H);
    }
    // Épaisseur des piliers : retours de 55 cm de chaque côté de la baie.
    for (const s of [c - r, c + r]) {
      const v = [at(s, 0), at(s, 0, 0.55), at(s, spring, 0.55), at(s, spring)];
      solid.triangle(v[0], v[1], v[2]); solid.triangle(v[0], v[2], v[3]);
    }
    // Obstacle : le pilier entre cette baie et la précédente (et le premier, au bord).
    const pier = (from: number, to: number) => {
      const px0 = ax + dx * from, pz0 = az + dz * from, px1 = ax + dx * to, pz1 = az + dz * to;
      collider.addBuilding([px0, -pz0, px1, -pz1, px1 + inX * 0.55, -(pz1 + inZ * 0.55), px0 + inX * 0.55, -(pz0 + inZ * 0.55)]);
    };
    pier(s0, c - r);
    pier(c + r, s1);
  }
  // Plafond de la galerie et fond (vitrines).
  const dark = SLAB.clone().multiplyScalar(0.8);
  const cv = [solid.vertex(ax, ceiling - 0.02, az, dark, 0.8), solid.vertex(bx, ceiling - 0.02, bz, dark, 0.8), solid.vertex(ib[0], ceiling - 0.02, -ib[1], dark, 0.7), solid.vertex(ia[0], ceiling - 0.02, -ia[1], dark, 0.7)];
  solid.triangle(cv[0], cv[1], cv[2]); solid.triangle(cv[0], cv[2], cv[3]);
  const back = Math.hypot(ib[0] - ia[0], ib[1] - ia[1]);
  wallQuad(shops, ia[0], -ia[1], ib[0], -ib[1], base, ceiling, wall, 0.7, 0.8, Math.max(1, Math.round(back / FACADE_WIDTH.shop)), 0, 1);
  // Dallage clair sous la galerie.
  const floor = new THREE.Color(0xd8d2c4);
  const fv = [solid.vertex(ax, base + 0.03, az, floor, 0.9), solid.vertex(bx, base + 0.03, bz, floor, 0.9), solid.vertex(ib[0], base + 0.03, -ib[1], floor, 0.8), solid.vertex(ia[0], base + 0.03, -ia[1], floor, 0.8)];
  solid.triangle(fv[0], fv[2], fv[1]); solid.triangle(fv[0], fv[3], fv[2]);
}

const ROOF_EDGE = new THREE.Color(0xbdb6a6), TANK_LEG = new THREE.Color(0x77736b), TANK_BLUE = new THREE.Color(0x3f6fae), TANK_GREY = new THREE.Color(0xc9c9c4), DISH = new THREE.Color(0xeeeeea);
const SLAB = new THREE.Color(0xd9d4c6), WHITE = new THREE.Color(0xffffff);
type Point = [number, number, number];
function roofPoint(x: number, y: number, z: number): Point { return [x, y, z]; }

/** Dalle de balcon : dessus, dessous et chant, à partir de ses quatre coins. */
function slab(b: MeshBuilder, a: Point, c: Point, d: Point, e: Point, thickness: number, color: THREE.Color): void {
  for (const dy of [0, -thickness]) {
    const v = [a, c, d, e].map(([x, y, z]) => b.vertex(x, y + dy, z, color, dy === 0 ? 1 : 0.7));
    b.triangle(v[0], v[1], v[2]); b.triangle(v[0], v[2], v[3]);
  }
  const front = [b.vertex(e[0], e[1], e[2], color, 0.85), b.vertex(d[0], d[1], d[2], color, 0.85), b.vertex(d[0], d[1] - thickness, d[2], color, 0.8), b.vertex(e[0], e[1] - thickness, e[2], color, 0.8)];
  b.triangle(front[0], front[1], front[2]); b.triangle(front[0], front[2], front[3]);
}

/** Boîte carrée verticale (minaret, lanterneau...). */
function box(b: MeshBuilder, x: number, z: number, half: number, y0: number, y1: number, color: THREE.Color): void {
  const corners = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    wallQuad(b, ax, az, bx, bz, y0, y1, color, 0.8, 1, 0, 0, 0);
  }
  const top = corners.map(([cx, cz]) => b.vertex(cx, y1, cz, color, 0.95));
  b.triangle(top[0], top[2], top[1]); b.triangle(top[0], top[3], top[2]);
}

function pyramid(b: MeshBuilder, x: number, z: number, half: number, y0: number, y1: number, color: THREE.Color): void {
  const corners = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    b.triangle(b.vertex(ax, y0, az, color, 0.8), b.vertex(bx, y0, bz, color, 0.8), b.vertex(x, y1, z, color));
  }
}

function dome(b: MeshBuilder, x: number, y: number, z: number, radius: number, color: THREE.Color): void {
  const RINGS = 4, SEGMENTS = 10;
  const rows: number[][] = [];
  for (let r = 0; r <= RINGS; r++) {
    const angle = (r / RINGS) * (Math.PI / 2), ringRadius = Math.cos(angle) * radius, height = Math.sin(angle) * radius;
    const row: number[] = [];
    for (let s = 0; s < SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      row.push(b.vertex(x + Math.cos(a) * ringRadius, y + height, z + Math.sin(a) * ringRadius, color, 0.75 + 0.3 * (r / RINGS)));
    }
    rows.push(row);
  }
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SEGMENTS; s++) {
      const t = (s + 1) % SEGMENTS;
      b.triangle(rows[r][s], rows[r + 1][s], rows[r][t]);
      b.triangle(rows[r][t], rows[r + 1][s], rows[r + 1][t]);
    }
  }
}

/**
 * Génère tous les bâtiments. Position et forme au sol : réelles (OSM).
 * Apparence : choisie selon l'usage du bâtiment (maison, immeuble, tour, mosquée,
 * école, hôpital, bâtiment public, entrepôt), certain ou déduit de sa taille.
 */
/**
 * Cités modernes reconnaissables, repérées sur des photos des lieux (OpenStreetMap ne décrit pas les façades).
 * La Ménadia et les « 1000 logements » : barres et tours blanches à allèges et balcons jaune ocre.
 * x, n : centre de la zone en mètres ; r : rayon.
 */
const MODERN_ESTATES = [{ x: 450, n: 1885, r: 210 }];
const ESTATE_WALLS = [0xffffff, 0xf7f4ea, 0xfdfbf3];
const ESTATE_YELLOW = new THREE.Color(0xe0b23a);

/** Gradins : marches de béton, rangées plus claires (pas de couleurs de sièges inventées). */
function createStepsTexture(): THREE.CanvasTexture {
  const element = document.createElement('canvas');
  element.width = 16; element.height = 64;
  const ctx = element.getContext('2d')!;
  ctx.fillStyle = '#b8b6ae'; ctx.fillRect(0, 0, 16, 64);
  ctx.fillStyle = '#8e8c85'; ctx.fillRect(0, 0, 16, 10);   // contremarche à l'ombre
  ctx.fillStyle = '#d4d2ca'; ctx.fillRect(0, 10, 16, 6);   // nez de marche éclairé
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Tribune de stade : la surface monte du bord du terrain (1 m) jusqu'au haut de la tribune côté extérieur.
 * Une rangée de gradins tous les 0,8 m environ ; murs extérieurs en béton.
 */
function buildStands(steps: MeshBuilder, walls: MeshBuilder, p: number[], height: number, focus: [number, number], ground: (x: number, z: number) => number): void {
  const count = p.length / 2;
  const fx = focus[0], fz = -focus[1];
  let dMin = Infinity, dMax = 0, base = Infinity;
  for (let i = 0; i < count; i++) {
    const d = Math.hypot(p[i * 2] - fx, -p[i * 2 + 1] - fz);
    dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
    base = Math.min(base, ground(p[i * 2], -p[i * 2 + 1]));
  }
  // Profondeur locale : un rayon partant du centre du terrain traverse la tribune ; on mesure où il y entre et où il en sort.
  // (Fonctionne pour les tribunes droites comme pour les virages en arc de cercle.)
  const across = (x: number, z: number) => {
    const ux = x - fx, uz = z - fz, d = Math.hypot(ux, uz) || 1;
    let near = Infinity, far = 0;
    for (let i = 0; i < count; i++) {
      const ax = p[i * 2] - fx, az = -p[i * 2 + 1] - fz, bx = p[((i + 1) % count) * 2] - fx, bz = -p[((i + 1) % count) * 2 + 1] - fz;
      const ex = bx - ax, ez = bz - az, den = (ux / d) * ez - (uz / d) * ex;
      if (Math.abs(den) < 1e-9) continue;
      const tRay = (ax * ez - az * ex) / den, tEdge = (ax * (uz / d) - az * (ux / d)) / den;
      if (tEdge < -0.001 || tEdge > 1.001 || tRay <= 0) continue;
      near = Math.min(near, tRay); far = Math.max(far, tRay);
    }
    if (!(far - near > 0.5)) { near = dMin; far = dMax; }
    return { t: Math.max(0, Math.min(1, (d - near) / (far - near))), depth: far - near };
  };
  const rise = (x: number, z: number) => {
    const { t, depth } = across(x, z);
    return { y: base + 1 + t * (height - 1), row: (t * Math.hypot(depth, height)) / 0.8 };
  };
  const concrete = new THREE.Color(0xffffff), wallColor = new THREE.Color(0xc9c5bb);
  const pts = Array.from({ length: count }, (_, i) => new THREE.Vector2(p[i * 2], -p[i * 2 + 1]));
  const ids = pts.map((v) => { const r = rise(v.x, v.y); return steps.vertex(v.x, r.y, v.y, concrete, 1, 0, r.row); });
  // On ne garde que les triangles réellement dans la tribune (les virages en croissant trompent parfois la triangulation).
  const inside = (x: number, z: number) => {
    let hit = false;
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > z) !== (b.y > z) && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts, [])) {
    if (inside((pts[a].x + pts[b].x + pts[c].x) / 3, (pts[a].y + pts[b].y + pts[c].y) / 3)) steps.triangle(ids[a], ids[c], ids[b]);
  }
  for (let i = 0; i < count; i++) {
    const a = pts[i], b = pts[(i + 1) % count], ya = rise(a.x, a.y).y, yb = rise(b.x, b.y).y;
    const v0 = walls.vertex(a.x, base - 0.5, a.y, wallColor, 0.8), v1 = walls.vertex(b.x, base - 0.5, b.y, wallColor, 0.8);
    const v2 = walls.vertex(b.x, yb, b.y, wallColor), v3 = walls.vertex(a.x, ya, a.y, wallColor);
    walls.triangle(v0, v1, v2); walls.triangle(v0, v2, v3);
  }
}

export function buildBuildings(scene: THREE.Scene, data: WorldData, ground: (x: number, z: number) => number): Collider {
  const collider = new Collider();
  const walls = new Map<string, MeshBuilder>();
  const roofs = new Map<string, MeshBuilder>();
  const builderIn = (map: Map<string, MeshBuilder>, key: string): MeshBuilder => {
    let builder = map.get(key);
    if (!builder) { builder = new MeshBuilder(); map.set(key, builder); }
    return builder;
  };

  // Distance approchée à la chaussée la plus proche (cases de 25 m) : sert à trouver la façade sur rue des maisons.
  const roadCells = new Map<string, number[]>();
  for (const road of data.roads) {
    if (road.k === 'footway' || road.k === 'path' || road.k === 'steps') continue;
    for (let i = 0; i < road.p.length; i += 2) {
      const key = `${Math.floor(road.p[i] / 25)},${Math.floor(road.p[i + 1] / 25)}`;
      let list = roadCells.get(key);
      if (!list) { list = []; roadCells.set(key, list); }
      list.push(road.p[i], road.p[i + 1]);
    }
  }
  const roadDistance = (x: number, n: number): number => {
    let best = Infinity;
    const cx = Math.floor(x / 25), cn = Math.floor(n / 25);
    for (let dx = -1; dx <= 1; dx++) for (let dn = -1; dn <= 1; dn++) {
      const list = roadCells.get(`${cx + dx},${cn + dn}`);
      if (list) for (let i = 0; i < list.length; i += 2) best = Math.min(best, Math.hypot(list[i] - x, list[i + 1] - n));
    }
    return best;
  };
  const medina = data.places.find((place) => place.name === 'Vieille Ville');
  const oldTown: [number, number] | null = medina ? [medina.x, medina.n] : null;

  const standSteps = new MeshBuilder(), standWalls = new MeshBuilder();
  data.buildings.forEach((building, index) => {
    const p = building.p, count = p.length / 2;
    if (ownedByLandmark(p)) return; // modèle sur mesure (Landmarks.ts)
    if (building.t === 'stands' && building.f) {
      buildStands(standSteps, standWalls, p, building.h, building.f, ground);
      collider.addBuilding(p);
      return;
    }
    let look = LOOK[building.t] ?? LOOK.apartment;
    const cell = `${Math.floor(p[0] / CHUNK)},${Math.floor(p[1] / CHUNK)}`;
    const estate = (building.t === 'apartment' || building.t === 'tower')
      && MODERN_ESTATES.some((zone) => Math.hypot(p[0] - zone.x, p[1] - zone.n) < zone.r);
    if (estate) look = { style: building.t === 'tower' ? 'citetour' : 'cite', walls: ESTATE_WALLS, roofs: look.roofs };
    const wall = new THREE.Color(building.c ?? look.walls[index % look.walls.length]);
    const roofColor = new THREE.Color(look.roofs[(index * 7) % look.roofs.length]);

    // Sol le plus bas et le plus haut sous le bâtiment, centre et point le plus éloigné du centre.
    let low = Infinity, base = -Infinity, cx = 0, cz = 0;
    for (let i = 0; i < count; i++) {
      const g = ground(p[i * 2], -p[i * 2 + 1]);
      low = Math.min(low, g); base = Math.max(base, g);
      cx += p[i * 2] / count; cz += -p[i * 2 + 1] / count;
    }
    const top = base + building.h;
    let footprint = p; // emprise au sol pour les collisions (réduite sous les arcades)
    if (building.t === 'house') {
      const houseRoof = buildHouse({
        p, index, low, base, top, wall, roofColor, roadDistance,
        walls: (style) => builderIn(walls, `${style}|${cell}`), solid: builderIn(roofs, cell),
        oldTown: oldTown !== null && Math.hypot(cx - oldTown[0], -cz - oldTown[1]) < 330,
      });
      collider.addBuilding(p, -Infinity, Infinity, houseRoof);
      return;
    }
    // Rez-de-chaussée distinct pour les immeubles : commerces le long des grandes rues, entrées ailleurs.
    const colonial = building.t === 'colonial';
    const tall = building.t === 'apartment' || building.t === 'tower' || building.t === 'hotel' || colonial;
    const hasGround = tall && building.h > 7;
    const shopWalls = new Set(building.s ?? []);
    const upperFrom = hasGround ? base + GROUND_FLOOR : base;
    const floors = Math.max(1, Math.round((top - upperFrom) / FLOOR_HEIGHT));
    const upper = builderIn(walls, `${look.style}|${cell}`);
    const plain = builderIn(roofs, cell); // murs unis (couleur seule), dans le même maillage que les toits

    // Arcades réelles (immeubles coloniaux, murs sur grande rue) : le rez-de-chaussée recule de 2,8 m derrière
    // une file de piliers et d'arcs ; on circule dessous. Emprise au sol réduite d'autant pour les collisions.
    const ring: [number, number][] = [];
    for (let i = 0; i < count; i++) ring.push([p[i * 2], p[i * 2 + 1]]);
    const arcades = new Set<number>();
    if (colonial && hasGround) for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      if (shopWalls.has(i) && Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]) >= 7) arcades.add(i);
    }
    let inner = arcades.size ? insetEdges(ring, arcades, ARCADE_DEPTH) : ring;
    if (arcades.size && !(ringArea(inner) > 0.45 * ringArea(ring))) { arcades.clear(); inner = ring; } // immeuble trop mince
    footprint = arcades.size ? inner.flat() : p;
    const q = p, qCount = count;
    for (let k = 0; k < qCount; k++) {
      const j = (k + 1) % qCount, i = k;
      const ax = q[k * 2], az = -q[k * 2 + 1], bx = q[j * 2], bz = -q[j * 2 + 1];
      const length = Math.hypot(bx - ax, bz - az);
      // Soubassement uni, du point bas du terrain jusqu'au niveau du rez-de-chaussée.
      wallQuad(upper, ax, az, bx, bz, low - 1, base, wall, 0.6, 0.7, 0, 0, 0);
      if (arcades.has(i)) {
        buildArcade(plain, builderIn(walls, `shop|${cell}`), ax, az, bx, bz, inner[i], inner[j], base, upperFrom, wall, collider);
      } else if (hasGround) {
        // Commerces seulement sur les murs qui donnent sur une grande rue ; entrées ailleurs.
        const groundStyle: FacadeStyle = colonial ? (shopWalls.has(i) ? 'arcade' : 'ground') : shopWalls.has(i) ? 'shop' : 'ground';
        const u = Math.max(1, Math.round(length / FACADE_WIDTH[groundStyle]));
        wallQuad(builderIn(walls, `${groundStyle}|${cell}`), ax, az, bx, bz, base, upperFrom, wall, 0.8, 0.9, u, 0, 1);
        // Stores en toile au-dessus des vitrines (immeubles d'habitation à commerces).
        if (groundStyle === 'shop' && length > 5 && !MOBILE) {
          const ox = -(bz - az) / length, oz = (bx - ax) / length, bays = Math.max(1, Math.round(length / 3.2));
          for (let b = 0; b < bays; b++) {
            if ((index + b * 3 + i) % 3 === 0) continue; // une vitrine sur trois sans store
            const t0 = (b + 0.08) / bays, t1 = (b + 0.92) / bays, cloth = AWNINGS[(index * 5 + b + i) % AWNINGS.length];
            const sx = ax + (bx - ax) * t0, sz = az + (bz - az) * t0, ex = ax + (bx - ax) * t1, ez = az + (bz - az) * t1;
            const y0 = base + GROUND_FLOOR - 0.55, y1 = y0 - 0.5, D = 1.15;
            const v = [plain.vertex(sx, y0, sz, cloth, 1), plain.vertex(ex, y0, ez, cloth, 1), plain.vertex(ex + ox * D, y1, ez + oz * D, cloth, 0.85), plain.vertex(sx + ox * D, y1, sz + oz * D, cloth, 0.85)];
            plain.triangle(v[0], v[1], v[2]); plain.triangle(v[0], v[2], v[3]);
            const w = [plain.vertex(sx + ox * D, y1, sz + oz * D, WHITE, 0.95), plain.vertex(ex + ox * D, y1, ez + oz * D, WHITE, 0.95), plain.vertex(ex + ox * D, y1 - 0.22, ez + oz * D, cloth, 0.9), plain.vertex(sx + ox * D, y1 - 0.22, sz + oz * D, cloth, 0.9)];
            plain.triangle(w[0], w[1], w[2]); plain.triangle(w[0], w[2], w[3]);
          }
        }
      }
      // Centre colonial : balcons filants en saillie, avec garde-corps en fer forgé, au 1er et au 3e étage.
      if (colonial && length > 4) {
        const ox = -(bz - az) / length, oz = (bx - ax) / length; // vers l'extérieur du bâtiment
        const rails = builderIn(walls, `rail|${cell}`);
        for (const floor of [1, 3]) {
          const y = upperFrom + (floor - 1) * FLOOR_HEIGHT;
          if (y + 1.2 > top) continue;
          const DEPTH = 0.7;
          const a0 = roofPoint(ax, y, az), b0 = roofPoint(bx, y, bz);
          const a1 = roofPoint(ax + ox * DEPTH, y, az + oz * DEPTH), b1 = roofPoint(bx + ox * DEPTH, y, bz + oz * DEPTH);
          slab(builderIn(roofs, cell), a0, b0, b1, a1, 0.16, SLAB);
          wallQuad(rails, a1[0], a1[2], b1[0], b1[2], y, y + 1.0, WHITE, 1, 1, Math.max(1, Math.round(length / 1.1)), 0, 1);
        }
      }
      // Immeubles d'habitation (pas sur téléphone : trop de géométrie) : balcons superposés à garde-corps maçonné, sur une façade longue sur deux.
      if (!MOBILE && tall && !colonial && length > 9 && (estate ? i % 2 === 0 : (index * 31 + i * 17) % 2 === 0)) {
        const ox = -(bz - az) / length, oz = (bx - ax) / length;
        const dx = (bx - ax) / length, dz = (bz - az) / length;
        const spans = length > 16 ? [[0.1, 0.42], [0.58, 0.9]] : [[0.22, 0.78]];
        const flat = builderIn(roofs, cell), rim = estate ? ESTATE_YELLOW : wall.clone().multiplyScalar(0.9);
        for (let floor = hasGround ? 0 : 1; floor < floors; floor++) {
          const y = upperFrom + floor * FLOOR_HEIGHT;
          for (const [from, to] of spans) {
            const sx = ax + dx * length * from, sz = az + dz * length * from, ex = ax + dx * length * to, ez = az + dz * length * to;
            const DEPTH = 1.05;
            const a0 = roofPoint(sx, y, sz), b0 = roofPoint(ex, y, ez);
            const a1 = roofPoint(sx + ox * DEPTH, y, sz + oz * DEPTH), b1 = roofPoint(ex + ox * DEPTH, y, ez + oz * DEPTH);
            slab(flat, a0, b0, b1, a1, 0.14, SLAB);
            // Garde-corps plein : face avant et deux retours.
            for (const [p0, p1, shade] of [[a1, b1, 0.95], [a0, a1, 0.8], [b1, b0, 0.8]] as const) {
              const v = [flat.vertex(p0[0], y, p0[2], rim, shade), flat.vertex(p1[0], y, p1[2], rim, shade), flat.vertex(p1[0], y + 0.95, p1[2], rim, shade), flat.vertex(p0[0], y + 0.95, p0[2], rim, shade)];
              flat.triangle(v[0], v[1], v[2]); flat.triangle(v[0], v[2], v[3]);
            }
          }
        }
      }
      // Nombre entier de travées et d'étages : pas de fenêtre coupée.
      wallQuad(upper, ax, az, bx, bz, upperFrom, top, wall, hasGround ? 0.92 : 0.75, 1, Math.round(length / FACADE_WIDTH[look.style]), 0, floors);
    }

    const roof = builderIn(roofs, cell);
    if (building.t === 'house') {
      // Toit de tuiles à pentes : chaque mur rejoint le faîte au centre.
      const apex = roof.vertex(cx, top + 1.9, cz, roofColor, 1.05);
      for (let i = 0; i < qCount; i++) {
        const j = (i + 1) % qCount;
        roof.triangle(roof.vertex(q[i * 2], top, -q[i * 2 + 1], roofColor, 0.82), roof.vertex(q[j * 2], top, -q[j * 2 + 1], roofColor, 0.82), apex);
      }
    } else {
      // Toit plat ; les murs dépassent pour former l'acrotère.
      roof.flatPolygon(q, building.t === 'industrial' ? top : top - PARAPET, roofColor);
    }

    // Corniche en saillie en tête de façade (immeubles et bâtiments publics) : le toit ne finit plus en arête nue.
    if (!MOBILE && (tall || building.t === 'public' || building.t === 'school' || building.t === 'hospital')) {
      const outer = grow(ring, 0.38), tone = colonial ? CORNICE : wall.clone().multiplyScalar(0.96);
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const a = ring[i], b = ring[j], ao = outer[i], bo = outer[j], y0 = top - 0.42, y1 = top + 0.02;
        const v = [roof.vertex(ao[0], y0, -ao[1], tone, 0.82), roof.vertex(bo[0], y0, -bo[1], tone, 0.82), roof.vertex(bo[0], y1, -bo[1], tone, 1), roof.vertex(ao[0], y1, -ao[1], tone, 1)];
        roof.triangle(v[0], v[1], v[2]); roof.triangle(v[0], v[2], v[3]);
        const u = [roof.vertex(a[0], y0, -a[1], tone, 0.6), roof.vertex(b[0], y0, -b[1], tone, 0.6), roof.vertex(bo[0], y0, -bo[1], tone, 0.7), roof.vertex(ao[0], y0, -ao[1], tone, 0.7)];
        roof.triangle(u[0], u[1], u[2]); roof.triangle(u[0], u[2], u[3]);
        const t = [roof.vertex(a[0], y1, -a[1], tone, 1.02), roof.vertex(b[0], y1, -b[1], tone, 1.02), roof.vertex(bo[0], y1, -bo[1], tone, 1.02), roof.vertex(ao[0], y1, -ao[1], tone, 1.02)];
        roof.triangle(t[0], t[2], t[1]); roof.triangle(t[0], t[3], t[2]);
      }
    }

    // Toits-terrasses habités : édicule d'escalier, citernes d'eau et paraboles, comme sur les toits d'Annaba.
    if (tall && count >= 4) {
      const deck = top - PARAPET;
      const spot = (k: number, t: number): [number, number] => {
        const i = (index * 7 + k * 3) % count;
        return [cx + (p[i * 2] - cx) * t, cz + (-p[i * 2 + 1] - cz) * t];
      };
      const [ex, ez] = spot(0, 0.3);
      box(roof, ex, ez, 1.5, deck, deck + 2.3, wall.clone().multiplyScalar(0.93));
      box(roof, ex, ez, 1.65, deck + 2.3, deck + 2.45, ROOF_EDGE);
      for (let k = 1; k <= 1 + (index % 3); k++) {
        const [tx, tz] = spot(k, 0.5);
        box(roof, tx, tz, 0.12, deck, deck + 0.7, TANK_LEG);
        box(roof, tx, tz, 0.55, deck + 0.7, deck + 1.75, index % 2 ? TANK_BLUE : TANK_GREY);
      }
      for (let k = 0; k < 2 + (index % 4); k++) {
        const [sx, sz] = spot(k + 4, 0.78 + (k % 2) * 0.1);
        box(roof, sx, sz, 0.04, deck, deck + 1.0, TANK_LEG);
        pyramid(roof, sx, sz, 0.48, deck + 1.45, deck + 0.95, DISH);
      }
    }

    if (building.t === 'station') {
      // Tour-horloge de la gare, à l'angle le plus au nord du bâtiment (emplacement exact à confirmer).
      let tx = cx, tz = cz, north = Infinity;
      for (let i = 0; i < count; i++) if (-p[i * 2 + 1] < north) { north = -p[i * 2 + 1]; tx = p[i * 2]; tz = -p[i * 2 + 1]; }
      tx += (cx - tx) * 0.12; tz += (cz - tz) * 0.12;
      const stone = new THREE.Color(0xe9dcc0), cap = new THREE.Color(0xd9c9a6);
      box(roof, tx, tz, 2.6, low - 1, base + 25, stone);
      box(roof, tx, tz, 2.9, base + 25, base + 25.6, cap);
      box(roof, tx, tz, 2.0, base + 25.6, base + 29, stone);
      box(roof, tx, tz, 1.3, base + 29, base + 32, stone);
      box(roof, tx, tz, 0.5, base + 32, base + 36, cap);
      // Quatre cadrans, un par face.
      const clock = new THREE.MeshBasicMaterial({ map: createClockTexture(), transparent: true });
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2, face = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), clock);
        face.position.set(tx + Math.sin(a) * 2.63, base + 21.5, tz + Math.cos(a) * 2.63);
        face.rotation.y = a;
        scene.add(face);
      }
    }

    if (building.t === 'mosque') {
      // Coupole au centre et minaret carré à l'angle le plus éloigné : silhouette générique de mosquée maghrébine.
      let far = 0, fx = cx, fz = cz;
      for (let i = 0; i < count; i++) {
        const d = Math.hypot(p[i * 2] - cx, -p[i * 2 + 1] - cz);
        if (d > far) { far = d; fx = p[i * 2]; fz = -p[i * 2 + 1]; }
      }
      dome(roof, cx, top - PARAPET, cz, Math.min(7, Math.max(2.5, far * 0.4)), DOME);
      const mx = fx + (cx - fx) * 0.18, mz = fz + (cz - fz) * 0.18, tip = top + 13;
      box(roof, mx, mz, 1.3, low - 1, tip, MINARET);
      box(roof, mx, mz, 1.8, tip, tip + 0.4, MINARET);
      box(roof, mx, mz, 0.9, tip + 0.4, tip + 3.4, MINARET);
      pyramid(roof, mx, mz, 1.0, tip + 3.4, tip + 5.2, DOME);
    }
    // Toit-terrasse franchissable (on peut s'y poser) ; mosquées et tours à horloge restent pleines.
    const flatRoof = building.t !== 'mosque' && !(building.t === 'house') ? { y: building.t === 'industrial' ? top : top - PARAPET } : undefined;
    collider.addBuilding(footprint, -Infinity, Infinity, flatRoof);
  });

  const materials = new Map<string, THREE.Material>();
  for (const [key, builder] of walls) {
    const style = key.split('|')[0] as FacadeStyle;
    let material = materials.get(style);
    if (!material && key.startsWith('rail|')) {
      // Garde-corps : texture à trous (on voit à travers les barreaux).
      material = new THREE.MeshLambertMaterial({ map: createRailTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
      materials.set(style, material);
    }
    if (!material) {
      material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: createFacadeTexture(style) });
      materials.set(style, material);
    }
    if (!builder.isEmpty) { const mesh = new THREE.Mesh(builder.build(), material); mesh.castShadow = true; scene.add(mesh); }
  }
  if (!standSteps.isEmpty) {
    const steps = new THREE.Mesh(standSteps.build(), new THREE.MeshLambertMaterial({ vertexColors: true, map: createStepsTexture(), side: THREE.DoubleSide }));
    steps.castShadow = steps.receiveShadow = true;
    scene.add(steps);
    scene.add(new THREE.Mesh(standWalls.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }
  const roofMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const builder of roofs.values()) if (!builder.isEmpty) { const mesh = new THREE.Mesh(builder.build(), roofMaterial); mesh.castShadow = true; scene.add(mesh); }
  return collider;
}
