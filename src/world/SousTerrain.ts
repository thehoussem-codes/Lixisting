import * as THREE from 'three';
import type { Collider } from './Collider';
import { type Ground, type Ring, boxAt, canvasTexture, cap } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';
import type { Terrain } from './Terrain';

/**
 * Complexe commercial surélevé de la place au nord du Cours (« Sous-Terrain », ex-église Sainte-Monique).
 *
 * Emprise : toute la place vide entre le boulevard Zighout Youcef (ouest), la rue du 24 Février (est) et le
 * chemin des Caroubiers (sud), trottoirs conservés (bords de chaussée OSM + 3 m). Organisation d'après l'image de
 * conception de Houssem : esplanade surélevée bordée de garde-corps et de lampadaires à globes, grand bâtiment
 * jaune aveugle au fond, grand escalier central depuis le trottoir, deux galeries semi-enterrées sous l'esplanade
 * (une de chaque côté de l'escalier) avec boutiques de vêtements et de maillots de football, fresques et graffitis
 * sur le mur de gauche (côté boulevard Zighout Youcef). Les détails sont une reconstitution, pas un relevé.
 */

const X0 = 111, X1 = 149;            // faces ouest et est (bord de trottoir des deux rues)
const N0 = 661, N1 = 712;            // façade sud (trottoir du chemin des Caroubiers) et fond
const SX0 = 122, SX1 = 138;          // grand escalier central
const R = 4.5;                       // angles arrondis du socle (vue satellite)
const HALLS = [                       // galeries sous l'esplanade : murs x0/x1, entrée d0/d1 (dans la partie droite)
  { x0: 115.6, x1: 121.6, d0: 116.4, d1: 120.8 },
  { x0: 138.4, x1: 144.4, d0: 139.2, d1: 143.6 },
];

type P = [number, number];
/** Rectangle aux angles arrondis, sens trigonométrique, en partant du bas de la façade sud (x0 + r, n0). */
function roundedRect(x0: number, n0: number, x1: number, n1: number, r: number, seg = 6): P[] {
  const pts: P[] = [];
  const corner = (cx: number, cn: number, from: number) => {
    for (let k = 0; k <= seg; k++) { const a = from + (k / seg) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cn + Math.sin(a) * r]); }
  };
  corner(x1 - r, n0 + r, -Math.PI / 2); corner(x1 - r, n1 - r, 0); corner(x0 + r, n1 - r, Math.PI / 2); corner(x0 + r, n0 + r, Math.PI);
  return [[x0 + r, n0], ...pts];
}
function inRounded(x: number, n: number, x0: number, n0: number, x1: number, n1: number, r: number): boolean {
  if (x < x0 || x > x1 || n < n0 || n > n1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cn = Math.min(Math.max(n, n0 + r), n1 - r);
  return Math.hypot(x - cx, n - cn) <= r;
}
/** Pied du grand escalier : aucun mobilier urbain générique (lampadaire) ne doit le masquer. x0, n0, x1, n1. */
export const STAIRS_APPROACH = [SX0 - 2, N0 - 6, SX1 + 2, N0 + 1];
const HALL_N1 = 687;                 // fond des galeries
const DOOR_H = 3.3;
const BUILDING = { x0: 113.5, x1: 146.5, n0: 690, n1: 709, h: 8.5, r: 3 };
const SURFACE = 0.2;

const YELLOW = new THREE.Color(0xffffff);   // la texture d'enduit porte le jaune
const CREAM = new THREE.Color(0xefe6cf);
const STONE = new THREE.Color(0xcfc7b6);
const WHITE = new THREE.Color(0xf4f1e8);
const BLACK = new THREE.Color(0x1d1f22);
const TILE = new THREE.Color(0xd9d3c6);

function rand(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Enduit jaune ocre, taché et un peu délavé, joints de dilatation tous les 4 m. */
function plaster(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#f0c548'; ctx.fillRect(0, 0, 128, 128);
    const r = rand(5);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(255,236,170,0.20)' : 'rgba(140,100,25,0.12)';
      ctx.fillRect(r() * 128, r() * 128, 2 + r() * 12, 2 + r() * 6);
    }
    ctx.fillStyle = 'rgba(110,80,30,0.25)'; ctx.fillRect(126, 0, 2, 128);
    for (let x = 6; x < 128; x += 29) { ctx.fillStyle = 'rgba(120,90,40,0.10)'; ctx.fillRect(x + r() * 10, 30 + r() * 40, 2, 60); }
  });
}

/** Grille en fer forgé noire à volutes, sur fond transparent. */
function railingTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(128, 64, (ctx) => {
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = '#1b1d20'; ctx.strokeStyle = '#1b1d20'; ctx.lineWidth = 2.5;
    ctx.fillRect(0, 2, 128, 5); ctx.fillRect(0, 56, 128, 4); ctx.fillRect(0, 46, 128, 2);
    for (let x = 0; x < 128; x += 8) ctx.fillRect(x, 2, 2, 58);
    for (let x = 16; x < 128; x += 32) {
      ctx.beginPath(); ctx.arc(x, 26, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, 26, 4, 0, Math.PI * 2); ctx.stroke();
    }
  });
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Dessins des maillots : couleurs, rayures, numéro (aucun écusson ni marque réels). */
const JERSEYS: { body: string; stripe?: string; vertical?: boolean; sleeve: string; number: string }[] = [
  { body: '#f4f4f4', stripe: '#0f7a3d', sleeve: '#0f7a3d', number: '#0f7a3d' },
  { body: '#0f7a3d', sleeve: '#f4f4f4', number: '#f4f4f4' },
  { body: '#c8102e', stripe: '#111111', vertical: true, sleeve: '#111111', number: '#ffffff' },
  { body: '#1d4fa8', stripe: '#f4f4f4', vertical: true, sleeve: '#1d4fa8', number: '#f4f4f4' },
  { body: '#f2c500', sleeve: '#1d4fa8', number: '#1d4fa8' },
  { body: '#6fb5e8', sleeve: '#f4f4f4', number: '#1a1a1a' },
  { body: '#c8102e', stripe: '#f4f4f4', vertical: true, sleeve: '#c8102e', number: '#1a1a1a' },
  { body: '#151515', stripe: '#d4a017', sleeve: '#151515', number: '#d4a017' },
];

function drawJersey(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number): void {
  const j = JERSEYS[k % JERSEYS.length];
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.32, y); ctx.lineTo(x + w * 0.68, y);
    ctx.lineTo(x + w, y + h * 0.16); ctx.lineTo(x + w * 0.9, y + h * 0.36); ctx.lineTo(x + w * 0.78, y + h * 0.3);
    ctx.lineTo(x + w * 0.78, y + h); ctx.lineTo(x + w * 0.22, y + h); ctx.lineTo(x + w * 0.22, y + h * 0.3);
    ctx.lineTo(x + w * 0.1, y + h * 0.36); ctx.lineTo(x, y + h * 0.16); ctx.closePath();
  };
  ctx.save(); shape(); ctx.fillStyle = j.body; ctx.fill(); ctx.clip();
  if (j.stripe) {
    ctx.fillStyle = j.stripe;
    if (j.vertical) for (let s = x + w * 0.26; s < x + w * 0.78; s += w * 0.14) ctx.fillRect(s, y, w * 0.07, h);
    else ctx.fillRect(x, y + h * 0.38, w, h * 0.12);
  }
  ctx.fillStyle = j.sleeve; ctx.fillRect(x, y, w * 0.22, h * 0.36); ctx.fillRect(x + w * 0.78, y, w * 0.22, h * 0.36);
  ctx.fillStyle = j.number; ctx.font = `bold ${Math.round(h * 0.34)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String([10, 7, 9, 11, 4, 8, 19, 22][k % 8]), x + w / 2, y + h * 0.62);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + w * 0.4, y, w * 0.2, h * 0.05);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; shape(); ctx.stroke();
}

/** Planche de 8 maillots (un par case) pour les portants. */
function jerseyAtlas(): THREE.CanvasTexture {
  return canvasTexture(512, 80, (ctx) => {
    ctx.clearRect(0, 0, 512, 80);
    for (let k = 0; k < 8; k++) drawJersey(ctx, k * 64 + 3, 4, 58, 72, k);
  }, false);
}

interface ShopKind { ar: string; fr: string; sign: string; }
const SHOPS: ShopKind[] = [
  { ar: 'ملابس رياضية', fr: 'SPORT', sign: '#0f7a3d' },
  { ar: 'أقمصة', fr: 'MAILLOTS', sign: '#c8102e' },
  { ar: 'ملابس', fr: 'VÊTEMENTS', sign: '#1d4fa8' },
  { ar: 'موضة', fr: 'MODE', sign: '#7d2fa0' },
  { ar: 'أحذية رياضية', fr: 'BASKETS', sign: '#222222' },
];

/** Fond de boutique : maillots accrochés en rangs sur un mur clair, enseigne bilingue en haut. */
function shopWall(kind: ShopKind, seed: number): THREE.CanvasTexture {
  return canvasTexture(256, 160, (ctx) => {
    const r = rand(seed * 31 + 7);
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = kind.sign; ctx.fillRect(0, 0, 256, 34);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 17px "Noto Naskh Arabic", "Geeza Pro", Arial, sans-serif'; ctx.fillText(kind.ar, 86, 18);
    ctx.font = 'bold 15px Arial, sans-serif'; ctx.fillText(kind.fr, 196, 18);
    for (let row = 0; row < 3; row++) {
      ctx.fillStyle = '#8f8f8f'; ctx.fillRect(4, 40 + row * 40, 248, 2);
      for (let k = 0; k < 7; k++) drawJersey(ctx, 6 + k * 35.5, 43 + row * 40, 31, 35, Math.floor(r() * 8));
    }
  }, false);
}

/** Mur de street art : aplats, grandes lettres « bulles », personnages, tags, coulures et éclaboussures. */
function graffitiTexture(): THREE.CanvasTexture {
  const W = 2048, H = 192;
  return canvasTexture(W, H, (ctx) => {
    const r = rand(77);
    ctx.fillStyle = '#e1b648'; ctx.fillRect(0, 0, W, H);
    const fonds = ['#2a9dd8', '#e8457a', '#7ac943', '#f28c28', '#6b4fc8', '#19b39b', '#f2d22e', '#d93636'];
    for (let x = 0; x < W;) {
      const w = 120 + r() * 220;
      const g = ctx.createLinearGradient(x, 0, x + w, H);
      g.addColorStop(0, fonds[Math.floor(r() * fonds.length)]); g.addColorStop(1, fonds[Math.floor(r() * fonds.length)]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, H);
      for (let k = 0; k <= 8; k++) ctx.lineTo(x + (w * k) / 8, 10 + r() * 30);
      ctx.lineTo(x + w, H); ctx.fill();
      x += w * (0.85 + r() * 0.2);
    }
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.25})`;
      ctx.beginPath(); ctx.arc(r() * W, 20 + r() * 150, 6 + r() * 26, 0, Math.PI * 2); ctx.fill();
    }
    const bubble = (text: string, x: number, size: number, fill: string, fill2: string, line: string) => {
      ctx.font = `900 ${size}px "Arial Black", Impact, Arial, sans-serif`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.22; ctx.strokeStyle = '#111'; ctx.strokeText(text, x, H * 0.55);
      ctx.lineWidth = size * 0.12; ctx.strokeStyle = line; ctx.strokeText(text, x, H * 0.55);
      const g = ctx.createLinearGradient(0, H * 0.55 - size / 2, 0, H * 0.55 + size / 2);
      g.addColorStop(0, fill); g.addColorStop(1, fill2);
      ctx.fillStyle = g; ctx.fillText(text, x, H * 0.55);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H * 0.55 - size * 0.18); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(text, x + 2, H * 0.55 - 3); ctx.restore();
    };
    bubble('ANNABA', 40, 104, '#ffe14d', '#ff7a1a', '#ffffff');
    bubble('BÔNE', 640, 110, '#7af0ff', '#2a5bd8', '#ffef5a');
    bubble('23', 1080, 120, '#ff6fb0', '#b0157a', '#ffffff');
    bubble('HIP HOP', 1500, 84, '#9cff57', '#1f9a2e', '#ff4fa3');
    const face = (cx: number, cy: number, s: number, skin: string, capColor: string) => {
      ctx.lineWidth = 4; ctx.strokeStyle = '#111';
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = capColor; ctx.beginPath(); ctx.arc(cx, cy - s * 0.2, s * 1.02, Math.PI, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillRect(cx - s * 1.4, cy - s * 0.26, s * 1.4, s * 0.16);
      ctx.fillStyle = '#111'; ctx.fillRect(cx - s * 0.6, cy + s * 0.05, s * 0.5, s * 0.25); ctx.fillRect(cx + s * 0.1, cy + s * 0.05, s * 0.5, s * 0.25);
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.45, s * 0.32, 0.1, Math.PI - 0.1); ctx.stroke();
    };
    face(560, 96, 46, '#c98b5a', '#d93636');
    face(1360, 92, 50, '#f0c08a', '#1d4fa8');
    face(1960, 96, 44, '#8a5a3a', '#0f7a3d');
    for (let k = 0; k < 26; k++) {
      ctx.strokeStyle = ['#111', '#fff', '#d93636', '#1d4fa8', '#111'][k % 5]; ctx.lineWidth = 2 + r() * 3;
      let x = r() * W, y = 30 + r() * 140;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += 8 + r() * 18; y += (r() - 0.5) * 30; ctx.quadraticCurveTo(x - 6, y - 20 * r(), x, y); }
      ctx.stroke();
    }
    for (let k = 0; k < 140; k++) {
      ctx.fillStyle = fonds[Math.floor(r() * fonds.length)];
      const x = r() * W, y = 40 + r() * 120;
      if (r() < 0.5) ctx.fillRect(x, y, 2 + r() * 2, 8 + r() * 30);
      else { ctx.beginPath(); ctx.arc(x, y, 1 + r() * 4, 0, Math.PI * 2); ctx.fill(); }
    }
    const dirt = ctx.createLinearGradient(0, H - 26, 0, H);
    dirt.addColorStop(0, 'rgba(60,50,40,0)'); dirt.addColorStop(1, 'rgba(60,50,40,0.45)');
    ctx.fillStyle = dirt; ctx.fillRect(0, H - 26, W, 26);
  }, false);
}

/** Poutre (section rectangulaire) entre deux points quelconques : rampes inclinées. */
function beam(b: MeshBuilder, a: THREE.Vector3, c: THREE.Vector3, w: number, h: number, color: THREE.Color): void {
  const dir = c.clone().sub(a).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(w / 2);
  const up = new THREE.Vector3().crossVectors(side, dir).normalize().multiplyScalar(h / 2);
  if (up.y < 0) up.negate();
  const corners = (p: THREE.Vector3) => [p.clone().add(side).add(up), p.clone().sub(side).add(up), p.clone().sub(side).sub(up), p.clone().add(side).sub(up)];
  const v = [...corners(a), ...corners(c)].map((p) => b.vertex(p.x, p.y, p.z, color));
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    b.triangle(v[k], v[k2], v[4 + k2]); b.triangle(v[k], v[4 + k2], v[4 + k]);
  }
}

export interface SousTerrain {
  /** Hauteur du sol ; `y` (hauteur actuelle du joueur) départage l'esplanade et les galeries situées dessous. */
  ground: (x: number, z: number, y?: number) => number | null;
  inside: (x: number, n: number) => boolean;
}

export function buildSousTerrain(scene: THREE.Scene, terrain: Terrain, ground: Ground, collider: Collider): SousTerrain {
  const sidewalk = (x: number) => ground(x, -(N0 - 0.6)) + SURFACE;
  let frontMax = -Infinity, low = Infinity;
  for (let x = X0; x <= X1; x += 1) frontMax = Math.max(frontMax, sidewalk(x));
  for (let x = X0; x <= X1; x += 4) for (let n = N0; n <= N1; n += 4) low = Math.min(low, ground(x, -n));
  const T = frontMax + 4.2;                         // niveau de l'esplanade
  const base = low - 1;
  const stairBottom = sidewalk((SX0 + SX1) / 2);
  const steps = Math.ceil((T - stairBottom) / 0.165), rise = (T - stairBottom) / steps, RUN = 0.32;
  const stairTop = N0 + steps * RUN;
  const floors = HALLS.map((h) => sidewalk((h.d0 + h.d1) / 2));
  const ceiling = T - 0.7;

  for (const h of HALLS) terrain.cutHole([[h.x0 + 0.1, N0 + 0.2], [h.x1 - 0.1, N0 + 0.2], [h.x1 - 0.1, HALL_N1 - 0.1], [h.x0 + 0.1, HALL_N1 - 0.1]]);

  const yellow = new MeshBuilder(), trim = new MeshBuilder(), inside = new MeshBuilder(), steel = new MeshBuilder();
  const wallQuad = (b: MeshBuilder, ax: number, an: number, bx: number, bn: number, y0: number, y1: number, color: THREE.Color, u0 = 0) => {
    const len = Math.hypot(bx - ax, bn - an);
    const v0 = b.vertex(ax, y0, -an, color, 1, u0 / 4, y0 / 4), v1 = b.vertex(bx, y0, -bn, color, 1, (u0 + len) / 4, y0 / 4);
    const v2 = b.vertex(bx, y1, -bn, color, 1, (u0 + len) / 4, y1 / 4), v3 = b.vertex(ax, y1, -an, color, 1, u0 / 4, y1 / 4);
    b.triangle(v0, v1, v2); b.triangle(v0, v2, v3);
  };
  const LOW = -Infinity, wallTop = T - 0.6;
  // Obstacles à hauteur limitée : les murs du socle ne gênent pas sur l'esplanade, les garde-corps seulement en haut.
  const solid = (ax: number, an: number, bx: number, bn: number, yMax = wallTop) => {
    const dx = bx - ax, dn = bn - an, l = Math.hypot(dx, dn), ox = (-dn / l) * 0.3, on = (dx / l) * 0.3;
    collider.addBuilding([ax - ox, an - on, bx - ox, bn - on, bx + ox, bn + on, ax + ox, an + on], LOW, yMax);
  };
  const guard = (ax: number, an: number, bx: number, bn: number) => {
    const dx = bx - ax, dn = bn - an, l = Math.hypot(dx, dn), ox = (-dn / l) * 0.25, on = (dx / l) * 0.25;
    collider.addBuilding([ax - ox, an - on, bx - ox, bn - on, bx + ox, bn + on, ax + ox, an + on], T - 0.4, T + 4);
  };

  // --- Façade sud : murs jaunes, deux entrées de galerie, coupure du grand escalier.
  const frontSegments: [number, number][] = [[X0 + R, HALLS[0].d0], [HALLS[0].d1, SX0], [SX1, HALLS[1].d0], [HALLS[1].d1, X1 - R]];
  for (const [a, b] of frontSegments) { wallQuad(yellow, a, N0, b, N0, base, T, YELLOW, a); solid(a, N0, b, N0); }
  HALLS.forEach((h, i) => {
    wallQuad(yellow, h.d0, N0, h.d1, N0, floors[i] + DOOR_H, T, YELLOW, h.d0);
    wallQuad(yellow, h.d0, N0, h.d1, N0, base, floors[i] - 0.02, YELLOW, h.d0);
    boxAt(trim, (h.d0 + h.d1) / 2, -(N0 + 0.05), h.d1 - h.d0 + 0.6, 0.3, floors[i] + DOOR_H, floors[i] + DOOR_H + 0.3, STONE);
    for (const x of [h.d0, h.d1]) boxAt(trim, x, -(N0 + 0.05), 0.3, 0.32, floors[i] - 0.02, floors[i] + DOOR_H + 0.3, STONE);
  });
  // Le reste du pourtour (angles arrondis, faces est, nord et ouest) ; la face ouest reçoit en plus la fresque.
  const outline = roundedRect(X0, N0, X1, N1, R);
  const perimeter: [number, number, number, number][] = [];
  for (let k = 1; k < outline.length; k++) {
    const [ax, an] = outline[k], [bx, bn] = outline[(k + 1) % outline.length];
    if (Math.hypot(bx - ax, bn - an) < 0.01) continue;
    perimeter.push([ax, an, bx, bn]);
    wallQuad(yellow, ax, an, bx, bn, base, T, YELLOW, ax + an);
    solid(ax, an, bx, bn);
  }
  // Mur de gauche (boulevard Zighout Youcef) : fresques et graffitis sur toute sa longueur.
  {
    const texture = graffitiTexture();
    const g = new MeshBuilder();
    const vis = ground(X0 - 1, -((N0 + N1) / 2)) + SURFACE - 0.3; // pied visible du mur
    const vb = -(vis - base) / (T - vis);                          // la fondation enterrée sort de la texture
    const a = g.vertex(X0 - 0.02, base, -(N1 - R), WHITE, 1, 0, vb), b = g.vertex(X0 - 0.02, base, -(N0 + R), WHITE, 1, 1, vb);
    const c = g.vertex(X0 - 0.02, T, -(N0 + R), WHITE, 1, 1, 1), d = g.vertex(X0 - 0.02, T, -(N1 - R), WHITE, 1, 0, 1);
    g.triangle(a, b, c); g.triangle(a, c, d);
    texture.wrapT = THREE.ClampToEdgeWrapping;
    scene.add(new THREE.Mesh(g.build(), new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide })));
  }
  // Couronnement : bandeau de pierre en haut des murs.
  for (const [ax, an, bx, bn] of [[X0 + R, N0, SX0, N0], [SX1, N0, X1 - R, N0], ...perimeter]) {
    const mx = (ax + bx) / 2, mn = (an + bn) / 2, len = Math.hypot(bx - ax, bn - an);
    boxAt(trim, mx, -mn, len + 0.6, 0.6, T - 0.25, T + 0.35, STONE, Math.atan2(-(bn - an), bx - ax));
  }

  // --- Esplanade : dallage clair, sauf la trémie de l'escalier.
  const deck = new MeshBuilder();
  // Contour arrondi avec l'encoche de la trémie de l'escalier.
  cap(deck, [[SX1, N0], ...outline.slice(1, -1), [X0 + R, N0], [SX0, N0], [SX0, stairTop], [SX1, stairTop]], T, TILE, 1);

  // --- Grand escalier central : marches de pierre, joues jaunes, rampes en trois volées.
  for (let k = 0; k < steps; k++) {
    const n0 = N0 + k * RUN;
    boxAt(trim, (SX0 + SX1) / 2, -(n0 + RUN / 2), SX1 - SX0, RUN + 0.01, base, stairBottom + (k + 0.5) * rise, k % 2 ? STONE : WHITE);
  }
  for (const x of [SX0, SX1]) { wallQuad(yellow, x, N0, x, stairTop, base, T, YELLOW); solid(x, N0, x, stairTop); guard(x, N0, x, stairTop); }
  const railY = 0.95;
  for (const x of [SX0 + 0.35, SX0 + (SX1 - SX0) / 3, SX0 + (2 * (SX1 - SX0)) / 3, SX1 - 0.35]) {
    beam(steel, new THREE.Vector3(x, stairBottom + railY, -(N0 + 0.3)), new THREE.Vector3(x, T + railY, -stairTop), 0.07, 0.07, BLACK);
    for (let t = 0; t <= 1.001; t += 0.25) {
      const n = N0 + 0.3 + (stairTop - N0 - 0.3) * t, y = stairBottom + (T - stairBottom) * t;
      boxAt(steel, x, -n, 0.05, 0.05, y - 0.1, y + railY, BLACK);
    }
  }

  // --- Garde-corps en fer forgé et lampadaires à globes autour de l'esplanade.
  const rails = new MeshBuilder();
  const railRun = (ax: number, an: number, bx: number, bn: number) => {
    const len = Math.hypot(bx - ax, bn - an);
    const y0 = T + 0.35, y1 = T + 1.3;
    const a = rails.vertex(ax, y0, -an, WHITE, 1, 0, 0), b = rails.vertex(bx, y0, -bn, WHITE, 1, len / 1.6, 0);
    const c = rails.vertex(bx, y1, -bn, WHITE, 1, len / 1.6, 1), d = rails.vertex(ax, y1, -an, WHITE, 1, 0, 1);
    rails.triangle(a, b, c); rails.triangle(a, c, d);
    for (let s = 0; s <= len + 0.01; s += len / Math.max(1, Math.round(len / 3))) boxAt(trim, ax + (bx - ax) * s / len, -(an + (bn - an) * s / len), 0.35, 0.35, T + 0.35, T + 1.45, STONE);
    guard(ax, an, bx, bn);
  };
  railRun(X0 + R, N0 + 0.3, SX0 - 0.3, N0 + 0.3); railRun(SX1 + 0.3, N0 + 0.3, X1 - R, N0 + 0.3);
  const railLine = roundedRect(X0 + 0.3, N0 + 0.3, X1 - 0.3, N1 - 0.3, R - 0.3);
  for (let k = 1; k < railLine.length; k++) {
    const [ax, an] = railLine[k], [bx, bn] = railLine[(k + 1) % railLine.length];
    if (Math.hypot(bx - ax, bn - an) > 0.01) railRun(ax, an, bx, bn);
  }
  railRun(SX0 - 0.3, N0 + 0.3, SX0 - 0.3, stairTop); railRun(SX1 + 0.3, N0 + 0.3, SX1 + 0.3, stairTop);
  const lamps: [number, number][] = [[X0 + R, N0 + 0.7], [117, N0 + 0.7], [SX0 - 0.7, N0 + 0.7], [SX1 + 0.7, N0 + 0.7], [143, N0 + 0.7], [X1 - R, N0 + 0.7],
    [SX0 - 0.7, stairTop + 0.7], [SX1 + 0.7, stairTop + 0.7], [X0 + 0.7, 680], [X1 - 0.7, 680]];
  const globes: THREE.Vector3[] = [];
  for (const [x, n] of lamps) {
    boxAt(steel, x, -n, 0.4, 0.4, T, T + 0.5, BLACK);
    boxAt(steel, x, -n, 0.13, 0.13, T + 0.5, T + 4.2, BLACK);
    boxAt(steel, x, -n, 1.2, 0.08, T + 4.1, T + 4.2, BLACK);
    globes.push(new THREE.Vector3(x - 0.55, T + 4.45, -n), new THREE.Vector3(x + 0.55, T + 4.45, -n), new THREE.Vector3(x, T + 4.6, -n));
    collider.addBuilding([x - 0.25, n - 0.25, x + 0.25, n - 0.25, x + 0.25, n + 0.25, x - 0.25, n + 0.25], T - 0.4, T + 5);
  }
  const globeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9a958a }), globes.length);
  globes.forEach((p, i) => globeMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  scene.add(globeMesh);

  // --- Grand bâtiment jaune aveugle au fond de l'esplanade : pilastres, soubassement, corniche.
  const B = BUILDING, top = T + B.h;
  const ring: Ring = roundedRect(B.x0, B.n0, B.x1, B.n1, B.r);
  const band = (b: MeshBuilder, r: Ring, y0: number, y1: number, color: THREE.Color) => {
    let u = 0;
    for (let k = 0; k < r.length; k++) {
      const [ax, an] = r[k], [bx, bn] = r[(k + 1) % r.length], l = Math.hypot(bx - ax, bn - an);
      if (l < 0.01) continue;
      wallQuad(b, ax, an, bx, bn, y0, y1, color, u); u += l;
    }
  };
  band(yellow, ring, T, top, YELLOW);
  cap(trim, ring, top + 0.6, new THREE.Color(0xd8d2c4), 1);
  band(trim, roundedRect(B.x0 - 0.6, B.n0 - 0.6, B.x1 + 0.6, B.n1 + 0.6, B.r + 0.6), top, top + 0.6, WHITE);   // corniche
  cap(trim, roundedRect(B.x0 - 0.6, B.n0 - 0.6, B.x1 + 0.6, B.n1 + 0.6, B.r + 0.6), top, WHITE, 1, false);
  band(trim, roundedRect(B.x0 - 0.2, B.n0 - 0.2, B.x1 + 0.2, B.n1 + 0.2, B.r + 0.2), T, T + 0.9, STONE);      // soubassement
  for (let k = 0; k <= 5; k++) boxAt(yellow, B.x0 + B.r + (k * (B.x1 - B.x0 - 2 * B.r)) / 5, -(B.n0 - 0.2), 1.1, 0.5, T, top, YELLOW);
  band(yellow, roundedRect(B.x0 - 0.15, B.n0 - 0.15, B.x1 + 0.15, B.n1 + 0.15, B.r + 0.15), top - 1.6, top - 1.0, YELLOW); // bandeau haut
  collider.addBuilding(roundedRect(B.x0 - 0.6, B.n0 - 0.6, B.x1 + 0.6, B.n1 + 0.4, B.r + 0.6).flat(), T - 0.4, Infinity);

  // --- Galeries semi-enterrées : boutiques de vêtements et de maillots, portants, néons.
  const jerseyMaterial = new THREE.MeshLambertMaterial({ map: jerseyAtlas(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, emissive: 0x2a2a2a });
  const jerseys = new MeshBuilder(), neon = new MeshBuilder();
  const GREY = new THREE.Color(0x8a8a8a);
  const hang = (x: number, y: number, n: number, k: number) => {
    const w = 0.58, h = 0.75, u0 = (k % 8) / 8, u1 = u0 + 1 / 8;
    const a = jerseys.vertex(x, y - h, -(n - w / 2), WHITE, 1, u0, 0), b = jerseys.vertex(x, y - h, -(n + w / 2), WHITE, 1, u1, 0);
    const c = jerseys.vertex(x, y, -(n + w / 2), WHITE, 1, u1, 1), d = jerseys.vertex(x, y, -(n - w / 2), WHITE, 1, u0, 1);
    jerseys.triangle(a, b, c); jerseys.triangle(a, c, d);
  };
  let shopIndex = 0;
  HALLS.forEach((h, i) => {
    const f = floors[i], cx = (h.x0 + h.x1) / 2;
    const room: Ring = [[h.x0, N0], [h.x1, N0], [h.x1, HALL_N1], [h.x0, HALL_N1]];
    cap(inside, room, f, TILE, 1);
    cap(neon, room, ceiling, new THREE.Color(0xd9d6cf), 1, false); // plafond clair (non éclairé par le dessous)
    for (const [ax, an, bx, bn] of [[h.x0, N0 + 0.3, h.x0, HALL_N1], [h.x1, N0 + 0.3, h.x1, HALL_N1], [h.x0, HALL_N1, h.x1, HALL_N1]]) {
      wallQuad(inside, ax, an, bx, bn, f, ceiling, CREAM);
      solid(ax, an, bx, bn, ceiling);
    }
    boxAt(inside, cx, -(N0 + 0.15), h.x1 - h.x0, 0.3, f + DOOR_H, ceiling, CREAM);
    for (const side of [-1, 1]) {
      const wallX = side < 0 ? h.x0 : h.x1, depth = 1.8, front = wallX - side * depth;
      for (let n = N0 + 1.5; n + 4 <= HALL_N1 - 0.5; n += 4.4) {
        const kind = SHOPS[shopIndex % SHOPS.length];
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshLambertMaterial({ map: shopWall(kind, shopIndex), emissive: 0x3a3a3a }));
        plane.position.set(wallX - side * 0.05, f + 1.5, -(n + 2));
        plane.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(plane);
        for (const nn of [n, n + 4]) boxAt(inside, wallX - (side * depth) / 2, -nn, depth, 0.12, f, f + 2.9, CREAM);
        boxAt(steel, front, -(n + 2), 0.04, 3.2, f + 1.62, f + 1.67, GREY);
        for (const nn of [n + 0.45, n + 3.55]) boxAt(steel, front, -nn, 0.05, 0.05, f, f + 1.67, GREY);
        for (let k = 0; k < 5; k++) hang(front + side * 0.02, f + 1.6, n + 0.75 + k * 0.62, shopIndex * 3 + k);
        shopIndex++;
      }
      const xa = Math.min(wallX, front - side * 0.3), xb = Math.max(wallX, front - side * 0.3);
      collider.addBuilding([xa, N0 + 1.4, xb, N0 + 1.4, xb, HALL_N1, xa, HALL_N1], LOW, ceiling);
    }
    // Étal du vendeur au fond de la galerie : table de maillots pliés.
    const table = HALL_N1 - 1.2;
    boxAt(inside, cx, -table, 2.2, 1.2, f, f + 0.8, new THREE.Color(0x7a5a3a));
    for (let k = 0; k < 6; k++) boxAt(inside, cx - 0.75 + (k % 3) * 0.75, -(table - 0.3 + Math.floor(k / 3) * 0.6), 0.5, 0.45, f + 0.8, f + 0.95 + (k % 2) * 0.08, new THREE.Color(JERSEYS[(k + i) % 8].body));
    collider.addBuilding([cx - 1.2, table - 0.7, cx + 1.2, table - 0.7, cx + 1.2, HALL_N1, cx - 1.2, HALL_N1], LOW, ceiling);
    for (let n = N0 + 3; n < HALL_N1 - 1; n += 4) boxAt(neon, cx, -n, 0.16, 1.4, ceiling - 0.12, ceiling - 0.02, WHITE);
  });

  const add = (builder: MeshBuilder, material: THREE.Material, shadow = true) => {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.castShadow = shadow;
    scene.add(mesh);
    return mesh;
  };
  add(yellow, new THREE.MeshLambertMaterial({ map: plaster(), side: THREE.DoubleSide }));
  add(trim, new THREE.MeshLambertMaterial({ vertexColors: true }));
  add(steel, new THREE.MeshLambertMaterial({ vertexColors: true }));
  add(rails, new THREE.MeshLambertMaterial({ map: railingTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
  add(deck, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })).receiveShadow = true;
  add(inside, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x2e2a22 }), false);
  add(jerseys, jerseyMaterial, false);
  add(neon, new THREE.MeshBasicMaterial({ color: 0xfafff5 }), false);

  // --- Sol praticable.
  const patch = (x: number, z: number, y?: number): number | null => {
    const n = -z;
    if (!inRounded(x, n, X0, N0, X1, N1, R)) return null;
    if (x >= SX0 && x <= SX1 && n <= stairTop) return stairBottom + ((T - stairBottom) * (n - N0)) / (stairTop - N0);
    for (let i = 0; i < HALLS.length; i++) {
      const h = HALLS[i];
      if (x >= h.x0 && x <= h.x1 && n <= HALL_N1) return y !== undefined && y > T - 1.5 ? T : floors[i];
    }
    return T;
  };
  return { ground: patch, inside: (x, n) => x > X0 - 1.5 && x < X1 + 1.5 && n > N0 - 1 && n < N1 + 1 };
}
