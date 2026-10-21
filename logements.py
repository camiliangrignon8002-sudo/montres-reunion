"""Logements à louer dans le nord de La Réunion (studio, T1, T2, T3, jusqu'à 740 €).

Collecte les annonces de Bien'ici, ParuVendu, Zimo, EntreParticuliers et Figaro Immobilier,
garde celles qui peuvent ouvrir droit aux aides au logement de la CAF, puis écrit la page
docs/logements/index.html. Lancé régulièrement par GitHub Actions (.github/workflows/logements.yml).
"""

import base64
import html
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote, urljoin

try:
    from curl_cffi import requests  # imite un vrai navigateur
    IMPERSONATE = {"impersonate": "chrome"}
except ImportError:  # pragma: no cover
    import requests
    IMPERSONATE = {}

PRIX_MAX = int(os.environ.get("PRIX_MAX", "740"))
ROOT = Path(__file__).parent
FICHES_FILE = ROOT / "data" / "logements_fiches.json"   # pages d'annonce déjà lues (url -> infos)
VUS_FILE = ROOT / "data" / "logements_vus.json"         # id -> date où l'appli a vu l'annonce la 1re fois
JSON_FILE = ROOT / "docs" / "logements" / "annonces.json"
OUT_FILE = ROOT / "docs" / "logements" / "index.html"
REUNION = timezone(timedelta(hours=4))

# ---------------------------------------------------------------- zone

# commune -> (secteur, codes postaux, slug Zimo/EntreParticuliers, slug Figaro, zone Bien'ici)
COMMUNES = {
    "Saint-Denis": ("Nord", ["97400", "97490", "97417"], "saint-denis-97400", "saint+denis+97400", "-192468"),
    "Sainte-Marie": ("Nord", ["97438"], "sainte-marie-97438", "sainte+marie+97438", "-280212"),
    "Sainte-Suzanne": ("Nord-Est", ["97441"], "sainte-suzanne-97441", "sainte+suzanne+97441", "-280102"),
    "Saint-André": ("Nord-Est", ["97440"], "saint-andre-97440", "saint+andre+97440", "-280118"),
    "La Possession": ("Nord-Ouest", ["97419"], "la-possession-97419", "la+possession+97419", "-278304"),
    "Le Port": ("Nord-Ouest", ["97420"], "le-port-97420", "le+port+97420", "-278311"),
}
# Quartiers et autres façons d'écrire les communes -> commune
LIEUX = {
    "saint-denis": "Saint-Denis", "saint denis": "Saint-Denis", "st denis": "Saint-Denis", "st-denis": "Saint-Denis",
    "sainte-clotilde": "Saint-Denis", "sainte clotilde": "Saint-Denis", "ste clotilde": "Saint-Denis",
    "ste-clotilde": "Saint-Denis", "la montagne": "Saint-Denis", "le brule": "Saint-Denis", "moufia": "Saint-Denis",
    "bellepierre": "Saint-Denis", "le chaudron": "Saint-Denis", "la bretagne": "Saint-Denis", "bois de nefles": "Saint-Denis",
    "saint-francois": "Saint-Denis", "le butor": "Saint-Denis", "montgaillard": "Saint-Denis", "la source": "Saint-Denis",
    "sainte-marie": "Sainte-Marie", "sainte marie": "Sainte-Marie", "ste marie": "Sainte-Marie", "ste-marie": "Sainte-Marie",
    "la convenance": "Sainte-Marie", "beauséjour": "Sainte-Marie", "beausejour": "Sainte-Marie", "gillot": "Sainte-Marie",
    "sainte-suzanne": "Sainte-Suzanne", "sainte suzanne": "Sainte-Suzanne", "ste suzanne": "Sainte-Suzanne",
    "ste-suzanne": "Sainte-Suzanne", "quartier francais": "Sainte-Suzanne",
    "saint-andre": "Saint-André", "saint andre": "Saint-André", "st andre": "Saint-André", "st-andre": "Saint-André",
    "la possession": "La Possession", "possession": "La Possession", "ravine a malheur": "La Possession",
    "le port": "Le Port", "port est": "Le Port", "riviere des galets": "Le Port",
}
CP_COMMUNE = {cp: c for c, v in COMMUNES.items() for cp in v[1]}


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def commune_de(*textes):
    """La commune de la zone recherchée, d'après un code postal ou un nom de lieu ; sinon ''."""
    for t in textes:
        if not t:
            continue
        cp = re.search(r"\b(97[4]\d\d)\b", str(t))
        if cp and cp.group(1) in CP_COMMUNE:
            return CP_COMMUNE[cp.group(1)]
    for t in textes:
        n = norm(str(t or "")).replace("’", "'")
        # les noms longs d'abord, pour que « le port » ne réponde pas à « saint-pierre port »
        for lieu in sorted(LIEUX, key=len, reverse=True):
            if re.search(r"(?<![a-z])" + re.escape(lieu) + r"(?![a-z])", n):
                return LIEUX[lieu]
    return ""


QUARTIERS = {"sainte-clotilde": "Sainte-Clotilde", "sainte clotilde": "Sainte-Clotilde", "ste clotilde": "Sainte-Clotilde",
             "ste-clotilde": "Sainte-Clotilde", "la montagne": "La Montagne", "le brule": "Le Brûlé", "moufia": "Le Moufia",
             "bellepierre": "Bellepierre", "chaudron": "Le Chaudron", "la bretagne": "La Bretagne", "camelias": "Les Camélias",
             "bois de nefles": "Bois-de-Nèfles", "montgaillard": "Montgaillard", "la source": "La Source", "le butor": "Le Butor",
             "vauban": "Vauban", "providence": "La Providence", "saint-francois": "Saint-François", "trinite": "La Trinité",
             "petite-ile": "Petite-Île", "petite ile": "Petite-Île", "beausejour": "Beauséjour", "la convenance": "La Convenance",
             "duparc": "Duparc", "gillot": "Gillot", "rivière des pluies": "Rivière des Pluies", "riviere des pluies": "Rivière des Pluies",
             "ravine a malheur": "Ravine à Malheur", "riviere des galets": "Rivière des Galets", "quartier francais": "Quartier Français",
             "cambuston": "Cambuston", "centre-ville": "Centre-ville", "centre ville": "Centre-ville", "barachois": "Barachois"}


def quartier_de(txt):
    n = norm(txt)
    return next((v for k, v in QUARTIERS.items() if re.search(r"(?<![a-z])" + re.escape(k) + r"(?![a-z])", n)), "")


# ---------------------------------------------------------------- aides au logement

# Les aides de la CAF (AL/APL) sont versées pour une résidence principale louée vide ou meublée
# avec un bail d'habitation. Elles ne le sont pas pour une location de vacances ou de courte durée,
# ni quand le propriétaire dit ne pas les accepter.
SANS_AIDE = [
    r"saisonni", r"courte duree", r"location de vacances", r"location vacances", r"par nuit", r"/ ?nuit",
    r"la nuit", r"par semaine", r"a la semaine", r"airbnb", r"gite", r"meuble de tourisme",
    r"pas d'?apl", r"sans apl", r"apl non", r"apl refus", r"pas de caf", r"caf non", r"sans caf", r"hors caf",
    r"non eligible (?:aux? )?(?:apl|caf|aides?)", r"aides? (?:au logement )?non accept", r"apl pas accept",
    r"colocation", r"coloc\b", r"chambre chez l'?habitant", r"sous-location", r"sous location",
]
# Regardés seulement dans le titre (« un coin bureau » dans une description ne veut rien dire)
PAS_UN_LOGEMENT = [r"viager", r"a vendre", r"\bvente\b", r"local commercial", r"\bbureaux?\b", r"^parking",
                   r"^garage", r"^box\b", r"^cave\b", r"\bchambre\b(?! ?\d)"]
AVEC_AIDE = [r"\bapl\b", r"\bcaf\b", r"allocation logement", r"aides? au logement", r"\bals\b", r"\balf\b",
             r"logement social", r"conventionn", r"\bsidr\b", r"\bshlmr\b", r"\bsemader\b", r"\bsodiac\b"]


def aide_possible(texte):
    t = norm(texte)
    return not any(re.search(m, t) for m in SANS_AIDE)


def aide_mentionnee(texte):
    t = norm(texte)
    return any(re.search(m, t) for m in AVEC_AIDE)


# ---------------------------------------------------------------- outils

DISPARUE = set()  # pages d'annonce qui n'existent plus (404 ou 410)


def get(url, **kw):
    for essai in range(3):
        try:
            r = requests.get(url, timeout=40, **IMPERSONATE, **kw)
            if r.status_code == 200:
                return r
            print(f"  {r.status_code} {url}", file=sys.stderr)
            if r.status_code in (404, 410):
                DISPARUE.add(url)
            if r.status_code in (403, 404, 410):
                return None
        except Exception as e:  # réseau
            print(f"  erreur {url}: {e}", file=sys.stderr)
        time.sleep(3 * (essai + 1))
    return None


def texte(fragment):
    t = re.sub(r"<br\s*/?>|</p>|</li>|</div>", "\n", fragment or "", flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"[ \t\xa0]+", " ", t)
    return re.sub(r"\s*\n\s*", "\n", t).strip()


def nombre(txt):
    m = re.search(r"\d[\d\s\xa0 .]*(?:,\d+)?", str(txt or ""))
    if not m:
        return None
    s = re.sub(r"[\s\xa0 .]", "", m.group(0)).replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def ld_json(h):
    """Tous les objets schema.org de la page, à plat."""
    objets = []
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', h, re.S):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        pile = [d]
        while pile:
            x = pile.pop()
            if isinstance(x, list):
                pile.extend(x)
            elif isinstance(x, dict):
                objets.append(x)
                pile.extend(v for v in x.values() if isinstance(v, (dict, list)))
    return objets


def meta(h, nom):
    m = re.search(r'<meta[^>]+(?:property|name)="' + re.escape(nom) + r'"[^>]+content="([^"]*)"', h)
    return html.unescape(m.group(1)) if m else ""


def description_complete(h, debut):
    """La description entière : on cherche dans la page le texte le plus long qui commence comme
    la description courte (og:description est souvent coupé)."""
    debut = (debut or "").strip()
    if len(debut) < 30:
        return debut
    meilleur = debut
    cle = debut[:40]
    for forme in {cle, html.escape(cle, quote=False), html.escape(cle), json.dumps(cle)[1:-1]}:
        for m in re.finditer(re.escape(forme), h):
            bout = h[m.start():m.start() + 6000]
            fin = re.search(r'(?<!\\)"|</p>|</div>|<meta', bout)
            bout = bout[:fin.start()] if fin else bout
            if "\\u" in bout or "\\n" in bout:
                try:
                    bout = json.loads('"' + bout + '"')
                except ValueError:
                    pass
            bout = texte(bout)
            if len(bout) > len(meilleur):
                meilleur = bout
    return meilleur


def type_logement(pieces, titre="", description=""):
    t = norm(titre + " " + description[:300])
    if re.search(r"\bstudio\b|studette", t) and (pieces or 1) <= 1:
        return "Studio"
    if pieces:
        return {1: "T1", 2: "T2", 3: "T3"}.get(int(pieces), f"T{int(pieces)}")
    m = re.search(r"\b[tf] ?([1-9])\b|([1-9]) pieces?", t)
    if m:
        return f"T{m.group(1) or m.group(2)}"
    return ""


def caracteristiques(texte_complet):
    """Équipements cités dans l'annonce."""
    t = norm(texte_complet)
    trouves = []
    for nom, motif in [
        ("Meublé", r"\bmeuble\b"), ("Varangue / balcon", r"varangue|balcon|terrasse|loggia"),
        ("Parking", r"parking|stationnement|place de garage|garage"), ("Climatisation", r"climatis|\bclim\b"),
        ("Ascenseur", r"ascenseur"), ("Jardin", r"jardin"), ("Piscine", r"piscine"), ("Vue mer", r"vue mer"),
        ("Cuisine équipée", r"cuisine (?:equipee|amenagee)"), ("Résidence sécurisée", r"securis|digicode|interphone|portail"),
        ("Fibre", r"\bfibre\b"), ("Chauffe-eau solaire", r"chauffe-eau solaire|eau chaude solaire"),
        ("Proche transports", r"bus|car jaune|transport|tram"), ("Proche université", r"universit|fac\b|etudiant"),
        ("Accès handicapé", r"pmr|handicap"), ("Animaux acceptés", r"animaux accept"),
    ]:
        if re.search(motif, t):
            trouves.append(nom)
    return trouves


TEL = re.compile(r"(?<![\d+])(?:\+33|\+262|0033|00262|0)\s?[1-9](?:[\s.\-]?\d{2}){4}(?!\d)")
MAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def format_tel(t):
    chiffres = re.sub(r"\D", "", t)
    if chiffres.startswith(("00262", "00336", "00337")):
        chiffres = "0" + chiffres[5:] if chiffres.startswith("00262") else "0" + chiffres[4:]
    elif chiffres.startswith("262") and len(chiffres) == 12:
        chiffres = "0" + chiffres[3:]
    elif chiffres.startswith("33") and len(chiffres) == 11:
        chiffres = "0" + chiffres[2:]
    if len(chiffres) != 10:
        return ""
    if chiffres.startswith(("0262", "0263", "0692", "0693", "0639")):  # à La Réunion : 0692 12 34 56
        return chiffres[:4] + " " + " ".join(chiffres[i:i + 2] for i in range(4, 10, 2))
    return " ".join(chiffres[i:i + 2] for i in range(0, 10, 2))


def contacts_du_texte(txt):
    """Téléphone et e-mail écrits dans l'annonce elle-même."""
    tel = next((format_tel(m.group(0)) for m in TEL.finditer(txt or "") if format_tel(m.group(0))), "")
    mail = next((m.group(0) for m in MAIL.finditer(txt or "") if not re.search(r"\.(?:png|jpe?g|webp)$", m.group(0))), "")
    return tel, mail


def annonce(**champs):
    a = {"id": "", "source": "", "url": "", "titre": "", "prix": None, "commune": "", "quartier": "",
         "pieces": None, "type": "", "surface": None, "meuble": None, "photos": [], "description": "",
         "caracteristiques": [], "date": "", "annonceur": "", "lat": None, "lon": None, "charges": None,
         "pro": None, "tel": "", "email": "", "adresse": ""}
    a.update(champs)
    return a


# ---------------------------------------------------------------- Bien'ici (agences)

def bienici():
    zones = [v[4] for v in COMMUNES.values()]
    res, debut = [], 0
    while True:
        filtres = {"size": 100, "from": debut, "showAllModels": False, "filterType": "rent",
                   "propertyType": ["flat"], "maxPrice": PRIX_MAX, "page": debut // 100 + 1,
                   "sortBy": "publicationDate", "sortOrder": "desc", "onTheMarket": [True],
                   "zoneIdsByTypes": {"zoneIds": zones}}
        r = get("https://www.bienici.com/realEstateAds.json?filters=" + quote(json.dumps(filtres, separators=(",", ":"))))
        if not r:
            break
        d = r.json()
        for x in d.get("realEstateAds", []):
            ville = x.get("city", "")
            pieces = x.get("roomsQuantity")
            pos = (x.get("blurInfo") or {}).get("position") or {}
            slug = re.sub(r"[^a-z0-9]+", "-", norm(ville)).strip("-")
            car = []
            for cle, nom in [("hasElevator", "Ascenseur"), ("hasAirConditioning", "Climatisation"),
                             ("hasPool", "Piscine"), ("hasTerrace", "Terrasse"), ("hasCellar", "Cave"),
                             ("hasIntercom", "Interphone"), ("hasDoorCode", "Digicode"),
                             ("isDisabledPeopleFriendly", "Accès handicapé"), ("hasSeparateToilet", "WC séparés")]:
                if x.get(cle):
                    car.append(nom)
            if x.get("balconyQuantity"):
                car.append("Balcon / varangue")
            if x.get("parkingPlacesQuantity"):
                car.append(f"Parking ({x['parkingPlacesQuantity']})")
            if x.get("floor") is not None:
                car.append("Rez-de-chaussée" if x["floor"] == 0 else f"{x['floor']}e étage")
            if x.get("bedroomsQuantity"):
                car.append(f"{x['bedroomsQuantity']} chambre" + ("s" if x["bedroomsQuantity"] > 1 else ""))
            if x.get("energyClassification") and x["energyClassification"] not in ("NS", "VI"):
                car.append(f"DPE {x['energyClassification']}")
            if x.get("yearOfConstruction"):
                car.append(f"Construit en {x['yearOfConstruction']}")
            if x.get("availableDate"):
                j = x["availableDate"][:10]
                car.append(f"Libre le {j[8:10]}/{j[5:7]}/{j[:4]}")
            res.append(annonce(
                id="bienici-" + x["id"], source="Bien'ici",
                url=f"https://www.bienici.com/annonce/location/{slug}/appartement/{pieces or 1}pieces/{x['id']}",
                titre=x.get("title") or "", prix=x.get("price"), commune=commune_de(x.get("postalCode"), ville),
                quartier=(x.get("district") or {}).get("libelle", "") or ville,
                pieces=pieces, surface=x.get("surfaceArea"), meuble=x.get("isFurnished"),
                photos=[p["url"] for p in x.get("photos", []) if p.get("url")],
                description=(x.get("description") or "").strip(), caracteristiques=car,
                date=x.get("modificationDate") or x.get("publicationDate") or "",
                annonceur=x.get("accountDisplayName") or ("Agence" if x.get("adCreatedByPro") else "Particulier"),
                lat=pos.get("lat"), lon=pos.get("lon"), charges=x.get("charges"),
                studio=x.get("isStudio"), pro=bool(x.get("adCreatedByPro") or x.get("accountType") in ("agency", "pro")),
                bienici_id=x["id"]))
        debut += 100
        if debut >= d.get("total", 0) or debut >= 1000:
            break
    return res


def bienici_fiche(a):
    """Coordonnées de l'agence (Bien'ici ne montre pas l'e-mail : on écrit par son formulaire)."""
    url = "https://www.bienici.com/realEstateAd.json?id=" + quote(a["bienici_id"])
    r = get(url)
    if not r:
        return {"absente": True} if url in DISPARUE else None
    c = r.json().get("contactRelativeData") or {}
    adr = c.get("address") or {}
    return {k: v for k, v in {
        "tel": format_tel(c.get("phoneToDisplay") or ""),
        "annonceur": c.get("agencyNameToDisplay") or c.get("contactNameToDisplay") or "",
        "adresse": ", ".join(x for x in [adr.get("street"), " ".join(y for y in [adr.get("postalCode"), adr.get("city")] if y)] if x),
        "pro": bool(c.get("contactIsPro") or c.get("contactIsAgency")) if c else None,
    }.items() if v not in (None, "")}


# ---------------------------------------------------------------- ParuVendu

def paruvendu():
    res = []
    for page in range(1, 15):
        url = ("https://www.paruvendu.fr/immobilier/annonceimmofo/liste/listeAnnonces?tt=5&tbApp=1"
               f"&px1={PRIX_MAX}&lo=97400&ray=50" + (f"&p={page}" if page > 1 else ""))
        r = get(url)
        if not r:
            break
        blocs = r.text.split('class="blocAnnonce')[1:]
        if not blocs:
            break
        nouveaux = 0
        for b in blocs:
            lien = re.search(r'href="(/immobilier/location/[^"]+)"', b)
            ident = re.search(r'data-id="(\d+)"', b)
            if not lien or not ident:
                continue
            prix = re.search(r"<!-- Prix -->\s*<div>\s*([\d\s\xa0.]+)\s*&euro;", b)
            titre = re.search(r'title="\s*([^"]+)"', b[b.find(lien.group(1)):])
            lieu = re.search(r"<h3.*?<span>(.*?)</span>", b, re.S)
            lieu = texte(lieu.group(1)) if lieu else ""
            ville = lieu.split("\n")[-1] if lieu else ""
            pieces = re.search(r"(\d+) pi[eè]ce", titre.group(1) if titre else "")
            surface = re.search(r"([\d,.]+) m", titre.group(1) if titre else "")
            if any(x["id"] == "pv-" + ident.group(1) for x in res):
                continue
            nouveaux += 1
            res.append(annonce(
                id="pv-" + ident.group(1), source="ParuVendu", url="https://www.paruvendu.fr" + lien.group(1),
                titre=(titre.group(1).strip() if titre else "Appartement"),
                prix=nombre(prix.group(1)) if prix else None, commune=commune_de(ville), quartier=re.sub(r"\s*\(\d+\)", "", ville),
                pieces=int(pieces.group(1)) if pieces else None, surface=nombre(surface.group(1)) if surface else None,
                photos=re.findall(r'src="(https://img\.paruvendu\.fr/media_ext/[^"]+?)\?func', b),
                pro='alt="pro :' in b or "imgOffice" in b))
        if not nouveaux:
            break
    return res


def paruvendu_fiche(a, h):
    desc = re.search(r'id="txtAnnonceTrunc"[^>]*>(.*?)</div>', h, re.S) or re.search(r'class="txt_annonceauto"[^>]*>(.*?)</div>', h, re.S)
    photos = []
    for p in re.findall(r'(https://img\.paruvendu\.fr/media_ext/[^"\s?]+)', h):
        if p not in photos and "novisu" not in p and "logo" not in p.lower():
            photos.append(p)
    lieu = re.search(r"location appartement [^<]*? à ([^<(]+)\((\d{5})\)", h, re.I)
    tel = ""
    for code in re.findall(r'href="tel:\$1"[^>]*?\btel="([A-Za-z0-9+/=]+)"', h):
        try:
            tel = format_tel(base64.b64decode(code).decode("utf-8", "ignore"))
        except ValueError:
            continue
        if tel:
            break
    return {"tel": tel,"description": texte(desc.group(1)) if desc else meta(h, "og:description"),
            "photos": [p + "?func=crop&w=1000&gravity=auto" for p in photos],
            "commune": commune_de(lieu.group(2) if lieu else "", meta(h, "og:description"))}


# ---------------------------------------------------------------- Zimo

def zimo():
    """Zimo regroupe aussi des annonces de Leboncoin et d'agences. Ses pages d'annonce sont protégées
    (Cloudflare) : on se contente de la liste, qui donne prix, type, surface, commune et une photo."""
    res = []
    for slug in [v[2] for v in COMMUNES.values()]:
        for page in range(1, 10):
            r = get(f"https://www.zimo.fr/annonces/immobilier/location/appartement/{slug}" + (f"?page={page}" if page > 1 else ""))
            if not r:
                break
            h = r.text
            produits = {o["url"]: o for o in ld_json(h) if o.get("@type") == "Product" and "/annonce/" in o.get("url", "")}
            if not produits:
                break
            debut = 0
            for m in re.finditer(r'<a href="(/annonce/[^"]+)"\s+title="([^"]*)"', h):
                carte, debut = h[debut:m.start()], m.end()
                url = "https://www.zimo.fr" + m.group(1)
                ident = "zimo-" + url.rstrip("/").split("/")[-1]
                if any(x["id"] == ident for x in res):
                    continue
                o = produits.get(url, {})
                sous_titre = re.findall(r'<div class="leading-6 font-medium[^"]*">\s*(.*?)\s*</div>', carte, re.S)
                sous_titre = texte(sous_titre[-1]) if sous_titre else ""
                badges = [texte(b) for b in re.findall(r'<span class="badge[^"]*">(.*?)</span>', carte, re.S)]
                origine = re.findall(r'</div>\s*<span>([^<]{2,40})</span>\s*<i class="fas fa-caret-right"', carte)
                quand = re.findall(r"<time>([^<]+)</time>", carte)
                titre = html.unescape(m.group(2))
                commune = commune_de(sous_titre, titre)
                pieces = re.search(r"(\d+) pi[eè]ces?", sous_titre)
                surface = re.search(r"([\d,.]+) ?m²", sous_titre)
                prix = (o.get("offers") or {}).get("price") or next((b for b in badges if "€" in b), None)
                annonceur = next((b for b in badges if b in ("Particulier", "Professionnel", "Pro", "Agence")), "")
                res.append(annonce(
                    id=ident, source="Zimo", url=url, titre=titre, prix=nombre(prix), commune=commune,
                    quartier=quartier_de(titre + " " + sous_titre) or commune,
                    pieces=int(pieces.group(1)) if pieces else None, surface=nombre(surface.group(1)) if surface else None,
                    photos=[o["image"]] if o.get("image") else [], description=sous_titre,
                    annonceur=" · ".join(x for x in [annonceur, "via " + html.unescape(origine[-1].strip()) if origine else ""] if x),
                    fiche_bloquee=True, depuis=quand[-1] if quand else "",
                    pro={"Particulier": False}.get(annonceur, True if annonceur else None)))
            if len(produits) < 20:
                break
    return res


# ---------------------------------------------------------------- EntreParticuliers

def entreparticuliers():
    res = []
    for page in range(1, 30):
        r = get("https://www.entreparticuliers.com/annonces-immobilieres/location/appartement/la-reunion-974"
                + (f"?page={page}" if page > 1 else ""))
        if not r:
            break
        liens = [o["url"] for o in ld_json(r.text) if o.get("@type") == "ListItem" and "ref-" in str(o.get("url", ""))]
        if not liens:
            break
        for u in liens:
            cp = re.search(r"-(97\d\d\d)/", u)
            commune = commune_de(cp.group(1)) if cp else ""
            if not commune:
                continue
            res.append(annonce(id="ep-" + u.rsplit("ref-", 1)[-1], source="EntreParticuliers", url=u, commune=commune,
                               quartier=commune))
    return res


# ---------------------------------------------------------------- Figaro Immobilier

def figaro():
    res = []
    for commune, (_, _, _, slug, _) in COMMUNES.items():
        for page in range(1, 6):
            r = get(f"https://immobilier.lefigaro.fr/annonces/immobilier-location-appartement-{slug}.html"
                    + (f"?page={page}" if page > 1 else ""))
            if not r:
                break
            items = [o for o in ld_json(r.text) if o.get("@type") == "ListItem" and "/annonces/annonce-" in str(o.get("url", ""))]
            if not items:
                break
            for o in items:
                ident = "figaro-" + re.search(r"annonce-(\d+)", o["url"]).group(1)
                if any(x["id"] == ident for x in res):
                    continue
                nom = o.get("name", "")
                pieces = re.search(r"(\d+) pi[eè]ce", nom)
                surface = re.search(r"([\d,.]+) ?m²", nom)
                res.append(annonce(id=ident, source="Figaro Immobilier", url=o["url"], titre=nom.split(" - ")[0],
                                   commune=commune_de(nom) or commune, quartier=nom.split(" - ")[-1].split(" (")[0],
                                   pieces=int(pieces.group(1)) if pieces else None,
                                   surface=nombre(surface.group(1)) if surface else None,
                                   photos=[o["image"]] if o.get("image") else []))
            if len(items) < 20:
                break
    return res


# ---------------------------------------------------------------- pages d'annonce

PHOTOS_SITE = {
    "Zimo": r'(https://zimo-images\.s3\.fr-par\.scw\.cloud/photo_[0-9a-f\-]+\.(?:jpe?g|png|webp))',
    "EntreParticuliers": r'((?:https://www\.entreparticuliers\.com)?/media/epc-photos/photo_[0-9a-f\-]+\.(?:jpe?g|png|webp))',
}


def lire_fiche(a):
    """Complète l'annonce avec sa page : description entière, photos, prix, pièces, surface."""
    r = get(a["url"])
    if not r:
        return {"absente": True} if a["url"] in DISPARUE else None
    h = r.text
    f = {}
    if a["source"] == "ParuVendu":
        f = paruvendu_fiche(a, h)
    objets = ld_json(h)
    fiche = next((o for o in objets if o.get("@type") in ("RealEstateListing", "Product", "Offer", "Apartment",
                                                            "SingleFamilyResidence", "Residence", "Accommodation")
                  and (o.get("description") or o.get("price") or o.get("offers"))), {})
    titre = meta(h, "og:title") or fiche.get("name", "")
    f.setdefault("titre", titre)
    desc = fiche.get("description") or meta(h, "og:description") or meta(h, "description")
    if not f.get("description"):
        f["description"] = description_complete(h, desc)
    offre = fiche.get("offers")
    prix = fiche.get("price") or (offre.get("price") if isinstance(offre, dict) else None)
    if not prix:
        m = re.search(r"([\d\s\xa0 .]{3,})\s?(?:€|&euro;|euros?)", titre)
        prix = m.group(1) if m else None
    if prix:
        f["prix"] = nombre(prix)
    if fiche.get("numberOfRooms"):
        f["pieces"] = int(nombre(fiche["numberOfRooms"]) or 0) or None
    if isinstance(fiche.get("floorSize"), dict):
        f["surface"] = nombre(fiche["floorSize"].get("value"))
    adresse = fiche.get("address") or {}
    if isinstance(adresse, dict) and (adresse.get("postalCode") or adresse.get("addressLocality")):
        f["commune"] = commune_de(adresse.get("postalCode"), adresse.get("addressLocality"))
        f["quartier"] = adresse.get("addressLocality", "")
    m = re.search(r"(\d+) pi[eè]ces?", titre, re.I)
    if m and not f.get("pieces"):
        f["pieces"] = int(m.group(1))
    m = re.search(r"([\d,.]+) ?m²", titre)
    if m and not f.get("surface"):
        f["surface"] = nombre(m.group(1))
    if "photos" not in f:
        photos = []
        if a["source"] in PHOTOS_SITE:
            for p in re.findall(PHOTOS_SITE[a["source"]], h):
                p = urljoin(a["url"], p)
                if p not in photos:
                    photos.append(p)
        elif a["source"] == "Figaro Immobilier":
            fin = h.find('class="classified-description"')
            for ident in re.findall(r"https://lh3\.googleusercontent\.com/([A-Za-z0-9_\-]{40,})", h[:fin if fin > 0 else len(h)]):
                p = f"https://lh3.googleusercontent.com/{ident}=rw-w940-h605-l80"
                if p not in photos:
                    photos.append(p)
        images = fiche.get("image") or []
        for p in ([images] if isinstance(images, str) else images if isinstance(images, list) else []):
            p = p if isinstance(p, str) else (p or {}).get("url", "")
            if p and p not in photos:
                photos.append(p)
        if not photos and meta(h, "og:image"):
            photos.append(meta(h, "og:image"))
        f["photos"] = photos[:20]
    agence = re.search(r"(?:proposée? par|agence immobili[eè]re)\s+([A-Z][\w'’&\- ]{2,40}?)(?: sur| à|\.|,|$)", meta(h, "og:description") + " " + desc[:300])
    if agence:
        f["annonceur"] = agence.group(1).strip()
    elif a["source"] == "EntreParticuliers" and "particulier" in norm(h[:200000]):
        f["annonceur"] = "Particulier"
    return {k: v for k, v in f.items() if v not in (None, "", [])}


VERSION_FICHE = 2  # à augmenter quand lire_fiche apprend à lire une nouvelle information


def completer(annonces, fiches):
    """Lit les pages des annonces qui peuvent convenir (une seule fois par annonce)."""
    lues = 0
    for a in annonces:
        if a.get("fiche_bloquee"):
            continue
        if (a["prix"] and a["prix"] > PRIX_MAX) or not a["commune"]:
            continue
        if fiches.get(a["url"], {}).get("v") != VERSION_FICHE and not fiches.get(a["url"], {}).get("absente"):
            fiches.pop(a["url"], None)  # lue avant qu'on garde les coordonnées : on la relit
        if a["url"] not in fiches and lues < 400:
            f = bienici_fiche(a) if a["source"] == "Bien'ici" else lire_fiche(a)
            lues += 1
            time.sleep(2 if a["source"] == "Figaro Immobilier" else 0.5)
            if f is not None:  # page injoignable pour l'instant : on réessaiera au prochain passage
                f["lu"] = datetime.now(timezone.utc).isoformat()
                f["v"] = VERSION_FICHE
                fiches[a["url"]] = f
        f = fiches.get(a["url"], {})
        for k, v in f.items():
            if k in ("lu", "absente", "v"):
                continue
            if k == "photos" and len(a["photos"]) >= len(v):
                continue
            if k == "commune" and not v:
                continue
            a[k] = v
        if f.get("absente"):
            a["absente"] = True
    print(f"  {lues} pages d'annonce lues")


# ---------------------------------------------------------------- tri

def garder(a):
    if a.get("absente") or not a["prix"] or not a["commune"]:
        return False
    if not (0 < a["prix"] <= PRIX_MAX) or a["prix"] < 150:  # en dessous : parking, cave ou prix à la nuit
        return False
    tout = f"{a['titre']} {a['description']}"
    if not aide_possible(tout) or any(re.search(m, norm(a["titre"])) for m in PAS_UN_LOGEMENT):
        return False
    if re.search(r"\bmaison\b|\bvilla\b|\bcase\b", norm(a["titre"])) and not re.search(r"appartement|studio|\bt\d\b|\bf\d\b", norm(a["titre"])):
        return False
    a["type"] = "Studio" if a.get("studio") else type_logement(a["pieces"], a["titre"], a["description"])
    if a["type"] not in ("Studio", "T1", "T2", "T3"):
        return False
    if a["surface"] and a["surface"] > 300:  # erreur de saisie (le prix ou la référence à la place)
        a["surface"] = None
    if a["surface"] and a["surface"] < 9:  # moins de 9 m² : logement non décent, pas d'aide
        return False
    if a["meuble"] is None:  # on ne le dit que si l'annonce le précise
        if re.search(r"non meuble|\bvide\b", norm(a["titre"])):
            a["meuble"] = False
        elif re.search(r"(?<![a-z])meuble(?!s? non)", norm(tout)) and not re.search(r"non meuble", norm(tout)):
            a["meuble"] = True
    a["secteur"] = COMMUNES[a["commune"]][0]
    tel, mail = contacts_du_texte(a["description"])
    a["tel"] = format_tel(a["tel"]) or tel
    a["email"] = a["email"] or mail
    if a["pro"] is None:
        if a["source"] == "Figaro Immobilier" or re.search(r"\bagence\b|honoraires|mandat|\bcarte (?:t|g|professionnelle)", norm(tout)):
            a["pro"] = True
        elif a["source"] == "EntreParticuliers" or re.search(r"particulier|proprietaire", norm(tout + " " + a["annonceur"])):
            a["pro"] = False
    a["caf"] = aide_mentionnee(tout)
    a["caracteristiques"] = list(dict.fromkeys(a["caracteristiques"] + caracteristiques(tout)))
    a["titre"] = re.sub(r"\s*[-–|:]\s*(?:ParuVendu\.fr|Figaro Immobilier|Zimo|Entreparticuliers).*$", "", a["titre"], flags=re.I)
    a["titre"] = re.sub(r"^Annonce\s+", "", a["titre"]).strip()
    a["titre"] = a["titre"][:1].upper() + a["titre"][1:]
    if not a["titre"] or len(a["titre"]) < 4:
        a["titre"] = f"{a['type']} {int(a['surface'])} m²" if a["surface"] else a["type"]
    return True


def sans_doublons(annonces):
    """La même annonce passe souvent par plusieurs sites : on garde celle qui a le plus de photos."""
    groupes = {}
    for a in annonces:
        cle = (a["commune"], round(a["prix"]), round(a["surface"] or 0), a["type"])
        if not a["surface"]:
            cle = a["id"]
        groupes.setdefault(cle, []).append(a)
    res = []
    for g in groupes.values():
        g.sort(key=lambda a: (len(a["photos"]), len(a["description"])), reverse=True)
        meilleur = g[0]
        meilleur["aussi"] = [{"source": x["source"], "url": x["url"]} for x in g[1:] if x["source"] != meilleur["source"]]
        res.append(meilleur)
    return res


# ---------------------------------------------------------------- page

def page_html(annonces, maj, sources_ok):
    donnees = json.dumps(annonces, ensure_ascii=False).replace("</", "<\\/")
    communes = json.dumps({c: v[0] for c, v in COMMUNES.items()}, ensure_ascii=False)
    gabarit = (ROOT / "logements_page.html").read_text(encoding="utf-8")
    return (gabarit.replace("__DONNEES__", donnees).replace("__COMMUNES__", communes)
            .replace("__MAJ__", html.escape(maj)).replace("__PRIX_MAX__", str(PRIX_MAX))
            .replace("__SOURCES__", html.escape(", ".join(sources_ok))))


def main():
    fiches = json.loads(FICHES_FILE.read_text()) if FICHES_FILE.exists() else {}
    vus = json.loads(VUS_FILE.read_text()) if VUS_FILE.exists() else {}
    toutes, sources_ok = [], []
    for nom, fonction in [("Bien'ici", bienici), ("ParuVendu", paruvendu), ("Zimo", zimo),
                          ("EntreParticuliers", entreparticuliers), ("Figaro Immobilier", figaro)]:
        try:
            trouvees = fonction()
        except Exception as e:
            print(f"{nom} : erreur {e!r}", file=sys.stderr)
            continue
        print(f"{nom} : {len(trouvees)} annonces")
        if trouvees:
            sources_ok.append(nom)
        toutes += trouvees
    completer(toutes, fiches)
    gardees = sans_doublons([a for a in toutes if garder(a)])
    maintenant = datetime.now(REUNION)
    for a in gardees:
        vus.setdefault(a["id"], maintenant.isoformat(timespec="minutes"))
        a["vu"] = vus[a["id"]]
        for cle in ("absente", "studio", "fiche_bloquee", "depuis", "bienici_id"):
            a.pop(cle, None)
    gardees.sort(key=lambda a: a["prix"])
    par_source = {}
    for a in gardees:
        par_source[a["source"]] = par_source.get(a["source"], 0) + 1
    print(f"Gardées : {len(gardees)} {par_source}")
    # on oublie les pages d'annonce lues il y a plus de 30 jours (elles sont relues si l'annonce est toujours là)
    limite = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    fiches = {u: f for u, f in fiches.items() if f.get("lu", "") > limite}
    if not toutes:
        print("Aucune source n'a répondu : la page n'est pas modifiée.")
        return
    FICHES_FILE.parent.mkdir(exist_ok=True)
    FICHES_FILE.write_text(json.dumps(fiches, ensure_ascii=False))
    VUS_FILE.write_text(json.dumps(vus, ensure_ascii=False))
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    JSON_FILE.write_text(json.dumps(gardees, ensure_ascii=False, indent=1))
    jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    maj = f"{jours[maintenant.weekday()]} {maintenant:%d/%m à %Hh%M}"
    OUT_FILE.write_text(page_html(gardees, maj, sources_ok), encoding="utf-8")


if __name__ == "__main__":
    main()
