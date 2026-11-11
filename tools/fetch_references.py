"""
Télécharge des photographies d'Annaba sous licence libre depuis Wikimedia Commons,
pour servir de RÉFÉRENCES VISUELLES (elles ne sont pas intégrées au jeu).
Chaque image est enregistrée avec son auteur, sa licence et son adresse d'origine.

Usage : python tools/fetch_references.py
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
OUT = Path(__file__).resolve().parent.parent / "references"
START = ["Category:Annaba"]
MAX_DEPTH, MAX_FILES, WIDTH = 2, 160, 1000
HEADERS = {"User-Agent": "LixitingReferences/0.2 (https://github.com/thehoussem-codes/Lixisting; projet personnel non commercial)"}


def fetch(url):
    """Télécharge une adresse en respectant les limites du serveur : pause entre les appels, nouvel essai si on nous demande d'attendre."""
    for attempt in range(6):
        time.sleep(1.2)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code not in (429, 503):
                raise
            wait = int(error.headers.get("Retry-After") or 0) or 20 * (attempt + 1)
            print(f"  serveur occupé ({error.code}), attente {wait} s", flush=True)
            time.sleep(min(wait, 120))
    raise SystemExit("Wikimedia Commons refuse les requêtes pour le moment.")


def call(params):
    return json.loads(fetch(API + "?" + urllib.parse.urlencode({**params, "format": "json", "maxlag": "5"})))


def members(category, kind):
    out, cont = [], {}
    while True:
        data = call({"action": "query", "list": "categorymembers", "cmtitle": category, "cmtype": kind, "cmlimit": "200", **cont})
        out += [m["title"] for m in data.get("query", {}).get("categorymembers", [])]
        if "continue" not in data:
            return out
        cont = data["continue"]


def main():
    OUT.mkdir(exist_ok=True)
    seen, queue, credits = set(), [(c, 0) for c in START], []
    try:
      while queue and len(credits) < MAX_FILES:
          category, depth = queue.pop(0)
          if category in seen:
              continue
          seen.add(category)
          print(category, flush=True)
          if depth < MAX_DEPTH:
              queue += [(c, depth + 1) for c in members(category, "subcat")]
          files = [f for f in members(category, "file") if f.lower().endswith((".jpg", ".jpeg", ".png"))][:14]
          for start in range(0, len(files), 20):
              data = call({"action": "query", "titles": "|".join(files[start:start + 20]), "prop": "imageinfo",
                           "iiprop": "url|extmetadata|size", "iiurlwidth": str(WIDTH)})
              for page in data.get("query", {}).get("pages", {}).values():
                  info = (page.get("imageinfo") or [{}])[0]
                  if not info.get("thumburl") or info.get("width", 0) < 700 or len(credits) >= MAX_FILES:
                      continue
                  meta = info.get("extmetadata", {})
                  name = f"{len(credits):03d}.jpg"
                  try:
                      (OUT / name).write_bytes(fetch(info["thumburl"]))
                  except Exception as error:
                      print("  échec", page["title"], error)
                      continue
                  strip = lambda v: re.sub(r"<[^>]+>", "", v or "").strip()[:160]
                  credits.append({"file": name, "category": category.replace("Category:", ""), "title": page["title"],
                                  "author": strip(meta.get("Artist", {}).get("value")),
                                  "license": strip(meta.get("LicenseShortName", {}).get("value")),
                                  "date": strip(meta.get("DateTimeOriginal", {}).get("value")),
                                  "description": strip(meta.get("ImageDescription", {}).get("value")),
                                  "source": info.get("descriptionurl")})
    finally:
      (OUT / "credits.json").write_text(json.dumps(credits, ensure_ascii=False, indent=1), encoding="utf-8")
      print(len(credits), "images ;", len(seen), "catégories parcourues")


if __name__ == "__main__":
    main()
