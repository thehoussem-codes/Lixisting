"""
Construit le terrain en relief du jeu : public/world/terrain.bin

Entrées : data/elevation/annaba_dem.json.gz (altitudes) et public/world/annaba.json
(trait de côte, plages, bois...). Le terrain est un maillage de triangles qui suit
exactement le trait de côte OSM, avec un point d'altitude tous les 30 m à l'intérieur.

Usage : pip install numpy scipy matplotlib && python tools/build_terrain.py
"""
import gzip
import json
import struct
from pathlib import Path

import numpy as np
from matplotlib.path import Path as Polygon
from scipy.spatial import Delaunay, cKDTree

ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / "public" / "world" / "annaba.json"
DEM = ROOT / "data" / "elevation" / "annaba_dem.json.gz"
OUT = ROOT / "public" / "world" / "terrain.bin"
TREES_OUT = ROOT / "public" / "world" / "trees.json"



STEP = 30.0          # espacement des points du terrain (m)
COAST_STEP = 12.0    # espacement maximal des points le long de la côte (m)
MIN_HEIGHT = 0.4     # la terre reste toujours un peu au-dessus de la mer (niveau 0)
SEA_FLOOR = -2.6     # profondeur du fond marin près du rivage (m)
SHORE_RUN = 24.0     # distance sur laquelle une plage descend jusqu'au fond (m)
# Rues taillées dans le relief : (x, n, rayon). Dans ces zones, les grandes rues gardent une pente douce,
# le terrain est entaillé à leur passage et un mur de soutènement retient le talus.
# Le relief à 30 m ne connaît que la colline, pas la tranchée de la rue : sans cela la chaussée grimperait dessus.
GRADING_ZONES = [(155.0, 880.0, 170.0)]   # rue du 24 Février 1956, au nord du Cours de la Révolution
MAX_GRADE = 0.035                          # pente maximale d'une rue taillée (3,5 %)
WALLS = []                                 # murs de soutènement produits : x0, n0, x1, n1, bas0, haut0, bas1, haut1

CLIFF_RUN = 7.0      # même chose au pied d'une côte rocheuse ou d'un quai
# Ports : le bord de l'eau est un quai vertical, même bas (sinon le fond marin remonte en plage et affleure
# dans les bassins). Cercles (x, n, rayon) : port de pêche (36.90375, 7.77451) et port de commerce.
HARBOURS = [(1392.0, 920.0, 380.0), (700.0, -250.0, 900.0)]

COLORS = {  # couleurs du sol (rouge, vert, bleu de 0 à 1)
    "land": (0.74, 0.69, 0.53), "beach": (0.93, 0.85, 0.63), "wood": (0.24, 0.48, 0.23),
    "scrub": (0.49, 0.59, 0.33), "grass": (0.53, 0.71, 0.38), "pitch": (0.37, 0.63, 0.32),
    "rock": (0.60, 0.59, 0.55), "hill": (0.42, 0.55, 0.30), "cliff": (0.52, 0.47, 0.40),
    "parking": (0.47, 0.46, 0.45),  # enrobé des parkings cartographiés
    "plaza": (0.80, 0.78, 0.73),  # dallage clair de la promenade du Cours (photo)
}


from build_world import edge_shore  # noqa: E402


def cours_promenade(world):
    """Promenade centrale du Cours de la Révolution : bande entre ses deux chaussées réelles (OSM),
    du bord du trottoir ouest au bord du trottoir est. Renvoie (anneau, ligne ouest, ligne est) ou None."""
    hall = world["meta"].get("town_hall")
    if not hall:
        return None
    sides = []
    for road in world["roads"]:
        line = pairs(road["p"])
        span = np.hypot(*(line[-1] - line[0]))
        if road["k"] == "primary" and span > 300 and np.ptp(line[:, 0]) < 60 and np.abs(line[:, 0] - hall[0]).min() < 80 and abs(line[:, 1].mean() - hall[1]) < 200:
            sides.append((road, line))
    sides = sorted(sides, key=lambda item: -len(item[1]))[:2]
    if len(sides) != 2:
        return None
    (ra, la), (rb, lb) = sorted(sides, key=lambda item: item[1][:, 0].mean())  # ouest puis est
    lo, hi = max(la[:, 1].min(), lb[:, 1].min()), min(la[:, 1].max(), lb[:, 1].max())
    ns = np.arange(lo + 2, hi - 2, 6.0)
    west = np.interp(ns, la[np.argsort(la[:, 1]), 1], la[np.argsort(la[:, 1]), 0]) + ra["w"] / 2 + ra.get("sw", 0) + 0.3
    east = np.interp(ns, lb[np.argsort(lb[:, 1]), 1], lb[np.argsort(lb[:, 1]), 0]) - rb["w"] / 2 - rb.get("sw", 0) - 0.3
    ring = np.vstack([np.column_stack([west, ns]), np.column_stack([east, ns])[::-1]])
    return ring, np.column_stack([west, ns]), np.column_stack([east, ns])


def pairs(flat):
    return np.array(flat, dtype=float).reshape(-1, 2)


def densify(ring, step):
    out = []
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        count = max(1, int(np.ceil(np.hypot(*(b - a)) / step)))
        for k in range(count):
            out.append(a + (b - a) * k / count)
    return np.array(out)


def main():
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    promenade = cours_promenade(world)
    if promenade is not None:
        # La promenade devient une zone dallée (couleur du sol) ; elle n'est pas enregistrée dans la carte.
        world["areas"].append({"k": "plaza", "p": [round(float(v), 1) for v in promenade[0].ravel()]})
        world["meta"]["cours_promenade"] = [promenade[1].tolist(), promenade[2].tolist()]
    with gzip.open(DEM, "rt", encoding="utf-8") as f:
        dem = json.load(f)

    # --- grille d'altitudes à 30 m, rééchantillonnée depuis la grille source
    src = np.array(dem["heights"]).reshape(dem["rows"], dem["cols"])
    x0, n0, x1, n1 = world["meta"]["rect_m"]
    cols = int(np.ceil((x1 - x0) / STEP)) + 1
    rows = int(np.ceil((n1 - n0) / STEP)) + 1

    def sample_source(x, n):
        fx = np.clip((x - dem["x0"]) / dem["step"], 0, dem["cols"] - 1.001)
        fy = np.clip((n - dem["n0"]) / dem["step"], 0, dem["rows"] - 1.001)
        ix, iy = fx.astype(int), fy.astype(int)
        ax, ay = fx - ix, fy - iy
        return (src[iy, ix] * (1 - ax) + src[iy, ix + 1] * ax) * (1 - ay) + \
               (src[iy + 1, ix] * (1 - ax) + src[iy + 1, ix + 1] * ax) * ay

    gx, gn = np.meshgrid(x0 + np.arange(cols) * STEP, n0 + np.arange(rows) * STEP)
    grid = np.maximum(sample_source(gx, gn), MIN_HEIGHT)
    # Bord de carte traité en côte (voir build_world.edge_shore) : le relief descend vers le faux rivage,
    # sur 350 m en plaine et jusqu'à 900 m au pied de l'Edough, au lieu de finir en mur vertical.
    rect = (x0, n0, x1, n1)
    shore_distance = np.vectorize(lambda x, n: edge_shore(x, n, rect))(gx, gn)
    fall = np.clip(shore_distance / np.clip(350 + 1.2 * grid, 350, 900), 0, 1)
    grid = grid * fall ** 1.5

    def height(x, n):
        """Même calcul que dans le jeu (Terrain.heightAt) : interpolation dans la grille à 30 m."""
        fx = np.clip((x - x0) / STEP, 0, cols - 1.001)
        fy = np.clip((n - n0) / STEP, 0, rows - 1.001)
        ix, iy = fx.astype(int), fy.astype(int)
        ax, ay = fx - ix, fy - iy
        return (grid[iy, ix] * (1 - ax) + grid[iy, ix + 1] * ax) * (1 - ay) + \
               (grid[iy + 1, ix] * (1 - ax) + grid[iy + 1, ix + 1] * ax) * ay

    # --- points du maillage : la côte (précise) + la grille intérieure
    rings = [pairs(r) for r in world["land"] if len(r) >= 6]
    polygons = [Polygon(r) for r in rings]
    coast = [densify(r, COAST_STEP) for r in rings]
    coast_points = np.vstack(coast)

    interior = np.column_stack([gx.ravel(), gn.ravel()])
    inside = np.zeros(len(interior), dtype=bool)
    for polygon in polygons:
        inside |= polygon.contains_points(interior)
    far_from_coast = cKDTree(coast_points).query(interior)[0] > COAST_STEP * 0.8
    interior = interior[inside & far_from_coast]

    # --- rues taillées dans la colline : profil en long adouci, plate-forme et crête de talus ajoutées au maillage
    graded_points, graded_heights = [], []
    for road in world["roads"]:
        line = pairs(road["p"])
        if road["k"] not in ("trunk", "primary", "secondary", "tertiary"):
            continue
        # La rue doit être en majorité dans la zone : une rue qui ne fait que l'effleurer n'est pas modifiée.
        if not any((np.hypot(line[:, 0] - zx, line[:, 1] - zn) < zr).mean() > 0.5 for zx, zn, zr in GRADING_ZONES):
            continue
        # Un point tous les 5 m le long de l'axe.
        steps = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(line, axis=0).T))])
        marks = np.linspace(0, steps[-1], max(2, int(steps[-1] / 5) + 1))
        axis = np.column_stack([np.interp(marks, steps, line[:, 0]), np.interp(marks, steps, line[:, 1])])
        natural = height(axis[:, 0], axis[:, 1])
        # Profil : on ne remblaie jamais, on entaille seulement ; la pente reste sous MAX_GRADE à partir des points bas.
        profile = (natural[None, :] + MAX_GRADE * np.abs(marks[:, None] - marks[None, :])).min(axis=1)
        if (natural - profile).max() < 1.0:
            continue
        tangent = np.gradient(axis, axis=0)
        tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-6)
        normal = np.column_stack([-tangent[:, 1], tangent[:, 0]])
        edge = road["w"] / 2 + road.get("sw", 0) + 0.6
        graded_points.append(axis); graded_heights.append(profile)
        for side in (1, -1):
            platform = axis + normal * side * edge
            crest = axis + normal * side * (edge + 0.8)
            crest_height = np.maximum(profile, height(crest[:, 0], crest[:, 1]))
            graded_points += [platform, crest]; graded_heights += [profile, crest_height]
            # Mur de soutènement là où le talus dépasse 1,2 m.
            foot = axis + normal * side * (edge - 0.08)  # juste devant le talus, qu'il masque entièrement
            for k in range(len(axis) - 1):
                if crest_height[k] - profile[k] > 1.2 or crest_height[k + 1] - profile[k + 1] > 1.2:
                    WALLS.extend(round(float(v), 2) for v in (foot[k, 0], foot[k, 1], foot[k + 1, 0], foot[k + 1, 1],
                                 profile[k] - 0.4, crest_height[k] + 0.9, profile[k + 1] - 0.4, crest_height[k + 1] + 0.9))
        # Les points de la grille pris dans la plate-forme sont retirés : c'est la rue qui commande ici.
        interior = interior[cKDTree(axis).query(interior)[0] > edge + 3.5]
        print(f"rue taillée : {road.get('n') or road['k']}, {steps[-1]:.0f} m, entaille maximale {(natural - profile).max():.1f} m, "
              f"altitude {profile.min():.1f} à {profile.max():.1f} m (avant : jusqu'à {natural.max():.1f} m)")
    graded_count = sum(len(g) for g in graded_points)

    points = np.vstack([coast_points, interior] + graded_points)
    triangles = Delaunay(points).simplices
    centers = points[triangles].mean(axis=1)
    keep = np.zeros(len(triangles), dtype=bool)
    for polygon in polygons:
        keep |= polygon.contains_points(centers)
    triangles = triangles[keep]
    # Tous les triangles dans le même sens (anti-horaire vu du dessus) : éclairage cohérent.
    a, b, c = points[triangles[:, 0]], points[triangles[:, 1]], points[triangles[:, 2]]
    doubled_area = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    flipped = doubled_area < 0
    triangles[flipped] = triangles[flipped][:, [0, 2, 1]]
    triangles = triangles[np.abs(doubled_area) > 0.02]  # on retire les triangles plats

    heights = height(points[:, 0], points[:, 1])

    # --- rivage : le relief à 30 m ne « voit » pas la mer et laisse la terre finir en marche de 2 à 3 m.
    # Là où la côte est basse (plages, quais), le sol descend en pente douce jusqu'au niveau de l'eau.
    # Les vraies falaises (côte à plus de 8 m) ne sont pas touchées.
    real = ~((np.abs(coast_points[:, 0] - x0) < 1) | (np.abs(coast_points[:, 0] - x1) < 1) | (np.abs(coast_points[:, 1] - n0) < 1) | (np.abs(coast_points[:, 1] - n1) < 1))
    shore = coast_points[real]
    shore_height = height(shore[:, 0], shore[:, 1])
    reach, nearest = cKDTree(shore).query(points)
    on_beach = np.zeros(len(points), bool)
    for area in world["areas"]:
        if area["k"] == "beach":
            on_beach |= Polygon(pairs(area["p"])).contains_points(points, radius=8) | Polygon(pairs(area["p"])).contains_points(points, radius=-8)
    low = shore_height[nearest] < 8
    limit = np.where(on_beach, 0.22 + 0.045 * reach, 0.55 + 0.11 * reach)
    lowered = low & (heights > limit)
    # L'effet s'efface entre 40 et 100 m du rivage : plus loin, les collines gardent leur vraie hauteur.
    fade = np.clip((reach - 40) / 60, 0, 1)
    heights = np.where(lowered, limit * (1 - fade) + heights * fade, heights)
    # Plaine très basse (Seybouse, faux rivage) : la terre reste au-dessus de l'eau, sans flaques de mer dans les terres.
    heights = np.where(reach > 2, np.maximum(heights, np.minimum(0.25 + 0.02 * reach, 0.9)), heights)
    if graded_count:
        heights[-graded_count:] = np.concatenate(graded_heights)
    print("rivage abaissé :", int(lowered.sum()), "points du terrain")

    # --- couleur de chaque point : type de sol OSM, sinon selon l'altitude et la pente
    # Sol : gris minéral en ville, terre sèche en lisière, vert sur les terrains sans construction.
    # (Les photos d'Annaba montrent des collines couvertes de maquis, pas du sable.)
    built = cKDTree(np.vstack([pairs(b["p"]) for b in world["buildings"]]))
    away = built.query(points)[0]
    town, edge, wild = np.array([0.60, 0.58, 0.54]), np.array([0.62, 0.60, 0.44]), np.array([0.40, 0.52, 0.29])
    t1 = np.clip((away - 30) / 40, 0, 1)[:, None]     # 30 à 70 m des bâtiments : ville -> lisière
    t2 = np.clip((away - 70) / 80, 0, 1)[:, None]     # 70 à 150 m : lisière -> nature
    colors = (town * (1 - t1) + edge * t1) * (1 - t2) + wild * t2
    patchy = np.sin(points[:, 0] * 0.031) * np.cos(points[:, 1] * 0.027)   # nuances larges, pour éviter l'aplat
    colors = colors * (1 + 0.06 * patchy[:, None])
    gy, gxx = np.gradient(grid, STEP)
    slope = np.hypot(gxx, gy)
    ix = np.clip(((points[:, 0] - x0) / STEP).round().astype(int), 0, cols - 1)
    iy = np.clip(((points[:, 1] - n0) / STEP).round().astype(int), 0, rows - 1)
    colors[slope[iy, ix] > 0.55] = COLORS["cliff"]
    for area in world["areas"]:
        mask = Polygon(pairs(area["p"])).contains_points(points)
        colors[mask] = COLORS.get(area["k"], COLORS["land"])
    # léger dégradé avec l'altitude, pour lire le relief de loin
    colors *= (0.92 + 0.16 * np.clip(heights / 250, 0, 1))[:, None]

    # --- jupe : un mur vertical sous chaque segment de côte, jusque sous l'eau
    positions = [np.column_stack([points[:, 0], heights, -points[:, 1]])]
    color_list = [colors]
    index_list = [triangles]
    offset = len(points)
    start = 0
    beach_rings = [densify(pairs(a["p"]), 10) for a in world["areas"] if a["k"] == "beach"]
    beach_tree = cKDTree(np.vstack(beach_rings)) if beach_rings else None
    for ring in coast:
        count = len(ring)
        top = np.arange(start, start + count)
        # Fond marin : chaque point de la côte est prolongé vers le large, en pente douce
        # devant une plage, en pente raide au pied d'une falaise ou d'un quai.
        tangent = np.roll(ring, -1, axis=0) - np.roll(ring, 1, axis=0)
        tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-6)
        doubled = np.sum(ring[:, 0] * np.roll(ring[:, 1], -1) - np.roll(ring[:, 0], -1) * ring[:, 1])
        outward = np.column_stack([tangent[:, 1], -tangent[:, 0]]) * (1 if doubled > 0 else -1)
        ring_heights = heights[start:start + count]
        run = np.where(ring_heights < 2.5, SHORE_RUN, CLIFF_RUN)
        in_port = np.zeros(count, dtype=bool)
        for hx, hn, hr in HARBOURS:
            in_port |= np.hypot(ring[:, 0] - hx, ring[:, 1] - hn) < hr
        if beach_tree is not None:
            in_port &= beach_tree.query(ring)[0] > 25   # une vraie plage dans un port reste une plage
        run[in_port] = CLIFF_RUN * 0.5
        # Sur le bord de la carte (qui n'est pas une vraie côte), le mur reste vertical.
        on_edge = (np.abs(ring[:, 0] - x0) < 1) | (np.abs(ring[:, 0] - x1) < 1) | (np.abs(ring[:, 1] - n0) < 1) | (np.abs(ring[:, 1] - n1) < 1)
        run[on_edge] = 0
        sea = ring + outward * run[:, None]
        bottom_positions = np.column_stack([sea[:, 0], np.full(count, SEA_FLOOR), -sea[:, 1]])
        positions.append(bottom_positions)
        seabed = np.where((ring_heights < 2.5)[:, None], np.array([0.62, 0.58, 0.42]), np.array(COLORS["cliff"]) * 0.7)
        color_list.append(seabed)
        bottom = np.arange(offset, offset + count)
        nxt = np.roll(np.arange(count), -1)
        index_list.append(np.column_stack([top, top[nxt], bottom[nxt]]))
        index_list.append(np.column_stack([top, bottom[nxt], bottom]))
        offset += count
        start += count

    positions = np.vstack(positions).astype("<f4")
    color_array = np.clip(np.vstack(color_list), 0, 1).astype("<f4")
    indices = np.vstack(index_list).astype("<u4")

    with open(OUT, "wb") as f:
        f.write(struct.pack("<5I", 0x4C495831, len(positions), indices.size, cols, rows))
        f.write(struct.pack("<3f", x0, n0, STEP))
        f.write(grid.astype("<f4").tobytes())
        f.write(positions.tobytes())
        f.write(color_array.tobytes())
        f.write(indices.tobytes())

    build_trees(world, grid, (x0, n0))
    print(f"terrain : {len(positions)} points, {len(indices)} triangles, grille {cols} x {rows}, "
          f"altitude max {grid.max():.0f} m, fichier {OUT.stat().st_size // 1024} ko")
    return points, triangles, heights, colors


def build_trees(world, grid=None, grid_origin=None):
    """Végétation. Trois sources, de la plus sûre à la plus libre :
    1. les zones vertes réelles d'OSM (bois, garrigue, parcs) : on y répartit des arbres ;
    2. les collines non bâties (relief réel) : maquis clairsemé de pins, cyprès et buissons ;
    3. les rues qui ont un trottoir assez large : arbres d'alignement, palmiers près de la mer.
    L'emplacement exact de chaque arbre est tiré au hasard (tirage toujours identique) :
    c'est un décor plausible, pas un relevé arbre par arbre."""
    rng = np.random.default_rng(7)
    road_points = np.vstack([pairs(r["p"]) for r in world["roads"]])
    road_owner = np.concatenate([np.full(len(r["p"]) // 2, i) for i, r in enumerate(world["roads"])])
    building_points = np.vstack([pairs(b["p"]) for b in world["buildings"]])
    roads, buildings = cKDTree(road_points), cKDTree(building_points)
    land = [Polygon(pairs(r)) for r in world["land"] if len(r) >= 6]
    coast = cKDTree(np.vstack([densify(pairs(r), 20) for r in world["land"] if len(r) >= 6]))
    out = {"pine": [], "palm": [], "ficus": [], "cypress": [], "bush": [], "araucaria": []}

    def add(kind, x, n, low=0.75, high=1.35):
        out[kind] += [round(float(x), 1), round(float(n), 1), round(float(low + rng.random() * (high - low)), 2)]

    # 1. Zones vertes OSM
    # Densité (m² par arbre) et espèces. Annaba a peu de palmiers dans ses espaces verts (retour de Houssem) :
    # surtout ficus, pins d'Alep, cyprès et massifs ; les zones vertes de la carte sont plantées plus densément.
    mixes = {"wood": (110, [("pine", 0.6), ("cypress", 0.15), ("bush", 0.25)]),
             "scrub": (170, [("bush", 0.65), ("pine", 0.35)]),
             "grass": (160, [("palm", 0.04), ("ficus", 0.38), ("pine", 0.2), ("cypress", 0.08), ("bush", 0.3)])}
    for area in world["areas"]:
        if area["k"] not in mixes:
            continue
        per_tree, mix = mixes[area["k"]]
        ring = pairs(area["p"])
        # Squares du centre (Cours, place du théâtre) : pelouses plantées avec soin, comme sur les photos —
        # quelques palmiers et araucarias isolés, massifs bas ; pas de forêt d'arbres tirés au hasard.
        hall = world["meta"].get("town_hall")
        if area["k"] == "grass" and hall and np.hypot(*(ring.mean(axis=0) - np.array(hall))) < 550:
            per_tree, mix = 260, [("palm", 0.35), ("araucaria", 0.25), ("bush", 0.4)]
        lo, hi = ring.min(axis=0), ring.max(axis=0)
        count = int((hi[0] - lo[0]) * (hi[1] - lo[1]) / per_tree)
        if count == 0:
            continue
        candidates = lo + rng.random((count, 2)) * (hi - lo)
        candidates = candidates[Polygon(ring).contains_points(candidates)]
        if len(candidates) == 0:
            continue
        candidates = candidates[(roads.query(candidates)[0] > 7) & (buildings.query(candidates)[0] > 5)]
        names, weights = [m[0] for m in mix], [m[1] for m in mix]
        for (x, n), kind in zip(candidates, rng.choice(names, len(candidates), p=weights)):
            add(kind, x, n)

    # 2. Collines non bâties : maquis
    if grid is not None:
        gx0, gn0 = grid_origin
        rows, cols = grid.shape
        gx, gn = np.meshgrid(gx0 + np.arange(cols) * STEP, gn0 + np.arange(rows) * STEP)
        nodes = np.column_stack([gx.ravel(), gn.ravel()])
        nodes = nodes[grid.ravel() > 35] + (rng.random((int((grid > 35).sum()), 2)) - 0.5) * STEP
        on_land = np.zeros(len(nodes), dtype=bool)
        for polygon in land:
            on_land |= polygon.contains_points(nodes)
        wild = on_land & (buildings.query(nodes)[0] > 35) & (roads.query(nodes)[0] > 12)
        for x, n in nodes[wild]:
            add(rng.choice(["pine", "pine", "bush", "bush", "cypress"]), x, n)

    # 3. Arbres d'alignement le long des rues à trottoir
    side = 1
    for road_index, road in enumerate(world["roads"]):
        width, walk = road["w"], road.get("sw", 0)
        if walk < 1.5 or road["k"] not in ("primary", "secondary", "tertiary", "residential"):
            continue
        line = pairs(road["p"])
        spacing = 14 if road["k"] != "residential" else 22
        since = spacing / 2
        for a, b in zip(line, line[1:]):
            length = np.hypot(*(b - a))
            since += length
            if since < spacing or length < 0.01:
                continue
            since = 0
            side = -side
            offset = width / 2 + walk * 0.55
            normal = np.array([-(b - a)[1], (b - a)[0]]) / length
            point = b + normal * offset * side
            # Pas dans un carrefour (une autre rue passe là) ni contre une façade.
            if roads.query(point)[0] < offset * 0.85 or buildings.query(point)[0] < 1.6:
                continue
            # Pas non plus sur la chaussée d'une AUTRE rue toute proche (voies parallèles, bretelles).
            near = roads.query_ball_point(point, 7.5)
            if any(road_owner[k] != road_index for k in near):
                continue
            near_sea = coast.query(point)[0] < 160
            if near_sea and road["k"] != "residential" and rng.random() < 0.3:
                add("palm", *point, 0.9, 1.3)
            else:
                add("ficus", *point, 0.8, 1.15)

    # 4. Le Cours de la Révolution (photo de la promenade) : deux alignements réguliers de grands ficus, de part et
    #    d'autre de l'allée centrale dallée, un arbre tous les 9 m, sans décalage aléatoire ; leurs houppiers se
    #    rejoignent au-dessus de l'allée. Pas de palmier dans les alignements.
    lines = world["meta"].get("cours_promenade")
    if lines:
        west, east = np.array(lines[0]), np.array(lines[1])
        planted = 0
        marks = np.arange(west[0, 1] + 4, west[-1, 1] - 4, 9.0)
        wx = np.interp(marks, west[:, 1], west[:, 0]); ex = np.interp(marks, east[:, 1], east[:, 0])
        for n, a, b in zip(marks, wx, ex):
            width = b - a
            if width < 14:
                continue
            for x in (a + 3.5, b - 3.5):          # près des bordures : l'allée centrale reste dégagée
                spot = np.array([x, n])
                if buildings.query(spot)[0] < 3 or roads.query(spot)[0] < 1.5:
                    continue
                add("ficus", *spot, 2.0, 2.2)   # grands sujets : les houppiers se rejoignent au-dessus de l'allée
                planted += 1
        print("Cours de la Révolution :", planted, "ficus en deux alignements")

    # 4 bis. Place devant la gare maritime : une rangée de palmiers des Canaries au pied chaulé (photo de Houssem),
    #        entre l'avenue et la clôture bleue du port.
    for n in np.arange(-95.0, 101.0, 9.0):
        spot = np.array([59.5, n])
        if roads.query(spot)[0] > 2.5 and buildings.query(spot)[0] > 2:
            add("palm", *spot, 1.1, 1.25)

    # 5. Détails du bord de mer : parasols de paille sur les plages (emplacements indicatifs),
    #    rochers au pied des côtes rocheuses et aux extrémités des plages.
    out["parasol"], out["rock"] = [], []
    for area in world["areas"]:
        if area["k"] != "beach":
            continue
        ring = pairs(area["p"]); shape = Polygon(ring)
        lo, hi = ring.min(axis=0), ring.max(axis=0)
        spots = np.array([[x, n] for x in np.arange(lo[0], hi[0], 8.5) for n in np.arange(lo[1], hi[1], 8.5)])
        if not len(spots):
            continue
        spots = spots + rng.normal(0, 1.6, spots.shape)
        spots = spots[shape.contains_points(spots)]
        for spot in spots:
            sea = coast.query(spot)[0]
            if 5 < sea < 30 and buildings.query(spot)[0] > 4 and roads.query(spot)[0] > 5 and rng.random() < 0.55:
                add("parasol", *spot, 0.9, 1.15)
    beach_shapes = [Polygon(pairs(a["p"])) for a in world["areas"] if a["k"] == "beach"]
    rect = world["meta"]["rect_m"]
    for land in world["land"]:
        if len(land) < 6:
            continue
        line = densify(pairs(land), 5)
        centre = line.mean(axis=0)
        for point in line:
            if min(abs(point[0] - rect[0]), abs(point[0] - rect[2]), abs(point[1] - rect[1]), abs(point[1] - rect[3])) < 2:
                continue
            sandy = any(shape.contains_points([point], radius=6)[0] or shape.contains_points([point], radius=-6)[0] for shape in beach_shapes)
            if rng.random() < (0.04 if sandy else 0.45):
                inland = (centre - point) / max(np.hypot(*(centre - point)), 1)
                add("rock", *(point + inland * rng.uniform(-1.5, 2.5) + rng.normal(0, 1.2, 2)), 0.5, 1.9)

    counts = {k: len(v) // 3 for k, v in out.items()}
    out["wall"] = WALLS
    TREES_OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print("végétation :", counts, "total", sum(counts.values()))


if __name__ == "__main__":
    main()
