"""
Transforme les données OpenStreetMap brutes (data/osm/annaba_raw.json.gz)
en un fichier léger que le jeu charge : public/world/annaba.json

Usage : python tools/build_world.py
Coordonnées de sortie : mètres, x vers l'est, n vers le nord,
origine = gare d'Annaba. Rien n'est inventé : seules les hauteurs de
bâtiments sans étiquette sont ESTIMÉES (comptées dans meta).
"""
import gzip
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "osm" / "annaba_raw.json.gz"
OUT = ROOT / "public" / "world" / "annaba.json"

LEVEL_HEIGHT = 3.0

# Largeur de chaussée (m) par type de voie quand OSM ne précise rien.
ROAD_WIDTH = {
    "trunk": 14, "primary": 12, "secondary": 10, "tertiary": 8,
    "trunk_link": 7, "primary_link": 6, "secondary_link": 6, "tertiary_link": 6,
    "residential": 6, "unclassified": 6, "living_street": 5, "service": 4,
    "pedestrian": 5, "track": 3, "footway": 2, "path": 1.5, "steps": 2,
}
# Repères de téléportation, du sud au nord : (nom affiché, nom dans OSM, origine du nom).
# La POSITION vient toujours d'un objet OSM réel. Quand le nom affiché n'est pas celui
# d'OSM, il a été rapproché des captures Google Maps du projet d'après l'emplacement
# ("capture") : à confirmer sur place.
PLACES = [
    ("Gare d'Annaba", "Gare d´Annaba", "osm"),
    ("Cours de la Révolution (Mairie)", "Mairie d'Annaba", "capture"),
    ("Vieille Ville", "Rue hamitouche abdelghani", "capture"),
    ("Citadelle (remparts)", "@citywalls", "capture"),
    ("Plage Saint-Cloud", "شاطئ رشيد فلاح", "osm"),
    ("Le Jasmin", "Le Jasmin", "osm"),
    ("Oued Kouba", "Oued Kouba", "osm"),
    ("Plage Chapuis", "Plage Chapuis", "osm"),
    ("Hôtel Sabri", "Hôtel Sabri", "osm"),
    ("Plage Toche", "Plage Refas Zahouen", "capture"),
    ("Bouna Beach", "Plage du Belvédère", "capture"),
    ("Plage Ain Achir", "Plage Ain Achir", "osm"),
    ("Phare du Cap de Garde", "Phare de Cap de Garde", "osm"),
    ("Plage Le Vivier", "@northmost_beach", "capture"),
]


def load():
    with gzip.open(RAW, "rt", encoding="utf-8") as f:
        return json.load(f)


class Projection:
    """Degrés -> mètres autour d'une origine (précis à quelques mètres sur la zone)."""

    def __init__(self, lat0, lon0, lat_mid):
        p = math.radians(lat_mid)
        self.lat0, self.lon0 = lat0, lon0
        self.m_lat = 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
        self.m_lon = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)

    def __call__(self, lat, lon):
        return ((lon - self.lon0) * self.m_lon, (lat - self.lat0) * self.m_lat)


def flat(points):
    out = []
    for x, n in points:
        out += [round(x, 1), round(n, 1)]
    return out


def densify(points, step):
    """Ajoute des points pour qu'aucun segment ne dépasse `step` mètres (les routes épousent le relief)."""
    out = [points[0]]
    for a, b in zip(points, points[1:]):
        count = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(1, count + 1):
            out.append((a[0] + (b[0] - a[0]) * k / count, a[1] + (b[1] - a[1]) * k / count))
    return out


def smooth(points, passes=2):
    """Arrondit les angles d'un tracé (méthode de Chaikin) sans déplacer ses extrémités :
    le tracé général réel est conservé, seuls les coudes deviennent des courbes."""
    for _ in range(passes):
        if len(points) < 3:
            return points
        out = [points[0]]
        for a, b in zip(points, points[1:]):
            out.append((a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25))
            out.append((a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75))
        out.append(points[-1])
        points = out
    return points


def simplify(points, tolerance):
    """Douglas-Peucker : enlève les points qui ne changent pas la forme."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy) or 1e-9
        worst, index = 0, -1
        for i in range(a + 1, b):
            d = abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / length
            if d > worst:
                worst, index = d, i
        if worst > tolerance:
            keep[index] = True
            stack += [(a, index), (index, b)]
    return [p for p, k in zip(points, keep) if k]


def area(points):
    s = 0
    for i in range(len(points)):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % len(points)]
        s += x1 * y2 - x2 * y1
    return s / 2


# ---------------------------------------------------------------- trait de côte

def stitch(ways):
    """Assemble les morceaux de côte bout à bout (listes d'identifiants de nœuds)."""
    chains = [list(w) for w in ways]
    merged = True
    while merged:
        merged = False
        for i, a in enumerate(chains):
            if a[0] == a[-1]:
                continue
            for j, b in enumerate(chains):
                if i != j and b[0] != b[-1] and a[-1] == b[0]:
                    chains[i] = a + b[1:]
                    del chains[j]
                    merged = True
                    break
            if merged:
                break
    return chains


def clip_to_rect(points, rect):
    """Découpe une ligne au rectangle. Renvoie les morceaux intérieurs, dont
    le premier et le dernier point sont posés sur le bord."""
    x0, y0, x1, y1 = rect

    def inside(p):
        return x0 <= p[0] <= x1 and y0 <= p[1] <= y1

    def crossing(p, q):  # p dedans, q dehors
        best = 1.0
        dx, dy = q[0] - p[0], q[1] - p[1]
        for edge, d, start in ((x0, dx, p[0]), (x1, dx, p[0]), (y0, dy, p[1]), (y1, dy, p[1])):
            if d != 0:
                t = (edge - start) / d
                if 0 <= t < best:
                    best = t
        return (min(max(p[0] + dx * best, x0), x1), min(max(p[1] + dy * best, y0), y1))

    pieces, current = [], None
    for i, p in enumerate(points):
        if inside(p):
            if current is None:
                current = [crossing(p, points[i - 1])] if i > 0 else []
            current.append(p)
        elif current is not None:
            current.append(crossing(points[i - 1], p))
            pieces.append(current)
            current = None
    if current:
        pieces.append(current)
    return [p for p in pieces if len(p) >= 2]


def boundary_t(p, rect):
    """Position d'un point du bord, en tournant dans le sens anti-horaire depuis le coin sud-ouest."""
    x0, y0, x1, y1 = rect
    w, h = x1 - x0, y1 - y0
    d = [abs(p[1] - y0), abs(p[0] - x1), abs(p[1] - y1), abs(p[0] - x0)]
    side = d.index(min(d))
    return [(p[0] - x0) / w, 1 + (p[1] - y0) / h, 2 + (x1 - p[0]) / w, 3 + (y1 - p[1]) / h][side]


def land_rings(pieces, rect):
    """La terre est à gauche de la côte (convention OSM) : on referme chaque
    morceau en suivant le bord du rectangle dans le sens anti-horaire."""
    x0, y0, x1, y1 = rect
    corners = {0: (x0, y0), 1: (x1, y0), 2: (x1, y1), 3: (x0, y1)}
    entries = [boundary_t(p[0], rect) for p in pieces]
    exits = [boundary_t(p[-1], rect) for p in pieces]
    used, rings = set(), []
    for start in range(len(pieces)):
        if start in used:
            continue
        ring, i = [], start
        while True:
            used.add(i)
            ring += pieces[i]
            t = exits[i]
            nxt = min(range(len(pieces)), key=lambda j: (entries[j] - t) % 4)
            gap = (entries[nxt] - t) % 4
            c = math.floor(t) + 1
            while c < t + gap:
                ring.append(corners[c % 4])
                c += 1
            if nxt == start or nxt in used:
                break
            i = nxt
        rings.append(ring)
    return rings


# ---------------------------------------------------------------- hauteurs

def point_in_polygon(x, y, polygon):
    hit = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


# Usage d'un bâtiment d'après ses étiquettes OSM (building=..., amenity=...).
KIND_BY_BUILDING = {
    "mosque": "mosque", "school": "school", "university": "school", "college": "school",
    "hospital": "hospital", "public": "public", "civic": "public", "train_station": "station",
    "industrial": "industrial", "warehouse": "industrial", "storage_tank": "industrial", "greenhouse": "industrial",
    "hotel": "hotel", "house": "house", "terrace": "house", "apartments": "apartment", "retail": "apartment",
}
KIND_BY_AMENITY = {
    "place_of_worship": "mosque", "school": "school", "college": "school", "university": "school",
    "hospital": "hospital", "clinic": "hospital", "townhall": "public", "courthouse": "public",
    "post_office": "public", "police": "public", "theatre": "public", "library": "public",
    "community_centre": "public", "arts_centre": "public",
}
# Hauteur (m) retenue pour ces usages quand OSM ne donne pas le nombre d'étages.
DEFAULT_HEIGHT = {"mosque": 9, "school": 10, "hospital": 14, "public": 13, "industrial": 8, "hotel": 22, "station": 12}
# Centre colonial : immeubles haussmanniens (pierre blanche, balcons filants en fer forgé, arcades),
# d'après les photos du Cours de la Révolution. Zone = rayon autour de la mairie, qui donne sur le Cours.
COLONIAL_RADIUS = 430


def building_height(tags, footprint_area, way_id):
    """Renvoie (hauteur en m, estimée ?)."""
    try:
        if "height" in tags:
            return float(str(tags["height"]).replace("m", "").strip()), False
        if "building:levels" in tags:
            return max(1.0, float(tags["building:levels"])) * LEVEL_HEIGHT + 1, False
    except ValueError:
        pass
    kind = tags.get("building", "yes")
    if kind in ("house", "terrace", "garage", "garages", "shed", "hut", "roof", "greenhouse"):
        levels = 2
    elif kind in ("apartments", "hotel"):
        levels = 6
    elif kind in ("industrial", "warehouse", "retail", "stadium", "grandstand", "sports_hall"):
        levels = 3
    elif footprint_area < 120:
        levels = 2
    elif footprint_area < 400:
        levels = 3
    elif footprint_area < 1200:
        levels = 5
    else:
        levels = 4
    levels += way_id % 2  # petite variation stable, pour éviter des toits tous alignés
    return levels * LEVEL_HEIGHT + 1, True


def main():
    osm = load()
    elements = osm["elements"]
    node_ll = {e["id"]: (e["lat"], e["lon"]) for e in elements if e["type"] == "node"}
    ways = [e for e in elements if e["type"] == "way"]

    gare = next(w for w in ways if w.get("tags", {}).get("building") == "train_station")
    g = [node_ll[n] for n in gare["nodes"]]
    lat0, lon0 = sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)
    south, west, north, east = 36.880, 7.730, 36.980, 7.800
    project = Projection(lat0, lon0, (south + north) / 2)
    xy = {i: project(*ll) for i, ll in node_ll.items()}
    rx0, ry0 = project(south, west)
    rx1, ry1 = project(north, east)
    rect = (rx0, ry0, rx1, ry1)

    def pts(way):
        return [xy[n] for n in way["nodes"] if n in xy]

    # --- terre et îlots
    coast = stitch([w["nodes"] for w in ways if w.get("tags", {}).get("natural") == "coastline"])
    pieces, islands = [], []
    for chain in coast:
        p = [xy[n] for n in chain]
        if chain[0] == chain[-1]:
            ring = simplify(p[:-1], 1.0)
            if len(ring) >= 3:
                islands.append(ring)
        else:
            pieces += clip_to_rect(p, rect)
    land = [simplify(r, 1.0) for r in land_rings(pieces, rect)] + islands

    # --- routes et voies ferrées
    roads, rails, road_points = [], [], []
    skipped = {}
    for w in ways:
        tags = w.get("tags", {})
        kind = tags.get("highway")
        p = pts(w)
        if len(p) < 2:
            continue
        if kind in ROAD_WIDTH:
            width = ROAD_WIDTH[kind]
            try:
                if "lanes" in tags and kind not in ("footway", "path", "steps"):
                    width = max(width, float(tags["lanes"]) * 3.5)
            except ValueError:
                pass
            for piece in clip_to_rect(p, rect):  # on coupe ce qui dépasse de la zone
                line = densify(simplify(smooth(simplify(piece, 0.3)), 0.12), 10)
                road = {"k": kind, "w": width, "p": flat(line), "_line": line, "_way": w["id"]}
                name = tags.get("name:fr") or tags.get("name")
                if name:
                    road["n"] = name
                if kind in ("trunk", "primary"):
                    road["kp"] = 1  # bordures peintes rouge et blanc : hypothèse limitée aux grands axes
                roads.append(road)
                if kind not in ("footway", "path", "steps", "trunk", "trunk_link"):
                    for a, b in zip(line, line[1:]):
                        road_points.append((a[0], a[1], b[0] - a[0], b[1] - a[1], len(roads) - 1))
        elif kind:
            skipped[kind] = skipped.get(kind, 0) + 1
        elif tags.get("railway") == "rail" and tags.get("tunnel") != "yes":
            for piece in clip_to_rect(p, rect):
                rails.append({"p": flat(densify(simplify(piece, 0.3), 10))})

    # --- graphe routier pour la circulation : points reliés, avec le sens de circulation
    DRIVABLE = {"trunk", "primary", "secondary", "tertiary", "trunk_link", "primary_link",
                "secondary_link", "tertiary_link", "residential", "unclassified", "living_street"}
    graph_index, graph_nodes, graph_edges = {}, [], []
    for w in ways:
        tags = w.get("tags", {})
        if tags.get("highway") not in DRIVABLE:
            continue
        oneway = tags.get("oneway")
        one = 1 if oneway in ("yes", "-1") or tags.get("junction") == "roundabout" else 0
        nodes = [n for n in w["nodes"] if n in xy and rx0 <= xy[n][0] <= rx1 and ry0 <= xy[n][1] <= ry1]
        if oneway == "-1":
            nodes.reverse()
        fast = 1 if tags.get("highway") in ("trunk", "primary", "secondary") else 0
        for a, b in zip(nodes, nodes[1:]):
            for n in (a, b):
                if n not in graph_index:
                    graph_index[n] = len(graph_nodes) // 2
                    graph_nodes += [round(xy[n][0], 1), round(xy[n][1], 1)]
            graph_edges += [graph_index[a], graph_index[b], one, fast]

    # --- surfaces (plages, bois, pelouses...)
    AREA_KIND = {
        ("natural", "beach"): "beach", ("natural", "sand"): "beach",
        ("natural", "wood"): "wood", ("landuse", "forest"): "wood",
        ("natural", "scrub"): "scrub", ("natural", "bare_rock"): "rock",
        ("landuse", "grass"): "grass", ("leisure", "park"): "grass", ("leisure", "garden"): "grass",
        ("leisure", "pitch"): "pitch", ("landuse", "cemetery"): "grass",
    }
    areas = []
    for w in ways:
        tags = w.get("tags", {})
        if w["nodes"][0] != w["nodes"][-1] or "building" in tags:
            continue
        for (key, value), kind in AREA_KIND.items():
            if tags.get(key) == value:
                p = simplify(pts(w)[:-1], 0.5)
                if len(p) >= 3:
                    areas.append({"k": kind, "p": flat(p)})
                break

    # --- bâtiments
    # Équipements notés dans OSM comme simples points : on les rattache au bâtiment qui les contient.
    amenity_points = [(xy[e["id"]], KIND_BY_AMENITY[e["tags"]["amenity"]]) for e in elements
                      if e["type"] == "node" and e.get("tags", {}).get("amenity") in KIND_BY_AMENITY]
    industrial_zones = [pts(w) for w in ways if w.get("tags", {}).get("landuse") in ("industrial", "harbour")
                        and w["nodes"][0] == w["nodes"][-1]]
    # Points des grandes rues, rangés par cases de 20 m : sert à repérer les immeubles à commerces.
    main_cells = set()
    for w in ways:
        if w.get("tags", {}).get("highway") in ("primary", "secondary"):
            for x, n in densify(pts(w), 8):
                main_cells.add((int(x // 20), int(n // 20)))

    def shop_walls(points):
        """Numéros des murs dont le milieu donne sur une grande rue (à moins de 20 m environ)."""
        out = []
        for i in range(len(points)):
            a, b = points[i], points[(i + 1) % len(points)]
            cx, cn = int((a[0] + b[0]) / 2 // 20), int((a[1] + b[1]) / 2 // 20)
            if math.hypot(b[0] - a[0], b[1] - a[1]) >= 5 and any((cx + i2, cn + j) in main_cells for i2 in (-1, 0, 1) for j in (-1, 0, 1)):
                out.append(i)
        return out

    mairie = next((e for e in elements if e.get("tags", {}).get("name") == "Mairie d'Annaba"), None)
    if mairie is not None:
        q = pts(mairie) if mairie["type"] == "way" else [xy[mairie["id"]]]
        mairie = (sum(v[0] for v in q) / len(q), sum(v[1] for v in q) / len(q))
    # Stades : enceinte (leisure=stadium) et terrains (leisure=pitch). Tout bâtiment étiqueté stadium/grandstand,
    # ou posé dans une enceinte de stade, est une tribune : gradins inclinés vers le centre du terrain.
    arenas = []
    for w in ways:
        t = w.get("tags", {})
        if t.get("leisure") in ("stadium", "pitch") and w["nodes"][0] == w["nodes"][-1]:
            q = pts(w)[:-1]
            if len(q) >= 3 and abs(area(q)) > 2500:
                arenas.append((t.get("leisure"), q, (sum(v[0] for v in q) / len(q), sum(v[1] for v in q) / len(q)), abs(area(q))))

    buildings, estimated, kinds = [], 0, {}
    for w in ways:
        tags = w.get("tags", {})
        if "building" not in tags or w["nodes"][0] != w["nodes"][-1]:
            continue
        p = pts(w)[:-1]
        if len(p) < 3:
            continue
        a = area(p)
        cx, cy = sum(v[0] for v in p) / len(p), sum(v[1] for v in p) / len(p)
        if abs(a) < 4 or not (rx0 <= cx <= rx1 and ry0 <= cy <= ry1):
            continue
        if a < 0:
            p.reverse()  # toujours dans le sens anti-horaire
        height, is_estimated = building_height(tags, abs(a), w["id"])
        # Usage : étiquettes du bâtiment, sinon équipement situé dedans, sinon zone, sinon taille.
        kind = KIND_BY_AMENITY.get(tags.get("amenity")) or KIND_BY_BUILDING.get(tags["building"])
        if tags.get("tourism") == "hotel":
            kind = "hotel"
        sure = kind is not None
        if kind is None:
            xs, ns = [v[0] for v in p], [v[1] for v in p]
            for (qx, qn), k in amenity_points:
                if min(xs) <= qx <= max(xs) and min(ns) <= qn <= max(ns) and point_in_polygon(qx, qn, p):
                    kind, sure = k, True
                    break
        if kind is None and any(point_in_polygon(cx, cy, zone) for zone in industrial_zones):
            kind, sure = "industrial", True
        if is_estimated and kind in DEFAULT_HEIGHT:
            height = DEFAULT_HEIGHT[kind]
        focus = None
        if tags["building"] in ("stadium", "grandstand") or any(k == "stadium" and point_in_polygon(cx, cy, q) for k, q, _, _ in arenas):
            near = [a2 for a2 in arenas if math.hypot(a2[2][0] - cx, a2[2][1] - cy) < 250]
            if near:
                # Centre visé : le plus grand terrain de l'enceinte (ou l'enceinte elle-même).
                pitch = max(near, key=lambda a2: (a2[0] == "pitch", -math.hypot(a2[2][0] - cx, a2[2][1] - cy)) if a2[3] > 5000 else (False, -1e9))
                kind, sure, focus = "stands", True, pitch[2]
                if is_estimated:
                    height = 11.0
        if kind is None or kind == "apartment":
            if height >= 28:
                kind = "tower"
            elif kind is None and abs(a) < 170 and height <= 10:
                kind = "house"
            else:
                kind = "apartment"
        if kind == "apartment" and mairie and math.hypot(cx - mairie[0], cy - mairie[1]) < COLONIAL_RADIUS:
            kind = "colonial"
            if is_estimated:
                height = 16 + (w["id"] % 3) * 3   # 5 à 7 niveaux, comme sur les photos
        estimated += is_estimated
        kinds[kind] = kinds.get(kind, 0) + 1
        item = {"h": round(height, 1), "t": kind, "p": flat(p)}
        if sure:
            item["c"] = 1  # usage certain (étiqueté dans OSM), et non déduit de la taille
        if kind == "colonial" or (kind == "apartment" and w["id"] % 2 == 0):
            walls = shop_walls(p)
            if walls:
                item["s"] = walls  # murs à commerces : hypothèse (un immeuble sur deux, côté grande rue)
        if tags.get("name"):
            item["n"] = tags.get("name:fr") or tags["name"]
        if focus:
            item["f"] = [round(focus[0], 1), round(focus[1], 1)]
        buildings.append(item)

    # --- Bâtiments qui débordent sur la chaussée : la circulation suit l'axe des rues, avec une voie de chaque côté.
    # On repousse les murs à au moins CLEAR mètres de l'axe des rues carrossables (demande de Houssem : les voitures
    # se bloquaient contre des maisons). Seuls les points trop proches bougent ; le reste du bâtiment est conservé.
    CLEAR = 3.3
    seg_cells = {}
    gx = graph_nodes
    for i in range(0, len(graph_edges), 4):
        a, b = graph_edges[i], graph_edges[i + 1]
        ax_, an_, bx_, bn_ = gx[a * 2], gx[a * 2 + 1], gx[b * 2], gx[b * 2 + 1]
        for cx_ in range(int(min(ax_, bx_) // 20) - 1, int(max(ax_, bx_) // 20) + 2):
            for cn_ in range(int(min(an_, bn_) // 20) - 1, int(max(an_, bn_) // 20) + 2):
                seg_cells.setdefault((cx_, cn_), []).append((ax_, an_, bx_, bn_))

    def nearest_axis(x, n):
        best = None
        for ax_, an_, bx_, bn_ in seg_cells.get((int(x // 20), int(n // 20)), ()):
            dx_, dn_ = bx_ - ax_, bn_ - an_
            L = dx_ * dx_ + dn_ * dn_
            t = 0 if L == 0 else max(0, min(1, ((x - ax_) * dx_ + (n - an_) * dn_) / L))
            qx, qn = ax_ + dx_ * t, an_ + dn_ * t
            d = math.hypot(x - qx, n - qn)
            if best is None or d < best[0]:
                best = (d, qx, qn, dx_, dn_)
        return best

    moved = dropped = 0
    kept = []
    for b in buildings:
        p = list(zip(b["p"][0::2], b["p"][1::2]))
        ring = densify(p + [p[0]], 1.0)[:-1]
        if not any((h := nearest_axis(x, n)) and h[0] < CLEAR for x, n in ring):
            kept.append(b)
            continue
        out = []
        for x, n in ring:
            for _ in range(2):
                h = nearest_axis(x, n)
                if not h or h[0] >= CLEAR:
                    break
                d, qx, qn, dx_, dn_ = h
                if d > 0.05:
                    ux, un = (x - qx) / d, (n - qn) / d
                else:  # point sur l'axe : on le pousse perpendiculairement, du côté du centre du bâtiment
                    L = math.hypot(dx_, dn_) or 1
                    ux, un = -dn_ / L, dx_ / L
                    cx_, cn_ = sum(v[0] for v in p) / len(p), sum(v[1] for v in p) / len(p)
                    if (cx_ - qx) * ux + (cn_ - qn) * un < 0:
                        ux, un = -ux, -un
                x, n = qx + ux * CLEAR, qn + un * CLEAR
            out.append((x, n))
        # Simplification d'un contour fermé : on le coupe en deux au point le plus éloigné du premier.
        far = max(range(len(out)), key=lambda k: math.hypot(out[k][0] - out[0][0], out[k][1] - out[0][1]))
        out = simplify(out[:far + 1], 0.15)[:-1] + simplify(out[far:] + [out[0]], 0.15)[:-1]
        new_area = abs(area(out)) if len(out) >= 3 else 0
        if new_area < max(6, 0.25 * abs(area(p))):
            dropped += 1  # bâtiment presque entièrement sur la chaussée (souvent une erreur de tracé) : retiré
            continue
        if area(out) < 0:
            out.reverse()
        b["p"] = flat(out)
        if "s" in b:
            walls = shop_walls(out)
            if walls:
                b["s"] = walls
            else:
                del b["s"]
        moved += 1
        kept.append(b)
    buildings = kept
    print(f"Bâtiments reculés hors de la chaussée : {moved} ; retirés (sur la chaussée) : {dropped}")

    # --- largeur des rues : elles ne doivent pas mordre sur les bâtiments voisins.
    # On mesure, le long de chaque rue, la distance au bâtiment le plus proche.
    CELL = 8
    wall_cells = {}
    for b in buildings:
        q = b["p"]
        ring = [(q[i], q[i + 1]) for i in range(0, len(q), 2)]
        for x, n in densify(ring + [ring[0]], 2):
            wall_cells.setdefault((int(x // CELL), int(n // CELL)), []).append((x, n))

    def clearance(x, n):
        best = 24.0
        cx, cn = int(x // CELL), int(n // CELL)
        for i in (-2, -1, 0, 1, 2):
            for j in (-2, -1, 0, 1, 2):
                for wx, wn in wall_cells.get((cx + i, cn + j), ()):
                    d = math.hypot(wx - x, wn - n)
                    if d < best:
                        best = d
        return best

    # Chaussées parallèles (deux sens séparés, contre-allées) : aucune ne doit déborder sur l'autre.
    # On relève, pour chaque rue, l'écart latéral avec les chaussées voisines qui la longent.
    lane_cells = {}
    for index, road in enumerate(roads):
        if road["k"] in ("footway", "path", "steps", "track", "pedestrian"):
            continue
        line = road["_line"]
        for (ax, an), (bx, bn) in zip(line, line[1:]):
            length = math.hypot(bx - ax, bn - an)
            if length > 0.01:
                lane_cells.setdefault((int(bx // 16), int(bn // 16)), []).append((bx, bn, (bx - ax) / length, (bn - an) / length, index))
    twin_gap = {}
    for index, road in enumerate(roads):
        if road["k"] in ("footway", "path", "steps", "track", "pedestrian"):
            continue
        line, hits = road["_line"], []
        for (ax, an), (bx, bn) in zip(line, line[1:]):
            length = math.hypot(bx - ax, bn - an)
            if length < 0.01:
                continue
            dx, dn = (bx - ax) / length, (bn - an) / length
            best = None
            for i in (-1, 0, 1):
                for j in (-1, 0, 1):
                    for ox, on, odx, odn, other in lane_cells.get((int(bx // 16) + i, int(bn // 16) + j), ()):
                        if other == index or abs(dx * odx + dn * odn) < 0.92:
                            continue
                        along, across = (ox - bx) * dx + (on - bn) * dn, abs(-(ox - bx) * dn + (on - bn) * dx)
                        if abs(along) < 6 and 2.5 < across < 14 and (best is None or across < best[0]):
                            best = (across, other)
            if best:
                hits.append(best)
        if len(hits) >= max(2, 0.3 * (len(line) - 1)):
            hits.sort()
            twin_gap[index] = hits[len(hits) // 5]
    twins = 0
    for index, (gap, other) in twin_gap.items():
        road, mate = roads[index], roads[other]
        if road["w"] / 2 + mate["w"] / 2 > gap:
            share = gap * road["w"] / (road["w"] + mate["w"])
            road["_twin"] = max(3.6, round(2 * share, 1))
            twins += 1
    for road in roads:
        if "_twin" in road:
            road["w"] = min(road["w"], road.pop("_twin"))
    print("chaussées parallèles resserrées :", twins)

    narrowed = 0
    for road in roads:
        line = road.pop("_line")
        gaps = sorted(clearance(x, n) for x, n in line)
        free = gaps[len(gaps) // 6]  # on tolère quelques points serrés (1 sur 6)
        if road["k"] in ("footway", "path", "steps", "track", "pedestrian"):
            road["w"] = round(max(1.2, min(road["w"], 2 * free - 0.6)), 1)
            continue
        width = max(2.6, min(road["w"], 2 * free - 1.6))
        narrowed += width < road["w"]
        road["w"] = round(width, 1)
        road["sw"] = round(max(0.0, min(1.8, free - width / 2 - 0.2)), 1)  # trottoir de chaque côté

    # --- carrefours : là où plusieurs rues carrossables se rejoignent, un disque d'enrobé
    # (et de trottoir dessous) viendra raccorder proprement les chaussées.
    PAVED = DRIVABLE | {"service"}
    way_width, way_walk = {}, {}
    for road in roads:
        wid = road.pop("_way")
        if road["k"] in PAVED:
            way_width[wid] = min(way_width.get(wid, 99), road["w"])
            way_walk[wid] = min(way_walk.get(wid, 99), road.get("sw", 0))
    node_ways = {}
    for w in ways:
        if w["id"] in way_width:
            for node in set(w["nodes"]):
                node_ways.setdefault(node, []).append(w["id"])
    junctions = []
    for node, ids in node_ways.items():
        if len(ids) < 2 or node not in xy:
            continue
        x, n = xy[node]
        if not (rx0 <= x <= rx1 and ry0 <= n <= ry1):
            continue
        radius = max(way_width[i] for i in ids) / 2
        junctions += [round(x, 1), round(n, 1), round(radius, 1), round(radius + max(way_walk[i] for i in ids), 1)]

    # --- ronds-points réels (anneaux OSM junction=roundabout) : centre et rayon de l'îlot central
    roundabouts = []
    for w in ways:
        tags = w.get("tags", {})
        if tags.get("junction") != "roundabout" or w["nodes"][0] != w["nodes"][-1] or w["id"] not in way_width:
            continue
        ring = pts(w)[:-1]
        cx, cn = sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
        radius = sum(math.hypot(p[0] - cx, p[1] - cn) for p in ring) / len(ring)
        island = radius - way_width[w["id"]] / 2 - 0.2
        if island > 1.2 and rx0 <= cx <= rx1 and ry0 <= cn <= ry1:
            roundabouts += [round(cx, 1), round(cn, 1), round(island, 1)]

    # --- feux tricolores réels (points OSM highway=traffic_signals) : position et point du graphe routier
    signals = []
    for e in elements:
        if e["type"] == "node" and e.get("tags", {}).get("highway") == "traffic_signals" and e["id"] in xy:
            x, n = xy[e["id"]]
            if rx0 <= x <= rx1 and ry0 <= n <= ry1:
                signals += [round(x, 1), round(n, 1), graph_index.get(e["id"], -1)]

    # --- points de téléportation : repère OSM -> point de rue le plus proche
    def nearest_road(x, n):
        return min(road_points, key=lambda q: (q[0] - x) ** 2 + (q[1] - n) ** 2)

    def center(e):
        if e["type"] == "node":
            return xy[e["id"]]
        q = pts(e)
        return (sum(v[0] for v in q) / len(q), sum(v[1] for v in q) / len(q))

    def find(osm_name):
        candidates = [e for e in elements if e["type"] in ("node", "way") and e.get("tags")]
        if osm_name == "@citywalls":
            return next((e for e in candidates if e["tags"].get("historic") == "citywalls"), None)
        if osm_name == "@northmost_beach":
            beaches = [e for e in candidates if e["type"] == "way" and e["tags"].get("natural") == "beach"]
            return max(beaches, key=lambda e: center(e)[1], default=None)
        return next((e for e in candidates if osm_name in (e["tags"].get("name"), e["tags"].get("name:fr"))), None)

    places = []
    for label, osm_name, origin in PLACES:
        e = find(osm_name)
        if e is None:
            print("REPÈRE INTROUVABLE :", label)
            continue
        r = nearest_road(*center(e))
        # Place de stationnement : contre le trottoir de droite, dans le sens de la rue.
        length = math.hypot(r[2], r[3]) or 1.0
        dx, dn = r[2] / length, r[3] / length
        side = roads[r[4]]["w"] / 2 - 1.0
        places.append({"name": label, "x": round(r[0], 1), "n": round(r[1], 1), "origin": origin,
                       "cx": round(r[0] + dn * side + dx * 6, 1), "cn": round(r[1] - dx * side + dn * 6, 1),
                       "ch": round(math.atan2(dx, -dn), 3)})

    world = {
        "meta": {
            "source": "OpenStreetMap contributors (ODbL)",
            "extracted_at": osm.get("osm3s", {}).get("timestamp_osm_base"),
            "origin_lat_lon": [round(lat0, 6), round(lon0, 6)],
            "rect_m": [round(v, 1) for v in rect],
            "buildings": len(buildings),
            "buildings_height_estimated": estimated,
            "buildings_by_kind": kinds,
            "town_hall": [round(mairie[0], 1), round(mairie[1], 1)] if mairie else None,
            "roads": len(roads),
            "roads_narrowed_to_fit_buildings": narrowed,
            "junctions": len(junctions) // 4, "roundabouts": len(roundabouts) // 3, "traffic_signals": len(signals) // 3,
            "roads_skipped_by_type": skipped,
            "relief": "Terrain Tiles (AWS Open Data), environ 30 m de précision",
        },
        "places": places,
        "land": [flat(r) for r in land],
        "areas": areas,
        "roads": roads,
        "rails": rails,
        "graph": {"nodes": graph_nodes, "edges": graph_edges},
        "junctions": junctions,
        "roundabouts": roundabouts,
        "signals": signals,
        "buildings": buildings,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(world["meta"], ensure_ascii=False, indent=2))
    print("places:", places)
    print("land rings:", [len(r) // 2 for r in world["land"]], "| size:", OUT.stat().st_size // 1024, "ko")


if __name__ == "__main__":
    main()
