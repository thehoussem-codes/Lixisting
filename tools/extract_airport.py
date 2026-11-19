"""
Aéroport Rabah Bitat d'Annaba (AAE) : pistes, voies de circulation, aires de stationnement, aérogare, hangars,
tour de contrôle, postes de stationnement (OpenStreetMap, via Overpass), pour le construire dans le jeu.
Sortie : data/airport/aae_osm.json (éléments avec leur géométrie) + summary.json.
Usage (action GitHub) : python tools/extract_airport.py
"""
import json
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "airport"
BBOX = (36.795, 7.780, 36.850, 7.860)   # sud, ouest, nord, est
SERVERS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]


def main():
    b = ",".join(str(v) for v in BBOX)
    query = f"""
[out:json][timeout:180];
(
  nwr["aeroway"]({b});
  way["building"]({b});
  way["highway"~"^(service|unclassified|tertiary|secondary|primary|trunk)$"]["access"!="no"]({b});
  way["landuse"]({b});
  way["barrier"="fence"]({b});
);
out geom qt;
"""
    data = urllib.parse.urlencode({"data": query}).encode()
    result, last = None, None
    for attempt in range(3):
        for server in SERVERS:
            try:
                print("Overpass :", server, flush=True)
                request = urllib.request.Request(server, data=data, headers={"User-Agent": "lixiting-game-extract/0.2"})
                with urllib.request.urlopen(request, timeout=240) as response:
                    result = json.loads(response.read())
                break
            except Exception as error:
                last = error
                print("  échec :", error, flush=True)
                time.sleep(10)
        if result:
            break
    if result is None:
        raise SystemExit(f"Overpass indisponible : {last}")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "aae_osm.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    kinds = Counter()
    for e in result["elements"]:
        t = e.get("tags", {})
        key = next((f"{k}={t[k]}" for k in ("aeroway", "building", "highway", "landuse", "barrier") if k in t), "autre")
        kinds[key] += 1
    summary = {"extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "bbox_south_west_north_east": BBOX,
               "elements": len(result["elements"]), "by_kind": dict(kinds.most_common()), "licence": "ODbL, © contributeurs OpenStreetMap"}
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
