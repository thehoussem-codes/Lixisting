"""
Empreintes de bâtiments de toute la wilaya d'Annaba, d'après Overture Maps (thème « buildings »).

Overture réunit les bâtiments d'OpenStreetMap et ceux détectés automatiquement sur les images aériennes et
satellite (Microsoft Global ML Building Footprints, Google Open Buildings, Esri Community Maps). On garde tout,
avec la source de chaque bâtiment : build_world.py n'ajoute dans la ville que les bâtiments détectés là où OSM
n'en a pas, et les villes autour (wilaya entière) utilisent toutes les sources.

Licence : ODbL (Overture Maps Foundation, contributeurs OpenStreetMap, Microsoft, Google, Esri).
Sortie : data/buildings/annaba_overture.json.gz + summary.json.

Usage (action GitHub) : pip install "overturemaps>=1.0" shapely ; python tools/extract_buildings.py
"""
import gzip
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import shapely
import shapely.wkb

try:
    from overturemaps import record_batch_reader
except ImportError:  # anciennes versions
    from overturemaps.core import record_batch_reader

# Wilaya d'Annaba et ses abords (ouest, sud, est, nord) : de Chetaïbi à la limite d'El Tarf, jusqu'à Guelma au sud.
BBOX = (7.20, 36.55, 8.10, 37.12)
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "buildings"

SOURCE_CODE = {
    "OpenStreetMap": "o",
    "Microsoft ML Buildings": "m",
    "Google Open Buildings": "g",
    "Esri Community Maps": "e",
}


def source_of(sources):
    """Source principale (celle de la géométrie) et confiance de la détection automatique."""
    best, confidence = "x", None
    for s in sources or []:
        if not s:
            continue
        code = SOURCE_CODE.get(s.get("dataset") or "", "x")
        if s.get("property") in (None, "", "/geometry") or best == "x":
            best = code
            if s.get("confidence") is not None:
                confidence = s["confidence"]
    return best, confidence


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    reader = record_batch_reader("building", bbox=BBOX)
    if reader is None:
        raise SystemExit("Aucune donnée Overture pour cette zone.")
    buildings, counts, heights, skipped = [], Counter(), Counter(), Counter()
    for batch in reader:
        columns = set(batch.schema.names)
        data = batch.to_pydict()
        for i in range(batch.num_rows):
            try:
                geometry = shapely.wkb.loads(data["geometry"][i])
            except Exception:
                skipped["géométrie illisible"] += 1
                continue
            if geometry.geom_type == "MultiPolygon":
                geometry = max(geometry.geoms, key=lambda g: g.area)
            if geometry.geom_type != "Polygon" or geometry.is_empty:
                skipped["pas un polygone"] += 1
                continue
            c = geometry.representative_point()
            if not (BBOX[0] <= c.x <= BBOX[2] and BBOX[1] <= c.y <= BBOX[3]):
                continue
            if "is_underground" in columns and data["is_underground"][i]:
                skipped["souterrain"] += 1
                continue
            # 0,000004° ≈ 0,4 m : assez pour garder les angles droits, beaucoup moins de points.
            ring = shapely.simplify(geometry, 0.000004, preserve_topology=True).exterior.coords[:-1]
            if len(ring) < 3:
                skipped["trop petit"] += 1
                continue
            code, confidence = source_of(data.get("sources", [None] * batch.num_rows)[i])
            record = {"s": code, "p": [round(v, 6) for xy in ring for v in xy]}
            if confidence is not None:
                record["c"] = round(float(confidence), 2)
            for key, short in (("height", "h"), ("num_floors", "f"), ("min_height", "mh")):
                if key in columns and data[key][i] is not None:
                    record[short] = round(float(data[key][i]), 1) if short != "f" else int(data[key][i])
            if "class" in columns and data["class"][i]:
                record["k"] = data["class"][i]
            if "h" in record or "f" in record:
                heights[code] += 1
            buildings.append(record)
            counts[code] += 1
    payload = {
        "source": "Overture Maps Foundation, thème buildings (OSM, Microsoft ML Buildings, Google Open Buildings, Esri)",
        "licence": "ODbL 1.0",
        "bbox_west_south_east_north": BBOX,
        "codes": {v: k for k, v in SOURCE_CODE.items()} | {"x": "autre"},
        "buildings": buildings,
    }
    with gzip.open(OUT_DIR / "annaba_overture.json.gz", "wt", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    summary = {
        "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": payload["source"],
        "licence": payload["licence"],
        "bbox_west_south_east_north": BBOX,
        "buildings": len(buildings),
        "by_source": {payload["codes"][k]: v for k, v in counts.most_common()},
        "with_height_by_source": {payload["codes"][k]: v for k, v in heights.most_common()},
        "skipped": dict(skipped),
        "file_mb": round((OUT_DIR / "annaba_overture.json.gz").stat().st_size / 1e6, 1),
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
