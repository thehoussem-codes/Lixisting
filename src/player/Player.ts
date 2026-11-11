import * as THREE from 'three';
import type { Input } from '../engine/Input';
import { createBlobShadow } from '../vehicles/Car';

const WALK_SPEED = 4.5; // mètres par seconde
const RUN_SPEED = 10;
const TURN_SPEED = 12;
const JUMP_SPEED = 7;
const GRAVITY = 20;
const RADIUS = 0.35;
const SWIM_SPEED = 2.2, SWIM_FAST = 3.4;
const SWIM_DEPTH = -0.9;  // fond plus bas que ça : on n'a plus pied, on nage
const SWIM_LEVEL = -1.3;  // hauteur des pieds en nageant (la tête reste hors de l'eau)

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

/** Membre articulé : le pivot est en haut (épaule ou hanche). */
function limb(w: number, h: number, d: number, color: number): THREE.Group {
  const pivot = new THREE.Group();
  const mesh = box(w, h, d, color);
  mesh.position.y = -h / 2;
  pivot.add(mesh);
  return pivot;
}

/** Tout ce qui peut bloquer le personnage (bâtiments, voitures...). */
export interface Obstacles { blocked(x: number, z: number, radius: number): boolean }

/** Personnage provisoire en blocs, animé par code (marche, course, saut). */
export class Player {
  readonly object = new THREE.Group();
  private move = new THREE.Vector3();
  private velocityY = 0;
  private airborne = false;
  /** Vrai quand le personnage nage. */
  swimming = false;
  private stride = 0;
  private shadow: THREE.Mesh;
  private armL: THREE.Group; private armR: THREE.Group;
  private legL: THREE.Group; private legR: THREE.Group;

  constructor() {
    const SKIN = 0xd9a878, SHIRT = 0xd94f30, PANTS = 0x2f3f66;
    const torso = box(0.5, 0.6, 0.28, SHIRT);
    torso.position.y = 1.15;
    const head = box(0.3, 0.3, 0.3, SKIN);
    head.position.y = 1.62;
    const hair = box(0.32, 0.1, 0.32, 0x1c1410);
    hair.position.y = 1.8;
    // Le visage est du côté +Z : c'est "l'avant" du personnage.
    const face = box(0.2, 0.06, 0.04, 0x222222);
    face.position.set(0, 1.66, 0.16);

    this.armL = limb(0.14, 0.6, 0.14, SKIN); this.armL.position.set(0.33, 1.42, 0);
    this.armR = limb(0.14, 0.6, 0.14, SKIN); this.armR.position.set(-0.33, 1.42, 0);
    this.legL = limb(0.2, 0.85, 0.2, PANTS); this.legL.position.set(0.13, 0.85, 0);
    this.legR = limb(0.2, 0.85, 0.2, PANTS); this.legR.position.set(-0.13, 0.85, 0);

    this.object.add(torso, head, hair, face, this.armL, this.armR, this.legL, this.legR);
    this.shadow = createBlobShadow(1.1, 1.1);
    this.object.add(this.shadow);
  }

  teleport(x: number, y: number, z: number): void {
    this.object.position.set(x, y, z);
    this.object.rotation.x = 0;
    this.velocityY = 0;
    this.airborne = false;
  }

  update(dt: number, input: Input, cameraYaw: number, collider: Obstacles | null, ground: (x: number, z: number) => number): void {
    const position = this.object.position;
    const forward = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
                  - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const right = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
                - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    const moving = forward !== 0 || right !== 0;
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    // Dans l'eau : on marche au ralenti tant qu'on a pied, puis on nage.
    const depth = ground(position.x, position.z);
    this.swimming = depth < SWIM_DEPTH;
    const wading = depth < -0.2 ? 0.55 : 1;
    const speed = this.swimming ? (running ? SWIM_FAST : SWIM_SPEED) : (running ? RUN_SPEED : WALK_SPEED) * wading;

    if (moving) {
      // Directions "devant" et "à droite" vues depuis la caméra, à plat sur le sol.
      const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
      this.move.set(-sin * forward + cos * right, 0, -cos * forward - sin * right).normalize();
      const dx = this.move.x * speed * dt, dz = this.move.z * speed * dt;
      // Collision : on essaie le déplacement complet, sinon on glisse le long du mur.
      if (!collider || !collider.blocked(position.x + dx, position.z + dz, RADIUS)) {
        position.x += dx; position.z += dz;
      } else if (!collider.blocked(position.x + dx, position.z, RADIUS)) {
        position.x += dx;
      } else if (!collider.blocked(position.x, position.z + dz, RADIUS)) {
        position.z += dz;
      }
      // Le personnage se tourne progressivement vers sa direction de marche.
      let diff = Math.atan2(this.move.x, this.move.z) - this.object.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.object.rotation.y += diff * Math.min(1, TURN_SPEED * dt);
    }

    // Saut et gravité : au sol, le personnage suit le relief ; en l'air, il retombe.
    const floor = ground(position.x, position.z);
    if (this.swimming) {
      // Nage : le corps flotte à la surface, allongé.
      position.y += (SWIM_LEVEL + 0.9 - position.y) * Math.min(1, 6 * dt);
      this.velocityY = 0; this.airborne = false;
      this.object.rotation.x += (1.25 - this.object.rotation.x) * Math.min(1, 6 * dt);
    } else if (this.airborne) {
      this.velocityY -= GRAVITY * dt;
      position.y += this.velocityY * dt;
      if (position.y <= floor) { position.y = floor; this.velocityY = 0; this.airborne = false; }
    } else {
      position.y = floor;
      if (input.isDown('Space')) { this.velocityY = JUMP_SPEED; this.airborne = true; }
    }

    if (!this.swimming) this.object.rotation.x += (0 - this.object.rotation.x) * Math.min(1, 8 * dt);
    this.shadow.position.y = 0.04 - Math.max(0, position.y - floor);
    this.shadow.visible = !this.swimming && floor > -0.2;
    // Animation des bras et des jambes.
    let swing = 0;
    if (this.swimming) {
      this.stride += dt * (moving ? 7 : 2.5);
      swing = Math.sin(this.stride) * 1.3; // brasse : grands mouvements
    } else if (this.airborne) {
      swing = 0.9; // en l'air : jambes et bras écartés
      this.stride = 0;
    } else if (moving) {
      this.stride += dt * speed * 2.2;
      swing = Math.sin(this.stride) * (running ? 1.0 : 0.6);
    } else {
      this.stride = 0;
    }
    this.legL.rotation.x = swing;  this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing; this.armR.rotation.x = swing;
  }
}
