import * as THREE from 'three';
import type { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import type { Terrain } from './Terrain';
import { buildBuildings } from './Buildings';
import { createPavementTexture, createRoadTexture } from './Textures';
import { Water } from './Water';
import type { WorldData } from './WorldData';

const HORIZON = 0xbfe0ee;
const FOG_NEAR = 260, FOG_FAR = 1400;
const ZENITH = 0x3f8fd0;
const CHUNK = 400;         // les bâtiments sont regroupés par blocs de 400 m

const WITH_SIDEWALK = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);

/** Matériau d'une couche posée au sol. offset : évite le scintillement entre couches superposées. */
function layer(offset: number, map?: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    vertexColors: true, map, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4,
  });
}

/** Lampadaire : mât fin et tête lumineuse. */
function lampPost(b: MeshBuilder, x: number, y: number, z: number, pole: THREE.Color, bulb: THREE.Color): void {
  for (const [half, y0, y1, color] of [[0.09, y - 0.3, y + 8, pole], [0.38, y + 8, y + 8.3, bulb]] as [number, number, number, THREE.Color][]) {
    const c = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
      const v0 = b.vertex(ax, y0, az, color, 0.85), v1 = b.vertex(bx, y0, bz, color, 0.85);
      const v2 = b.vertex(bx, y1, bz, color), v3 = b.vertex(ax, y1, az, color);
      b.triangle(v0, v1, v2); b.triangle(v0, v2, v3);
    }
  }
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
  water: Water;
}

/** Construit Annaba à partir des données réelles. */
export function buildAnnabaWorld(scene: THREE.Scene, data: WorldData, terrain: Terrain): World {
  const ground = terrain.heightAt;
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, FOG_NEAR, FOG_FAR);
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

  // Mer animée au niveau 0 ; le terrain descend en pente sous la surface le long du rivage.
  const water = new Water(scene, HORIZON, FOG_NEAR, FOG_FAR);

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
      if (WITH_SIDEWALK.has(road.k) && (road.sw ?? 0) > 0.3) pavement.ribbon(road.p, road.w + (road.sw ?? 0) * 2, 0.12, white, ground, 2);
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

  // Lampadaires le long des grands axes, tous les 40 m, en alternant les côtés.
  // Leur emplacement exact est générique (OSM ne les répertorie pas ici).
  const lampColor = new THREE.Color(0x6f7478), bulbColor = new THREE.Color(0xfff4c2);
  const lamps = new Map<string, MeshBuilder>();
  let lampSide = 1;
  for (const road of data.roads) {
    if (road.w < 9 || road.k === 'trunk') continue;
    let since = 20;
    for (let i = 2; i < road.p.length; i += 2) {
      const ax = road.p[i - 2], an = road.p[i - 1], bx = road.p[i], bn = road.p[i + 1];
      const length = Math.hypot(bx - ax, bn - an);
      since += length;
      if (since < 40 || length < 0.01) continue;
      since = 0;
      lampSide = -lampSide;
      const offset = (road.w / 2 + 1.0) * lampSide;
      const x = bx + (-(bn - an) / length) * offset, z = -(bn + ((bx - ax) / length) * offset);
      const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
      let builder = lamps.get(key);
      if (!builder) { builder = new MeshBuilder(); lamps.set(key, builder); }
      const y = ground(x, z);
      lampPost(builder, x, y, z, lampColor, bulbColor);
    }
  }
  const lampMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const builder of lamps.values()) add(builder, lampMaterial);

  const collider = buildBuildings(scene, data, ground);

  return { collider, sky, water };
}
