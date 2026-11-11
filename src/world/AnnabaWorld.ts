import * as THREE from 'three';
import { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import type { Terrain } from './Terrain';
import type { WorldData } from './WorldData';

const SKY = 0x9fd0ea;
const CHUNK = 400; // les bâtiments sont regroupés par blocs de 400 m

const WALL_COLORS = [0xf3ead8, 0xe9d3ae, 0xf5f1e6, 0xd9c7a3, 0xe6b98c, 0xcfd8dc, 0xf0dcc0, 0xdfe6d0];
const ROOF_COLORS = [0xb9b2a3, 0xa9a394, 0xb55d3f, 0xc2bcae];

const WINDOW_WIDTH = 3.2;  // un motif de fenêtre tous les 3,2 m de mur
const FLOOR_HEIGHT = 3;    // et un étage tous les 3 m

/**
 * Texture de façade dessinée par code : un mur clair avec une fenêtre.
 * Elle est répétée sur tous les murs et teintée par la couleur du bâtiment.
 * Façades GÉNÉRIQUES : elles ne reproduisent pas encore les vraies façades.
 */
function createFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#d9d9d9';           // ligne de dalle entre deux étages
  ctx.fillRect(0, 60, 64, 4);
  ctx.fillStyle = '#9aa0a6';           // encadrement
  ctx.fillRect(18, 12, 28, 36);
  ctx.fillStyle = '#35506a';           // vitre
  ctx.fillRect(21, 15, 22, 30);
  ctx.fillStyle = '#5f7f9c';           // reflet
  ctx.fillRect(21, 15, 22, 9);
  ctx.fillStyle = '#9aa0a6';           // montant central
  ctx.fillRect(31, 15, 2, 30);
  ctx.fillStyle = '#b8b8b8';           // appui de fenêtre
  ctx.fillRect(15, 48, 34, 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter; // gros pixels nets : le rendu rétro
  return texture;
}

function layer(color: number, offset: number): THREE.MeshLambertMaterial {
  // polygonOffset : évite le scintillement entre surfaces posées l'une sur l'autre.
  return new THREE.MeshLambertMaterial({
    color, vertexColors: true, polygonOffset: offset !== 0, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4,
  });
}

/** Construit Annaba à partir des données réelles. Renvoie de quoi gérer les collisions. */
export function buildAnnabaWorld(scene: THREE.Scene, data: WorldData, terrain: Terrain): Collider {
  const ground = terrain.heightAt;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 350, 1700);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a888, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.position.set(300, 500, 200);
  scene.add(sun);

  const add = (builder: MeshBuilder, material: THREE.Material) => {
    if (builder.isEmpty) return;
    scene.add(new THREE.Mesh(builder.build(), material));
  };

  // Mer : un grand plan au niveau 0 (la terre est toujours au-dessus).
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: 0x1c7da6 }));
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);

  // Terre ferme en relief ; plages, bois et pelouses sont peints dans ses couleurs.
  scene.add(terrain.mesh);

  // Voies piétonnes puis chaussées (les chaussées passent au-dessus).
  const paths = new MeshBuilder();
  const roads = new MeshBuilder();
  const pathColor = new THREE.Color(0xb8ad98);
  const pavedColor = new THREE.Color(0xc9bfae);
  const asphalt = new THREE.Color(0x3f4046);
  const asphaltMajor = new THREE.Color(0x34353a);
  for (const road of data.roads) {
    if (road.k === 'footway' || road.k === 'path' || road.k === 'steps' || road.k === 'track') {
      paths.ribbon(road.p, road.w, 0.12, pathColor, ground);
    } else if (road.k === 'pedestrian') {
      paths.ribbon(road.p, road.w, 0.12, pavedColor, ground);
    } else {
      roads.ribbon(road.p, road.w, 0.18, road.w >= 10 ? asphaltMajor : asphalt, ground);
    }
  }
  add(paths, layer(0xffffff, 2));
  add(roads, layer(0xffffff, 3));

  const rails = new MeshBuilder();
  const railColor = new THREE.Color(0x5a4a3c);
  for (const rail of data.rails) rails.ribbon(rail.p, 2.2, 0.24, railColor, ground);
  add(rails, layer(0xffffff, 4));

  // Bâtiments : murs + toit plat, regroupés par blocs pour n'afficher que ceux en vue.
  const collider = new Collider();
  const chunks = new Map<string, MeshBuilder>();
  const roofChunks = new Map<string, MeshBuilder>();
  data.buildings.forEach((building, index) => {
    const p = building.p;
    const key = `${Math.floor(p[0] / CHUNK)},${Math.floor(p[1] / CHUNK)}`;
    let builder = chunks.get(key);
    if (!builder) { builder = new MeshBuilder(); chunks.set(key, builder); }
    let roofBuilder = roofChunks.get(key);
    if (!roofBuilder) { roofBuilder = new MeshBuilder(); roofChunks.set(key, roofBuilder); }

    const wall = new THREE.Color(WALL_COLORS[index % WALL_COLORS.length]);
    const roof = new THREE.Color(ROOF_COLORS[(index * 7) % ROOF_COLORS.length]);
    const count = p.length / 2;
    // Sur une pente : le bâtiment s'enfonce jusqu'au point le plus bas et dépasse du point le plus haut.
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < count; i++) {
      const g = ground(p[i * 2], -p[i * 2 + 1]);
      low = Math.min(low, g); high = Math.max(high, g);
    }
    const bottom = low - 1, top = high + building.h, h = top - bottom;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const ax = p[i * 2], az = -p[i * 2 + 1], bx = p[j * 2], bz = -p[j * 2 + 1];
      // Bas du mur assombri : donne du relief sans calcul d'ombres.
      // Nombre entier de fenêtres par mur et d'étages par bâtiment : pas de fenêtre coupée.
      const u = Math.round(Math.hypot(bx - ax, bz - az) / WINDOW_WIDTH);
      const v = Math.max(1, Math.round(h / FLOOR_HEIGHT));
      const a = builder.vertex(ax, bottom, az, wall, 0.7, 0, 0);
      const b = builder.vertex(bx, bottom, bz, wall, 0.7, u, 0);
      const c = builder.vertex(bx, top, bz, wall, 1, u, v);
      const d = builder.vertex(ax, top, az, wall, 1, 0, v);
      builder.triangle(a, b, c);
      builder.triangle(a, c, d);
    }
    roofBuilder.flatPolygon(p, top, roof);
    collider.addBuilding(p);
  });
  const wallMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: createFacadeTexture() });
  const roofMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const builder of chunks.values()) add(builder, wallMaterial);
  for (const builder of roofChunks.values()) add(builder, roofMaterial);

  return collider;
}
