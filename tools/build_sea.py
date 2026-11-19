"""
Carte de la mer pour le jeu (public/world/sea.png + sea.json), à partir des côtes d'OSM et de la bathymétrie.

Chaque pixel (16 m) donne :
- R : distance au rivage en mètres (0 à 255), côté mer ; 0 sur terre ;
- G : profondeur, codée G = 255 × √(profondeur / 400 m) ;
- B : 255 sur la terre ferme.
Près du rivage la profondeur suit une pente régulière (la maille de la bathymétrie, ~115 m, est trop grossière
pour les petits fonds) ; au-delà de 250 m c'est la bathymétrie réelle (EMODnet, voir extract_bathymetry.py).
Ligne 0 de l'image = nord.
Usage : python tools/build_sea.py (après build_world.py)
"""
import json
import sys
from pathlib import Path

import numpy as np
from matplotlib.path import Path as Polygon
from PIL import Image
from scipy.ndimage import distance_transform_edt, map_coordinates

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_world import Projection  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / "public" / "world" / "annaba.json"
BATHY = ROOT / "data" / "bathymetry"
OUT_PNG = ROOT / "public" / "world" / "sea.png"
OUT_JSON = ROOT / "public" / "world" / "sea.json"
OUT_REGION_PNG = ROOT / "public" / "world" / "sea_region.png"
OUT_REGION_JSON = ROOT / "public" / "world" / "sea_region.json"
REGION_STEP = 48.0
STEP = 16.0
MARGIN = 3200.0          # la mer autour de la carte (jusqu'à l'horizon visible)
DEPTH_MAX = 400.0
NEAR_SLOPE = 0.045       # pente des petits fonds : 4,5 cm par mètre
SHORE_DEPTH = 2.6        # profondeur au pied du talus du rivage (même valeur que build_terrain.SEA_FLOOR)


def load_region_land():
    """Terre de la wilaya (data/region/land_20m.npz) : fonction (x, n) -> booléen, ou None si absente."""
    path = ROOT / "data" / "region" / "land_20m.npz"
    if not path.exists():
        return None
    z = np.load(path)
    mask, x0, n0, step = z["land"], float(z["x0"]), float(z["n0"]), float(z["step"])

    def at(x, n):
        j = np.clip(np.round((x - x0) / step).astype(int), 0, mask.shape[1] - 1)
        i = np.clip(np.round((n - n0) / step).astype(int), 0, mask.shape[0] - 1)
        return mask[i, j]
    return at


def depth_from(shore, land, X, N, world):
    """Profondeur (m) : pente régulière près du rivage, bathymétrie EMODnet au-delà de 250 m."""
    near = SHORE_DEPTH + NEAR_SLOPE * shore
    depth, source = near, "pente régulière seulement"
    if (BATHY / "summary.json").exists():
        meta = json.loads((BATHY / "summary.json").read_text(encoding="utf-8"))
        bathy = np.array(Image.open(BATHY / "annaba_bathy.png")).astype(float) / 10.0
        lat0, lon0 = world["meta"]["origin_lat_lon"]
        P = Projection(lat0, lon0, 36.93)
        lat = lat0 + N / P.m_lat; lon = lon0 + X / P.m_lon
        r = (meta["north"] - lat) / (meta["north"] - meta["south"]) * (meta["rows"] - 1)
        c = (lon - meta["west"]) / (meta["east"] - meta["west"]) * (meta["cols"] - 1)
        real = map_coordinates(bathy, [r.ravel(), c.ravel()], order=1, mode="nearest").reshape(shore.shape)
        blend = np.clip((shore - 60) / 190, 0, 1)
        depth = near * (1 - blend) + np.maximum(real, near * 0.6) * blend
        source = meta["source"]
    return np.where(land, 0, np.clip(depth, 0, DEPTH_MAX)), source


def save_map(png, meta_path, shore, depth, land, x0, n0, step, source):
    rows, cols = shore.shape
    image = np.zeros((rows, cols, 3), dtype=np.uint8)
    image[..., 0] = np.clip(np.round(shore), 0, 255)
    image[..., 1] = np.round(255 * np.sqrt(depth / DEPTH_MAX))
    image[..., 2] = np.where(land, 255, 0)
    Image.fromarray(image, "RGB").save(png, optimize=True)
    meta_path.write_text(json.dumps({"x0": x0, "n0": n0, "step": step, "cols": cols, "rows": rows, "depthMax": DEPTH_MAX,
                                     "row0": "nord", "source": source}, ensure_ascii=False), encoding="utf-8")
    print(f"{png.name} : {cols} x {rows} pixels de {step:.0f} m, profondeur max {depth.max():.0f} m, {png.stat().st_size // 1024} ko")


def region_map(world):
    """Carte de la mer de toute la wilaya (pixels de 48 m), utilisée hors de la carte détaillée."""
    region_land = load_region_land()
    region_json = ROOT / "public" / "world" / "region.json"
    if region_land is None or not region_json.exists():
        return
    x0, n0, x1, n1 = json.loads(region_json.read_text(encoding="utf-8"))["meta"]["rect_m"]
    step = REGION_STEP
    cols = int(np.ceil((x1 - x0) / step)); rows = int(np.ceil((n1 - n0) / step))
    X, N = np.meshgrid(x0 + (np.arange(cols) + 0.5) * step, n1 - (np.arange(rows) + 0.5) * step)
    # Distance au rivage mesurée sur la grille de 20 m (plus juste), puis lue au centre des pixels de 48 m.
    z = np.load(ROOT / "data" / "region" / "land_20m.npz")
    mask = z["land"]
    fine = distance_transform_edt(~mask) * float(z["step"])
    i = np.clip(np.round((N - float(z["n0"])) / float(z["step"])).astype(int), 0, mask.shape[0] - 1)
    j = np.clip(np.round((X - float(z["x0"])) / float(z["step"])).astype(int), 0, mask.shape[1] - 1)
    land, shore = mask[i, j], fine[i, j]
    depth, source = depth_from(shore, land, X, N, world)
    save_map(OUT_REGION_PNG, OUT_REGION_JSON, shore, depth, land, x0, n0, step, source)


def main():
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    x0, n0, x1, n1 = world["meta"]["rect_m"]
    x0 -= MARGIN; n0 -= MARGIN; x1 += MARGIN; n1 += MARGIN
    cols = int(np.ceil((x1 - x0) / STEP)); rows = int(np.ceil((n1 - n0) / STEP))
    gx = x0 + (np.arange(cols) + 0.5) * STEP
    gn = n1 - (np.arange(rows) + 0.5) * STEP              # ligne 0 = nord
    X, N = np.meshgrid(gx, gn)
    pts = np.column_stack([X.ravel(), N.ravel()])
    land = np.zeros(len(pts), dtype=bool)
    for ring in world["land"]:
        if len(ring) < 6:
            continue
        r = np.array(ring).reshape(-1, 2)
        lo, hi = r.min(axis=0), r.max(axis=0)
        inside = (pts[:, 0] >= lo[0]) & (pts[:, 0] <= hi[0]) & (pts[:, 1] >= lo[1]) & (pts[:, 1] <= hi[1])
        idx = np.where(inside)[0]
        if len(idx):
            land[idx[Polygon(r).contains_points(pts[idx])]] = True
    land = land.reshape(rows, cols)
    # Wilaya autour de la ville : hors du rectangle, la terre est celle de la côte réelle (build_region.py).
    region_land = load_region_land()
    if region_land is not None:
        cx0, cn0, cx1, cn1 = world["meta"]["rect_m"]
        outside = (X < cx0) | (X > cx1) | (N < cn0) | (N > cn1)
        land = np.where(outside, region_land(X, N), land)
    shore = distance_transform_edt(~land) * STEP          # distance au rivage le plus proche (m), 0 sur terre

    depth, source = depth_from(shore, land, X, N, world)
    save_map(OUT_PNG, OUT_JSON, shore, depth, land, x0, n0, STEP, source)
    region_map(world)


if __name__ == "__main__":
    main()
