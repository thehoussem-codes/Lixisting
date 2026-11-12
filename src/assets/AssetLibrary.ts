import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Handling } from '../vehicles/physics/SuspensionPhysics';

/**
 * Bibliothèque centrale des modèles 3D (fichiers GLB ou glTF).
 *
 * Tout passe par public/assets/catalog.json : pour ajouter ou remplacer un modèle,
 * on dépose le fichier dans public/assets/models/ et on modifie le catalogue.
 * Aucun code à changer. Si un fichier manque ou ne se charge pas, le jeu garde
 * simplement le modèle qu'il avait déjà.
 */
export interface ModelRef {
  /** Chemin du fichier, relatif à public/assets/. */
  model: string;
  scale?: number;
  /** Rotation autour de la verticale, en degrés (pour mettre l'avant du modèle vers +Z). */
  rotationY?: number;
  /** Décalage x, y, z en mètres après mise à l'échelle. */
  offset?: [number, number, number];
}

export interface CharacterAsset extends ModelRef {
  /** Taille voulue en mètres : l'échelle est calculée automatiquement si `scale` est absent. */
  height?: number;
  /** Nom des animations dans le fichier. */
  animations?: { idle?: string; walk?: string; run?: string };
}

export interface VehicleAsset extends ModelRef {
  /** false : l'entrée est ignorée, sauf si son nom figure dans l'adresse (?assets=nom). */
  enabled?: boolean;
  /** Modèle du catalogue de base dont on hérite (obligatoire pour un NOUVEAU véhicule). */
  base?: string;
  label?: string;
  length?: number; width?: number; height?: number;
  wheelRadius?: number;
  /** Points de suspension : [x, z] pour arrière gauche, arrière droite, avant gauche, avant droite. */
  wheels?: [number, number][];
  /** true : on garde les roues du jeu (qui tournent et braquent) ; false : le modèle a ses propres roues. */
  keepWheels?: boolean;
  collision?: { halfLength: number; halfWidth: number };
  centerOfGravityHeight?: number;
  handling?: Partial<Handling>;
  colors?: number[];
  /**
   * Nom (ou morceau de nom) du matériau de carrosserie dans le fichier : lui seul prend la couleur du véhicule.
   * Sans indication, on cherche un matériau nommé body, paint, carrosserie ou carpaint.
   */
  paintMaterial?: string;
}

export interface InstanceOptions {
  /** Longueur voulue en mètres : sert à calculer l'échelle quand `scale` est absent du catalogue. */
  length?: number;
  /** Couleur de carrosserie à appliquer au matériau de peinture. */
  paint?: number;
  paintMaterial?: string;
}

export interface AssetCatalog {
  character?: CharacterAsset;
  vehicles?: Record<string, VehicleAsset>;
  props?: Record<string, ModelRef>;
}

const BASE = `${import.meta.env.BASE_URL}assets/`;

class AssetLibrary {
  catalog: AssetCatalog = {};
  // Décodeur Meshopt : les modèles compressés par gltf-transform se chargent sans réglage.
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private flat = new Map<string, THREE.Material>();
  private measured = new Set<string>();
  private cache = new Map<string, Promise<GLTF>>();
  private forced = new Set((new URLSearchParams(window.location.search).get('assets') ?? '').split(',').filter(Boolean));

  /** Lit le catalogue. Sans catalogue, le jeu fonctionne avec ses modèles intégrés. */
  async init(): Promise<void> {
    try {
      const response = await fetch(`${BASE}catalog.json?v=${__BUILD_ID__}`);
      if (response.ok) this.catalog = (await response.json()) as AssetCatalog;
    } catch (error) {
      console.warn('Catalogue de modèles illisible, modèles intégrés conservés.', error);
    }
  }

  /** Véhicules du catalogue actifs. */
  vehicles(): [string, VehicleAsset][] {
    return Object.entries(this.catalog.vehicles ?? {}).filter(([id, asset]) => asset.enabled !== false || this.forced.has(id));
  }

  vehicle(id: string): VehicleAsset | null {
    return this.vehicles().find(([name]) => name === id)?.[1] ?? null;
  }

  /** Charge un fichier une seule fois, même s'il est demandé plusieurs fois. */
  load(path: string): Promise<GLTF> {
    let pending = this.cache.get(path);
    if (!pending) {
      pending = this.loader.loadAsync(`${BASE}${path}?v=${__BUILD_ID__}`);
      this.cache.set(path, pending);
    }
    return pending;
  }

  /** Copie prête à poser d'un modèle statique, avec son échelle, son orientation et son décalage. */
  async instance(ref: ModelRef, options: InstanceOptions = {}): Promise<THREE.Group> {
    const gltf = await this.load(ref.model);
    const holder = new THREE.Group();
    // Un modèle à squelette doit être copié avec son squelette, sinon toutes les copies bougent ensemble.
    let skinned = false;
    gltf.scene.traverse((node) => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
    const copy = skinned ? cloneSkinned(gltf.scene) : gltf.scene.clone(true);

    // Mesure réelle du fichier : on ne devine ni l'échelle ni la position.
    copy.rotation.y = THREE.MathUtils.degToRad(ref.rotationY ?? 0);
    copy.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(copy), size = box.getSize(new THREE.Vector3());
    const scale = ref.scale ?? (options.length ? options.length / (Math.max(size.x, size.z) || 1) : 1);
    copy.scale.setScalar(scale);
    if (ref.offset) copy.position.set(ref.offset[0], ref.offset[1], ref.offset[2]);
    else {
      // Sans décalage imposé : centré, posé au sol.
      const centre = box.getCenter(new THREE.Vector3());
      copy.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
    }
    if (!this.measured.has(ref.model)) {
      this.measured.add(ref.model);
      let triangles = 0;
      copy.traverse((node) => {
        const geometry = (node as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        if (geometry) triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      });
      console.info(`Modèle ${ref.model} : ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} (unités du fichier), échelle ${scale.toFixed(3)}, ${Math.round(triangles)} triangles`);
    }

    // Rendu rétro : matériaux simples (pas de reflets physiques), peinture appliquée à la seule carrosserie.
    const paintName = new RegExp(options.paintMaterial ?? (ref as VehicleAsset).paintMaterial ?? 'body|paint|carrosserie|carpaint', 'i');
    copy.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const convert = (source: THREE.Material): THREE.Material => {
        const painted = options.paint !== undefined && paintName.test(source.name);
        const key = `${ref.model}|${source.uuid}|${painted ? options.paint : ''}`;
        let material = this.flat.get(key);
        if (!material) {
          const from = source as THREE.MeshStandardMaterial;
          material = new THREE.MeshLambertMaterial({
            name: source.name, map: from.map ?? null, color: painted ? options.paint : from.color ?? 0xffffff,
            transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest, side: source.side,
            vertexColors: source.vertexColors,
          });
          this.flat.set(key, material);
        }
        return material;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
    });

    // Roues du modèle (nœuds nommés wheel, roue, tire, tyre) : chacune reçoit un pivot propre en son centre,
    // rangées arrière gauche, arrière droite, avant gauche, avant droite.
    copy.updateWorldMatrix(true, true);
    const named: THREE.Object3D[] = [];
    copy.traverse((node) => { if (/wheel|roue|tire|tyre/i.test(node.name) && !named.some((parent) => isInside(node, parent))) named.push(node); });
    holder.add(copy);
    if (named.length === 4) {
      const pivots = named.map((node) => {
        const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
        const pivot = new THREE.Group();
        pivot.position.copy(centre);
        holder.add(pivot);
        pivot.attach(node);
        return pivot;
      });
      pivots.sort((a, b) => (Math.sign(a.position.z) - Math.sign(b.position.z)) || (b.position.x - a.position.x));
      holder.userData.wheels = pivots;
    }
    return holder;
  }
}

function isInside(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) if (parent === ancestor) return true;
  return false;
}

export const assets = new AssetLibrary();
