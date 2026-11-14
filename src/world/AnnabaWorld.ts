import * as THREE from 'three';
import type { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import type { Terrain } from './Terrain';
import { buildBuildings } from './Buildings';
import { createAsphaltTexture, createPavementTexture, createRoadTexture, createCloudTexture } from './Textures';
import { addPlant } from './Trees';
import { Water } from './Water';
import { STAIRS_APPROACH } from './SousTerrain';
import { buildLandmarks, type LandmarkEdits } from './Landmarks';
import type { WorldData } from './WorldData';

const HORIZON = 0xd4e2e6;   // brume claire de bord de mer (même teinte que le brouillard)
const FOG_DENSITY = 0.00105; // brouillard exponentiel : 30 % de voile à 500 m, 70 % à 1 km, presque plein à 1,6 km
const ZENITH = 0x2c6fc4;
const SUN_GLOW = 0xffd7a0;   // le ciel se réchauffe du côté du soleil, près de l'horizon
const SUN_POSITION = new THREE.Vector3(400, 380, 150);
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

/** Disque du soleil et son halo. */
function createSunTexture(): THREE.CanvasTexture {
  const element = document.createElement('canvas');
  element.width = element.height = 128;
  const ctx = element.getContext('2d')!;
  const halo = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  halo.addColorStop(0, 'rgba(255,252,235,1)'); halo.addColorStop(0.12, 'rgba(255,246,210,0.95)');
  halo.addColorStop(0.3, 'rgba(255,236,180,0.35)'); halo.addColorStop(1, 'rgba(255,230,170,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Dôme de ciel : bleu soutenu en haut, brume claire à l'horizon (même teinte que le brouillard),
 * halo chaud du côté du soleil. `ground` : couleur sous l'horizon (utile pour le ciel des reflets).
 */
export function createSky(radius = 2000, ground?: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 48, 24);
  const position = geometry.getAttribute('position');
  const colors: number[] = [];
  const low = new THREE.Color(HORIZON), high = new THREE.Color(ZENITH), warm = new THREE.Color(SUN_GLOW), mixed = new THREE.Color();
  const sun = SUN_POSITION.clone().normalize(), dir = new THREE.Vector3();
  const below = ground === undefined ? null : new THREE.Color(ground);
  for (let i = 0; i < position.count; i++) {
    dir.set(position.getX(i), position.getY(i), position.getZ(i)).normalize();
    const t = Math.min(1, Math.max(0, dir.y));
    mixed.copy(low).lerp(high, Math.pow(t, 0.55));
    const facing = Math.max(0, dir.dot(sun));
    mixed.lerp(warm, Math.pow(facing, 6) * (1 - t) * 0.75);
    if (below && dir.y < 0) mixed.lerp(below, Math.min(1, -dir.y * 6));
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
  /** Sol en contrebas des lieux modélisés, arbres à retirer et palmiers à ajouter. */
  edits: LandmarkEdits;
}

/** Construit Annaba à partir des données réelles. */
export function buildAnnabaWorld(scene: THREE.Scene, data: WorldData, terrain: Terrain): World {
  const ground = terrain.heightAt;
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.FogExp2(HORIZON, FOG_DENSITY);
  // Lumière méditerranéenne de fin d'après-midi : soleil chaud et franc, ombres nettement bleutées par le ciel.
  // Avec le rendu filmique (tone mapping), il faut plus de contraste entre soleil et ombre qu'avant.
  scene.add(new THREE.HemisphereLight(0xb9d4ff, 0x8e7d62, 1.05));
  const sun = new THREE.DirectionalLight(0xffe0b0, 3.4);
  sun.position.copy(SUN_POSITION);
  scene.add(sun);
  const sky = createSky();
  scene.add(sky);
  // Soleil et nuages, accrochés au ciel (ils suivent la caméra avec lui).
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: createSunTexture(), fog: false, depthWrite: false, transparent: true }));
  glow.position.copy(sun.position).normalize().multiplyScalar(1700);
  glow.scale.setScalar(520);
  sky.add(glow);
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), new THREE.MeshBasicMaterial({ map: createCloudTexture(), transparent: true, opacity: 0.85, fog: false, depthWrite: false, side: THREE.DoubleSide }));
  clouds.rotation.x = Math.PI / 2;
  clouds.position.y = 620;
  clouds.renderOrder = -1;
  sky.add(clouds);

  // order > 0 : couche plate posée au sol (trottoir, chaussée, carrefour). Elle est dessinée après tout le reste,
  // dans l'ordre donné et sans écrire de profondeur : la chaussée recouvre donc toujours le trottoir, même quand
  // le relief fait passer le trottoir quelques centimètres au-dessus d'elle.
  const add = (builder: MeshBuilder, material: THREE.Material, order = 0) => {
    if (builder.isEmpty) return;
    const mesh = new THREE.Mesh(builder.build(), material);
    if (order > 0) { mesh.renderOrder = order; material.depthWrite = false; }
    scene.add(mesh);
  };

  // Mer animée au niveau 0 ; le terrain descend en pente sous la surface le long du rivage.
  const water = new Water(scene, HORIZON, FOG_DENSITY);

  // Terre ferme en relief ; plages, bois et pelouses sont peints dans ses couleurs.
  scene.add(terrain.mesh);

  // Voies : chemins et trottoirs dessous, chaussées dessus, carrefours par-dessus.
  const white = new THREE.Color(0xffffff);
  const dirt = new THREE.Color(0xa89878);
  const tracks = new MeshBuilder(), walk = new MeshBuilder(), walkFine = new MeshBuilder();
  const minor = new MeshBuilder(), major = new MeshBuilder(), painted = new MeshBuilder(), crossings = new MeshBuilder();
  for (const road of data.roads) {
    if (road.k === 'path' || road.k === 'track') {
      tracks.ribbon(road.p, road.w, 0.1, dirt, ground);
    } else if (road.k === 'footway' || road.k === 'steps') {
      walk.ribbon(road.p, road.w, 0.12, white, ground, 2);
    } else if (road.k === 'pedestrian') {
      walkFine.ribbon(road.p, road.w, 0.12, white, ground, 2);
    } else {
      // Trottoir : pavage soigné le long des avenues, dalles de béton ailleurs.
      const sidewalk = road.sw ?? 0;
      if (WITH_SIDEWALK.has(road.k) && sidewalk > 0.3) (road.w >= 9 ? walkFine : walk).ribbon(road.p, road.w + sidewalk * 2, 0.12, white, ground, 2);
      (road.kp ? painted : road.w >= 8 ? major : minor).ribbon(road.p, road.w, 0.2, white, ground);
    }
  }
  // Carrefours : un disque de trottoir puis un disque d'enrobé nu raccordent les rues entre elles
  // (plus de marquages qui se croisent ni de coins de chaussée manquants).
  for (let i = 0; i < data.junctions.length; i += 4) {
    const x = data.junctions[i], z = -data.junctions[i + 1], r = data.junctions[i + 2], rs = data.junctions[i + 3];
    if (rs > r + 0.3) walk.disc(x, z, rs, 0.12, white, ground, 2);
    crossings.disc(x, z, r + 0.05, 0.2, white, ground, 6);
  }
  add(tracks, layer(1), 1);
  add(walk, layer(2, createPavementTexture(false)), 2);
  add(walkFine, layer(2, createPavementTexture(true)), 3);
  add(minor, layer(3, createRoadTexture(false)), 4);
  add(major, layer(4, createRoadTexture(true)), 5);
  add(painted, layer(4, createRoadTexture(true, true)), 5);
  add(crossings, layer(5, createAsphaltTexture()), 6);

  // Ronds-points réels : îlot central surélevé, bordé de béton, engazonné et planté.
  const islands = new MeshBuilder();
  const grass = new THREE.Color(0x5f9a4a), kerb = new THREE.Color(0xc9c6bd);
  for (let i = 0; i < data.roundabouts.length; i += 3) {
    const x = data.roundabouts[i], z = -data.roundabouts[i + 1], r = data.roundabouts[i + 2];
    islands.disc(x, z, r, 0.42, kerb, ground, 6, 18);
    islands.disc(x, z, r - 0.4, 0.46, grass, ground, 6, 18);
    addPlant(islands, r > 5 ? 'palm' : 'bush', i, x, ground(x, z) + 0.46, z, r > 5 ? 1.1 : 1.3);
    if (r > 7) for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      addPlant(islands, 'bush', i + k + 1, x + Math.cos(a) * r * 0.6, ground(x, z) + 0.46, z + Math.sin(a) * r * 0.6, 0.9);
    }
  }
  add(islands, layer(6));

  const rails = new MeshBuilder();
  const railColor = new THREE.Color(0x5a4a3c);
  for (const rail of data.rails) rails.ribbon(rail.p, 2.2, 0.26, railColor, ground);
  add(rails, layer(7));

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
      const [cx0, cn0, cx1, cn1] = STAIRS_APPROACH;
      if (x > cx0 && x < cx1 && -z > cn0 && -z < cn1) continue; // devant le grand escalier du Sous-Terrain
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
  const edits = buildLandmarks(scene, data, ground, collider, terrain);

  return { collider, sky, water, edits };
}
