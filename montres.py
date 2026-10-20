"""Montres homme à La Réunion (< 250 €) : collecte, filtre, page web et notification.

Lancé chaque matin à 10h (heure de La Réunion) par GitHub Actions (.github/workflows/montres.yml).
"""

import html
import json
import os
import re
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

PRIX_MAX = int(os.environ.get("PRIX_MAX", "250"))  # seuil de la notification de 10h (l'appli montre tous les prix)
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "")
# Seule la recherche de 10h notifie ; celles de la journée mettent juste la page à jour.
NOTIFIER = os.environ.get("NOTIFIER", "true") == "true"
PAGE_URL = os.environ.get("PAGE_URL", "")
ROOT = Path(__file__).parent
SEEN_FILE = ROOT / "data" / "seen.json"
PREMIERE_VUE_FILE = ROOT / "data" / "premiere_vue.json"  # id -> date et heure où l'appli a vu la montre pour la 1re fois
OUT_FILE = ROOT / "docs" / "index.html"
REUNION = timezone(timedelta(hours=4))

# ---------------------------------------------------------------- filtres

# Exclus : montres connectées, de sport, femme/enfant, et accessoires.
EXCLURE = [
    "smartwatch", "smart watch", "connecte", "intelligente", "apple watch", "galaxy watch",
    "huawei watch", "pixel watch", "garmin", "fitbit", "polar", "suunto",
    "coros", "amazfit", "xiaomi", "mi band", "redmi", "honor band", "withings",
    "fenix", "forerunner", "cardio", "gps", "montre sport", "montre de sport",
    "sport watch", "running", "fitness", "podometre", "tracker", "enfant",
    "kids", "junior", "fille", "garcon", "bebe", "jouet",
    "bracelet pour", "bracelet de montre", "bracelet montre", "boite vide",
    "ecrin", "coffret vide", "presentoir", "remontoir", "pile", "outil",
    "piece detachee", "pour pieces", "recherche", "cherche", "achete",
    "smart", "etui", "rangement", "boite a montre", "boite de", "piano", "clavier", "synthe", "calculatrice", "reveil", "horloge", "pendule", "radio",
]
FEMME = ["femme", "femmme", "dame", "lady", "ladies", "woman", "women", "feminin"]
# Marques et modèles pour femme qui ne le disent pas dans le titre (vus chez Cash Express)
MODELES_FEMME = ["cluse", "madison", "parfois", "candy", "petite", "adeline", "fluette", "gracieuse", "camille", "minuit", "triomphe"]
MONTRE = ["montre", "watch", "chrono", "automatique", "seiko", "casio", "tissot",
          "citizen", "orient", "festina", "lip", "fossil", "hamilton", "timex",
          "swatch", "certina", "edox", "boss", "diesel", "lorus", "pulsar",
          "bulova", "invicta", "g-shock", "gshock", "rolex", "omega", "longines",
          "tag heuer", "mathey", "herbelin", "yema", "baltic", "vostok", "raketa", "pagani", "benyar"]


# Marques reconnues pour la recherche et le filtre (nom affiché)
MARQUES = ["Omega", "Rolex", "Tag Heuer", "Longines", "Tudor", "Breitling", "Cartier", "Jaeger-LeCoultre", "IWC",
           "Seiko", "Citizen", "Tissot", "Hamilton", "Orient", "Casio", "G-Shock", "Swatch", "Certina", "Mido",
           "Edox", "Frédérique Constant", "Baume & Mercier", "Raymond Weil", "Michel Herbelin", "Yema", "Lip",
           "Festina", "Lotus", "Fossil", "Hugo Boss", "Lacoste", "Diesel", "Guess", "Michael Kors", "Maserati",
           "Daniel Wellington", "Pierre Lannier", "Ice Watch", "Timex", "Bulova", "Invicta", "Stuhrling",
           "Ingersoll", "Jaguar", "Montblanc", "Cat", "Lorus", "Pulsar", "Vostok", "Raketa", "Baltic",
           "Tommy Hilfiger", "Calvin Klein", "Emporio Armani", "Armani Exchange", "Skagen", "Bering", "Briston",
           "Rosefield", "Police", "Nautica", "Timberland", "Sector", "Philip Watch", "Victorinox", "Swiss Military",
           "Jacques Lemans", "Obaku", "Nixon", "Boccia", "Breil", "Morellato", "Liu Jo", "Esprit", "Lee Cooper",
           "Mathey-Tissot", "Maty", "Gant", "Kenneth Cole", "Superdry", "Tag Heuer", "Bell & Ross", "Panerai",
           "Zenith", "Oris", "Junghans", "Nomos", "MeisterSinger", "Glycine", "Alpina", "Rado", "Movado",
           "Seiko 5", "Citizen Eco-Drive", "Pagani Design", "Benyar"]
# Autres façons d'écrire une marque
ALIAS_MARQUES = {"boss": "Hugo Boss", "ice-watch": "Ice Watch", "icewatch": "Ice Watch", "seiko 5": "Seiko",
                 "citizen eco-drive": "Citizen", "armani": "Emporio Armani", "swatch group": "Swatch",
                 "casio vintage": "Casio", "g shock": "G-Shock", "tag-heuer": "Tag Heuer", "dw": "Daniel Wellington"}


def enrichir(a):
    """Ajoute la marque et la taille (mm) quand on peut les lire dans l'annonce."""
    t = norm(a["titre"])
    trouve = lambda nom: re.search(r"(?<![a-z])" + re.escape(norm(nom)) + r"(?![a-z])", t)
    a["marque"] = next((m for m in MARQUES if trouve(m)), "")
    a["marque"] = ALIAS_MARQUES.get(norm(a["marque"]), a["marque"])
    if not a["marque"]:
        a["marque"] = next((v for k, v in ALIAS_MARQUES.items() if trouve(k)), "")
    if not a["marque"] and " – " in a["titre"]:
        a["marque"] = a["titre"].split(" – ")[0]
    # boîtier entre 30 et 59 mm (20-24 mm, c'est la largeur du bracelet)
    taille = re.search(r"(?<!\d)([3-5]\d(?:[.,]\d)?)\s?mm\b", a["titre"] + " " + a.get("description", ""), re.I)
    taille = taille.group(1) if taille else a.get("taille_fiche", "")
    a["taille"] = f"{taille.replace('.', ',')} mm" if taille else ""
    a["mouvement"] = type_mouvement(a.get("mouvement", "") + " " + a["titre"] + " " + a.get("description", ""))
    return a


def type_mouvement(txt):
    """Automatique, Quartz, Mécanique (remontage manuel) ou Solaire, si l'annonce le dit."""
    t = norm(txt)
    if re.search(r"solaire|solar|eco-?drive|tough solar", t):
        return "Solaire"
    if re.search(r"automati|self-?winding|kinetic", t):
        return "Automatique"
    if re.search(r"remontage manuel|mecanique|manual|hand-?wound|manuelle", t):
        return "Mécanique"
    if re.search(r"quartz|a pile|electronique", t):
        return "Quartz"
    return ""


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def contient(texte, mots):
    return any(re.search(r"(?<![a-z])" + re.escape(m), texte) for m in mots)


def est_montre_homme(titre, description=""):
    t = norm(titre)
    if not contient(t, MONTRE):
        return False
    if contient(t, EXCLURE):
        return False
    if contient(t, FEMME + MODELES_FEMME) and "homme" not in t and "mixte" not in t:
        return False
    # Description : on n'écarte que les cas sans ambiguïté (marques de connectées/sport).
    d = norm(description)
    if contient(d, ["apple watch", "garmin", "fitbit", "amazfit", "smartwatch",
                    "montre connectee", "galaxy watch"]) and "pas connectee" not in d:
        return False
    # Description qui présente clairement une montre pour femme
    if contient(d, ["pour femme", "montre femme", "feminin", "pour elle", "pour dame", "poignet feminin"]) \
            and not contient(d, ["homme", "mixte", "unisexe"]):
        return False
    return True


# ---------------------------------------------------------------- sources

DEPUIS = "2024-01-01"  # on garde les annonces publiées ou mises à jour depuis cette date
RECHERCHES = ["montre", "watch", "chronographe", "automatique", "seiko", "casio", "citizen",
              "tissot", "orient", "festina", "fossil", "swatch", "hamilton", "lip", "rolex", "omega"]


def texte(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment or "")).replace("\xa0", " ").strip()


def paruvendu_liste(recherche):
    r = requests.get(f"https://www.paruvendu.re/vente-occasion/?q={quote(recherche)}", timeout=30, **IMPERSONATE)
    if r.status_code == 404:  # recherche sans résultat
        return
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    for c in r.text.split("<app-annonce")[1:]:
        lien = re.search(r'href="(/[^"]+/([a-z0-9-]+)-(\d{5})/[^"]*/(\d+)/)"', c)
        if not lien:
            continue
        prix = re.search(r'class="[^"]*prix[^"]*">([^<]*)<', c)
        chiffres = re.sub(r"\D", "", prix.group(1)) if prix else ""
        ville = re.search(r"location_on</i>([^<]*)<", c)
        yield {
            "id": f"pv-{lien.group(4)}",
            "source": "ParuVendu",
            "titre": texte((re.search(r'class="ann-ttl[^"]*">(.*?)</p>', c, re.S) or [None, ""])[1]),
            "description": texte((re.search(r'class="card-text[^"]*">(.*?)</p>', c, re.S) or [None, ""])[1]),
            "prix": int(chiffres) if chiffres else None,
            "url": "https://www.paruvendu.re" + lien.group(1),
            "ville": texte(ville.group(1)) if ville else "",
            "cp": lien.group(3),
            "lat": None, "lng": None,
            "photos": [], "date": "", "etat": "", "vendeur": "",
        }


def paruvendu_fiche(a):
    """Complète une annonce avec sa fiche : photos HD, description, état, date, vendeur."""
    r = requests.get(a["url"], timeout=30, **IMPERSONATE)
    if r.status_code != 200:
        return
    h = r.text
    photos = re.findall(r'(https://media\.paruvendu\.re/media_ext/[^"&?\s]+_sizecrop_1000x1000)', h)
    a["photos"] = list(dict.fromkeys(photos))
    desc = re.search(r'card-title">Description</p>\s*<p[^>]*>(.*?)</p>', h, re.S)
    if desc:
        a["description"] = texte(desc.group(1))
    etat = re.search(r"Etat du produit</strong>(.*?)<", h, re.S)
    if etat:
        a["etat"] = texte(etat.group(1))
    date = re.search(r"Dernière mise à jour : (\d\d)/(\d\d)/(\d{4})", h)
    if date:
        a["date"] = f"{date.group(3)}-{date.group(2)}-{date.group(1)}"
    vendeur = re.search(r'alt="logo annonceur".*?<p[^>]*class="mb-0">([^<]+)</p>', h, re.S)
    if vendeur:
        a["vendeur"] = texte(vendeur.group(1))


def paruvendu_fr_liste():
    """Rubrique « montres La Réunion » de ParuVendu.fr : mêmes annonces, mais certaines n'y sont que là."""
    vus = set()
    for page in (1, 2, 3, 4):
        url = "https://www.paruvendu.fr/annonces/montre/la-reunion-97400/" + (f"?p={page}" if page > 1 else "")
        r = requests.get(url, timeout=30, **IMPERSONATE)
        if r.status_code == 404 and page > 1:  # plus de pages
            break
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code} ({url})")
        nouveaux = 0
        for b in r.text.split('class="debarras-annonce')[1:]:
            ident = re.search(r'data-id="(\d+)"', b)
            lien = re.search(r'href="(https://www\.paruvendu\.fr/annonces/[^"]+-(\d{5})/\d+[^"]*)"', b)
            if not ident or not lien or ident.group(1) in vus:
                continue
            vus.add(ident.group(1))
            nouveaux += 1
            bloc = re.search(r'<p class="text-sm text-justify">(.*?)</p>', b, re.S)
            titre = re.search(r'font-semibold block">(.*?)</span>', bloc.group(1), re.S) if bloc else None
            prix = re.search(r'text-red font-medium[^>]*>\s*<div>(.*?)</div>', b, re.S)
            chiffres = re.sub(r"\D", "", texte(prix.group(1))) if prix else ""
            ville = re.search(r'<span class="px-2 text-black">([^<]+)</span>', b)
            image = re.search(r'<img src="([^"]+)"', b)
            yield {
                "id": f"pv-{ident.group(1)}",
                "source": "ParuVendu",
                "titre": texte(titre.group(1)) if titre else "",
                "description": texte(re.sub(r'<span class="font-semibold block">.*?</span>', "", bloc.group(1), flags=re.S)) if bloc else "",
                "prix": int(chiffres) if chiffres else None,
                "url": lien.group(1),
                "ville": re.sub(r"\s*\(\d+\)$", "", texte(ville.group(1))) if ville else "",
                "cp": lien.group(2),
                "lat": None, "lng": None,
                "photos": [html.unescape(image.group(1))] if image and "novisu" not in image.group(1) else [],
                "date": "", "etat": "", "vendeur": "",
            }
        if nouveaux == 0:
            break


def paruvendu_fr_fiche(a):
    r = requests.get(a["url"], timeout=30, **IMPERSONATE)
    if r.status_code != 200:
        return
    h = html.unescape(r.text)
    photos = re.findall(r'(https://img\.paruvendu\.fr/media_ext/[^"\s]+_rct\?func=crop&w=1000&gravity=auto)', h)
    if photos:
        a["photos"] = list(dict.fromkeys(photos))
    corps = re.sub(r"\s+", " ", texte(re.sub(r"<(script|style|svg).*?</\1>", "", h, flags=re.S)))
    desc = re.search(r"Description de l'annonce (.*?)(?: Montre à vendre à | Lire la suite|  Référence)", corps)
    if desc:
        a["description"] = desc.group(1).strip()
    vendeur = re.search(r"€ ([^€]{2,40}?)\.? Membre depuis", corps)
    if vendeur:
        a["vendeur"] = vendeur.group(1).strip()


def paruvendu():
    """Montres de ParuVendu Réunion (pages publiques, robots autorisés)."""
    annonces = {}
    for recherche in RECHERCHES:
        for a in paruvendu_liste(recherche):
            annonces.setdefault(a["id"], a)
    for a in paruvendu_fr_liste():
        annonces.setdefault(a["id"], a)
    retenues = [a for a in annonces.values()
                if est_montre_homme(a["titre"], a["description"])]
    uniques = {}
    for a in retenues:
        if "paruvendu.fr" in a["url"]:
            paruvendu_fr_fiche(a)
        else:
            paruvendu_fiche(a)
        # même montre publiée plusieurs fois par le même vendeur : on n'en garde qu'une
        uniques.setdefault((norm(a["titre"]), a["prix"], a["vendeur"], norm(a["description"])[:80]), a)
    return [a for a in uniques.values() if not a["date"] or a["date"] >= DEPUIS]


ETATS = ["Jamais servi", "Comme neuf", "Très bon état", "Bon état", "Correct"]
MAGASINS_CASH_EXPRESS = {
    "saint-pierre": ("Saint-Pierre", "97410"),
    "sainte-clotilde": ("Sainte-Clotilde", "97490"),
}


def cashexpress_fiche(a):
    """Complète une montre Cash Express avec sa fiche : photos, état, description, magasin."""
    r = requests.get(a["url"], timeout=30, **IMPERSONATE)
    if r.status_code != 200:
        return
    h = html.unescape(r.text)
    variation = re.search(r'"currentVariation":\{.*?"images":\{(.*?)\}\},"shop":\{[^}]*"city":"([^"]*)"', h, re.S)
    if variation:
        photos = [p.replace("\\/", "/") for p in re.findall(r'"src":"([^"]+)"', variation.group(1))]
        a["photos"] = ["https://www.cashexpress.fr" + p for p in photos] or a["photos"]
        a["magasin"] = variation.group(2).replace("-", " ").title().replace(" ", "-")
    corps = re.sub(r"\s+", " ", texte(re.sub(r"<(script|style|svg).*?</\1>", "", h, flags=re.S)))
    etat = re.search(r"État : (?:État )?(.{2,60}?) [\d ]+,\d\d ?€", corps)
    if etat:  # plusieurs exemplaires possibles : on garde le premier état cité
        trouves = [(norm(etat.group(1)).find(norm(x)), x) for x in ETATS if norm(x) in norm(etat.group(1))]
        a["etat"] = min(trouves)[1] if trouves else etat.group(1).strip().capitalize()
    desc = re.search(r"Ajouter au panier Description (.*?) Caractéristiques", corps)
    if desc:
        a["description"] = desc.group(1).strip()


def cashexpress_cartes(url):
    r = requests.get(url, timeout=30, **IMPERSONATE)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code} ({url})")
    for c in re.split(r'<a class="product-card" ', r.text)[1:]:
        lien = re.search(r'href="([^"]+)"', c)
        nom = re.search(r'__name">(.*?)</div>', c, re.S)
        prix = re.search(r'class="price">(.*?)</div>', c, re.S)
        if not (lien and nom and prix) or "{{" in lien.group(1):
            continue
        marque = texte((re.search(r'__brand[^>]*>(.*?)</div>', c, re.S) or [None, ""])[1]).title()
        valeur = float(re.sub(r"[^\d,]", "", texte(prix.group(1))).replace(",", "."))
        image = re.search(r'<img src="([^"]+)"', c)
        yield {
            "id": "ce-" + lien.group(1).rstrip("/").split("/")[-2],
            "source": "Cash Express",
            "titre": f"{marque} – {texte(nom.group(1))}" if marque else texte(nom.group(1)),
            "description": "", "prix": int(valeur) if valeur.is_integer() else valeur,
            "url": lien.group(1), "lat": None, "lng": None,
            "photos": ["https://www.cashexpress.fr" + image.group(1)] if image else [],
            "date": "", "etat": "",
        }


# ---------------------------------------------------------------- catégorie Omega (tout prix, Réunion + métropole)

MAGASINS_REUNION = {"Saint-Pierre": "97410", "Sainte-Clotilde": "97490"}
# Magasins des Antilles et de Guyane : hors zone (on garde La Réunion et la métropole)
VILLES_HORS_ZONE = ["baie-mahault", "abymes", "pointe-a-pitre", "gosier", "lamentin", "fort-de-france", "ducos",
                    "robert", "schoelcher", "riviere-salee", "le-moule", "sainte-anne", "cayenne", "kourou", "matoury",
                    "remire", "jarry", "trois-ilets", "saint-martin"]


def pas_pour_femme(a):
    return not (contient(norm(a["titre"]), FEMME) and "homme" not in norm(a["titre"]))


def omega_cashexpress():
    montres = []
    for a in cashexpress_cartes("https://www.cashexpress.fr/c-2524/omega"):
        if not pas_pour_femme(a):
            continue
        cashexpress_fiche(a)
        ville = a.pop("magasin", "") or "France"
        if contient(norm(ville), VILLES_HORS_ZONE):
            continue
        a.update({"ville": ville, "cp": MAGASINS_REUNION.get(ville, ""),
                  "region": "La Réunion" if ville in MAGASINS_REUNION else "Métropole",
                  "adresse": f"Cash Express {ville}" + (", La Réunion" if ville in MAGASINS_REUNION else ", France"),
                  "vendeur": f"Cash Express {ville} (magasin)"})
        montres.append(a)
    return montres


ETATS_COLLECTOR = [("new", "Neuf"), ("vgod", "Très bon état"), ("good", "Bon état"), ("fair", "Correct")]


def omega_collectorsquare():
    """Omega de seconde main vérifiées par Collector Square (Paris), page marque autorisée aux robots."""
    r = requests.get("https://www.collectorsquare.com/montres/omega/", timeout=30, **IMPERSONATE)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    montres = []
    for li in r.text.split('<li class="product ')[1:]:
        code = re.search(r'data-product-code="(\d+)"', li)
        prix = re.search(r'data-product-price="(\d+)"', li)
        lien = re.search(r'<a href="([^"]+\.html)" title="([^"]+)"', li)
        if not (code and lien):
            continue
        etat = re.search(r'data-product-condition="([^"]*)"', li)
        etat = next((v for k, v in ETATS_COLLECTOR if etat and k in etat.group(1)), "")
        a = {
            "id": f"cs-{code.group(1)}", "source": "Collector Square",
            "titre": html.unescape(lien.group(2)), "description": "",
            "prix": int(prix.group(1)) if prix else None,
            "url": "https://www.collectorsquare.com" + lien.group(1),
            "ville": "Paris", "cp": "", "region": "Métropole", "adresse": "Collector Square, Paris",
            "lat": None, "lng": None, "date": "", "etat": etat, "vendeur": "Collector Square (expertisée)",
            "photos": list(dict.fromkeys(re.findall(r'src="(https://medias\.collectorsquare\.com/images/products/[^"]+)"', li))),
        }
        if pas_pour_femme(a):
            montres.append(a)
    for a in montres:  # fiche produit : photos en grand format
        r = requests.get(a["url"], timeout=30, **IMPERSONATE)
        code = a["id"][3:]
        grandes = [p for p in re.findall(rf'https://medias\.collectorsquare\.com/images/products/{code}/[^"\'\s]+\.jpg', r.text)
                   if "/thumb-" not in p] if r.status_code == 200 else []
        if grandes:
            a["photos"] = sorted(dict.fromkeys(grandes), key=lambda p: "/00pp-" not in p)
        time.sleep(0.3)  # rester discret envers le site
    return montres


def omega_reunion():
    """Toutes les Omega en vente à La Réunion sur ParuVendu, sans limite de prix."""
    annonces = {a["id"]: a for a in paruvendu_liste("omega")}
    for a in paruvendu_fr_liste():
        annonces.setdefault(a["id"], a)
    montres = [a for a in annonces.values()
               if "omega" in norm(a["titre"] + " " + a["description"]) and pas_pour_femme(a)
               and not contient(norm(a["titre"]), EXCLURE)]
    for a in montres:
        (paruvendu_fr_fiche if "paruvendu.fr" in a["url"] else paruvendu_fiche)(a)
        a["region"] = "La Réunion"
    return [a for a in montres if not a["date"] or a["date"] >= DEPUIS]


SOURCES_OMEGA = [omega_reunion, omega_cashexpress, omega_collectorsquare]


def cashexpress():
    """Montres de marque d'occasion des magasins Cash Express de La Réunion (robots autorisés)."""
    montres = []
    for slug, (ville, cp) in MAGASINS_CASH_EXPRESS.items():
        for a in cashexpress_cartes(f"https://www.cashexpress.fr/c-19/magasin/{slug}/montres-marques"):
            a.update({"ville": ville, "cp": cp, "region": "La Réunion", "adresse": f"Cash Express {ville}, La Réunion",
                      "vendeur": f"Cash Express {ville} (magasin)"})
            if est_montre_homme(a["titre"]):
                montres.append(a)
    for a in montres:
        cashexpress_fiche(a)
        a.pop("magasin", None)
    return [a for a in montres if est_montre_homme(a["titre"], a["description"])]


SOURCES = [paruvendu, cashexpress]


# ---------------------------------------------------------------- montres neuves et Europe

PAGES_MAX = int(os.environ.get("PAGES_MAX", "8"))  # pages lues par site et par passage (reste discret)


def page(url):
    r = requests.get(url, timeout=30, **IMPERSONATE)
    time.sleep(0.5)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code} ({url})")
    return r.text


def valeur_prix(txt):
    chiffres = re.sub(r"[^\d,.]", "", txt.replace(" ", "").replace(" ", "")).replace(",", ".")
    if not chiffres:
        return None
    v = float(chiffres)
    return int(v) if v.is_integer() else v


def neuve(**champs):
    base = {"description": "", "lat": None, "lng": None, "date": "", "etat": "Neuf", "neuf": True, "cp": ""}
    base.update(champs)
    return base


def gem_rubrique(chemin):
    """Adresses des montres d'une rubrique GEM (ex. montres automatiques)."""
    liens = set()
    for n in range(1, PAGES_MAX + 1):
        h = page(f"https://www.gembijoux.com/fr/montres/{chemin}" + (f"/page/{n}" if n > 1 else ""))
        trouves = {l for l in re.findall(r'<li data-pname=.*?<a[^>]+href="([^"]+)"', h, re.S)}
        if not trouves - liens:
            break
        liens |= trouves
    return {l if l.startswith("http") else "https://www.gembijoux.com" + l for l in liens}


def gem():
    """Montres homme neuves de GEM Atelier Bijoux (4 boutiques à La Réunion)."""
    montres, vus = [], set()
    for n in range(1, PAGES_MAX + 1):
        h = page("https://www.gembijoux.com/fr/montres/montres-homme" + (f"/page/{n}" if n > 1 else ""))
        nouveaux = 0
        for b in h.split("<li data-pname=")[1:]:
            lien = re.search(r'<a[^>]+href="([^"]+)"', b)
            nom = re.search(r'class="prod-item__name">(.*?)</span>', b, re.S)
            prix = re.search(r'class="prod-item__prix">(.*?)</p>', b, re.S)
            if not (lien and nom and prix) or lien.group(1) in vus:
                continue
            vus.add(lien.group(1))
            nouveaux += 1
            url = lien.group(1) if lien.group(1).startswith("http") else "https://www.gembijoux.com" + lien.group(1)
            images = list(dict.fromkeys(re.findall(r'(https://images\.hbjo-online\.com/[^"?\s]+)\?w=', b)))
            montres.append(neuve(
                id="gem-" + url.rstrip("/").split("/")[-1], source="GEM", titre=texte(nom.group(1)),
                prix=valeur_prix(texte(prix.group(1))), url=url, photos=[i + "?w=1000" for i in images],
                ville="Boutiques GEM", region="La Réunion", adresse="GEM Atelier Bijoux, La Réunion",
                vendeur="GEM Atelier Bijoux (Saint-Denis, Saint-Pierre, Sainte-Marie, Saint-Gilles)"))
        if nouveaux == 0:
            break
    for chemin, mouvement in (("montres-automatiques", "Automatique"), ("montre-quartz", "Quartz")):
        try:
            liens = gem_rubrique(chemin)
        except Exception as exc:
            print(f"::warning::GEM {chemin} : {exc}")
            continue
        for a in montres:
            if a["url"] in liens:
                a["mouvement"] = mouvement
    return [a for a in montres if est_montre_homme(a["titre"])]


def ocarat():
    """Montres homme neuves d'Ocarat (bijouterie en ligne française)."""
    montres, vus = [], set()
    for n in range(1, PAGES_MAX + 1):
        h = page("https://ocarat.com/montre-homme/" + (f"?p={n}" if n > 1 else ""))
        for b in h.split('<article class="ajax_block_product"')[1:]:
            ident = re.search(r'data-id-product="(\d+)"', b)
            lien = re.search(r'class="product-name" href="([^"]+)"', b)
            prix = re.search(r'product-price">(.*?)</span>', b, re.S)
            if not (ident and lien and prix) or ident.group(1) in vus:
                continue
            vus.add(ident.group(1))
            marque = texte((re.search(r'class="product-brand[^"]*">(.*?)</span>', b, re.S) or [None, ""])[1])
            titre = texte((re.search(r'class="product-title">(.*?)</span>', b, re.S) or [None, ""])[1])
            images = re.findall(r'src="(https://images\.ocarat\.com/[^"]+)"', b)
            montres.append(neuve(
                id=f"oc-{ident.group(1)}", source="Ocarat", titre=f"{marque} – {titre}" if marque else titre,
                prix=valeur_prix(texte(prix.group(1))), url=lien.group(1),
                photos=[i.replace("-home_default/", "-thickbox_default/")  # 800 px au lieu de 400
                        for i in sorted(dict.fromkeys(images), key=lambda i: "secondary" in i)], ville="Boutique en ligne",
                region="Métropole", adresse="", vendeur="Ocarat (livraison France et Belgique)"))
    return montres


def histoiredor():
    """Montres homme neuves d'Histoire d'Or (bijouteries en France)."""
    montres, vus = [], set()
    for n in range(PAGES_MAX):
        h = page(f"https://www.histoiredor.com/fr_FR/c/montres/facette/homme/?start={n * 40}&sz=40")
        tuiles = h.split('data-item="tile"')[1:]
        for b in tuiles:
            lien = re.search(r"class=\"c-product-tile__name-link\"[^>]*href='([^']+)'[^>]*>(.*?)</a>", b, re.S)
            prix = re.search(r'itemprop="price" content="([\d.]+)"', b)
            if not (lien and prix) or lien.group(1) in vus:
                continue
            vus.add(lien.group(1))
            images = list(dict.fromkeys(re.findall(r'(https://www\.histoiredor\.com/dw/image/[^"?\s]+\.jpg)\?sw=', html.unescape(b))))
            montres.append(neuve(
                id="hdo-" + lien.group(1).rstrip("/").split("/")[-1].replace(".html", ""), source="Histoire d'Or",
                titre=texte(lien.group(2)), prix=valeur_prix(prix.group(1)),
                url="https://www.histoiredor.com" + lien.group(1), photos=[i + "?sw=1000&sh=1000" for i in images],
                ville="Boutique en ligne et magasins", region="Métropole", adresse="",
                vendeur="Histoire d'Or (retrait en magasin possible)"))
        if not tuiles:
            break
    return montres


def maty():
    """Montres homme neuves de Maty (première page de la sélection)."""
    h = page("https://www.maty.com/montres-homme/montres-homme.html")
    montres = []
    for b in h.split('<div class="produit pl-event"')[1:]:
        ref = re.search(r'data-reference="(\d+)"', b)
        lien = re.search(r'<h2 class="desc"><span><a href="([^"]+)">(.*?)</a>', b, re.S)
        prix = re.search(r'class="prix-final">(.*?)</p>', b, re.S)
        if not (ref and lien and prix):
            continue
        images = list(dict.fromkeys(re.findall(r'//photos\.maty\.com/(\d+/V\d+)/\d+/([^"\s]+?)\.jpeg', b)))
        montres.append(neuve(
            id=f"maty-{ref.group(1)}", source="Maty", titre=texte(lien.group(2)), prix=valeur_prix(texte(prix.group(1))),
            url="https://www.maty.com" + lien.group(1),
            photos=[f"https://photos.maty.com/{v}/1000/{nom}.jpeg" for v, nom in images],
            ville="Boutique en ligne et magasins", region="Métropole", adresse="", vendeur="Maty"))
    return montres


def cashexpress_france():
    """Montres de marque d'occasion de tous les magasins Cash Express (France)."""
    montres, vus = [], set()
    for n in range(1, PAGES_MAX + 1):
        nouveaux = 0
        for a in cashexpress_cartes("https://www.cashexpress.fr/c-19/montres-marques" + (f"?page={n}" if n > 1 else "")):
            if a["id"] in vus:
                continue
            vus.add(a["id"])
            nouveaux += 1
            a.update({"id": "cef-" + a["id"][3:], "ville": "Magasin en France", "region": "Métropole", "adresse": "",
                      "vendeur": "Cash Express (magasin en France)", "etat": "Occasion"})
            montres.append(a)
        if nouveaux == 0:
            break
    return montres


FICHES_FILE = ROOT / "data" / "fiches.json"
FICHES_PAR_PASSAGE = int(os.environ.get("FICHES_PAR_PASSAGE", "300"))  # nouvelles fiches lues à chaque passage


def lire_fiche(a):
    """Photos, mouvement, taille et description depuis la page de la montre (selon le site)."""
    r = requests.get(a["url"], timeout=30, **IMPERSONATE)
    time.sleep(0.4)
    if r.status_code != 200:
        return {}
    h = html.unescape(r.text)
    corps = re.sub(r"\s+", " ", texte(re.sub(r"<(script|style|svg).*?</\1>", "", h, flags=re.S)))
    fiche = {}
    prefixe = a["id"].split("-")[0]
    if prefixe == "oc":
        m = re.search(r"Mouvements? (Quartz|Automatique|Mécanique[^ ]*|Solaire|Kinetic|Manuel)", corps)
        fiche["mouvement"] = m.group(1) if m else ""
        t = re.search(r"Diamètre[^0-9]{0,40}?(\d{2}(?:[.,]\d)?)", corps)
        fiche["taille"] = t.group(1) if t else ""
    elif prefixe == "hdo":
        m = re.search(r"Mécanisme (\w+)", corps)
        fiche["mouvement"] = m.group(1) if m else ""
        t = re.search(r"Ouverture boîtier \(mm\) (\d{2}(?:[.,]\d)?)", corps)
        fiche["taille"] = t.group(1) if t else ""
    elif prefixe == "maty":
        d = re.search(r'<meta name="description" content="([^"]*)"', h)
        fiche["description"] = d.group(1) if d else ""
    elif prefixe in ("cef", "ce"):
        v = re.search(r'"currentVariation":\{.*?"images":\{(.*?)\}\},"shop"', h, re.S)
        if v:
            fiche["photos"] = ["https://www.cashexpress.fr" + p.replace("\\/", "/") for p in re.findall(r'"src":"([^"]+)"', v.group(1))]
        d = re.search(r"Ajouter au panier Description (.*?) Caractéristiques", corps)
        fiche["description"] = d.group(1).strip() if d else ""
    return fiche


def completer_fiches(catalogue):
    fiches = json.loads(FICHES_FILE.read_text()) if FICHES_FILE.exists() else {}
    a_lire = [a for a in catalogue if a["id"] not in fiches and a["id"].split("-")[0] in ("oc", "hdo", "maty", "cef")]
    for a in a_lire[:FICHES_PAR_PASSAGE]:
        try:
            fiches[a["id"]] = lire_fiche(a)
        except Exception as exc:
            print(f"::warning::fiche {a['id']} : {exc}")
    for a in catalogue:
        f = fiches.get(a["id"], {})
        if f.get("photos") and len(f["photos"]) > len(a.get("photos") or []):
            a["photos"] = f["photos"]
        if f.get("description") and not a.get("description"):
            a["description"] = f["description"]
        if f.get("mouvement"):
            a["mouvement"] = f["mouvement"]
        if f.get("taille"):
            a["taille_fiche"] = f["taille"]
    FICHES_FILE.write_text(json.dumps(fiches, ensure_ascii=False, sort_keys=True))
    print(f"{min(len(a_lire), FICHES_PAR_PASSAGE)} fiches lues, {max(0, len(a_lire) - FICHES_PAR_PASSAGE)} restantes.")


def pagani():
    """Montres neuves de Pagani Design France (boutique Shopify : liste publique des produits)."""
    montres = []
    for n in range(1, 5):
        produits = json.loads(page(f"https://pagani-design.fr/products.json?limit=250&page={n}")).get("products", [])
        if not produits:
            break
        for p in produits:
            tags = [t.lower() for t in p.get("tags", [])]
            if "accessoires" in tags or "bracelets" in tags or ("femme" in tags and "homme" not in tags) \
                    or re.match(r"(?i)(bracelet|bo[iî]te|[ée]tui)", p["title"]):
                continue
            prix = valeur_prix(p["variants"][0]["price"]) if p.get("variants") else None
            mouvement = "Automatique" if "automático" in tags else "Quartz" if "cuarzo" in tags else ""
            taille = next((t[:-2] for t in tags if re.fullmatch(r"(3[4-9]|4\d|5\d)mm", t)), "")
            montres.append(neuve(
                id=f"pd-{p['id']}", source="Pagani Design", titre=p["title"].title().replace("Pagani Design", "Pagani Design –", 1)
                if p["title"].upper().startswith("PAGANI DESIGN") else p["title"].title(),
                description=texte(p.get("body_html", ""))[:600], prix=prix,
                url=f"https://pagani-design.fr/products/{p['handle']}",
                photos=[i["src"] for i in p.get("images", [])][:10], ville="Boutique en ligne", region="Métropole",
                adresse="", vendeur="Pagani Design France", mouvement=mouvement, taille_fiche=taille))
    return [a for a in montres if est_montre_homme("montre " + a["titre"])]


SOURCES_REUNION_NEUVES = [gem]
SITES_AJOUTES = {"gem", "oc", "hdo", "maty", "cef", "cs", "pd"}  # pas de « nouveautés » avant leur premier passage de 10h
SOURCES_EUROPE = [ocarat, histoiredor, maty, cashexpress_france, pagani]


# ---------------------------------------------------------------- page web

MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def date_fr(iso):
    if not iso:
        return ""
    a, m, j = iso[:10].split("-")
    return f"{int(j)} {MOIS[int(m) - 1]} {a}"


def carte_google(a):
    if not (a.get("lat") or a.get("adresse") or a.get("cp")) and a.get("region") != "La Réunion":
        return ""  # boutique en ligne : pas d'adresse précise
    if a.get("lat") and a.get("lng"):
        q = f"{a['lat']},{a['lng']}"
    elif a.get("adresse"):
        q = a["adresse"]
    else:
        q = f"{a.get('ville') or ''} {a.get('cp') or ''}, La Réunion".strip()
    return f"https://www.google.com/maps/search/?api=1&query={quote(q)}"


def carte_embed(a):
    """Carte Google Maps intégrable (sans clé API)."""
    if not (a.get("lat") or a.get("adresse") or a.get("cp")) and a.get("region") != "La Réunion":
        return ""  # boutique en ligne : pas d'adresse précise
    if a.get("lat") and a.get("lng"):
        q = f"{a['lat']},{a['lng']}"
    elif a.get("adresse"):
        q = a["adresse"]
    else:
        q = f"{a.get('ville') or ''} {a.get('cp') or ''}, La Réunion".strip()
    return f"https://maps.google.com/maps?q={quote(q)}&z=11&output=embed"


def prix_txt(a, defaut):
    p = a.get("prix")
    if p is None:
        return defaut
    if isinstance(p, int):
        return f"{p:,} €".replace(",", " ")
    return f"{p:,.2f} €".replace(",", " ").replace(".", ",")


def photos(a):
    return a.get("photos") or ([a["image"]] if a.get("image") else [])


ICONE_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>'
ICONE_LOUPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/></svg>'
ICONE_CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>'
ICONE_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
ICONE_COEUR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z"/></svg>'
ICONE_SAC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8h13l-1 12h-11Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>'
ICONE_COTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M6 16l4-5 3 3 5-7"/></svg>'
ICONE_SORTIE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/></svg>'
ICONE_CLOCHE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>'
VAPID_PUBLIQUE = "BELW2vkzh_ExmwyQlA4tQNi6rSXtBDZPDX2i1g-mXCFM2n5sHz6Rw4y065ax3IUcMbcmlRtCNEeXtWAVgpsAsbE"
TOPIC_ABONNEMENTS = f"{NTFY_TOPIC or 'montres974-ut9qstgpdc'}-abonnements"
TRANCHES = [(0, 100), (100, 250), (250, 500), (500, 1000), (1000, 5000), (5000, None)]


def tranche_txt(mini, maxi):
    if not mini:
        return f"Moins de {maxi:,} €".replace(",", " ")
    if maxi is None:
        return f"Plus de {mini:,} €".replace(",", " ")
    return f"{mini:,} – {maxi:,} €".replace(",", " ")


def carte_produit(i, a, e):
    imgs = "".join(f'<img src="{e(src)}" alt="" loading="lazy">' for src in photos(a))
    nb = len(photos(a))
    tuile = f'<div class="defile">{imgs}</div>' if imgs else '<div class="sans-photo">Photo indisponible</div>'
    if nb > 1:
        tuile += f'<span class="compteur"><b>1</b>/{nb}</span>'
    if a.get("nouveau"):
        tuile += '<span class="badge">Nouveauté</span>'
    sous = " · ".join(x for x in ("Neuve" if a.get("neuf") else (a.get("etat") or "Occasion"), a.get("taille"),
                                   a.get("ville") if a["region"] == "La Réunion" else "") if x)
    cherche = " ".join(x for x in (a["titre"], a.get("marque"), a.get("taille"), a.get("description", "")[:400],
                                   a.get("ville"), a.get("region"), a.get("etat")) if x)
    return f"""
      <article class="produit" data-i="{i}" data-id="{e(a['id'])}" data-prix="{a['prix'] if a.get('prix') is not None else ''}" data-region="{e(a['region'])}"
        data-neuf="{'neuf' if a.get('neuf') else 'occasion'}" data-mouvement="{e(a.get('mouvement', ''))}" data-marque="{e(a.get('marque', ''))}" data-texte="{e(cherche)}">
        <div class="tuile">{tuile}<button class="like" aria-label="J'aime">{ICONE_COEUR}</button><button class="ajout" aria-label="Ajouter au panier">{ICONE_SAC}</button></div>
        <h3>{e(a['titre'])}</h3>
        <p class="sous">{e(sous)}</p>
        <p class="prix">{prix_txt(a, 'Prix sur demande')}</p>
        <a class="voir" href="{e(a['url'])}" target="_blank" rel="noopener">Voir sur {e(a['source'])} {ICONE_SORTIE}</a>
      </article>"""


def page_html(catalogue, maj):
    e = html.escape
    donnees = [{
        "titre": a["titre"], "prix": prix_txt(a, "Prix sur demande"), "lieu": a.get("ville") or "La Réunion",
        "region": a["region"], "source": a["source"], "description": a.get("description", ""),
        "photos": photos(a), "date": date_fr(a.get("date")), "vendeur": a.get("vendeur", ""), "etat": a.get("etat", ""),
        "marque": a.get("marque", ""), "taille": a.get("taille", ""), "neuf": bool(a.get("neuf")), "mouvement": a.get("mouvement", ""),
        "publie": ("Mise en ligne le " + date_fr(a["date"])) if a.get("date") else ("Repérée le " + date_fr(a.get("vue", ""))),
        "url": a["url"], "carte": carte_google(a), "embed": carte_embed(a), "id": a["id"], "p": a.get("prix"),
    } for a in catalogue]
    cartes = "".join(carte_produit(i, a, e) for i, a in enumerate(catalogue))
    marques = {}
    for a in catalogue:
        if a.get("marque"):
            marques[a["marque"]] = marques.get(a["marque"], 0) + 1
    liste_marques = "".join(
        f'<label class="ligne-choix" data-marque="{e(m)}"><input type="checkbox" name="marque" value="{e(m)}"><span>{e(m)}</span><small>{n}</small></label>'
        for m, n in sorted(marques.items(), key=lambda x: (-x[1], x[0])))
    tranches = "".join(
        f'<label class="ligne-choix"><input type="radio" name="tranche" value="{mini}-{maxi or ""}"><span>{tranche_txt(mini, maxi)}</span></label>'
        for mini, maxi in TRANCHES)
    json_donnees = json.dumps(donnees, ensure_ascii=False).replace("</", "<\\/")

    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Montres Réunion</title>
<meta name="description" content="Montres homme d'occasion à La Réunion et en métropole.">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Montres">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=3">
<link rel="icon" href="icon-192.png?v=3">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root{{--fond:#fff;--tuile:#f6f6f6;--champ:#f2f2f4;--encre:#1d1d1f;--doux:#6e6e73;--filet:#e8e8ed;--accent:#c8102e;--bouton:#1d1d1f;--sur-bouton:#fff;--verre:rgba(255,255,255,.84);--melange:multiply}}
@media (prefers-color-scheme:dark){{:root{{--fond:#000;--tuile:#161617;--champ:#1c1c1e;--encre:#f5f5f7;--doux:#86868b;--filet:#2c2c2e;--accent:#ff4d5e;--bouton:#f5f5f7;--sur-bouton:#000;--verre:rgba(0,0,0,.8);--melange:normal}}}}
*{{box-sizing:border-box;margin:0;padding:0}}
html{{-webkit-text-size-adjust:100%}}
body{{background:var(--fond);color:var(--encre);font:400 15px/1.5 Jost,"Futura","Avenir Next",system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:env(safe-area-inset-bottom)}}
button,input{{font:inherit;color:inherit;background:none;border:0}}
button{{cursor:pointer}}
svg{{fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}}
[hidden]{{display:none!important}}

/* Barre du haut */
.haut{{position:sticky;top:0;z-index:10;background:var(--verre);backdrop-filter:saturate(1.8) blur(20px);-webkit-backdrop-filter:saturate(1.8) blur(20px);
  border-bottom:1px solid var(--filet);padding-top:env(safe-area-inset-top)}}
.ligne-haut{{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 6px}}
.marque-site{{display:flex;align-items:center;font-size:15px;letter-spacing:.42em;margin-right:-.42em;line-height:1}}
.o-montre{{width:15px;height:28px;margin:0 .42em 0 0;overflow:visible}}
.o-montre .cuir{{fill:currentColor;opacity:.88}}
.o-montre .cadran{{fill:var(--fond);stroke:currentColor;stroke-width:1.5}}
.o-montre .point{{fill:currentColor;stroke:none}}
.o-montre .aiguilles{{stroke:currentColor;stroke-width:1.5;stroke-linecap:round}}
.icone{{width:44px;height:44px;display:grid;place-items:center;position:relative}}
.icone svg{{width:20px;height:20px}}
.droite{{display:flex}}
.pastille{{position:absolute;top:9px;right:8px;min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:var(--accent);color:#fff;font-size:10px;line-height:16px;font-weight:500}}
.like{{position:absolute;top:8px;right:8px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--verre);color:var(--encre)}}
.like svg{{width:17px;height:17px}}
.like.on svg,#f-like.on svg{{fill:var(--accent);stroke:var(--accent)}}
.ajout{{position:absolute;right:8px;bottom:8px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--verre);color:var(--encre);transition:background .2s,color .2s}}
.ajout svg{{width:17px;height:17px}}
.dans-panier .ajout{{background:var(--bouton);color:var(--sur-bouton)}}
.tuile .compteur{{right:auto;left:50%;transform:translateX(-50%)}}
.mvt-fiche{{display:inline-block;margin-top:12px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;border:1px solid var(--filet);border-radius:99px;padding:6px 14px}}
.duo{{display:flex;gap:10px}}
.duo .pill:first-child{{flex:1}}
.pill.rond{{width:50px;flex:none}}
#f-panier.on{{background:var(--bouton);color:var(--sur-bouton);border-color:var(--bouton)}}
dialog.menu{{margin:0 auto 0 0;height:100%;max-height:100%;width:min(86vw,360px);border-radius:0 22px 22px 0;padding-top:env(safe-area-inset-top)}}
dialog.menu[open]{{animation:glisseGauche .4s cubic-bezier(.2,.8,.2,1)}}
@keyframes glisseGauche{{from{{transform:translateX(-40px);opacity:0}}to{{transform:none;opacity:1}}}}
.liste-menu{{display:flex;flex-direction:column;padding:10px 12px calc(20px + env(safe-area-inset-bottom))}}
.liste-menu button{{display:flex;align-items:center;gap:14px;padding:16px 10px;border-bottom:1px solid var(--filet);font-size:15px;letter-spacing:.04em;text-align:left}}
.liste-menu button span{{flex:1}}
.liste-menu svg{{width:20px;height:20px}}
.liste-menu small{{color:var(--doux)}}
.aide{{color:var(--doux);font-size:14px;margin-bottom:14px}}
.champ.grand{{height:46px}}
.cote-carte{{border:1px solid var(--filet);border-radius:18px;padding:18px;margin-top:16px}}
.cote-carte h5{{font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--doux)}}
.cote-carte .gros{{font-size:28px;font-weight:300;margin-top:6px}}
.cote-carte p{{font-size:13px;color:var(--doux);margin-top:4px}}
.total{{font-size:13px;letter-spacing:.14em;text-transform:uppercase;margin-top:8px}}
.tourne svg{{animation:tourne .9s linear infinite}}
@keyframes tourne{{to{{transform:rotate(360deg)}}}}
.recherche{{display:flex;align-items:center;gap:10px;padding:0 16px 12px}}
.champ{{flex:1;display:flex;align-items:center;gap:8px;background:var(--champ);border-radius:12px;padding:0 12px;height:40px}}
.champ svg{{width:17px;height:17px;color:var(--doux);flex:none}}
.champ input{{flex:1;min-width:0;height:100%;outline:none;font-size:16px}}
.champ input::placeholder{{color:var(--doux)}}
.annuler{{color:var(--accent);font-size:15px}}
.onglets{{display:flex;justify-content:center;gap:34px;margin-bottom:24px}}
.onglets button{{font-size:13px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--doux);padding:4px 0 10px;position:relative;transition:color .25s}}
.onglets button::after{{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--accent);transform:scaleX(0);transition:transform .3s}}
.onglets button[aria-selected=true]{{color:var(--accent)}}
.onglets button[aria-selected=true]::after{{transform:scaleX(1)}}
.puces{{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:0 16px 12px}}
.puces::-webkit-scrollbar{{display:none}}
.puce{{flex:none;display:flex;align-items:center;gap:4px;font-size:13px;border:1px solid var(--filet);border-radius:99px;padding:6px 10px 6px 14px;white-space:nowrap}}
.puce svg{{width:14px;height:14px}}
.puce.active{{background:var(--bouton);border-color:var(--bouton);color:var(--sur-bouton)}}

/* Intro */
.intro{{text-align:center;padding:38px 20px 26px}}
.intro h1{{font-size:clamp(26px,8vw,40px);font-weight:300;letter-spacing:.32em;margin-right:-.32em;text-transform:uppercase}}
.intro p{{color:var(--doux);margin-top:10px;font-size:14px}}
.compte{{font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin-top:14px;color:var(--doux)}}
.maj-date{{font-size:12px!important;margin-top:4px!important}}
.effacer{{color:var(--accent);font-size:13px;margin-top:10px;text-decoration:underline;text-underline-offset:3px}}
.activer{{display:inline-flex;align-items:center;gap:8px;margin-top:18px;font-size:14px;border:1px solid var(--filet);border-radius:99px;padding:8px 16px}}
.activer svg{{width:17px;height:17px}}

/* Grille */
.grille{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:34px 10px;padding:0 10px 56px;max-width:1200px;margin:0 auto}}
@media (min-width:760px){{.grille{{grid-template-columns:repeat(3,minmax(0,1fr));gap:48px 18px;padding:0 24px 72px}}}}
@media (min-width:1100px){{.grille{{grid-template-columns:repeat(4,minmax(0,1fr))}}}}
.produit{{text-align:center;cursor:pointer;animation:entre .7s cubic-bezier(.2,.7,.2,1) both}}
@keyframes entre{{from{{opacity:0;transform:translateY(12px)}}to{{opacity:1;transform:none}}}}
.tuile{{position:relative;aspect-ratio:4/5;background:var(--tuile);overflow:hidden}}
.defile{{display:flex;height:100%;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain}}
.defile::-webkit-scrollbar{{display:none}}
.defile img{{flex:none;width:100%;height:100%;object-fit:contain;scroll-snap-align:center;mix-blend-mode:var(--melange)}}
.sans-photo{{display:grid;place-items:center;height:100%;color:var(--doux);font-size:12px}}
.badge{{position:absolute;top:10px;left:10px;background:var(--fond);font-size:10px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;padding:6px 11px;border-radius:99px}}
.compteur{{position:absolute;bottom:10px;right:10px;font-size:11px;color:var(--doux);letter-spacing:.06em}}
.compteur b{{font-weight:500;color:var(--encre)}}
.produit h3{{font-size:13px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;line-height:1.45;margin:18px 6px 0;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}}
.sous{{font-size:13px;color:var(--doux);margin:6px 6px 0}}
.prix{{font-size:14px;font-weight:500;letter-spacing:.06em;margin-top:12px}}
.voir{{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding-bottom:4px;border-bottom:1px solid var(--filet);font-size:13px;letter-spacing:.06em;color:var(--doux)}}
.voir{{text-decoration:none;color:var(--encre)}}
.voir svg{{width:14px;height:14px}}
.vide{{grid-column:1/-1;text-align:center;color:var(--doux);padding:30px 0 60px}}
footer{{text-align:center;color:var(--doux);font-size:12px;padding:28px 20px 40px;border-top:1px solid var(--filet);line-height:1.8}}

/* Feuilles (fiche et filtres) */
dialog{{margin:auto auto 0;width:100%;max-width:640px;max-height:94vh;border:0;border-radius:22px 22px 0 0;background:var(--fond);color:var(--encre);overflow:auto;overscroll-behavior:contain}}
@media (min-width:700px){{dialog{{margin:auto;border-radius:22px}}}}
dialog[open]{{animation:monte .45s cubic-bezier(.2,.8,.2,1)}}
@keyframes monte{{from{{transform:translateY(40px);opacity:0}}to{{transform:none;opacity:1}}}}
dialog::backdrop{{background:rgba(0,0,0,.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}}
.galerie{{position:relative;background:var(--tuile)}}
.galerie .defile{{aspect-ratio:1}}
.galerie .compteur{{right:auto;left:50%;transform:translateX(-50%);bottom:14px}}
.fermer{{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--verre)}}
.fermer svg{{width:15px;height:15px;stroke-width:1.6}}
.fiche{{padding:30px 22px 34px;text-align:center}}
.fiche .lieu{{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--doux)}}
.fiche h2{{font-size:20px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;line-height:1.4;margin-top:10px}}
.fiche .prix{{font-size:18px;margin-top:10px}}
.actions{{display:flex;flex-direction:column;gap:10px;margin-top:24px}}
.pill{{display:flex;align-items:center;justify-content:center;gap:8px;height:50px;border-radius:99px;font-size:15px;letter-spacing:.04em;text-decoration:none;color:var(--encre);border:1px solid var(--filet);width:100%}}
.pill.plein{{background:var(--bouton);color:var(--sur-bouton);border-color:var(--bouton)}}
.pill svg{{width:17px;height:17px}}
.bloc{{text-align:left;margin-top:34px}}
.bloc h4{{font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--doux);margin-bottom:10px}}
.bloc p{{font-size:15px;line-height:1.7;white-space:pre-line}}
.infos div{{display:flex;justify-content:space-between;gap:16px;padding:13px 0;border-top:1px solid var(--filet);font-size:14px}}
.infos div:last-child{{border-bottom:1px solid var(--filet)}}
.infos dt{{color:var(--doux)}}
.infos dd{{text-align:right}}
.plan{{height:220px;border-radius:18px;overflow:hidden;background:var(--tuile)}}
.plan iframe{{width:100%;height:100%;border:0}}

.tete-filtres{{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--fond);border-bottom:1px solid var(--filet)}}
.tete-filtres h2{{font-size:13px;font-weight:500;letter-spacing:.16em;text-transform:uppercase}}
.tete-filtres button{{font-size:15px;color:var(--accent)}}
.section-filtre{{padding:22px 20px 4px}}
.section-filtre h4{{font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--doux);margin-bottom:6px}}
.ligne-choix{{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--filet);cursor:pointer;font-size:15px}}
.ligne-choix span{{flex:1}}
.ligne-choix small{{color:var(--doux);font-size:13px}}
.precision{{font-style:normal;color:var(--doux);font-size:13px}}
.ligne-choix input{{appearance:none;-webkit-appearance:none;width:20px;height:20px;border:1px solid var(--doux);border-radius:50%;display:grid;place-items:center;flex:none}}
.ligne-choix input[type=checkbox]{{border-radius:6px}}
.ligne-choix input:checked{{background:var(--bouton);border-color:var(--bouton)}}
.ligne-choix input:checked::after{{content:"";width:6px;height:10px;border:solid var(--sur-bouton);border-width:0 1.6px 1.6px 0;transform:translateY(-1px) rotate(45deg)}}
.bornes{{display:flex;align-items:center;gap:10px;margin-top:14px}}
.bornes label{{flex:1 1 0;min-width:0;display:flex;align-items:center;background:var(--champ);border-radius:12px;height:44px;padding:0 12px;gap:6px;color:var(--doux);font-size:14px}}
.bornes input{{flex:1;width:100%;min-width:0;outline:none;font-size:16px;color:var(--encre)}}
.pied-filtres{{position:sticky;bottom:0;padding:14px 20px calc(14px + env(safe-area-inset-bottom));background:var(--fond);border-top:1px solid var(--filet);margin-top:20px}}

.tirer{{position:fixed;top:calc(env(safe-area-inset-top) + 64px);left:50%;z-index:20;width:38px;height:38px;margin-left:-19px;border-radius:50%;display:grid;place-items:center;
  background:var(--fond);box-shadow:0 2px 12px rgba(0,0,0,.12);opacity:0;transform:translateY(-50px);pointer-events:none}}
.tirer svg{{width:17px;height:17px}}
@media (prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}}}
</style></head><body>
<div class="tirer" id="tirer" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg></div>
<header class="haut">
  <div class="ligne-haut">
    <button class="icone" id="ouvrir-menu" aria-label="Menu">{ICONE_MENU}<span class="pastille" id="pastille-menu" hidden></span></button>
    <button class="marque-site" id="accueil" aria-label="Montres, retour à l'accueil">M<svg class="o-montre" viewBox="0 0 24 44" aria-hidden="true"><path class="cuir" d="M7.6 4.5Q7.6 3 9 3h6q1.4 0 1.4 1.5L17 12.6H7Z"/><path class="cuir" d="M7 31.4h10l-.6 8.1Q16.4 41 15 41H9q-1.4 0-1.4-1.5Z"/><circle cx="12" cy="22" r="9.2" class="cadran"/><circle cx="12" cy="15.4" r=".8" class="point"/><circle cx="18.6" cy="22" r=".8" class="point"/><circle cx="5.4" cy="22" r=".8" class="point"/><path d="M12 22 8.2 19.8M12 22l4.6-3.4" class="aiguilles"/></svg>NTRES</button>
    <div class="droite"><button class="icone" id="loupe" aria-label="Rechercher">{ICONE_LOUPE}</button>
    <button class="icone" id="rafraichir" aria-label="Rafraîchir"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg></button></div>
  </div>
  <div class="recherche" id="barre-recherche" hidden>
    <label class="champ">{ICONE_LOUPE}<input id="q" type="search" placeholder="Marque, modèle, taille (ex. 42 mm)" autocomplete="off" enterkeyhint="search"></label>
    <button class="annuler" id="annuler">Annuler</button>
  </div>
  <nav class="onglets" role="tablist">
    <button role="tab" data-categorie="toutes" aria-selected="true">Toutes les montres</button>
    <button role="tab" data-categorie="omega" aria-selected="false">Omega</button>
  </nav>
  <div class="puces">
    <button class="puce active" data-section="lieu"><span id="p-lieu">La Réunion</span>{ICONE_CHEVRON}</button>
    <button class="puce" data-section="prix"><span id="p-prix">Prix</span>{ICONE_CHEVRON}</button>
    <button class="puce" data-section="mouvement"><span id="p-mouvement">Mouvement</span>{ICONE_CHEVRON}</button>
    <button class="puce" data-section="etat"><span id="p-etat">Neuf / occasion</span>{ICONE_CHEVRON}</button>
    <button class="puce" data-section="marque"><span id="p-marque">Marque</span>{ICONE_CHEVRON}</button>
    <button class="puce" data-section="tri"><span id="p-tri">Trier</span>{ICONE_CHEVRON}</button>
  </div>
</header>

<section class="intro">
  <h1 id="titre-onglet">La Réunion</h1>
  <p id="texte-onglet">Montres homme neuves et d'occasion, tous prix</p>
  <p class="compte"><span id="nb">{len(catalogue)}</span> montres</p>
  <p class="maj-date">{e(maj[:1].upper() + maj[1:])}</p>
  <button class="effacer" id="effacer" hidden>Revenir à l'accueil (La Réunion, moins de {PRIX_MAX}&nbsp;€)</button>
  <div><button class="activer" id="activer" hidden>{ICONE_CLOCHE}Activer les notifications</button></div>
</section>
<main class="grille" id="grille">{cartes}
  <p class="vide" id="vide" hidden>Aucune montre ne correspond à ces critères.</p>
</main>
<dialog id="menu" class="menu" aria-label="Menu">
  <div class="tete-filtres"><span></span><h2>Menu</h2><button id="menu-fermer">Fermer</button></div>
  <nav class="liste-menu">
    <button data-vue="likes">{ICONE_COEUR}<span>Mes likes</span><small id="n-likes">0</small></button>
    <button data-vue="panier">{ICONE_SAC}<span>Mon panier</span><small id="n-panier">0</small></button>
    <button data-action="recherche">{ICONE_LOUPE}<span>Rechercher</span></button>
    <button data-action="cote">{ICONE_COTE}<span>Cote des montres</span></button>
    <button data-action="accueil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4Z"/></svg><span>Accueil</span></button>
  </nav>
</dialog>

<dialog id="cote" aria-label="Cote des montres">
  <div class="tete-filtres"><span></span><h2>Cote des montres</h2><button id="cote-fermer">Fermer</button></div>
  <div class="section-filtre">
    <p class="aide">Tape un modèle ou une marque : l'appli calcule le prix moyen auquel il se vend, d'occasion et neuf, d'après toutes les annonces qu'elle connaît.</p>
    <label class="champ grand">{ICONE_LOUPE}<input id="cote-q" type="search" placeholder="ex. Seiko 5, Speedmaster, Casio A159" autocomplete="off"></label>
    <div id="cote-resultat"></div>
  </div>
</dialog>

<footer>La Réunion : ParuVendu, Cash Express, GEM Atelier Bijoux<br> Métropole : Ocarat, Histoire d'Or, Maty, Pagani Design, Cash Express, Collector Square<br>Montres connectées et de sport exclues<br>Recherche toutes les 2&nbsp;h · notification à 10&nbsp;h pour La Réunion à moins de {PRIX_MAX}&nbsp;€</footer>

<dialog id="filtres" aria-label="Filtres">
  <div class="tete-filtres"><button id="f-raz">Effacer</button><h2>Filtres</h2><button id="f-ok">OK</button></div>
  <div class="section-filtre" id="s-lieu"><h4>Lieu</h4>
    <label class="ligne-choix"><input type="radio" name="lieu" value="La Réunion" checked><span>La Réunion</span><small id="c-reunion"></small></label>
    <label class="ligne-choix"><input type="radio" name="lieu" value="Métropole"><span>Métropole</span><small id="c-metropole"></small></label>
    <label class="ligne-choix"><input type="radio" name="lieu" value="Europe"><span>Europe <em class="precision">(La Réunion + métropole)</em></span><small id="c-europe"></small></label>
    <label class="ligne-choix"><input type="radio" name="lieu" value="Tout"><span>Tout</span><small id="c-tout"></small></label>
  </div>
  <div class="section-filtre" id="s-prix"><h4>Prix</h4>
    <label class="ligne-choix"><input type="radio" name="tranche" value="-" checked><span>Tous les prix</span></label>
    {tranches}
    <div class="bornes"><label>De<input id="min" type="number" inputmode="numeric" placeholder="0">€</label><label>à<input id="max" type="number" inputmode="numeric" placeholder="∞">€</label></div>
  </div>
  <div class="section-filtre" id="s-mouvement"><h4>Mouvement</h4>
    <label class="ligne-choix"><input type="radio" name="mouvement" value="" checked><span>Tous</span><small id="c-mvt-"></small></label>
    <label class="ligne-choix"><input type="radio" name="mouvement" value="Automatique"><span>Automatique</span><small id="c-mvt-Automatique"></small></label>
    <label class="ligne-choix"><input type="radio" name="mouvement" value="Quartz"><span>Quartz <em class="precision">(à pile)</em></span><small id="c-mvt-Quartz"></small></label>
    <label class="ligne-choix"><input type="radio" name="mouvement" value="Mécanique"><span>Mécanique <em class="precision">(remontage manuel)</em></span><small id="c-mvt-Mécanique"></small></label>
    <label class="ligne-choix"><input type="radio" name="mouvement" value="Solaire"><span>Solaire</span><small id="c-mvt-Solaire"></small></label>
  </div>
  <div class="section-filtre" id="s-etat"><h4>Neuf ou occasion</h4>
    <label class="ligne-choix"><input type="radio" name="neuf" value="" checked><span>Neuves et d'occasion</span></label>
    <label class="ligne-choix"><input type="radio" name="neuf" value="neuf"><span>Neuves</span></label>
    <label class="ligne-choix"><input type="radio" name="neuf" value="occasion"><span>D'occasion</span></label>
  </div>
  <div class="section-filtre" id="s-marque"><h4>Marques disponibles <small id="nb-marques" class="precision"></small></h4>{liste_marques}</div>
  <div class="section-filtre" id="s-tri"><h4>Trier par</h4>
    <label class="ligne-choix"><input type="radio" name="tri" value="recent" checked><span>Plus récentes d'abord</span></label>
    <label class="ligne-choix"><input type="radio" name="tri" value="asc"><span>Prix croissant</span></label>
    <label class="ligne-choix"><input type="radio" name="tri" value="desc"><span>Prix décroissant</span></label>
  </div>
  <div class="pied-filtres"><button class="pill plein" id="f-voir">Afficher les montres</button></div>
</dialog>

<dialog id="fiche" aria-label="Détail de la montre">
  <div class="galerie"><div class="defile" id="f-photos"></div><span class="compteur" id="f-compteur"></span>
    <button class="fermer" id="f-fermer" aria-label="Fermer"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg></button></div>
  <div class="fiche">
    <p class="lieu" id="f-lieu"></p>
    <h2 id="f-titre"></h2>
    <p class="prix" id="f-prix"></p>
    <p class="mvt-fiche" id="f-mvt"></p>
    <div class="actions">
      <div class="duo"><button class="pill" id="f-panier">{ICONE_SAC}<span>Ajouter au panier</span></button>
        <button class="pill rond" id="f-like" aria-label="J'aime">{ICONE_COEUR}</button></div>
      <a class="pill plein" id="f-contact" target="_blank" rel="noopener">Contacter le vendeur</a>
      <a class="pill" id="f-maps" target="_blank" rel="noopener">{ICONE_PIN}Itinéraire</a>
    </div>
    <div class="bloc" id="f-bloc-carte"><h4>Localisation</h4><div class="plan"><iframe id="f-carte" loading="lazy" title="Carte"></iframe></div></div>
    <div class="bloc"><h4>Informations</h4><dl class="infos" id="f-infos"></dl></div>
    <div class="bloc" id="f-bloc-desc"><h4>Description</h4><p id="f-desc"></p></div>
  </div>
</dialog>

<script>
const montres = {json_donnees};
const $ = id => document.getElementById(id), fiche = $('fiche'), filtres = $('filtres'), grille = $('grille');
const norme = s => (s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/(\\d)\\s*mm\\b/g, '$1mm');
const produits = [...grille.querySelectorAll('.produit')];
produits.forEach(p => p.recherche = norme(p.dataset.texte));
const euros = n => n.toLocaleString('fr-FR') + ' €';

// État des filtres (mémorisé sur ce téléphone)
// J'aime et panier : gardés sur ce téléphone
const lire = k => {{ try {{ return new Set(JSON.parse(localStorage.getItem(k) || '[]')); }} catch (e) {{ return new Set(); }} }};
const garder = (k, v) => {{ try {{ localStorage.setItem(k, JSON.stringify([...v])); }} catch (e) {{}} }};
const likes = lire('likes'), panier = lire('panier');
const basculer = (ens, cle, id) => {{ ens.has(id) ? ens.delete(id) : ens.add(id); garder(cle, ens); appliquer(); }};

// Écran d'accueil : montres de La Réunion à moins de {PRIX_MAX} €, tous mouvements
const ACCUEIL = {{ q: '', categorie: 'toutes', min: null, max: {PRIX_MAX}, region: 'La Réunion', neuf: '', mouvement: '', marques: [], tri: 'recent', vue: null }};
let etat = {{ ...ACCUEIL }};
if (!['La Réunion', 'Métropole', 'Europe', 'Tout'].includes(etat.region)) etat.region = 'La Réunion';
if (!['toutes', 'omega'].includes(etat.categorie)) etat.categorie = 'toutes';
const dansLieu = (p, r) => r === 'Europe' || r === 'Tout' || p.dataset.region === r;  // Europe = La Réunion + métropole
if (!['', 'neuf', 'occasion'].includes(etat.neuf)) etat.neuf = '';

function appliquer() {{
  const mots = norme(etat.q).split(/\\s+/).filter(Boolean);
  // Toutes les montres qui passent les filtres, sauf le lieu (pour compter par lieu)
  const omega = etat.categorie === 'omega';
  const filtrer = (avecMarques, avecMouvement = true) => produits.filter(p => {{
    if (etat.vue) return (etat.vue === 'likes' ? likes : panier).has(p.dataset.id);
    if (omega && p.dataset.marque !== 'Omega') return false;
    const prix = p.dataset.prix === '' ? null : +p.dataset.prix;
    if (etat.min != null && (prix == null || prix < etat.min)) return false;
    if (etat.max != null && (prix == null || prix > etat.max)) return false;
    if (etat.neuf && p.dataset.neuf !== etat.neuf) return false;
    if (avecMouvement && etat.mouvement && p.dataset.mouvement !== etat.mouvement) return false;
    if (avecMarques && !omega && etat.marques.length && !etat.marques.includes(p.dataset.marque)) return false;
    return mots.every(m => p.recherche.includes(m));
  }});
  const tous = filtrer(true);
  const compte = r => tous.filter(p => dansLieu(p, r)).length;
  const n = {{ 'La Réunion': compte('La Réunion'), 'Métropole': compte('Métropole'), 'Europe': compte('Europe'), 'Tout': compte('Tout') }};
  $('c-reunion').textContent = n['La Réunion']; $('c-metropole').textContent = n['Métropole'];
  $('c-europe').textContent = n['Europe']; $('c-tout').textContent = n['Tout'];
  // Marques disponibles dans le lieu choisi (avec les autres filtres), triées par nombre de montres
  const parMarque = {{}};
  filtrer(false).filter(p => dansLieu(p, etat.region)).forEach(p => {{ if (p.dataset.marque) parMarque[p.dataset.marque] = (parMarque[p.dataset.marque] || 0) + 1; }});
  const lignes = [...document.querySelectorAll('#s-marque .ligne-choix')];
  lignes.forEach(l => {{ const k = parMarque[l.dataset.marque] || 0; l.querySelector('small').textContent = k;
    l.hidden = !k && !etat.marques.includes(l.dataset.marque); }});
  lignes.sort((a, b) => (parMarque[b.dataset.marque] || 0) - (parMarque[a.dataset.marque] || 0)).forEach(l => $('s-marque').appendChild(l));
  $('nb-marques').textContent = `(${{Object.keys(parMarque).length}})`;
  $('s-marque').hidden = omega;
  let visibles = tous.filter(p => dansLieu(p, etat.region));
  // Nombre de montres par mouvement (dans le lieu choisi, avec les autres filtres)
  const sansMvt = filtrer(true, false).filter(p => dansLieu(p, etat.region));
  ['', 'Automatique', 'Quartz', 'Mécanique', 'Solaire'].forEach(k => $('c-mvt-' + k).textContent = sansMvt.filter(p => !k || p.dataset.mouvement === k).length);
  if (etat.tri !== 'recent') visibles.sort((a, b) => ((+a.dataset.prix || 0) - (+b.dataset.prix || 0)) * (etat.tri === 'asc' ? 1 : -1));
  produits.forEach(p => p.hidden = true);
  visibles.forEach(p => {{ p.hidden = false; p.style.animation = 'none'; grille.insertBefore(p, $('vide')); }});
  if (etat.vue) visibles = tous;
  $('nb').textContent = visibles.length;
  $('vide').hidden = visibles.length > 0;
  // Étiquettes des puces
  const prixTxt = etat.min != null && etat.max != null ? `${{euros(etat.min)}} – ${{euros(etat.max)}}`
    : etat.max != null ? `Moins de ${{euros(etat.max)}}` : etat.min != null ? `Plus de ${{euros(etat.min)}}` : 'Prix';
  const puce = (id, txt, actif) => {{ $(id).textContent = txt; $(id).parentNode.classList.toggle('active', actif); }};
  puce('p-prix', prixTxt, prixTxt !== 'Prix');
  puce('p-mouvement', etat.mouvement || 'Mouvement', !!etat.mouvement);
  puce('p-etat', {{ '': 'Neuf / occasion', neuf: 'Neuves', occasion: "D'occasion" }}[etat.neuf], !!etat.neuf);
  puce('p-lieu', `${{etat.region}} · ${{n[etat.region]}}`, true);
  document.querySelectorAll('[data-categorie]').forEach(b => b.setAttribute('aria-selected', b.dataset.categorie === etat.categorie));
  $('p-marque').parentNode.hidden = omega;
  $('titre-onglet').textContent = etat.vue === 'likes' ? 'Mes likes' : etat.vue === 'panier' ? 'Mon panier' : omega ? 'Omega' : etat.region;
  document.querySelector('.puces').hidden = !!etat.vue; document.querySelector('.onglets').hidden = !!etat.vue;
  $('texte-onglet').textContent = omega ? `Toutes les Omega homme en vente · ${{etat.region === 'Tout' ? 'partout' : etat.region}}` : {{
    'La Réunion': "Montres homme neuves et d'occasion",
    'Métropole': "Montres homme neuves et d'occasion",
    'Europe': "La Réunion et la métropole réunies, toutes marques",
    'Tout': "Toutes les montres de l'appli" }}[etat.region];
  if (etat.vue === 'likes') $('texte-onglet').textContent = 'Les montres que tu as aimées';
  if (etat.vue === 'panier') {{
    const total = montres.filter(m => panier.has(m.id) && m.p != null).reduce((t, m) => t + m.p, 0);
    $('texte-onglet').textContent = `Total : ${{total.toLocaleString('fr-FR', {{ maximumFractionDigits: 2 }})}} €`;
  }}
  produits.forEach(p => {{ p.querySelector('.like').classList.toggle('on', likes.has(p.dataset.id)); p.classList.toggle('dans-panier', panier.has(p.dataset.id));
    p.querySelector('.ajout').setAttribute('aria-label', panier.has(p.dataset.id) ? 'Retirer du panier' : 'Ajouter au panier'); }});
  $('n-likes').textContent = likes.size; $('n-panier').textContent = panier.size;
  $('pastille-menu').hidden = !panier.size; $('pastille-menu').textContent = panier.size;
  $('effacer').hidden = $('effacer').hidden && !etat.vue;
  puce('p-marque', etat.marques.length === 1 ? etat.marques[0] : etat.marques.length ? etat.marques.length + ' marques' : 'Marque', etat.marques.length > 0);
  puce('p-tri', {{ recent: 'Plus récentes', asc: 'Prix croissant', desc: 'Prix décroissant' }}[etat.tri], etat.tri !== 'recent');
  $('effacer').hidden = JSON.stringify({{ ...etat, q: '' }}) === JSON.stringify(ACCUEIL) && !etat.q;
  $('f-voir').textContent = `Afficher ${{visibles.length}} montre${{visibles.length > 1 ? 's' : ''}}`;
}}

// Le mot MONTRES : retour à l'écran d'accueil, sans aucun filtre
$('accueil').addEventListener('click', () => {{
  $('q').value = ''; $('barre-recherche').hidden = true;
  etat = {{ ...ACCUEIL, vue: null }};
  remplirFeuille(); appliquer(); scrollTo({{ top: 0, behavior: 'smooth' }});
}});

// Recherche (loupe)
$('loupe').addEventListener('click', () => {{ $('barre-recherche').hidden = false; $('q').focus(); }});
$('q').addEventListener('input', () => {{ etat.q = $('q').value; appliquer(); }});
$('q').addEventListener('keydown', ev => {{ if (ev.key === 'Enter') $('q').blur(); }});
$('annuler').addEventListener('click', () => {{ $('q').value = ''; etat.q = ''; $('barre-recherche').hidden = true; appliquer(); }});

// Feuille des filtres
const lireFeuille = () => {{
  const num = v => v === '' || v == null ? null : Math.max(0, +v);
  etat.min = num($('min').value); etat.max = num($('max').value);
  etat.neuf = filtres.querySelector('[name=neuf]:checked').value;
  etat.mouvement = filtres.querySelector('[name=mouvement]:checked').value;
  etat.region = filtres.querySelector('[name=lieu]:checked').value;
  etat.marques = [...filtres.querySelectorAll('[name=marque]:checked')].map(x => x.value);
  etat.tri = filtres.querySelector('[name=tri]:checked').value;
  appliquer();
}};
const remplirFeuille = () => {{
  $('min').value = etat.min ?? ''; $('max').value = etat.max ?? '';
  const tr = `${{etat.min ?? ''}}-${{etat.max ?? ''}}`.replace(/^0-/, '0-');
  filtres.querySelectorAll('[name=tranche]').forEach(x => x.checked = x.value === tr || (x.value === '-' && tr === '-'));
  filtres.querySelectorAll('[name=neuf]').forEach(x => x.checked = x.value === etat.neuf);
  filtres.querySelectorAll('[name=mouvement]').forEach(x => x.checked = x.value === etat.mouvement);
  filtres.querySelectorAll('[name=lieu]').forEach(x => x.checked = x.value === etat.region);
  filtres.querySelectorAll('[name=marque]').forEach(x => x.checked = etat.marques.includes(x.value));
  filtres.querySelectorAll('[name=tri]').forEach(x => x.checked = x.value === etat.tri);
}};
document.querySelectorAll('.puce').forEach(b => b.addEventListener('click', () => {{
  remplirFeuille(); filtres.showModal();
  $('s-' + b.dataset.section).scrollIntoView({{ block: 'start' }}); filtres.scrollTop = Math.max(0, filtres.scrollTop - 60);
}}));
filtres.querySelectorAll('[name=tranche]').forEach(x => x.addEventListener('change', () => {{
  const [mi, ma] = x.value.split('-'); $('min').value = mi === '0' ? '' : mi; $('max').value = ma; lireFeuille();
}}));
['min', 'max'].forEach(id => $(id).addEventListener('input', () => {{
  filtres.querySelectorAll('[name=tranche]').forEach(x => x.checked = false); lireFeuille();
}}));
filtres.addEventListener('change', ev => {{ if (ev.target.name !== 'tranche') lireFeuille(); }});
const raz = () => {{ etat = {{ ...ACCUEIL, q: etat.q, categorie: etat.categorie }}; remplirFeuille(); appliquer(); }};
document.querySelectorAll('[data-categorie]').forEach(b => b.addEventListener('click', () => {{
  etat.categorie = b.dataset.categorie; etat.vue = null;
  if (etat.categorie === 'omega' && etat.max === ACCUEIL.max && etat.min == null) etat.max = null;
  appliquer(); scrollTo(0, 0);
}}));
$('f-raz').addEventListener('click', raz);
$('effacer').addEventListener('click', () => {{ $('accueil').click(); }});
['f-ok', 'f-voir'].forEach(id => $(id).addEventListener('click', () => {{ filtres.close(); scrollTo(0, 0); }}));
filtres.addEventListener('click', ev => {{ if (ev.target === filtres) filtres.close(); }});

// Compteurs de photos
const compter = (defile, compteur) => {{
  const b = compteur && compteur.querySelector('b'); if (!b) return;
  defile.addEventListener('scroll', () => b.textContent = Math.round(defile.scrollLeft / defile.clientWidth) + 1, {{ passive: true }});
}};
document.querySelectorAll('.tuile').forEach(t => {{ const d = t.querySelector('.defile'); if (d) compter(d, t.querySelector('.compteur')); }});

// Fiche détaillée
grille.addEventListener('click', ev => {{
  if (ev.target.closest('a')) return;  // lien « Voir sur … » : on laisse ouvrir le site
  const coeur = ev.target.closest('.like');
  if (coeur) {{ basculer(likes, 'likes', coeur.closest('.produit').dataset.id); return; }}
  const sac = ev.target.closest('.ajout');
  if (sac) {{ basculer(panier, 'panier', sac.closest('.produit').dataset.id); return; }}
  const p = ev.target.closest('.produit'); if (!p) return;
  const m = montres[p.dataset.i], ph = m.photos.length ? m.photos : ['icon-512.png'];
  $('f-photos').replaceChildren(...ph.map(src => Object.assign(document.createElement('img'), {{ src, alt: '' }})));
  $('f-photos').scrollLeft = 0;
  $('f-compteur').innerHTML = ph.length > 1 ? `<b>1</b>/${{ph.length}}` : '';
  $('f-lieu').textContent = (m.neuf ? 'Neuve' : 'Occasion') + ' · ' + (m.region === 'La Réunion' ? m.lieu : m.lieu + ' · ' + m.region);
  $('f-titre').textContent = m.titre; $('f-prix').textContent = m.prix;
  $('f-desc').textContent = m.description; $('f-bloc-desc').hidden = !m.description;
  $('f-infos').replaceChildren(...[['Marque', m.marque], ['Mouvement', m.mouvement], ['Taille', m.taille], ['État', m.etat], ['Vendeur', m.vendeur],
      ['État', m.neuf ? 'Neuve' : ''], ['Lieu', m.lieu + ', ' + m.region], ['Date', m.publie], ['Site', m.source]]
    .filter(([, v]) => v).map(([k, v]) => {{
      const d = document.createElement('div'); d.innerHTML = '<dt></dt><dd></dd>';
      d.children[0].textContent = k; d.children[1].textContent = v; return d; }}));
  $('f-carte').src = m.embed || 'about:blank'; $('f-bloc-carte').hidden = !m.embed;
  $('f-maps').hidden = !m.carte; $('f-maps').href = m.carte || '#';
  $('f-contact').href = m.url;
  $('f-contact').textContent = m.source === 'ParuVendu' ? "Voir l'annonce et contacter le vendeur" : `Voir sur ${{m.source}}`;
  $('f-mvt').textContent = m.mouvement ? 'Mouvement ' + m.mouvement.toLowerCase() : 'Mouvement non précisé par le vendeur';
  majFiche = () => {{
    $('f-like').classList.toggle('on', likes.has(m.id));
    $('f-panier').classList.toggle('on', panier.has(m.id));
    $('f-panier').querySelector('span').textContent = panier.has(m.id) ? 'Retirer du panier' : 'Ajouter au panier';
  }};
  ficheId = m.id; majFiche();
  fiche.showModal(); fiche.scrollTop = 0;
}});
compter($('f-photos'), $('f-compteur'));
let ficheId = null, majFiche = () => {{}};
$('f-like').addEventListener('click', () => {{ basculer(likes, 'likes', ficheId); majFiche(); }});
$('f-panier').addEventListener('click', () => {{ basculer(panier, 'panier', ficheId); majFiche(); }});
$('f-fermer').addEventListener('click', () => fiche.close());

// Menu (trois traits)
const menu = $('menu');
$('ouvrir-menu').addEventListener('click', () => menu.showModal());
$('menu-fermer').addEventListener('click', () => menu.close());
menu.addEventListener('click', ev => {{
  if (ev.target === menu) return menu.close();
  const b = ev.target.closest('button'); if (!b || !b.closest('.liste-menu')) return;
  menu.close();
  if (b.dataset.vue) {{ etat.vue = b.dataset.vue; appliquer(); scrollTo(0, 0); }}
  else if (b.dataset.action === 'recherche') {{ etat.vue = null; appliquer(); $('loupe').click(); }}
  else if (b.dataset.action === 'cote') {{ $('cote').showModal(); $('cote-q').focus(); }}
  else $('accueil').click();
}});

// Cote : prix moyen d'un modèle d'après toutes les annonces connues
const cote = $('cote');
$('cote-fermer').addEventListener('click', () => cote.close());
cote.addEventListener('click', ev => {{ if (ev.target === cote) cote.close(); }});
const fmt = n => n.toLocaleString('fr-FR', {{ maximumFractionDigits: 0 }}) + ' €';
$('cote-q').addEventListener('input', () => {{
  const mots = norme($('cote-q').value).split(/\\s+/).filter(Boolean);
  const zone = $('cote-resultat');
  if (!mots.length) return zone.replaceChildren();
  const trouves = montres.filter(m => m.p != null && mots.every(w => norme(m.titre + ' ' + m.marque).includes(w)));
  const bloc = (titre, liste) => {{
    if (!liste.length) return `<div class="cote-carte"><h5>${{titre}}</h5><p>Aucune annonce pour ce modèle.</p></div>`;
    const prix = liste.map(m => m.p).sort((a, b) => a - b);
    const moy = prix.reduce((a, b) => a + b, 0) / prix.length, med = prix[Math.floor(prix.length / 2)];
    return `<div class="cote-carte"><h5>${{titre}}</h5><div class="gros">${{fmt(moy)}}</div>
      <p>prix moyen sur ${{prix.length}} annonce${{prix.length > 1 ? 's' : ''}} · médian ${{fmt(med)}}</p>
      <p>de ${{fmt(prix[0])}} à ${{fmt(prix[prix.length - 1])}}</p></div>`;
  }};
  zone.innerHTML = bloc("Se revend d'occasion", trouves.filter(m => !m.neuf)) + bloc('Prix neuf en boutique', trouves.filter(m => m.neuf))
    + `<p class="aide" style="margin-top:14px">Calculé sur les annonces présentes dans l'appli. Plus il y a d'annonces, plus la cote est fiable.</p>`;
}});
fiche.addEventListener('click', ev => {{ if (ev.target === fiche) fiche.close(); }});
fiche.addEventListener('close', () => {{ $('f-carte').src = 'about:blank'; }});

// Rafraîchir : bouton, ou tirer la page vers le bas depuis le haut
const recharger = () => {{ $('rafraichir').classList.add('tourne'); $('tirer').classList.add('tourne');
  location.replace(location.pathname + '?r=' + Date.now()); }};
$('rafraichir').addEventListener('click', recharger);
let depart = null, distance = 0;
addEventListener('touchstart', ev => {{ depart = scrollY <= 0 && !fiche.open && !filtres.open ? ev.touches[0].clientY : null; distance = 0; }}, {{ passive: true }});
addEventListener('touchmove', ev => {{
  if (depart === null) return;
  distance = Math.max(0, Math.min(140, ev.touches[0].clientY - depart));
  $('tirer').style.opacity = Math.min(1, distance / 90);
  $('tirer').style.transform = `translateY(${{distance * .5 - 50}}px) rotate(${{distance * 3}}deg)`;
}}, {{ passive: true }});
addEventListener('touchend', () => {{
  if (depart !== null && distance >= 90) recharger();
  else {{ $('tirer').style.opacity = 0; $('tirer').style.transform = ''; }}
  depart = null;
}});

// Notifications de l'appli (pastille sur l'icône de l'écran d'accueil)
const VAPID = '{VAPID_PUBLIQUE}';
const cle = b => Uint8Array.from(atob(b.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b.length % 4) % 4)), c => c.charCodeAt(0));
if ('serviceWorker' in navigator) {{
  navigator.serviceWorker.register('sw.js').then(async reg => {{
    if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {{}});
    const dejaAbonne = await reg.pushManager?.getSubscription();
    $('activer').hidden = !('PushManager' in window) || !!dejaAbonne;
    $('activer').onclick = async () => {{
      if (await Notification.requestPermission() !== 'granted') return;
      const abo = await reg.pushManager.subscribe({{ userVisibleOnly: true, applicationServerKey: cle(VAPID) }});
      await fetch('https://ntfy.sh/{TOPIC_ABONNEMENTS}', {{ method: 'POST', body: JSON.stringify(abo) }});
      $('activer').innerHTML = 'Notifications activées ✓'; setTimeout(() => $('activer').hidden = true, 2500);
    }};
  }}).catch(() => {{}});
}}

appliquer();
</script>
</body></html>"""


# ---------------------------------------------------------------- notification

NOTIFS_MAX = 10  # nombre maximum de montres envoyées une par une chaque matin


def envoyer(**message):
    """Publie une notification ntfy (format JSON : accents et € sans souci)."""
    requests.post("https://ntfy.sh/", json={"topic": NTFY_TOPIC, **message}, timeout=30)


ABONNEMENTS_FILE = ROOT / "data" / "abonnements.json"
VAPID_PRIVEE = os.environ.get("VAPID_PRIVATE_KEY", "")


def abonnements():
    """Téléphones abonnés aux notifications de l'appli : fichier + nouveaux abonnements déposés sur ntfy."""
    connus = json.loads(ABONNEMENTS_FILE.read_text()) if ABONNEMENTS_FILE.exists() else []
    try:
        r = requests.get(f"https://ntfy.sh/{TOPIC_ABONNEMENTS}/json?poll=1&since=all", timeout=30)
        for ligne in r.text.splitlines():
            try:
                abo = json.loads(json.loads(ligne).get("message", ""))
            except (ValueError, TypeError):
                continue
            if isinstance(abo, dict) and abo.get("endpoint", "").startswith("https://") and "keys" in abo:
                if all(c["endpoint"] != abo["endpoint"] for c in connus):
                    connus.append(abo)
    except Exception as exc:
        print(f"::warning::abonnements ntfy : {exc}")
    ABONNEMENTS_FILE.write_text(json.dumps(connus, indent=1))
    return connus


def pousser(abos, messages):
    """Envoie les notifications de l'appli (Web Push). Renvoie le nombre de téléphones atteints."""
    from pywebpush import webpush, WebPushException
    atteints, morts = 0, []
    for abo in abos:
        ok = False
        for m in messages:
            try:
                webpush(subscription_info=abo, data=json.dumps(m), vapid_private_key=VAPID_PRIVEE,
                        vapid_claims={"sub": "mailto:montres-reunion@users.noreply.github.com"}, ttl=86400)
                ok = True
            except WebPushException as exc:
                if exc.response is not None and exc.response.status_code in (404, 410):
                    morts.append(abo["endpoint"])  # téléphone désabonné
                    break
                print(f"::warning::web push : {exc}")
        atteints += ok
    if morts:
        ABONNEMENTS_FILE.write_text(json.dumps([a for a in abos if a["endpoint"] not in morts], indent=1))
    return atteints


def notifier(nb_total, nouvelles):
    titre = f"Montres homme · moins de {PRIX_MAX} €"
    abos = abonnements()
    if VAPID_PRIVEE and abos:
        if nouvelles:
            messages = [{"title": titre, "body": f"{len(nouvelles)} nouvelle(s) montre(s) ce matin, {nb_total} en vente.",
                         "url": PAGE_URL or "./", "badge": len(nouvelles), "tag": "resume"}]
            messages += [{"title": f"{prix_txt(a, 'Prix libre')} · {a['ville'] or 'La Réunion'}", "body": a["titre"],
                          "url": a["url"], "image": (photos(a) or [None])[0], "badge": len(nouvelles), "tag": a["id"]}
                         for a in nouvelles[:NOTIFS_MAX]]
        else:
            messages = [{"title": titre, "body": f"Pas de nouvelle montre ce matin. {nb_total} toujours en vente.",
                         "url": PAGE_URL or "./", "badge": 0, "tag": "resume"}]
        if pousser(abos, messages):
            return  # l'appli a reçu les notifications : pas besoin de ntfy en plus
    if not NTFY_TOPIC:
        print("NTFY_TOPIC non défini : pas de notification.")
        return
    lien = {"click": PAGE_URL} if PAGE_URL else {}
    if not nouvelles:
        envoyer(title=titre, tags=["watch"], priority=2, **lien,
                message=f"Pas de nouvelle montre ce matin. {nb_total} toujours en vente.")
        return
    reste = len(nouvelles) - NOTIFS_MAX
    envoyer(title=titre, tags=["watch"], **lien,
            message=f"{len(nouvelles)} nouvelle(s) montre(s) ce matin, {nb_total} en vente au total."
                    + (f" Les {NOTIFS_MAX} premières suivent, toutes sont dans l'appli." if reste > 0 else ""),
            **({"actions": [{"action": "view", "label": "Ouvrir l'appli", "url": PAGE_URL}]} if PAGE_URL else {}))
    # Une notification par montre : photo, bouton vendeur et bouton carte.
    for a in reversed(nouvelles[:NOTIFS_MAX]):  # la première arrive en dernier, donc en haut
        prix = prix_txt(a, "Prix libre")
        msg = {
            "title": f"{prix} · {a['ville'] or 'La Réunion'}",
            "message": a["titre"],
            "click": a["url"],
            "actions": [
                {"action": "view", "label": "Contacter le vendeur", "url": a["url"]},
                {"action": "view", "label": "Google Maps", "url": carte_google(a)},
            ],
        }
        if photos(a):
            msg["attach"] = photos(a)[0]
        envoyer(**msg)


# ---------------------------------------------------------------- main

def main():
    annonces, erreurs = [], []
    for source in SOURCES:
        try:
            annonces += source()
        except Exception as exc:  # une source en panne ne bloque pas les autres
            erreurs.append(f"{source.__name__}: {exc}")
            print(f"::error::{source.__name__}: {exc}")

    montres = [a for a in annonces if est_montre_homme(a["titre"], a["description"])]

    def collecter(sources):
        trouves = []
        for source in sources:
            try:
                trouves += source()
            except Exception as exc:  # un site en panne ne bloque pas les autres
                print(f"::error::{source.__name__}: {exc}")
        return trouves

    reunion_neuves = collecter(SOURCES_REUNION_NEUVES)
    omega = collecter(SOURCES_OMEGA)
    # Métropole : neuves et d'occasion, à tout prix (l'appli affiche d'abord celles à moins de PRIX_MAX)
    europe = [a for a in collecter(SOURCES_EUROPE)
              if a.get("prix") is not None and est_montre_homme(a["titre"], a["description"])]

    catalogue = {}
    for a in montres + reunion_neuves + omega + europe:
        cle = a["id"].replace("cef-", "ce-")  # même article Cash Express vu en magasin réunionnais et en national
        catalogue.setdefault(cle, a)
    catalogue = list(catalogue.values())
    completer_fiches(catalogue)
    catalogue = [enrichir(a) for a in catalogue]
    vus = set(json.loads(SEEN_FILE.read_text())) if SEEN_FILE.exists() else set()
    prefixes_connus = {v.split("-")[0] for v in vus}
    for a in catalogue:
        a.setdefault("region", "La Réunion")
        a.setdefault("neuf", False)
        # un site ajouté à l'appli ne déclenche pas une avalanche de « nouveautés » à son premier passage
        prefixe = a["id"].split("-")[0]
        a["nouveau"] = a["id"] not in vus and (prefixe not in SITES_AJOUTES or prefixe in prefixes_connus)
    # Classement par dernière mise en ligne : la plus récente en premier.
    # Les boutiques ne datent pas leurs produits : on retient le moment où l'appli les a vus pour la première fois.
    premiere_vue = json.loads(PREMIERE_VUE_FILE.read_text()) if PREMIERE_VUE_FILE.exists() else {}
    maintenant = datetime.now(REUNION).strftime("%Y-%m-%dT%H:%M")
    for a in catalogue:
        premiere_vue.setdefault(a["id"], maintenant)
        a["vue"] = premiere_vue[a["id"]]
        a["publie"] = a["date"] + "T00:00" if a.get("date") and a["date"] < a["vue"] else a["vue"]
    PREMIERE_VUE_FILE.write_text(json.dumps(premiere_vue, sort_keys=True))
    catalogue.sort(key=lambda a: a["publie"], reverse=True)  # à égalité, on garde l'ordre des sites
    # La notification de 10h ne concerne que La Réunion à moins de PRIX_MAX
    nouvelles = [a for a in catalogue if a["nouveau"] and a["region"] == "La Réunion"
                 and (a.get("prix") is None or a["prix"] <= PRIX_MAX)]
    nb_selection = sum(1 for a in catalogue if a["region"] == "La Réunion" and (a.get("prix") or 0) <= PRIX_MAX)

    maj = "mise à jour le " + datetime.now(REUNION).strftime("%d.%m à %Hh%M")
    OUT_FILE.parent.mkdir(exist_ok=True)
    OUT_FILE.write_text(page_html(catalogue, maj), encoding="utf-8")
    SEEN_FILE.parent.mkdir(exist_ok=True)
    if NOTIFIER:  # les montres restent « nouvelles » jusqu'à la notification de 10h
        SEEN_FILE.write_text(json.dumps(sorted(vus | {a["id"] for a in catalogue})))
    print(f"{len(annonces)} annonces récupérées, {len(catalogue)} montres au catalogue, {len(nouvelles)} nouvelles à notifier.")

    if erreurs and not annonces:
        if NTFY_TOPIC:
            envoyer(title="Montres Réunion : erreur", tags=["warning"],
                    message=("Recherche impossible aujourd'hui : " + "; ".join(erreurs))[:300])
        sys.exit(1)
    if NOTIFIER:
        notifier(nb_selection, nouvelles)


if __name__ == "__main__":
    main()
