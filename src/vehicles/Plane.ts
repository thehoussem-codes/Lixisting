import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { Collider } from '../world/Collider';
import { MeshBuilder } from '../world/MeshBuilder';

/**
 * Avion de ligne biréacteur moyen-courrier (gabarit d'un Boeing 737-800 : 39,5 m de long, 34 m d'envergure),
 * fait en code. Livrée blanche, dérive et liseré rouges, aux couleurs d'Air Algérie, sans logo ni nom de compagnie.
 *
 * Pilotage arcade (pas un simulateur) :
 * - W / S : gaz plus / gaz moins (au sol, S à l'arrêt : marche arrière lente pour se dégager) ;
 * - A / D : au sol, roulette de nez ; en vol, inclinaison (le virage suit l'inclinaison) ;
 * - ↑ / ↓ : piquer / cabrer (au sol : cabrer au-delà de 245 km/h pour décoller) ;
 * - Espace : freins au sol, aérofreins en vol.
 * Décrochage sous 225 km/h : l'avion s'enfonce et pique du nez. Posé trop dur, trop incliné ou sans train :
 * accident (l'avion s'arrête, moteurs coupés).
 */

const GRAVITY = 9.81;
const V_ROTATE = 68;      // vitesse de rotation (m/s, ~245 km/h)
const V_STALL = 62;       // décrochage (m/s, ~225 km/h)
const THRUST = 3.3;       // accélération à pleine poussée (m/s²)
const DRAG = 0.000147;    // traînée : pleine poussée en palier → ~150 m/s (540 km/h, le décor suit encore)
const NOSE_GEAR = 15.2, MAIN_GEAR = -1.6, MAIN_TRACK = 2.9;
const FUSELAGE_Y = 3.3, RADIUS = 1.88, LENGTH = 39.5;

const WHITE = new THREE.Color(0xf4f5f6), BELLY = new THREE.Color(0xd5d9dd), RED = new THREE.Color(0xc4161c);
const GREY = new THREE.Color(0xb9bec4), DARK = new THREE.Color(0x24272b), METAL = new THREE.Color(0x8d939a);

/** Peau du fuselage : hublots, portes, liseré rouge, vitres du poste de pilotage. u = long (0 queue → 1 nez), v = tour. */
function skin(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 2048, 256);
  const U = (u: number) => ((u + LENGTH / 2) / LENGTH) * 2048;       // u en mètres depuis le milieu
  const V = (deg: number) => (deg / 360) * 256;                          // angle depuis le dessus
  for (const side of [1, -1]) {
    const at = (deg: number) => (side > 0 ? V(deg) : V(360 - deg));
    // Liseré rouge sous les hublots.
    ctx.fillStyle = '#c4161c';
    ctx.fillRect(U(-17), Math.min(at(97), at(101)), U(17.5) - U(-17), Math.abs(at(101) - at(97)) + 1);
    // Hublots.
    ctx.fillStyle = '#1d2733';
    for (let u = -13.2; u <= 12.6; u += 0.52) {
      if (Math.abs(u - 0.6) < 0.4) continue;   // issues de secours au-dessus de l'aile
      ctx.beginPath();
      ctx.ellipse(U(u), at(76), 3.2, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Portes (contours) : avant, arrière, issues d'aile.
    ctx.strokeStyle = '#8a9099'; ctx.lineWidth = 2;
    for (const [u, w] of [[13.6, 0.85], [-14.6, 0.8], [0.6, 0.5], [1.2, 0.5]] as [number, number][]) {
      ctx.strokeRect(U(u - w / 2), Math.min(at(66), at(98)), U(u + w / 2) - U(u - w / 2), Math.abs(at(98) - at(66)));
    }
  }
  // Vitres du poste de pilotage (avant du fuselage, de part et d'autre).
  ctx.fillStyle = '#16202b';
  for (const deg of [22, 44, 316, 338]) ctx.fillRect(U(16.6), V(deg) - 6, U(17.6) - U(16.6), 11);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Fuselage : sections circulaires de la queue (relevée) au nez (arrondi). */
function fuselage(): THREE.BufferGeometry {
  const sides = 20, positions: number[] = [], uvs: number[] = [], colors: number[] = [], index: number[] = [];
  const stations: [number, number, number][] = [];   // u, rayon, hauteur du centre
  for (let u = -LENGTH / 2; u <= LENGTH / 2 + 1e-6; u += 0.5) {
    let r = RADIUS, cy = FUSELAGE_Y;
    if (u > 15.2) { const t = (u - 15.2) / (LENGTH / 2 - 15.2); r = RADIUS * Math.sqrt(Math.max(0, 1 - t ** 2.2)); cy -= 0.35 * t * t; }
    if (u < -8.5) { const t = (-8.5 - u) / (LENGTH / 2 - 8.5); r = RADIUS * (1 - 0.82 * t ** 1.3); cy += 1.25 * t * t; }
    stations.push([u, Math.max(r, 0.02), cy]);
  }
  const c = new THREE.Color();
  stations.forEach(([u, r, cy], i) => {
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;                      // 0 = dessus
      positions.push(u, cy + r * Math.cos(a), r * Math.sin(a));
      uvs.push((u + LENGTH / 2) / LENGTH, k / sides);
      c.copy(WHITE).lerp(BELLY, Math.max(0, -Math.cos(a) - 0.35) / 0.65);
      colors.push(c.r, c.g, c.b);
    }
    if (i > 0) for (let k = 0; k < sides; k++) {
      const a = (i - 1) * (sides + 1) + k, b = i * (sides + 1) + k;
      index.push(a, b, b + 1, a, b + 1, a + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Aile, empennage ou dérive : plaque épaisse entre une emplanture et un saumon (bord d'attaque, corde, épaisseur). */
function surface(b: MeshBuilder, root: number[], tip: number[], rootChord: number, tipChord: number, thick: number, top: THREE.Color, bottom: THREE.Color, vertical = false): void {
  // root/tip : [u bord d'attaque, y, z] ; la corde va vers l'arrière (u décroissant).
  const pts = (p: number[], chord: number, sign: number) => {
    const t = thick * (chord / rootChord) * sign;
    return vertical
      ? [[p[0], p[1], p[2]], [p[0] - chord * 0.3, p[1], p[2] + t], [p[0] - chord, p[1], p[2]], [p[0] - chord * 0.3, p[1], p[2] - t]]
      : [[p[0], p[1], p[2]], [p[0] - chord * 0.3, p[1] + t, p[2]], [p[0] - chord, p[1], p[2]], [p[0] - chord * 0.3, p[1] - t, p[2]]];
  };
  const A = pts(root, rootChord, 1), B = pts(tip, tipChord, 1);
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    const color = vertical ? top : k < 2 ? top : bottom;
    const ids = [A[k], A[j], B[j], B[k]].map(([u, y, z]) => b.vertex(u, y, z, color, k < 2 ? 1 : 0.85));
    b.triangle(ids[0], ids[1], ids[2]); b.triangle(ids[0], ids[2], ids[3]);
  }
  // Fermeture du saumon.
  const cap = B.map(([u, y, z]) => b.vertex(u, y, z, top, 0.9));
  b.triangle(cap[0], cap[1], cap[2]); b.triangle(cap[0], cap[2], cap[3]);
}

/** Cylindre (nacelle, jambe de train, roue) le long d'un axe : u (avant), y (haut) ou z (côté). */
function tube(b: MeshBuilder, axis: 'u' | 'y' | 'z', from: number[], length: number, r0: number, r1: number, color: THREE.Color, sides = 14, caps = true): void {
  const ring = (center: number[], r: number) => Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
    return axis === 'u' ? [center[0], center[1] + c, center[2] + s] : axis === 'y' ? [center[0] + c, center[1], center[2] + s] : [center[0] + c, center[1] + s, center[2]];
  });
  const end = axis === 'u' ? [from[0] + length, from[1], from[2]] : axis === 'y' ? [from[0], from[1] + length, from[2]] : [from[0], from[1], from[2] + length];
  const A = ring(from, r0), B = ring(end, r1);
  for (let k = 0; k < sides; k++) {
    const j = (k + 1) % sides;
    const ids = [A[k], A[j], B[j], B[k]].map(([u, y, z]) => b.vertex(u, y, z, color));
    b.triangle(ids[0], ids[1], ids[2]); b.triangle(ids[0], ids[2], ids[3]);
  }
  if (caps) for (const [ring_, c] of [[A, from], [B, end]] as [number[][], number[]][]) {
    const centre = b.vertex(c[0], c[1], c[2], color, 0.8);
    const ids = ring_.map(([u, y, z]) => b.vertex(u, y, z, color, 0.8));
    for (let k = 0; k < sides; k++) b.triangle(centre, ids[k], ids[(k + 1) % sides]);
  }
}

function airframe(): { body: THREE.BufferGeometry; parts: THREE.BufferGeometry; gear: THREE.BufferGeometry } {
  const parts = new MeshBuilder(), gear = new MeshBuilder();
  // Ailes basses, en flèche (25°), dièdre de 6°, avec winglets rouges.
  for (const side of [1, -1]) {
    const root = [1.8, 2.05, side * 1.6], tip = [1.8 - 15.4 * Math.tan(0.44), 2.05 + 15.4 * Math.tan(0.1), side * 17.0];
    surface(parts, root, tip, 7.6, 1.5, 0.42, WHITE, GREY);
    surface(parts, [tip[0] + 0.1, tip[1], tip[2]], [tip[0] - 1.1, tip[1] + 2.3, tip[2] + side * 0.35], 1.5, 0.6, 0.06, RED, RED, true);
    // Carénage d'emplanture et volets (bande grise au bord de fuite).
    surface(parts, [root[0] - 7.4, 2.0, side * 1.7], [tip[0] - 1.35, tip[1] - 0.02, side * 16.6], 0.35, 0.2, 0.06, GREY, GREY);
    // Réacteur sous l'aile : nacelle rouge, entrée d'air sombre, tuyère grise ; mât.
    const ex = 2.3 - 5.2 * Math.tan(0.44) + 2.6, ez = side * 5.2;
    tube(parts, 'u', [ex - 4.4, 1.5, ez], 4.4, 0.78, 0.98, RED, 18, false);
    tube(parts, 'u', [ex - 0.02, 1.5, ez], 0.03, 0.98, 0.98, DARK, 18, true);
    tube(parts, 'u', [ex - 5.6, 1.5, ez], 1.2, 0.35, 0.78, METAL, 14, true);
    surface(parts, [ex - 0.8, 2.35, ez], [ex - 1.0, 1.9, ez], 3.6, 3.0, 0.12, GREY, GREY, true);
  }
  // Empennage horizontal et dérive rouge.
  for (const side of [1, -1]) surface(parts, [-15.2, 4.1, side * 0.8], [-18.6, 4.6, side * 7.0], 4.6, 1.6, 0.18, WHITE, GREY);
  surface(parts, [-12.4, 5.0, 0], [-18.4, 12.2, 0], 6.6, 2.2, 0.3, RED, RED, true);
  // Train d'atterrissage : roulette de nez et deux trains principaux (roues jumelées).
  tube(gear, 'y', [NOSE_GEAR, 0.4, 0], FUSELAGE_Y - RADIUS + 0.2 - 0.4, 0.12, 0.12, METAL, 8);
  for (const s of [-0.28, 0.28]) tube(gear, 'z', [NOSE_GEAR, 0.4, s - 0.11], 0.22, 0.4, 0.4, DARK, 12);
  for (const side of [1, -1]) {
    tube(gear, 'y', [MAIN_GEAR, 0.6, side * MAIN_TRACK], 1.6, 0.16, 0.16, METAL, 8);
    for (const s of [-0.38, 0.38]) tube(gear, 'z', [MAIN_GEAR, 0.56, side * MAIN_TRACK + s - 0.18], 0.36, 0.56, 0.56, DARK, 14);
  }
  return { body: fuselage(), parts: parts.build(), gear: gear.build() };
}

/** Géométries et peau communes à tous les avions (construites une fois). */
let shared: { body: THREE.BufferGeometry; parts: THREE.BufferGeometry; gear: THREE.BufferGeometry; skin: THREE.CanvasTexture } | null = null;

export class Plane {
  readonly object = new THREE.Group();
  private model = new THREE.Group();
  private gearMesh: THREE.Mesh;
  heading: number;
  pitch = 0;
  roll = 0;
  speed = 0;
  throttle = 0;
  onGround = true;
  crashed = false;
  private sink = 0;
  private spawn: [number, number, number];
  /** Hauteur au-dessus du sol (m), pour le compteur et la caméra. */
  altitude = 0;
  /** Vitesse trop faible pour porter l'avion (alarme de décrochage). */
  get stalling(): boolean { return !this.onGround && this.speed < V_STALL * 1.05; }
  static onCrash: ((plane: Plane, strength: number) => void) | null = null;
  static onTouchdown: ((plane: Plane, strength: number) => void) | null = null;

  constructor(scene: THREE.Scene, x: number, z: number, heading: number) {
    this.heading = heading;
    this.spawn = [x, z, heading];
    shared ??= { ...airframe(), skin: skin() };
    const { body, parts, gear } = shared;
    const paint = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const hull = new THREE.Mesh(body, new THREE.MeshLambertMaterial({ vertexColors: true, map: shared.skin }));
    const rest = new THREE.Mesh(parts, paint);
    this.gearMesh = new THREE.Mesh(gear, paint);
    for (const mesh of [hull, rest, this.gearMesh]) { mesh.castShadow = true; mesh.receiveShadow = true; }
    this.model.add(hull, rest, this.gearMesh);
    this.model.rotation.y = -Math.PI / 2;      // construit le long de x : l'avant devient +z local
    this.object.add(this.model);
    this.object.position.set(x, 0, z);
    scene.add(this.object);
  }

  get position(): THREE.Vector3 { return this.object.position; }

  /** Remet l'avion à son poste de stationnement (après un accident). */
  reset(ground: (x: number, z: number) => number): void {
    const [x, z, heading] = this.spawn;
    Object.assign(this, { heading, pitch: 0, roll: 0, speed: 0, throttle: 0, onGround: true, crashed: false, sink: 0 });
    this.model.position.y = 0;
    this.gearMesh.visible = true;
    this.object.position.set(x, ground(x, z), z);
    this.pose();
  }

  /** Points de l'avion (nez, queue, saumons, réacteurs) en x, z du monde : pour les collisions. */
  private outline(x: number, z: number, heading: number): [number, number][] {
    const fx = Math.sin(heading), fz = Math.cos(heading), sx = Math.cos(heading), sz = -Math.sin(heading);
    return [[19, 0], [10, 0], [0, 0], [-10, 0], [-19, 0], [-4, 16], [-4, -16], [1, 5.2], [1, -5.2]]
      .map(([u, v]) => [x + fx * u + sx * v, z + fz * u + sz * v]);
  }

  update(dt: number, input: Input | null, ground: (x: number, z: number) => number, collider: Collider | null): void {
    const p = this.object.position;
    const key = (code: string) => !!input && input.isDown(code);
    const steer = (key('KeyA') || key('ArrowLeft') ? 1 : 0) - (key('KeyD') || key('ArrowRight') ? 1 : 0);
    const nose = (key('ArrowDown') ? 1 : 0) - (key('ArrowUp') ? 1 : 0);   // + : cabrer
    const brake = key('Space');
    if (!this.crashed && input) {
      if (key('KeyW')) this.throttle = Math.min(1, this.throttle + dt * 0.45);
      if (key('KeyS')) this.throttle = Math.max(0, this.throttle - dt * 0.7);
    }
    if (this.crashed || !input) this.throttle = Math.max(0, this.throttle - dt * 0.7);

    const groundY = ground(p.x, p.z);
    if (this.onGround) {
      // --- Roulage : roulette de nez (rayon mini 25 m), freins, décollage par cabrage au-delà de 245 km/h.
      let accel = this.throttle * THRUST - DRAG * this.speed * Math.abs(this.speed) - 0.15 * Math.sign(this.speed);
      if (brake) accel -= Math.sign(this.speed) * 3.2;
      if (input && key('KeyS') && this.throttle === 0 && this.speed < 0.5) accel -= 1.2;   // se dégager en reculant
      if (this.crashed) accel = -Math.sign(this.speed) * 6 - this.speed * 0.5;
      const before = this.speed;
      this.speed += accel * dt;
      if ((before > 0 && this.speed < 0 && !key('KeyS')) || (before < 0 && this.speed > 0)) this.speed = 0;
      this.speed = Math.max(-3, this.speed);
      const turn = steer * Math.min(0.32, Math.abs(this.speed) / 25) * Math.sign(this.speed) * (this.speed > 40 ? 40 / this.speed : 1);
      this.heading += turn * dt;
      // Épave : couchée sur le ventre, un peu penchée (train arraché).
      const wantPitch = this.crashed ? -0.05 : this.speed > V_ROTATE && nose > 0 ? 0.2 : 0;
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * (nose > 0 ? 0.9 : 3));
      this.roll += ((this.crashed ? 0.09 : 0) - this.roll) * Math.min(1, dt * 4);
      const nx = p.x + Math.sin(this.heading) * this.speed * dt, nz = p.z + Math.cos(this.heading) * this.speed * dt;
      if (collider && this.outline(nx, nz, this.heading).some(([ox, oz]) => collider.solidFor(ox, oz, groundY + 3, groundY))) {
        if (Math.abs(this.speed) > 8) this.crash(Math.min(1, Math.abs(this.speed) / 40));
        this.speed = 0;
      } else { p.x = nx; p.z = nz; }
      p.y = ground(p.x, p.z);
      if (this.pitch > 0.07 && this.speed > V_ROTATE) { this.onGround = false; this.sink = 0; }
    } else {
      // --- Vol : la trajectoire suit le nez tant que la vitesse porte l'avion.
      const lift = Math.min(1, (this.speed / V_STALL) ** 2);
      // Manche : ↓ cabre, ↑ pique. Lâché, l'avion revient doucement à l'horizontale (comme dans les jeux : on ne
      // pique pas vers le sol sans le vouloir, et l'arrondi avant de toucher la piste se fait presque seul).
      // Trop lent, il décroche : le nez tombe.
      if (nose !== 0 && !this.crashed) this.pitch += nose * 0.3 * Math.min(1, this.speed / V_ROTATE) * dt;
      else if (!this.crashed && lift > 0.85) this.pitch += (0 - this.pitch) * Math.min(1, dt * 0.35);
      this.pitch -= (1 - lift) * 0.3 * dt;
      this.pitch = Math.max(-0.45, Math.min(0.36, this.pitch));
      if (this.crashed) this.pitch += (-0.35 - this.pitch) * Math.min(1, dt * 0.8);   // l'avion touché pique du nez
      const rollTarget = this.crashed ? this.roll : steer * 0.8;
      this.roll += Math.max(-1.3 * dt, Math.min(1.3 * dt, rollTarget - this.roll));
      this.heading += (GRAVITY * Math.tan(this.roll) / Math.max(40, this.speed)) * dt;
      // Plafond doux : au-dessus de 1 800 m l'air se raréfie et les réacteurs poussent moins.
      const thin = Math.max(0.25, 1 - Math.max(0, p.y - 1800) / 1200);
      let accel = this.throttle * THRUST * thin - DRAG * this.speed * this.speed - GRAVITY * Math.sin(this.pitch);
      if (brake) accel -= 2.5;
      this.speed = Math.max(0, this.speed + accel * dt);
      this.sink += (GRAVITY * (1 - lift) * 3 - this.sink) * Math.min(1, dt);
      const climb = this.speed * Math.sin(this.pitch) - this.sink;
      const horizontal = this.speed * Math.cos(this.pitch);
      p.y += climb * dt;
      const nx = p.x + Math.sin(this.heading) * horizontal * dt, nz = p.z + Math.cos(this.heading) * horizontal * dt;
      // Un immeuble ou une colline (bâtiments de la wilaya) devant : l'avion s'y arrête et tombe au pied.
      if (collider && this.outline(nx, nz, this.heading).some(([ox, oz]) => collider.solidFor(ox, oz, p.y + 2, ground(ox, oz)))) {
        this.crash(1);
        this.speed = 0;
      } else { p.x = nx; p.z = nz; }
      const floor = ground(p.x, p.z);
      if (p.y <= floor) {
        // Contact avec le sol : atterrissage si l'avion descend doucement, ailes à plat et nez pas trop bas.
        const descent = -climb;
        if (!this.crashed && descent < 7.5 && Math.abs(this.roll) < 0.3 && this.pitch > -0.15) {
          if (descent > 2.5) Plane.onTouchdown?.(this, Math.min(1, (descent - 2.5) / 5));
        } else this.crash(Math.min(1, descent / 15 + Math.abs(this.roll)));
        this.onGround = true;
        p.y = floor;
      }
    }
    this.altitude = Math.max(0, p.y - groundY);
    this.gearMesh.visible = !this.crashed && (this.onGround || this.altitude < 150);
    this.model.position.y = this.crashed && this.onGround ? -(FUSELAGE_Y - RADIUS) + 0.15 : 0;   // épave posée sur le ventre
    this.pose();
  }

  /** Accident (choc, atterrissage trop dur, amerrissage) : l'avion s'arrête, il sera remis à son poste. */
  crash(strength: number): void {
    if (this.crashed) return;
    this.crashed = true;
    this.throttle = 0;
    this.speed *= 0.25;
    this.roll = Math.max(-0.25, Math.min(0.25, this.roll));
    Plane.onCrash?.(this, strength);
  }

  private pose(): void {
    this.object.rotation.set(0, 0, 0);
    this.object.rotateY(this.heading);
    this.object.rotateX(-this.pitch);
    this.object.rotateZ(-this.roll);
  }
}
