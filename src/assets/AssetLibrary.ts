import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
}

export interface AssetCatalog {
  character?: CharacterAsset;
  vehicles?: Record<string, VehicleAsset>;
  props?: Record<string, ModelRef>;
}

const BASE = `${import.meta.env.BASE_URL}assets/`;

class AssetLibrary {
  catalog: AssetCatalog = {};
  private loader = new GLTFLoader();
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
  async instance(ref: ModelRef): Promise<THREE.Group> {
    const gltf = await this.load(ref.model);
    const holder = new THREE.Group();
    const copy = gltf.scene.clone(true);
    copy.scale.setScalar(ref.scale ?? 1);
    copy.rotation.y = THREE.MathUtils.degToRad(ref.rotationY ?? 0);
    if (ref.offset) copy.position.set(ref.offset[0], ref.offset[1], ref.offset[2]);
    holder.add(copy);
    return holder;
  }
}

export const assets = new AssetLibrary();
