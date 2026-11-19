"""
Données légères de toute la wilaya d'Annaba et de ses abords (El Tarf, Guelma, Skikda), pour agrandir la carte
autour de la ville détaillée : routes principales, côte, voies ferrées, rivières et lacs, villes et villages,
limites des wilayas (OpenStreetMap, via Overpass), relief (Terrain Tiles, zoom 11, ~60 m) et occupation du sol
(ESA WorldCover 10 m, réduite à 30 m).

Sortie dans data/region/ :
  osm_region.json.gz   éléments OSM avec leur géométrie (out geom)
  dem_region.png       altitude en décimètres + 10 000 (entier 16 bits), ligne 0 = sud, pas de 60 m (mètres du jeu)
  cover_region.png     classes WorldCover, ligne 0 = sud, pas de 30 m
  summary.json

Usage (action GitHub) : pip install pillow numpy rasterio ; python tools/extract_region.py
"""
import gzip
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_world import Projection  # même conversion degrés -> mètres que la carte

ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / "public" / "world" / "annaba.json"
OUT_DIR = ROOT / "data" / "region"
# Wilaya d'Annaba et ses abords : (sud, ouest, nord, est), comme data/buildings.
BBOX = (36.55, 7.20, 37.12, 8.10)
DEM_ZOOM, DEM_STEP = 11, 60.0
COVER_STEP = 30.0
TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
WORLDCOVER = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N36E006_Map.tif"
SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def overpass_query():
    b = ",".join(str(v) for v in BBOX)
    roads = "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential"
    return f"""
[out:json][timeout:600][maxsize:2147483648];
(
  way["highway"~"^({roads})$"]({b});
  way["natural"="coastline"]({b});
  way["railway"="rail"]({b});
  way["waterway"~"^(river|canal)$"]({b});
  way["natural"="water"]({b});
  relation["natural"="water"]({b});
  way["landuse"="reservoir"]({b});
  way["natural"="wetland"]({b});
  way["aeroway"~"^(runway|aerodrome)$"]({b});
  node["place"~"^(city|town|village|suburb|hamlet)$"]({b});
  relation["boundary"="administrative"]["admin_level"~"^(4|6)$"]({b});
);
out geom qt;
"""


def download_osm():
    data = urllib.parse.urlencode({"data": overpass_query()}).encode()
    last = None
    for server in SERVERS:
        for attempt in range(2):
            try:
                print(f"Overpass : {server} (essai {attempt + 1})", flush=True)
                request = urllib.request.Request(server, data=data, headers={"User-Agent": "lixiting-game-extract/0.2"})
                with urllib.request.urlopen(request, timeout=900) as response:
                    return json.loads(response.read())
            except Exception as error:
                last = error
                print("  échec :", error, flush=True)
                time.sleep(20)
    raise SystemExit(f"Aucun serveur Overpass n'a répondu : {last}")


def tile_xy(lat, lon, zoom):
    n = 2 ** zoom
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta = json.loads(WORLD.read_text(encoding="utf-8"))["meta"]
    lat0, lon0 = meta["origin_lat_lon"]
    project = Projection(lat0, lon0, 36.93)
    south, west, north, east = BBOX
    x0, n0 = project(south, west)
    x1, n1 = project(north, east)

    # --- OpenStreetMap
    osm = download_osm()
    with gzip.open(OUT_DIR / "osm_region.json.gz", "wt", encoding="utf-8") as f:
        json.dump(osm, f, separators=(",", ":"))
    kinds = Counter()
    for e in osm["elements"]:
        t = e.get("tags", {})
        key = next((f"{k}={t[k]}" for k in ("highway", "natural", "railway", "waterway", "place", "boundary", "landuse", "aeroway") if k in t), "autre")
        kinds[key] += 1

    # --- Relief : grille au pas de 60 m dans les coordonnées du jeu (bilinéaire dans les tuiles Terrarium).
    cols, rows = int((x1 - x0) // DEM_STEP) + 2, int((n1 - n0) // DEM_STEP) + 2
    gx, gn = np.meshgrid(x0 + np.arange(cols) * DEM_STEP, n0 + np.arange(rows) * DEM_STEP)
    lat, lon = lat0 + gn / project.m_lat, lon0 + gx / project.m_lon
    n = 2 ** DEM_ZOOM
    fx = (lon + 180) / 360 * n * 256 - 0.5
    fy = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n * 256 - 0.5
    tx0, tx1 = int(fx.min() // 256), int(fx.max() // 256) + 1
    ty0, ty1 = int(fy.min() // 256), int(fy.max() // 256) + 1
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            url = TERRARIUM.format(z=DEM_ZOOM, x=tx, y=ty)
            print("Relief", url, flush=True)
            request = urllib.request.Request(url, headers={"User-Agent": "lixiting-game-extract/0.2"})
            with urllib.request.urlopen(request, timeout=60) as response:
                rgb = np.asarray(Image.open(io.BytesIO(response.read())).convert("RGB")).astype(np.float32)
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
    px, py = fx - tx0 * 256, fy - ty0 * 256
    ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
    ax, ay = px - ix, py - iy
    ix = np.clip(ix, 0, mosaic.shape[1] - 2); iy = np.clip(iy, 0, mosaic.shape[0] - 2)
    height = (mosaic[iy, ix] * (1 - ax) + mosaic[iy, ix + 1] * ax) * (1 - ay) + (mosaic[iy + 1, ix] * (1 - ax) + mosaic[iy + 1, ix + 1] * ax) * ay
    encoded = np.clip(np.round(height * 10) + 10000, 0, 65535).astype(np.uint16)
    Image.fromarray(encoded).save(OUT_DIR / "dem_region.png")

    # --- Occupation du sol (WorldCover 10 m), case la plus proche tous les 30 m.
    import rasterio
    from rasterio.windows import from_bounds
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    ccols, crows = int((x1 - x0) // COVER_STEP) + 2, int((n1 - n0) // COVER_STEP) + 2
    cx, cn = np.meshgrid(x0 + np.arange(ccols) * COVER_STEP, n0 + np.arange(crows) * COVER_STEP)
    clat, clon = lat0 + cn / project.m_lat, lon0 + cx / project.m_lon
    bounds = (clon.min() - 0.002, clat.min() - 0.002, clon.max() + 0.002, clat.max() + 0.002)
    with rasterio.open("/vsicurl/" + WORLDCOVER) as source:
        window = from_bounds(*bounds, transform=source.transform).round_offsets().round_lengths()
        data = source.read(1, window=window)
        transform = source.window_transform(window)
    col, row = (~transform) * (clon, clat)
    col = np.clip(np.floor(col).astype(int), 0, data.shape[1] - 1)
    row = np.clip(np.floor(row).astype(int), 0, data.shape[0] - 1)
    cover = data[row, col].astype(np.uint8)
    Image.fromarray(cover, mode="L").save(OUT_DIR / "cover_region.png", optimize=True)

    classes, counts = np.unique(cover, return_counts=True)
    summary = {
        "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bbox_south_west_north_east": BBOX,
        "rect_m": [round(x0, 1), round(n0, 1), round(x1, 1), round(n1, 1)],
        "osm": {"elements": len(osm["elements"]), "by_kind": dict(kinds.most_common(40)),
                "licence": "ODbL, © contributeurs OpenStreetMap"},
        "dem": {"x0": round(x0, 1), "n0": round(n0, 1), "step": DEM_STEP, "cols": cols, "rows": rows,
                "encoding": "décimètres + 10000, ligne 0 = sud", "zoom": DEM_ZOOM,
                "min_m": round(float(height.min()), 1), "max_m": round(float(height.max()), 1),
                "source": "Terrain Tiles (AWS Open Data, Terrarium)"},
        "cover": {"x0": round(x0, 1), "n0": round(n0, 1), "step": COVER_STEP, "cols": ccols, "rows": crows, "row0": "sud",
                  "classes": {int(c): int(k) for c, k in zip(classes, counts)},
                  "source": "ESA WorldCover 10 m 2021 v200, CC BY 4.0"},
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
