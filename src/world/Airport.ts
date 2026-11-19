import * as THREE from 'three';
import type { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import { FACADE_WIDTH, createFacadeTexture } from './Textures';

/**
 * Aéroport d'Annaba – Rabah Bitat, d'après OSM (tools/extract_airport.py → build_region.py) : pistes 18/36 et
 * 05/23 avec leur balisage peint (bords, axe, seuils en « touches de piano », numéros, zones de toucher),
 * voies de circulation avec ligne axiale jaune, aires de stationnement en dalles de béton, aérogares vitrées.
 * Le sol de l'enceinte est aplani dans les données de la wilaya (le relief à 60 m y était bosselé).
 */

export interface AirportPlan {
  name: string;
  runways: { ref: string; w: number; p: number[] }[];
  taxiways: { w: number; p: number[]; ref?: string }[];
  aprons: number[][];
  terminals: { p: number[]; n: string }[];
  stands: { ref: string; x: number; n: number; h: number }[];
  boundary: number[] | null;
}

const SURFACE = 0.2;

function layer(offset: number, map?: THREE.Texture, color = 0xffffff): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, vertexColors: true, side: THREE.DoubleSide, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4, ...(map ? { map } : {}) });
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Bitume de piste : grain, traces de pneus sombres au centre, lignes de bord blanches, axe en tirets (motif de 50 m). */
function runwayTexture(width: number): THREE.CanvasTexture {
  return canvasTexture(256, 512, (ctx) => {
    ctx.fillStyle = '#3d3e42'; ctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 9000; i++) {
      const g = 50 + Math.random() * 30;
      ctx.fillStyle = `rgba(${g},${g},${g + 3},0.5)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 1.5, 1.5);
    }
    ctx.fillStyle = 'rgba(15,15,17,0.35)';                    // gomme des atterrissages, de part et d'autre de l'axe
    ctx.fillRect(256 * 0.36, 0, 256 * 0.1, 512); ctx.fillRect(256 * 0.54, 0, 256 * 0.1, 512);
    const px = (m: number) => (m / width) * 256;
    ctx.fillStyle = '#eceae2';
    ctx.fillRect(px(1.2), 0, px(0.9), 512); ctx.fillRect(256 - px(2.1), 0, px(0.9), 512);   // bords
    ctx.fillRect(128 - px(0.45), 0, px(0.9), 512 * 0.6);                                       // axe : 30 m peints, 20 m vides
  });
}

function taxiwayTexture(width: number): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#46474b'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2500; i++) { const g = 58 + Math.random() * 30; ctx.fillStyle = `rgba(${g},${g},${g},0.45)`; ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5); }
    const px = (m: number) => (m / width) * 128;
    ctx.fillStyle = '#e2b52a';
    ctx.fillRect(64 - px(0.25), 0, Math.max(2, px(0.5)), 128);                 // axe jaune continu
    ctx.fillRect(px(0.6), 0, Math.max(1, px(0.3)), 128); ctx.fillRect(128 - px(0.9), 0, Math.max(1, px(0.3)), 128);
  });
}

function concreteTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#a9a8a2'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3000; i++) { const g = 150 + Math.random() * 40; ctx.fillStyle = `rgba(${g},${g},${g - 4},0.35)`; ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5); }
    ctx.fillStyle = 'rgba(60,60,58,0.6)';                     // joints des dalles (5 m)
    ctx.fillRect(0, 0, 128, 1.5); ctx.fillRect(0, 0, 1.5, 128);
  });
}

/** Numéro de piste peint en blanc (lu par un pilote qui arrive par ce bout). */
function numberTexture(text: string): THREE.CanvasTexture {
  return canvasTexture(256, 512, (ctx) => {
    ctx.clearRect(0, 0, 256, 512);
    ctx.fillStyle = '#eceae2';
    ctx.font = 'bold 300px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(128, 256); ctx.scale(0.55, 1.5); ctx.fillText(text, 0, 0); ctx.restore();
  }, false);
}

function signTexture(text: string): THREE.CanvasTexture {
  return canvasTexture(1024, 128, (ctx) => {
    ctx.fillStyle = '#1f3d6b'; ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 66, 980);
  }, false);
}

/** Polygone plat texturé (u, v en mètres / tile) à la hauteur y. */
function texturedPolygon(b: MeshBuilder, ring: number[], y: number, color: THREE.Color, tile: number): void {
  const contour: THREE.Vector2[] = [];
  for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i], ring[i + 1]));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const ids = contour.map((p) => b.vertex(p.x, y, -p.y, color, 1, p.x / tile, p.y / tile));
  for (const [a, c, d] of triangles) b.triangle(ids[a], ids[c], ids[d]);
}

/** Rectangle posé au sol : centre (x, n), axe (ux, un), longueur, largeur. */
function patch(b: MeshBuilder, x: number, n: number, ux: number, un: number, length: number, width: number, y: number, color: THREE.Color, uv = false): void {
  const vx = -un, vn = ux, hl = length / 2, hw = width / 2;
  // u = 0 sur la gauche de (ux, un) pour qu'un texte se lise à l'endroit en regardant dans ce sens.
  const corners = [[-hl, -hw, 1, 0], [hl, -hw, 1, 1], [hl, hw, 0, 1], [-hl, hw, 0, 0]];
  const ids = corners.map(([l, w, u, v]) => b.vertex(x + ux * l + vx * w, y, -(n + un * l + vn * w), color, 1, uv ? u : 0, uv ? v : 0));
  b.triangle(ids[0], ids[1], ids[2]); b.triangle(ids[0], ids[2], ids[3]);
}

export function buildAirport(scene: THREE.Scene, plan: AirportPlan, height: (x: number, z: number) => number, collider: Collider): THREE.Group {
  const group = new THREE.Group();
  group.name = 'airport';
  const white = new THREE.Color(0xffffff), paint = new THREE.Color(0xeceae2);
  const ground = (x: number, z: number) => height(x, z);
  const add = (builder: MeshBuilder, material: THREE.Material, order: number) => {
    if (builder.isEmpty) return;
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.renderOrder = order;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // --- aires de stationnement (béton)
  const aprons = new MeshBuilder();
  for (const ring of plan.aprons) {
    let low = Infinity;
    for (let i = 0; i < ring.length; i += 2) low = Math.min(low, height(ring[i], -ring[i + 1]));
    texturedPolygon(aprons, ring, low + SURFACE + 0.01, white, 5);
  }
  add(aprons, layer(2, concreteTexture()), 3);

  // --- voies de circulation
  const byWidth = new Map<number, MeshBuilder>();
  for (const taxiway of plan.taxiways) {
    const b = byWidth.get(taxiway.w) ?? byWidth.set(taxiway.w, new MeshBuilder()).get(taxiway.w)!;
    b.ribbon(densify(taxiway.p, 10), taxiway.w, SURFACE + 0.02, white, ground, 12);
  }
  for (const [width, b] of byWidth) add(b, layer(3, taxiwayTexture(width)), 4);

  // --- pistes et leur balisage
  const markings = new MeshBuilder();
  const numbers: { text: string; x: number; n: number; ux: number; un: number }[] = [];
  for (const runway of plan.runways) {
    const b = new MeshBuilder();
    b.ribbon(densify(runway.p, 15), runway.w, SURFACE + 0.04, white, ground, 50);
    add(b, layer(4, runwayTexture(runway.w)), 5);
    // Les deux bouts : seuil, numéro, zone de toucher, point d'aiming.
    const p = runway.p, last = p.length - 2;
    const ends: [number, number, number, number][] = [[p[0], p[1], p[2], p[3]], [p[last], p[last + 1], p[last - 2], p[last - 1]]];
    const refs = runway.ref.split('/');
    for (const [x, n, nx, nn] of ends) {
      const l = Math.hypot(nx - x, nn - n), ux = (nx - x) / l, un = (nn - n) / l;   // vers l'intérieur de la piste
      const bearing = ((Math.atan2(ux, un) * 180) / Math.PI + 360) % 360;
      const number = refs.find((r) => Math.abs(((parseInt(r, 10) * 10 - bearing + 540) % 360) - 180) < 40) ?? refs[0];
      const y = height(x + ux * 30, -(n + un * 30)) + SURFACE + 0.07;
      // Seuil : 2 x 6 bandes de 1,8 m sur 30 m.
      for (let k = 0; k < 6; k++) for (const side of [-1, 1]) {
        const off = side * (3 + k * 3.2);
        patch(markings, x + ux * 21 - un * off, n + un * 21 + ux * off, ux, un, 30, 1.8, y, paint);
      }
      numbers.push({ text: number, x: x + ux * 54, n: n + un * 54, ux, un });
      // Points de visée (2 grands rectangles à 300 m) et zones de toucher (paires de barres à 150, 450, 600 m).
      for (const side of [-1, 1]) {
        const off = side * 7.5;
        patch(markings, x + ux * 300 - un * off, n + un * 300 + ux * off, ux, un, 45, 6, height(x + ux * 300, -(n + un * 300)) + SURFACE + 0.07, paint);
        for (const at of [150, 450, 600]) for (const bar of [0, 1.8]) {
          const o = side * (5.5 + bar * 1.6);
          patch(markings, x + ux * at - un * o, n + un * at + ux * o, ux, un, 22.5, 1.8, height(x + ux * at, -(n + un * at)) + SURFACE + 0.07, paint);
        }
      }
    }
  }
  add(markings, layer(6), 6);
  for (const label of numbers) {
    const b = new MeshBuilder();
    patch(b, label.x, label.n, label.ux, label.un, 18, 9, height(label.x, -label.n) + SURFACE + 0.08, white, true);
    const material = layer(7, numberTexture(label.text));
    material.transparent = true; material.alphaTest = 0.3;
    add(b, material, 7);
  }

  // --- aérogares : murs vitrés, toit plat débordant, enseigne côté ville
  const glass = new MeshBuilder(), roof = new MeshBuilder();
  const wallColor = new THREE.Color(0xdfe6ee), roofColor = new THREE.Color(0xc9ccd0);
  let signDone = false;
  for (const terminal of plan.terminals) {
    const ring = terminal.p;
    let base = Infinity, cx = 0, cn = 0;
    for (let i = 0; i < ring.length; i += 2) { base = Math.min(base, height(ring[i], -ring[i + 1])); cx += ring[i]; cn += ring[i + 1]; }
    cx /= ring.length / 2; cn /= ring.length / 2;
    const top = base + 13;
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      const ax = ring[i], an = ring[i + 1], bx = ring[j], bn = ring[j + 1];
      const side = Math.hypot(bx - ax, bn - an), bays = Math.max(1, Math.round(side / FACADE_WIDTH.tower));
      const a = glass.vertex(ax, base - 0.3, -an, wallColor, 0.85, 0, 0), b = glass.vertex(bx, base - 0.3, -bn, wallColor, 0.85, bays, 0);
      const c = glass.vertex(bx, top, -bn, wallColor, 1, bays, 4), d = glass.vertex(ax, top, -an, wallColor, 1, 0, 4);
      glass.triangle(a, b, c); glass.triangle(a, c, d);
      // Enseigne sur le plus long mur de la première aérogare tourné vers l'extérieur de l'enceinte.
      if (!signDone && side > 60 && terminal === plan.terminals[plan.terminals.length - 1]) {
        const mx = (ax + bx) / 2, mn = (an + bn) / 2, ux = (bx - ax) / side, un = (bn - an) / side;
        let nx = un, nn = -ux;                                    // normale (vers la droite du mur)
        if (nx * (mx - cx) + nn * (mn - cn) < 0) { nx = -nx; nn = -nn; }
        const sign = new MeshBuilder(), w = Math.min(60, side * 0.7);
        const s0 = sign.vertex(mx - ux * w / 2 + nx * 0.3, top - 4, -(mn - un * w / 2 + nn * 0.3), white, 1, 0, 0);
        const s1 = sign.vertex(mx + ux * w / 2 + nx * 0.3, top - 4, -(mn + un * w / 2 + nn * 0.3), white, 1, 1, 0);
        const s2 = sign.vertex(mx + ux * w / 2 + nx * 0.3, top - 0.6, -(mn + un * w / 2 + nn * 0.3), white, 1, 1, 1);
        const s3 = sign.vertex(mx - ux * w / 2 + nx * 0.3, top - 0.6, -(mn - un * w / 2 + nn * 0.3), white, 1, 0, 1);
        sign.triangle(s0, s1, s2); sign.triangle(s0, s2, s3);
        const mesh = new THREE.Mesh(sign.build(), new THREE.MeshBasicMaterial({ map: signTexture("AÉROPORT D'ANNABA – RABAH BITAT"), side: THREE.DoubleSide }));
        group.add(mesh);
        signDone = true;
      }
    }
    texturedPolygon(roof, ring, top, roofColor, 1000);
    collider.addBuilding(ring, -Infinity, Infinity, { y: top });
  }
  const glassMesh = new THREE.Mesh(glass.build(), new THREE.MeshLambertMaterial({ vertexColors: true, map: createFacadeTexture('tower'), side: THREE.DoubleSide }));
  const roofMesh = new THREE.Mesh(roof.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  for (const mesh of [glassMesh, roofMesh]) { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }

  scene.add(group);
  return group;
}

/** Points d'une ligne avec un point au moins tous les `step` mètres (pour suivre le sol). */
function densify(p: number[], step: number): number[] {
  const out = [p[0], p[1]];
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], an = p[i + 1], bx = p[i + 2], bn = p[i + 3];
    const pieces = Math.max(1, Math.ceil(Math.hypot(bx - ax, bn - an) / step));
    for (let k = 1; k <= pieces; k++) out.push(ax + ((bx - ax) * k) / pieces, an + ((bn - an) * k) / pieces);
  }
  return out;
}
