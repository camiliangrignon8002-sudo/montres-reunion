"""Montres homme à La Réunion (< 250 €) : collecte, filtre, page web et notification.

Lancé chaque matin à 10h (heure de La Réunion) par GitHub Actions (.github/workflows/montres.yml).
"""

import html
import json
import os
import re
import sys
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
    if contient(t, FEMME) and "homme" not in t and "mixte" not in t:
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
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
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


MAGASINS_CASH_EXPRESS = {
    "saint-pierre": ("Saint-Pierre", "97410"),
    "sainte-clotilde": ("Sainte-Clotilde", "97490"),
}


def cashexpress():
    """Montres de marque d'occasion des magasins Cash Express de La Réunion (robots autorisés)."""
    montres = []
    for slug, (ville, cp) in MAGASINS_CASH_EXPRESS.items():
        r = requests.get(f"https://www.cashexpress.fr/c-19/magasin/{slug}/montres-marques", timeout=30, **IMPERSONATE)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code} ({slug})")
        for c in re.split(r'<a class="product-card" ', r.text)[1:]:
            lien = re.search(r'href="([^"]+)"', c)
            nom = re.search(r'__name">(.*?)</div>', c, re.S)
            prix = re.search(r'class="price">(.*?)</div>', c, re.S)
            if not (lien and nom and prix):
                continue
            marque = texte((re.search(r'__brand[^>]*>(.*?)</div>', c, re.S) or [None, ""])[1]).title()
            valeur = float(re.sub(r"[^\d,]", "", texte(prix.group(1))).replace(",", "."))
            image = re.search(r'<img src="([^"]+)"', c)
            a = {
                "id": "ce-" + lien.group(1).rstrip("/").split("/")[-2],
                "source": "Cash Express",
                "titre": f"{marque} – {texte(nom.group(1))}" if marque else texte(nom.group(1)),
                "description": "", "prix": int(valeur) if valeur.is_integer() else valeur,
                "url": lien.group(1), "ville": ville, "cp": cp, "lat": None, "lng": None,
                "adresse": f"Cash Express {ville}, La Réunion",
                "photos": ["https://www.cashexpress.fr" + image.group(1)] if image else [],
                "date": "", "etat": "", "vendeur": f"Cash Express {ville} (magasin)",
            }
            if valeur <= PRIX_MAX and est_montre_homme(a["titre"]):
                montres.append(a)
    for a in montres:
        r = requests.get(a["url"], timeout=30, **IMPERSONATE)
        if r.status_code != 200:
            continue
        h = html.unescape(r.text)
        variation = re.search(r'"currentVariation":\{.*?"images":\{(.*?)\}\},"shop"', h, re.S)
        if variation:
            photos = [p.replace("\\/", "/") for p in re.findall(r'"src":"([^"]+)"', variation.group(1))]
            a["photos"] = ["https://www.cashexpress.fr" + p for p in photos] or a["photos"]
        corps = re.sub(r"\s+", " ", texte(re.sub(r"<(script|style|svg).*?</\1>", "", h, flags=re.S)))
        etat = re.search(r"État : (?:État )?(.{2,40}?) [\d ]+,\d\d ?€", corps)
        if etat:
            a["etat"] = etat.group(1).strip()[:1].upper() + etat.group(1).strip()[1:]
        desc = re.search(r"Ajouter au panier Description (.*?) Caractéristiques", corps)
        if desc:
            a["description"] = desc.group(1).strip()
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
    return f"{p} €" if isinstance(p, int) else f"{p:.2f} €".replace(".", ",")


def photos(a):
    return a.get("photos") or ([a["image"]] if a.get("image") else [])


def page_html(annonces, maj):
    e = html.escape
    donnees, cartes = [], []
    for i, a in enumerate(annonces):
        prix = prix_txt(a, "Prix sur demande")
        details = a.get("ville") or "La Réunion"
        donnees.append({
            "titre": a["titre"], "prix": prix, "details": details, "source": a["source"],
            "description": a.get("description", ""), "photos": photos(a), "date": date_fr(a.get("date")),
            "vendeur": a.get("vendeur", ""), "etat": a.get("etat", ""), "url": a["url"], "carte": carte_google(a), "embed": carte_embed(a),
        })
        imgs = "".join(f'<img src="{e(src)}" alt="" loading="lazy">' for src in photos(a))
        nb = len(photos(a))
        visuel = (f'<span class="defile-carte">{imgs}</span>' if imgs else '<span class="sans-photo">Photo indisponible</span>')
        if nb > 1:
            visuel += f'<span class="nb-photos caps"><b>1</b> / {nb}</span>'
        cartes.append(f"""
    <article class="piece" style="--i:{min(i, 12)}" data-i="{i}" data-prix="{a['prix'] if a.get('prix') is not None else 99999}">
      <div class="ouvrir" role="button" tabindex="0" aria-label="Voir {e(a['titre'])}">
        <span class="visuel">{visuel}</span>
        <span class="legende">
          <span class="sur">{'<em>Nouveauté</em> · ' if a.get('nouveau') else ''}{e(a.get('ville') or 'La Réunion')}</span>
          <span class="nom">{e(a['titre'])}</span>
          <span class="prix">{prix}</span>
        </span>
      </div>
    </article>""")

    prix_connus = [a["prix"] for a in annonces if a.get("prix") is not None]
    resume = [f"{len(annonces)} pièce{'s' if len(annonces) > 1 else ''}"]
    if prix_connus:
        resume.append("dès " + prix_txt({"prix": min(prix_connus)}, ""))
    vide = f"""
    <div class="vide"><p class="vide-titre">La sélection est vide</p>
    <p>Aucune montre homme à moins de {PRIX_MAX} € pour le moment.<br>Prochaine recherche demain à 10h.</p></div>"""
    json_donnees = json.dumps(donnees, ensure_ascii=False).replace("</", "<\\/")

    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Montres Réunion</title>
<meta name="description" content="Sélection de montres homme d'occasion à La Réunion, moins de {PRIX_MAX} €.">
<meta name="theme-color" content="#f7f4ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0b0a" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Montres">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=2">
<link rel="icon" href="icon-192.png?v=2">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{{
  --fond:#f7f4ee;--voile:#efeae0;--encre:#121211;--doux:#7b766c;--filet:rgba(18,18,17,.12);--or:#a8844e;
  --verre:rgba(247,244,238,.86);--serif:"Cormorant Garamond","Times New Roman",serif;--sans:Inter,system-ui,-apple-system,sans-serif}}
@media (prefers-color-scheme:dark){{:root{{
  --fond:#0b0b0a;--voile:#151513;--encre:#eee8dc;--doux:#8e897f;--filet:rgba(238,232,220,.13);--or:#c8a66b;
  --verre:rgba(11,11,10,.84)}}}}
*{{box-sizing:border-box;margin:0;padding:0}}
html{{-webkit-text-size-adjust:100%}}
body{{background:var(--fond);color:var(--encre);font:400 14px/1.6 var(--sans);-webkit-font-smoothing:antialiased;min-height:100vh;
  padding-bottom:env(safe-area-inset-bottom)}}
button{{font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:inherit}}
img{{display:block}}
.caps{{font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;font-weight:500}}
.wrap{{max-width:1180px;margin:0 auto;padding:0 24px}}

/* En-tête */
header{{text-align:center;padding:calc(env(safe-area-inset-top) + 66px) 0 44px}}
.rafraichir{{position:absolute;top:calc(env(safe-area-inset-top) + 14px);right:16px;width:38px;height:38px;border-radius:50%;
  display:grid;place-items:center;color:var(--doux);border:1px solid var(--filet);transition:color .3s,border-color .3s}}
.rafraichir:active{{color:var(--encre);border-color:var(--encre)}}
.rafraichir svg{{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}}
.tourne svg{{animation:tourne .9s linear infinite}}
@keyframes tourne{{to{{transform:rotate(360deg)}}}}
.tirer{{position:fixed;top:calc(env(safe-area-inset-top) + 10px);left:50%;z-index:20;width:40px;height:40px;margin-left:-20px;border-radius:50%;
  display:grid;place-items:center;background:var(--fond);border:1px solid var(--filet);color:var(--or);opacity:0;transform:translateY(-60px);pointer-events:none}}
.tirer svg{{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round}}
header{{position:relative}}
.maison{{display:flex;align-items:center;justify-content:center;gap:14px;color:var(--doux)}}
.maison::before,.maison::after{{content:"";width:28px;height:1px;background:var(--filet)}}
h1{{font-family:var(--serif);font-weight:400;font-size:clamp(46px,13vw,84px);line-height:.95;letter-spacing:-.01em;margin-top:42px}}
h1 em{{display:block;font-style:italic;color:var(--or);font-size:.44em;margin-top:14px;letter-spacing:0}}
.resume{{margin-top:26px;color:var(--doux);display:flex;flex-wrap:wrap;justify-content:center;row-gap:6px}}
.resume span{{white-space:nowrap}}
.maj{{margin-top:8px;color:var(--doux);font-family:var(--serif);font-style:italic;font-size:16px}}
.resume span+span::before{{content:"";display:inline-block;width:3px;height:3px;border-radius:50%;background:var(--or);margin:0 12px;vertical-align:middle}}

/* Tri */
nav{{position:sticky;top:0;z-index:5;background:var(--verre);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);
  border-top:1px solid var(--filet);border-bottom:1px solid var(--filet);padding-top:env(safe-area-inset-top)}}
.tri{{display:flex;justify-content:center;gap:clamp(18px,6vw,34px);padding:0 16px}}
.tri button{{white-space:nowrap;letter-spacing:.18em;color:var(--doux);padding:16px 0 14px;border-bottom:1px solid transparent;transition:color .3s,border-color .3s}}
.tri button[aria-pressed=true]{{color:var(--encre);border-color:var(--encre)}}

/* Sélection */
main{{display:grid;gap:56px 28px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));padding:44px 0 72px}}
.piece{{animation:apparait 1s cubic-bezier(.2,.6,.2,1) both;animation-delay:calc(var(--i) * 90ms)}}
@keyframes apparait{{from{{opacity:0;transform:translateY(18px)}}to{{opacity:1;transform:none}}}}
.ouvrir{{display:block;width:100%}}
.ouvrir{{cursor:pointer}}
.visuel{{position:relative;display:block;aspect-ratio:4/5;background:var(--voile);overflow:hidden}}
.defile-carte{{display:flex;height:100%;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain}}
.defile-carte::-webkit-scrollbar{{display:none}}
.defile-carte img{{flex:none;width:100%;height:100%;object-fit:cover;scroll-snap-align:center}}
.nb-photos{{position:absolute;bottom:12px;right:12px;background:var(--verre);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:5px 10px;font-size:10px;letter-spacing:.18em}}
.nb-photos b{{font-weight:500}}
.sans-photo{{display:grid;place-items:center;height:100%;color:var(--doux);font-family:var(--serif);font-style:italic;font-size:18px}}
.legende{{display:flex;flex-direction:column;align-items:center;text-align:center;padding:22px 8px 0;gap:6px}}
.sur{{font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--doux)}}
.sur em{{font-style:normal;color:var(--or)}}
.nom{{font-family:var(--serif);font-size:25px;line-height:1.15;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}
.prix{{font-size:13px;letter-spacing:.08em;margin-top:2px}}

.vide{{grid-column:1/-1;text-align:center;padding:40px 16px 80px;color:var(--doux)}}
.vide-titre{{font-family:var(--serif);font-style:italic;font-size:30px;color:var(--encre);margin-bottom:10px}}
footer{{border-top:1px solid var(--filet);padding:28px 24px calc(36px + env(safe-area-inset-bottom));text-align:center;color:var(--doux)}}
footer p+p{{margin-top:8px;font-size:12px;letter-spacing:0;text-transform:none}}

/* Fiche */
dialog{{margin:auto auto 0;width:100%;max-width:620px;max-height:94vh;border:0;background:var(--fond);color:var(--encre);overflow:auto;overscroll-behavior:contain}}
@media (min-width:700px){{dialog{{margin:auto}}}}
dialog[open]{{animation:glisse .5s cubic-bezier(.2,.8,.2,1)}}
@keyframes glisse{{from{{transform:translateY(30px);opacity:0}}to{{transform:none;opacity:1}}}}
dialog::backdrop{{background:rgba(8,8,7,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}}
.galerie{{position:relative}}
.defile{{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;background:var(--voile)}}
.defile::-webkit-scrollbar{{display:none}}
.defile img{{flex:none;width:100%;aspect-ratio:4/5;object-fit:cover;scroll-snap-align:center}}
.compteur{{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:var(--verre);padding:5px 12px;font-size:10.5px;letter-spacing:.2em}}
.fermer{{position:absolute;top:calc(env(safe-area-inset-top) + 14px);right:14px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--verre)}}
.fermer svg{{width:16px;height:16px;stroke:currentColor;stroke-width:1.4;fill:none}}
.fiche{{padding:34px 26px 30px;text-align:center}}
.fiche h2{{font-family:var(--serif);font-weight:500;font-size:34px;line-height:1.1;margin:10px 0 8px}}
.fiche .prix-fiche{{font-family:var(--serif);font-size:24px;color:var(--or)}}
.filet{{width:36px;height:1px;background:var(--or);margin:26px auto}}
.fiche .desc{{color:var(--doux);font-size:15px;line-height:1.75;white-space:pre-line;text-align:left}}
.infos{{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--filet);margin-top:28px;text-align:left}}
.infos div{{padding:14px 0;border-bottom:1px solid var(--filet)}}
.infos div:nth-child(odd){{padding-right:12px}}
.infos dt{{color:var(--doux)}}
.infos dd{{font-family:var(--serif);font-size:18px;margin-top:2px}}
.plan{{margin-top:28px;height:200px;background:var(--voile);overflow:hidden}}
.plan iframe{{width:100%;height:100%;border:0;filter:grayscale(1) contrast(1.05)}}
@media (prefers-color-scheme:dark){{.plan iframe{{filter:grayscale(1) invert(.9) contrast(.9)}}}}
.boutons{{display:flex;flex-direction:column;gap:10px;margin-top:28px}}
.btn{{display:block;padding:17px;text-align:center;text-decoration:none;color:var(--encre);border:1px solid var(--encre);transition:background .3s,color .3s}}
.btn.plein{{background:var(--encre);color:var(--fond)}}
.btn:active{{opacity:.8}}
@media (prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}}}
</style></head><body>
<div class="tirer" id="tirer" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg></div>
<header><button class="rafraichir" id="rafraichir" aria-label="Rafraîchir"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg></button><div class="wrap">
  <p class="maison caps">Montres · La Réunion</p>
  <h1>La sélection<em>montres homme, moins de {PRIX_MAX}&nbsp;€</em></h1>
  <p class="resume caps">{''.join(f'<span>{e(x)}</span>' for x in resume)}</p>
  <p class="maj">{e(maj)}</p>
</div></header>
<nav><div class="tri" role="group" aria-label="Trier">
  <button class="caps" data-tri="nouveau" aria-pressed="true">Récentes</button>
  <button class="caps" data-tri="prix-asc" aria-pressed="false">Petits prix</button>
  <button class="caps" data-tri="prix-desc" aria-pressed="false">Grands prix</button>
</div></nav>
<main class="wrap" id="liste">{''.join(cartes) if annonces else vide}
</main>
<footer>
  <p class="caps">Montres homme · hors connectées et sport</p>
  <p>Annonces en ligne depuis 2024 · Sources : ParuVendu, Cash Express Saint-Pierre et Sainte-Clotilde · Recherche chaque jour à 10h</p>
</footer>

<dialog id="fiche" aria-label="Détail de la montre">
  <div class="galerie"><div class="defile" id="f-photos"></div><span class="compteur caps" id="f-compteur"></span>
    <button class="fermer" id="f-fermer" aria-label="Fermer"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg></button></div>
  <div class="fiche">
    <p class="caps" style="color:var(--doux)" id="f-details"></p>
    <h2 id="f-titre"></h2>
    <p class="prix-fiche" id="f-prix"></p>
    <div class="filet"></div>
    <p class="desc" id="f-desc"></p>
    <dl class="infos" id="f-infos"></dl>
    <div class="plan"><iframe id="f-carte" loading="lazy" title="Carte"></iframe></div>
    <div class="boutons">
      <a class="btn plein caps" id="f-contact" target="_blank" rel="noopener">Contacter le vendeur</a>
      <a class="btn caps" id="f-maps" target="_blank" rel="noopener">Ouvrir dans Google Maps</a>
    </div>
  </div>
</dialog>

<script>
const montres = {json_donnees};
const $ = id => document.getElementById(id), liste = $('liste'), fiche = $('fiche');
const ordre = [...liste.querySelectorAll('.piece')];

document.querySelectorAll('[data-tri]').forEach(b => b.addEventListener('click', () => {{
  document.querySelectorAll('[data-tri]').forEach(x => x.setAttribute('aria-pressed', x === b));
  const t = b.dataset.tri, pieces = [...ordre];
  if (t !== 'nouveau') pieces.sort((a, c) => (a.dataset.prix - c.dataset.prix) * (t === 'prix-asc' ? 1 : -1));
  pieces.forEach(p => {{ p.style.animation = 'none'; liste.appendChild(p); }});
}}));

liste.addEventListener('click', ev => {{
  const piece = ev.target.closest('.piece'); if (!piece) return;
  const m = montres[piece.dataset.i], photos = m.photos.length ? m.photos : ['icon-512.png'];
  $('f-photos').replaceChildren(...photos.map(src => Object.assign(document.createElement('img'), {{ src, alt: '' }})));
  $('f-photos').scrollLeft = 0;
  const compte = () => $('f-compteur').textContent = photos.length > 1
    ? `${{Math.round($('f-photos').scrollLeft / $('f-photos').clientWidth) + 1}} / ${{photos.length}}` : '';
  $('f-photos').onscroll = compte; compte();
  $('f-details').textContent = m.details; $('f-titre').textContent = m.titre; $('f-prix').textContent = m.prix;
  $('f-desc').textContent = m.description || 'Pas de description.';
  $('f-infos').replaceChildren(...[['État', m.etat], ['Vendeur', m.vendeur], ['Mise à jour', m.date], ['Source', m.source]]
    .filter(([, v]) => v).map(([k, v]) => {{
      const d = document.createElement('div');
      d.innerHTML = '<dt class="caps"></dt><dd></dd>'; d.children[0].textContent = k; d.children[1].textContent = v; return d; }}));
  $('f-carte').src = m.embed; $('f-contact').href = m.url; $('f-maps').href = m.carte;
  fiche.showModal(); fiche.scrollTop = 0;
}});
$('f-fermer').addEventListener('click', () => fiche.close());
fiche.addEventListener('click', ev => {{ if (ev.target === fiche) fiche.close(); }});
fiche.addEventListener('close', () => {{ $('f-carte').src = 'about:blank'; }});

// Compteur de photos sur chaque carte
document.querySelectorAll('.defile-carte').forEach(d => {{
  const nb = d.parentNode.querySelector('.nb-photos b'); if (!nb) return;
  d.addEventListener('scroll', () => nb.textContent = Math.round(d.scrollLeft / d.clientWidth) + 1, {{ passive: true }});
}});

// Rafraîchir : bouton, ou tirer la page vers le bas depuis le haut
const recharger = () => {{ $('rafraichir').classList.add('tourne'); $('tirer').classList.add('tourne');
  location.replace(location.pathname + '?r=' + Date.now()); }};
$('rafraichir').addEventListener('click', recharger);
let depart = null, distance = 0;
addEventListener('touchstart', ev => {{ depart = scrollY <= 0 && !fiche.open ? ev.touches[0].clientY : null; distance = 0; }}, {{ passive: true }});
addEventListener('touchmove', ev => {{
  if (depart === null) return;
  distance = Math.max(0, Math.min(140, ev.touches[0].clientY - depart));
  $('tirer').style.opacity = Math.min(1, distance / 90);
  $('tirer').style.transform = `translateY(${{distance * .6 - 60}}px) rotate(${{distance * 3}}deg)`;
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
    vus = set(json.loads(SEEN_FILE.read_text())) if SEEN_FILE.exists() else set()
    for a in montres:
        a["nouveau"] = a["id"] not in vus
    montres.sort(key=lambda a: a.get("date", ""), reverse=True)  # plus récentes d'abord
    montres.sort(key=lambda a: not a["nouveau"])                 # puis nouvelles en tête
    nouvelles = [a for a in montres if a["nouveau"]]

    maj = "Mise à jour le " + datetime.now(REUNION).strftime("%d.%m à %Hh%M")
    OUT_FILE.parent.mkdir(exist_ok=True)
    OUT_FILE.write_text(page_html(montres, maj), encoding="utf-8")
    SEEN_FILE.parent.mkdir(exist_ok=True)
    if NOTIFIER:  # les montres restent « nouvelles » jusqu'à la notification de 10h
        SEEN_FILE.write_text(json.dumps(sorted(vus | {a["id"] for a in montres})))
    print(f"{len(annonces)} annonces récupérées, {len(montres)} montres homme, {len(nouvelles)} nouvelles.")
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
