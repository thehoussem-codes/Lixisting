import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { Collider } from '../world/Collider';
import { MeshBuilder } from '../world/MeshBuilder';
import type { Water } from '../world/Water';

/**
 * Bateau à moteur (open de 6,2 m, moteur hors-bord) que le joueur peut piloter.
 * - Coque en V modélisée section par section (blanc, liseré coloré, antifouling rouge sous la flottaison),
 *   pont clair, console avec pare-brise, sièges, banquette arrière, moteur hors-bord.
 * - Flottaison : la hauteur de l'eau est lue sous l'étrave, la poupe et les deux bords (même houle que la mer
 *   affichée) ; le bateau suit avec des ressorts amortis (pilonnement, tangage, roulis). En vitesse il se cabre
 *   (déjauge) et s'incline dans les virages ; il glisse un peu de côté.
 * - Il ne monte pas sur la plage (profondeur < 0,9 m) et heurte les pieux du ponton.
 */

const LENGTH = 6.2, BEAM = 2.3;
const MAX_SPEED = 28, MAX_REVERSE = 4;
const GRAVITY = 9.81;
const SPRAY = 420;

function hull(color: THREE.Color, stripe: THREE.Color): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const red = new THREE.Color(0x9e2a22), deck = new THREE.Color(0xd9d2c3), seat = new THREE.Color(0xece6d8), dark = new THREE.Color(0x1d1f22);
  const quad = (p: number[][], c: THREE.Color, shade = 1) => {
    const ids = p.map(([u, y, v]) => b.vertex(u, y, v, c, shade));
    b.triangle(ids[0], ids[1], ids[2]); b.triangle(ids[0], ids[2], ids[3]);
  };
  // Sections de l'arrière (u = -3,0) à l'étrave (u = +3,2) : demi-largeur, quille, bouchain, plat-bord.
  const stations: { u: number; half: number; keel: number; chine: number; gunwale: number }[] = [];
  for (let k = 0; k <= 12; k++) {
    const u = -3.0 + (6.2 * k) / 12, t = Math.max(0, (u - 0.6) / 2.6);
    const half = (BEAM / 2) * Math.sqrt(Math.max(0, 1 - t * t));
    const keel = -0.45 + 0.55 * t * t;
    stations.push({ u, half, keel, chine: keel + 0.38 * (half / (BEAM / 2)), gunwale: 0.55 + 0.12 * t });
  }
  // Point du bordé à la hauteur y (évasé : 82 % de la largeur au bouchain, 100 % au plat-bord).
  const sideAt = (s: (typeof stations)[number], y: number) => {
    const yy = Math.max(s.chine, Math.min(s.gunwale, y));
    const f = s.gunwale > s.chine ? (yy - s.chine) / (s.gunwale - s.chine) : 1;
    return [s.u, yy, s.half * (0.82 + 0.18 * f)];
  };
  // Bandes du bordé : antifouling rouge sous la flottaison, coque, liseré coloré, coque.
  const bands: [number, number, THREE.Color][] = [[-9, 0.15, red], [0.15, 0.36, color], [0.36, 0.48, stripe], [0.48, 9, color]];
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i], c = stations[i + 1];
    for (const side of [-1, 1]) {
      const m = (p: number[]) => [p[0], p[1], p[2] * side];
      for (const [lo, hi, col] of bands) {
        const p = [sideAt(a, lo), sideAt(c, lo), sideAt(c, hi), sideAt(a, hi)];
        if (Math.abs(p[3][1] - p[0][1]) + Math.abs(p[2][1] - p[1][1]) < 1e-3) continue;
        quad(p.map(m), col);
      }
      // Carène en V : de la quille au bouchain.
      quad([[a.u, a.keel, 0], [c.u, c.keel, 0], [c.u, c.chine, c.half * 0.82 * side], [a.u, a.chine, a.half * 0.82 * side]], red, 0.8);
      // Plat-bord (liston).
      quad([[a.u, a.gunwale + 0.02, a.half * side], [c.u, c.gunwale + 0.02, c.half * side], [c.u, c.gunwale + 0.02, c.half * 0.88 * side], [a.u, a.gunwale + 0.02, a.half * 0.88 * side]], color, 1.05);
    }
    // Pont, un peu sous le plat-bord.
    quad([[a.u, a.gunwale - 0.12, -a.half * 0.88], [c.u, c.gunwale - 0.12, -c.half * 0.88], [c.u, c.gunwale - 0.12, c.half * 0.88], [a.u, a.gunwale - 0.12, a.half * 0.88]], deck);
    // Pavois intérieur (entre le pont et le plat-bord).
    for (const side of [-1, 1]) quad([[a.u, a.gunwale - 0.12, a.half * 0.88 * side], [c.u, c.gunwale - 0.12, c.half * 0.88 * side], [c.u, c.gunwale + 0.02, c.half * 0.88 * side], [a.u, a.gunwale + 0.02, a.half * 0.88 * side]], color, 0.9);
  }
  // Tableau arrière.
  const s0 = stations[0];
  const back = [[s0.u, s0.gunwale, -s0.half], sideAt(s0, s0.chine).map((v, k) => (k === 2 ? -v : v)), [s0.u, s0.keel, 0], sideAt(s0, s0.chine), [s0.u, s0.gunwale, s0.half]];
  const ids = back.map(([u, y, v]) => b.vertex(u, y, v, color, 0.85));
  for (let j = 1; j + 1 < ids.length; j++) b.triangle(ids[0], ids[j], ids[j + 1]);
  /** Bloc à quatre côtés : coins du bas (u, v) à y0, coins du haut à y1 (permet les formes effilées). */
  const prism = (bottom: number[][], y0: number, top: number[][], y1: number, c: THREE.Color, topShade = 1.05) => {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad([[bottom[i][0], y0, bottom[i][1]], [bottom[j][0], y0, bottom[j][1]], [top[j][0], y1, top[j][1]], [top[i][0], y1, top[i][1]]], c, 0.88);
    }
    quad(top.map(([u, v]) => [u, y1, v]), c, topShade);
    quad(bottom.map(([u, v]) => [u, y0, v]), c, 0.7);
  };
  const rect = (u0: number, u1: number, v0: number, v1: number) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const box = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, c: THREE.Color) => prism(rect(u0, u1, v0, v1), y0, rect(u0, u1, v0, v1), y1, c);
  /** Tube fin d'un point à un autre (main courante, chandeliers). */
  const tube = (a: number[], c2: number[], r: number, col: THREE.Color) => {
    const d = new THREE.Vector3(c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]).normalize();
    const p1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize().multiplyScalar(r);
    const p2 = new THREE.Vector3().crossVectors(d, p1).normalize().multiplyScalar(r);
    const off = [p1, p2, p1.clone().negate(), p2.clone().negate()];
    for (let i = 0; i < 4; i++) {
      const o = off[i], q = off[(i + 1) % 4];
      quad([[a[0] + o.x, a[1] + o.y, a[2] + o.z], [c2[0] + o.x, c2[1] + o.y, c2[2] + o.z], [c2[0] + q.x, c2[1] + q.y, c2[2] + q.z], [a[0] + q.x, a[1] + q.y, a[2] + q.z]], col);
    }
  };
  const steel = new THREE.Color(0xc9ced3), cowl = new THREE.Color(0x8d939a), rub = new THREE.Color(0x2a2c2f);
  // Liston (bourrelet sombre) le long du plat-bord.
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i], c = stations[i + 1];
    for (const side of [-1, 1]) quad([[a.u, a.gunwale - 0.07, a.half * 1.025 * side], [c.u, c.gunwale - 0.07, c.half * 1.025 * side], [c.u, c.gunwale + 0.02, c.half * 1.025 * side], [a.u, a.gunwale + 0.02, a.half * 1.025 * side]], rub);
  }
  // Console de pilotage centrale, décalée à tribord, au sommet incliné vers le pilote.
  prism(rect(-0.15, 0.6, 0.0, 0.75), 0.43, rect(-0.1, 0.42, 0.04, 0.71), 1.05, color);
  box(-0.1, 0.12, 0.08, 0.67, 1.05, 1.08, dark);                         // tableau de bord
  // Volant (octogone sombre) face au pilote.
  const wheel = Array.from({ length: 8 }, (_, k) => [-0.14, 1.0 + 0.15 * Math.cos((k * Math.PI) / 4), 0.35 + 0.15 * Math.sin((k * Math.PI) / 4)]);
  const hub = b.vertex(-0.14, 1.0, 0.35, dark);
  const rim = wheel.map(([u, y, v]) => b.vertex(u, y, v, dark));
  for (let k = 0; k < 8; k++) b.triangle(hub, rim[k], rim[(k + 1) % 8]);
  // Poste de pilotage (siège-appui) et siège passager à bâbord.
  for (const [v0, v1] of [[0.1, 0.6], [-0.62, -0.12]]) {
    box(-0.95, -0.58, v0, v1, 0.43, 0.82, color);
    box(-0.98, -0.52, v0 - 0.04, v1 + 0.04, 0.82, 0.94, seat);
    box(-1.02, -0.92, v0 - 0.04, v1 + 0.04, 0.94, 1.28, seat);
  }
  // Banquette arrière avec dossier, coffre et plateforme avant avec coussins.
  box(-2.78, -2.2, -0.88, 0.88, 0.43, 0.66, color);
  box(-2.8, -2.18, -0.86, 0.86, 0.66, 0.78, seat);
  box(-2.95, -2.8, -0.86, 0.86, 0.6, 1.02, seat);
  prism([[1.25, -0.8], [2.55, -0.42], [2.55, 0.42], [1.25, 0.8]], 0.43, [[1.25, -0.8], [2.55, -0.42], [2.55, 0.42], [1.25, 0.8]], 0.62, color);
  prism([[1.32, -0.7], [2.45, -0.36], [2.45, 0.36], [1.32, 0.7]], 0.62, [[1.32, -0.7], [2.45, -0.36], [2.45, 0.36], [1.32, 0.7]], 0.7, seat);
  // Balcon avant en inox : chandeliers et main courante qui se rejoignent à l'étrave.
  const railAt = (u: number) => { const t = Math.max(0, (u - 0.6) / 2.6); return [(BEAM / 2) * Math.sqrt(Math.max(0, 1 - t * t)) * 0.9, 0.55 + 0.12 * t + 0.02]; };
  for (const side of [-1, 1]) {
    const us = [0.9, 1.6, 2.25, 2.8];
    const top = us.map((u) => { const [h, g] = railAt(u); return [u, g + 0.42, h * side]; });
    us.forEach((u, k) => { const [h, g] = railAt(u); tube([u, g, h * side], top[k], 0.014, steel); });
    for (let k = 0; k + 1 < top.length; k++) tube(top[k], top[k + 1], 0.016, steel);
    tube(top[top.length - 1], [3.12, 0.69 + 0.4, 0], 0.016, steel);
  }
  tube([3.12, 0.69, 0], [3.12, 1.09, 0], 0.014, steel);
  // Moteur hors-bord : capot gris effilé, embase et arbre sombres, plaque anti-cavitation, pied sous l'eau.
  box(-3.12, -3.0, -0.18, 0.18, 0.3, 0.62, dark);                        // chaise de fixation sur le tableau
  prism(rect(-3.58, -3.08, -0.21, 0.21), 0.62, rect(-3.52, -3.16, -0.17, 0.17), 1.28, cowl);
  prism(rect(-3.52, -3.16, -0.17, 0.17), 1.28, rect(-3.46, -3.22, -0.12, 0.12), 1.36, cowl);
  prism(rect(-3.5, -3.08, -0.19, 0.19), 0.3, rect(-3.58, -3.08, -0.21, 0.21), 0.62, rub);
  box(-3.44, -3.22, -0.07, 0.07, -0.5, 0.3, rub);
  box(-3.6, -3.12, -0.17, 0.17, -0.44, -0.4, rub);
  prism(rect(-3.6, -3.14, -0.065, 0.065), -0.62, rect(-3.56, -3.18, -0.06, 0.06), -0.5, rub);
  box(-3.5, -3.3, -0.015, 0.015, -0.78, -0.62, rub);
  return b.build();
}

/** Pare-brise teinté, incliné, au-dessus de la console. */
function windshield(): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0.44, 1.05, 0.0, 0.44, 1.05, 0.75, 0.22, 1.42, 0.72, 0.22, 1.42, 0.03], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x5b7f96, transparent: true, opacity: 0.45, shininess: 90, side: THREE.DoubleSide }));
}

/**
 * Masque invisible tendu au niveau du plat-bord : il n'écrit que la profondeur, après le bateau et avant la mer.
 * Sans lui, dans le creux d'une vague, la surface de la mer se dessinait par-dessus le pont, à l'intérieur de la coque.
 */
function hullMask(): THREE.Mesh {
  const points: number[] = [], index: number[] = [];
  for (let k = 0; k <= 12; k++) {
    const u = -3.0 + (6.2 * k) / 12, t = Math.max(0, (u - 0.6) / 2.6);
    const half = (BEAM / 2) * Math.sqrt(Math.max(0, 1 - t * t)) * 0.97, y = 0.55 + 0.12 * t - 0.01;
    points.push(u, y, -half, u, y, half);
    if (k < 12) index.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  g.setIndex(index);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  mesh.renderOrder = 1; // après les objets opaques (bateau compris), avant la mer (transparente)
  return mesh;
}

/** Écume du sillage : taches blanches irrégulières sur fond transparent (répétée le long du sillage). */
function foamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 420; i++) {
    const x = random() * 128, y = random() * 128, r = 1.5 + random() * 6;
    for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {
      const spot = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      spot.addColorStop(0, `rgba(255,255,255,${0.35 + random() * 0.5})`); spot.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spot; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const TRAIL = 72, WAKE_LIFE = 7;

/** Goutte d'embrun : disque blanc aux bords fondus. */
function dropTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Ressort amorti (valeur suivie avec un peu d'inertie). */
function spring(value: number, velocity: number, target: number, stiffness: number, damping: number, dt: number): [number, number] {
  const a = (target - value) * stiffness - velocity * damping;
  velocity += a * dt;
  return [value + velocity * dt, velocity];
}

export class Boat {
  /** Choc contre un haut-fond, un quai ou un pieu (force 0 à 1) : bruit d'impact. */
  static onBump: ((strength: number) => void) | null = null;
  /** Retombée sur l'eau après un saut de vague (force 0 à 1). */
  static onSlam: ((boat: Boat, strength: number) => void) | null = null;
  readonly object = new THREE.Group();
  heading: number;
  speed = 0;
  throttle = 0;
  rider = false;
  private vx = 0;
  private vz = 0;
  private yawRate = 0;
  private y = 0; private vy = 0;
  private pitch = 0;
  private roll = 0; private vRoll = 0;
  private wake: THREE.Mesh;
  /** Niveau moyen de l'eau sous la coque à l'image précédente (pour sa vitesse verticale). */
  private lastWater: number | null = null;
  private pitchRate = 0;
  private inWater = true;
  /** Embruns : gouttes projetées par l'étrave et lors des retombées. */
  private spray: THREE.Points;
  private sprayVel = new Float32Array(SPRAY * 3);
  private sprayLife = new Float32Array(SPRAY);
  private sprayNext = 0;
  private sprayDebt = 0;
  /** Points du sillage laissés par la poupe : position, âge, vitesse et travers du bateau à ce moment-là. */
  private trail: { x: number; z: number; age: number; speed: number; sx: number; sz: number; along: number }[] = [];
  private travelled = 0;
  private trailTimer = 0;

  constructor(scene: THREE.Scene, x: number, z: number, heading: number, hullColor: number, stripeColor: number) {
    this.heading = heading;
    const body = new THREE.Mesh(hull(new THREE.Color(hullColor), new THREE.Color(stripeColor)), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    body.castShadow = true;
    // Le modèle est construit le long de x (avant = +x) : on le tourne pour que l'avant soit +z local.
    const model = new THREE.Group();
    model.add(body, windshield(), hullMask());
    model.rotation.y = -Math.PI / 2;
    this.object.add(model);
    this.object.position.set(x, 0, z);
    scene.add(this.object);

    // Sillage : trois rubans d'écume par point de trace — le remous de l'hélice au centre, et les deux bras
    // du sillage en V (angle de Kelvin, environ 19,5°) qui s'écartent à mesure que le point vieillit.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 6 * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 6 * 4), 4));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(TRAIL * 6 * 2), 2));
    const index: number[] = [];
    for (let i = 0; i + 1 < TRAIL; i++) for (let r = 0; r < 3; r++) {
      const a = i * 6 + r * 2, c = (i + 1) * 6 + r * 2;
      index.push(a, a + 1, c + 1, a, c + 1, c);
    }
    geometry.setIndex(index);
    this.wake = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: foamTexture(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    this.wake.frustumCulled = false;
    this.wake.renderOrder = 2;

    const sprayGeometry = new THREE.BufferGeometry();
    sprayGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPRAY * 3), 3));
    sprayGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPRAY * 4), 4));
    this.spray = new THREE.Points(sprayGeometry, new THREE.PointsMaterial({ size: 0.8, map: dropTexture(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
    this.spray.frustumCulled = false;
    this.spray.renderOrder = 3;
    scene.add(this.spray);
    scene.add(this.wake);
  }

  get position(): THREE.Vector3 { return this.object.position; }
  /** Assiette en degrés (tangage : étrave haute positive ; roulis : bâbord haut positif), pour les essais. */
  get attitude(): { pitch: number; roll: number; air: boolean; slams: number } { return { pitch: Math.round((this.pitch * 1800) / Math.PI) / 10, roll: Math.round((this.roll * 1800) / Math.PI) / 10, air: !this.inWater, slams: this.slams }; }
  /** Nombre de retombées franches depuis le départ (essais). */
  slams = 0;

  /** Pilotage (W/S : gaz et marche arrière, A/D : barre ; Espace : couper les gaz). Sans pilote : il dérive au mouillage. */
  update(dt: number, input: Input | null, sea: Water, time: number, collider: Collider | null, ground: (x: number, z: number) => number): void {
    const forwardX = Math.sin(this.heading), forwardZ = Math.cos(this.heading);
    let throttle = 0, steer = 0;
    if (input) {
      throttle = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
      steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
      if (input.isDown('Space')) throttle = Math.abs(this.speed) > 0.5 ? -Math.sign(this.speed) : 0;
    }
    this.throttle += (Math.abs(throttle) - this.throttle) * Math.min(1, dt * 3);
    // Poussée, traînée de l'eau (linéaire + quadratique), plafond de vitesse.
    // Poussée de l'hélice (elle faiblit en approchant de la vitesse maxi) contre la traînée de la coque :
    // 0 → 50 km/h en 2,5 s environ, plafond vers 94 km/h (51 nœuds, gros hors-bord de 250 ch).
    // Coque en l'air (saut de vague) : l'hélice brasse l'air, plus de poussée ni de freinage par l'eau.
    const wet = this.inWater ? 1 : 0.15;
    const thrust = wet * (throttle > 0 ? 7.5 * throttle * Math.max(0, 1 - (this.speed / 30) ** 2) : throttle < 0 ? (this.speed > 0 ? 7 : 2.6) * throttle : 0);
    this.speed += (thrust - wet * (this.speed * 0.015 + this.speed * Math.abs(this.speed) * 0.0022 + (throttle === 0 ? this.speed * 0.08 : 0))) * dt;
    this.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, this.speed));
    // Barre : efficace seulement avec de l'erre ; virage plus serré à moyenne vitesse.
    const authority = (this.inWater ? 1 : 0.1) * Math.min(1, Math.abs(this.speed) / 3.5) * (1 - Math.min(0.55, Math.abs(this.speed) / MAX_SPEED * 0.55));
    const targetYaw = steer * 0.85 * authority * Math.sign(this.speed || 1);
    this.yawRate += (targetYaw - this.yawRate) * Math.min(1, dt * 2.5);
    this.heading += this.yawRate * dt;
    // La vitesse suit l'axe du bateau avec retard : il glisse un peu de côté dans les virages.
    const grip = Math.min(1, dt * 1.6);
    this.vx += (forwardX * this.speed - this.vx) * grip;
    this.vz += (forwardZ * this.speed - this.vz) * grip;

    // Hauts-fonds et pieux : on n'avance pas là où il n'y a pas assez d'eau.
    const p = this.object.position;
    const nx = p.x + this.vx * dt, nz = p.z + this.vz * dt;
    const bowX = nx + forwardX * LENGTH * 0.5, bowZ = nz + forwardZ * LENGTH * 0.5;
    // Trop peu d'eau : terre sur la carte de la mer, moins de 0,9 m de fond, ou sol réel (plage, ponton) trop haut.
    const shallow = (x: number, z: number) => { const s = sea.sample(x, -z); return (!!s && (s.land || s.depth < 0.7)) || ground(x, z) > -0.6; };
    if (shallow(bowX, bowZ) || shallow(nx, nz) || collider?.blocked(nx, nz, 1.1, this.y + 0.3) || collider?.blocked(bowX, bowZ, 0.5, this.y + 0.3)) {
      if (Math.abs(this.speed) > 2.5 && this.rider) Boat.onBump?.(Math.min(1, Math.abs(this.speed) / 14));
      this.speed *= -0.2; this.vx *= -0.2; this.vz *= -0.2;
    } else {
      p.x = nx; p.z = nz;
    }

    // Flottaison : eau sous l'étrave, la poupe et les deux bords.
    const sideX = Math.cos(this.heading), sideZ = -Math.sin(this.heading);
    const h = (u: number, v: number) => sea.heightAt(p.x + forwardX * u + sideX * v, p.z + forwardZ * u + sideZ * v, time);
    const bow = h(2.4, 0), stern = h(-2.4, 0), port = h(0, 1.0), starboard = h(0, -1.0);
    const planing = Math.max(0, Math.min(1, (Math.abs(this.speed) - 5) / 9));
    // Flottaison : poussée d'Archimède (ressort) et amortissement par rapport au mouvement de l'eau elle-même.
    // L'eau sous la coque monte et descend d'autant plus vite qu'on la traverse vite : en haut d'une vague, à
    // pleine vitesse, la surface s'enfuit plus vite que la gravité ne fait tomber le bateau, qui décolle, puis
    // retombe (éclaboussure, secousse) ; à l'arrêt, il se balance simplement sur la houle.
    const water = (bow + stern + port + starboard) / 4;
    const rise = this.lastWater === null || dt <= 0 ? 0 : Math.max(-8, Math.min(8, (water - this.lastWater) / dt));
    this.lastWater = water;
    const rest = water - 0.12 + planing * 0.2;
    const press = rest - this.y;                          // positif : coque enfoncée sous sa ligne de flottaison
    const touching = press > -0.12;
    if (touching && !this.inWater) {
      const impact = Math.max(0, rise - this.vy);         // vitesse de la coque vers l'eau, au contact
      if (impact > 1.6) {
        const strength = Math.min(1, (impact - 1.6) / 5);
        this.speed *= 1 - 0.08 * strength;
        this.pitchRate *= 0.3;
        this.burst(18 + Math.round(42 * strength), 2 + 4 * strength);
        this.slams++;
        Boat.onSlam?.(this, strength);
      }
    }
    this.inWater = touching;
    if (touching) this.vy += (GRAVITY * Math.min(4, press / 0.12) - (this.vy - rise) * 7) * dt;
    else this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    // Tangage : suit la pente de l'eau dans l'eau ; en l'air, garde son élan et pique doucement du nez.
    const pitchTarget = Math.atan2(bow - stern, 4.8) + planing * 0.085 + this.throttle * 0.02;
    if (touching) this.pitchRate += ((pitchTarget - this.pitch) * 22 - this.pitchRate * 6) * dt;
    else this.pitchRate += (-0.35 - this.pitchRate * 0.4) * dt;
    this.pitch = Math.max(-0.5, Math.min(0.6, this.pitch + this.pitchRate * dt));
    if (touching) [this.roll, this.vRoll] = spring(this.roll, this.vRoll, Math.atan2(port - starboard, 2.0) - this.yawRate * Math.abs(this.speed) * 0.016, 18, 5, dt);
    else this.roll += this.vRoll * dt;
    p.y = this.y;
    this.object.rotation.set(0, 0, 0);
    this.object.rotateY(this.heading);
    this.object.rotateX(-this.pitch);
    this.object.rotateZ(this.roll);

    this.updateWake(dt, sea, time, forwardX, forwardZ);
    this.updateSpray(dt, forwardX, forwardZ, water);
  }

  /** Gouttes lancées en gerbe autour de la coque (retombée sur l'eau). */
  private burst(count: number, power: number): void {
    const p = this.object.position;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, out = power * (0.5 + Math.random());
      this.emit(p.x + Math.cos(a) * 1.4, p.y + 0.1, p.z + Math.sin(a) * 2.2, Math.cos(a) * out + this.vx * 0.4, power * (0.8 + Math.random()), Math.sin(a) * out + this.vz * 0.4, 0.8 + Math.random() * 0.6);
    }
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number): void {
    const i = this.sprayNext;
    this.sprayNext = (this.sprayNext + 1) % SPRAY;
    (this.spray.geometry.attributes.position as THREE.BufferAttribute).setXYZ(i, x, y, z);
    this.sprayVel[i * 3] = vx; this.sprayVel[i * 3 + 1] = vy; this.sprayVel[i * 3 + 2] = vz;
    this.sprayLife[i] = life;
  }

  /** Embruns d'étrave (à partir de 25 km/h, des deux côtés) et mouvement des gouttes. */
  private updateSpray(dt: number, forwardX: number, forwardZ: number, water: number): void {
    const p = this.object.position, speed = Math.abs(this.speed);
    if (this.inWater && speed > 7 && this.speed > 0) {
      this.sprayDebt += (speed - 7) * 9 * dt;
      const sideX = Math.cos(this.heading), sideZ = -Math.sin(this.heading);
      while (this.sprayDebt >= 1) {
        this.sprayDebt -= 1;
        if (speed > 12 && Math.random() < 0.3) {
          // Gerbe de l'hélice derrière le moteur (« queue de coq »), à grande vitesse.
          this.emit(p.x - forwardX * 3.6 + (Math.random() - 0.5) * 0.4, water + 0.1, p.z - forwardZ * 3.6 + (Math.random() - 0.5) * 0.4,
            this.vx * 0.35 + (Math.random() - 0.5), 2.5 + Math.random() * 2.5, this.vz * 0.35 + (Math.random() - 0.5), 0.6 + Math.random() * 0.5);
          continue;
        }
        const side = Math.random() < 0.5 ? -1 : 1, along = 0.6 + Math.random() * 1.4, out = 2 + Math.random() * 3 + speed * 0.12;
        this.emit(p.x + forwardX * along + sideX * side * 1.05, water + 0.05, p.z + forwardZ * along + sideZ * side * 1.05,
          sideX * side * out + this.vx * 0.55, 1.2 + Math.random() * 2 + speed * 0.05, sideZ * side * out + this.vz * 0.55, 0.5 + Math.random() * 0.5);
      }
    }
    const pos = this.spray.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.spray.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < SPRAY; i++) {
      const life = this.sprayLife[i];
      if (life <= 0) { col.setW(i, 0); continue; }
      this.sprayLife[i] = life - dt;
      this.sprayVel[i * 3 + 1] -= GRAVITY * dt;
      const k = Math.exp(-0.8 * dt); // la gerbe est freinée par l'air
      this.sprayVel[i * 3] *= k; this.sprayVel[i * 3 + 2] *= k;
      const y = pos.getY(i) + this.sprayVel[i * 3 + 1] * dt;
      pos.setXYZ(i, pos.getX(i) + this.sprayVel[i * 3] * dt, y, pos.getZ(i) + this.sprayVel[i * 3 + 2] * dt);
      if (y < water - 0.6) this.sprayLife[i] = 0;
      col.setXYZW(i, 0.96, 0.98, 1, Math.max(0, Math.min(0.85, this.sprayLife[i] * 1.4)));
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }

  private updateWake(dt: number, water: Water, time: number, forwardX: number, forwardZ: number): void {
    const p = this.object.position, speed = Math.abs(this.speed);
    for (const t of this.trail) t.age += dt;
    this.travelled += speed * dt;
    this.trailTimer -= dt;
    if (this.trailTimer <= 0 && speed > 1.2) {
      this.trailTimer = 0.1;
      const back = this.speed >= 0 ? -LENGTH * 0.5 : LENGTH * 0.45;
      this.trail.unshift({ x: p.x + forwardX * back, z: p.z + forwardZ * back, age: 0, speed, sx: Math.cos(this.heading), sz: -Math.sin(this.heading), along: this.travelled });
      if (this.trail.length > TRAIL) this.trail.pop();
    }
    while (this.trail.length && this.trail[this.trail.length - 1].age > WAKE_LIFE) this.trail.pop();
    const pos = this.wake.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.wake.geometry.attributes.color as THREE.BufferAttribute;
    const uv = this.wake.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < TRAIL; i++) {
      const t = this.trail[Math.min(i, this.trail.length - 1)];
      if (!t) { for (let k = 0; k < 6; k++) { pos.setXYZ(i * 6 + k, p.x, -100, p.z); col.setXYZW(i * 6 + k, 1, 1, 1, 0); } continue; }
      const live = i < this.trail.length ? 1 : 0;
      const pace = Math.min(1, t.speed / 9), life = Math.max(0, 1 - t.age / WAKE_LIFE);
      const y = water.heightAt(t.x, t.z, time) + 0.1;
      const v = t.along / 5;
      // Remous de l'hélice : large comme la coque, s'élargit doucement, s'efface en 4 s.
      const wash = 0.5 + t.age * 0.4, washAlpha = live * Math.min(1, 1.25 * Math.pow(Math.max(0, 1 - t.age / 4.5), 1.3)) * (0.4 + 0.6 * pace);
      // Bras du V : s'écartent de la vitesse × tan(19,5°) par seconde, minces, s'effacent en 7 s.
      const spread = 1.0 + t.age * t.speed * 0.354, arm = 0.22 + t.age * 0.09, armAlpha = live * 0.7 * Math.pow(life, 1.2) * pace;
      const strips: [number, number, number][] = [[-wash, wash, washAlpha], [spread - arm, spread + arm, armAlpha], [-spread - arm, -spread + arm, armAlpha]];
      strips.forEach(([a, b, alpha], r) => {
        const k = i * 6 + r * 2;
        pos.setXYZ(k, t.x + t.sx * a, y, t.z + t.sz * a);
        pos.setXYZ(k + 1, t.x + t.sx * b, y, t.z + t.sz * b);
        col.setXYZW(k, 1, 1, 1, alpha); col.setXYZW(k + 1, 1, 1, 1, alpha);
        uv.setXY(k, r * 0.37, v); uv.setXY(k + 1, r * 0.37 + (b - a) / 4, v);
      });
    }
    pos.needsUpdate = true; col.needsUpdate = true; uv.needsUpdate = true;
  }
}
