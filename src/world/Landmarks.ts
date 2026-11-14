import * as THREE from 'three';
import type { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import { buildSheratonGrounds } from './SheratonGrounds';
import { buildSousTerrain } from './SousTerrain';
import { THEATRE_CENTROID, THEATRE_NAME, buildTheatre } from './Theatre';
import type { Terrain } from './Terrain';
import type { WorldData } from './WorldData';
import { type Ground, type Ring, boxAt, canvasTexture, cap, centroid, extrude, findFootprint, lowestGround, ringOf } from './LandmarkKit';

/**
 * Bâtiments remarquables modélisés à la main d'après photos, posés sur leur emprise OpenStreetMap réelle.
 * Le reste de la ville est généré automatiquement ; ces emprises-là sont retirées du rendu générique.
 *
 * Sources :
 *  - Hôtel Sheraton : emprises OSM (ways 455129282 tour, 461427819 « bulle » d'accueil, 461892443 liaison,
 *    461427818 socle) ; 19 niveaux (fiche de l'hôtel) ; volumes et matériaux d'après les photos de Houssem.
 *  - Gare maritime : emprise du chantier « Nouvelle gare maritime » (OSM way 574834143) ; façade d'après les
 *    photos du bâtiment construit (verre bleu, croisillons d'acier, cadre gris). Les images de synthèse du projet
 *    (toit blanc courbe) ne correspondent pas au bâtiment réalisé et n'ont pas servi.
 */


/** Centres (x, n) des emprises remplacées par un modèle sur mesure. */
const OWNED: [number, number][] = [
  [328.6, 774.8], [281.8, 755.8], [303.9, 765.8], [323.3, 823.5], // Sheraton
  [206.0, 935.5], // Hôtel Seybouse International (OSM way 165582442, 18 niveaux)
  THEATRE_CENTROID, // Théâtre Azzedine Medjoubi (OSM way 341076691)
];

/** Ce bâtiment de la carte est-il remplacé par un modèle sur mesure ? */
export function ownedByLandmark(p: number[]): boolean {
  let cx = 0, cn = 0;
  const count = p.length / 2;
  for (let i = 0; i < count; i++) { cx += p[i * 2] / count; cn += p[i * 2 + 1] / count; }
  return OWNED.some(([x, n]) => Math.hypot(cx - x, cn - n) < 4);
}

/** Mur de verre du Sheraton : vitrage vert d'eau, résille de losanges claire, lignes d'étages discrètes. */
function sheratonGlass(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#5fa7a3'); sky.addColorStop(0.5, '#2f7f7e'); sky.addColorStop(1, '#3d8f8b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 256);
    // Reflets irréguliers (nuages et façades voisines dans le verre).
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${200 + (i * 7) % 55},${230 + (i * 3) % 25},235,${0.04 + (i % 5) * 0.015})`;
      ctx.fillRect((i * 53) % 256, (i * 97) % 256, 30 + (i * 13) % 60, 6 + (i * 5) % 16);
    }
    ctx.strokeStyle = 'rgba(30,70,72,0.55)'; ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
    for (let x = 0; x <= 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
    // Résille en losanges (montants d'acier clair).
    ctx.strokeStyle = 'rgba(225,238,236,0.9)'; ctx.lineWidth = 3;
    for (let k = -256; k <= 512; k += 128) {
      ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + 256, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(k + 256, 0); ctx.lineTo(k, 256); ctx.stroke();
    }
  });
}

/** « Bulle » d'accueil : coque blanche percée d'ouvertures triangulaires irrégulières. */
function bubbleSkin(): THREE.CanvasTexture {
  return canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = '#2e4a52'; ctx.fillRect(0, 0, 512, 256);
    let seed = 9;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    ctx.strokeStyle = '#f4f2ec'; ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      ctx.lineWidth = 9 + r() * 10;
      const x = r() * 512, y = r() * 256, a = r() * Math.PI, l = 120 + r() * 200;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, 512, 18); ctx.fillRect(0, 238, 512, 18);
  });
}

/** Façade de la gare maritime : grand vitrage bleu, grosses diagonales d'acier blanc, cadre gris. */
function terminalGlass(): THREE.CanvasTexture {
  return canvasTexture(256, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#5aa6dc'); g.addColorStop(1, '#2f78b8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = 10; x < 256; x += 64) ctx.fillRect(x, 0, 18, 128);
    ctx.strokeStyle = '#3e5f78'; ctx.lineWidth = 2;
    for (let x = 0; x <= 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(256, 64); ctx.stroke();
    ctx.fillStyle = '#7d8790'; ctx.fillRect(0, 0, 256, 5); ctx.fillRect(0, 123, 256, 5);
    for (const x of [0, 128]) ctx.fillRect(x, 0, 9, 128); // poteaux gris
    ctx.strokeStyle = '#e8edf0'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(10, 120); ctx.lineTo(120, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 120); ctx.lineTo(126, 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(138, 8); ctx.lineTo(246, 120); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(138, 50); ctx.lineTo(214, 120); ctx.stroke();
  });
}

function terminalGroundGlass(): THREE.CanvasTexture {
  return canvasTexture(128, 64, (ctx) => {
    ctx.fillStyle = '#2c6a9e'; ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(8, 0, 20, 64); ctx.fillRect(72, 0, 14, 64);
    ctx.fillStyle = '#6d757c';
    for (const x of [0, 64]) ctx.fillRect(x, 0, 7, 64);
    ctx.fillRect(0, 0, 128, 4);
  });
}

/** Lettrage de la façade (texte réel de l'enseigne, en arabe : « Gare maritime du port d'Annaba »). */
function terminalSign(): THREE.CanvasTexture {
  return canvasTexture(1024, 128, (ctx) => {
    ctx.clearRect(0, 0, 1024, 128);
    ctx.fillStyle = '#f2f4f5';
    ctx.font = 'bold 84px "Noto Naskh Arabic", "Arial", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText('المحطة البحرية لميناء عنابة', 512, 66);
  }, false);
}

function buildSheraton(scene: THREE.Scene, data: WorldData, ground: Ground, collider: Collider): void {
  const tower = findFootprint(data, 328.6, 774.8), bubble = findFootprint(data, 281.8, 755.8);
  const link = findFootprint(data, 303.9, 765.8), podium = findFootprint(data, 323.3, 823.5);
  const stone = new THREE.Color(0xe7dcc4), grey = new THREE.Color(0xb7bcbf), white = new THREE.Color(0xf2f1ec);
  const solid = new MeshBuilder();
  if (tower) {
    const base = lowestGround(tower, ground) - 0.5, height = 66;
    // Tour : verre en résille, plus large à mi-hauteur qu'en bas et en haut (silhouette en amande des photos).
    const glass = new MeshBuilder();
    const bulge = (t: number) => 0.94 + 0.1 * Math.sin(Math.PI * Math.min(1, t * 1.05));
    extrude(glass, tower, base, base + height - 5, new THREE.Color(0xffffff), 9, (t) => bulge(t * (height - 5) / height), 12);
    // Couronne : bandeau de verre plus clair, un peu plus large.
    extrude(glass, tower, base + height - 5, base + height, new THREE.Color(0xd8efe9), 9, () => bulge(1) * 1.01, 1);
    const material = new THREE.MeshStandardMaterial({ map: sheratonGlass(), vertexColors: true, roughness: 0.12, metalness: 0.55, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(glass.build(), material);
    mesh.castShadow = true;
    scene.add(mesh);
    cap(solid, tower, base + height, new THREE.Color(0xd9d8d2), bulge(1) * 1.01);
    // Toit technique : locaux, gaines et paraboles (photo vue du ciel).
    const [cx, cn] = centroid(tower), top = base + height;
    boxAt(solid, cx - 4, -cn + 2, 7, 5, top, top + 4.5, grey);
    boxAt(solid, cx + 5, -cn - 3, 4, 4, top, top + 2.5, white);
    boxAt(solid, cx + 1, -cn + 7, 5, 3, top, top + 2, white);
    for (let i = 0; i < 4; i++) boxAt(solid, cx - 8 + i * 2.2, -cn - 6, 1.3, 0.3, top, top + 1.6, white);
    // Balcons : la fente verticale de la façade, avec une dalle blanche par étage (côté droit de l'emprise).
    let far = 0, fx = cx, fn = cn;
    for (const [x, n] of tower) if (x - cx > far) { far = x - cx; fx = x; fn = n; }
    const dx = fx - cx, dn = fn - cn, l = Math.hypot(dx, dn), ux = dx / l, un = dn / l;
    for (let level = 1; level < 19; level++) {
      const y = base + 3 + level * 3.25, s = bulge((y - base) / height);
      const px = cx + ux * l * s * 0.98, pn = cn + un * l * s * 0.98;
      boxAt(solid, px + ux * 0.6, -(pn + un * 0.6), 2.2, 11, y, y + 0.3, white, Math.atan2(-un, ux));
    }
    collider.addBuilding(tower.flat());
  }
  if (bubble) {
    // « Bulle » d'accueil : coque ovoïde blanche ajourée.
    const [cx, cn] = centroid(bubble);
    let radius = 0;
    for (const [x, n] of bubble) radius = Math.max(radius, Math.hypot(x - cx, n - cn));
    const base = lowestGround(bubble, ground);
    const geometry = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const shell = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: bubbleSkin(), roughness: 0.4, metalness: 0.1 }));
    shell.scale.set(radius, 13 / (1 - Math.cos(Math.PI * 0.62)), radius);
    shell.position.set(cx, base + 13 - shell.scale.y, -cn);
    shell.castShadow = true;
    scene.add(shell);
    collider.addBuilding(bubble.flat());
  }
  for (const [ring, height] of [[link, 7], [podium, 9]] as [Ring | null, number][]) {
    if (!ring) continue;
    const base = lowestGround(ring, ground) - 0.5;
    extrude(solid, ring, base, base + height, stone, 4);
    cap(solid, ring, base + height, grey);
    collider.addBuilding(ring.flat());
  }
  const mesh = new THREE.Mesh(solid.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  scene.add(mesh);
}

function buildFerryTerminal(scene: THREE.Scene, ground: Ground, collider: Collider): void {
  // Plan en « stade » (rectangle aux bouts arrondis) : x 70 à 100, n -5 à 105, dans l'emprise du chantier OSM.
  const x0 = 70, x1 = 100, n0 = -5, n1 = 105, r = 9;
  const ring: Ring = [];
  const arc = (cx: number, cn: number, from: number) => { for (let k = 0; k <= 6; k++) { const a = from + (k / 6) * Math.PI / 2; ring.push([cx + Math.cos(a) * r, cn + Math.sin(a) * r]); } };
  arc(x1 - r, n1 - r, 0); arc(x0 + r, n1 - r, Math.PI / 2); arc(x0 + r, n0 + r, Math.PI); arc(x1 - r, n0 + r, Math.PI * 1.5);
  const base = lowestGround(ring, ground) - 0.3;
  const groundFloor = new MeshBuilder(), upper = new MeshBuilder(), solid = new MeshBuilder();
  const white = new THREE.Color(0xffffff), grey = new THREE.Color(0x8a939a), dark = new THREE.Color(0x5d666c);
  extrude(groundFloor, ring, base, base + 6.5, white, 8);
  extrude(solid, ring, base + 6.5, base + 8, grey, 4, () => 1.035);           // dalle débordante grise
  extrude(upper, ring, base + 8, base + 17, white, 16, () => 1.0);
  extrude(solid, ring, base + 17, base + 19.5, grey, 4, () => 1.05);          // corniche haute
  cap(solid, ring, base + 8, dark, 1.035, false);                               // sous-face de la dalle
  cap(solid, ring, base + 8, grey, 1.035);
  cap(solid, ring, base + 19.5, new THREE.Color(0xa9b0b5), 1.05);
  cap(solid, ring, base + 17, dark, 1.05, false);
  // Climatiseurs sous la dalle (photo de la façade).
  for (const n of [20, 46, 72]) boxAt(solid, x0 - 0.2, -n, 0.5, 1.6, base + 4.6, base + 6.2, new THREE.Color(0xd8dadb));
  const glassLow = new THREE.MeshStandardMaterial({ map: terminalGroundGlass(), roughness: 0.15, metalness: 0.45, side: THREE.DoubleSide });
  const glassHigh = new THREE.MeshStandardMaterial({ map: terminalGlass(), roughness: 0.12, metalness: 0.45, side: THREE.DoubleSide });
  for (const [b, m] of [[groundFloor, glassLow], [upper, glassHigh], [solid, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })]] as [MeshBuilder, THREE.Material][]) {
    const mesh = new THREE.Mesh(b.build(), m);
    mesh.castShadow = true;
    scene.add(mesh);
  }
  // Enseigne en lettres blanches sur la façade côté ville (ouest), au-dessus de la dalle.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(60, 7.5), new THREE.MeshBasicMaterial({ map: terminalSign(), transparent: true, depthWrite: false }));
  sign.position.set(x0 - 0.15, base + 12.5, -(n0 + n1) / 2);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);
  // Clôture bleue du port devant la façade.
  const fence = new MeshBuilder(), blue = new THREE.Color(0x2350b8);
  for (let n = n0 - 20; n < n1 + 20; n += 2.6) {
    const g = ground(64.5, -n);
    boxAt(fence, 64.5, -n - 1.3, 0.1, 2.5, g, g + 2.2, blue);
    boxAt(fence, 64.5, -n, 0.12, 0.12, g, g + 2.4, blue);
  }
  scene.add(new THREE.Mesh(fence.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  collider.addBuilding(ring.flat());
}

/** Tracés blancs des grands terrains de football (emprises OSM leisure=pitch de plus de 4 000 m²). */
function buildPitchLines(scene: THREE.Scene, data: WorldData, ground: Ground): void {
  const lines = new MeshBuilder(), white = new THREE.Color(0xf4f4f0);
  for (const area of data.areas) {
    if (area.k !== 'pitch') continue;
    const ring = ringOf(area.p);
    let a = 0;
    for (let i = 0; i < ring.length; i++) { const [x1, n1] = ring[i], [x2, n2] = ring[(i + 1) % ring.length]; a += x1 * n2 - x2 * n1; }
    if (Math.abs(a / 2) < 4000) continue;
    // Rectangle orienté d'aire minimale (les tracés suivent la vraie orientation du terrain).
    let best = { area: Infinity, angle: 0, u0: 0, u1: 0, v0: 0, v1: 0 };
    for (let i = 0; i < ring.length; i++) {
      const [x1, n1] = ring[i], [x2, n2] = ring[(i + 1) % ring.length];
      const angle = Math.atan2(n2 - n1, x2 - x1), c = Math.cos(angle), s = Math.sin(angle);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const [x, n] of ring) { const u = x * c + n * s, v = -x * s + n * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      if ((u1 - u0) * (v1 - v0) < best.area) best = { area: (u1 - u0) * (v1 - v0), angle, u0, u1, v0, v1 };
    }
    let { angle, u0, u1, v0, v1 } = best;
    if (u1 - u0 < v1 - v0) { angle += Math.PI / 2; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; } // u = grand axe
    const inset = 2.5; u0 += inset; u1 -= inset; v0 += inset; v1 -= inset;
    const c = Math.cos(angle), s = Math.sin(angle), mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
    const toWorld = (u: number, v: number): [number, number] => [u * c - v * s, -(u * s + v * c)];
    const strip = (ua: number, va: number, ub: number, vb: number) => {
      const [ax, az] = toWorld(ua, va), [bx, bz] = toWorld(ub, vb), l = Math.hypot(bx - ax, bz - az) || 1;
      const px = -(bz - az) / l * 0.13, pz = (bx - ax) / l * 0.13; // 26 cm : plus large que le vrai trait (12 cm), pour rester visible de loin
      const y = (x: number, z: number) => ground(x, z) + 0.07;
      const q = [lines.vertex(ax + px, y(ax, az), az + pz, white), lines.vertex(bx + px, y(bx, bz), bz + pz, white),
                 lines.vertex(bx - px, y(bx, bz), bz - pz, white), lines.vertex(ax - px, y(ax, az), az - pz, white)];
      lines.triangle(q[0], q[2], q[1]); lines.triangle(q[0], q[3], q[2]);
    };
    const rect = (ua: number, va: number, ub: number, vb: number) => { strip(ua, va, ub, va); strip(ub, va, ub, vb); strip(ub, vb, ua, vb); strip(ua, vb, ua, va); };
    rect(u0, v0, u1, v1);
    strip(mu, v0, mu, v1);
    const width = v1 - v0, box = Math.min(40.3, width * 0.6), small = Math.min(18.3, width * 0.27), depth = Math.min(16.5, (u1 - u0) * 0.15);
    rect(u0, mv - box / 2, u0 + depth, mv + box / 2); rect(u1 - depth, mv - box / 2, u1, mv + box / 2);
    rect(u0, mv - small / 2, u0 + depth * 0.33, mv + small / 2); rect(u1 - depth * 0.33, mv - small / 2, u1, mv + small / 2);
    const radius = Math.min(9.15, width * 0.14);
    for (let k = 0; k < 24; k++) {
      const a1 = (k / 24) * Math.PI * 2, a2 = ((k + 1) / 24) * Math.PI * 2;
      strip(mu + Math.cos(a1) * radius, mv + Math.sin(a1) * radius, mu + Math.cos(a2) * radius, mv + Math.sin(a2) * radius);
    }
  }
  if (lines.isEmpty) return;
  const mesh = new THREE.Mesh(lines.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 }));
  mesh.renderOrder = 7;
  scene.add(mesh);
}

// ---------------------------------------------------------------------------------------------------------------
// Hôtel Seybouse International : barre de 18 niveaux sur pilotis, loggias à garde-corps de verre de couleurs vives
// (rose, vert, bleu, orange, jaune, turquoise, violet) réparties sans ordre, cadre blanc, fresque arc-en-ciel en
// spirale sur le pignon, couronne à portiques blancs sur le toit. D'après les photos de Houssem.

const SEYBOUSE_COLORS = ['#e8418f', '#3fbf4a', '#2f7fe0', '#f28c1e', '#f6cf2c', '#1fb5a8', '#8a4fd1', '#d9354d', '#7cc63f'];
const FLOORS = 18, FLOOR_H = 3.0, PILOTIS = 6;

/** Façade à loggias : une case par baie et par étage, verre coloré ou clair, encadrement blanc. */
function seybouseFacade(bays: number, seed: number): THREE.CanvasTexture {
  const cw = 64, ch = 48;
  return canvasTexture(bays * cw, FLOORS * ch, (ctx) => {
    let s = seed;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, bays * cw, FLOORS * ch);
    for (let f = 0; f < FLOORS; f++) {
      for (let b = 0; b < bays; b++) {
        const x = b * cw, y = f * ch;
        // Fond de loggia : baie vitrée sombre avec reflets.
        ctx.fillStyle = '#3a4a56'; ctx.fillRect(x + 5, y + 6, cw - 10, ch - 10);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 8, y + 8, 10, ch - 16);
        ctx.fillStyle = '#c9ccc8'; ctx.fillRect(x + cw / 2 - 1, y + 6, 2, ch - 14);
        // Garde-corps : verre coloré (environ 6 baies sur 10) ou verre clair.
        const colored = r() < 0.62;
        ctx.fillStyle = colored ? SEYBOUSE_COLORS[Math.floor(r() * SEYBOUSE_COLORS.length)] : '#cfd8dc';
        ctx.fillRect(x + 5, y + ch * 0.48, cw - 10, ch * 0.4);
        // Le verre coloré teinte aussi le haut de la loggia (reflet).
        if (colored) { ctx.globalAlpha = 0.35; ctx.fillRect(x + 5, y + 6, cw - 10, ch * 0.42); ctx.globalAlpha = 1; }
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 5, y + ch * 0.48, cw - 10, 2); // main courante
      }
    }
  }, false);
}

/** Pignon : grande fresque arc-en-ciel, une bande verticale qui s'enroule en spirale vers le bas (photos). */
function seybouseMural(): THREE.CanvasTexture {
  const W = 256, H = 1024;
  return canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#e9e7e1'; ctx.fillRect(0, 0, W, H);
    const bands = ['#f2c12e', '#9ccc3c', '#3fb98a', '#2aa7b8', '#8a5bc8', '#c94f8c', '#e8743b', '#f2c12e'];
    const cx = W * 0.55, cy = H * 0.72;
    // Bande verticale montante.
    bands.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(W * 0.18 + i * 18, 0, 18, cy); });
    // Spirale : anneaux concentriques de couleurs.
    for (let k = bands.length * 2; k >= 0; k--) {
      ctx.fillStyle = bands[k % bands.length];
      ctx.beginPath(); ctx.ellipse(cx, cy, 9 + k * 9, 14 + k * 13, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.ellipse(cx, cy, 8, 12, 0, 0, Math.PI * 2); ctx.fill();
  }, false);
}

function buildSeybouse(scene: THREE.Scene, ground: Ground, collider: Collider): void {
  // Emprise OSM : barre de 47 × 23,5 m, légèrement tournée, avec une cage d'escalier en saillie à l'est.
  const a: [number, number] = [170.0, 922.1], b: [number, number] = [217.2, 924.1], d: [number, number] = [169.0, 945.5];
  const ux = b[0] - a[0], un = b[1] - a[1], length = Math.hypot(ux, un);
  const vx = d[0] - a[0], vn = d[1] - a[1], depth = Math.hypot(vx, vn);
  const angle = Math.atan2(un, ux); // direction de la longueur, dans le plan x/n
  const base = lowestGround([a, b, d, [b[0] + vx, b[1] + vn]], ground) - 0.3;
  const top = base + PILOTIS + FLOORS * FLOOR_H;
  const group = new THREE.Group();
  group.position.set(a[0], base, -a[1]);
  group.rotation.y = angle; // repère local : x le long de la barre, z vers -n (vers la façade d'en face)
  scene.add(group);
  // Les longues façades (sud : z = 0, nord : z = -depth) et les pignons (ouest : x = 0, est : x = length).
  const BAYS = 16;
  const facade = (texture: THREE.Texture, width: number, x: number, z: number, rotation: number) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, FLOORS * FLOOR_H), new THREE.MeshLambertMaterial({ map: texture }));
    plane.position.set(x, PILOTIS + FLOORS * FLOOR_H / 2, z);
    plane.rotation.y = rotation;
    plane.castShadow = true;
    group.add(plane);
  };
  // Les garde-corps de verre sont au nu des dalles (1 m devant le mur), comme sur les photos : on voit leurs
  // couleurs même de biais.
  facade(seybouseFacade(BAYS, 11), length, length / 2, 1.0, 0);
  facade(seybouseFacade(BAYS, 29), length, length / 2, -depth - 1.0, Math.PI);
  facade(seybouseMural(), depth, -0.01, -depth / 2, -Math.PI / 2);
  facade(seybouseFacade(7, 47), depth, length + 1.0, -depth / 2, Math.PI / 2);
  // Relief en blanc : nez de dalle à chaque étage et refends verticaux entre les loggias (sur les 3 côtés à loggias).
  const white = new THREE.Color(0xf6f5f0), frame = new MeshBuilder();
  for (let f = 0; f <= FLOORS; f++) {
    const y = PILOTIS + f * FLOOR_H - 0.12;
    boxAt(frame, length / 2, 0.55, length + 1.2, 1.1, y, y + 0.24, white);
    boxAt(frame, length / 2, -depth - 0.55, length + 1.2, 1.1, y, y + 0.24, white);
    boxAt(frame, length + 0.55, -depth / 2, 1.1, depth, y, y + 0.24, white);
  }
  for (let k = 0; k <= BAYS; k++) {
    const x = (k / BAYS) * length;
    boxAt(frame, x, 0.5, 0.22, 1.0, PILOTIS, PILOTIS + FLOORS * FLOOR_H, white);
    boxAt(frame, x, -depth - 0.5, 0.22, 1.0, PILOTIS, PILOTIS + FLOORS * FLOOR_H, white);
  }
  // Pilotis : rez vitré en retrait, poteaux blancs.
  const lobby = new MeshBuilder(), glass = new THREE.Color(0x2b3d47);
  boxAt(lobby, length / 2, -depth / 2, length - 4, depth - 4, 0, PILOTIS, glass);
  for (let k = 0; k <= 8; k++) for (const z of [-0.8, -depth + 0.8]) boxAt(frame, (k / 8) * length, z, 0.9, 0.9, 0, PILOTIS, white);
  boxAt(frame, length / 2, -depth / 2, length + 1, depth + 1, PILOTIS - 0.5, PILOTIS, white); // dalle de transfert
  // Toit : terrasse et couronne de portiques blancs (étage technique ouvert).
  boxAt(frame, length / 2, -depth / 2, length, depth, top - base - 0.3, top - base, new THREE.Color(0xdedbd2));
  for (let k = 0; k <= 10; k++) {
    const x = (k / 10) * (length - 2) + 1;
    boxAt(frame, x, -1, 0.35, 0.35, top - base, top - base + 3.2, white);
    boxAt(frame, x, -depth + 1, 0.35, 0.35, top - base, top - base + 3.2, white);
  }
  boxAt(frame, length / 2, -1, length - 1.5, 0.5, top - base + 3.2, top - base + 3.6, white);
  boxAt(frame, length / 2, -depth + 1, length - 1.5, 0.5, top - base + 3.2, top - base + 3.6, white);
  // Cage d'escalier en saillie (emprise OSM) : volume sombre.
  boxAt(frame, length + 2.3, -depth / 2 - 7, 4.6, 6, 0, top - base + 2, new THREE.Color(0xd8d6cf)); // cage d'escalier (côté nord de l'emprise)
  for (const builder of [frame, lobby]) {
    const mesh = new THREE.Mesh(builder.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.castShadow = true;
    group.add(mesh);
  }
  collider.addBuilding([170.0, 922.1, 217.2, 924.1, 217.0, 928.7, 221.6, 928.9, 220.9, 943.8, 216.4, 943.6, 216.2, 947.5, 169.0, 945.5]);
}

/** Ce que les lieux modélisés changent au reste du monde : sol praticable en contrebas, arbres retirés ou ajoutés. */
export interface LandmarkEdits {
  ground: (x: number, z: number) => number | null;
  keepTree: (x: number, n: number) => boolean;
  /** Arbres ajoutés : [espèce, x, n, taille]. */
  trees: [string, number, number, number][];
  /** Noms affichés en bas de l'écran près d'un lieu (prioritaires sur le quartier). */
  labels: { name: string; x: number; n: number; radius: number }[];
}

export function buildLandmarks(scene: THREE.Scene, data: WorldData, ground: Ground, collider: Collider, terrain: Terrain): LandmarkEdits {
  buildSheraton(scene, data, ground, collider);
  const grounds = buildSheratonGrounds(scene, data, ground, collider);
  const sousTerrain = buildSousTerrain(scene, terrain, ground, collider);
  buildSeybouse(scene, ground, collider);
  buildFerryTerminal(scene, ground, collider);
  buildPitchLines(scene, data, ground);
  const theatre = buildTheatre(scene, data, ground, collider);
  return {
    ground: (x, z) => sousTerrain.ground(x, z) ?? theatre?.ground(x, z) ?? null,
    keepTree: (x, n) => grounds.keepTree(x, n) && !sousTerrain.inside(x, n) && (theatre?.keepTree(x, n) ?? true),
    trees: [...grounds.palms.map(([x, n, s]): [string, number, number, number] => ['palm', x, n, s]), ...(theatre?.extra ?? [])],
    labels: theatre ? [{ name: THEATRE_NAME, x: 100, n: 473, radius: 45 }] : [],
  };
}
