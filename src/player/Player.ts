import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { Collider } from '../world/Collider';

const WALK_SPEED = 4.5; // mètres par seconde
const RUN_SPEED = 10;
const TURN_SPEED = 12;
const JUMP_SPEED = 7;
const GRAVITY = 20;
const RADIUS = 0.35;

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

/** Personnage provisoire en blocs, animé par code (marche, course, saut). */
export class Player {
  readonly object = new THREE.Group();
  private move = new THREE.Vector3();
  private velocityY = 0;
  private stride = 0;
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
  }

  teleport(x: number, z: number): void {
    this.object.position.set(x, 0, z);
    this.velocityY = 0;
  }

  update(dt: number, input: Input, cameraYaw: number, collider: Collider | null): void {
    const position = this.object.position;
    const forward = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
                  - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const right = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
                - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    const moving = forward !== 0 || right !== 0;
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = running ? RUN_SPEED : WALK_SPEED;

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

    // Saut et gravité (le sol est encore plat, à la hauteur 0).
    const onGround = position.y <= 0;
    if (onGround && input.isDown('Space')) this.velocityY = JUMP_SPEED;
    this.velocityY -= GRAVITY * dt;
    position.y += this.velocityY * dt;
    if (position.y <= 0) { position.y = 0; this.velocityY = 0; }

    // Animation des bras et des jambes.
    let swing = 0;
    if (position.y > 0) {
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
