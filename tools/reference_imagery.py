"""
Télécharge une vue aérienne de référence (Esri World Imagery) d'une zone du jeu, pour repérer
les bâtiments à la main. L'image sert seulement de modèle : elle n'est ni mise dans le jeu ni
enregistrée dans le dépôt (artefact GitHub supprimé au bout d'un jour).

Usage : python tools/reference_imagery.py x0 n0 x1 n1 [zoom]   (coordonnées du jeu, en mètres)
"""
import io
import json
import math
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_world import Projection

ROOT = Path(__file__).resolve().parent.parent
URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def main():
    x0, n0, x1, n1 = map(float, sys.argv[1:5])
    z = int(sys.argv[5]) if len(sys.argv) > 5 else 19
    meta = json.loads((ROOT / "public/world/annaba.json").read_text(encoding="utf-8"))["meta"]
    lat0, lon0 = meta["origin_lat_lon"]
    P = Projection(lat0, lon0, 36.93)
    to_ll = lambda x, n: (lat0 + n / P.m_lat, lon0 + x / P.m_lon)
    (la_s, lo_w), (la_n, lo_e) = to_ll(x0, n0), to_ll(x1, n1)
    tx0, ty0 = tile_xy(la_n, lo_w, z)
    tx1, ty1 = tile_xy(la_s, lo_e, z)
    img = Image.new("RGB", ((int(tx1) - int(tx0) + 1) * 256, (int(ty1) - int(ty0) + 1) * 256))
    for ty in range(int(ty0), int(ty1) + 1):
        for tx in range(int(tx0), int(tx1) + 1):
            req = urllib.request.Request(URL.format(z=z, x=tx, y=ty), headers={"User-Agent": "lixiting-reference"})
            tile = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert("RGB")
            img.paste(tile, ((tx - int(tx0)) * 256, (ty - int(ty0)) * 256))
    # Recadrage exact et quadrillage tous les 50 m (coordonnées du jeu) pour se repérer.
    def px(x, n):
        la, lo = to_ll(x, n)
        tx, ty = tile_xy(la, lo, z)
        return (tx - int(tx0)) * 256, (ty - int(ty0)) * 256
    left, top = px(x0, n1); right, bottom = px(x1, n0)
    draw = ImageDraw.Draw(img)
    for gx in range(int(math.ceil(x0 / 50) * 50), int(x1) + 1, 50):
        a, _ = px(gx, n0); draw.line([(a, top), (a, bottom)], fill=(255, 255, 0), width=1); draw.text((a + 2, top + 2), str(gx), fill=(255, 255, 0))
    for gn in range(int(math.ceil(n0 / 50) * 50), int(n1) + 1, 50):
        _, b = px(x0, gn); draw.line([(left, b), (right, b)], fill=(255, 255, 0), width=1); draw.text((left + 2, b + 2), str(gn), fill=(255, 255, 0))
    out = ROOT / "reference.jpg"
    img.crop((int(left), int(top), int(right), int(bottom))).save(out, quality=88)
    print("enregistré", out, img.size)


if __name__ == "__main__":
    main()
