import type { WorldData } from './WorldData';

/**
 * Identification des lieux : dit, pour n'importe quelle position, dans quelle rue et quel quartier on se trouve,
 * avec un identifiant stable (voir tools/build_locations.py, qui fabrique public/world/locations.json).
 * Tout vient de cette base unique : aucun lieu n'est écrit « en dur » dans le code.
 */
interface District { code: string; name: string; origin: string; x: number; n: number }
interface LocationRecord {
  id: string; name: string; street: string | null; kind: string; district: string; road: string;
  x: number; n: number; length: number; junctions: string[]; buildings: string[]; landmarks: string[];
}
interface Junction { id: string; name: string; x: number; n: number; district: string; roads: string[] }
interface Landmark { name: string; kind: string; x: number; n: number }
interface Database {
  meta: { origin_lat_lon: [number, number]; m_per_deg: [number, number]; sector_m: number; rect_m: [number, number, number, number] };
  districts: District[]; locations: LocationRecord[]; junctions: Junction[]; landmarks: Landmark[];
}

export interface LocationFix {
  id: string; name: string; district: string; kind: string; road: string | null;
  x: number; y: number; z: number; lat: number; lon: number;
  junction: { id: string; name: string; distance: number } | null;
  landmark: { name: string; kind: string; distance: number } | null;
  /** Distance à l'axe de la voie identifiée (m) ; null si l'on est loin de toute voie. */
  offset: number | null;
}

const CELL = 60;
const key = (x: number, n: number) => `${Math.floor(x / CELL)},${Math.floor(n / CELL)}`;

class Grid<T> {
  private cells = new Map<string, { x: number; n: number; item: T }[]>();
  add(x: number, n: number, item: T): void {
    const k = key(x, n), cell = this.cells.get(k);
    if (cell) cell.push({ x, n, item }); else this.cells.set(k, [{ x, n, item }]);
  }
  /** Éléments à moins de `reach` mètres, du plus proche au plus lointain. */
  near(x: number, n: number, reach: number): { item: T; distance: number }[] {
    const found: { item: T; distance: number }[] = [], span = Math.ceil(reach / CELL);
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
      for (const entry of this.cells.get(`${Math.floor(x / CELL) + i},${Math.floor(n / CELL) + j}`) ?? []) {
        const distance = Math.hypot(entry.x - x, entry.n - n);
        if (distance <= reach) found.push({ item: entry.item, distance });
      }
    }
    return found.sort((a, b) => a.distance - b.distance);
  }
}

export class Locations {
  private roads = new Grid<number>();
  private junctions = new Grid<Junction>();
  private landmarks = new Grid<Landmark>();
  private buildings = new Grid<number>();
  private districtByCode = new Map<string, District>();

  constructor(private db: Database, private world: WorldData) {
    world.roads.forEach((road, index) => {
      // Points de la voie, resserrés à 5 m pour que la plus proche soit bien celle sous les pieds.
      for (let i = 0; i + 3 < road.p.length; i += 2) {
        const ax = road.p[i], an = road.p[i + 1], bx = road.p[i + 2], bn = road.p[i + 3];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bn - an) / 5));
        for (let s = 0; s <= steps; s++) this.roads.add(ax + (bx - ax) * s / steps, an + (bn - an) * s / steps, index);
      }
    });
    for (const junction of db.junctions) this.junctions.add(junction.x, junction.n, junction);
    for (const landmark of db.landmarks) this.landmarks.add(landmark.x, landmark.n, landmark);
    world.buildings.forEach((building, index) => {
      let x = 0, n = 0;
      for (let i = 0; i < building.p.length; i += 2) { x += building.p[i]; n += building.p[i + 1]; }
      this.buildings.add(x / (building.p.length / 2), n / (building.p.length / 2), index);
    });
    for (const district of db.districts) this.districtByCode.set(district.code, district);
  }

  static async load(world: WorldData): Promise<Locations | null> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}world/locations.json?v=${__BUILD_ID__}`);
      if (!response.ok) return null;
      return new Locations((await response.json()) as Database, world);
    } catch { return null; }
  }

  /** Quartier d'un point quelconque (même règle que dans tools/build_locations.py). */
  private districtAt(x: number, n: number): District {
    let best: District | null = null, bestGap = Infinity, bestRank = 9;
    for (const district of this.db.districts) {
      const osm = district.origin.startsWith('quartier'), game = district.origin.startsWith('repère');
      if (!osm && !game) continue;
      const gap = Math.hypot(district.x - x, district.n - n);
      if (gap > (osm ? 450 : 600)) continue;
      const rank = osm ? 0 : 1;
      if (rank < bestRank || (rank === bestRank && gap < bestGap)) { best = district; bestGap = gap; bestRank = rank; }
    }
    if (best) return best;
    const [x0, n0] = this.db.meta.rect_m, size = this.db.meta.sector_m;
    const code = `${String.fromCharCode(65 + Math.floor((x - x0) / size))}${String(Math.floor((n - n0) / size)).padStart(2, '0')}`;
    return this.districtByCode.get(code) ?? { code, name: `Secteur ${code}`, origin: 'secteur de grille', x, n };
  }

  /** Où est-on ? x, y, z : position dans le monde (z = -nord). */
  locate(x: number, y: number, z: number): LocationFix {
    const n = -z, [lat0, lon0] = this.db.meta.origin_lat_lon, [mLon, mLat] = this.db.meta.m_per_deg;
    const road = this.roads.near(x, n, 90)[0];
    const junction = this.junctions.near(x, n, 400)[0], landmark = this.landmarks.near(x, n, 600)[0];
    const base = {
      x, y, z, lat: lat0 + n / mLat, lon: lon0 + x / mLon,
      junction: junction ? { id: junction.item.id, name: junction.item.name, distance: junction.distance } : null,
      landmark: landmark ? { name: landmark.item.name, kind: landmark.item.kind, distance: landmark.distance } : null,
    };
    if (road) {
      const record = this.db.locations[road.item];
      return { ...base, id: record.id, name: record.name, kind: record.kind, road: record.road, offset: road.distance,
               district: this.districtByCode.get(record.district)?.name ?? record.district };
    }
    const district = this.districtAt(x, n);
    return { ...base, id: `ANN-${district.code}-000`, name: 'hors voirie', kind: 'terrain', road: null, offset: null, district: district.name };
  }

  /** Ligne courte pour le bas de l'écran (visible sur chaque capture). */
  line(fix: LocationFix): string {
    return `LIEU : ${fix.name} · QUARTIER : ${fix.district} · ID : ${fix.id} · POSITION : X ${fix.x.toFixed(1)} | Y ${fix.y.toFixed(1)} | Z ${fix.z.toFixed(1)}`
      + ` · ALTITUDE : ${Math.round(fix.y)} m · ${fix.lat.toFixed(5)}° N, ${fix.lon.toFixed(5)}° E`;
  }

  /** Fiche complète du lieu, à copier-coller. */
  inspect(fix: LocationFix): string {
    const n = -fix.z, lines: string[] = [];
    lines.push('=== LIXITING · FICHE DE LIEU ===');
    lines.push(`Identifiant : ${fix.id}${fix.road ? `  (voie ${fix.road} dans annaba.json)` : ''}`);
    lines.push(`Lieu : ${fix.name} (${fix.kind})${fix.offset !== null ? `, à ${fix.offset.toFixed(0)} m de l'axe` : ''}`);
    lines.push(`Quartier : ${fix.district}`);
    lines.push(`Position monde : X ${fix.x.toFixed(1)} | Y ${fix.y.toFixed(1)} | Z ${fix.z.toFixed(1)}   (est ${fix.x.toFixed(1)} m, nord ${n.toFixed(1)} m depuis la gare)`);
    lines.push(`Altitude du sol : ${fix.y.toFixed(1)} m`);
    lines.push(`Latitude, longitude : ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}`);
    lines.push(`Retour direct : ?at=${fix.x.toFixed(0)},${n.toFixed(0)}`);
    if (fix.junction) lines.push(`Carrefour le plus proche : ${fix.junction.id} · ${fix.junction.name} (${fix.junction.distance.toFixed(0)} m)`);
    const landmarks = this.landmarks.near(fix.x, n, 300).slice(0, 5);
    if (landmarks.length) lines.push(`Repères proches : ${landmarks.map((l) => `${l.item.name} [${l.item.kind}] ${l.distance.toFixed(0)} m`).join(' ; ')}`);
    const roads = new Map<number, number>();
    for (const hit of this.roads.near(fix.x, n, 70)) if (!roads.has(hit.item)) roads.set(hit.item, hit.distance);
    lines.push('Voies proches :');
    for (const [index, distance] of [...roads].slice(0, 8)) {
      const record = this.db.locations[index], road = this.world.roads[index];
      lines.push(`  ${record.id} (${record.road}) · ${record.name} · ${record.kind} · largeur ${road.w} m · ${distance.toFixed(0)} m`);
    }
    lines.push('Bâtiments proches :');
    for (const hit of this.buildings.near(fix.x, n, 55).slice(0, 10)) {
      const building = this.world.buildings[hit.item];
      lines.push(`  B-${String(hit.item).padStart(5, '0')} · ${building.t}${building.n ? ` · ${building.n}` : ''} · hauteur ${building.h} m${building.c ? '' : ' (estimée)'} · ${hit.distance.toFixed(0)} m`);
    }
    return lines.join('\n');
  }
}
