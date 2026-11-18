import * as THREE from 'three';
import type { Collider } from './Collider';
import { type Ground, type Ring, boxAt, canvasTexture, cap, findFootprint } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';
import type { WorldData } from './WorldData';

/**
 * Garage de l'Est (OpenStreetMap : way 341068653, shop=car, rue Yahiaoui Mohamed, à 150 m de la gare).
 * Le jeu en fait la salle d'exposition de toutes les voitures « normales » du jeu (pas les véhicules de police,
 * gendarmerie, BRI ni l'ambulance) : on y vient choisir sa voiture. L'emprise est celle d'OSM ; l'aspect (hall
 * vitré, enseigne, hauteur 7,5 m) est une reconstitution, aucune photo du garage n'a été fournie.
 */

export const GARAGE_CENTROID: [number, number] = [-60.9, -117.9];
export const GARAGE_NAME = "Garage de l'Est (toutes les voitures)";

const HEIGHT = 7.5, DOOR_H = 4.2;
const WHITE = new THREE.Color(0xf2f0ea), GREY = new THREE.Color(0x8e9399), DARK = new THREE.Color(0x2b3034);
const FLOOR = new THREE.Color(0xd9d6cf), RED = new THREE.Color(0xc4282c);

function sign(): THREE.CanvasTexture {
  return canvasTexture(1024, 128, (ctx) => {
    ctx.fillStyle = '#c4282c'; ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 8, 1024, 4); ctx.fillRect(0, 116, 1024, 4);
    ctx.font = 'bold 76px "Arial Black", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText("GARAGE DE L'EST", 512, 66);
  }, false);
}

function glass(): THREE.CanvasTexture {
  return canvasTexture(64, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 128);
    g.addColorStop(0, 'rgba(150,190,215,0.55)'); g.addColorStop(1, 'rgba(70,110,140,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(64, 10); ctx.lineTo(64, 26); ctx.lineTo(0, 66); ctx.fill();
    ctx.fillStyle = '#3a4045'; ctx.fillRect(0, 0, 3, 128); ctx.fillRect(61, 0, 3, 128); ctx.fillRect(0, 0, 64, 3); ctx.fillRect(0, 125, 64, 3);
  });
}

export interface Garage { slots: { x: number; n: number; heading: number }[]; inside: (x: number, n: number) => boolean; place: { x: number; n: number; cx: number; cn: number; ch: number } }

export function buildGarage(scene: THREE.Scene, data: WorldData, ground: Ground, collider: Collider): Garage | null {
  const ring = findFootprint(data, GARAGE_CENTROID[0], GARAGE_CENTROID[1]);
  if (!ring) return null;
  // Façade vitrée : le grand côté au sud-ouest, le long de la rue Yahiaoui Mohamed.
  let front = 0, best = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, an] = ring[i], [bx, bn] = ring[(i + 1) % ring.length];
    const l = Math.hypot(bx - ax, bn - an), mx = (ax + bx) / 2, mn = (an + bn) / 2;
    const score = l - Math.hypot(mx + 100, mn + 110) * 0.3; // grand côté, du côté de la rue
    if (score > best) { best = score; front = i; }
  }
  const [fax, fan] = ring[front], [fbx, fbn] = ring[(front + 1) % ring.length];
  const flen = Math.hypot(fbx - fax, fbn - fan), dx = (fbx - fax) / flen, dn = (fbn - fan) / flen;
  // Normale vers l'intérieur : du côté du centre du bâtiment.
  let nx = -dn, nn = dx;
  const [cx, cn] = ring.reduce(([sx, sn], [x, n]) => [sx + x / ring.length, sn + n / ring.length], [0, 0]);
  if ((cx - fax) * nx + (cn - fan) * nn < 0) { nx = -nx; nn = -nn; }

  let base = Infinity;
  for (const [x, n] of ring) base = Math.min(base, ground(x, -n));
  base += 0.2;
  const shell = new MeshBuilder(), trim = new MeshBuilder(), panes = new MeshBuilder(), floor = new MeshBuilder();
  const quad = (b: MeshBuilder, ax: number, an: number, bx: number, bn: number, y0: number, y1: number, color: THREE.Color, u1 = 1) => {
    const v = [b.vertex(ax, y0, -an, color, 0.9, 0, 0), b.vertex(bx, y0, -bn, color, 0.9, u1, 0), b.vertex(bx, y1, -bn, color, 1, u1, 1), b.vertex(ax, y1, -an, color, 1, 0, 1)];
    b.triangle(v[0], v[1], v[2]); b.triangle(v[0], v[2], v[3]);
  };
  const wall = (ax: number, an: number, bx: number, bn: number) => {
    const l = Math.hypot(bx - ax, bn - an) || 1, ox = (-(bn - an) / l) * 0.25, on = ((bx - ax) / l) * 0.25;
    collider.addBuilding([ax - ox, an - on, bx - ox, bn - on, bx + ox, bn + on, ax + ox, an + on]);
  };

  // Murs pleins blancs sur les autres côtés, soubassement gris.
  for (let i = 0; i < ring.length; i++) {
    if (i === front) continue;
    const [ax, an] = ring[i], [bx, bn] = ring[(i + 1) % ring.length];
    quad(shell, ax, an, bx, bn, base - 2, HEIGHT + base, WHITE);
    quad(trim, ax, an, bx, bn, base - 2, base + 0.8, GREY);
    wall(ax, an, bx, bn);
  }
  // Façade vitrée : piliers tous les 6 m, vitrages, trois grandes portes ouvertes pour sortir en voiture.
  const bays = Math.max(3, Math.round(flen / 6)), bay = flen / bays;
  const doors = new Set([1, Math.floor(bays / 2), bays - 2]);
  for (let k = 0; k <= bays; k++) {
    const x = fax + dx * bay * k, n = fan + dn * bay * k;
    boxAt(trim, x, -n, 0.6, 0.6, base - 2, base + HEIGHT, WHITE, Math.atan2(-dn, dx));
    collider.addBuilding([x - 0.4, n - 0.4, x + 0.4, n - 0.4, x + 0.4, n + 0.4, x - 0.4, n + 0.4]);
  }
  for (let k = 0; k < bays; k++) {
    const ax = fax + dx * bay * k, an = fan + dn * bay * k, bx = ax + dx * bay, bn = an + dn * bay;
    if (doors.has(k)) {
      quad(panes, ax, an, bx, bn, base + DOOR_H, base + HEIGHT - 1.4, WHITE, 2);
      boxAt(trim, (ax + bx) / 2, -(an + bn) / 2, bay, 0.3, base + DOOR_H - 0.15, base + DOOR_H, DARK, Math.atan2(-dn, dx));
    } else {
      quad(panes, ax, an, bx, bn, base, base + HEIGHT - 1.4, WHITE, 2);
      wall(ax, an, bx, bn);
    }
  }
  // Bandeau rouge et enseigne au-dessus des vitrages.
  quad(trim, fax, fan, fbx, fbn, base + HEIGHT - 1.4, base + HEIGHT, RED);
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(30, flen * 0.5), 1.25), new THREE.MeshLambertMaterial({ map: sign(), emissive: 0x401010 }));
  const mid: [number, number] = [(fax + fbx) / 2 - nx * 0.06, (fan + fbn) / 2 - nn * 0.06];
  signMesh.position.set(mid[0], base + HEIGHT - 0.7, -mid[1]);
  signMesh.rotation.y = Math.atan2(-nx, -nn); // face à la rue (normale extérieure)
  scene.add(signMesh);
  // Toit plat et acrotère, sol carrelé, plafond éclairé.
  cap(trim, ring, base + HEIGHT, new THREE.Color(0xc9c4ba), 1);
  cap(trim, ring, base + HEIGHT - 0.05, new THREE.Color(0xf6f5f0), 1, false);
  cap(floor, ring, base, FLOOR, 1);
  const neon = new MeshBuilder();
  for (let k = 0; k < bays; k++) for (const depth of [4, 9]) {
    const x = fax + dx * bay * (k + 0.5) + nx * depth, n = fan + dn * bay * (k + 0.5) + nn * depth;
    boxAt(neon, x, -n, 3, 0.25, base + HEIGHT - 0.25, base + HEIGHT - 0.12, WHITE, Math.atan2(-dn, dx));
  }

  const add = (b: MeshBuilder, material: THREE.Material, shadow = true) => { const m = new THREE.Mesh(b.build(), material); m.castShadow = shadow; m.receiveShadow = !shadow; scene.add(m); };
  add(shell, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  add(trim, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  add(floor, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x24221e }), false);
  add(panes, new THREE.MeshLambertMaterial({ map: glass(), transparent: true, depthWrite: false, side: THREE.DoubleSide }), false);
  add(neon, new THREE.MeshBasicMaterial({ color: 0xffffff }), false);

  // Emplacements : une rangée face à la vitrine, nez vers la rue, tous les 4,4 m.
  const heading = Math.atan2(-nx, nn); // avant de la voiture = vers la rue (x, z = -n)
  const slots: Garage['slots'] = [];
  const inRing = (x: number, n: number) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, ni] = ring[i], [xj, nj] = ring[j];
      if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) hit = !hit;
    }
    return hit;
  };
  for (const depth of [5.5, 12]) {
    for (let s = 4; s <= flen - 4; s += 4.4) {
      const x = fax + dx * s + nx * depth, n = fan + dn * s + nn * depth;
      // La voiture entière doit tenir dans le hall (avant et arrière).
      if (inRing(x, n) && inRing(x + nx * 2.6, n + nn * 2.6) && inRing(x - nx * 2.6, n - nn * 2.6) && inRing(x + dx * 1.3, n + dn * 1.3) && inRing(x - dx * 1.3, n - dn * 1.3)) slots.push({ x, n, heading });
    }
  }
  // Repère de téléportation : sur le trottoir devant la porte centrale, tourné vers le garage.
  const door = Math.floor(bays / 2) + 0.5;
  const px = fax + dx * bay * door - nx * 4, pn = fan + dn * bay * door - nn * 4;
  return {
    slots,
    inside: (x, n) => inRing(x, n),
    place: { x: px, n: pn, cx: px - dx * 3, cn: pn - dn * 3, ch: heading },
  };
}
