"""
Wilaya d'Annaba en détail léger, autour de la ville détaillée (public/world/annaba.json).

Entrées : data/region/ (extract_region.py), data/buildings/ (extract_buildings.py), data/bathymetry/.
Sorties :
  public/world/region.json      routes, voies ferrées, rivières, lacs, pistes, villes, limites de wilaya, côte
  public/world/region.png       relief et sol au pas de 60 m : R, G = (décimètres + 32768) sur 16 bits, B = classe
                                WorldCover ; ligne 0 = SUD (comme les grilles du terrain)
  public/world/region_buildings.bin  bâtiments hors de la ville, en boîtes orientées, rangés par cases de 1 km
  data/region/land_20m.npz      terre / mer au pas de 20 m (pour build_sea.py et build_terrain.py)

Le relief près des côtes suit la distance réelle au rivage (le trait de côte reste lisse malgré la maille de 60 m) :
pente douce vers l'eau devant les côtes basses, fond marin d'après EMODnet au large.
Usage : python tools/build_region.py (après build_world.py)
"""
import gzip
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, map_coordinates

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_world import ROAD_WIDTH, Projection, building_height, clip_to_rect, land_rings, simplify, stitch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / "public" / "world" / "annaba.json"
REGION = ROOT / "data" / "region"
OUT_JSON = ROOT / "public" / "world" / "region.json"
OUT_PNG = ROOT / "public" / "world" / "region.png"
OUT_BUILDINGS = ROOT / "public" / "world" / "region_buildings.bin"
OUT_LAND = REGION / "land_20m.npz"
BUILDINGS = ROOT / "data" / "buildings" / "annaba_overture.json.gz"
BATHY = ROOT / "data" / "bathymetry"
LAND_STEP = 20.0
TILE = 1000.0
ROAD_KINDS = {"motorway": 22, "motorway_link": 7, **{k: v for k, v in ROAD_WIDTH.items() if k in (
    "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
    "unclassified", "residential")}}
PLACE_RANK = {"city": 0, "town": 1, "suburb": 2, "village": 3, "hamlet": 4}


def clip_outside(points, rect):
    """Morceaux d'une ligne situés HORS du rectangle (les bouts posés sur le bord)."""
    x0, y0, x1, y1 = rect

    def inside(p):
        return x0 < p[0] < x1 and y0 < p[1] < y1

    def border(p, q):
        """Point du bord entre p (dedans) et q (dehors)."""
        best = 1.0
        dx, dy = q[0] - p[0], q[1] - p[1]
        for edge, d, start in ((x0, dx, p[0]), (x1, dx, p[0]), (y0, dy, p[1]), (y1, dy, p[1])):
            if d != 0:
                t = (edge - start) / d
                if 0 <= t < best:
                    best = t
        return (p[0] + dx * best, p[1] + dy * best)

    runs, run = [], []
    for i, p in enumerate(points):
        if inside(p):
            if run:
                run.append(border(p, points[i - 1]))
                if len(run) >= 2:
                    runs.append(run)
                run = []
        else:
            if not run and i > 0 and inside(points[i - 1]):
                run.append(border(points[i - 1], p))
            run.append(p)
    if len(run) >= 2:
        runs.append(run)
    return runs


def flat(points, digits=1):
    return [round(float(v), digits) for p in points for v in p]


def min_area_rect(ring):
    """Rectangle orienté le plus serré autour d'un contour : centre, longueur, largeur, angle (radians)."""
    pts = np.asarray(ring, dtype=float)
    hull = convex_hull(pts)
    best = None
    for i in range(len(hull)):
        e = hull[(i + 1) % len(hull)] - hull[i]
        length = math.hypot(*e)
        if length < 1e-6:
            continue
        u = e / length
        v = np.array([-u[1], u[0]])
        a, b = hull @ u, hull @ v
        area = (a.max() - a.min()) * (b.max() - b.min())
        if best is None or area < best[0]:
            centre = u * (a.max() + a.min()) / 2 + v * (b.max() + b.min()) / 2
            best = (area, centre, a.max() - a.min(), b.max() - b.min(), math.atan2(u[1], u[0]))
    return best[1:]


def convex_hull(pts):
    pts = sorted(map(tuple, pts))
    if len(pts) <= 2:
        return np.array(pts)

    def half(points):
        out = []
        for p in points:
            while len(out) >= 2 and (out[-1][0] - out[-2][0]) * (p[1] - out[-2][1]) - (out[-1][1] - out[-2][1]) * (p[0] - out[-2][0]) <= 0:
                out.pop()
            out.append(p)
        return out

    lower, upper = half(pts), half(reversed(pts))
    return np.array(lower[:-1] + upper[:-1])


def main():
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    meta = json.loads((REGION / "summary.json").read_text(encoding="utf-8"))
    lat0, lon0 = world["meta"]["origin_lat_lon"]
    project = Projection(lat0, lon0, 36.93)
    city = tuple(world["meta"]["rect_m"])
    rx0, rn0, rx1, rn1 = meta["rect_m"]
    rect = (rx0, rn0, rx1, rn1)
    osm = json.load(gzip.open(REGION / "osm_region.json.gz", "rt", encoding="utf-8"))
    elements = osm["elements"]

    def line_of(geometry):
        return [project(g["lat"], g["lon"]) for g in geometry if g]

    # --- côte : chaînes de nœuds bout à bout, refermées le long du bord de la zone (terre à gauche, convention OSM)
    node_xy, coast_ways = {}, []
    for e in elements:
        if e["type"] == "way" and e.get("tags", {}).get("natural") == "coastline":
            for nid, g in zip(e["nodes"], e["geometry"]):
                node_xy[nid] = project(g["lat"], g["lon"])
            coast_ways.append(e["nodes"])
    pieces, islands = [], []
    for chain in stitch(coast_ways):
        p = [node_xy[n] for n in chain]
        if chain[0] == chain[-1]:
            ring = simplify(p[:-1], 2.0)
            if len(ring) >= 3:
                islands.append(ring)
        else:
            pieces += clip_to_rect(p, rect)
    land = [simplify(r, 2.0) for r in land_rings(pieces, rect)] + islands
    print("côte :", len(pieces), "morceaux,", len(islands), "îlots,", len(land), "contours de terre")

    # --- terre / mer au pas de 20 m, et distance signée au rivage (positive à terre)
    lcols, lrows = int((rx1 - rx0) // LAND_STEP) + 1, int((rn1 - rn0) // LAND_STEP) + 1
    canvas = Image.new("L", (lcols, lrows), 0)
    draw = ImageDraw.Draw(canvas)
    big = sorted(land, key=lambda r: -abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:] + r[:1]))))
    for ring in big:
        draw.polygon([((x - rx0) / LAND_STEP, (n - rn0) / LAND_STEP) for x, n in ring], fill=255)
    land_mask = np.asarray(canvas) > 127                       # ligne 0 = sud
    # Lacs et étangs : de l'eau douce, pas de la terre (mais pas la mer non plus : gérés à part dans le jeu).
    signed = (distance_transform_edt(land_mask) - distance_transform_edt(~land_mask)) * LAND_STEP
    np.savez_compressed(OUT_LAND, land=land_mask, x0=rx0, n0=rn0, step=LAND_STEP)
    print(f"terre : {land_mask.mean() * 100:.0f} % de la zone ({lcols} x {lrows} cases de {LAND_STEP:.0f} m)")

    # --- relief au pas de 60 m
    dem_meta = meta["dem"]
    dem = (np.asarray(Image.open(REGION / "dem_region.png")).astype(np.float64) - 10000) / 10   # ligne 0 = sud
    cols, rows, step = dem_meta["cols"], dem_meta["rows"], dem_meta["step"]
    dx0, dn0 = dem_meta["x0"], dem_meta["n0"]
    gx, gn = np.meshgrid(dx0 + np.arange(cols) * step, dn0 + np.arange(rows) * step)
    d = map_coordinates(signed, [(gn - rn0) / LAND_STEP, (gx - rx0) / LAND_STEP], order=1, mode="nearest")
    # Profondeur réelle (EMODnet) pour le fond marin.
    depth = np.full(dem.shape, 30.0)
    if (BATHY / "summary.json").exists():
        bm = json.loads((BATHY / "summary.json").read_text(encoding="utf-8"))
        bathy = np.array(Image.open(BATHY / "annaba_bathy.png")).astype(float) / 10.0
        lat, lon = lat0 + gn / project.m_lat, lon0 + gx / project.m_lon
        r = (bm["north"] - lat) / (bm["north"] - bm["south"]) * (bm["rows"] - 1)
        c = (lon - bm["west"]) / (bm["east"] - bm["west"]) * (bm["cols"] - 1)
        depth = map_coordinates(bathy, [r, c], order=1, mode="nearest")
    land_h = np.maximum(dem, 0.6)
    # Côtes basses : le sol descend en pente douce jusqu'à l'eau (effet effacé entre 60 et 150 m du rivage).
    low = land_h < 12
    beach = 0.35 + 0.04 * np.maximum(d, 0)
    fade = np.clip((d - 60) / 90, 0, 1)
    land_h = np.where(low, np.minimum(land_h, beach) * (1 - fade) + land_h * fade, land_h)
    land_h = np.where(d > 0, np.maximum(land_h, 0.35 + 0.01 * np.minimum(d, 60)), land_h)
    sea_h = -np.minimum(0.4 + 0.06 * np.maximum(-d, 0), np.maximum(depth, 2.5))
    height = np.where(d > 0, land_h, sea_h)
    encoded = np.clip(np.round(height * 10) + 32768, 0, 65535).astype(np.uint32)

    # --- sol (WorldCover) ramené au pas de 60 m : classe la plus fréquente des 4 cases de 30 m
    cm = meta["cover"]
    cover30 = np.asarray(Image.open(REGION / "cover_region.png")).astype(np.uint8)
    ci = np.clip(np.round((gn - cm["n0"]) / cm["step"]).astype(int), 0, cm["rows"] - 2)
    cj = np.clip(np.round((gx - cm["x0"]) / cm["step"]).astype(int), 0, cm["cols"] - 2)
    stack = np.stack([cover30[ci, cj], cover30[ci + 1, cj], cover30[ci, cj + 1], cover30[ci + 1, cj + 1]])
    cover = cover30[ci, cj]
    for value in (10, 20, 30, 40, 50, 60, 80, 90):
        count = (stack == value).sum(axis=0)
        cover = np.where(count >= 3, value, cover)
    image = np.zeros((rows, cols, 3), dtype=np.uint8)
    image[..., 0] = encoded >> 8
    image[..., 1] = encoded & 255
    image[..., 2] = cover
    Image.fromarray(image, "RGB").save(OUT_PNG, optimize=True)
    print(f"relief : {cols} x {rows} points de {step:.0f} m, {height.min():.0f} à {height.max():.0f} m, {OUT_PNG.stat().st_size // 1024} ko")

    # --- lignes : routes, voies ferrées, rivières ; surfaces : lacs, zones humides, pistes d'aéroport
    roads, rails, rivers, lakes, wetlands, runways = [], [], [], [], [], []
    for e in elements:
        if e["type"] != "way":
            continue
        tags = e.get("tags", {})
        p = line_of(e["geometry"])
        if len(p) < 2:
            continue
        kind = tags.get("highway")
        if kind in ROAD_KINDS:
            width = ROAD_KINDS[kind]
            try:
                if "lanes" in tags:
                    width = max(width, float(tags["lanes"]) * 3.5)
            except ValueError:
                pass
            for part in clip_to_rect(p, rect):
                for piece in clip_outside(part, city):
                    line = simplify(piece, 0.8)
                    if len(line) < 2:
                        continue
                    road = {"k": kind, "w": width, "p": flat(line)}
                    name = tags.get("name:fr") or tags.get("name")
                    if name:
                        road["n"] = name
                    if tags.get("bridge") == "yes":
                        road["b"] = 1
                    roads.append(road)
        elif tags.get("railway") == "rail" and tags.get("tunnel") != "yes":
            for part in clip_to_rect(p, rect):
                rails += [{"p": flat(simplify(q, 1.0))} for q in clip_outside(part, city) if len(q) >= 2]
        elif tags.get("waterway") in ("river", "canal"):
            for part in clip_to_rect(p, rect):
                rivers += [{"w": 14 if tags.get("waterway") == "river" else 6, "p": flat(simplify(q, 2.0))} for q in clip_outside(part, city) if len(q) >= 2]
        elif tags.get("aeroway") == "runway":
            width = float(str(tags.get("width", "45")).split()[0] or 45)
            runways.append({"w": width, "p": flat(p)})
        elif e["nodes"][0] == e["nodes"][-1] and (tags.get("natural") == "water" or tags.get("landuse") == "reservoir"):
            lakes.append(flat(simplify(p[:-1], 2.0)))
        elif e["nodes"][0] == e["nodes"][-1] and tags.get("natural") == "wetland":
            wetlands.append(flat(simplify(p[:-1], 3.0)))
    # Lacs en multipolygones (relation natural=water) : contours extérieurs.
    boundaries = []
    for e in elements:
        if e["type"] != "relation":
            continue
        tags = e.get("tags", {})
        outers = [m for m in e.get("members", []) if m.get("role") in ("outer", "") and m.get("geometry")]
        if not outers:
            continue
        rings = assemble([[project(g["lat"], g["lon"]) for g in m["geometry"] if g] for m in outers])
        if tags.get("natural") == "water":
            lakes += [flat(simplify(r, 2.0)) for r in rings if len(r) >= 3]
        elif tags.get("boundary") == "administrative" and tags.get("admin_level") == "4":
            name = tags.get("name:fr") or tags.get("name") or ""
            boundaries.append({"name": name, "rings": [flat(simplify(r, 10.0), 0) for r in rings if len(r) >= 3]})
    print("routes :", len(roads), "· voies ferrées :", len(rails), "· rivières :", len(rivers), "· lacs :", len(lakes),
          "· zones humides :", len(wetlands), "· pistes :", len(runways), "· wilayas :", [b["name"] for b in boundaries])

    # --- villes et villages (hors de la ville détaillée)
    places = []
    for e in elements:
        tags = e.get("tags", {})
        if e["type"] != "node" or tags.get("place") not in PLACE_RANK:
            continue
        name = tags.get("name:fr") or tags.get("name")
        if not name:
            continue
        x, n = project(e["lat"], e["lon"])
        if city[0] <= x <= city[2] and city[1] <= n <= city[3]:
            continue
        place = {"name": name, "k": tags["place"], "x": round(x, 1), "n": round(n, 1)}
        if tags.get("name:ar"):
            place["ar"] = tags["name:ar"]
        if tags.get("population", "").isdigit():
            place["pop"] = int(tags["population"])
        places.append(place)
    places.sort(key=lambda p: (PLACE_RANK[p["k"]], -p.get("pop", 0)))
    print("lieux :", len(places), [p["name"] for p in places[:25]])

    # --- bâtiments hors de la ville : boîtes orientées par cases de 1 km
    buildings = json.load(gzip.open(BUILDINGS, "rt", encoding="utf-8"))["buildings"]
    tiles_x, tiles_n = int(math.ceil((rx1 - rx0) / TILE)), int(math.ceil((rn1 - rn0) / TILE))
    per_tile = [[] for _ in range(tiles_x * tiles_n)]
    kept = skipped = 0
    for k, b in enumerate(buildings):
        p = b["p"]
        ring = [project(p[i + 1], p[i]) for i in range(0, len(p), 2)]
        cx = sum(q[0] for q in ring) / len(ring)
        cn = sum(q[1] for q in ring) / len(ring)
        if city[0] <= cx <= city[2] and city[1] <= cn <= city[3]:
            continue
        if not (rx0 <= cx < rx1 and rn0 <= cn < rn1) or (b.get("c") is not None and b["c"] < 0.7):
            skipped += 1
            continue
        centre, length, width, angle = min_area_rect(ring)
        area = abs(sum(a[0] * c[1] - c[0] * a[1] for a, c in zip(ring, ring[1:] + ring[:1]))) / 2
        if area < 20 or length > 63 or width > 63:
            skipped += 1
            continue
        if "h" in b:
            h = float(b["h"])
        elif "f" in b:
            h = b["f"] * 3.0 + 1
        else:
            h, _ = building_height({}, area, k)
        tx, tn = int((centre[0] - rx0) // TILE), int((centre[1] - rn0) // TILE)
        ox, on = rx0 + tx * TILE, rn0 + tn * TILE
        if angle < 0:
            angle += math.pi
        if angle >= math.pi:
            angle -= math.pi
        per_tile[tn * tiles_x + tx].append(struct.pack("<HHBBBB", int(round((centre[0] - ox) * 10)), int(round((centre[1] - on) * 10)),
                                                       min(255, int(round(length * 4))), min(255, int(round(width * 4))),
                                                       int(angle / math.pi * 256) % 256, min(255, int(round(h * 4)))))
        kept += 1
    with open(OUT_BUILDINGS, "wb") as f:
        f.write(struct.pack("<4sIIfff", b"LXB1", tiles_x, tiles_n, rx0, rn0, TILE))
        offset = 0
        for records in per_tile:
            f.write(struct.pack("<I", offset))
            offset += len(records)
        f.write(struct.pack("<I", offset))
        for records in per_tile:
            for r in records:
                f.write(r)
    print(f"bâtiments de la wilaya : {kept} (écartés : {skipped}), {OUT_BUILDINGS.stat().st_size // 1024} ko")

    out = {
        "meta": {
            "rect_m": [round(v, 1) for v in rect], "city_rect_m": city,
            "relief": {"x0": dx0, "n0": dn0, "step": step, "cols": cols, "rows": rows, "row0": "sud",
                       "encodage": "R*256+G = décimètres + 32768 ; B = classe WorldCover"},
            "tiles": {"size": TILE, "cols": tiles_x, "rows": tiles_n},
            "sources": "OpenStreetMap (ODbL), Overture Maps (ODbL), Terrain Tiles (AWS), ESA WorldCover (CC BY 4.0), EMODnet (CC BY 4.0)",
            "buildings": kept, "roads": len(roads),
        },
        "land": [flat(r, 0) for r in land],
        "roads": roads, "rails": rails, "rivers": rivers, "lakes": lakes, "wetlands": wetlands, "runways": runways,
        "places": places, "boundaries": boundaries,
    }
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"region.json : {OUT_JSON.stat().st_size // 1024} ko")


def assemble(lines):
    """Relie des morceaux de contour (listes de points) en anneaux fermés."""
    lines = [list(l) for l in lines if len(l) >= 2]
    rings = []
    while lines:
        ring = lines.pop(0)
        changed = True
        while changed and math.dist(ring[0], ring[-1]) > 1.0:
            changed = False
            for i, l in enumerate(lines):
                if math.dist(ring[-1], l[0]) < 1.0:
                    ring += l[1:]
                elif math.dist(ring[-1], l[-1]) < 1.0:
                    ring += l[::-1][1:]
                elif math.dist(ring[0], l[-1]) < 1.0:
                    ring = l[:-1] + ring
                elif math.dist(ring[0], l[0]) < 1.0:
                    ring = l[::-1][:-1] + ring
                else:
                    continue
                del lines[i]
                changed = True
                break
        rings.append(ring[:-1] if math.dist(ring[0], ring[-1]) <= 1.0 else ring)
    return rings


if __name__ == "__main__":
    main()
