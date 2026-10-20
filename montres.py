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

PRIX_MAX = int(os.environ.get("PRIX_MAX", "250"))
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "")
# Seule la recherche de 10h notifie ; celles de la journée mettent juste la page à jour.
NOTIFIER = os.environ.get("NOTIFIER", "true") == "true"
PAGE_URL = os.environ.get("PAGE_URL", "")
ROOT = Path(__file__).parent
SEEN_FILE = ROOT / "data" / "seen.json"
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
]
FEMME = ["femme", "femmme", "dame", "lady", "ladies", "woman", "women", "feminin"]
# Marques et modèles pour femme qui ne le disent pas dans le titre (vus chez Cash Express)
MODELES_FEMME = ["cluse", "madison", "parfois", "candy", "petite", "adeline", "fluette", "gracieuse", "camille", "minuit", "triomphe"]
MONTRE = ["montre", "watch", "chrono", "automatique", "seiko", "casio", "tissot",
          "citizen", "orient", "festina", "lip", "fossil", "hamilton", "timex",
          "swatch", "certina", "edox", "boss", "diesel", "lorus", "pulsar",
          "bulova", "invicta", "g-shock", "gshock", "rolex", "omega", "longines",
          "tag heuer", "mathey", "herbelin", "yema", "baltic", "vostok", "raketa"]


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
                if (a["prix"] is None or a["prix"] <= PRIX_MAX) and est_montre_homme(a["titre"], a["description"])]
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
            if a["prix"] <= PRIX_MAX and est_montre_homme(a["titre"]):
                montres.append(a)
    for a in montres:
        cashexpress_fiche(a)
        a.pop("magasin", None)
    return [a for a in montres if est_montre_homme(a["titre"], a["description"])]


SOURCES = [paruvendu, cashexpress]


# ---------------------------------------------------------------- page web

MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def date_fr(iso):
    if not iso:
        return ""
    a, m, j = iso[:10].split("-")
    return f"{int(j)} {MOIS[int(m) - 1]} {a}"


def carte_google(a):
    if a.get("lat") and a.get("lng"):
        q = f"{a['lat']},{a['lng']}"
    elif a.get("adresse"):
        q = a["adresse"]
    else:
        q = f"{a.get('ville') or ''} {a.get('cp') or ''}, La Réunion".strip()
    return f"https://www.google.com/maps/search/?api=1&query={quote(q)}"


def carte_embed(a):
    """Carte Google Maps intégrable (sans clé API)."""
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
ICONE_FLECHE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'


def carte_produit(i, a, e):
    imgs = "".join(f'<img src="{e(src)}" alt="" loading="lazy">' for src in photos(a))
    nb = len(photos(a))
    tuile = f'<div class="defile">{imgs}</div>' if imgs else '<div class="sans-photo">Photo indisponible</div>'
    if nb > 1:
        tuile += f'<span class="compteur"><b>1</b>/{nb}</span>'
    if a.get("nouveau"):
        tuile += '<span class="badge">Nouveauté</span>'
    lieu = a.get("ville") or "La Réunion"
    if a.get("categorie") == "omega":
        lieu += " · " + a.get("region", "")
    return f"""
      <article class="produit" data-i="{i}" data-prix="{a['prix'] if a.get('prix') is not None else 10**9}" data-region="{e(a.get('region', ''))}">
        <div class="tuile">{tuile}</div>
        <h3>{e(a['titre'])}</h3>
        <p class="sous">{e(lieu)}{(' · ' + e(a['etat'])) if a.get('etat') else ''}</p>
        <p class="prix">{prix_txt(a, 'Prix sur demande')}</p>
        <span class="voir">{ICONE_PIN}<span>Voir la montre</span></span>
      </article>"""


def page_html(selection, omega, maj):
    e = html.escape
    tout = selection + omega
    donnees = [{
        "titre": a["titre"], "prix": prix_txt(a, "Prix sur demande"), "lieu": a.get("ville") or "La Réunion",
        "region": a.get("region", "La Réunion"), "source": a["source"], "description": a.get("description", ""),
        "photos": photos(a), "date": date_fr(a.get("date")), "vendeur": a.get("vendeur", ""), "etat": a.get("etat", ""),
        "url": a["url"], "carte": carte_google(a), "embed": carte_embed(a),
    } for a in tout]
    cartes_sel = "".join(carte_produit(i, a, e) for i, a in enumerate(selection))
    cartes_om = "".join(carte_produit(len(selection) + i, a, e) for i, a in enumerate(omega))
    nb_reu = sum(1 for a in omega if a.get("region") == "La Réunion")

    def vide(txt):
        return f'<p class="vide">{txt}</p>'

    json_donnees = json.dumps(donnees, ensure_ascii=False).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Montres Réunion</title>
<meta name="description" content="Montres homme d'occasion à La Réunion et sélection Omega.">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Montres">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=2">
<link rel="icon" href="icon-192.png?v=2">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root{{--fond:#fff;--tuile:#f6f6f6;--encre:#1d1d1f;--doux:#6e6e73;--filet:#e8e8ed;--accent:#c8102e;--bouton:#1d1d1f;--sur-bouton:#fff;--verre:rgba(255,255,255,.82);--melange:multiply}}
@media (prefers-color-scheme:dark){{:root{{--fond:#000;--tuile:#161617;--encre:#f5f5f7;--doux:#86868b;--filet:#2c2c2e;--accent:#ff4d5e;--bouton:#f5f5f7;--sur-bouton:#000;--verre:rgba(0,0,0,.78);--melange:normal}}}}
*{{box-sizing:border-box;margin:0;padding:0}}
html{{-webkit-text-size-adjust:100%}}
body{{background:var(--fond);color:var(--encre);font:400 15px/1.5 Jost,"Futura","Avenir Next",system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:env(safe-area-inset-bottom)}}
button{{font:inherit;color:inherit;background:none;border:0;cursor:pointer}}
svg{{fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}}
.maj{{text-transform:uppercase;letter-spacing:.14em}}

/* Barre du haut */
.haut{{position:sticky;top:0;z-index:10;background:var(--verre);backdrop-filter:saturate(1.8) blur(20px);-webkit-backdrop-filter:saturate(1.8) blur(20px);
  border-bottom:1px solid var(--filet);padding-top:env(safe-area-inset-top)}}
.ligne-haut{{height:52px;display:flex;align-items:center;justify-content:center;position:relative}}
.marque{{font-size:15px;font-weight:400;letter-spacing:.42em;margin-right:-.42em}}
.rafraichir{{position:absolute;right:12px;width:40px;height:40px;display:grid;place-items:center;color:var(--encre)}}
.rafraichir svg{{width:19px;height:19px}}
.tourne svg{{animation:tourne .9s linear infinite}}
@keyframes tourne{{to{{transform:rotate(360deg)}}}}
.onglets{{display:flex;justify-content:center;gap:34px}}
.onglets button{{font-size:13px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--doux);padding:10px 0 12px;position:relative;transition:color .25s}}
.onglets button::after{{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--accent);transform:scaleX(0);transition:transform .3s}}
.onglets button[aria-selected=true]{{color:var(--accent)}}
.onglets button[aria-selected=true]::after{{transform:scaleX(1)}}

/* Sections */
section[hidden]{{display:none}}
.intro{{text-align:center;padding:44px 20px 26px}}
.intro h1{{font-size:clamp(26px,8vw,40px);font-weight:300;letter-spacing:.32em;margin-right:-.32em;text-transform:uppercase}}
.intro p{{color:var(--doux);margin-top:10px;font-size:14px}}
.intro .compte{{font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin-top:14px}}
.outils{{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:0 16px 22px}}
.outils button{{font-size:13px;color:var(--encre);border:1px solid var(--filet);border-radius:99px;padding:6px 13px;white-space:nowrap;transition:background .2s,border-color .2s,color .2s}}
.outils button[aria-pressed=true]{{background:var(--bouton);border-color:var(--bouton);color:var(--sur-bouton)}}
.separateur{{width:1px;background:var(--filet);margin:4px 4px}}

/* Grille 2 colonnes */
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
.badge{{position:absolute;top:10px;left:10px;background:var(--fond);color:var(--encre);font-size:10px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;padding:6px 11px;border-radius:99px}}
.compteur{{position:absolute;bottom:10px;right:10px;font-size:11px;color:var(--doux);letter-spacing:.06em}}
.compteur b{{font-weight:500;color:var(--encre)}}
.produit h3{{font-size:13px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;line-height:1.45;margin:18px 6px 0;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}}
.sous{{font-size:13px;color:var(--doux);margin:6px 6px 0;letter-spacing:.02em}}
.prix{{font-size:14px;font-weight:500;letter-spacing:.06em;margin-top:12px}}
.voir{{display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding-bottom:5px;border-bottom:1px solid var(--filet);font-size:14px;letter-spacing:.06em}}
.voir svg{{width:16px;height:16px}}
.vide{{grid-column:1/-1;text-align:center;color:var(--doux);padding:40px 0}}
footer{{text-align:center;color:var(--doux);font-size:12px;padding:28px 20px 40px;border-top:1px solid var(--filet);line-height:1.8}}

/* Fiche */
dialog{{margin:auto auto 0;width:100%;max-width:640px;max-height:96vh;border:0;border-radius:22px 22px 0 0;background:var(--fond);color:var(--encre);overflow:auto;overscroll-behavior:contain}}
@media (min-width:700px){{dialog{{margin:auto;border-radius:22px}}}}
dialog[open]{{animation:monte .45s cubic-bezier(.2,.8,.2,1)}}
@keyframes monte{{from{{transform:translateY(40px);opacity:0}}to{{transform:none;opacity:1}}}}
dialog::backdrop{{background:rgba(0,0,0,.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}}
.galerie{{position:relative;background:var(--tuile)}}
.galerie .defile{{aspect-ratio:1}}
.galerie .compteur{{bottom:14px;right:auto;left:50%;transform:translateX(-50%)}}
.fermer{{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--verre)}}
.fermer svg{{width:15px;height:15px;stroke-width:1.6}}
.fiche{{padding:30px 22px 34px;text-align:center}}
.fiche .lieu{{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--doux)}}
.fiche h2{{font-size:20px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;line-height:1.4;margin-top:10px}}
.fiche .prix{{font-size:18px;margin-top:10px}}
.actions{{display:flex;flex-direction:column;gap:10px;margin-top:24px}}
.pill{{display:flex;align-items:center;justify-content:center;gap:8px;height:50px;border-radius:99px;font-size:15px;letter-spacing:.04em;text-decoration:none;color:var(--encre);border:1px solid var(--filet)}}
.pill.plein{{background:var(--bouton);color:var(--sur-bouton);border-color:var(--bouton)}}
.pill svg{{width:17px;height:17px}}
.bloc{{text-align:left;margin-top:34px}}
.bloc h4{{font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--doux);margin-bottom:10px}}
.bloc p{{color:var(--encre);font-size:15px;line-height:1.7;white-space:pre-line}}
.infos div{{display:flex;justify-content:space-between;gap:16px;padding:13px 0;border-top:1px solid var(--filet);font-size:14px}}
.infos div:last-child{{border-bottom:1px solid var(--filet)}}
.infos dt{{color:var(--doux)}}
.infos dd{{text-align:right}}
.plan{{height:220px;border-radius:18px;overflow:hidden;background:var(--tuile)}}
.plan iframe{{width:100%;height:100%;border:0}}

.tirer{{position:fixed;top:calc(env(safe-area-inset-top) + 64px);left:50%;z-index:20;width:38px;height:38px;margin-left:-19px;border-radius:50%;display:grid;place-items:center;
  background:var(--fond);box-shadow:0 2px 12px rgba(0,0,0,.12);opacity:0;transform:translateY(-50px);pointer-events:none}}
.tirer svg{{width:17px;height:17px}}
@media (prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}}}
</style></head><body>
<div class="tirer" id="tirer" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg></div>
<header class="haut">
  <div class="ligne-haut"><span class="marque">MONTRES</span>
    <button class="rafraichir" id="rafraichir" aria-label="Rafraîchir"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg></button></div>
  <nav class="onglets" role="tablist">
    <button role="tab" aria-selected="true" data-onglet="selection">Sélection 974</button>
    <button role="tab" aria-selected="false" data-onglet="omega">Omega</button>
  </nav>
</header>

<section id="selection">
  <div class="intro"><h1>Sélection</h1><p>Montres homme d'occasion à La Réunion, moins de {PRIX_MAX}&nbsp;€</p>
    <p class="compte">{len(selection)} montres · {e(maj)}</p></div>
  <div class="outils" data-pour="selection">
    <button data-tri="recent" aria-pressed="true">Récentes</button><button data-tri="asc" aria-pressed="false">Prix croissant</button><button data-tri="desc" aria-pressed="false">Prix décroissant</button>
  </div>
  <div class="grille">{cartes_sel or vide("Aucune montre pour le moment. Prochaine recherche dans 2 heures.")}</div>
</section>

<section id="omega" hidden>
  <div class="intro"><h1>Omega</h1><p>Toutes les Omega homme en vente, à La Réunion et en métropole</p>
    <p class="compte">{len(omega)} montres · dont {nb_reu} à La Réunion</p></div>
  <div class="outils" data-pour="omega">
    <button data-region="" aria-pressed="true">Toutes</button><button data-region="La Réunion" aria-pressed="false">La Réunion</button><button data-region="Métropole" aria-pressed="false">Métropole</button>
    <span class="separateur"></span>
    <button data-tri="cycle" aria-pressed="false">Prix</button>
  </div>
  <div class="grille">{cartes_om or vide("Aucune Omega trouvée pour le moment.")}</div>
</section>

<footer>Sources : ParuVendu, Cash Express, Collector Square<br>Sélection 974 : hors montres connectées et de sport · recherche toutes les 2&nbsp;h, notification à 10&nbsp;h</footer>

<dialog id="fiche" aria-label="Détail de la montre">
  <div class="galerie"><div class="defile" id="f-photos"></div><span class="compteur" id="f-compteur"></span>
    <button class="fermer" id="f-fermer" aria-label="Fermer"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg></button></div>
  <div class="fiche">
    <p class="lieu" id="f-lieu"></p>
    <h2 id="f-titre"></h2>
    <p class="prix" id="f-prix"></p>
    <div class="actions">
      <a class="pill plein" id="f-contact" target="_blank" rel="noopener">Contacter le vendeur</a>
      <a class="pill" id="f-maps" target="_blank" rel="noopener">{ICONE_PIN}Itinéraire</a>
    </div>
    <div class="bloc"><h4>Localisation</h4><div class="plan"><iframe id="f-carte" loading="lazy" title="Carte"></iframe></div></div>
    <div class="bloc"><h4>Informations</h4><dl class="infos" id="f-infos"></dl></div>
    <div class="bloc" id="f-bloc-desc"><h4>Description</h4><p id="f-desc"></p></div>
  </div>
</dialog>

<script>
const montres = {json_donnees};
const $ = id => document.getElementById(id), fiche = $('fiche');

// Onglets (mémorisés dans l'adresse : #omega)
const ouvrirOnglet = nom => {{
  document.querySelectorAll('[data-onglet]').forEach(b => b.setAttribute('aria-selected', b.dataset.onglet === nom));
  document.querySelectorAll('main, section').forEach(s => s.hidden = s.id !== nom);
  history.replaceState(null, '', nom === 'omega' ? '#omega' : location.pathname + location.search);
}};
document.querySelectorAll('[data-onglet]').forEach(b => b.addEventListener('click', () => {{ ouvrirOnglet(b.dataset.onglet); scrollTo(0, 0); }}));
if (location.hash === '#omega') ouvrirOnglet('omega');

// Tri et filtre par région
document.querySelectorAll('.outils').forEach(outils => {{
  const grille = outils.nextElementSibling, ordre = [...grille.querySelectorAll('.produit')];
  let tri = 'recent', region = '';
  const appliquer = () => {{
    const liste = [...ordre];
    if (tri !== 'recent') liste.sort((a, b) => (a.dataset.prix - b.dataset.prix) * (tri === 'asc' ? 1 : -1));
    liste.forEach(p => {{ p.hidden = region && p.dataset.region !== region; p.style.animation = 'none'; grille.appendChild(p); }});
  }};
  outils.addEventListener('click', ev => {{
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.region !== undefined) {{
      region = b.dataset.region;
      outils.querySelectorAll('[data-region]').forEach(x => x.setAttribute('aria-pressed', x === b));
    }} else {{
      if (b.dataset.tri === 'cycle') {{  // Prix → Prix ↑ → Prix ↓ → Prix
        tri = {{ recent: 'asc', asc: 'desc', desc: 'recent' }}[tri];
        b.textContent = {{ recent: 'Prix', asc: 'Prix ↑', desc: 'Prix ↓' }}[tri];
        b.setAttribute('aria-pressed', tri !== 'recent');
      }} else {{
        tri = b.dataset.tri;
        outils.querySelectorAll('[data-tri]').forEach(x => x.setAttribute('aria-pressed', x.dataset.tri === tri));
      }}
    }}
    appliquer();
  }});
}});

// Compteurs de photos
const compter = (defile, compteur) => {{
  const b = compteur && compteur.querySelector('b'); if (!b) return;
  defile.addEventListener('scroll', () => b.textContent = Math.round(defile.scrollLeft / defile.clientWidth) + 1, {{ passive: true }});
}};
document.querySelectorAll('.tuile').forEach(t => {{ const d = t.querySelector('.defile'); if (d) compter(d, t.querySelector('.compteur')); }});

// Fiche détaillée
document.addEventListener('click', ev => {{
  const p = ev.target.closest('.produit'); if (!p) return;
  const m = montres[p.dataset.i], ph = m.photos.length ? m.photos : ['icon-512.png'];
  $('f-photos').replaceChildren(...ph.map(src => Object.assign(document.createElement('img'), {{ src, alt: '' }})));
  $('f-photos').scrollLeft = 0;
  $('f-compteur').innerHTML = ph.length > 1 ? `<b>1</b>/${{ph.length}}` : '';
  $('f-lieu').textContent = m.lieu + ' · ' + m.region;
  $('f-titre').textContent = m.titre; $('f-prix').textContent = m.prix;
  $('f-desc').textContent = m.description; $('f-bloc-desc').hidden = !m.description;
  $('f-infos').replaceChildren(...[['Vendeur', m.vendeur], ['État', m.etat], ['Lieu', m.lieu + ', ' + m.region], ['Mise à jour', m.date], ['Site', m.source]]
    .filter(([, v]) => v).map(([k, v]) => {{
      const d = document.createElement('div'); d.innerHTML = '<dt></dt><dd></dd>';
      d.children[0].textContent = k; d.children[1].textContent = v; return d; }}));
  $('f-carte').src = m.embed; $('f-contact').href = m.url; $('f-maps').href = m.carte;
  fiche.showModal(); fiche.scrollTop = 0;
}});
compter($('f-photos'), $('f-compteur'));
$('f-fermer').addEventListener('click', () => fiche.close());
fiche.addEventListener('click', ev => {{ if (ev.target === fiche) fiche.close(); }});
fiche.addEventListener('close', () => {{ $('f-carte').src = 'about:blank'; }});

// Rafraîchir : bouton, ou tirer la page vers le bas depuis le haut
const recharger = () => {{ $('rafraichir').classList.add('tourne'); $('tirer').classList.add('tourne');
  location.replace(location.pathname + '?r=' + Date.now() + location.hash); }};
$('rafraichir').addEventListener('click', recharger);
let depart = null, distance = 0;
addEventListener('touchstart', ev => {{ depart = scrollY <= 0 && !fiche.open ? ev.touches[0].clientY : null; distance = 0; }}, {{ passive: true }});
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
</script>
</body></html>"""


# ---------------------------------------------------------------- notification

NOTIFS_MAX = 10  # nombre maximum de montres envoyées une par une chaque matin


def envoyer(**message):
    """Publie une notification ntfy (format JSON : accents et € sans souci)."""
    requests.post("https://ntfy.sh/", json={"topic": NTFY_TOPIC, **message}, timeout=30)


def notifier(nb_total, nouvelles):
    if not NTFY_TOPIC:
        print("NTFY_TOPIC non défini : pas de notification.")
        return
    lien = {"click": PAGE_URL} if PAGE_URL else {}
    titre = f"Montres homme · moins de {PRIX_MAX} €"
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
    omega = []
    for source in SOURCES_OMEGA:
        try:
            omega += source()
        except Exception as exc:
            print(f"::error::{source.__name__}: {exc}")
    for a in montres:
        a["categorie"] = "selection"
    for a in omega:
        a["categorie"] = "omega"
    vus = set(json.loads(SEEN_FILE.read_text())) if SEEN_FILE.exists() else set()
    for a in montres + omega:
        a["nouveau"] = a["id"] not in vus
    omega.sort(key=lambda a: (a.get("region") != "La Réunion", a.get("prix") or 0))  # La Réunion d'abord
    montres.sort(key=lambda a: a.get("date", ""), reverse=True)  # plus récentes d'abord
    montres.sort(key=lambda a: not a["nouveau"])                 # puis nouvelles en tête
    nouvelles = [a for a in montres if a["nouveau"]]

    maj = "mise à jour le " + datetime.now(REUNION).strftime("%d.%m à %Hh%M")
    OUT_FILE.parent.mkdir(exist_ok=True)
    OUT_FILE.write_text(page_html(montres, omega, maj), encoding="utf-8")
    SEEN_FILE.parent.mkdir(exist_ok=True)
    if NOTIFIER:  # les montres restent « nouvelles » jusqu'à la notification de 10h
        SEEN_FILE.write_text(json.dumps(sorted(vus | {a["id"] for a in montres + omega})))
    print(f"{len(annonces)} annonces récupérées, {len(montres)} montres homme, {len(nouvelles)} nouvelles, {len(omega)} Omega.")
    for a in montres:
        print(f"::notice::{a['prix']} € | {a['titre']} | {a['ville']}")

    if erreurs and not annonces:
        if NTFY_TOPIC:
            envoyer(title="Montres Réunion : erreur", tags=["warning"],
                    message=("Recherche impossible aujourd'hui : " + "; ".join(erreurs))[:300])
        sys.exit(1)
    if NOTIFIER:
        notifier(len(montres), nouvelles)


if __name__ == "__main__":
    main()
