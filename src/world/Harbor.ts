import * as THREE from 'three';
import { MeshBuilder } from './MeshBuilder';
import type { WorldData } from './WorldData';

/**
 * Port de pêche et de plaisance d'Annaba : bateaux amarrés le long des vrais quais (trait de côte OSM),
 * qui flottent sur la houle.
 *
 * Quatre familles de bateaux, d'après les photos du port :
 *  - hors-bord (majoritaires) : coque blanche à liseré coloré, console, moteur hors-bord ;
 *  - barque de pêche traditionnelle (« flouka ») : petite coque ouverte bleue et blanche ;
 *  - sardinier (lamparo) : coque bleue, timonerie à l'arrière, mât à lampes, filets sur le pont ;
 *  - chalutier : grande coque bleue à pavois blanc, timonerie avant, mâts et portique arrière.
 *
 * Préparé pour la conduite : chaque bateau est un objet `Boat` (gabarit, position, cap, mouvement) que l'on
 * pourra confier plus tard à un pilote (`moored = false`), au lieu de le laisser se balancer à quai.
 */

const SEA = 0;                  // niveau de la mer (y)
const VIEW = 900;               // au-delà, les bateaux ne sont ni affichés ni animés

export type BoatKind = 'horsbord' | 'barque' | 'sardinier' | 'chalutier';

export interface BoatSpec {
  kind: BoatKind;
  label: string;
  length: number;   // m
  beam: number;     // largeur, m
  /** Pour la conduite à venir : vitesse maximale (m/s) et vitesse de giration (rad/s). */
  maxSpeed: number;
  turnRate: number;
}

const SPECS: Record<BoatKind, BoatSpec> = {
  horsbord: { kind: 'horsbord', label: 'Hors-bord', length: 5.5, beam: 2.1, maxSpeed: 16, turnRate: 0.9 },
  barque: { kind: 'barque', label: 'Barque de pêche', length: 5.8, beam: 2.0, maxSpeed: 6, turnRate: 0.6 },
  sardinier: { kind: 'sardinier', label: 'Sardinier', length: 14, beam: 4.4, maxSpeed: 7, turnRate: 0.3 },
  chalutier: { kind: 'chalutier', label: 'Chalutier', length: 20, beam: 6, maxSpeed: 6, turnRate: 0.2 },
};

// ---------------------------------------------------------------------------------------------------------------
// Modèles (géométrie à faces simples, couleurs par sommet, style rétro)

const C = (hex: number) => new THREE.Color(hex);
const ANTIFOULING = C(0xa8352b), WHITE = C(0xf3f2ec), DECK_WOOD = C(0xa7845a), DARK = C(0x22282e), GLASS = C(0x2c3e4c);
const BLUES = [C(0x1f4f9e), C(0x2a62b8), C(0x1b3f7a)];

interface Band { top: number; bottom: number; color: THREE.Color }

/**
 * Coque : sections successives de la poupe (s = 0) à l'étrave (s = 1). La largeur se resserre à l'avant,
 * la coque se creuse en V vers la quille, le livet (bord du pont) remonte à l'étrave.
 */
function hull(b: MeshBuilder, L: number, B: number, depth: number, draft: number, bands: Band[], deck: THREE.Color, sheer = 0.25, transom = 0.82): void {
  const STATIONS = 10;
  const width = (s: number) => B * (s < 0.55 ? transom + (1 - transom) * Math.sin((s / 0.55) * Math.PI / 2) : Math.cos(((s - 0.55) / 0.45) * Math.PI / 2) ** 0.8);
  const deckAt = (s: number) => depth + sheer * depth * Math.pow(s, 2.2);
  const keel = -draft;
  // Demi-largeur à la hauteur y : coque en V arrondi.
  const half = (s: number, y: number) => {
    const f = Math.max(0, Math.min(1, (y - keel) / (deckAt(s) - keel)));
    return (width(s) / 2) * Math.pow(f, 0.45);
  };
  const z = (s: number) => -L / 2 + s * L;
  for (const band of bands) {
    for (const side of [-1, 1]) {
      let previous: number[] | null = null;
      for (let k = 0; k <= STATIONS; k++) {
        const s = k / STATIONS, top = Math.min(band.top, deckAt(s)), bottom = Math.max(band.bottom, keel);
        if (top <= bottom) { previous = null; continue; }
        const row = [b.vertex(side * half(s, top), top, z(s), band.color, 1), b.vertex(side * half(s, bottom), bottom, z(s), band.color, 0.82)];
        if (previous) {
          if (side > 0) { b.triangle(previous[0], previous[1], row[1]); b.triangle(previous[0], row[1], row[0]); }
          else { b.triangle(previous[0], row[1], previous[1]); b.triangle(previous[0], row[0], row[1]); }
        }
        previous = row;
      }
    }
    // Tableau arrière (poupe plate).
    const top = Math.min(band.top, deckAt(0)), bottom = Math.max(band.bottom, keel);
    if (top > bottom) {
      const q = [b.vertex(-half(0, top), top, z(0), band.color, 0.9), b.vertex(half(0, top), top, z(0), band.color, 0.9),
                 b.vertex(half(0, bottom), bottom, z(0), band.color, 0.75), b.vertex(-half(0, bottom), bottom, z(0), band.color, 0.75)];
      b.triangle(q[0], q[1], q[2]); b.triangle(q[0], q[2], q[3]);
    }
  }
  // Pont, un peu sous le livet (pavois).
  let previous: number[] | null = null;
  for (let k = 0; k <= STATIONS; k++) {
    const s = k / STATIONS, y = deckAt(s) - 0.18, w = half(s, y) * 0.92;
    const row = [b.vertex(-w, y, z(s), deck, 1), b.vertex(w, y, z(s), deck, 1)];
    if (previous) { b.triangle(previous[0], row[0], row[1]); b.triangle(previous[0], row[1], previous[1]); }
    previous = row;
  }
}

/** Boîte alignée sur le bateau (x : travers, z : longueur), avec un toit éventuellement d'une autre couleur. */
function box(b: MeshBuilder, x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.Color, roof = color): void {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y + h;
  const faces: [number[][], THREE.Color, number][] = [
    [[[x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1]], color, 1],
    [[[x1, y, z0], [x0, y, z0], [x0, y1, z0], [x1, y1, z0]], color, 0.8],
    [[[x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0]], color, 0.9],
    [[[x1, y, z1], [x1, y, z0], [x1, y1, z0], [x1, y1, z1]], color, 0.9],
    [[[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], roof, 1.05],
  ];
  for (const [quad, c, shade] of faces) {
    const ids = quad.map(([px, py, pz]) => b.vertex(px, py, pz, c, shade));
    b.triangle(ids[0], ids[1], ids[2]); b.triangle(ids[0], ids[2], ids[3]);
  }
}

/** Mât ou montant : prisme fin. */
function pole(b: MeshBuilder, x: number, y: number, z: number, h: number, r: number, color: THREE.Color): void {
  box(b, x, y, z, r, h, r, color);
}

function buildHorsBord(variant: number): THREE.BufferGeometry {
  const b = new MeshBuilder(), L = SPECS.horsbord.length, accent = [C(0x1f4f9e), C(0xb3261e), C(0x1d7f6e), C(0x222222)][variant % 4];
  hull(b, L, SPECS.horsbord.beam, 0.75, 0.35, [
    { top: 2, bottom: 0.55, color: accent },
    { top: 0.55, bottom: 0.06, color: WHITE },
    { top: 0.06, bottom: -1, color: variant % 2 ? ANTIFOULING : C(0xe9e7df) },
  ], C(0xe6e2d6), 0.35, 0.86);
  box(b, 0, 0.55, 0.2, 0.75, 0.75, 0.7, WHITE);                       // console de pilotage
  box(b, 0, 1.3, 0.48, 0.75, 0.3, 0.06, GLASS);                       // pare-brise
  box(b, 0, 0.55, -1.0, 1.3, 0.45, 0.6, accent);                      // banquette arrière
  box(b, 0, -0.35, -L / 2 - 0.25, 0.32, 1.05, 0.38, DARK);            // moteur hors-bord
  box(b, 0, 0.7, -L / 2 - 0.3, 0.42, 0.42, 0.55, DARK, C(0x3a3f45));  // capot du moteur
  return b.build();
}

function buildBarque(variant: number): THREE.BufferGeometry {
  const b = new MeshBuilder(), L = SPECS.barque.length, blue = BLUES[variant % BLUES.length];
  hull(b, L, SPECS.barque.beam, 0.8, 0.45, [
    { top: 2, bottom: 0.6, color: WHITE },
    { top: 0.6, bottom: 0.08, color: blue },
    { top: 0.08, bottom: -1, color: ANTIFOULING },
  ], DECK_WOOD, 0.4, 0.55);
  box(b, 0, 0.55, -0.4, SPECS.barque.beam * 0.7, 0.08, 0.35, DECK_WOOD); // banc de nage
  box(b, 0, 0.55, 1.0, SPECS.barque.beam * 0.6, 0.08, 0.35, DECK_WOOD);
  box(b, 0.3, 0.6, -1.6, 0.9, 0.35, 0.8, C(0xb8743c));                  // tas de filets
  box(b, 0, -0.3, -L / 2 - 0.15, 0.25, 0.9, 0.3, DARK);                  // petit moteur
  return b.build();
}

function buildSardinier(variant: number): THREE.BufferGeometry {
  const b = new MeshBuilder(), { length: L, beam: B } = SPECS.sardinier, blue = BLUES[variant % BLUES.length];
  hull(b, L, B, 1.9, 1.2, [
    { top: 4, bottom: 1.55, color: WHITE },
    { top: 1.55, bottom: 0.12, color: blue },
    { top: 0.12, bottom: -2, color: ANTIFOULING },
  ], C(0x8a8f8c), 0.3, 0.7);
  const deck = 1.75;
  box(b, 0, deck, -L / 2 + 3.2, 3.0, 2.3, 3.4, WHITE, C(0xd0d4d6));             // timonerie à l'arrière
  box(b, 0, deck + 1.5, -L / 2 + 4.85, 2.6, 0.55, 0.06, GLASS);                  // vitres avant
  pole(b, 0, deck + 2.3, -L / 2 + 3.2, 1.6, 0.12, DARK);                         // antenne
  pole(b, 0, deck, 1.5, 6.5, 0.22, WHITE);                                        // mât à lampes (pêche au lamparo)
  for (const y of [3.4, 4.6, 5.8]) box(b, 0, deck + y, 1.5, 1.8, 0.16, 0.16, C(0xd9d6c8));
  box(b, -0.5, deck, 3.5, 2.6, 0.9, 3.2, C(0x8b5a3a));                           // filets empilés
  box(b, 0.8, deck, -0.8, 1.2, 0.6, 1.4, C(0x2f6fb0));                           // caisses à poisson
  return b.build();
}

function buildChalutier(variant: number): THREE.BufferGeometry {
  const b = new MeshBuilder(), { length: L, beam: B } = SPECS.chalutier, blue = BLUES[(variant + 1) % BLUES.length];
  hull(b, L, B, 2.6, 1.8, [
    { top: 5, bottom: 2.15, color: WHITE },
    { top: 2.15, bottom: 0.15, color: blue },
    { top: 0.15, bottom: -3, color: ANTIFOULING },
  ], C(0x7e8582), 0.32, 0.78);
  const deck = 2.4;
  box(b, 0, deck, 2.5, 4.4, 2.4, 5, WHITE, C(0xd0d4d6));                   // timonerie
  box(b, 0, deck + 2.4, 2.9, 3.6, 1.6, 3.4, WHITE, C(0xc4c8ca));            // passerelle
  box(b, 0, deck + 3.3, 4.62, 3.2, 0.55, 0.06, GLASS);
  pole(b, 0, deck + 4, 2.4, 4, 0.2, WHITE);                                  // mât radar
  box(b, 0, deck + 7.6, 2.4, 1.8, 0.1, 0.25, DARK);                           // radar
  pole(b, 0, deck, 7.5, 6, 0.25, C(0xd8d1c0));                                // mât avant
  // Portique arrière (A-frame) et treuils.
  pole(b, -B * 0.38, deck, -L / 2 + 1.2, 4.5, 0.3, C(0xe0a020));
  pole(b, B * 0.38, deck, -L / 2 + 1.2, 4.5, 0.3, C(0xe0a020));
  box(b, 0, deck + 4.5, -L / 2 + 1.2, B * 0.8, 0.3, 0.3, C(0xe0a020));
  box(b, 0, deck, -2, 2.6, 1.1, 1.6, C(0x6b6f72));                            // treuil
  box(b, 1.2, deck, -5, 2, 0.9, 2.4, C(0x8b5a3a));                            // filets
  return b.build();
}

const BUILDERS: Record<BoatKind, (variant: number) => THREE.BufferGeometry> = {
  horsbord: buildHorsBord, barque: buildBarque, sardinier: buildSardinier, chalutier: buildChalutier,
};

// ---------------------------------------------------------------------------------------------------------------

/** Un bateau du port. Amarré, il se balance ; plus tard, `moored = false` le laissera à un pilote. */
export class Boat {
  readonly object = new THREE.Group();
  moored = true;
  heading: number;
  /** Échelle de taille (variété entre bateaux d'une même famille). */
  readonly size: number;
  private phase: number;

  /** Modèle (famille + variante de couleurs) : sert à regrouper les bateaux identiques en un seul tracé. */
  constructor(readonly spec: BoatSpec, readonly model: string, x: number, z: number, heading: number, size: number, seed: number) {
    this.object.rotation.order = 'YXZ';
    this.object.position.set(x, SEA, z);
    this.object.scale.setScalar(size);
    this.heading = heading;
    this.object.rotation.y = heading;
    this.size = size;
    this.phase = seed * 6.283;
  }

  get length(): number { return this.spec.length * this.size; }
  get beam(): number { return this.spec.beam * this.size; }

  /**
   * Flottaison : la houle est une onde qui se propage sur le plan d'eau, donc deux bateaux voisins bougent presque
   * ensemble (cohérent avec leur position). Un grand bateau monte et roule moins, et plus lentement, qu'un petit.
   */
  float(time: number): void {
    const p = this.object.position, L = this.length;
    const inertia = 1 / (1 + L / 8);                                // 0,6 pour un hors-bord, 0,3 pour un chalutier
    const period = 3.2 + L * 0.12;
    const wave = time * (Math.PI * 2 / period) - (p.x * 0.045 + p.z * 0.03) + this.phase * 0.15;
    p.y = SEA + 0.09 * inertia * Math.sin(wave) + 0.035 * inertia * Math.sin(wave * 1.7 + this.phase);
    // Le roulis et le tangage suivent la pente de la vague sous la coque, avec un léger retard.
    this.object.rotation.z = 0.05 * inertia * Math.sin(wave + 0.9 + Math.cos(this.heading)) + 0.012 * Math.sin(time * 0.7 + this.phase);
    this.object.rotation.x = 0.022 * inertia * Math.sin(wave + 0.5 + Math.sin(this.heading));
    this.object.rotation.y = this.heading + 0.015 * Math.sin(time * 0.23 + this.phase); // tire doucement sur ses amarres
  }
}

/** Le port de pêche : place les bateaux et les anime. */
export class Harbor {
  readonly boats: Boat[] = [];
  private center: THREE.Vector3;
  /**
   * Un tracé par modèle (InstancedMesh) : 250 bateaux ne coûtent qu'une quinzaine d'appels de dessin.
   * Un bateau que l'on conduira plus tard sortira de son groupe et aura son propre maillage.
   */
  private groups: { mesh: THREE.InstancedMesh; boats: Boat[] }[] = [];

  constructor(scene: THREE.Scene, data: WorldData, centerX: number, centerN: number, radius: number, ground: (x: number, z: number) => number) {
    this.center = new THREE.Vector3(centerX, 0, -centerN);
    const rings = data.land.map((r) => { const pts: [number, number][] = []; for (let i = 0; i < r.length; i += 2) pts.push([r[i], r[i + 1]]); return pts; });
    const onLand = (x: number, n: number) => {
      let inside = false;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [ax, an] = ring[i], [bx, bn] = ring[j];
          if ((an > n) !== (bn > n) && x < ((bx - ax) * (n - an)) / (bn - an) + ax) inside = !inside;
        }
      }
      return inside;
    };
    const beaches = data.areas.filter((a) => a.k === 'beach').map((a) => { const pts: [number, number][] = []; for (let i = 0; i < a.p.length; i += 2) pts.push([a.p[i], a.p[i + 1]]); return pts; });
    const onBeach = (x: number, n: number) => beaches.some((ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, an] = ring[i], [bx, bn] = ring[j];
        if ((an > n) !== (bn > n) && x < ((bx - ax) * (n - an)) / (bn - an) + ax) inside = !inside;
      }
      return inside;
    });
    // Bassin abrité : depuis un point d'eau, la terre est proche dans la plupart des directions (jetées, quais).
    const sheltered = (x: number, n: number) => {
      let hits = 0;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        for (let d = 8; d <= 260; d += 10) if (onLand(x + Math.cos(a) * d, n + Math.sin(a) * d)) { hits++; break; }
      }
      return hits >= 10;
    };

    let seed = 77;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // Tirage : les gros bateaux ne trouvent pas toujours la place ; on les tire plus souvent pour qu'il en reste assez.
    const pick = (): BoatKind => { const r = random(); return r < 0.5 ? 'horsbord' : r < 0.62 ? 'barque' : r < 0.8 ? 'sardinier' : 'chalutier'; };
    const variants = new Map<string, THREE.BufferGeometry>();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const placed: { x: number; n: number; r: number }[] = [];

    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, an] = ring[i], [bx, bn] = ring[(i + 1) % ring.length];
        const length = Math.hypot(bx - ax, bn - an);
        if (length < 2) continue;
        const mx = (ax + bx) / 2, mn = (an + bn) / 2;
        if (Math.hypot(mx - centerX, mn - centerN) > radius + 40) continue;
        const ux = (bx - ax) / length, un = (bn - an) / length;
        // Normale vers l'eau.
        let nx = -un, nn = ux;
        if (onLand(mx + nx * 3, mn + nn * 3)) { nx = -nx; nn = -nn; }
        if (onLand(mx + nx * 3, mn + nn * 3)) continue;
        // Bateaux amarrés côte à côte, la poupe vers le quai, l'étrave vers le bassin.
        for (let t = 1.5; t < length - 1.5;) {
          const kind = pick(), spec = SPECS[kind], size = 0.85 + random() * 0.35;
          const L = spec.length * size, B = spec.beam * size;
          const qx = ax + ux * (t + B / 2), qn = an + un * (t + B / 2);
          if (t + B > length - 0.5) break;
          const cx = qx + nx * (L / 2 + 2), cn = qn + nn * (L / 2 + 2);
          if (Math.hypot(cx - centerX, cn - centerN) > radius) { t += B + 0.7; continue; }
          // Toute la coque doit être dans l'eau, loin des autres bateaux, et dans le bassin abrité.
          let ok = !placed.some((p) => Math.hypot(p.x - cx, p.n - cn) < p.r + Math.max(L, B) / 2 * 0.9);
          for (let d = -L / 2; ok && d <= L / 2 + 1; d += 2) {
            for (const w of [-B / 2 - 0.4, B / 2 + 0.4]) {
              const px = cx + nx * d - nn * w, pn = cn + nn * d + nx * w;
              // Dans l'eau d'après le trait de côte, hors des plages, et pas sur un haut-fond émergé du relief.
              if (onLand(px, pn) || onBeach(px, pn) || ground(px, -pn) > -0.3) ok = false;
            }
          }
          if (ok && !sheltered(cx, cn)) ok = false;
          if (ok) {
            const key = `${kind}|${Math.floor(random() * 4)}`;
            let geometry = variants.get(key);
            if (!geometry) { geometry = BUILDERS[kind](Number(key.split('|')[1])); variants.set(key, geometry); }
            const boat = new Boat(spec, key, cx, -cn, Math.atan2(nx, -nn), size, random());
            this.boats.push(boat);
            placed.push({ x: cx, n: cn, r: Math.max(L, B) / 2 });
            t += B + 0.6 + random() * 0.8;
          } else t += 1.5;
        }
      }
    }
    this.finish(scene, variants, material);
  }

  /** Regroupe les bateaux par modèle (à appeler une fois le placement terminé). */
  private finish(scene: THREE.Scene, variants: Map<string, THREE.BufferGeometry>, material: THREE.Material): void {
    for (const [key, geometry] of variants) {
      const boats = this.boats.filter((b) => b.model === key);
      if (!boats.length) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, boats.length);
      mesh.castShadow = true;
      mesh.frustumCulled = false; // les bateaux bougent : la boîte englobante d'origine ne suffit pas
      this.groups.push({ mesh, boats });
      scene.add(mesh);
    }
    this.update(0, this.center);
  }

  /** Nombre de bateaux par famille (essais). */
  census(): Record<string, number | number[][]> {
    const out: Record<string, number | number[][]> = {};
    for (const boat of this.boats) {
      out[boat.spec.kind] = ((out[boat.spec.kind] as number) ?? 0) + 1;
      const key = boat.spec.kind + 'At';
      if (!out[key]) out[key] = [];
      const list = out[key] as number[][];
      if (list.length < 3) list.push([Math.round(boat.object.position.x), Math.round(-boat.object.position.z), +boat.heading.toFixed(2)]);
    }
    return out;
  }

  update(time: number, viewer: THREE.Vector3): void {
    const near = viewer.distanceTo(this.center) < VIEW + 400;
    for (const { mesh, boats } of this.groups) {
      mesh.visible = near;
      if (!near) continue;
      boats.forEach((boat, i) => {
        if (boat.moored) boat.float(time);
        boat.object.updateMatrix();
        mesh.setMatrixAt(i, boat.object.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
