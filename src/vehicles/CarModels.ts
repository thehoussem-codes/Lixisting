import * as THREE from 'three';
import { assets } from '../assets/AssetLibrary';
import type { Handling } from './physics/SuspensionPhysics';

/**
 * Catalogue des véhicules et atelier de carrosserie.
 *
 * Chaque voiture est décrite par quelques mesures et par deux lignes de profil
 * (ceinture de caisse et toit). La carrosserie est ensuite "tirée" de l'arrière
 * vers l'avant : à chaque tranche, une section arrondie, plus étroite en haut.
 * Les silhouettes s'inspirent du parc automobile algérien ; elles ne portent
 * aucun logo ni nom de marque.
 */
export interface CarSpec {
  id: string;
  label: string;
  length: number; width: number; height: number;
  clearance: number;          // garde au sol
  wheelRadius: number;
  axleRear: number; axleFront: number; // position des essieux, de 0 (arrière) à 1 (avant)
  /** Ligne de ceinture : [position, hauteur en fraction de la hauteur totale]. */
  belt: [number, number][];
  /** Ligne de toit, du bas de la lunette arrière au bas du pare-brise. */
  roof: [number, number][];
  trim: boolean;              // pare-chocs et baguettes latérales noirs (modèles anciens)
  darkRoof?: boolean;
  taxi?: boolean;
  /** Fréquence dans la circulation (1 par défaut). */
  weight?: number;
  /** Deux-roues : maxi-scooter ou cyclomoteur (silhouettes génériques, sans logo). */
  moto?: 'maxiscooter' | 'cyclomoteur';
  tallLights?: boolean;       // feux arrière verticaux (hayons)
  /** Vitesse maximale en km/h ; null : aucune limite (véhicules d'intervention). 115 par défaut. */
  topSpeed?: number | null;
  /** Reprise : multiplie l'accélération jusqu'à 100 km/h (1 par défaut ; 1.4 = nettement plus vif). */
  sprint?: number;
  /** Réglages de conduite propres à ce modèle (le reste est déduit de ses dimensions). */
  handling?: Partial<Handling>;
  /** Points de suspension imposés ([x, z] × 4), sinon déduits des essieux. */
  wheelPoints?: [number, number][];
  /** Boîte de collision imposée, sinon déduite des dimensions. */
  collision?: { halfLength: number; halfWidth: number };
  colors: number[];
}

const SILVER = [0xb9bcc2, 0x9da2aa, 0xd9dadc], WHITE = [0xf2f2ee, 0xe9e7e0];
const HATCH_BELT: [number, number][] = [[0, 0.5], [0.04, 0.6], [0.5, 0.61], [0.72, 0.6], [0.9, 0.56], [0.97, 0.5], [1, 0.43]];
const HATCH_ROOF: [number, number][] = [[0.03, 0.6], [0.13, 0.97], [0.42, 1], [0.56, 0.97], [0.74, 0.6]];
const SEDAN_BELT: [number, number][] = [[0, 0.5], [0.03, 0.58], [0.2, 0.6], [0.72, 0.6], [0.9, 0.55], [0.97, 0.49], [1, 0.42]];
const SEDAN_ROOF: [number, number][] = [[0.16, 0.6], [0.3, 0.97], [0.46, 1], [0.58, 0.97], [0.75, 0.6]];
const SUV_BELT: [number, number][] = [[0, 0.52], [0.04, 0.62], [0.72, 0.63], [0.9, 0.6], [0.97, 0.53], [1, 0.45]];
const SUV_ROOF: [number, number][] = [[0.03, 0.63], [0.1, 0.97], [0.45, 1], [0.6, 0.97], [0.76, 0.63]];

export const CAR_CATALOG: CarSpec[] = [
  { id: 'mini', label: 'Mini citadine haute', length: 3.5, width: 1.5, height: 1.56, clearance: 0.16, wheelRadius: 0.27, axleRear: 0.17, axleFront: 0.82,
    belt: HATCH_BELT, roof: [[0.03, 0.6], [0.1, 0.98], [0.45, 1], [0.6, 0.97], [0.76, 0.6]], trim: true, tallLights: true, colors: [...SILVER, 0x8a3b32] },
  { id: 'citadine', label: 'Citadine 5 portes', length: 3.85, width: 1.66, height: 1.46, clearance: 0.15, wheelRadius: 0.29, axleRear: 0.17, axleFront: 0.82,
    belt: HATCH_BELT, roof: HATCH_ROOF, trim: true, tallLights: true, colors: [...SILVER, ...WHITE, 0x7f86a3] },
  { id: 'citadine-recente', label: 'Citadine récente', length: 4.0, width: 1.72, height: 1.47, clearance: 0.15, wheelRadius: 0.31, axleRear: 0.16, axleFront: 0.82,
    belt: [[0, 0.52], [0.04, 0.62], [0.5, 0.64], [0.72, 0.62], [0.9, 0.57], [0.97, 0.5], [1, 0.43]], roof: HATCH_ROOF, trim: false, tallLights: true,
    colors: [0xc8261e, ...WHITE, 0x7a7fb0, 0x9da2aa] },
  { id: 'compacte', label: 'Compacte', length: 4.25, width: 1.79, height: 1.46, clearance: 0.15, wheelRadius: 0.32, axleRear: 0.16, axleFront: 0.81,
    belt: HATCH_BELT, roof: [[0.03, 0.6], [0.15, 0.97], [0.42, 1], [0.56, 0.97], [0.73, 0.6]], trim: false, colors: [...WHITE, 0x2a2d33, 0x9da2aa] },
  { id: 'berline', label: 'Berline tricorps', length: 4.25, width: 1.7, height: 1.5, clearance: 0.16, wheelRadius: 0.3, axleRear: 0.2, axleFront: 0.82,
    belt: SEDAN_BELT, roof: SEDAN_ROOF, trim: true, colors: [0x24459a, ...SILVER, ...WHITE, 0x1f2a44] },
  { id: 'grande-berline', label: 'Grande berline', length: 4.55, width: 1.77, height: 1.42, clearance: 0.15, wheelRadius: 0.31, axleRear: 0.2, axleFront: 0.82,
    belt: SEDAN_BELT, roof: [[0.17, 0.6], [0.32, 0.97], [0.47, 1], [0.58, 0.97], [0.76, 0.6]], trim: true, colors: [0x2c5440, 0x2f5a47, ...SILVER, 0xe6e0cf] },
  { id: 'suv', label: 'SUV', length: 4.45, width: 1.84, height: 1.68, clearance: 0.22, wheelRadius: 0.36, axleRear: 0.17, axleFront: 0.81,
    belt: SUV_BELT, roof: SUV_ROOF, trim: false, colors: [...WHITE, 0x2a2d33] },
  { id: 'suv-coupe', label: 'SUV à toit noir', length: 4.37, width: 1.9, height: 1.6, clearance: 0.21, wheelRadius: 0.37, axleRear: 0.17, axleFront: 0.81,
    belt: [[0, 0.56], [0.04, 0.7], [0.5, 0.67], [0.72, 0.64], [0.9, 0.6], [0.97, 0.53], [1, 0.45]], roof: [[0.03, 0.7], [0.1, 0.94], [0.45, 1], [0.6, 0.98], [0.76, 0.64]],
    trim: false, darkRoof: true, colors: WHITE },
  { id: 'taxi', label: 'Taxi', length: 4.25, width: 1.7, height: 1.5, clearance: 0.16, wheelRadius: 0.3, axleRear: 0.2, axleFront: 0.82,
    belt: SEDAN_BELT, roof: SEDAN_ROOF, trim: true, taxi: true, colors: [0xf5b800] },
];

const GLASS = new THREE.Color(0x1a2026), TRIM = new THREE.Color(0x2a2c2f), UNDER = new THREE.Color(0x121212);
const PAINT = new THREE.Color(0xffffff); // blanc : teinté ensuite par la couleur de la voiture
const DARK_ROOF = new THREE.Color(0x17191c);

function interpolate(points: [number, number][], t: number): number {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0]) {
      const [t0, v0] = points[i - 1], [t1, v1] = points[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

/** Deux-roues présents dans la circulation (environ un véhicule sur dix). */
export const MOTO_CATALOG: CarSpec[] = [
  { id: 'maxiscooter', label: 'Maxi-scooter', moto: 'maxiscooter', topSpeed: 140, sprint: 1.15, length: 2.2, width: 0.78, height: 1.42, clearance: 0.14, wheelRadius: 0.29, axleRear: 0.14, axleFront: 0.86,
    belt: [], roof: [], trim: false, colors: [0x1b1b1d, 0x3a3d42, 0xe9e7e0, 0x1f2a44] },
  { id: 'cyclomoteur', label: 'Cyclomoteur', moto: 'cyclomoteur', topSpeed: 50, sprint: 0.6, length: 1.78, width: 0.62, height: 1.05, clearance: 0.12, wheelRadius: 0.3, axleRear: 0.17, axleFront: 0.83,
    belt: [], roof: [], trim: false, colors: [0x2f55a4, 0xb3261e, 0xe8e4d8, 0xd9731a] },
];

/** Petit assembleur de géométrie avec normales fournies (pour des surfaces lisses). */
class Shell {
  positions: number[] = []; normals: number[] = []; colors: number[] = []; indices: number[] = [];

  quad(p: THREE.Vector3[], n: THREE.Vector3[], color: THREE.Color): void {
    const base = this.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      this.positions.push(p[i].x, p[i].y, p[i].z);
      this.normals.push(n[i].x, n[i].y, n[i].z);
      this.colors.push(color.r, color.g, color.b);
    }
    // On choisit l'ordre des sommets pour que la face visible soit du côté de la normale.
    const face = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    if (face.dot(n[0]) >= 0) this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  /** Rectangle plat défini par son centre, deux demi-axes et sa normale. */
  plate(center: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color): void {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => center.clone().addScaledVector(u, a).addScaledVector(v, b));
    this.quad(corners, [normal, normal, normal, normal], color);
  }

  box(center: THREE.Vector3, hx: number, hy: number, hz: number, color: THREE.Color): void {
    const X = new THREE.Vector3(hx, 0, 0), Y = new THREE.Vector3(0, hy, 0), Z = new THREE.Vector3(0, 0, hz);
    for (const s of [1, -1]) {
      this.plate(center.clone().addScaledVector(X, s), Y, Z, new THREE.Vector3(s, 0, 0), color);
      this.plate(center.clone().addScaledVector(Y, s), X, Z, new THREE.Vector3(0, s, 0), color);
      this.plate(center.clone().addScaledVector(Z, s), X, Y, new THREE.Vector3(0, 0, s), color);
    }
  }

  /** Poutre inclinée dans le plan vertical de la moto : de (y0, z0) à (y1, z1), demi-largeur hx, demi-épaisseur hy, décalée de cx. */
  beam(y0: number, z0: number, y1: number, z1: number, hx: number, hy: number, color: THREE.Color, cx = 0): void {
    const along = new THREE.Vector3(0, (y1 - y0) / 2, (z1 - z0) / 2), unit = along.clone().normalize();
    const up = new THREE.Vector3(0, unit.z, -unit.y), center = new THREE.Vector3(cx, (y0 + y1) / 2, (z0 + z1) / 2);
    if (up.y < 0) up.negate();
    const X = new THREE.Vector3(hx, 0, 0), Y = up.clone().multiplyScalar(hy);
    for (const s of [1, -1]) {
      this.plate(center.clone().addScaledVector(X, s), Y, along, new THREE.Vector3(s, 0, 0), color);
      this.plate(center.clone().addScaledVector(Y, s), X, along, up.clone().multiplyScalar(s), color);
      this.plate(center.clone().addScaledVector(along, s), X, Y, unit.clone().multiplyScalar(s), color);
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

interface CarGeometry { body: THREE.BufferGeometry; details: THREE.BufferGeometry }
const geometryCache = new Map<string, CarGeometry>();

/** Largeur de la caisse vue du dessus : elle se resserre vers les deux extrémités. */
function taper(t: number): number {
  const rear = Math.max(0, (0.12 - t) / 0.12), front = Math.max(0, (t - 0.84) / 0.16);
  return 1 - 0.1 * rear * rear - 0.16 * front * front;
}

const M_WHITE = new THREE.Color(0xffffff), M_DARK = new THREE.Color(0x1a1a1c), M_SEAT = new THREE.Color(0x121212), M_METAL = new THREE.Color(0xa9adb2),
  M_GLASS = new THREE.Color(0x2c3b46), M_LIGHT = new THREE.Color(0xf3ecc8), M_RED = new THREE.Color(0xc0261c), M_PLATE = new THREE.Color(0xe8e8e0),
  M_BROWN = new THREE.Color(0x3a2a20), M_SKIN = new THREE.Color(0xc98f68), M_JEAN = new THREE.Color(0x2d3f5e), M_JACKET = new THREE.Color(0x1c1c20), M_HELMET = new THREE.Color(0x2a2a2e), M_HAIR = new THREE.Color(0x1a120c);

/** Carrosserie d'un deux-roues : la partie peinte (blanche, teintée par la peinture) et les détails. */
function buildMoto(spec: CarSpec): CarGeometry {
  const body = new Shell(), d = new Shell();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  if (spec.moto === 'maxiscooter') {
    body.beam(0.62, -0.15, 0.80, -1.02, 0.19, 0.14, M_WHITE);          // coque arrière qui remonte
    body.beam(0.44, 0.5, 1.0, 0.82, 0.25, 0.17, M_WHITE);              // tablier avant
    body.box(V(0, 0.8, 0.95), 0.21, 0.17, 0.13, M_WHITE);              // nez
    body.beam(0.5, 0.62, 0.62, 0.98, 0.075, 0.05, M_WHITE);            // garde-boue avant
    d.beam(0.4, -0.6, 0.4, 0.5, 0.21, 0.13, M_DARK);                   // plancher et bas de caisse
    d.beam(0.5, -0.1, 0.55, 0.45, 0.13, 0.1, M_DARK);                  // tunnel central
    d.beam(0.83, 0.1, 0.8, -0.35, 0.18, 0.06, M_SEAT);                 // selle du pilote
    d.beam(0.9, -0.38, 0.95, -0.85, 0.17, 0.06, M_SEAT);               // selle du passager, plus haute
    d.beam(1.03, 0.85, 1.4, 0.66, 0.2, 0.012, M_GLASS);                // bulle
    d.box(V(0, 1.07, 0.6), 0.36, 0.022, 0.022, M_DARK);                // guidon
    for (const s of [1, -1]) {
      d.box(V(s * 0.37, 1.07, 0.56), 0.03, 0.03, 0.07, M_DARK);        // poignées
      d.beam(1.08, 0.6, 1.24, 0.56, 0.012, 0.012, M_DARK, s * 0.3);    // tiges de rétroviseurs
      d.box(V(s * 0.33, 1.27, 0.55), 0.07, 0.04, 0.012, M_DARK);
      d.box(V(s * 0.11, 0.84, 1.085), 0.07, 0.045, 0.01, M_LIGHT);     // double optique
      d.beam(0.3, 0.76, 0.72, 0.68, 0.02, 0.03, M_METAL, s * 0.085);   // fourche
      d.box(V(s * 0.12, 0.83, -1.1), 0.05, 0.03, 0.02, M_RED);         // feux arrière
    }
    d.beam(0.36, -0.2, 0.52, -1.0, 0.055, 0.06, M_METAL, -0.24);       // pot d'échappement
    d.box(V(0, 0.62, -1.12), 0.09, 0.055, 0.008, M_PLATE);             // plaque
    d.beam(0.3, -0.75, 0.42, -0.3, 0.06, 0.06, M_DARK);                // bras oscillant / moteur
  } else {
    body.beam(0.48, -0.5, 0.56, 0.28, 0.04, 0.055, M_WHITE);           // cadre en tôle
    body.beam(0.52, 0.22, 0.9, 0.44, 0.065, 0.085, M_WHITE);           // réservoir le long de la colonne
    body.beam(0.63, -0.42, 0.6, -0.86, 0.06, 0.012, M_WHITE);          // garde-boue arrière
    body.beam(0.62, 0.42, 0.6, 0.78, 0.055, 0.012, M_WHITE);           // garde-boue avant
    body.box(V(0, 0.42, -0.05), 0.075, 0.09, 0.2, M_WHITE);            // carters latéraux
    d.beam(0.84, -0.5, 0.84, 0.04, 0.115, 0.045, M_BROWN);             // selle longue
    d.beam(0.52, -0.22, 0.8, -0.26, 0.022, 0.022, M_METAL);            // tube de selle
    d.box(V(0, 0.34, 0.08), 0.09, 0.09, 0.13, M_METAL);                // moteur
    d.box(V(0, 0.3, 0.08), 0.17, 0.012, 0.03, M_DARK);                 // pédales
    d.box(V(0, 0.99, 0.42), 0.29, 0.016, 0.016, M_METAL);              // guidon
    d.box(V(0, 0.82, 0.58), 0.075, 0.075, 0.05, M_METAL);              // phare rond
    d.box(V(0, 0.82, 0.635), 0.055, 0.055, 0.006, M_LIGHT);
    d.beam(0.74, -0.5, 0.74, -0.88, 0.09, 0.01, M_METAL);              // porte-bagages
    d.box(V(0, 0.66, -0.89), 0.035, 0.03, 0.012, M_RED);               // feu arrière
    d.box(V(0, 0.52, -0.9), 0.07, 0.045, 0.006, M_PLATE);
    d.beam(0.3, 0.1, 0.33, -0.62, 0.028, 0.028, M_METAL, -0.11);       // pot fin
    for (const s of [1, -1]) {
      d.box(V(s * 0.3, 0.99, 0.4), 0.025, 0.025, 0.05, M_DARK);        // poignées
      d.beam(0.3, 0.59, 0.97, 0.45, 0.014, 0.02, M_METAL, s * 0.06);   // fourche
      d.beam(0.32, -0.6, 0.72, -0.5, 0.014, 0.018, M_METAL, s * 0.09); // amortisseurs arrière
    }
  }
  return { body: body.build(), details: d.build() };
}

/** Conducteur assis sur un deux-roues (silhouette simple). */
function buildRider(spec: CarSpec): THREE.Object3D {
  const s = new Shell(), scooter = spec.moto === 'maxiscooter';
  const seatY = scooter ? 0.9 : 0.9, seatZ = scooter ? -0.08 : -0.2, barY = scooter ? 1.07 : 0.99, barZ = scooter ? 0.56 : 0.4;
  const footY = scooter ? 0.56 : 0.34, footZ = scooter ? 0.38 : 0.1, shoulderY = seatY + 0.55, shoulderZ = seatZ + 0.12;
  s.beam(seatY + 0.02, seatZ, shoulderY, shoulderZ, 0.19, 0.11, M_JACKET);                     // buste
  for (const side of [1, -1]) {
    s.beam(shoulderY - 0.05, shoulderZ, barY + 0.02, barZ - 0.02, 0.05, 0.05, M_JACKET, side * 0.25); // bras
    s.box(new THREE.Vector3(side * (scooter ? 0.36 : 0.29), barY + 0.02, barZ), 0.04, 0.04, 0.05, M_SKIN);
    s.beam(seatY + 0.02, seatZ + 0.02, footY + 0.42, footZ + 0.05, 0.075, 0.075, M_JEAN, side * 0.13); // cuisses
    s.beam(footY + 0.42, footZ + 0.05, footY + 0.05, footZ - 0.02, 0.06, 0.06, M_JEAN, side * 0.14);   // tibias
    s.box(new THREE.Vector3(side * 0.14, footY + 0.03, footZ + 0.06), 0.05, 0.035, 0.12, M_DARK);       // chaussures
  }
  const rider = new THREE.Group();
  rider.add(new THREE.Mesh(s.build(), detailMaterial));
  // Casque intégral sur le maxi-scooter ; tête nue sur le cyclomoteur.
  const head = new THREE.Mesh(new THREE.SphereGeometry(scooter ? 0.15 : 0.115, 10, 8), new THREE.MeshLambertMaterial({ color: scooter ? M_HELMET : M_SKIN }));
  head.position.set(0, shoulderY + (scooter ? 0.2 : 0.17), shoulderZ + 0.04);
  rider.add(head);
  if (scooter) {
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.04), new THREE.MeshLambertMaterial({ color: 0x0b0f14 }));
    visor.position.set(0, shoulderY + 0.22, shoulderZ + 0.17);
    rider.add(visor);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: M_HAIR }));
    hair.position.set(0, shoulderY + 0.185, shoulderZ + 0.03);
    rider.add(hair);
  }
  rider.name = 'rider';
  rider.visible = false;
  return rider;
}

function buildGeometry(spec: CarSpec): CarGeometry {
  if (spec.moto) return buildMoto(spec);
  const { length: L, width: W, height: H } = spec;
  const g0 = spec.roof[0][0], g1 = spec.roof[spec.roof.length - 1][0];       // limites du vitrage
  const flat0 = spec.roof[1][0], flat1 = spec.roof[spec.roof.length - 2][0];  // partie plate du toit
  const pillar = flat0 + (flat1 - flat0) * 0.52;                              // montant central

  // Tranches : régulières, plus les points clés du profil.
  const stops = new Set<number>();
  for (let i = 0; i <= 28; i++) stops.add(i / 28);
  for (const [t] of [...spec.belt, ...spec.roof]) stops.add(t);
  for (const t of [pillar - 0.014, pillar + 0.014, 0.015, 0.985]) stops.add(t);
  const ts = [...stops].sort((a, b) => a - b);

  /** Demi-section (côté droit), du milieu du plancher au milieu du toit : 10 points. */
  const section = (t: number): [number, number][] => {
    const w = (W / 2) * taper(t);
    const edge = Math.max(0, (0.05 - t) / 0.05, (t - 0.95) / 0.05);
    const bottom = spec.clearance + 0.16 * edge * edge;
    const belt = H * interpolate(spec.belt, t);
    const mid = bottom + (belt - bottom) * 0.5;
    const half: [number, number][] = [[0, bottom], [w * 0.8, bottom], [w * 0.97, bottom + 0.09], [w, mid - 0.035], [w, mid + 0.035], [w * 0.97, belt]];
    if (t > g0 && t < g1) {
      const roof = H * interpolate(spec.roof, t), rise = roof - belt;
      half.push([w * 0.9, belt + rise * 0.5], [w * 0.8, roof - Math.min(0.06, rise * 0.3)], [w * 0.5, roof], [0, roof + Math.min(0.025, rise * 0.1)]);
    } else {
      half.push([w * 0.84, belt + 0.02], [w * 0.6, belt + 0.035], [w * 0.3, belt + 0.045], [0, belt + 0.05]);
    }
    return half;
  };

  // Grille de points : une couronne de 18 points par tranche.
  const grid: THREE.Vector3[][] = ts.map((t) => {
    const half = section(t), z = (t - 0.5) * L;
    const ring = half.map(([x, y]) => new THREE.Vector3(x, y, z));
    for (let k = half.length - 2; k >= 1; k--) ring.push(new THREE.Vector3(-half[k][0], half[k][1], z));
    return ring;
  });
  const R = grid[0].length;

  // Normales lissées : c'est ce qui donne l'aspect arrondi.
  const normals: THREE.Vector3[][] = grid.map((ring, i) => ring.map((point, j) => {
    const along = new THREE.Vector3().subVectors(grid[Math.min(i + 1, ts.length - 1)][j], grid[Math.max(i - 1, 0)][j]);
    const around = new THREE.Vector3().subVectors(ring[(j + 1) % R], ring[(j + R - 1) % R]);
    const normal = along.cross(around).normalize();
    const outward = new THREE.Vector3(point.x, point.y - H * 0.45, 0);
    return normal.dot(outward) < 0 ? normal.negate() : normal;
  }));

  const body = new Shell();
  const roofPaint = spec.darkRoof ? DARK_ROOF : PAINT;
  for (let i = 0; i < ts.length - 1; i++) {
    const t = (ts[i] + ts[i + 1]) / 2;
    const glassZone = t > g0 && t < g1, flatRoof = t > flat0 && t < flat1;
    const bumper = spec.trim && (t < 0.06 || t > 0.94);
    for (let j = 0; j < R; j++) {
      const k = (j + 1) % R, segment = j < 9 ? j : 17 - j; // même numéro de bande des deux côtés
      let color = PAINT;
      if (segment === 0) color = UNDER;
      else if (segment <= 2) color = bumper ? TRIM : PAINT;
      else if (segment === 3) color = spec.trim ? TRIM : PAINT;
      else if (segment >= 5 && glassZone) {
        if (flatRoof) {
          const isPillar = Math.abs(t - pillar) < 0.014;
          color = segment <= 6 ? (isPillar ? PAINT : GLASS) : roofPaint; // vitres latérales, puis toit
        } else {
          color = segment <= 5 ? PAINT : GLASS;                          // montants, pare-brise, lunette
        }
      }
      body.quad([grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]], [normals[i][j], normals[i][k], normals[i + 1][k], normals[i + 1][j]], color);
    }
  }
  // Faces avant et arrière : un éventail fermé.
  for (const [index, direction] of [[0, -1], [ts.length - 1, 1]] as [number, number][]) {
    const ring = grid[index], normal = new THREE.Vector3(0, 0, direction);
    const center = new THREE.Vector3(0, (ring[0].y + ring[9].y) / 2, ring[0].z);
    for (let j = 0; j < R; j++) {
      body.quad([center, ring[j], ring[(j + 1) % R], center], [normal, normal, normal, normal], spec.trim && ring[j].y < center.y ? TRIM : PAINT);
    }
  }

  // Détails non teintés : optiques, calandre, plaques, passages de roue, rétroviseurs.
  const details = new Shell();
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const frontZ = L / 2 + 0.012, rearZ = -L / 2 - 0.012;
  const wf = (W / 2) * taper(1), wr = (W / 2) * taper(0);
  const beltF = H * interpolate(spec.belt, 1), beltR = H * interpolate(spec.belt, 0);
  const lamp = new THREE.Color(0xfff6d8), red = new THREE.Color(0xc41f1f), plateColor = new THREE.Color(0xf4f4ee), grille = new THREE.Color(0x15171a);
  const forward = new THREE.Vector3(0, 0, 1), backward = new THREE.Vector3(0, 0, -1);
  for (const side of [1, -1]) {
    details.plate(new THREE.Vector3(side * wf * 0.68, beltF - 0.12, frontZ), X.clone().multiplyScalar(wf * 0.24), Y.clone().multiplyScalar(0.075), forward, lamp);
    const tall = spec.tallLights ? 0.17 : 0.085;
    details.plate(new THREE.Vector3(side * wr * 0.74, beltR - 0.06 - (spec.tallLights ? 0 : 0.06) + (spec.tallLights ? 0.02 : 0), rearZ), X.clone().multiplyScalar(wr * 0.2), Y.clone().multiplyScalar(tall), backward, red);
    // Passage de roue : demi-disque sombre plaqué sur le flanc.
    for (const axle of [spec.axleRear, spec.axleFront]) {
      const z = (axle - 0.5) * L, x = side * ((W / 2) * taper(axle) + 0.006), r = spec.wheelRadius * 1.24;
      const normal = new THREE.Vector3(side, 0, 0), center = new THREE.Vector3(x, spec.wheelRadius, z);
      for (let s = 0; s < 8; s++) {
        const a0 = (s / 8) * Math.PI, a1 = ((s + 1) / 8) * Math.PI;
        const p0 = new THREE.Vector3(x, spec.wheelRadius + Math.sin(a0) * r, z + Math.cos(a0) * r);
        const p1 = new THREE.Vector3(x, spec.wheelRadius + Math.sin(a1) * r, z + Math.cos(a1) * r);
        details.quad([center, p0, p1, center], [normal, normal, normal, normal], UNDER);
      }
    }
    // Rétroviseur, au pied du pare-brise.
    const mirrorT = g1 - 0.03;
    details.box(new THREE.Vector3(side * ((W / 2) * taper(mirrorT) + 0.07), H * interpolate(spec.belt, mirrorT) + 0.06, (mirrorT - 0.5) * L), 0.075, 0.055, 0.04, spec.trim ? TRIM : new THREE.Color(0x3a3d42));
  }
  details.plate(new THREE.Vector3(0, beltF - 0.13, frontZ), X.clone().multiplyScalar(wf * 0.4), Y.clone().multiplyScalar(0.06), forward, grille);
  details.plate(new THREE.Vector3(0, spec.clearance + 0.2, frontZ + 0.004), X.clone().multiplyScalar(0.26), Y.clone().multiplyScalar(0.055), forward, plateColor);
  details.plate(new THREE.Vector3(0, spec.clearance + 0.3, rearZ - 0.004), X.clone().multiplyScalar(0.26), Y.clone().multiplyScalar(0.055), backward, plateColor);
  if (spec.taxi) details.box(new THREE.Vector3(0, H + 0.1, (0.46 - 0.5) * L), 0.3, 0.085, 0.07, new THREE.Color(0xffd21f));
  void Z;

  return { body: body.build(), details: details.build() };
}

const paints = new Map<number, THREE.Material>();
const detailMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const tyreMaterial = new THREE.MeshLambertMaterial({ color: 0x151515 });
const hubMaterial = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
let taxiSign: THREE.Material | null = null;

function taxiSignMaterial(): THREE.Material {
  if (taxiSign) return taxiSign;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 20;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffd21f'; ctx.fillRect(0, 0, 64, 20);
  ctx.fillStyle = '#111'; ctx.font = 'bold 16px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', 32, 11);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  taxiSign = new THREE.MeshBasicMaterial({ map: texture });
  return taxiSign;
}

/**
 * Applique le catalogue de modèles 3D au catalogue de véhicules : un véhicule existant
 * reçoit le modèle et les réglages fournis ; une entrée avec "base" crée un nouveau véhicule.
 * À appeler une fois, après le chargement du catalogue.
 */
export function applyVehicleAssets(): void {
  for (const [id, asset] of assets.vehicles()) {
    const index = CAR_CATALOG.findIndex((spec) => spec.id === id);
    const base = index >= 0 ? CAR_CATALOG[index] : CAR_CATALOG.find((spec) => spec.id === asset.base);
    if (!base) { console.warn(`Véhicule "${id}" : modèle de base "${asset.base}" introuvable.`); continue; }
    const spec: CarSpec = {
      ...base, id, label: asset.label ?? base.label,
      length: asset.length ?? base.length, width: asset.width ?? base.width, height: asset.height ?? base.height,
      wheelRadius: asset.wheelRadius ?? base.wheelRadius,
      wheelPoints: asset.wheels ?? base.wheelPoints, collision: asset.collision ?? base.collision,
      topSpeed: asset.topSpeed !== undefined ? asset.topSpeed : base.topSpeed, sprint: asset.sprint ?? base.sprint,
      colors: asset.colors ?? base.colors, taxi: index >= 0 ? base.taxi : false, weight: asset.weight ?? (index >= 0 ? base.weight : 1),
      handling: { ...base.handling, ...asset.handling, ...(asset.centerOfGravityHeight ? { cgHeight: asset.centerOfGravityHeight } : {}) },
    };
    if (index >= 0) CAR_CATALOG[index] = spec; else CAR_CATALOG.splice(CAR_CATALOG.length - 1, 0, spec); // le taxi reste en dernier
  }
}

export interface CarVisual { group: THREE.Group; wheels: THREE.Object3D[]; lean?: THREE.Object3D; rider?: THREE.Object3D }

/** Assemble une voiture du catalogue : caisse teintée, détails, quatre roues qui tournent. */
export function createCarVisual(spec: CarSpec, color: number): CarVisual {
  const asset = assets.vehicle(spec.id);
  // Avec un modèle 3D fourni, la carrosserie calculée sert seulement en attendant le chargement.
  const shape = asset?.base ? CAR_CATALOG.find((other) => other.id === asset.base) ?? spec : spec;
  let geometry = geometryCache.get(shape.id);
  if (!geometry) { geometry = buildGeometry(shape); geometryCache.set(shape.id, geometry); }
  let paint = paints.get(color);
  if (!paint) { paint = new THREE.MeshLambertMaterial({ color, vertexColors: true }); paints.set(color, paint); }

  if (spec.moto) {
    // Deux-roues : tout est placé dans un nœud qui penche en virage.
    const group = new THREE.Group(), lean = new THREE.Group();
    group.add(lean);
    lean.add(new THREE.Mesh(geometry.body, paint), new THREE.Mesh(geometry.details, detailMaterial));
    const thickness = spec.moto === 'maxiscooter' ? 0.14 : 0.07;
    const tyre = new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, thickness, 16);
    tyre.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(spec.wheelRadius * (spec.moto === 'maxiscooter' ? 0.6 : 0.78), spec.wheelRadius * (spec.moto === 'maxiscooter' ? 0.6 : 0.78), thickness + 0.012, 12);
    hub.rotateZ(Math.PI / 2);
    const wheels: THREE.Object3D[] = [];
    for (const axle of [spec.axleRear, spec.axleFront]) {
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(tyre, tyreMaterial), new THREE.Mesh(hub, hubMaterial));
      wheel.position.set(0, spec.wheelRadius, (axle - 0.5) * spec.length);
      lean.add(wheel);
      wheels.push(wheel);
    }
    const rider = buildRider(spec);
    lean.add(rider);
    return { group, wheels, lean, rider };
  }

  const group = new THREE.Group();
  const builtIn = [new THREE.Mesh(geometry.body, paint), new THREE.Mesh(geometry.details, detailMaterial)];
  group.add(...builtIn);

  const tyre = new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, 0.2, 16);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(spec.wheelRadius * 0.62, spec.wheelRadius * 0.62, 0.215, 10);
  hub.rotateZ(Math.PI / 2);
  const wheels: THREE.Object3D[] = [];
  for (const axle of [spec.axleRear, spec.axleFront]) {
    for (const side of [1, -1]) {
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(tyre, tyreMaterial), new THREE.Mesh(hub, hubMaterial));
      const point = spec.wheelPoints?.[wheels.length];
      if (point) wheel.position.set(point[0], spec.wheelRadius, point[1]);
      else wheel.position.set(side * ((spec.width / 2) * taper(axle) - 0.09), spec.wheelRadius, (axle - 0.5) * spec.length);
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  if (spec.taxi) {
    for (const direction of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.15), taxiSignMaterial());
      sign.position.set(0, spec.height + 0.1, (0.46 - 0.5) * spec.length + direction * 0.072);
      if (direction < 0) sign.rotation.y = Math.PI;
      group.add(sign);
    }
  }
  if (asset) {
    // Modèle 3D fourni : dès qu'il est chargé, il remplace la carrosserie calculée.
    assets.instance(asset, { length: spec.length, paint: color }).then((model) => {
      for (const mesh of builtIn) mesh.visible = false;
      group.add(model);
      if (asset.plates) addPlates(group, model, spec);
      if (asset.keepWheels === false) {
        const own = model.userData.wheels as THREE.Object3D[] | undefined;
        for (const wheel of wheels) wheel.visible = false;
        // Le modèle a ses propres roues nommées : ce sont elles qui tournent et braquent désormais.
        if (own) wheels.splice(0, wheels.length, ...own);
      }
    }).catch((error) => console.warn(`Modèle du véhicule "${spec.id}" non chargé, carrosserie intégrée conservée.`, error));
  }
  return { group, wheels };
}

const plateTextures = new Map<string, THREE.Texture>();
let plateCount = 0;

/**
 * Plaque algérienne : blanche à l'avant, jaune à l'arrière, chiffres noirs.
 * Numéro de série, puis catégorie et année, puis l'indicatif de la wilaya : 23 pour Annaba.
 */
function plateTexture(rear: boolean, index: number): THREE.Texture {
  const key = `${rear}|${index}`;
  let texture = plateTextures.get(key);
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 56;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = rear ? '#f2c61d' : '#f4f4f0';
    ctx.fillRect(0, 0, 256, 56);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 252, 52);
    const serial = String(10000 + ((index * 7919 + 4871) % 89999));
    const year = String(100 + ((index * 5) % 25)); // 1 : voiture particulière, puis les deux chiffres de l'année
    ctx.fillStyle = '#111'; ctx.font = 'bold 38px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${serial} ${year} 23`, 128, 30);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    plateTextures.set(key, texture);
  }
  return texture;
}

/** Pose les deux plaques sur la carrosserie : on cherche la surface du pare-chocs, on ne devine pas sa position. */
function addPlates(group: THREE.Group, model: THREE.Object3D, spec: CarSpec): void {
  const index = plateCount++ % 16;
  group.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster();
  for (const direction of [1, -1]) {
    const height = spec.height * (direction > 0 ? 0.3 : 0.36);
    const from = group.localToWorld(new THREE.Vector3(0, height, direction * (spec.length / 2 + 1)));
    const towards = group.localToWorld(new THREE.Vector3(0, height, 0)).sub(from).normalize();
    ray.set(from, towards);
    ray.far = 2;
    const hit = ray.intersectObject(model, true)[0];
    if (!hit) continue;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.11), new THREE.MeshLambertMaterial({ map: plateTexture(direction < 0, index) }));
    plate.position.copy(group.worldToLocal(hit.point.clone()));
    plate.position.z += direction * 0.02;
    if (direction < 0) plate.rotation.y = Math.PI;
    group.add(plate);
  }
}

/** Tirage qui respecte la fréquence de chaque modèle (les véhicules de secours sont rares). */
function weighted(specs: CarSpec[], roll: number): CarSpec {
  const total = specs.reduce((sum, spec) => sum + (spec.weight ?? 1), 0);
  let mark = roll * total;
  for (const spec of specs) { mark -= spec.weight ?? 1; if (mark <= 0) return spec; }
  return specs[specs.length - 1];
}

/** Tire au sort un modèle (un taxi de temps en temps) et une de ses couleurs. random : nombre entre 0 et 1. */
export function pickCar(random: () => number): { spec: CarSpec; color: number } {
  const taxi = CAR_CATALOG[CAR_CATALOG.length - 1];
  const others = CAR_CATALOG.slice(0, -1);
  // Un véhicule sur dix est un deux-roues ; sinon un taxi de temps en temps.
  const spec = random() < 0.1 ? MOTO_CATALOG[Math.floor(random() * MOTO_CATALOG.length)]
    : random() < 0.14 ? taxi : weighted(others, random());
  return { spec, color: spec.colors[Math.floor(random() * spec.colors.length)] };
}
