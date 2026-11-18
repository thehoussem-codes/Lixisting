import * as THREE from 'three';
import type { Collider } from './Collider';
import { type Ground, type Ring, boxAt, canvasTexture, cap } from './LandmarkKit';
import { MeshBuilder } from './MeshBuilder';
import type { WorldData } from './WorldData';

/**
 * Corniche Chapuis (boulevard Rizzi Amor, plage Chapuis / Rizzi Amor), d'après la vidéo envoyée par Houssem
 * (« CORNICHE CHAPUIS », trajet vers le nord, la mer à droite) et une vue aérienne de référence.
 *
 * Ordre des lieux dans la vidéo, du sud au nord :
 * - à gauche, un grand hôtel jaune ocre : tour d'une quinzaine d'étages aux fenêtres en arc, devant elle une aile
 *   basse à arcades, pavillons d'angle et toits de tuiles rouges, clôture à barreaux noirs ;
 *   à droite le panneau bleu « Plage Rizzi Amor » ;
 * - après le carrefour de la route de Coral Bay (feux), la grande tour blanche à la façade courbe : bandeaux blancs
 *   des balcons et vitrages sombres à chaque étage, commerces au rez-de-chaussée ;
 * - villas blanches derrière des murets blancs à grilles vertes ;
 * - au bout, là où la route tourne à gauche et monte : le restaurant Savannah (blanc, cadre d'acier rouge, enseigne),
 *   « Machawi La Marina » à côté, et côté mer une tour blanche et une tour en brique.
 * Tout du long côté mer : promenade en pavés gris avec une bande de briques rouges le long de la bordure,
 * palmiers, lampadaires, corbeilles ; sur le terre-plein central, lampadaires à deux bras.
 *
 * Limites : OpenStreetMap n'a ici que des emprises grossières, sans nom ni étages. Emprises recalées à vue sur la
 * vue aérienne (±5 m) et tenues à distance des rues d'OSM ; hauteurs comptées sur la vidéo (étages × 3 m environ) ;
 * l'emplacement des deux tours du bout de la corniche est approximatif (la vue aérienne penche).
 * Le nom de l'hôtel jaune n'est pas lisible sur la vidéo : il n'est pas inventé.
 */

const RINGS = {
  hotelWing: [[205.59, 3349.59], [194.03, 3387.88], [181.11, 3383.98], [192.67, 3345.69]] as Ring,
  hotelPavS: [[206.46, 3346.72], [203.57, 3356.29], [192.56, 3352.97], [195.45, 3343.39]] as Ring,
  hotelPavN: [[196.05, 3381.18], [193.16, 3390.75], [182.15, 3387.43], [185.04, 3377.86]] as Ring,
  hotelTower: [[186.89, 3364.83], [178.79, 3391.64], [158.69, 3385.57], [166.78, 3358.76]] as Ring,
  hotelBack: [[193.24, 3343.77], [186.89, 3364.83], [174.44, 3361.07], [180.8, 3340.01]] as Ring,
  roundTower: [[115.13, 3529.14], [119.48, 3530.94], [123.4, 3533.54], [126.73, 3536.87], [129.35, 3540.78], [131.16, 3545.12], [132.08, 3549.73], [132.09, 3554.44], [131.17, 3559.05], [125.1, 3579.16], [121.37, 3581.16], [77.33, 3567.87], [75.99, 3565.37], [88.71, 3523.25], [91.2, 3521.92]] as Ring,
  savannah: [[127, 3809], [144, 3809], [144, 3827], [127, 3827]] as Ring,
  machawi: [[144, 3806], [160, 3806], [160, 3821], [144, 3821]] as Ring,
  whiteTower: [[193, 3848], [210, 3848], [210, 3869], [193, 3869]] as Ring,
  brickTower: [[198, 3872], [219, 3872], [219, 3899], [198, 3899]] as Ring,
};
export const CHAPUIS_REPLACED: [number, number][] = [[103.5, 3532.7], [182.9, 3342.9], [180.0, 3376.0], [204.7, 3868.5], [142.3, 3828.2], [207.6, 3897.9]];


/** Repère de la corniche : u le long de la route (vers le nord), v vers l'intérieur des terres. */
const A = (16.8 * Math.PI) / 180;
const U: [number, number] = [-Math.sin(A), Math.cos(A)];
const V: [number, number] = [-Math.cos(A), -Math.sin(A)];
const HOTEL_ORIGIN: [number, number] = [209.52, 3348.69]; // bord du trottoir ouest à n = 3350
const at = (o: [number, number], u: number, v: number): [number, number] => [o[0] + U[0] * u + V[0] * v, o[1] + U[1] * u + V[1] * v];

/** Axes des deux chaussées (OSM), du sud au nord, et leur largeur. */
const EAST_A: Ring = [[241.0, 3284.0], [239.0, 3291.6], [236.9, 3299.1], [234.1, 3308.1], [231.4, 3317.0], [228.6, 3325.9], [226.1, 3333.6], [223.7, 3341.3], [221.2, 3349.0], [218.7, 3356.7], [216.3, 3364.4], [213.3, 3373.5], [210.3, 3382.6], [207.4, 3391.7], [204.4, 3400.8], [201.4, 3409.9], [198.5, 3419.0], [195.5, 3428.1], [192.5, 3437.2], [189.5, 3446.3], [186.6, 3455.4], [183.6, 3464.5], [180.6, 3473.6], [177.7, 3482.7], [174.8, 3491.8], [172.0, 3500.9], [169.3, 3510.3], [166.7, 3519.7]];
const EAST_B: Ring = [[162.3, 3531.8], [159.4, 3541.2], [156.5, 3550.5], [153.6, 3559.8], [150.7, 3569.1], [147.8, 3578.4], [144.9, 3587.7], [142.1, 3597.1], [139.2, 3606.4], [136.3, 3615.7], [133.4, 3625.0], [130.5, 3634.3], [127.9, 3642.5], [125.3, 3650.7], [122.7, 3658.9], [120.1, 3667.1], [117.4, 3675.2], [114.7, 3683.4], [112.0, 3691.6], [109.2, 3699.7], [106.3, 3707.9], [102.9, 3715.5], [99.6, 3723.2], [96.6, 3729.5], [93.5, 3735.7], [90.0, 3742.2]];
const WEST_A: Ring = [[234.4, 3292.2], [231.1, 3301.4], [227.8, 3310.7], [224.5, 3319.9], [221.2, 3329.2], [218.0, 3338.4], [214.7, 3347.7], [211.4, 3356.9], [208.3, 3365.8], [205.3, 3374.6], [202.2, 3383.5], [199.2, 3392.3], [196.1, 3401.1], [193.1, 3410.0], [190.2, 3418.6], [187.3, 3427.3], [184.4, 3435.9], [181.5, 3444.5], [178.6, 3453.2], [175.7, 3461.8], [172.8, 3470.5], [170.0, 3479.1], [167.1, 3487.7], [164.2, 3496.4]];
const WEST_B: Ring = [[152.2, 3530.8], [149.8, 3538.8], [147.5, 3546.7], [145.2, 3554.7], [142.9, 3562.7], [140.0, 3572.1], [137.1, 3581.5], [134.2, 3590.9], [131.4, 3600.3], [128.5, 3609.8], [125.8, 3618.2], [123.2, 3626.7], [120.6, 3635.1], [118.0, 3643.6], [115.4, 3652.0], [112.7, 3660.5], [110.1, 3668.9], [107.8, 3676.2], [105.4, 3683.4], [103.1, 3690.6], [100.7, 3697.9], [98.0, 3704.2]];
const HALF_A = 5.7 / 2, HALF_B = 10 / 2, HALF_WA = 5.5 / 2;
const PROMENADE = 9; // largeur de la promenade côté mer, depuis le bord de la chaussée

const OCHRE = new THREE.Color(0xe0bb6e), WHITE = new THREE.Color(0xffffff), CREAM = new THREE.Color(0xf4f1ea);
const TILE_RED = new THREE.Color(0xb9472d), BLACK = new THREE.Color(0x1d1f22), STEEL = new THREE.Color(0xc9222b);
const POLE = new THREE.Color(0x2b2e33), CONCRETE = new THREE.Color(0xcfcac0);

// ---------------------------------------------------------------- textures (dessinées, aucune photo copiée)

export function noise(ctx: CanvasRenderingContext2D, w: number, h: number, rgb: string, count: number, seed: number): void {
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < count; i++) { ctx.fillStyle = `rgba(${rgb},${0.04 + r() * 0.08})`; ctx.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 5); }
}

/** Étage courant de la tour de l'hôtel (travée de 4 m × 3 m) : fenêtre en arc à cadre blanc, garde-corps noir. */
function hotelFloor(): THREE.CanvasTexture {
  return canvasTexture(128, 96, (ctx) => {
    ctx.fillStyle = '#e3bf72'; ctx.fillRect(0, 0, 128, 96); noise(ctx, 128, 96, '150,110,40', 60, 5);
    ctx.fillStyle = '#c99f55'; ctx.fillRect(0, 0, 7, 96); ctx.fillRect(121, 0, 7, 96); ctx.fillRect(0, 92, 128, 4);
    ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.moveTo(30, 88); ctx.lineTo(30, 44); ctx.arc(64, 44, 34, Math.PI, 0); ctx.lineTo(98, 88); ctx.fill();
    const g = ctx.createLinearGradient(0, 14, 0, 88); g.addColorStop(0, '#5b7c96'); g.addColorStop(1, '#2c4256');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(36, 88); ctx.lineTo(36, 44); ctx.arc(64, 44, 28, Math.PI, 0); ctx.lineTo(92, 88); ctx.fill();
    ctx.fillStyle = '#fbf6ea'; ctx.fillRect(62, 18, 4, 70);
    ctx.fillStyle = '#18191b'; ctx.fillRect(26, 66, 76, 3); ctx.fillRect(26, 86, 76, 3);
    for (let x = 28; x < 102; x += 6) ctx.fillRect(x, 66, 2, 22);
  });
}

/** Couronnement de la tour : loggia à arcs et merlons. */
function hotelCrown(): THREE.CanvasTexture {
  return canvasTexture(128, 96, (ctx) => {
    ctx.fillStyle = '#e3bf72'; ctx.fillRect(0, 0, 128, 96);
    ctx.fillStyle = '#fbf6ea'; ctx.fillRect(0, 78, 128, 6); ctx.fillRect(0, 0, 128, 8);
    for (let x = 0; x < 128; x += 32) { ctx.fillStyle = '#e3bf72'; ctx.fillRect(x + 4, 0, 24, 6); }
    for (const x of [16, 48, 80, 112]) {
      ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.moveTo(x - 13, 78); ctx.lineTo(x - 13, 36); ctx.arc(x, 36, 13, Math.PI, 0); ctx.lineTo(x + 13, 78); ctx.fill();
      ctx.fillStyle = '#3b3326'; ctx.beginPath(); ctx.moveTo(x - 9, 78); ctx.lineTo(x - 9, 37); ctx.arc(x, 37, 9, Math.PI, 0); ctx.lineTo(x + 9, 78); ctx.fill();
    }
  });
}

/** Aile basse et pavillons (travée de 4 m × 3,5 m) : grande baie en arc outrepassé, encadrement blanc. */
function hotelArcade(): THREE.CanvasTexture {
  return canvasTexture(128, 112, (ctx) => {
    ctx.fillStyle = '#e6c27a'; ctx.fillRect(0, 0, 128, 112); noise(ctx, 128, 112, '150,110,40', 60, 9);
    ctx.fillStyle = '#d2a95e'; ctx.fillRect(0, 106, 128, 6);
    ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.moveTo(24, 104); ctx.lineTo(24, 48); ctx.arc(64, 46, 41, Math.PI * 0.94, Math.PI * 2.06); ctx.lineTo(104, 104); ctx.fill();
    const g = ctx.createLinearGradient(0, 10, 0, 104); g.addColorStop(0, '#6b8aa2'); g.addColorStop(1, '#30475a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(31, 104); ctx.lineTo(31, 48); ctx.arc(64, 46, 34, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(97, 104); ctx.fill();
    ctx.fillStyle = '#fbf6ea'; ctx.fillRect(62, 14, 4, 90); ctx.fillRect(31, 62, 66, 3);
  });
}

function roofTiles(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#b9472d'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = 'rgba(80,25,10,0.45)'; ctx.fillRect(0, y, 128, 3);
      for (let x = (y / 16) % 2 ? 8 : 0; x < 128; x += 16) { ctx.fillStyle = `rgba(${210 + ((x * 7 + y) % 40)},${95 + ((x + y * 3) % 30)},60,0.35)`; ctx.fillRect(x + 1, y + 3, 14, 13); }
    }
  });
}

/** Étage de la tour ronde (3 m × 3,05 m) : dalle de balcon blanche, garde-corps vitré, baies sombres. */
function bandFloor(): THREE.CanvasTexture {
  return canvasTexture(96, 96, (ctx) => {
    // Vidéo : larges bandeaux blancs (dalle + allège pleine des balcons), baies gris-bleu en retrait au-dessus.
    const g = ctx.createLinearGradient(0, 0, 0, 52); g.addColorStop(0, '#46525d'); g.addColorStop(1, '#6d7f8c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 52);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(40, 0); ctx.lineTo(70, 0); ctx.lineTo(0, 45); ctx.fill();
    ctx.fillStyle = '#b8c0c6'; for (const x of [0, 31, 63]) ctx.fillRect(x, 0, 3, 52);
    ctx.fillStyle = '#f7f6f2'; ctx.fillRect(0, 52, 96, 44);
    ctx.fillStyle = '#dcd9d1'; ctx.fillRect(0, 52, 96, 3); ctx.fillRect(0, 92, 96, 4);
  });
}

/** Rez-de-chaussée commerçant (6 m × 4,8 m) : vitrines et bandeaux d'enseigne de couleurs différentes. */
function shopFront(): THREE.CanvasTexture {
  return canvasTexture(192, 144, (ctx) => {
    const colors = ['#2e8b57', '#b22d2d', '#e0a526', '#2c5aa0', '#7b3f98', '#1f8a8a'];
    for (let k = 0; k < 2; k++) {
      const x = k * 96;
      ctx.fillStyle = '#f2f0ea'; ctx.fillRect(x, 0, 96, 144);
      ctx.fillStyle = colors[(k * 3 + 1) % colors.length]; ctx.fillRect(x + 4, 12, 88, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x + 14, 20, 50, 6);
      const g = ctx.createLinearGradient(0, 40, 0, 144); g.addColorStop(0, '#5f7d8f'); g.addColorStop(1, '#22313b');
      ctx.fillStyle = g; ctx.fillRect(x + 6, 40, 84, 104);
      ctx.fillStyle = '#d8d6cf'; ctx.fillRect(x + 46, 40, 3, 104);
      ctx.fillStyle = 'rgba(255,240,200,0.25)'; ctx.fillRect(x + 10, 96, 30, 30);
    }
  });
}

/** Tour en brique : une travée de balcons blancs, une travée de brique percée d'une fenêtre (7 m × 3 m). */
function brickFloor(): THREE.CanvasTexture {
  return canvasTexture(224, 96, (ctx) => {
    ctx.fillStyle = '#9b4f35'; ctx.fillRect(0, 0, 224, 96);
    for (let y = 0; y < 96; y += 6) { ctx.fillStyle = 'rgba(60,25,15,0.35)'; ctx.fillRect(0, y, 224, 1); }
    noise(ctx, 224, 96, '230,160,120', 80, 13);
    ctx.fillStyle = '#f3f1ec'; ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#32414e'; ctx.fillRect(8, 8, 80, 60);
    ctx.fillStyle = 'rgba(200,220,230,0.5)'; ctx.fillRect(8, 50, 80, 18);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 68, 96, 28); ctx.fillStyle = '#cfcac0'; ctx.fillRect(0, 68, 96, 2);
    ctx.fillStyle = '#efe9df'; ctx.fillRect(138, 18, 52, 56);
    ctx.fillStyle = '#2f3c47'; ctx.fillRect(143, 23, 42, 46);
    ctx.fillStyle = '#efe9df'; ctx.fillRect(162, 23, 3, 46);
  });
}

/** Tour blanche (3 m × 3 m) : baie sombre, allège blanche. */
function whiteFloor(): THREE.CanvasTexture {
  return canvasTexture(96, 96, (ctx) => {
    ctx.fillStyle = '#f2f0ea'; ctx.fillRect(0, 0, 96, 96); noise(ctx, 96, 96, '120,120,110', 30, 3);
    ctx.fillStyle = '#34424e'; ctx.fillRect(14, 14, 68, 50);
    ctx.fillStyle = 'rgba(210,225,235,0.35)'; ctx.fillRect(14, 14, 68, 12);
    ctx.fillStyle = '#d9d6ce'; ctx.fillRect(10, 64, 76, 6); ctx.fillRect(47, 14, 2, 50);
  });
}

function savannahWall(): THREE.CanvasTexture {
  return canvasTexture(128, 112, (ctx) => {
    ctx.fillStyle = '#f5f4f0'; ctx.fillRect(0, 0, 128, 112); noise(ctx, 128, 112, '120,120,110', 25, 4);
    ctx.fillStyle = '#3a4752'; ctx.fillRect(20, 24, 88, 52);
    ctx.fillStyle = 'rgba(220,230,240,0.35)'; ctx.fillRect(20, 24, 88, 14);
    ctx.fillStyle = '#e1ded6'; ctx.fillRect(62, 24, 4, 52); ctx.fillRect(16, 76, 96, 5);
  });
}

export function textSign(width: number, height: number, background: string, color: string, lines: [string, number][]): THREE.CanvasTexture {
  return canvasTexture(width, height, (ctx) => {
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const total = lines.reduce((s, [, size]) => s + size * 1.25, 0);
    let y = (height - total) / 2;
    for (const [text, size] of lines) { ctx.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`; y += size * 0.625; ctx.fillText(text, width / 2, y); y += size * 0.625; }
  }, false);
}

/** Panneau de la plage : carreaux bleus façon faïence, inscriptions en arabe, français et anglais. */
function beachSign(): THREE.CanvasTexture {
  return canvasTexture(256, 160, (ctx) => {
    ctx.fillStyle = '#1f4f8f'; ctx.fillRect(0, 0, 256, 160);
    for (let x = 0; x < 256; x += 32) for (let y = 0; y < 160; y += 32) { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(x + 0.5, y + 0.5, 32, 32); ctx.beginPath(); ctx.arc(x + 16, y + 16, 9, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(18, 22, 220, 116);
    ctx.fillStyle = '#163f75'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px Arial, sans-serif'; ctx.fillText('شاطئ ريزي عمر', 128, 52);
    ctx.font = 'bold 20px "Trebuchet MS", Arial, sans-serif'; ctx.fillText('PLAGE RIZZI AMOR', 128, 88);
    ctx.font = '16px "Trebuchet MS", Arial, sans-serif'; ctx.fillText('RIZZI AMOR BEACH', 128, 116);
  }, false);
}

export function pavers(base: string, joint: string, size: number, herring: boolean): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, 128, 128); noise(ctx, 128, 128, '40,30,30', 90, size);
    ctx.fillStyle = joint;
    if (herring) {
      for (let y = 0; y < 128; y += 16) { ctx.fillRect(0, y, 128, 2); for (let x = (y / 16) % 2 ? 16 : 0; x < 128; x += 32) ctx.fillRect(x, y, 2, 16); }
    } else {
      for (let y = 0; y < 128; y += size) ctx.fillRect(0, y, 128, 2);
      for (let x = 0; x < 128; x += size) ctx.fillRect(x, 0, 2, 128);
    }
  });
}

// ---------------------------------------------------------------- géométrie

/** Murs d'un contour, UV : u = longueur parcourue / du, v = (y - y0) / dv (étages calés sur y0). */
export function walls(b: MeshBuilder, ring: Ring, y0: number, y1: number, du: number, dv: number, color: THREE.Color, from = y0): void {
  let along = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, an] = ring[i], [bx, bn] = ring[(i + 1) % ring.length];
    const l = Math.hypot(bx - ax, bn - an), u0 = along / du, u1 = (along + l) / du;
    const v = (y: number) => (y - from) / dv;
    const p = b.vertex(ax, y0, -an, color, 0.9, u0, v(y0)), q = b.vertex(bx, y0, -bn, color, 0.9, u1, v(y0));
    const r = b.vertex(bx, y1, -bn, color, 1, u1, v(y1)), s = b.vertex(ax, y1, -an, color, 1, u0, v(y1));
    b.triangle(p, q, r); b.triangle(p, r, s);
    along += l;
  }
}

/** Toit en croupe sur un rectangle (c0→c1 = grand côté), débord `o` ; pyramide si les côtés sont proches. */
export function hipRoof(b: MeshBuilder, ring: Ring, top: number, rise: number, color: THREE.Color, o = 0.6): void {
  const [cx, cn] = ring.reduce(([x, n], [a, c]) => [x + a / 4, n + c / 4], [0, 0]);
  const grow = ring.map(([x, n]) => { const dx = x - cx, dn = n - cn, l = Math.hypot(dx, dn); return [x + (dx / l) * o * 1.41, n + (dn / l) * o * 1.41] as [number, number]; });
  const L = Math.hypot(grow[1][0] - grow[0][0], grow[1][1] - grow[0][1]), W = Math.hypot(grow[2][0] - grow[1][0], grow[2][1] - grow[1][1]);
  const ux = (grow[1][0] - grow[0][0]) / L, un = (grow[1][1] - grow[0][1]) / L;
  const half = Math.max(0, (L - W) / 2);
  const ra: [number, number] = [cx - ux * half, cn - un * half], rb: [number, number] = [cx + ux * half, cn + un * half];
  const v = (x: number, y: number, n: number) => b.vertex(x, y, -n, color, 1, (x + n) / 3, y / 3);
  const c = grow.map(([x, n]) => v(x, top, n)), A = v(ra[0], top + rise, ra[1]), B = v(rb[0], top + rise, rb[1]);
  b.triangle(c[0], c[1], B); b.triangle(c[0], B, A);
  b.triangle(c[2], c[3], A); b.triangle(c[2], A, B);
  b.triangle(c[3], c[0], A); b.triangle(c[1], c[2], B);
}

/** Poutre entre deux points de l'espace (section carrée t). */
export function beam(b: MeshBuilder, p: [number, number, number], q: [number, number, number], t: number, color: THREE.Color): void {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const up = Math.abs(d.y) > 0.9 * d.length() ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const s1 = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(t / 2);
  const s2 = new THREE.Vector3().crossVectors(d, s1).normalize().multiplyScalar(t / 2);
  const corners = [s1.clone().add(s2), s1.clone().sub(s2), s1.clone().negate().sub(s2), s1.clone().negate().add(s2)];
  const ids = [p, q].map((e) => corners.map((c) => b.vertex(e[0] + c.x, e[1] + c.y, e[2] + c.z, color)));
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; b.triangle(ids[0][i], ids[0][j], ids[1][j]); b.triangle(ids[0][i], ids[1][j], ids[1][i]); }
}

/** Lampadaire de la corniche : mât sombre, un ou deux bras courbes, lanternes. side : direction du bras (x, z). */
function lamp(b: MeshBuilder, x: number, y: number, z: number, arms: [number, number][]): void {
  boxAt(b, x, z, 0.36, 0.36, y - 0.2, y + 0.9, POLE);
  boxAt(b, x, z, 0.16, 0.16, y + 0.9, y + 9.2, POLE);
  for (const [dx, dz] of arms) {
    let prev: [number, number, number] = [x, y + 8.6, z];
    for (let k = 1; k <= 5; k++) {
      const t = k / 5, r = 2.3 * t, h = y + 8.6 + Math.sin(t * Math.PI * 0.85) * 0.75;
      const next: [number, number, number] = [x + dx * r, h, z + dz * r];
      beam(b, prev, next, 0.1, POLE); prev = next;
    }
    boxAt(b, prev[0], prev[2], 0.7, 0.32, prev[1] - 0.22, prev[1] + 0.02, POLE);
    boxAt(b, prev[0], prev[2], 0.56, 0.22, prev[1] - 0.26, prev[1] - 0.2, new THREE.Color(0xfff2c4));
  }
}

export function inRing(ring: Ring, x: number, n: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, an] = ring[i], [bx, bn] = ring[j];
    if ((an > n) !== (bn > n) && x < ((bx - ax) * (n - an)) / (bn - an) + ax) hit = !hit;
  }
  return hit;
}

export function grownRing(ring: Ring, d: number): Ring {
  const [cx, cn] = ring.reduce(([x, n], [a, c]) => [x + a / ring.length, n + c / ring.length], [0, 0]);
  return ring.map(([x, n]) => { const dx = x - cx, dn = n - cn, l = Math.hypot(dx, dn) || 1; return [x + (dx / l) * d, n + (dn / l) * d] as [number, number]; });
}

/** Points d'une ligne tous les `step` mètres : position, direction (vers le nord) et normale est. */
export function samples(line: Ring, step: number, from = 0): { x: number; n: number; tx: number; tn: number }[] {
  const out: { x: number; n: number; tx: number; tn: number }[] = [];
  let carry = from;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, an] = line[i], [bx, bn] = line[i + 1], l = Math.hypot(bx - ax, bn - an), tx = (bx - ax) / l, tn = (bn - an) / l;
    for (let s = carry; s < l; s += step) out.push({ x: ax + tx * s, n: an + tn * s, tx, tn });
    carry = carry + Math.ceil(Math.max(0, l - carry) / step) * step - l;
  }
  return out;
}

export const distToLine = (line: Ring, x: number, n: number): number => {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, an] = line[i], [bx, bn] = line[i + 1], dx = bx - ax, dn = bn - an, L = dx * dx + dn * dn;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / L));
    best = Math.min(best, Math.hypot(x - ax - dx * t, n - an - dn * t));
  }
  return best;
};

/** Pas de lampadaire générique sur la corniche : ceux de ce module les remplacent. */
export function chapuisHasOwnLamps(x: number, n: number): boolean {
  if (x < 40 || x > 260 || n < 3270 || n > 3770) return false;
  return distToLine(EAST_A, x, n) < 16 || distToLine(EAST_B, x, n) < 18;
}

/**
 * Villas blanches côté ouest (vidéo : murs blancs, deux étages, grilles vertes), au nord du carrefour.
 * Hauteur ramenée à 10 m au plus : OSM n'a pas d'étages ici (hauteurs estimées par défaut), la vidéo montre R+2.
 */
export function restyleChapuis(data: WorldData): void {
  for (const b of data.buildings) {
    let cx = 0, cn = 0;
    const count = b.p.length / 2;
    for (let i = 0; i < count; i++) { cx += b.p[i * 2] / count; cn += b.p[i * 2 + 1] / count; }
    if (cn < 3568 || cn > 3735 || distToLine(WEST_B, cx, cn) > 42) continue;
    if (CHAPUIS_REPLACED.some(([x, n]) => Math.hypot(cx - x, cn - n) < 4)) continue;
    if (b.h > 13 || (b.t !== 'house' && b.t !== 'apartment')) continue;
    b.t = 'house'; b.h = Math.min(b.h, 10); b.c = 0xf4f1ea;
  }
}

export interface ChapuisEdits {
  ground: (x: number, z: number) => number | null;
  keepTree: (x: number, n: number) => boolean;
  trees: [string, number, number, number][];
}

export function buildChapuis(scene: THREE.Scene, data: WorldData, ground: Ground, collider: Collider): ChapuisEdits {
  const meshes: [MeshBuilder, THREE.Material, boolean][] = [];
  const builder = (material: THREE.Material, shadow = true) => { const b = new MeshBuilder(); meshes.push([b, material, shadow]); return b; };
  const mat = (map?: THREE.Texture) => new THREE.MeshLambertMaterial(map ? { vertexColors: true, map, side: THREE.DoubleSide } : { vertexColors: true, side: THREE.DoubleSide });
  const plain = builder(mat());
  const range = (ring: Ring): [number, number] => { const g = ring.map(([x, n]) => ground(x, -n)); return [Math.min(...g), Math.max(...g)]; };
  const solid = (ring: Ring, top: number) => collider.addBuilding(ring.flat(), -Infinity, Infinity, { y: top });

  // --- Hôtel jaune.
  const floorTex = hotelFloor(), crownTex = hotelCrown(), arcadeTex = hotelArcade(), tilesTex = roofTiles();
  const towerWalls = builder(mat(floorTex)), crownWalls = builder(mat(crownTex)), arcadeWalls = builder(mat(arcadeTex)), tiles = builder(mat(tilesTex));
  {
    const ring = RINGS.hotelTower, [low, base] = range(ring), top = base + 45;
    walls(arcadeWalls, ring, low - 0.4, base + 7, 4, 3.5, WHITE, base);
    walls(towerWalls, ring, base + 7, top - 3, 4, 3, WHITE, base + 7);
    walls(crownWalls, ring, top - 3, top + 0.9, 4, 3.9, WHITE, top - 3);
    cap(plain, ring, top, new THREE.Color(0xcab27e));
    // Corniche saillante sous le couronnement.
    walls(plain, grownRing(ring, 0.5), top - 3.3, top - 3, 1, 1, new THREE.Color(0xfbf6ea));
    solid(ring, top);
  }
  for (const [ring, h, rise] of [[RINGS.hotelWing, 10.5, 2.6], [RINGS.hotelPavS, 13, 3.4], [RINGS.hotelPavN, 13, 3.4]] as [Ring, number, number][]) {
    const [low, base] = range(ring), top = base + h;
    walls(arcadeWalls, ring, low - 0.4, top, 4, 3.5, WHITE, base);
    walls(plain, grownRing(ring, 0.35), top - 0.35, top, 1, 1, new THREE.Color(0xfbf6ea));
    hipRoof(tiles, ring, top, rise, WHITE);
    collider.addBuilding(ring.flat(), -Infinity, Infinity, { y: top });
  }
  {
    const ring = RINGS.hotelBack, [low, base] = range(ring), top = base + 7;
    walls(arcadeWalls, ring, low - 0.4, top, 4, 3.5, WHITE, base);
    cap(plain, ring, top, new THREE.Color(0xd8c08a));
    solid(ring, top);
  }
  // Clôture : muret ocre et barreaux noirs devant l'hôtel, portail au milieu.
  {
    const fence = builder(new THREE.MeshLambertMaterial({ map: canvasTexture(64, 64, (ctx) => { ctx.clearRect(0, 0, 64, 64); ctx.fillStyle = '#1b1c1e'; for (let x = 2; x < 64; x += 8) ctx.fillRect(x, 0, 3, 64); ctx.fillRect(0, 0, 64, 5); }), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true }), false);
    for (let u = -2; u < 47; u += 2) {
      if (u > 20 && u < 25) continue; // entrée
      const [ax, an] = at(HOTEL_ORIGIN, u, 1.4), [bx, bn] = at(HOTEL_ORIGIN, u + 2, 1.4);
      const ga = ground(ax, -an) + 0.12, gb = ground(bx, -bn) + 0.12;
      boxAt(plain, (ax + bx) / 2, -(an + bn) / 2, 0.3, 2.05, Math.min(ga, gb) - 0.2, Math.max(ga, gb) + 0.6, OCHRE, Math.atan2(-(bn - an), bx - ax) + Math.PI / 2);
      const p = fence.vertex(ax, ga + 0.6, -an, WHITE, 1, 0, 0), q = fence.vertex(bx, gb + 0.6, -bn, WHITE, 1, 2, 0);
      const r = fence.vertex(bx, gb + 1.8, -bn, WHITE, 1, 2, 1), s = fence.vertex(ax, ga + 1.8, -an, WHITE, 1, 0, 1);
      fence.triangle(p, q, r); fence.triangle(p, r, s);
      collider.addBuilding([ax + V[0] * 0.2, an + V[1] * 0.2, bx + V[0] * 0.2, bn + V[1] * 0.2, bx - V[0] * 0.2, bn - V[1] * 0.2, ax - V[0] * 0.2, an - V[1] * 0.2]);
    }
  }

  // --- Tour ronde blanche.
  const bandTex = bandFloor(), shopTex = shopFront();
  {
    const ring = RINGS.roundTower, [low, base] = range(ring), top = base + 4.8 + 13 * 3.05;
    walls(builder(mat(shopTex)), ring, low - 0.4, base + 4.8, 6, 4.8, WHITE, base);
    walls(builder(mat(bandTex)), ring, base + 4.8, top, 3, 3.05, WHITE, base + 4.8);
    walls(plain, ring, top, top + 1.3, 1, 1, CREAM);
    walls(plain, grownRing(ring, 0.6), base + 4.5, base + 4.9, 1, 1, CREAM); // auvent au-dessus des vitrines
    cap(plain, ring, top, new THREE.Color(0xbdb8ae));
    solid(ring, top);
  }

  // --- Bout de la corniche : Savannah, Machawi La Marina, tours blanche et en brique.
  {
    const wallTex = savannahWall();
    const ring = RINGS.savannah, [low, base] = range(ring), top = base + 10.5;
    walls(builder(mat(wallTex)), ring, low - 0.4, top, 4, 3.5, WHITE, base);
    cap(plain, ring, top, new THREE.Color(0xdedbd3));
    // Cadre d'acier rouge au-dessus du toit (vidéo) : poteaux, lisses et croix.
    const steel = builder(mat()), [x0, n0] = ring[0], [x1, n1] = ring[2], h = 3.6;
    const corners: [number, number][] = [[x0, n0], [x1, n0], [x1, n1], [x0, n1]];
    for (let i = 0; i < 4; i++) {
      const [ax, an] = corners[i], [bx, bn] = corners[(i + 1) % 4];
      beam(steel, [ax, top, -an], [ax, top + h, -an], 0.3, STEEL);
      beam(steel, [ax, top + h, -an], [bx, top + h, -bn], 0.3, STEEL);
      beam(steel, [ax, top + h * 0.5, -an], [bx, top + h * 0.5, -bn], 0.18, STEEL);
      beam(steel, [ax, top, -an], [bx, top + h, -bn], 0.12, STEEL);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.4), new THREE.MeshLambertMaterial({ map: textSign(512, 96, '#ffffff', '#c9222b', [['SAVANNAH', 70]]) }));
    sign.position.set((x0 + x1) / 2, top - 2.3, -(n0 - 0.08));
    scene.add(sign);
    solid(ring, top);

    const m = RINGS.machawi, [mlow, mbase] = range(m), mtop = mbase + 5;
    walls(builder(mat(wallTex)), m, mlow - 0.4, mtop, 4, 3.5, WHITE, mbase - 1.5);
    cap(plain, m, mtop, new THREE.Color(0xdedbd3));
    const band = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.3), new THREE.MeshLambertMaterial({ map: textSign(512, 48, '#4b2a6b', '#ffffff', [['MACHAWI LA MARINA', 32]]) }));
    band.position.set((m[0][0] + m[2][0]) / 2, mtop - 1, -(m[0][1] - 0.08));
    scene.add(band);
    solid(m, mtop);

    const white = RINGS.whiteTower, [wlow, wbase] = range(white), wtop = wbase + 48;
    walls(builder(mat(shopFront())), white, wlow - 0.4, wbase + 4.8, 6, 4.8, WHITE, wbase);
    walls(builder(mat(whiteFloor())), white, wbase + 4.8, wtop, 3, 3, WHITE, wbase + 4.8);
    walls(plain, white, wtop, wtop + 1.2, 1, 1, CREAM);
    cap(plain, white, wtop, new THREE.Color(0xc4bfb5));
    solid(white, wtop);

    const brick = RINGS.brickTower, [blow, bbase] = range(brick), btop = bbase + 57;
    walls(builder(mat(brickFloor())), brick, blow - 0.4, btop, 7, 3, WHITE, bbase);
    walls(plain, brick, btop, btop + 1.4, 1, 1, new THREE.Color(0x8c4630));
    cap(plain, brick, btop, new THREE.Color(0x9e9a92));
    solid(brick, btop);
  }

  // --- Promenade côté mer : bande de briques rouges le long de la bordure, puis pavés gris, muret côté sable.
  const brickMat = new THREE.MeshLambertMaterial({ map: pavers('#8e4038', 'rgba(55,20,15,0.6)', 16, true), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const greyMat = new THREE.MeshLambertMaterial({ map: pavers('#9b9a96', 'rgba(50,50,50,0.45)', 21, false), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const redPath = new MeshBuilder(), greyPath = new MeshBuilder();
  const land = data.land;
  const onLand = (x: number, n: number) => land.some((p) => { let hit = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > n) !== (p[j + 1] > n) && x < ((p[j] - p[i]) * (n - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) hit = !hit; return hit; });
  type Cut = { x: number; n: number; ex: number; en: number; y: number; half: number };
  const cuts: Cut[][] = [];
  for (const [line, half] of [[EAST_A, HALF_A], [EAST_B, HALF_B]] as [Ring, number][]) {
    const list: Cut[] = [];
    for (const s of samples(line, 3)) {
      if (s.n < 3300) continue;
      const ex = s.tn, en = -s.tx; // normale vers l'est (la mer)
      const width = s.n > 3700 ? PROMENADE - (s.n - 3700) / 50 * 3 : PROMENADE;
      if (!onLand(s.x + ex * (half + width), s.n + en * (half + width))) continue;
      list.push({ x: s.x, n: s.n, ex, en, y: ground(s.x + ex * half, -(s.n + en * half)) + 0.17, half });
    }
    cuts.push(list);
  }
  const strip = (b: MeshBuilder, list: Cut[], d0: number, d1: number) => {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], c = list[i + 1];
      if (Math.hypot(c.x - a.x, c.n - a.n) > 4.5) continue; // coupure (mer)
      const pt = (k: Cut, d: number) => [k.x + k.ex * (k.half + d), k.n + k.en * (k.half + d)];
      const q = [pt(a, d0), pt(a, d1), pt(c, d1), pt(c, d0)];
      const y = [a.y, a.y, c.y, c.y];
      const ids = q.map(([x, n], k) => b.vertex(x, y[k], -n, WHITE, 1, x / 2.5, n / 2.5));
      b.triangle(ids[0], ids[1], ids[2]); b.triangle(ids[0], ids[2], ids[3]);
    }
  };
  const width = (k: Cut) => (k.n > 3700 ? PROMENADE - (k.n - 3700) / 50 * 3 : PROMENADE);
  for (const list of cuts) {
    strip(redPath, list, 0, 2.6);
    strip(greyPath, list, 2.6, 6.8);
    // Grise jusqu'au muret, dont la largeur varie au bout nord.
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], c = list[i + 1];
      if (Math.hypot(c.x - a.x, c.n - a.n) > 4.5) continue;
      const pa = (d: number) => [a.x + a.ex * (a.half + d), a.n + a.en * (a.half + d)], pc = (d: number) => [c.x + c.ex * (c.half + d), c.n + c.en * (c.half + d)];
      const q = [pa(6.8), pa(width(a)), pc(width(c)), pc(6.8)], y = [a.y, a.y, c.y, c.y];
      const ids = q.map(([x, n], k) => greyPath.vertex(x, y[k], -n, WHITE, 1, x / 2.5, n / 2.5));
      greyPath.triangle(ids[0], ids[1], ids[2]); greyPath.triangle(ids[0], ids[2], ids[3]);
      // Muret côté plage (0,55 m) et son parement jusqu'au sable.
      const [ox, on] = pa(width(a)), [px, pn] = pc(width(c));
      const sa = ground(ox, -on), sc = ground(px, -pn);
      const w0 = plain.vertex(ox, Math.min(sa, a.y) - 0.6, -on, CONCRETE, 0.8), w1 = plain.vertex(px, Math.min(sc, c.y) - 0.6, -pn, CONCRETE, 0.8);
      const w2 = plain.vertex(px, c.y + 0.55, -pn, CONCRETE), w3 = plain.vertex(ox, a.y + 0.55, -on, CONCRETE);
      plain.triangle(w0, w1, w2); plain.triangle(w0, w2, w3);
      const [ix, inn] = pa(width(a) - 0.4), [jx, jn] = pc(width(c) - 0.4);
      const t0 = plain.vertex(ix, a.y + 0.55, -inn, CONCRETE), t1 = plain.vertex(jx, c.y + 0.55, -jn, CONCRETE);
      const b0 = plain.vertex(ix, a.y, -inn, CONCRETE, 0.85), b1 = plain.vertex(jx, c.y, -jn, CONCRETE, 0.85);
      plain.triangle(w3, w2, t1); plain.triangle(w3, t1, t0); plain.triangle(t0, t1, b1); plain.triangle(t0, b1, b0);
    }
  }
  for (const [b, m] of [[redPath, brickMat], [greyPath, greyMat]] as [MeshBuilder, THREE.Material][]) {
    const mesh = new THREE.Mesh(b.build(), m);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // --- Palmiers, lampadaires, corbeilles, panneau de la plage.
  const trees: [string, number, number, number][] = [];
  const posts = builder(mat());
  let index = 0;
  for (const list of cuts) for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (i % 8 === 4) trees.push([index++ % 3 === 1 ? 'palm_plain' : 'palm', k.x + k.ex * (k.half + 5.2), k.n + k.en * (k.half + 5.2), 1.05 + (index % 4) * 0.07]);
    if (i % 10 === 0) { // lampadaire au bord de la bordure, bras vers la chaussée
      const x = k.x + k.ex * (k.half + 0.7), n = k.n + k.en * (k.half + 0.7);
      lamp(posts, x, k.y, -n, [[-k.ex, k.en]]);
      collider.addBuilding([x - 0.2, n - 0.2, x + 0.2, n - 0.2, x + 0.2, n + 0.2, x - 0.2, n + 0.2]);
    }
    if (i % 15 === 7) { // corbeille noire
      const x = k.x + k.ex * (k.half + 1.5), n = k.n + k.en * (k.half + 1.5);
      boxAt(posts, x, -n, 0.55, 0.55, k.y, k.y + 0.95, BLACK);
      boxAt(posts, x, -n, 0.62, 0.62, k.y + 0.88, k.y + 0.98, new THREE.Color(0x3a3d42));
    }
  }
  // Terre-plein central (au sud du carrefour) : lampadaires à deux bras.
  for (const s of samples(EAST_A, 30, 12)) {
    if (s.n < 3300 || s.n > 3488) continue;
    let best = Infinity, wx = 0, wn = 0;
    for (const [x, n] of WEST_A) { const d = Math.hypot(x - s.x, n - s.n); if (d < best) { best = d; wx = x; wn = n; } }
    const ex = s.tn, en = -s.tx, gap = (s.x - wx) * ex + (s.n - wn) * en;
    const x = s.x - ex * (gap / 2), n = s.n - en * (gap / 2);
    lamp(posts, x, ground(x, -n) + 0.12, -n, [[ex, -en], [-ex, en]]);
    collider.addBuilding([x - 0.2, n - 0.2, x + 0.2, n - 0.2, x + 0.2, n + 0.2, x - 0.2, n + 0.2]);
  }
  // Trottoir ouest au nord du carrefour : un bras vers la chaussée.
  for (const s of samples(WEST_B, 30, 6)) {
    const ex = s.tn, en = -s.tx;
    const x = s.x - ex * (HALF_B + 1.2), n = s.n - en * (HALF_B + 1.2);
    if (collider.inside(x, -n)) continue;
    lamp(posts, x, ground(x, -n) + 0.12, -n, [[ex, -en]]);
    collider.addBuilding([x - 0.2, n - 0.2, x + 0.2, n - 0.2, x + 0.2, n + 0.2, x - 0.2, n + 0.2]);
  }
  {
    const k = cuts[0].find((c) => c.n > 3343) ?? cuts[0][0];
    const x = k.x + k.ex * (k.half + 4.2), n = k.n + k.en * (k.half + 4.2);
    boxAt(plain, x, -n, 2.6, 0.5, k.y, k.y + 0.8, new THREE.Color(0xf4f2ec), Math.atan2(-k.ex, -k.en));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshLambertMaterial({ map: beachSign(), side: THREE.DoubleSide }));
    panel.position.set(x, k.y + 1.6, -n);
    panel.rotation.y = Math.atan2(-k.ex, k.en); // face à la chaussée (ouest)
    scene.add(panel);
    collider.addBuilding([x - 1.2, n - 0.4, x + 1.2, n - 0.4, x + 1.2, n + 0.4, x - 1.2, n + 0.4]);
  }

  // --- Murets blancs à grille verte devant les villas (ouest), coupés aux rues transversales et devant les bâtiments.
  const others = data.roads.filter((r) => r.n !== 'Boulevard Rizzi Amor' && r.k !== 'footway' && r.k !== 'path' && r.k !== 'steps');
  const nearRoad = (x: number, n: number) => others.some((r) => {
    for (let i = 0; i + 2 < r.p.length; i += 2) {
      const ax = r.p[i], an = r.p[i + 1], bx = r.p[i + 2], bn = r.p[i + 3];
      if (Math.max(ax, bx) < x - 20 || Math.min(ax, bx) > x + 20 || Math.max(an, bn) < n - 20 || Math.min(an, bn) > n + 20) continue;
      const dx = bx - ax, dn = bn - an, L = dx * dx + dn * dn, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / L)) : 0;
      if (Math.hypot(x - ax - dx * t, n - an - dn * t) < r.w / 2 + 3) return true;
    }
    return false;
  });
  const rail = builder(new THREE.MeshLambertMaterial({ map: canvasTexture(64, 64, (ctx) => { ctx.clearRect(0, 0, 64, 64); ctx.fillStyle = '#2f7d4f'; for (let x = 2; x < 64; x += 8) ctx.fillRect(x, 0, 3, 64); ctx.fillRect(0, 0, 64, 6); ctx.fillRect(0, 58, 64, 6); }), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), false);
  const wallPts = samples(WEST_B, 2).filter((s) => s.n > 3572 && s.n < 3732);
  for (let i = 0; i + 1 < wallPts.length; i++) {
    const s = wallPts[i], t = wallPts[i + 1], off = HALF_B + 2.2;
    const ax = s.x - s.tn * off, an = s.n + s.tx * off, bx = t.x - t.tn * off, bn = t.n + t.tx * off;
    if (nearRoad((ax + bx) / 2, (an + bn) / 2) || collider.inside(ax, -an) || collider.inside(bx, -bn)) continue;
    const ga = ground(ax, -an) + 0.12, gb = ground(bx, -bn) + 0.12;
    boxAt(plain, (ax + bx) / 2, -(an + bn) / 2, 0.3, Math.hypot(bx - ax, bn - an) + 0.05, Math.min(ga, gb) - 0.3, Math.max(ga, gb) + 1.0, CREAM, Math.atan2(-(bn - an), bx - ax) + Math.PI / 2);
    const p = rail.vertex(ax, ga + 1.0, -an, WHITE, 1, 0, 0), q = rail.vertex(bx, gb + 1.0, -bn, WHITE, 1, 2, 0);
    const r = rail.vertex(bx, gb + 1.9, -bn, WHITE, 1, 2, 1), v = rail.vertex(ax, ga + 1.9, -an, WHITE, 1, 0, 1);
    rail.triangle(p, q, r); rail.triangle(p, r, v);
    collider.addBuilding([ax - 0.15, an - 0.15, bx + 0.15, bn - 0.15, bx + 0.15, bn + 0.15, ax - 0.15, an + 0.15]);
  }

  for (const [b, material, shadow] of meshes) {
    const mesh = new THREE.Mesh(b.build(), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Sol praticable de la promenade (même hauteur que le dallage).
  const promenadeGround = (x: number, z: number): number | null => {
    const n = -z;
    if (x < 70 || x > 270 || n < 3295 || n > 3752) return null;
    for (const list of cuts) for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], c = list[i + 1];
      if (Math.abs(a.n - n) > 6 && Math.abs(c.n - n) > 6) continue;
      const tx = c.x - a.x, tn = c.n - a.n, L = tx * tx + tn * tn;
      if (L > 25) continue;
      const t = ((x - a.x) * tx + (n - a.n) * tn) / L;
      if (t < 0 || t > 1) continue;
      const d = (x - a.x) * a.ex + (n - a.n) * a.en - a.half;
      if (d < 0 || d > width(a) - 0.4) continue;
      return a.y + (c.y - a.y) * t;
    }
    return null;
  };

  const blocked = Object.values(RINGS).map((r) => grownRing(r, 3));
  return {
    ground: promenadeGround,
    keepTree: (x, n) => !blocked.some((r) => inRing(r, x, n)) && promenadeGround(x, -n) === null,
    trees,
  };
}
