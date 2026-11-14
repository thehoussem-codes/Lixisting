"""
Télécharge les données OpenStreetMap de la zone d'Annaba (via Overpass)
et les enregistre telles quelles dans data/osm/.

Usage : python tools/extract_osm.py
Aucune dépendance à installer (bibliothèque standard uniquement).
"""
import gzip
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# Rectangle de travail (sud, ouest, nord, est), en degrés : TOUTE la ville d'Annaba.
# Du Cap de Garde (nord) à El Bouni et à l'embouchure de la Seybouse (sud), de la Plaine Ouest / Oued Forcha
# et des pentes de l'Edough (ouest) à la mer et Sidi Salem (est). Ancienne zone : (36.880, 7.730, 36.980, 7.800).
BBOX = (36.845, 7.685, 36.980, 7.815)

SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "osm"


def build_query() -> str:
    b = ",".join(str(v) for v in BBOX)
    return f"""
[out:json][timeout:300][maxsize:1073741824];
(
  way["highway"]({b});
  way["building"]({b});
  relation["building"]({b});
  way["natural"]({b});
  relation["natural"]({b});
  way["landuse"]({b});
  way["leisure"]({b});
  way["railway"]({b});
  way["barrier"]({b});
  way["man_made"]({b});
  way["amenity"]({b});
  way["waterway"]({b});
  way["tourism"]({b});
  node["barrier"]({b});
  node["railway"]({b});
  node["man_made"]({b});
  node["tourism"]({b});
  node["amenity"]({b});
  node["historic"]({b});
  node["place"]({b});
  node["natural"]({b});
  node["highway"]({b});
);
out body;
>;
out skel qt;
"""


def download(query: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode()
    last_error = None
    for server in SERVERS:
        for attempt in range(2):
            try:
                print(f"Requête vers {server} (essai {attempt + 1})...", flush=True)
                request = urllib.request.Request(
                    server, data=data, headers={"User-Agent": "lixiting-game-extract/0.1"}
                )
                with urllib.request.urlopen(request, timeout=300) as response:
                    return json.loads(response.read())
            except Exception as error:  # serveur occupé, délai dépassé...
                last_error = error
                print(f"  échec : {error}", flush=True)
                time.sleep(15)
    raise SystemExit(f"Aucun serveur Overpass n'a répondu : {last_error}")


def distance_m(a, b) -> float:
    """Distance approximative en mètres entre deux points (lat, lon)."""
    lat = math.radians((a[0] + b[0]) / 2)
    dy = (b[0] - a[0]) * 111_320
    dx = (b[1] - a[1]) * 111_320 * math.cos(lat)
    return math.hypot(dx, dy)


def summarize(osm: dict) -> dict:
    nodes = {e["id"]: (e["lat"], e["lon"]) for e in osm["elements"] if e["type"] == "node"}
    ways = [e for e in osm["elements"] if e["type"] == "way"]

    road_count, road_length = Counter(), Counter()
    buildings = [w for w in ways if "building" in w.get("tags", {})]
    for way in ways:
        kind = way.get("tags", {}).get("highway")
        if not kind:
            continue
        road_count[kind] += 1
        points = [nodes[n] for n in way["nodes"] if n in nodes]
        road_length[kind] += sum(distance_m(points[i], points[i + 1]) for i in range(len(points) - 1))

    def tagged(key):
        return sum(1 for b in buildings if key in b["tags"])

    named = []
    for e in osm["elements"]:
        tags = e.get("tags", {})
        name = tags.get("name:fr") or tags.get("name")
        if not name:
            continue
        kind = next((f"{k}={tags[k]}" for k in ("railway", "man_made", "tourism", "historic", "place",
                                                 "natural", "leisure", "amenity", "building") if k in tags), None)
        if kind is None or kind == "building=yes":
            continue
        if e["type"] == "node":
            position = [e["lat"], e["lon"]]
        elif e["type"] == "way":
            pts = [nodes[n] for n in e["nodes"] if n in nodes]
            position = [round(sum(p[0] for p in pts) / len(pts), 6), round(sum(p[1] for p in pts) / len(pts), 6)] if pts else None
        else:
            position = None
        named.append({"name": name, "kind": kind, "position": position})

    return {
        "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bbox_south_west_north_east": BBOX,
        "elements": Counter(e["type"] for e in osm["elements"]),
        "roads_count_by_type": dict(road_count.most_common()),
        "roads_km_by_type": {k: round(v / 1000, 1) for k, v in road_length.most_common()},
        "roads_km_total": round(sum(road_length.values()) / 1000, 1),
        "roads_with_name": sum(1 for w in ways if "highway" in w.get("tags", {}) and "name" in w["tags"]),
        "roads_with_lanes": sum(1 for w in ways if "highway" in w.get("tags", {}) and "lanes" in w["tags"]),
        "roads_oneway": sum(1 for w in ways if w.get("tags", {}).get("oneway") == "yes"),
        "roundabouts": sum(1 for w in ways if w.get("tags", {}).get("junction") == "roundabout"),
        "buildings_total": len(buildings),
        "buildings_with_levels": tagged("building:levels"),
        "buildings_with_height": tagged("height"),
        "buildings_with_name": tagged("name"),
        "buildings_by_type": dict(Counter(b["tags"]["building"] for b in buildings).most_common(25)),
        "natural_by_type": dict(Counter(w["tags"]["natural"] for w in ways if "natural" in w.get("tags", {})).most_common()),
        "landuse_by_type": dict(Counter(w["tags"]["landuse"] for w in ways if "landuse" in w.get("tags", {})).most_common()),
        "leisure_by_type": dict(Counter(w["tags"]["leisure"] for w in ways if "leisure" in w.get("tags", {})).most_common()),
        "tree_nodes": sum(1 for e in osm["elements"] if e.get("tags", {}).get("natural") == "tree"),
        "named_places": sorted(named, key=lambda p: p["name"]),
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    osm = download(build_query())
    if not osm.get("elements"):
        sys.exit("Réponse vide : rien n'a été enregistré.")
    with gzip.open(OUT_DIR / "annaba_raw.json.gz", "wt", encoding="utf-8") as f:
        json.dump(osm, f, ensure_ascii=False, separators=(",", ":"))
    summary = summarize(osm)
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "named_places"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
