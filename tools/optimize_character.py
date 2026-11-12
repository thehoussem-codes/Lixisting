#!/usr/bin/env python3
"""Allège le modèle du personnage (public/assets/models/character.glb).

Pourquoi : le mannequin d'origine compte près de 50 000 triangles, dix fois trop pour un
personnage de style PS2, et il embarque des animations que le jeu n'utilise pas.

Ce que fait le script (sans rien changer au squelette ni aux animations gardées) :
  1. regroupe les sommets voisins (grille de quelques centimètres) : moins de triangles ;
  2. ne garde que les animations citées dans public/assets/catalog.json ;
  3. réécrit un fichier GLB propre, sans données inutilisées.

L'original est conservé dans data/models/character_source.glb.
Usage : python3 tools/optimize_character.py [taille_de_grille_en_fraction_de_hauteur]
"""
import json, shutil, struct, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "public/assets/models/character.glb"
SOURCE = ROOT / "data/models/character_source.glb"
CELLS = float(sys.argv[1]) if len(sys.argv) > 1 else 85.0  # nombre de cases de grille sur la hauteur

COMPONENTS = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + length])
    return document, data[20 + length + 8:]


def main():
    if not SOURCE.exists():
        SOURCE.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(TARGET, SOURCE)
    doc, blob = read_glb(SOURCE)
    accessors, views = doc["accessors"], doc["bufferViews"]

    def read(index):
        accessor = accessors[index]
        view = views[accessor["bufferView"]]
        kind, width = COMPONENTS[accessor["componentType"]], WIDTH[accessor["type"]]
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride") or np.dtype(kind).itemsize * width
        raw = np.frombuffer(blob, np.uint8, stride * (accessor["count"] - 1) + np.dtype(kind).itemsize * width, start)
        if stride == np.dtype(kind).itemsize * width:
            return raw.view(kind).reshape(accessor["count"], width).copy()
        rows = np.lib.stride_tricks.as_strided(raw, (accessor["count"], np.dtype(kind).itemsize * width), (stride, 1))
        return np.ascontiguousarray(rows).view(kind).reshape(accessor["count"], width).copy()

    out_accessors, out_views, chunks = [], [], []

    def write(array, kind, target=None, bounds=False, normalized=False):
        array = np.ascontiguousarray(array)
        offset = sum(len(c) for c in chunks)
        payload = array.tobytes()
        payload += b"\0" * (-len(payload) % 4)
        chunks.append(payload)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": array.nbytes}
        if target:
            view["target"] = target
        out_views.append(view)
        code = next(k for k, v in COMPONENTS.items() if v == array.dtype.type)
        accessor = {"bufferView": len(out_views) - 1, "componentType": code, "count": len(array), "type": kind}
        if normalized:
            accessor["normalized"] = True
        if bounds:
            accessor["min"], accessor["max"] = array.min(axis=0).tolist(), array.max(axis=0).tolist()
        out_accessors.append(accessor)
        return len(out_accessors) - 1

    # --- 1. maillages : regroupement des sommets par case de grille
    positions = np.concatenate([read(p["attributes"]["POSITION"]) for m in doc["meshes"] for p in m["primitives"]])
    cell = (positions.max(axis=0) - positions.min(axis=0)).max() / CELLS
    before = after = 0
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            attributes = {name: read(index) for name, index in primitive["attributes"].items()}
            normalized = {name: accessors[index].get("normalized", False) for name, index in primitive["attributes"].items()}
            faces = read(primitive["indices"]).reshape(-1, 3).astype(np.int64)
            before += len(faces)
            position = attributes["POSITION"]
            # Deux sommets ne fusionnent que s'ils sont dans la même case ET tenus par le même os principal :
            # les doigts, les bras et le buste ne se soudent donc pas entre eux.
            fineness = np.ones(len(position))
            main_bone = None
            if "JOINTS_0" in attributes:
                main_bone = attributes["JOINTS_0"][np.arange(len(position)), attributes["WEIGHTS_0"].argmax(axis=1)]
                # Les mains et la tête gardent une grille plus fine : ce sont les parties qu'on regarde.
                joints = doc["skins"][0]["joints"]
                detailed = np.array([("Hand" in doc["nodes"][j].get("name", "")) * 2.6 + ("Head" in doc["nodes"][j].get("name", "")) * 1.5 or 1.0 for j in joints])
                fineness = detailed[main_bone]
            keys = np.floor(position * (fineness / cell)[:, None]).astype(np.int64)
            if main_bone is not None:
                keys = np.column_stack([keys, main_bone])
            _, group = np.unique(keys, axis=0, return_inverse=True)
            group = group.ravel()
            count = group.max() + 1
            members = np.bincount(group, minlength=count)[:, None]
            # Représentant : le sommet le plus proche du centre de sa case (il garde ses poids d'os).
            centre = np.zeros((count, 3)); np.add.at(centre, group, position); centre /= members
            gap = ((position - centre[group]) ** 2).sum(axis=1)
            order = np.lexsort((gap, group))
            first = order[np.concatenate([[True], group[order][1:] != group[order][:-1]])]
            merged = {name: values[first] for name, values in attributes.items()}
            merged["POSITION"] = centre.astype(np.float32)
            if "NORMAL" in attributes:
                normal = np.zeros((count, 3)); np.add.at(normal, group, attributes["NORMAL"])
                merged["NORMAL"] = (normal / np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-9)).astype(np.float32)
            faces = group[faces]
            faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
            faces = faces[np.unique(np.sort(faces, axis=1), axis=0, return_index=True)[1]]
            after += len(faces)
            primitive["attributes"] = {
                name: write(values, accessors[attributes_index]["type"], 34962, bounds=name == "POSITION", normalized=normalized[name])
                for (name, values), attributes_index in zip(merged.items(), primitive["attributes"].values())
            }
            primitive["indices"] = write(faces.reshape(-1, 1).astype(np.uint16 if count < 65536 else np.uint32), "SCALAR", 34963)
            primitive.pop("targets", None)

    # --- 2. squelette
    for skin in doc.get("skins", []):
        skin["inverseBindMatrices"] = write(read(skin["inverseBindMatrices"]), "MAT4")

    # --- 3. animations : seulement celles du catalogue
    catalog = json.loads((ROOT / "public/assets/catalog.json").read_text())
    wanted = set((catalog.get("character", {}).get("animations") or {}).values())
    kept = []
    for animation in doc.get("animations", []):
        if animation.get("name") not in wanted:
            continue
        remap = {}
        for sampler in animation["samplers"]:
            for key in ("input", "output"):
                index = sampler[key]
                if index not in remap:
                    remap[index] = write(read(index), accessors[index]["type"], bounds=key == "input")
                sampler[key] = remap[index]
        kept.append(animation)
    dropped = [a.get("name") for a in doc.get("animations", []) if a not in kept]
    doc["animations"] = kept

    doc["accessors"], doc["bufferViews"] = out_accessors, out_views
    binary = b"".join(chunks)
    doc["buffers"] = [{"byteLength": len(binary)}]
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    TARGET.write_bytes(struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(text), b"JSON") + text
                       + struct.pack("<I4s", len(binary), b"BIN\0") + binary)
    print(f"triangles : {before} -> {after}")
    print(f"animations gardées : {[a.get('name') for a in kept]} ; retirées : {dropped}")
    print(f"fichier : {SOURCE.stat().st_size // 1024} Ko -> {TARGET.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
