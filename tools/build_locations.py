#!/usr/bin/env python3
"""Base de données des lieux de Lixiting : public/world/locations.json.

But : que chaque capture d'écran dise exactement où l'on est. Chaque tronçon de rue, chaque carrefour et
chaque bâtiment reçoit un identifiant stable, calculé à partir des données réelles (rien n'est tiré au hasard).

  Tronçon de rue : ANN-<QUARTIER>-<numéro>     ex. ANN-CRV-014
  Carrefour      : ANN-<QUARTIER>-X<numéro>    ex. ANN-CRV-X03
  Bâtiment       : B-<rang dans annaba.json>   ex. B-04211
  Voie (tracé)   : R-<rang dans annaba.json>   ex. R-0003  (c'est l'indice de `roads` dans le code et les outils)

Quartier d'un point, par ordre de préférence (l'origine est toujours indiquée, aucun nom n'est inventé) :
  1. le quartier OpenStreetMap le plus proche (place=suburb / neighbourhood / locality), à moins de 450 m ;
  2. le repère du jeu le plus proche (gare, Cours de la Révolution, plages...), à moins de 600 m ;
  3. sinon un secteur de grille de 500 m (colonne en lettre, rangée en chiffres), sans nom.

Les identifiants restent les mêmes d'une partie à l'autre. Ils ne changent que si les données OpenStreetMap
sont ré-extraites et que des rues ont été ajoutées ou supprimées dans le quartier.

Usage : python3 tools/build_locations.py   (après build_world.py)
"""
import gzip, json, math, re, unicodedata
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / "public/world/annaba.json"
RAW = ROOT / "data/osm/annaba_raw.json.gz"
DEM = ROOT / "data/elevation/annaba_dem.json.gz"
OUT = ROOT / "public/world/locations.json"
SECTOR = 500.0
KINDS = {"trunk": "voie rapide", "primary": "grand axe", "secondary": "avenue", "tertiary": "rue principale",
         "residential": "rue", "service": "voie de desserte", "unclassified": "rue", "living_street": "rue",
         "pedestrian": "voie piétonne", "footway": "allée piétonne", "path": "sentier", "steps": "escalier", "track": "piste"}


def plain(text):
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def latin(text):
    return bool(text) and all(ord(c) < 0x250 for c in text)


def make_code(name, taken):
    """Trois lettres tirées du nom (initiales des mots importants, puis lettres suivantes), sans doublon."""
    words = [w for w in re.findall(r"[A-Za-z0-9]+", plain(name)) if w.lower() not in ("de", "du", "des", "la", "le", "les", "d", "l", "et")]
    letters = "".join(w[0] for w in words) + "".join(w[1:] for w in reversed(words))
    letters = re.sub(r"[^A-Z0-9]", "", letters.upper()) + "XXX"
    candidates = [letters[:3]] + [letters[:2] + c for c in letters[3:]] + [letters[0] + a + b for a in letters[1:] for b in letters[2:]]
    candidates += [letters[:2] + str(d) for d in range(1, 10)]
    for code in candidates:
        if len(code) == 3 and code not in taken:
            taken.add(code)
            return code
    raise SystemExit(f"pas de code libre pour {name}")


def main():
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    with gzip.open(RAW, "rt", encoding="utf-8") as f:
        raw = json.load(f)
    with gzip.open(DEM, "rt", encoding="utf-8") as f:
        dem = json.load(f)
    lat0, lon0 = world["meta"]["origin_lat_lon"]
    p = math.radians((36.880 + 36.980) / 2)  # même projection que build_world.py
    m_lat = 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
    m_lon = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)
    x0, n0, x1, n1 = world["meta"]["rect_m"]
    src = np.array(dem["heights"]).reshape(dem["rows"], dem["cols"])

    def elevation(x, n):
        fx = min(max((x - dem["x0"]) / dem["step"], 0), dem["cols"] - 1.001); fy = min(max((n - dem["n0"]) / dem["step"], 0), dem["rows"] - 1.001)
        ix, iy = int(fx), int(fy); ax, ay = fx - ix, fy - iy
        return float((src[iy, ix] * (1 - ax) + src[iy, ix + 1] * ax) * (1 - ay) + (src[iy + 1, ix] * (1 - ax) + src[iy + 1, ix + 1] * ax) * ay)

    # --- quartiers
    taken, districts = set(), []
    for element in raw["elements"]:
        tags = element.get("tags", {})
        if element["type"] == "node" and tags.get("place") in ("suburb", "neighbourhood", "quarter", "locality"):
            name = tags.get("name:fr") or (tags.get("name") if latin(tags.get("name", "")) else None)
            x, n = (element["lon"] - lon0) * m_lon, (element["lat"] - lat0) * m_lat
            if name and x0 <= x <= x1 and n0 <= n <= n1:
                districts.append({"name": name, "origin": "quartier OpenStreetMap", "x": round(x, 1), "n": round(n, 1), "reach": 450})
    for place in world["places"]:
        districts.append({"name": place["name"], "origin": "repère du jeu", "x": place["x"], "n": place["n"], "reach": 600})
    for district in districts:
        district["code"] = make_code(district["name"], taken)
    seeds = cKDTree([[d["x"], d["n"]] for d in districts])
    sectors = {}

    def district_of(x, n):
        gaps, found = seeds.query([x, n], k=min(8, len(districts)))
        for gap, index in sorted(zip(np.atleast_1d(gaps), np.atleast_1d(found)), key=lambda item: (districts[item[1]]["reach"] != 450, item[0])):
            if gap <= districts[index]["reach"]:
                return districts[index]["code"]
        column, row = int((x - x0) // SECTOR), int((n - n0) // SECTOR)
        code = f"{chr(65 + column)}{row:02d}"
        if code not in sectors:
            sectors[code] = {"code": code, "name": f"Secteur {code}", "origin": "secteur de grille de 500 m (pas de nom de quartier dans les données)",
                             "x": round(x0 + (column + 0.5) * SECTOR, 1), "n": round(n0 + (row + 0.5) * SECTOR, 1)}
        return code

    # --- repères : repères du jeu, bâtiments nommés, lieux nommés d'OpenStreetMap
    landmarks = [{"name": pl["name"], "kind": "repère du jeu", "x": pl["x"], "n": pl["n"]} for pl in world["places"]]
    centres = []
    for index, building in enumerate(world["buildings"]):
        pts = np.array(building["p"]).reshape(-1, 2)
        centres.append(pts.mean(axis=0))
        if building.get("n"):
            landmarks.append({"name": building["n"], "kind": f"bâtiment B-{index:05d}", "x": round(float(pts[:, 0].mean()), 1), "n": round(float(pts[:, 1].mean()), 1)})
    for element in raw["elements"]:
        tags = element.get("tags", {})
        name = tags.get("name:fr") or (tags.get("name") if latin(tags.get("name", "")) else None)
        kind = tags.get("amenity") or tags.get("tourism") or tags.get("historic") or tags.get("leisure") or ("commerce" if tags.get("shop") else None)
        if element["type"] == "node" and name and kind and "place" not in tags:
            x, n = (element["lon"] - lon0) * m_lon, (element["lat"] - lat0) * m_lat
            if x0 <= x <= x1 and n0 <= n <= n1:
                landmarks.append({"name": name, "kind": kind, "x": round(x, 1), "n": round(n, 1)})
    centres = np.array(centres)
    building_tree, landmark_tree = cKDTree(centres), cKDTree([[l["x"], l["n"]] for l in landmarks])

    # --- carrefours
    ends = []
    for index, road in enumerate(world["roads"]):
        ends += [(road["p"][0], road["p"][1], index), (road["p"][-2], road["p"][-1], index)]
    end_tree = cKDTree([[e[0], e[1]] for e in ends])
    junctions, by_district = [], {}
    flat = world["junctions"]
    for jx, jn in zip(flat[0::4], flat[1::4]):
        touching = sorted({ends[i][2] for i in end_tree.query_ball_point([jx, jn], 3.5)})
        names = sorted({world["roads"][i]["n"] for i in touching if world["roads"][i].get("n")})
        junctions.append({"x": jx, "n": jn, "district": district_of(jx, jn), "streets": names, "roads": [f"R-{i:04d}" for i in touching],
                          "ele": round(elevation(jx, jn), 1)})
    for junction in sorted(junctions, key=lambda j: (j["district"], round(j["n"]), round(j["x"]))):
        number = by_district[junction["district"]] = by_district.get(junction["district"], 0) + 1
        junction["id"] = f"ANN-{junction['district']}-X{number:02d}" if number < 100 else f"ANN-{junction['district']}-X{number}"
        junction["name"] = " × ".join(junction["streets"]) if junction["streets"] else "carrefour de voies sans nom"
    junction_tree = cKDTree([[j["x"], j["n"]] for j in junctions])

    # --- lieux : un par tronçon de voie
    locations, by_district = [], {}
    for index, road in enumerate(world["roads"]):
        line = np.array(road["p"]).reshape(-1, 2)
        steps = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(line, axis=0).T))])
        mid = np.array([np.interp(steps[-1] / 2, steps, line[:, 0]), np.interp(steps[-1] / 2, steps, line[:, 1])])
        heights = [elevation(x, n) for x, n in line]
        near_junctions = sorted({int(i) for point in (line[0], line[-1]) for i in junction_tree.query_ball_point(point, 4)})
        near_buildings = sorted({int(i) for point in line[::2] for i in building_tree.query_ball_point(point, 28)})
        near_landmarks = sorted({int(i) for point in line[::2] for i in landmark_tree.query_ball_point(point, 120)},
                                key=lambda i: float(np.hypot(landmarks[i]["x"] - mid[0], landmarks[i]["n"] - mid[1])))[:5]
        locations.append({
            "road": f"R-{index:04d}", "street": road.get("n"), "kind": KINDS.get(road["k"], road["k"]), "district": district_of(*mid),
            "x": round(float(mid[0]), 1), "n": round(float(mid[1]), 1), "length": round(float(steps[-1])),
            "bounds": [round(float(v), 1) for v in (line[:, 0].min(), line[:, 1].min(), line[:, 0].max(), line[:, 1].max())],
            "ele": [round(min(heights), 1), round(max(heights), 1)],
            "lat": round(lat0 + float(mid[1]) / m_lat, 6), "lon": round(lon0 + float(mid[0]) / m_lon, 6),
            "junctions": near_junctions, "buildings": [f"B-{i:05d}" for i in near_buildings[:40]],
            "landmarks": [landmarks[i]["name"] for i in near_landmarks],
        })
    # Numérotation stable : par quartier, rues nommées d'abord (ordre alphabétique), puis du sud au nord et d'ouest en est.
    for location in sorted(locations, key=lambda l: (l["district"], l["street"] is None, l["street"] or "", l["n"], l["x"])):
        number = by_district[location["district"]] = by_district.get(location["district"], 0) + 1
        location["id"] = f"ANN-{location['district']}-{number:03d}"
        location["name"] = location["street"] or f"{location['kind']} sans nom"
    for location in locations:
        location["junctions"] = [junctions[i]["id"] for i in location["junctions"]]

    all_districts = districts + sorted(sectors.values(), key=lambda d: d["code"])
    for district in all_districts:
        district.pop("reach", None)
    out = {
        "meta": {"format": 1, "source": "OpenStreetMap contributors (ODbL) + relief Terrain Tiles",
                 "aide": "Voir tools/build_locations.py. locations[i] décrit la voie roads[i] de annaba.json.",
                 "origin_lat_lon": [lat0, lon0], "m_per_deg": [round(m_lon, 3), round(m_lat, 3)], "sector_m": SECTOR, "rect_m": [x0, n0, x1, n1]},
        "districts": all_districts, "locations": locations, "junctions": junctions, "landmarks": landmarks,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ids = [l["id"] for l in locations] + [j["id"] for j in junctions]
    assert len(ids) == len(set(ids)), "identifiants en double"
    named = sum(1 for l in locations if l["street"])
    print(f"lieux : {len(locations)} tronçons ({named} nommés), {len(junctions)} carrefours, {len(landmarks)} repères, "
          f"{len(districts)} quartiers nommés + {len(sectors)} secteurs de grille, fichier {OUT.stat().st_size // 1024} ko")
    for name in ("Rue du 24 Février 1956",):
        print([ (l["id"], l["road"], l["district"]) for l in locations if l["street"] == name][:4])


if __name__ == "__main__":
    main()
