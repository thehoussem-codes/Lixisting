import * as THREE from 'three';
import { type Ground, canvasTexture } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';
import type { WorldData } from './WorldData';

/**
 * Îlot au nord du complexe commercial, entre le boulevard Zighout Youcef et la rue du 24 Février.
 *
 * OpenStreetMap n'y a aucun bâtiment (seulement le point « ANNABA RP », bureau de poste), alors que la vue
 * satellite de Houssem montre :
 * - La Grande Poste : grand bâtiment colonial en quadrilatère autour d'une cour (un palmier), toits de tuiles
 *   orange en croupe, pavillons d'angle marqués ; environ 40 × 66 m ;
 * - au nord, un grand immeuble à toit plat autour d'une cour plantée ;
 * - entre le complexe et la Poste : stationnement et grands arbres.
 * Emprises mesurées sur la vue satellite (échelle calée sur les deux rues, ±2 m) ; hauteurs estimées.
 * Les volumes passent par le générateur de bâtiments (façades coloniales comme le reste du centre) ;
 * ce module ajoute les toits de tuiles en croupe de la Poste.
 */

type Rect = { x0: number; n0: number; x1: number; n1: number; h: number; roof?: number };

const POSTE: Rect[] = [
  // Pavillons d'angle, un peu plus hauts, toits en croupe séparés.
  { x0: 109.5, n0: 747, x1: 122.5, n1: 760, h: 15, roof: 3.6 },
  { x0: 136, n0: 747, x1: 149, n1: 760, h: 15, roof: 3.6 },
  { x0: 109.5, n0: 800, x1: 122.5, n1: 813, h: 15, roof: 3.6 },
  { x0: 136, n0: 800, x1: 149, n1: 813, h: 15, roof: 3.6 },
  // Ailes entre les pavillons.
  { x0: 122.5, n0: 747, x1: 136, n1: 758, h: 13, roof: 3 },
  { x0: 122.5, n0: 802, x1: 136, n1: 813, h: 13, roof: 3 },
  { x0: 109.5, n0: 760, x1: 120.5, n1: 800, h: 13, roof: 3 },
  { x0: 138, n0: 760, x1: 149, n1: 800, h: 13, roof: 3 },
];
const NORTH: Rect[] = [
  { x0: 112, n0: 816, x1: 149, n1: 828, h: 15 },
  { x0: 112, n0: 856, x1: 149, n1: 868, h: 15 },
  { x0: 112, n0: 828, x1: 125, n1: 856, h: 15 },
  { x0: 140, n0: 828, x1: 149, n1: 856, h: 15 },
];

const ring = (r: Rect) => [r.x0, r.n0, r.x1, r.n0, r.x1, r.n1, r.x0, r.n1];

/** Ajoute les volumes manquants aux données, avant la construction des bâtiments génériques. */
export function addGrandePoste(data: WorldData): void {
  for (const r of POSTE) data.buildings.push({ h: r.h, t: 'colonial', p: ring(r), n: 'La Grande Poste' });
  for (const r of NORTH) data.buildings.push({ h: r.h, t: 'apartment', p: ring(r) }); // toit plat clair (satellite)
}

function tiles(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#c96b3f'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = 'rgba(90,35,15,0.4)'; ctx.fillRect(0, y, 128, 3);
      for (let x = (y / 16) % 2 ? 8 : 0; x < 128; x += 16) {
        ctx.fillStyle = `rgba(${215 + ((x * 7 + y) % 35)},${110 + ((x + y * 3) % 30)},70,0.35)`;
        ctx.fillRect(x + 1, y + 3, 14, 13);
      }
    }
  });
}

export function buildGrandePoste(scene: THREE.Scene, ground: Ground): { keepTree: (x: number, n: number) => boolean; trees: [string, number, number, number][] } {
  const roof = new MeshBuilder(), white = new THREE.Color(0xffffff);
  for (const r of POSTE) {
    // Même sommet de mur que le générateur : sol le plus haut sous l'emprise + hauteur.
    const top = Math.max(...[[r.x0, r.n0], [r.x1, r.n0], [r.x1, r.n1], [r.x0, r.n1]].map(([x, n]) => ground(x, -n))) + r.h;
    const o = 0.5, x0 = r.x0 - o, x1 = r.x1 + o, n0 = r.n0 - o, n1 = r.n1 + o;
    const w = x1 - x0, d = n1 - n0, rise = r.roof ?? 3, apex = top + rise;
    // Faîte le long du grand côté, croupes aux deux bouts.
    const alongX = w >= d, half = Math.min(w, d) / 2;
    const ra: [number, number] = alongX ? [x0 + half, (n0 + n1) / 2] : [(x0 + x1) / 2, n0 + half];
    const rb: [number, number] = alongX ? [x1 - half, (n0 + n1) / 2] : [(x0 + x1) / 2, n1 - half];
    const v = (x: number, y: number, n: number) => roof.vertex(x, y, -n, white, 1, (x + n) / 3, y / 3);
    const c00 = v(x0, top, n0), c10 = v(x1, top, n0), c11 = v(x1, top, n1), c01 = v(x0, top, n1);
    const A = v(ra[0], apex, ra[1]), B = v(rb[0], apex, rb[1]);
    if (alongX) {
      roof.triangle(c00, c10, B); roof.triangle(c00, B, A);   // pan sud
      roof.triangle(c11, c01, A); roof.triangle(c11, A, B);   // pan nord
      roof.triangle(c01, c00, A); roof.triangle(c10, c11, B); // croupes
    } else {
      roof.triangle(c10, c11, B); roof.triangle(c10, B, A);
      roof.triangle(c01, c00, A); roof.triangle(c01, A, B);
      roof.triangle(c00, c10, A); roof.triangle(c11, c01, B);
    }
  }
  const mesh = new THREE.Mesh(roof.build(), new THREE.MeshLambertMaterial({ map: tiles(), side: THREE.DoubleSide }));
  mesh.castShadow = true;
  scene.add(mesh);
  const all = [...POSTE, ...NORTH];
  return {
    keepTree: (x, n) => !all.some((r) => x > r.x0 - 1 && x < r.x1 + 1 && n > r.n0 - 1 && n < r.n1 + 1),
    trees: [
      ['palm', 135, 797, 1.1],                                    // cour de la Poste (satellite)
      ['ficus', 141, 737, 1.25], ['ficus', 147, 727, 1.15], ['ficus', 134, 742, 1.1], // grands arbres du stationnement
      ['ficus', 130, 840, 1.0], ['ficus', 136, 846, 0.95],        // cour plantée de l'immeuble nord
    ],
  };
}
