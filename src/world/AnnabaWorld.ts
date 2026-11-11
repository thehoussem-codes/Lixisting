import * as THREE from 'three';
import { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import type { Terrain } from './Terrain';
import { createFacadeTexture, createPavementTexture, createRoadTexture, type FacadeStyle } from './Textures';
import type { WorldData } from './WorldData';

const HORIZON = 0xbfe0ee;
const ZENITH = 0x3f8fd0;
const CHUNK = 400;         // les bâtiments sont regroupés par blocs de 400 m
const WINDOW_WIDTH = 3.2;  // une travée de façade tous les 3,2 m de mur
const FLOOR_HEIGHT = 3;    // un étage tous les 3 m
const SIDEWALK = 1.8;      // largeur de trottoir de chaque côté (m), valeur générique

const WALLS: Record<FacadeStyle, number[]> = {
  apartment: [0xf3ead8, 0xe9d3ae, 0xf5f1e6, 0xd9c7a3, 0xf0dcc0, 0xe2ddd0, 0xead9b8],
  house: [0xfaf5ea, 0xf3e2c0, 0xf7efe0, 0xe8c9a0, 0xf2d9b0, 0xffffff],
  modern: [0xe3e6e8, 0xd4dadf, 0xeef0f0, 0xcdd6dc],
};
const ROOFS: Record<FacadeStyle, number[]> = {
  apartment: [0xb9b2a3, 0xa9a394, 0xc2bcae, 0xb55d3f],
  house: [0xb55d3f, 0xc0694a, 0xa9523a, 0xc8c0b0],
  modern: [0x9a9c9e, 0xaeb0b2],
};
const WITH_SIDEWALK = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);

/** Matériau d'une couche posée au sol. offset : évite le scintillement entre couches superposées. */
function layer(offset: number, map?: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    vertexColors: true, map, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4,
  });
}

function footprintArea(p: number[]): number {
  let sum = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) sum += p[j] * p[i + 1] - p[i] * p[j + 1];
  return Math.abs(sum / 2);
}

/** Dôme de ciel : bleu soutenu en haut, brume claire à l'horizon (même teinte que le brouillard). */
function createSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(2000, 24, 12);
  const position = geometry.getAttribute('position');
  const colors: number[] = [];
  const low = new THREE.Color(HORIZON), high = new THREE.Color(ZENITH), mixed = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const t = Math.min(1, Math.max(0, position.getY(i) / 2000));
    mixed.copy(low).lerp(high, Math.pow(t, 0.6));
    colors.push(mixed.r, mixed.g, mixed.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

export interface World {
  collider: Collider;
  /** Le ciel doit rester centré sur la caméra. */
  sky: THREE.Mesh;
}

/** Construit Annaba à partir des données réelles. */
export function buildAnnabaWorld(scene: THREE.Scene, data: WorldData, terrain: Terrain): World {
  const ground = terrain.heightAt;
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 300, 1700);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a888, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(400, 500, 150);
  scene.add(sun);
  const sky = createSky();
  scene.add(sky);

  const add = (builder: MeshBuilder, material: THREE.Material) => {
    if (builder.isEmpty) return;
    scene.add(new THREE.Mesh(builder.build(), material));
  };

  // Mer : un grand plan au niveau 0 (la terre est toujours au-dessus).
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: 0x1a6f9c }));
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);

  // Terre ferme en relief ; plages, bois et pelouses sont peints dans ses couleurs.
  scene.add(terrain.mesh);

  // Voies : trottoirs et chemins dessous, chaussées dessus.
  const white = new THREE.Color(0xffffff);
  const dirt = new THREE.Color(0xa89878);
  const pavement = new MeshBuilder(), tracks = new MeshBuilder(), minor = new MeshBuilder(), major = new MeshBuilder();
  for (const road of data.roads) {
    if (road.k === 'path' || road.k === 'track') {
      tracks.ribbon(road.p, road.w, 0.1, dirt, ground);
    } else if (road.k === 'footway' || road.k === 'steps' || road.k === 'pedestrian') {
      pavement.ribbon(road.p, road.w, 0.12, white, ground, 2);
    } else {
      if (WITH_SIDEWALK.has(road.k)) pavement.ribbon(road.p, road.w + SIDEWALK * 2, 0.12, white, ground, 2);
      (road.w >= 8 ? major : minor).ribbon(road.p, road.w, 0.2, white, ground);
    }
  }
  add(tracks, layer(1));
  add(pavement, layer(2, createPavementTexture()));
  add(minor, layer(3, createRoadTexture(false)));
  add(major, layer(4, createRoadTexture(true)));

  const rails = new MeshBuilder();
  const railColor = new THREE.Color(0x5a4a3c);
  for (const rail of data.rails) rails.ribbon(rail.p, 2.2, 0.26, railColor, ground);
  add(rails, layer(5));

  // Bâtiments : murs texturés + toit plat, regroupés par style et par bloc.
  const collider = new Collider();
  const walls = new Map<string, MeshBuilder>();
  const roofs = new Map<string, MeshBuilder>();
  const builderIn = (map: Map<string, MeshBuilder>, key: string): MeshBuilder => {
    let builder = map.get(key);
    if (!builder) { builder = new MeshBuilder(); map.set(key, builder); }
    return builder;
  };
  data.buildings.forEach((building, index) => {
    const p = building.p;
    const count = p.length / 2;
    // Style déduit de la taille : petit et bas = maison ; haut = immeuble ou moderne.
    let style: FacadeStyle = 'apartment';
    if (building.h >= 19 && index % 3 === 0) style = 'modern';
    else if (building.h <= 10 && footprintArea(p) < 170) style = 'house';
    const cell = `${Math.floor(p[0] / CHUNK)},${Math.floor(p[1] / CHUNK)}`;
    const builder = builderIn(walls, `${style}|${cell}`);
    const wall = new THREE.Color(WALLS[style][index % WALLS[style].length]);
    const roof = new THREE.Color(ROOFS[style][(index * 7) % ROOFS[style].length]);

    // Sur une pente : le bâtiment s'enfonce jusqu'au point le plus bas et dépasse du point le plus haut.
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < count; i++) {
      const g = ground(p[i * 2], -p[i * 2 + 1]);
      low = Math.min(low, g); high = Math.max(high, g);
    }
    const bottom = low - 1, top = high + building.h;
    const floors = Math.max(1, Math.round((top - bottom) / FLOOR_HEIGHT));
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const ax = p[i * 2], az = -p[i * 2 + 1], bx = p[j * 2], bz = -p[j * 2 + 1];
      // Nombre entier de travées par mur : pas de fenêtre coupée.
      const u = Math.round(Math.hypot(bx - ax, bz - az) / WINDOW_WIDTH);
      // Bas du mur assombri : donne du relief sans calcul d'ombres.
      const a = builder.vertex(ax, bottom, az, wall, 0.72, 0, 0);
      const b = builder.vertex(bx, bottom, bz, wall, 0.72, u, 0);
      const c = builder.vertex(bx, top, bz, wall, 1, u, floors);
      const d = builder.vertex(ax, top, az, wall, 1, 0, floors);
      builder.triangle(a, b, c);
      builder.triangle(a, c, d);
    }
    builderIn(roofs, cell).flatPolygon(p, top, roof);
    collider.addBuilding(p);
  });
  const wallMaterials = {} as Record<FacadeStyle, THREE.Material>;
  for (const style of ['apartment', 'house', 'modern'] as FacadeStyle[]) {
    wallMaterials[style] = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: createFacadeTexture(style) });
  }
  for (const [key, builder] of walls) add(builder, wallMaterials[key.split('|')[0] as FacadeStyle]);
  const roofMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const builder of roofs.values()) add(builder, roofMaterial);

  return { collider, sky };
}
