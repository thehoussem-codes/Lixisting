import * as THREE from 'three';
import { assets } from '../assets/AssetLibrary';
import type { Input } from '../engine/Input';
import { createBlobShadow } from '../vehicles/Car';

const WALK_SPEED = 4.5; // mètres par seconde
const RUN_SPEED = 10;
const TURN_SPEED = 12;
const JUMP_SPEED = 7;
const GRAVITY = 20;
const RADIUS = 0.35;
const UP = new THREE.Vector3(0, 1, 0), AIM = new THREE.Vector3(), TURN = new THREE.Quaternion();
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
  /** Personnage articulé (fichier GLB) : remplace les blocs dès qu'il est chargé. */
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Partial<Record<'idle' | 'walk' | 'run', THREE.AnimationAction>> = {};
  private current: THREE.AnimationAction | null = null;
  private blocks: THREE.Object3D[] = [];
  private rest = new Map<string, { bone: THREE.Object3D; quaternion: THREE.Quaternion; position: THREE.Vector3; along: THREE.Vector3; parent: THREE.Quaternion }>();
  private sideLeft = new THREE.Vector3(1, 0, 0);
  private front = new THREE.Vector3(0, 0, 1);
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

    this.blocks = [torso, head, hair, face, this.armL, this.armR, this.legL, this.legR];
    this.object.add(...this.blocks);
    this.shadow = createBlobShadow(1.1, 1.1);
    this.object.add(this.shadow);
    this.object.rotation.order = 'YXZ'; // cap d'abord, puis inclinaison du corps (nage) dans son propre repère
  }

  /** Charge le personnage du catalogue de modèles. Sans fichier, on garde le personnage en blocs. */
  async loadModel(): Promise<void> {
    const asset = assets.catalog.character;
    if (!asset) return;
    try {
      const gltf = await assets.load(asset.model);
      const model = gltf.scene;
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.scale.setScalar(asset.scale ?? (asset.height ?? 1.78) / (size.y || 1));
      model.rotation.y = THREE.MathUtils.degToRad(asset.rotationY ?? 0);
      if (asset.offset) model.position.set(asset.offset[0], asset.offset[1], asset.offset[2]);
      // Un modèle animé bouge hors de sa boîte d'origine : on désactive le masquage automatique.
      model.traverse((child) => { child.frustumCulled = false; });
      this.mixer = new THREE.AnimationMixer(model);
      for (const key of ['idle', 'walk', 'run'] as const) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, asset.animations?.[key] ?? key);
        if (clip) this.actions[key] = this.mixer.clipAction(clip);
      }
      for (const block of this.blocks) block.visible = false;
      this.object.add(model);
      this.dress(model);
      this.captureRestPose(model);
      this.play('idle', 0);
    } catch (error) {
      console.warn('Personnage 3D non chargé, personnage en blocs conservé.', error);
    }
  }

  /** Contrôle du modèle chargé : nombre de maillages et de triangles, taille, et l'animation avance-t-elle ? */
  probe(): { meshes: number; triangles: number; height: number; mixerTime: number | null } {
    let meshes = 0, triangles = 0;
    this.object.traverse((node) => {
      const mesh = node as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      meshes++;
      triangles += (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
    });
    const head = this.rest.get('Head')?.bone;
    const height = head ? head.getWorldPosition(new THREE.Vector3()).y - this.object.position.y : 0;
    return { meshes, triangles, height: Math.round(height * 100) / 100, mixerTime: this.mixer ? Math.round(this.mixer.time * 100) / 100 : null };
  }

  /** Mémorise la pose de repos du squelette (bras en croix), base des mouvements de nage. */
  private captureRestPose(model: THREE.Object3D): void {
    this.object.updateWorldMatrix(true, true);
    const rootInverse = this.object.getWorldQuaternion(new THREE.Quaternion()).invert();
    model.traverse((node) => {
      if (!(node as THREE.Bone).isBone) return;
      const child = node.children.find((c) => (c as THREE.Bone).isBone);
      this.rest.set(node.name.replace(/^mixamorig:?/, ''), {
        bone: node,
        quaternion: node.quaternion.clone(),
        position: node.position.clone(),
        // Direction de l'os (vers son enfant) et orientation de son parent, dans le repère du personnage.
        along: (child ? child.position.clone() : new THREE.Vector3(0, 1, 0)).normalize().applyQuaternion(node.quaternion),
        parent: rootInverse.clone().multiply(node.parent!.getWorldQuaternion(new THREE.Quaternion())),
      });
    });
    const arm = this.rest.get('LeftArm'), spine = this.rest.get('Spine');
    if (!arm || !spine || !this.rest.get('RightArm') || !this.rest.get('LeftUpLeg') || !this.rest.get('RightUpLeg')) { this.rest.clear(); return; }
    this.sideLeft.copy(arm.along).applyQuaternion(arm.parent).setY(0).normalize();
    this.front.crossVectors(this.sideLeft, UP).normalize();
  }

  /** Oriente un os dans une direction donnée (repère du personnage), le reste du squelette étant au repos. */
  private aim(name: string, x: number, y: number, z: number): void {
    const entry = this.rest.get(name);
    if (!entry) return;
    AIM.set(0, 0, 0).addScaledVector(this.sideLeft, x).addScaledVector(UP, y).addScaledVector(this.front, z).normalize();
    AIM.applyQuaternion(TURN.copy(entry.parent).invert());
    entry.bone.quaternion.setFromUnitVectors(entry.along, AIM).multiply(entry.quaternion);
  }

  /**
   * Nage, calculée sur le squelette (le modèle n'a pas d'animation de nage) :
   * crawl en avançant (bras en moulinet alterné, battements de jambes), surplace à l'arrêt.
   */
  private swimPose(moving: boolean): void {
    for (const entry of this.rest.values()) { entry.bone.quaternion.copy(entry.quaternion); entry.bone.position.copy(entry.position); }
    const t = this.stride;
    if (moving) {
      for (const [side, name, phase] of [[1, 'Left', 0], [-1, 'Right', Math.PI]] as const) {
        const a = t + phase;
        // Le bras tourne autour de l'épaule : devant la tête, sous l'eau, le long du corps, retour par-dessus.
        this.aim(`${name}Arm`, side * 0.28, Math.cos(a), Math.sin(a));
        // Le coude plie pendant le retour hors de l'eau.
        const bend = Math.max(0, -Math.sin(a)) * 0.9;
        this.aim(`${name}ForeArm`, side * 0.28 * (1 - bend), Math.cos(a) + bend * 0.5, Math.sin(a) + bend * 0.9);
        const kick = Math.sin(t * 2.4 + phase) * 0.38;
        this.aim(`${name}UpLeg`, side * 0.08, -Math.cos(kick), Math.sin(kick));
        this.aim(`${name}Leg`, side * 0.08, -Math.cos(kick * 0.4), Math.sin(kick * 0.4) - 0.12);
      }
      this.aim('Neck', 0, 0.75, -0.66); // la tête relevée, hors de l'eau
    } else {
      for (const [side, name, phase] of [[1, 'Left', 0], [-1, 'Right', Math.PI]] as const) {
        const scull = Math.sin(t * 1.3) * 0.35;
        this.aim(`${name}Arm`, side * 0.9, -0.15, 0.45 + scull);
        this.aim(`${name}ForeArm`, side * 0.75, 0.05, 0.75 - scull);
        const kick = Math.sin(t * 1.6 + phase) * 0.45;
        this.aim(`${name}UpLeg`, side * 0.12, -Math.cos(kick), Math.sin(kick));
        this.aim(`${name}Leg`, side * 0.1, -1, -0.25 - Math.max(0, kick));
      }
    }
  }

  /**
   * Habille le mannequin : vêtements noirs, tête et mains couleur de peau, cheveux.
   * Chaque point du modèle est coloré selon l'os qui le fait bouger (tête, cou, mains = peau).
   */
  private dress(model: THREE.Object3D): void {
    const CLOTHES = new THREE.Color(0x18181c), SKIN = new THREE.Color(0xc98f68);
    let head: THREE.Object3D | null = null;
    model.traverse((child) => {
      if (/Head$/i.test(child.name) && (child as THREE.Bone).isBone) head = child;
      const mesh = child as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      const index = mesh.geometry.getAttribute('skinIndex'), weight = mesh.geometry.getAttribute('skinWeight');
      const colors = new Float32Array(index.count * 3);
      for (let i = 0; i < index.count; i++) {
        // Os dominant de ce point.
        let best = 0;
        for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
        const bone = mesh.skeleton.bones[index.getComponent(i, best)]?.name ?? '';
        const color = /Head|Neck|Hand/i.test(bone) ? SKIN : CLOTHES;
        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      }
      mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    });
    // Cheveux : une calotte sombre fixée à l'os de la tête (elle suit donc tous les mouvements).
    const bone = head as THREE.Object3D | null;
    if (bone) {
      this.object.updateWorldMatrix(true, true);
      const top = bone.getWorldPosition(new THREE.Vector3());
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.126, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x120d0a }));
      hair.position.set(top.x, top.y + 0.1, top.z - 0.055);
      hair.frustumCulled = false;
      this.object.add(hair);
      bone.attach(hair);
    }
  }

  /** Passe en fondu d'une animation à l'autre. */
  private play(name: 'idle' | 'walk' | 'run', fade = 0.2): void {
    const next = this.actions[name] ?? this.actions.idle;
    if (!next || next === this.current) return;
    next.reset().fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
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
      // En avançant : allongé à la surface (crawl). À l'arrêt : presque debout, on fait du surplace.
      position.y += ((moving ? SWIM_LEVEL + 0.9 : SWIM_LEVEL - 0.15) - position.y) * Math.min(1, 4 * dt);
      this.velocityY = 0; this.airborne = false;
      this.object.rotation.x += ((moving ? 1.32 : 0.22) - this.object.rotation.x) * Math.min(1, 4 * dt);
    } else if (this.airborne) {
      this.velocityY -= GRAVITY * dt;
      position.y += this.velocityY * dt;
      if (position.y <= floor) { position.y = floor; this.velocityY = 0; this.airborne = false; }
    } else {
      position.y = floor;
      if (input.isDown('Space')) { this.velocityY = JUMP_SPEED; this.airborne = true; }
    }

    if (!this.swimming) { this.object.rotation.x += (0 - this.object.rotation.x) * Math.min(1, 8 * dt); }
    this.shadow.position.y = 0.04 - Math.max(0, position.y - floor);
    this.shadow.visible = !this.swimming && floor > -0.2;
    // Animation des bras et des jambes.
    let swing = 0;
    if (this.swimming) {
      this.stride += dt * (moving ? (running ? 6.2 : 4.6) : 2.6);
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
    if (this.mixer && this.swimming && this.rest.size) {
      this.swimPose(moving);
    } else if (this.mixer) {
      this.play(!moving ? 'idle' : this.swimming || running ? 'run' : 'walk');
      // La cadence des pas suit la vitesse réelle (au ralenti dans l'eau).
      if (this.current) this.current.timeScale = this.swimming ? 0.6 : moving ? speed / (running ? RUN_SPEED : WALK_SPEED) : 1;
      this.mixer.update(dt);
    }
    this.legL.rotation.x = swing;  this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing; this.armR.rotation.x = swing;
  }
}
