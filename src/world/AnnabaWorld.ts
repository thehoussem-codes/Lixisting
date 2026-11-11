import * as THREE from 'three';
import { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import type { WorldData } from './WorldData';

const SKY = 0x9fd0ea;
const CHUNK = 400; // les bâtiments sont regroupés par blocs de 400 m

const AREA_COLORS: Record<string, number> = {
  beach: 0xecd9a0, wood: 0x3e7a3a, scrub: 0x7d9655, grass: 0x86b560, pitch: 0x5fa052, rock: 0x9a968c,
};
const WALL_COLORS = [0xf3ead8, 0xe9d3ae, 0xf5f1e6, 0xd9c7a3, 0xe6b98c, 0xcfd8dc, 0xf0dcc0, 0xdfe6d0];
const ROOF_COLORS = [0xb9b2a3, 0xa9a394, 0xb55d3f, 0xc2bcae];

function layer(color: number, offset: number): THREE.MeshLambertMaterial {
  // polygonOffset : évite le scintillement entre surfaces posées l'une sur l'autre.
  return new THREE.MeshLambertMaterial({
    color, vertexColors: true, polygonOffset: offset !== 0, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4,
  });
}

/** Construit Annaba à partir des données réelles. Renvoie de quoi gérer les collisions. */
export function buildAnnabaWorld(scene: THREE.Scene, data: WorldData): Collider {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 350, 1700);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a888, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.position.set(300, 500, 200);
  scene.add(sun);

  const white = new THREE.Color(0xffffff);
  const add = (builder: MeshBuilder, material: THREE.Material) => {
    if (builder.isEmpty) return;
    scene.add(new THREE.Mesh(builder.build(), material));
  };

  // Mer : un grand plan sous le niveau du sol.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: 0x1c7da6 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.6;
  scene.add(sea);

  // Terre ferme (délimitée par le vrai trait de côte).
  const land = new MeshBuilder();
  for (const ring of data.land) land.flatPolygon(ring, 0, white);
  add(land, layer(0xc9b98f, 0));

  // Plages, bois, pelouses...
  const areas = new MeshBuilder();
  for (const area of data.areas) areas.flatPolygon(area.p, 0.03, new THREE.Color(AREA_COLORS[area.k] ?? 0x999999));
  add(areas, layer(0xffffff, 1));

  // Voies piétonnes puis chaussées (les chaussées passent au-dessus).
  const paths = new MeshBuilder();
  const roads = new MeshBuilder();
  const pathColor = new THREE.Color(0xb8ad98);
  const pavedColor = new THREE.Color(0xc9bfae);
  const asphalt = new THREE.Color(0x3f4046);
  const asphaltMajor = new THREE.Color(0x34353a);
  for (const road of data.roads) {
    if (road.k === 'footway' || road.k === 'path' || road.k === 'steps' || road.k === 'track') {
      paths.ribbon(road.p, road.w, 0.06, pathColor);
    } else if (road.k === 'pedestrian') {
      paths.ribbon(road.p, road.w, 0.06, pavedColor);
    } else {
      roads.ribbon(road.p, road.w, 0.09, road.w >= 10 ? asphaltMajor : asphalt);
    }
  }
  add(paths, layer(0xffffff, 2));
  add(roads, layer(0xffffff, 3));

  const rails = new MeshBuilder();
  const railColor = new THREE.Color(0x5a4a3c);
  for (const rail of data.rails) rails.ribbon(rail.p, 2.2, 0.12, railColor);
  add(rails, layer(0xffffff, 4));

  // Bâtiments : murs + toit plat, regroupés par blocs pour n'afficher que ceux en vue.
  const collider = new Collider();
  const chunks = new Map<string, MeshBuilder>();
  data.buildings.forEach((building, index) => {
    const p = building.p;
    const key = `${Math.floor(p[0] / CHUNK)},${Math.floor(p[1] / CHUNK)}`;
    let builder = chunks.get(key);
    if (!builder) { builder = new MeshBuilder(); chunks.set(key, builder); }

    const wall = new THREE.Color(WALL_COLORS[index % WALL_COLORS.length]);
    const roof = new THREE.Color(ROOF_COLORS[(index * 7) % ROOF_COLORS.length]);
    const h = building.h;
    const count = p.length / 2;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const ax = p[i * 2], az = -p[i * 2 + 1], bx = p[j * 2], bz = -p[j * 2 + 1];
      // Bas du mur assombri : donne du relief sans calcul d'ombres.
      const a = builder.vertex(ax, 0, az, wall, 0.7);
      const b = builder.vertex(bx, 0, bz, wall, 0.7);
      const c = builder.vertex(bx, h, bz, wall);
      const d = builder.vertex(ax, h, az, wall);
      builder.triangle(a, b, c);
      builder.triangle(a, c, d);
    }
    builder.flatPolygon(p, h, roof);
    collider.addBuilding(p);
  });
  const buildingMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const builder of chunks.values()) add(builder, buildingMaterial);

  return collider;
}
