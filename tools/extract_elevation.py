"""
Télécharge le relief de la zone d'Annaba et l'enregistre sous forme de grille
d'altitudes dans data/elevation/.

Source : "Terrain Tiles" (jeu de données ouvert hébergé par AWS, format Terrarium),
qui assemble notamment les relevés SRTM (environ 30 m de précision au sol).
Limite connue : les falaises et les petits reliefs sont adoucis.

Usage : pip install pillow && python tools/extract_elevation.py
"""
import gzip
import io
import json
import math
import sys
import urllib.request
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_world import Projection  # même conversion degrés -> mètres que la carte

ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / "public" / "world" / "annaba.json"
OUT_DIR = ROOT / "data" / "elevation"
ZOOM = 13
STEP = 20  # un point d'altitude tous les 20 m
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def tile_xy(lat, lon):
    """Coordonnées (fractionnaires) dans la grille de tuiles web au zoom choisi."""
    n = 2 ** ZOOM
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def main():
    meta = json.loads(WORLD.read_text(encoding="utf-8"))["meta"]
    lat0, lon0 = meta["origin_lat_lon"]
    x0, n0, x1, n1 = meta["rect_m"]
    project = Projection(lat0, lon0, 36.93)

    def lat_lon(x, n):
        return lat0 + n / project.m_lat, lon0 + x / project.m_lon

    corners = [tile_xy(*lat_lon(x, n)) for x in (x0, x1) for n in (n0, n1)]
    tx0, tx1 = int(min(c[0] for c in corners)), int(max(c[0] for c in corners))
    ty0, ty1 = int(min(c[1] for c in corners)), int(max(c[1] for c in corners))

    tiles = {}
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            url = URL.format(z=ZOOM, x=tx, y=ty)
            print("Téléchargement", url, flush=True)
            request = urllib.request.Request(url, headers={"User-Agent": "lixiting-game-extract/0.1"})
            with urllib.request.urlopen(request, timeout=60) as response:
                tiles[(tx, ty)] = Image.open(io.BytesIO(response.read())).convert("RGB").load()

    def pixel(px, py):
        px = min(max(px, tx0 * 256), (tx1 + 1) * 256 - 1)
        py = min(max(py, ty0 * 256), (ty1 + 1) * 256 - 1)
        r, g, b = tiles[(px // 256, py // 256)][px % 256, py % 256]
        return r * 256 + g + b / 256 - 32768

    def height(x, n):
        fx, fy = tile_xy(*lat_lon(x, n))
        fx, fy = fx * 256 - 0.5, fy * 256 - 0.5
        ix, iy = math.floor(fx), math.floor(fy)
        ax, ay = fx - ix, fy - iy
        top = pixel(ix, iy) * (1 - ax) + pixel(ix + 1, iy) * ax
        bottom = pixel(ix, iy + 1) * (1 - ax) + pixel(ix + 1, iy + 1) * ax
        return top * (1 - ay) + bottom * ay

    cols = int((x1 - x0) // STEP) + 2
    rows = int((n1 - n0) // STEP) + 2
    heights = [round(height(x0 + c * STEP, n0 + r * STEP), 1) for r in range(rows) for c in range(cols)]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    grid = {"x0": x0, "n0": n0, "step": STEP, "cols": cols, "rows": rows, "heights": heights,
            "source": "Terrain Tiles (AWS Open Data, format Terrarium), zoom %d" % ZOOM}
    with gzip.open(OUT_DIR / "annaba_dem.json.gz", "wt", encoding="utf-8") as f:
        json.dump(grid, f, separators=(",", ":"))

    places = json.loads(WORLD.read_text(encoding="utf-8"))["places"]
    summary = {
        "grid": f"{cols} x {rows} points, pas de {STEP} m",
        "min_m": min(heights), "max_m": max(heights),
        "share_above_50m": round(sum(h > 50 for h in heights) / len(heights), 3),
        "places_m": {p["name"]: round(height(p["x"], p["n"]), 1) for p in places},
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
