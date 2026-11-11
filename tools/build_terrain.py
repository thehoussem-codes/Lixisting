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

STEP = 30.0          # espacement des points du terrain (m)
COAST_STEP = 12.0    # espacement maximal des points le long de la côte (m)
MIN_HEIGHT = 0.4     # la terre reste toujours un peu au-dessus de la mer (niveau 0)
SKIRT_BOTTOM = -3.0  # les bords de la terre descendent sous l'eau (falaises, quais)

COLORS = {  # couleurs du sol (rouge, vert, bleu de 0 à 1)
    "land": (0.74, 0.69, 0.53), "beach": (0.93, 0.85, 0.63), "wood": (0.24, 0.48, 0.23),
    "scrub": (0.49, 0.59, 0.33), "grass": (0.53, 0.71, 0.38), "pitch": (0.37, 0.63, 0.32),
    "rock": (0.60, 0.59, 0.55), "hill": (0.42, 0.55, 0.30), "cliff": (0.52, 0.47, 0.40),
}


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

    points = np.vstack([coast_points, interior])
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

    # --- couleur de chaque point : type de sol OSM, sinon selon l'altitude et la pente
    colors = np.tile(COLORS["land"], (len(points), 1))
    gy, gxx = np.gradient(grid, STEP)
    slope = np.hypot(gxx, gy)
    ix = np.clip(((points[:, 0] - x0) / STEP).round().astype(int), 0, cols - 1)
    iy = np.clip(((points[:, 1] - n0) / STEP).round().astype(int), 0, rows - 1)
    colors[heights > 60] = COLORS["hill"]
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
    for ring in coast:
        count = len(ring)
        top = np.arange(start, start + count)
        bottom_positions = np.column_stack([ring[:, 0], np.full(count, SKIRT_BOTTOM), -ring[:, 1]])
        positions.append(bottom_positions)
        color_list.append(np.tile(np.array(COLORS["cliff"]) * 0.8, (count, 1)))
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

    print(f"terrain : {len(positions)} points, {len(indices)} triangles, grille {cols} x {rows}, "
          f"altitude max {grid.max():.0f} m, fichier {OUT.stat().st_size // 1024} ko")
    return points, triangles, heights, colors


if __name__ == "__main__":
    main()
