import * as THREE from 'three';
import { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import { FACADE_WIDTH, createClockTexture, createFacadeTexture, createRailTexture, type FacadeStyle } from './Textures';
import type { WorldData } from './WorldData';

const CHUNK = 400;        // regroupement par blocs de 400 m
const FLOOR_HEIGHT = 3;
const GROUND_FLOOR = 3.6; // hauteur du rez-de-chaussée (commerces, entrées)
const PARAPET = 0.6;      // rebord du toit plat

/** Apparence de chaque usage : texture des étages, couleurs de murs et de toit. */
const LOOK: Record<string, { style: FacadeStyle; walls: number[]; roofs: number[] }> = {
  apartment: { style: 'apartment', walls: [0xf3ead8, 0xe9d3ae, 0xf5f1e6, 0xd9c7a3, 0xf0dcc0, 0xe2ddd0, 0xead9b8], roofs: [0xb9b2a3, 0xa9a394, 0xc2bcae] },
  house: { style: 'house', walls: [0xfaf5ea, 0xf3e2c0, 0xf7efe0, 0xe8c9a0, 0xf2d9b0, 0xffffff], roofs: [0xb55d3f, 0xc0694a, 0xa9523a, 0xbb6a48] },
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

export function buildBuildings(scene: THREE.Scene, data: WorldData, ground: (x: number, z: number) => number): Collider {
  const collider = new Collider();
  const walls = new Map<string, MeshBuilder>();
  const roofs = new Map<string, MeshBuilder>();
  const builderIn = (map: Map<string, MeshBuilder>, key: string): MeshBuilder => {
    let builder = map.get(key);
    if (!builder) { builder = new MeshBuilder(); map.set(key, builder); }
    return builder;
  };

  data.buildings.forEach((building, index) => {
    const p = building.p, count = p.length / 2;
    let look = LOOK[building.t] ?? LOOK.apartment;
    const cell = `${Math.floor(p[0] / CHUNK)},${Math.floor(p[1] / CHUNK)}`;
    const estate = (building.t === 'apartment' || building.t === 'tower')
      && MODERN_ESTATES.some((zone) => Math.hypot(p[0] - zone.x, p[1] - zone.n) < zone.r);
    if (estate) look = { style: building.t === 'tower' ? 'citetour' : 'cite', walls: ESTATE_WALLS, roofs: look.roofs };
    const wall = new THREE.Color(look.walls[index % look.walls.length]);
    const roofColor = new THREE.Color(look.roofs[(index * 7) % look.roofs.length]);

    // Sol le plus bas et le plus haut sous le bâtiment, centre et point le plus éloigné du centre.
    let low = Infinity, base = -Infinity, cx = 0, cz = 0;
    for (let i = 0; i < count; i++) {
      const g = ground(p[i * 2], -p[i * 2 + 1]);
      low = Math.min(low, g); base = Math.max(base, g);
      cx += p[i * 2] / count; cz += -p[i * 2 + 1] / count;
    }
    const top = base + building.h;
    // Rez-de-chaussée distinct pour les immeubles : commerces le long des grandes rues, entrées ailleurs.
    const colonial = building.t === 'colonial';
    const tall = building.t === 'apartment' || building.t === 'tower' || building.t === 'hotel' || colonial;
    const hasGround = tall && building.h > 7;
    const shopWalls = new Set(building.s ?? []);
    const upperFrom = hasGround ? base + GROUND_FLOOR : base;
    const floors = Math.max(1, Math.round((top - upperFrom) / FLOOR_HEIGHT));
    const upper = builderIn(walls, `${look.style}|${cell}`);

    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const ax = p[i * 2], az = -p[i * 2 + 1], bx = p[j * 2], bz = -p[j * 2 + 1];
      const length = Math.hypot(bx - ax, bz - az);
      // Soubassement uni, du point bas du terrain jusqu'au niveau du rez-de-chaussée.
      wallQuad(upper, ax, az, bx, bz, low - 1, base, wall, 0.6, 0.7, 0, 0, 0);
      if (hasGround) {
        // Commerces seulement sur les murs qui donnent sur une grande rue ; entrées ailleurs.
        const groundStyle: FacadeStyle = colonial ? (shopWalls.has(i) ? 'arcade' : 'ground') : shopWalls.has(i) ? 'shop' : 'ground';
        const u = Math.max(1, Math.round(length / FACADE_WIDTH[groundStyle]));
        wallQuad(builderIn(walls, `${groundStyle}|${cell}`), ax, az, bx, bz, base, upperFrom, wall, 0.8, 0.9, u, 0, 1);
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
      // Immeubles d'habitation : balcons superposés à garde-corps maçonné, sur une façade longue sur deux.
      if (tall && !colonial && length > 9 && (estate ? i % 2 === 0 : (index * 31 + i * 17) % 2 === 0)) {
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
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        roof.triangle(roof.vertex(p[i * 2], top, -p[i * 2 + 1], roofColor, 0.82), roof.vertex(p[j * 2], top, -p[j * 2 + 1], roofColor, 0.82), apex);
      }
    } else {
      // Toit plat ; les murs dépassent pour former l'acrotère.
      roof.flatPolygon(p, building.t === 'industrial' ? top : top - PARAPET, roofColor);
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
    collider.addBuilding(p);
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
  const roofMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const builder of roofs.values()) if (!builder.isEmpty) { const mesh = new THREE.Mesh(builder.build(), roofMaterial); mesh.castShadow = true; scene.add(mesh); }
  return collider;
}
