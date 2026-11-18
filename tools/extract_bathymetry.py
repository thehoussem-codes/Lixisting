"""
Télécharge la profondeur réelle de la mer autour d'Annaba et l'enregistre dans data/bathymetry/.

Source principale : EMODnet Bathymetry (DTM moyen, maille 1/16 de minute ≈ 115 m, licence CC BY 4.0),
service WCS public. Repli : NOAA ETOPO (maille 1 minute ≈ 1,8 km, domaine public) par ERDDAP.
La zone couvre toute la wilaya d'Annaba et ses abords en mer (pour l'extension de la carte).

Sortie : annaba_bathy.png (16 bits, profondeur en décimètres, 0 = terre ou rivage ; ligne 0 = nord)
et summary.json (emprise en degrés, source, profondeur maximale).
Usage : pip install rasterio pillow numpy && python tools/extract_bathymetry.py
"""
import io
import json
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "bathymetry"
WEST, SOUTH, EAST, NORTH = 7.10, 36.75, 8.45, 37.40


def emodnet():
    import rasterio
    step = 1 / 960  # 1/16 de minute d'arc
    url = ("https://ows.emodnet-bathymetry.eu/wcs?service=wcs&version=1.0.0&request=getcoverage"
           f"&coverage=emodnet:mean&crs=EPSG:4326&BBOX={WEST},{SOUTH},{EAST},{NORTH}"
           f"&format=image/tiff&interpolation=nearest&resx={step}&resy={step}")
    raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "lixiting"}), timeout=180).read()
    with rasterio.open(io.BytesIO(raw)) as src:
        z = src.read(1).astype(float)
        nodata = src.nodata
    if nodata is not None:
        z[z == nodata] = np.nan
    return z, "EMODnet Bathymetry DTM (moyenne), CC BY 4.0", url


def etopo():
    url = ("https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?"
           f"altitude%5B({SOUTH}):1:({NORTH})%5D%5B({WEST}):1:({EAST})%5D")
    text = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "lixiting"}), timeout=180).read().decode()
    rows = [line.split(",") for line in text.splitlines()[2:] if line]
    lat = np.array(sorted({float(r[0]) for r in rows}))[::-1]
    lon = np.array(sorted({float(r[1]) for r in rows}))
    z = np.full((len(lat), len(lon)), np.nan)
    li = {v: i for i, v in enumerate(lat)}; lo = {v: i for i, v in enumerate(lon)}
    for r in rows:
        z[li[float(r[0])], lo[float(r[1])]] = float(r[2])
    return z, "NOAA ETOPO1 (domaine public)", url


def main():
    try:
        z, source, url = emodnet()
        if np.isnan(z).all() or np.nanmin(z) > -5:
            raise RuntimeError("couverture vide")
    except Exception as error:
        print("EMODnet indisponible :", error, "-> ETOPO", flush=True)
        z, source, url = etopo()
    depth = np.clip(-np.nan_to_num(z, nan=0.0), 0, 6500)      # positif en mer, 0 sur terre
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.round(depth * 10).astype(np.uint16)).save(OUT / "annaba_bathy.png")
    summary = {"source": source, "url": url, "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
               "cols": int(depth.shape[1]), "rows": int(depth.shape[0]), "unit": "décimètres", "row0": "nord",
               "max_depth_m": float(depth.max()), "sea_cells": int((depth > 0).sum())}
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
