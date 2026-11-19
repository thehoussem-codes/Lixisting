import * as THREE from 'three';
import { MOBILE } from '../engine/Mobile';
import type { Collider } from './Collider';
import { MeshBuilder } from './MeshBuilder';
import { FACADE_WIDTH, type FacadeStyle, createFacadeTexture, createFoliageTexture, createGroundTexture, createRoadTexture } from './Textures';
import { addPlant } from './Trees';

/**
 * Toute la wilaya d'Annaba (et ses abords), en détail léger, autour de la ville détaillée.
 * Données faites par tools/build_region.py : relief et sol au pas de 60 m (region.png), routes principales et
 * rues des villes, voies ferrées, rivières, lacs, pistes d'aéroport, villes et villages (region.json), bâtiments
 * réels (OSM et détections sur images aériennes) en boîtes orientées (region_buildings.bin).
 *
 * Rien n'est construit au chargement : le pays est découpé en cases de 1 km, bâties au fur et à mesure autour du
 * joueur (une par image) et libérées quand il s'éloigne. Dans le rectangle de la ville, c'est le terrain détaillé
 * qui commande ; les cases du bord passent un peu sous lui pour qu'aucune fente n'apparaisse au raccord.
 */

export interface RegionPlace { name: string; k: string; x: number; n: number; ar?: string; pop?: number }

export interface RegionData {
  meta: {
    rect_m: number[]; city_rect_m: number[];
    relief: { x0: number; n0: number; step: number; cols: number; rows: number };
    tiles: { size: number; cols: number; rows: number };
    buildings: number; roads: number;
  };
  land: number[][];
  roads: { k: string; w: number; p: number[]; n?: string; b?: number }[];
  rails: { p: number[] }[];
  rivers: { w: number; p: number[] }[];
  lakes: number[][];
  wetlands: number[][];
  runways: { w: number; p: number[] }[];
  places: RegionPlace[];
  boundaries: { name: string; rings: number[][] }[];
}

const VIEW = MOBILE ? 850 : 1400;            // même portée que le reste du décor (brouillard)
const BUILD_REACH = VIEW + (MOBILE ? 450 : 900);   // une case est construite avant d'entrer dans le champ de vision
const DROP_REACH = VIEW + (MOBILE ? 1200 : 2200);   // et libérée quand on s'en est bien éloigné
const TREE_REACH = MOBILE ? 650 : 950;       // arbres affichés jusqu'à cette distance du centre de la case
const LOWER_IN_CITY = 0.15;                  // les cases du bord passent sous le terrain détaillé de la ville
const SURFACE = 0.2;                         // chaussées posées 20 cm au-dessus du relief (comme en ville)

// Couleurs du sol selon la classe ESA WorldCover (mêmes teintes que tools/build_terrain.py).
const COVER: Record<number, [number, number, number]> = {
  10: [0.22, 0.40, 0.18], 20: [0.42, 0.50, 0.27], 30: [0.55, 0.62, 0.36], 40: [0.66, 0.64, 0.44],
  50: [0.60, 0.58, 0.54], 60: [0.70, 0.65, 0.52], 80: [0.62, 0.60, 0.50], 90: [0.45, 0.52, 0.35], 95: [0.40, 0.50, 0.33], 100: [0.55, 0.60, 0.42],
};
const SAND: [number, number, number] = [0.90, 0.82, 0.60], SEABED: [number, number, number] = [0.66, 0.61, 0.46], CLIFF: [number, number, number] = [0.52, 0.47, 0.40];
const HOUSE_WALLS = [0xfaf5ea, 0xf3e2c0, 0xf7efe0, 0xe8c9a0, 0xf2d9b0, 0xffffff, 0xeec7a6, 0xf5e6b0];
const BLOCK_WALLS = [0xf6efe0, 0xecd2a4, 0xfaf6ec, 0xe7c08e, 0xf1d9b8, 0xebe6dc, 0xf3dfa8];
const ROOFS = [0xb9b2a3, 0xa9a394, 0xc2bcae, 0xb55d3f, 0xa9523a];

function layer(offset: number, map?: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4, ...(map ? { map } : {}) });
}

/** Petit hachage stable (0 à 1) d'un entier et d'une graine. */
function hash(i: number, seed: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed + 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

async function loadPixels(url: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
}

interface Tile {
  key: number; tx: number; tn: number; cx: number; cz: number;
  meshes: THREE.Mesh[]; trees: THREE.Mesh[];
}

export class Region {
  readonly heights: Float32Array;
  readonly cover: Uint8Array;
  private x0: number; private n0: number; private step: number; private cols: number; private rows: number;
  private city: number[];
  private tileSize: number; private tileCols: number; private tileRows: number; private tx0: number; private tn0: number;
  private tileOffsets: Uint32Array; private records: DataView; private recordStart: number;
  /** Morceaux de routes par case : [route, premier point, dernier point]. */
  private roadRuns = new Map<number, [number, number, number][]>();
  private lakeTiles = new Map<number, number[]>();
  private tiles = new Map<number, Tile>();
  private scene: THREE.Scene | null = null;
  private collider: Collider | null = null;
  private colliderDone = new Set<number>();
  private materials: Record<string, THREE.Material> = {};

  private constructor(readonly data: RegionData, pixels: { data: Uint8ClampedArray; width: number; height: number }, buildings: ArrayBuffer) {
    const r = data.meta.relief;
    this.x0 = r.x0; this.n0 = r.n0; this.step = r.step; this.cols = r.cols; this.rows = r.rows;
    this.city = data.meta.city_rect_m;
    this.heights = new Float32Array(this.cols * this.rows);
    this.cover = new Uint8Array(this.cols * this.rows);
    // Image : ligne 0 = SUD (même sens que la grille), R * 256 + G = décimètres + 32768, B = classe du sol.
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) {
      const i = (row * pixels.width + col) * 4, k = row * this.cols + col;
      this.heights[k] = ((pixels.data[i] << 8 | pixels.data[i + 1]) - 32768) / 10;
      this.cover[k] = pixels.data[i + 2];
    }
    const view = new DataView(buildings);
    this.tileCols = view.getUint32(4, true); this.tileRows = view.getUint32(8, true);
    this.tx0 = view.getFloat32(12, true); this.tn0 = view.getFloat32(16, true); this.tileSize = view.getFloat32(20, true);
    this.tileOffsets = new Uint32Array(this.tileCols * this.tileRows + 1);
    for (let i = 0; i <= this.tileCols * this.tileRows; i++) this.tileOffsets[i] = view.getUint32(24 + i * 4, true);
    this.records = view;
    this.recordStart = 24 + (this.tileCols * this.tileRows + 1) * 4;
    // Routes : chaque segment va dans la case qui contient son milieu ; les segments qui se suivent dans une même
    // case forment un morceau (les morceaux voisins partagent leur point de raccord : pas de trou).
    data.roads.forEach((road, index) => {
      const p = road.p, count = p.length / 2;
      let start = 0, current = -2;
      for (let s = 0; s + 1 < count; s++) {
        const key = this.tileKey((p[s * 2] + p[s * 2 + 2]) / 2, (p[s * 2 + 1] + p[s * 2 + 3]) / 2);
        if (key !== current) {
          if (current >= 0) this.pushRun(current, index, start, s);
          current = key; start = s;
        }
      }
      if (current >= 0) this.pushRun(current, index, start, count - 1);
    });
    data.lakes.forEach((ring, index) => {
      const key = this.tileKey(ring[0], ring[1]);
      const list = this.lakeTiles.get(key);
      if (list) list.push(index); else this.lakeTiles.set(key, [index]);
    });
  }

  static async load(base: string, version: string): Promise<Region> {
    const [data, pixels, buildings] = await Promise.all([
      fetch(`${base}world/region.json?v=${version}`).then((r) => { if (!r.ok) throw new Error(`region.json : ${r.status}`); return r.json() as Promise<RegionData>; }),
      loadPixels(`${base}world/region.png?v=${version}`),
      fetch(`${base}world/region_buildings.bin?v=${version}`).then((r) => { if (!r.ok) throw new Error(`region_buildings.bin : ${r.status}`); return r.arrayBuffer(); }),
    ]);
    return new Region(data, pixels, buildings);
  }

  private pushRun(key: number, road: number, from: number, to: number): void {
    if (to <= from) return;
    const list = this.roadRuns.get(key);
    if (list) list.push([road, from, to]); else this.roadRuns.set(key, [[road, from, to]]);
  }

  private tileKey(x: number, n: number): number {
    const tx = Math.floor((x - this.tx0) / this.tileSize), tn = Math.floor((n - this.tn0) / this.tileSize);
    if (tx < 0 || tn < 0 || tx >= this.tileCols || tn >= this.tileRows) return -1;
    return tn * this.tileCols + tx;
  }

  /** Vrai dans le rectangle de la ville détaillée (x, n). */
  inCity(x: number, n: number): boolean {
    return x > this.city[0] && x < this.city[2] && n > this.city[1] && n < this.city[3];
  }

  /** Dans la zone couverte par le relief léger. */
  covers(x: number, n: number): boolean {
    return x >= this.x0 && n >= this.n0 && x <= this.x0 + (this.cols - 1) * this.step && n <= this.n0 + (this.rows - 1) * this.step;
  }

  private h(col: number, row: number): number {
    return this.heights[Math.min(this.rows - 1, Math.max(0, row)) * this.cols + Math.min(this.cols - 1, Math.max(0, col))];
  }

  /**
   * Altitude du relief léger en x, z (monde), interpolée exactement comme le maillage dessiné (deux triangles par
   * case de 60 m, diagonale sud-ouest → nord-est) : une voiture ne flotte ni ne s'enfonce.
   */
  height = (x: number, z: number): number => {
    const fx = (x - this.x0) / this.step, fy = (-z - this.n0) / this.step;
    const j = Math.floor(fx), i = Math.floor(fy), ax = fx - j, ay = fy - i;
    const a = this.h(j, i), b = this.h(j + 1, i), c = this.h(j + 1, i + 1), d = this.h(j, i + 1);
    return ax >= ay ? a + (b - a) * ax + (c - b) * ay : a + (d - a) * ay + (c - d) * ax;
  };

  /** Point de chaussée le plus proche (milieu d'un segment), avec le sens de la route et sa largeur. */
  nearestRoad(x: number, n: number, reach = 400): { x: number; n: number; heading: number; w: number } | null {
    let best = reach, found: { x: number; n: number; heading: number; w: number } | null = null;
    for (const road of this.data.roads) {
      const p = road.p;
      if (Math.abs(p[0] - x) > 5000 || Math.abs(p[1] - n) > 5000) continue;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const mx = (p[i] + p[i + 2]) / 2, mn = (p[i + 1] + p[i + 3]) / 2;
        const d = Math.hypot(mx - x, mn - n);
        if (d < best) { best = d; found = { x: mx, n: mn, heading: Math.atan2(p[i + 2] - p[i], -(p[i + 3] - p[i + 1])), w: road.w }; }
      }
    }
    return found;
  }

  /** Classe du sol (WorldCover) la plus proche. */
  coverAt(x: number, n: number): number {
    const j = Math.round((x - this.x0) / this.step), i = Math.round((n - this.n0) / this.step);
    if (j < 0 || i < 0 || j >= this.cols || i >= this.rows) return 0;
    return this.cover[i * this.cols + j];
  }

  /** À appeler une fois : la scène où poser les cases et le collisionneur où ranger les bâtiments. */
  attach(scene: THREE.Scene, collider: Collider): void {
    this.scene = scene;
    this.collider = collider;
    // Décalage en profondeur : là où une case du bord recouvre le terrain de la ville, c'est la ville qui gagne.
    this.materials.ground = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: createGroundTexture(),
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
    this.materials.minor = layer(3, createRoadTexture(false));
    this.materials.major = layer(4, createRoadTexture(true));
    this.materials.plain = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.materials.water = layer(1);
    this.materials.leaves = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: createFoliageTexture(), alphaTest: 0.4 });
  }

  private facade(style: FacadeStyle): THREE.Material {
    return (this.materials[style] ??= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: createFacadeTexture(style) }));
  }

  /** Construit les cases proches (au plus une par appel, sauf `budget` plus large), libère les lointaines. */
  update(x: number, z: number, budget = 6): void {
    if (!this.scene) return;
    const start = performance.now();
    for (const tile of this.tiles.values()) {
      const d = Math.hypot(tile.cx - x, tile.cz - z);
      if (d > DROP_REACH) { this.drop(tile); continue; }
      for (const mesh of tile.meshes) mesh.visible = d < VIEW + 720;
      for (const mesh of tile.trees) mesh.visible = d < TREE_REACH;
    }
    const n = -z;
    const reach = Math.ceil(BUILD_REACH / this.tileSize);
    const ctx = Math.floor((x - this.tx0) / this.tileSize), ctn = Math.floor((n - this.tn0) / this.tileSize);
    const wanted: [number, number, number][] = [];
    for (let dn = -reach; dn <= reach; dn++) for (let dx = -reach; dx <= reach; dx++) {
      const tx = ctx + dx, tn = ctn + dn;
      if (tx < 0 || tn < 0 || tx >= this.tileCols || tn >= this.tileRows) continue;
      const key = tn * this.tileCols + tx;
      if (this.tiles.has(key)) continue;
      const cx = this.tx0 + (tx + 0.5) * this.tileSize, cn = this.tn0 + (tn + 0.5) * this.tileSize;
      const d = Math.hypot(cx - x, cn - n);
      if (d < BUILD_REACH) wanted.push([d, tx, tn]);
    }
    wanted.sort((a, b) => a[0] - b[0]);
    for (const [, tx, tn] of wanted) {
      this.build(tx, tn);
      if (performance.now() - start > budget) break;
    }
  }

  /** Nombre de cases construites (essais). */
  get built(): number { return this.tiles.size; }

  private drop(tile: Tile): void {
    for (const mesh of [...tile.meshes, ...tile.trees]) { this.scene?.remove(mesh); mesh.geometry.dispose(); }
    this.tiles.delete(tile.key);
  }

  private add(tile: Tile, builder: MeshBuilder, material: THREE.Material, order = 0, trees = false): void {
    if (builder.isEmpty) return;
    const mesh = new THREE.Mesh(builder.build(), material);
    if (order) mesh.renderOrder = order;
    mesh.castShadow = !order;
    mesh.receiveShadow = true;
    this.scene!.add(mesh);
    (trees ? tile.trees : tile.meshes).push(mesh);
  }

  private build(tx: number, tn: number): void {
    const key = tn * this.tileCols + tx, size = this.tileSize;
    const ox = this.tx0 + tx * size, on = this.tn0 + tn * size;
    const tile: Tile = { key, tx, tn, cx: ox + size / 2, cz: -(on + size / 2), meshes: [], trees: [] };
    this.tiles.set(key, tile);
    const [cx0, cn0, cx1, cn1] = this.city;

    // --- relief : les cases de 60 m dont le coin sud-ouest est dans la case de 1 km
    const j0 = Math.ceil((ox - this.x0) / this.step), j1 = Math.ceil((ox + size - this.x0) / this.step);
    const i0 = Math.ceil((on - this.n0) / this.step), i1 = Math.ceil((on + size - this.n0) / this.step);
    const ground = new MeshBuilder();
    const ids = new Map<number, number>();
    const color = new THREE.Color();
    const vertexAt = (j: number, i: number): number => {
      const k = i * (this.cols + 1) + j;
      const known = ids.get(k);
      if (known !== undefined) return known;
      const x = this.x0 + j * this.step, n = this.n0 + i * this.step;
      let y = this.h(j, i);
      if (this.inCity(x, n)) y -= LOWER_IN_CITY;
      const cls = this.cover[Math.min(this.rows - 1, i) * this.cols + Math.min(this.cols - 1, j)];
      const slope = Math.max(Math.abs(this.h(j + 1, i) - this.h(j - 1, i)), Math.abs(this.h(j, i + 1) - this.h(j, i - 1))) / (2 * this.step);
      let rgb = COVER[cls] ?? COVER[30];
      if (y < 0.2) rgb = SEABED;
      else if (y < 3 && (this.h(j + 1, i) < 0 || this.h(j - 1, i) < 0 || this.h(j, i + 1) < 0 || this.h(j, i - 1) < 0)) rgb = SAND;
      else if (slope > 0.6) rgb = CLIFF;
      const shade = (0.92 + 0.16 * Math.min(1, Math.max(0, y / 250))) * (1 + 0.06 * Math.sin(x * 0.031) * Math.cos(n * 0.027));
      color.setRGB(rgb[0], rgb[1], rgb[2]);
      const id = ground.vertex(x, y, -n, color, shade, x / 14, -n / 14);
      ids.set(k, id);
      return id;
    };
    for (let i = i0; i < Math.min(i1, this.rows - 1); i++) for (let j = j0; j < Math.min(j1, this.cols - 1); j++) {
      const xa = this.x0 + j * this.step, na = this.n0 + i * this.step, xb = xa + this.step, nb = na + this.step;
      if (xa >= cx0 && xb <= cx1 && na >= cn0 && nb <= cn1) continue;    // entièrement dans la ville détaillée
      const ha = this.h(j, i), hb = this.h(j + 1, i), hc = this.h(j + 1, i + 1), hd = this.h(j, i + 1);
      if (Math.max(ha, hb, hc, hd) < -40) continue;                       // grand fond : la mer y est opaque
      const a = vertexAt(j, i), b = vertexAt(j + 1, i), c = vertexAt(j + 1, i + 1), d = vertexAt(j, i + 1);
      ground.triangle(a, b, c); ground.triangle(a, c, d);
    }
    this.add(tile, ground, this.materials.ground);

    // --- routes, rivières, lacs
    const minor = new MeshBuilder(), major = new MeshBuilder(), water = new MeshBuilder();
    const white = new THREE.Color(0xffffff), blue = new THREE.Color(0x4f8396);
    const roadCells = new Set<number>();   // cases de 8 m occupées par une chaussée (pour ne pas y planter d'arbre)
    for (const [index, from, to] of this.roadRuns.get(key) ?? []) {
      const road = this.data.roads[index];
      const line = this.densify(road.p, from, to, 8);
      let ground = (gx: number, gz: number) => this.surface(gx, gz);
      if (road.b) {
        // Pont : la chaussée va en ligne droite d'une rive à l'autre, au-dessus du relief.
        const ya = this.surface(line[0], -line[1]), yb = this.surface(line[line.length - 2], -line[line.length - 1]);
        const total = Math.hypot(line[line.length - 2] - line[0], line[line.length - 1] - line[1]) || 1;
        ground = (gx, gz) => Math.max(this.surface(gx, gz), ya + (yb - ya) * Math.min(1, Math.hypot(gx - line[0], -gz - line[1]) / total));
      }
      (road.w >= 8 ? major : minor).ribbon(line, road.w, SURFACE, white, ground);
      for (let i = 0; i < line.length; i += 2) {
        const reach = Math.ceil(road.w / 16);
        for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) roadCells.add((Math.floor(line[i] / 8) + a) * 100003 + Math.floor(line[i + 1] / 8) + b);
      }
    }
    // Rivières : bandes d'eau posées au fond de leur vallée (le relief à 60 m les adoucit déjà).
    for (const river of this.data.rivers) {
      const p = river.p;
      if (!this.overlaps(p, ox, on, size)) continue;
      for (let i = 0; i + 2 < p.length; i += 2) {
        const mx = (p[i] + p[i + 2]) / 2, mn = (p[i + 1] + p[i + 3]) / 2;
        if (this.tileKey(mx, mn) !== key) continue;
        water.ribbon(this.densify(p, i / 2, i / 2 + 1, 15), river.w, 0.08, blue, (gx, gz) => this.height(gx, gz));
      }
    }
    for (const index of this.lakeTiles.get(key) ?? []) {
      const ring = this.data.lakes[index];
      let low = Infinity;
      for (let i = 0; i < ring.length; i += 2) low = Math.min(low, this.height(ring[i], -ring[i + 1]));
      water.flatPolygon(ring, Math.max(low, 0) + 0.4, blue);
    }
    for (const runway of this.data.runways) {
      if (this.tileKey(runway.p[0], runway.p[1]) !== key) continue;
      major.ribbon(this.densify(runway.p, 0, runway.p.length / 2 - 1, 20), runway.w, SURFACE + 0.02, white, (gx, gz) => this.surface(gx, gz), 30);
    }
    this.add(tile, water, this.materials.water, 2);
    this.add(tile, minor, this.materials.minor, 4);
    this.add(tile, major, this.materials.major, 5);

    // --- bâtiments (boîtes orientées : maisons et petits immeubles)
    const walls = new Map<FacadeStyle, MeshBuilder>(), roofs = new MeshBuilder();
    const homes: number[] = [];   // centres et rayons, pour ne pas planter d'arbre dedans
    const first = this.tileOffsets[key], last = this.tileOffsets[key + 1];
    const addCollider = !this.colliderDone.has(key);
    for (let r = first; r < last; r++) {
      const at = this.recordStart + r * 8;
      const bx = ox + this.records.getUint16(at, true) / 10, bn = on + this.records.getUint16(at + 2, true) / 10;
      const length = this.records.getUint8(at + 4) / 4, width = this.records.getUint8(at + 5) / 4;
      const angle = (this.records.getUint8(at + 6) / 256) * Math.PI, height = Math.max(3, this.records.getUint8(at + 7) / 4);
      const ux = Math.cos(angle), un = Math.sin(angle), vx = -un, vn = ux;
      const hl = length / 2, hw = width / 2;
      const ring = [bx - ux * hl - vx * hw, bn - un * hl - vn * hw, bx + ux * hl - vx * hw, bn + un * hl - vn * hw,
                    bx + ux * hl + vx * hw, bn + un * hl + vn * hw, bx - ux * hl + vx * hw, bn - un * hl + vn * hw];
      let low = Infinity, base = -Infinity;
      for (let k = 0; k < 8; k += 2) { const g = this.height(ring[k], -ring[k + 1]); low = Math.min(low, g); base = Math.max(base, g); }
      if (base < 0.3) continue; // dans l'eau (côte approximative à 60 m)
      const house = length * width < 170 && height <= 10;
      const pick = hash(r, 11);
      const style: FacadeStyle = house ? (pick < 0.55 ? 'house' : pick < 0.8 ? 'brickOpen' : 'cement') : 'apartment';
      const floors = Math.max(1, Math.round(height / 3));
      const top = base + floors * 3 + (house ? 0.4 : 0.6);
      const wall = new THREE.Color((house ? HOUSE_WALLS : BLOCK_WALLS)[Math.floor(hash(r, 3) * (house ? HOUSE_WALLS.length : BLOCK_WALLS.length))]);
      const builder = walls.get(style) ?? walls.set(style, new MeshBuilder()).get(style)!;
      for (let k = 0; k < 4; k++) {
        const ax = ring[k * 2], an = ring[k * 2 + 1], cx = ring[((k + 1) % 4) * 2], cn = ring[((k + 1) % 4) * 2 + 1];
        const side = Math.hypot(cx - ax, cn - an);
        const bays = Math.max(1, Math.round(side / FACADE_WIDTH[style]));
        // Soubassement (jusqu'au point bas du terrain), puis les étages.
        const s0 = roofs.vertex(ax, low - 0.4, -an, wall, 0.6), s1 = roofs.vertex(cx, low - 0.4, -cn, wall, 0.6);
        const s2 = roofs.vertex(cx, base, -cn, wall, 0.7), s3 = roofs.vertex(ax, base, -an, wall, 0.7);
        roofs.triangle(s0, s1, s2); roofs.triangle(s0, s2, s3);
        const a = builder.vertex(ax, base, -an, wall, 0.78, 0, 0), b = builder.vertex(cx, base, -cn, wall, 0.78, bays, 0);
        const c = builder.vertex(cx, top, -cn, wall, 1, bays, floors), d = builder.vertex(ax, top, -an, wall, 1, 0, floors);
        builder.triangle(a, b, c); builder.triangle(a, c, d);
      }
      // Toit plat avec acrotère (le plus courant en Algérie), dalle claire.
      roofs.flatPolygon(ring, top - 0.5, new THREE.Color(ROOFS[Math.floor(hash(r, 5) * 3)]));
      if (addCollider) this.collider?.addBuilding(ring, -Infinity, Infinity, { y: top - 0.5 });
      homes.push(bx, bn, Math.max(length, width) / 2 + 1.5);
    }
    this.colliderDone.add(key);
    for (const [style, builder] of walls) this.add(tile, builder, this.facade(style));
    this.add(tile, roofs, this.materials.plain);

    // --- végétation : forêts denses (classe 10), maquis (20), quelques arbustes sur l'herbe (30)
    const leaves = new MeshBuilder();
    const perCell = MOBILE ? [0, 3, 2, 0.3] : [0, 6, 3, 0.5];
    for (let i = i0; i < Math.min(i1, this.rows); i++) for (let j = j0; j < Math.min(j1, this.cols); j++) {
      const cls = this.cover[i * this.cols + j];
      const count = cls === 10 ? perCell[1] : cls === 20 ? perCell[2] : cls === 30 ? perCell[3] : 0;
      if (!count) continue;
      const cellX = this.x0 + j * this.step, cellN = this.n0 + i * this.step;
      if (this.inCity(cellX, cellN)) continue;
      const seed = i * 7919 + j * 104729;
      const plants = Math.floor(count) + (hash(seed, 40) < count % 1 ? 1 : 0);
      for (let t = 0; t < plants; t++) {
        const px = cellX + (hash(seed, t * 2) - 0.5) * this.step, pn = cellN + (hash(seed, t * 2 + 1) - 0.5) * this.step;
        const y = this.height(px, -pn);
        if (y < 1 || roadCells.has(Math.floor(px / 8) * 100003 + Math.floor(pn / 8))) continue;
        let inside = false;
        for (let k = 0; k < homes.length && !inside; k += 3) inside = Math.hypot(homes[k] - px, homes[k + 1] - pn) < homes[k + 2];
        if (inside) continue;
        // Forêt : chênes et pins, avec du maquis (buissons) entre eux ; ailleurs, seulement des buissons.
        const pick = hash(seed, t + 90);
        const kind = cls === 10 ? (pick < 0.32 ? 'oak' : pick < 0.58 ? 'fpine' : 'bush') : 'bush';
        const scale = (kind === 'bush' ? 0.75 : 1.1) * (0.8 + 0.5 * hash(seed, t + 70)) * (MOBILE ? 1.25 : 1);
        addPlant(leaves, kind, seed + t, px, y, -pn, scale);
        if (kind !== 'bush' && addCollider) this.collider?.addTrunk(px, -pn, Math.min(0.5, 0.24 * scale), y + 2.5 + 1.5 * scale);
      }
    }
    this.add(tile, leaves, this.materials.leaves, 0, true);
  }

  /** Sol sous une chaussée (jamais sous l'eau) ; la chaussée est posée SURFACE plus haut. */
  private surface(x: number, z: number): number {
    return Math.max(this.height(x, z), 0.05);
  }

  /** Points de p entre les indices from et to (inclus), avec un point au moins tous les `step` mètres. */
  private densify(p: number[], from: number, to: number, step: number): number[] {
    const out: number[] = [p[from * 2], p[from * 2 + 1]];
    for (let i = from; i < to; i++) {
      const ax = p[i * 2], an = p[i * 2 + 1], bx = p[i * 2 + 2], bn = p[i * 2 + 3];
      const pieces = Math.max(1, Math.ceil(Math.hypot(bx - ax, bn - an) / step));
      for (let k = 1; k <= pieces; k++) out.push(ax + ((bx - ax) * k) / pieces, an + ((bn - an) * k) / pieces);
    }
    return out;
  }

  private overlaps(p: number[], ox: number, on: number, size: number): boolean {
    for (let i = 0; i < p.length; i += 2) if (p[i] >= ox - 200 && p[i] <= ox + size + 200 && p[i + 1] >= on - 200 && p[i + 1] <= on + size + 200) return true;
    return false;
  }
}
