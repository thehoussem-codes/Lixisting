import * as THREE from 'three';
import type { Collider } from './Collider';
import { type Ground, boxAt, canvasTexture } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';

/**
 * Ponton de la plage Toche : jetée en bois sur pieux, de la plage vers le large (34 m), où sont amarrés les
 * bateaux du joueur. La côte d'OSM est ici une longue ligne droite (770,7 ; 5227) → (789 ; 5356) : le ponton
 * part perpendiculairement vers l'est, au droit du repère « Plage Toche ».
 * Aménagement de jeu (pas un ouvrage relevé sur place) : signalé comme tel.
 */

const START: [number, number] = [777.0, 5320.8];           // pied du ponton, sur le sable
const DIR: [number, number] = [0.9902, -0.1395];          // vers le large (perpendiculaire à la côte)
const SIDE: [number, number] = [-DIR[1], DIR[0]];         // vers le nord
const LENGTH = 34, WIDTH = 2.4, DECK = 1.25, RAMP = 9;

export interface BoatSpawn { x: number; n: number; heading: number; hull: number; stripe: number }

export interface Marina {
  ground: (x: number, z: number) => number | null;
  boats: BoatSpawn[];
  /** Le point du ponton le plus proche (x, n), pour débarquer. */
  nearestDeck: (x: number, n: number) => { x: number; n: number; distance: number };
}

function planks(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#8a6a48'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = `rgb(${130 + (y * 7) % 25},${98 + (y * 3) % 18},${66 + (y * 5) % 14})`; ctx.fillRect(0, y + 1, 128, 14);
      ctx.fillStyle = 'rgba(40,25,15,0.7)'; ctx.fillRect(0, y, 128, 2);
      ctx.fillStyle = 'rgba(30,20,10,0.5)'; for (let x = (y * 13) % 40; x < 128; x += 64) ctx.fillRect(x, y + 2, 2, 12);
    }
  });
}

export function buildTocheMarina(scene: THREE.Scene, ground: Ground, collider: Collider): Marina {
  const at = (u: number, v: number): [number, number] => [START[0] + DIR[0] * u + SIDE[0] * v, START[1] + DIR[1] * u + SIDE[1] * v];
  const beach = ground(START[0], -START[1]) + 0.12;
  const deckY = (u: number) => (u < RAMP ? beach + (DECK - beach) * Math.max(0, u / RAMP) : DECK);

  // Platelage (une tranche tous les 1,5 m pour suivre la rampe).
  const deck = new MeshBuilder(), wood = new THREE.Color(0xffffff);
  for (let u = 0; u < LENGTH; u += 1.5) {
    const u1 = Math.min(LENGTH, u + 1.5), y0 = deckY(u), y1 = deckY(u1);
    const q = [at(u, -WIDTH / 2), at(u1, -WIDTH / 2), at(u1, WIDTH / 2), at(u, WIDTH / 2)], y = [y0, y1, y1, y0];
    const ids = q.map(([x, n], k) => deck.vertex(x, y[k], -n, wood, 1, (k === 1 || k === 2 ? u1 : u) / 2, k > 1 ? 1.2 : 0));
    deck.triangle(ids[0], ids[1], ids[2]); deck.triangle(ids[0], ids[2], ids[3]);
    // Chants du platelage.
    for (const v of [-WIDTH / 2, WIDTH / 2]) {
      const [ax, an] = at(u, v), [bx, bn] = at(u1, v);
      const e = [deck.vertex(ax, y0 - 0.25, -an, wood, 0.7, u / 2, 0), deck.vertex(bx, y1 - 0.25, -bn, wood, 0.7, u1 / 2, 0),
        deck.vertex(bx, y1, -bn, wood, 0.85, u1 / 2, 0.2), deck.vertex(ax, y0, -an, wood, 0.85, u / 2, 0.2)];
      deck.triangle(e[0], e[1], e[2]); deck.triangle(e[0], e[2], e[3]);
    }
  }
  const deckMesh = new THREE.Mesh(deck.build(), new THREE.MeshLambertMaterial({ map: planks(), vertexColors: true, side: THREE.DoubleSide }));
  deckMesh.castShadow = true; deckMesh.receiveShadow = true;
  scene.add(deckMesh);

  // Pieux, bollards, garde-corps bas au bout.
  const posts = new MeshBuilder(), pile = new THREE.Color(0x5b4632), steel = new THREE.Color(0x33363b);
  for (let u = RAMP; u <= LENGTH + 0.01; u += 3) {
    for (const v of [-WIDTH / 2 - 0.12, WIDTH / 2 + 0.12]) {
      const [x, n] = at(u, v);
      boxAt(posts, x, -n, 0.26, 0.26, -4.5, deckY(u) + 0.35, pile);
      collider.addBuilding([x - 0.2, n - 0.2, x + 0.2, n - 0.2, x + 0.2, n + 0.2, x - 0.2, n + 0.2], -Infinity, deckY(u) + 0.3);
    }
  }
  for (const [u, v] of [[LENGTH - 3, WIDTH / 2 - 0.3], [LENGTH - 3, -WIDTH / 2 + 0.3], [LENGTH - 10, WIDTH / 2 - 0.3], [LENGTH - 10, -WIDTH / 2 + 0.3]]) {
    const [x, n] = at(u, v);
    boxAt(posts, x, -n, 0.22, 0.22, DECK, DECK + 0.45, steel);
    boxAt(posts, x, -n, 0.32, 0.32, DECK + 0.45, DECK + 0.52, steel);
  }
  // Panneau au pied du ponton.
  const [sx, sn] = at(-1.2, WIDTH / 2 + 0.9);
  boxAt(posts, sx, -sn, 0.1, 0.1, beach - 0.1, beach + 2.2, steel);
  const posts3 = new THREE.Mesh(posts.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  posts3.castShadow = true;
  scene.add(posts3);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide,
    map: canvasTexture(256, 128, (ctx) => {
      ctx.fillStyle = '#1f4f8f'; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = 'bold 30px "Trebuchet MS", Arial'; ctx.fillText('PONTON TOCHE', 128, 52);
      ctx.font = '22px "Trebuchet MS", Arial'; ctx.fillText('بواخر النزهة', 128, 92);
    }, false),
  }));
  sign.position.set(sx, beach + 2.0, -sn);
  sign.rotation.y = Math.atan2(-DIR[0], DIR[1]); // face à la plage
  scene.add(sign);

  const heading = Math.atan2(DIR[0], -DIR[1]); // avant du bateau vers le large (repère x, z du jeu)
  const boatAt = (u: number, v: number, hull: number, stripe: number): BoatSpawn => { const [x, n] = at(u, v); return { x, n, heading, hull, stripe }; };

  const ground2 = (x: number, z: number): number | null => {
    const n = -z, dx = x - START[0], dn = n - START[1];
    const u = dx * DIR[0] + dn * DIR[1], v = dx * SIDE[0] + dn * SIDE[1];
    if (u < 0 || u > LENGTH || Math.abs(v) > WIDTH / 2) return null;
    return deckY(u);
  };
  return {
    ground: ground2,
    boats: [boatAt(LENGTH - 6, WIDTH / 2 + 1.7, 0xf4f4f2, 0x1f5fa8), boatAt(LENGTH - 6, -WIDTH / 2 - 1.7, 0xf2efe8, 0xb3262a)],
    nearestDeck: (x: number, n: number) => {
      const dx = x - START[0], dn = n - START[1];
      const u = Math.min(LENGTH - 0.5, Math.max(RAMP, dx * DIR[0] + dn * DIR[1]));
      const v = Math.min(WIDTH / 2 - 0.4, Math.max(-WIDTH / 2 + 0.4, dx * SIDE[0] + dn * SIDE[1]));
      const [px, pn] = at(u, v);
      return { x: px, n: pn, distance: Math.hypot(px - x, pn - n) };
    },
  };
}
