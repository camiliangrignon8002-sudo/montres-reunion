"""Biens à vendre à La Réunion : la petite liste du mois pour l'appli Seb Immo.

Lit les annonces de vente (maisons et appartements) de Bien'ici sur toute l'île, calcule le prix
moyen au m² de chaque commune, puis garde en tête de liste les biens les moins chers au m² par
rapport à leur commune. Écrit docs/immo/biens.json, que l'appli affiche dans le menu ☰ →
« Biens achetables ». Lancé le 1er de chaque mois par GitHub Actions (.github/workflows/immo.yml).
"""

import json
import os
import re
import statistics
import sys
import time
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote

try:
    from curl_cffi import requests  # imite un vrai navigateur
    IMPERSONATE = {"impersonate": "chrome"}
except ImportError:  # pragma: no cover
    import requests
    IMPERSONATE = {}

ROOT = Path(__file__).parent
JSON_FILE = ROOT / "docs" / "immo" / "biens.json"
REUNION = timezone(timedelta(hours=4))
PRIX_MAX = int(os.environ.get("PRIX_MAX", "600000"))
SELECTION = 30     # biens mis en avant dans « La sélection du mois »
GARDER = 300       # biens gardés au total (filtrables dans l'appli)
# Les 24 communes : leurs zones Bien'ici sont cherchées à chaque passage (suggest.json).
# Si la recherche ne donne rien, on se rabat sur les communes du nord, dont les zones sont connues.
COMMUNES = ["Saint-Denis", "Sainte-Marie", "Sainte-Suzanne", "Saint-André", "Bras-Panon", "Saint-Benoît",
            "La Plaine-des-Palmistes", "Sainte-Rose", "Saint-Philippe", "Saint-Joseph", "Petite-Île", "Saint-Pierre",
            "Le Tampon", "Entre-Deux", "Saint-Louis", "Cilaos", "L'Étang-Salé", "Les Avirons", "Saint-Leu",
            "Les Trois-Bassins", "Saint-Paul", "Le Port", "La Possession", "Salazie"]
ZONES_NORD = ["-192468", "-280212", "-280102", "-278304", "-278311"]
TYPES = {"house": "Maison", "flat": "Appartement", "land": "Terrain"}


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return s.lower().strip()


def valeur(v):
    """Les programmes neufs donnent une fourchette [min, max] : on garde le plus petit nombre."""
    if isinstance(v, (list, tuple)):
        v = [x for x in v if isinstance(x, (int, float))]
        return min(v) if v else None
    return v if isinstance(v, (int, float)) else None


def get(url):
    for essai in range(3):
        try:
            r = requests.get(url, timeout=40, **IMPERSONATE)
            if r.status_code == 200:
                return r
            print(f"  {r.status_code} {url}", file=sys.stderr)
            if r.status_code in (403, 404, 410):
                return None
        except Exception as e:  # réseau
            print(f"  erreur {url}: {e}", file=sys.stderr)
        time.sleep(3 * (essai + 1))
    return None


def zones_ile():
    zones = []
    for commune in COMMUNES:
        r = get("https://res.bienici.com/suggest.json?q=" + quote(commune))
        if not r:
            continue
        try:
            d = r.json()
        except ValueError:
            continue
        for x in d if isinstance(d, list) else d.get("suggestions", []):
            cps = x.get("postalCodes") or ([x["postalCode"]] if x.get("postalCode") else [])
            if any(str(cp).startswith("974") for cp in cps) and norm(commune) in norm(x.get("name", "")):
                zones += [z for z in x.get("zoneIds", []) if z not in zones]
                break
        else:
            print(f"  zone introuvable : {commune}", file=sys.stderr)
    print(f"{len(zones)} zones Bien'ici trouvées pour {len(COMMUNES)} communes", file=sys.stderr)
    return zones


def bienici(zones):
    res, debut = [], 0
    while True:
        filtres = {"size": 100, "from": debut, "showAllModels": False, "filterType": "buy",
                   "propertyType": list(TYPES), "maxPrice": PRIX_MAX, "page": debut // 100 + 1,
                   "sortBy": "publicationDate", "sortOrder": "desc", "onTheMarket": [True],
                   "zoneIdsByTypes": {"zoneIds": zones}}
        r = get("https://www.bienici.com/realEstateAds.json?filters=" + quote(json.dumps(filtres, separators=(",", ":"))))
        if not r:
            break
        d = r.json()
        for x in d.get("realEstateAds", []):
            cp = x.get("postalCode") or ""
            if not cp.startswith("974"):
                continue
            ville = x.get("city", "")
            genre = TYPES.get(x.get("propertyType"), "Bien")
            pieces = valeur(x.get("roomsQuantity"))
            slug = re.sub(r"[^a-z0-9]+", "-", norm(ville)).strip("-")
            categorie = {"Maison": "maison", "Appartement": "appartement", "Terrain": "terrain"}.get(genre, "maison")
            surface = valeur(x.get("surfaceArea")) if genre != "Terrain" else valeur(x.get("landSurfaceArea")) or valeur(x.get("surfaceArea"))
            photos = [p["url"] for p in x.get("photos", []) if p.get("url")]
            res.append({
                "id": "bienici-" + x["id"],
                "source": "Bien'ici",
                "url": f"https://www.bienici.com/annonce/vente/{slug}/{categorie}/{pieces or 1}pieces/{x['id']}",
                "titre": (x.get("title") or "").strip(),
                "type": genre,
                "prix": valeur(x.get("price")),
                "surface": surface,
                "terrain": valeur(x.get("landSurfaceArea")),
                "pieces": pieces,
                "chambres": valeur(x.get("bedroomsQuantity")),
                "commune": ville,
                "cp": cp,
                "photo": photos[0] if photos else "",
                "neuf": bool(x.get("newProperty")),
                "dpe": x.get("energyClassification") if x.get("energyClassification") not in ("NS", "VI") else None,
                "annonceur": x.get("accountDisplayName") or ("Agence" if x.get("adCreatedByPro") else "Particulier"),
                "date": (x.get("publicationDate") or "")[:10],
            })
        debut += 100
        if debut >= d.get("total", 0) or debut >= 6000:
            break
    return res


def classer(biens):
    """Ajoute le prix au m² et l'écart avec la moyenne de la commune, du moins cher au plus cher."""
    par_commune = {}
    for b in biens:
        if b["prix"] and b["surface"] and b["type"] != "Terrain":
            b["m2"] = round(b["prix"] / b["surface"])
            par_commune.setdefault((b["commune"], b["type"]), []).append(b["m2"])
    for b in biens:
        ref = par_commune.get((b["commune"], b["type"]), [])
        if b.get("m2") and len(ref) >= 3:
            b["m2_commune"] = round(statistics.median(ref))
            b["ecart"] = round(100 * (b["m2"] - b["m2_commune"]) / b["m2_commune"])
    # un bien très en dessous de sa commune (plus de 60 %) est souvent une erreur ou un viager
    bons = [b for b in biens if b.get("ecart") is not None and -60 <= b["ecart"]]
    bons.sort(key=lambda b: b["ecart"])
    autres = [b for b in biens if b not in bons]
    return bons, autres


def main():
    vus, biens = set(), []
    ile = zones_ile()
    for zones in ([ile[i:i + 8] for i in range(0, len(ile), 8)] or [ZONES_NORD]):
        for b in bienici(zones):
            if b["id"] not in vus:
                vus.add(b["id"])
                biens.append(b)
    for zones in ([] if biens else [ZONES_NORD]):
        for b in bienici(zones):
            if b["id"] not in vus:
                vus.add(b["id"])
                biens.append(b)
        if biens:
            break
    print(f"{len(biens)} biens à vendre lus", file=sys.stderr)
    if not biens:
        print("Aucun bien lu : on garde la liste du mois précédent.", file=sys.stderr)
        return
    bons, autres = classer(biens)
    maintenant = datetime.now(REUNION)
    selection = bons[:SELECTION]
    for b in selection:
        b["selection"] = True
    garde = (bons + autres)[:GARDER]
    JSON_FILE.parent.mkdir(parents=True, exist_ok=True)
    JSON_FILE.write_text(json.dumps({
        "mois": maintenant.strftime("%Y-%m"),
        "maj": maintenant.isoformat(timespec="minutes"),
        "total_lus": len(biens),
        "biens": garde,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(selection)} biens dans la sélection, {len(garde)} gardés", file=sys.stderr)


if __name__ == "__main__":
    main()
