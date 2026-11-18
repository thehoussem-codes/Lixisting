"""
Télécharge l'occupation du sol vue par satellite sur la zone d'Annaba et l'enregistre
dans data/landcover/ (une image en niveaux de gris : une case = 10 m x 10 m du jeu).

Source : ESA WorldCover 10 m 2021 v200 (images Sentinel-1 et Sentinel-2, licence CC BY 4.0).
© ESA WorldCover project / Contains modified Copernicus Sentinel data (2021)
processed by ESA WorldCover consortium.

Classes : 10 arbres, 20 broussailles, 30 herbe, 40 cultures, 50 bâti, 60 sol nu,
80 eau, 90 zone humide, 95 mangrove, 100 mousse.

Usage : pip install rasterio pillow && python tools/extract_landcover.py
"""
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import from_bounds

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_world import Projection  # même conversion degrés -> mètres que la carte

ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / "public" / "world" / "annaba.json"
OUT_DIR = ROOT / "data" / "landcover"
STEP = 10.0
URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N36E006_Map.tif"


def read_window(path, bounds):
    with rasterio.open(path) as source:
        window = from_bounds(*bounds, transform=source.transform).round_offsets().round_lengths()
        data = source.read(1, window=window)
        transform = source.window_transform(window)
    return data, transform


def main():
    meta = json.loads(WORLD.read_text(encoding="utf-8"))["meta"]
    lat0, lon0 = meta["origin_lat_lon"]
    x0, n0, x1, n1 = meta["rect_m"]
    project = Projection(lat0, lon0, 36.93)

    cols = int(np.ceil((x1 - x0) / STEP)) + 1
    rows = int(np.ceil((n1 - n0) / STEP)) + 1
    gx, gn = np.meshgrid(x0 + np.arange(cols) * STEP, n0 + np.arange(rows) * STEP)
    lat = lat0 + gn / project.m_lat
    lon = lon0 + gx / project.m_lon
    margin = 0.002
    bounds = (lon.min() - margin, lat.min() - margin, lon.max() + margin, lat.max() + margin)  # ouest, sud, est, nord

    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    try:
        print("Lecture partielle de", URL, flush=True)
        data, transform = read_window("/vsicurl/" + URL, bounds)
    except Exception as error:  # repli : téléchargement complet de la tuile
        print("Lecture partielle impossible :", error, "-> téléchargement complet", flush=True)
        with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
            urllib.request.urlretrieve(URL, tmp.name)
            data, transform = read_window(tmp.name, bounds)

    # Case la plus proche pour chaque point de la grille du jeu.
    inverse = ~transform
    col, row = inverse * (lon, lat)
    col = np.clip(np.floor(col).astype(int), 0, data.shape[1] - 1)
    row = np.clip(np.floor(row).astype(int), 0, data.shape[0] - 1)
    grid = data[row, col].astype(np.uint8)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Ligne 0 de l'image = sud de la carte (même sens que la grille d'altitudes).
    Image.fromarray(grid, mode="L").save(OUT_DIR / "annaba_worldcover.png", optimize=True)
    classes, counts = np.unique(grid, return_counts=True)
    summary = {
        "source": "ESA WorldCover 10 m 2021 v200",
        "licence": "CC BY 4.0",
        "attribution": "© ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
        "url": URL,
        "x0": x0, "n0": n0, "step": STEP, "cols": cols, "rows": rows,
        "row0": "sud",
        "classes": {int(c): int(k) for c, k in zip(classes, counts)},
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
