"""Produits Apple neufs, reconditionnés et d'occasion en vente à La Réunion.

Lit les sites d'iShop, Microstor, Phenix Store, Darty Réunion, les magasins Cash Express de l'île
et les annonces ParuVendu, range chaque produit par catégorie (iPhone, iPad, Mac…), relève ses
caractéristiques et le lieu où le trouver, puis écrit l'appli docs/apple/.
Lancé régulièrement par GitHub Actions (.github/workflows/apple.yml).
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
from urllib.parse import urljoin, urlparse

try:
    from curl_cffi import requests  # imite un vrai navigateur
    IMPERSONATE = {"impersonate": "chrome"}
except ImportError:  # pragma: no cover
    import requests
    IMPERSONATE = {}

ROOT = Path(__file__).parent
FICHES_FILE = ROOT / "data" / "apple_fiches.json"  # pages produit déjà lues (url -> infos)
VUS_FILE = ROOT / "data" / "apple_vus.json"        # id -> date où l'appli a vu le produit la 1re fois
OUT_DIR = ROOT / "docs" / "apple"
REUNION = timezone(timedelta(hours=4))
FICHES_PAR_PASSAGE = int(os.environ.get("FICHES_PAR_PASSAGE", "600"))  # nouvelles pages produit lues à chaque passage
FICHE_JOURS = 4  # une page produit est relue au bout de ce nombre de jours
VERSION_FICHE = 2  # à augmenter quand lire_fiche apprend à lire une nouvelle information

# ---------------------------------------------------------------- communes (centre approximatif)

COMMUNES = {
    "Saint-Denis": (-20.8823, 55.4504), "Sainte-Clotilde": (-20.8986, 55.4911), "Sainte-Marie": (-20.8969, 55.5495),
    "Duparc": (-20.9045, 55.5290), "Sainte-Suzanne": (-20.9064, 55.6070), "Saint-André": (-20.9633, 55.6503),
    "Bras-Panon": (-21.0016, 55.6773), "Saint-Benoît": (-21.0339, 55.7128), "La Plaine-des-Palmistes": (-21.1366, 55.6272),
    "Sainte-Rose": (-21.1273, 55.7963), "Saint-Philippe": (-21.3590, 55.7672), "Saint-Joseph": (-21.3779, 55.6192),
    "Petite-Île": (-21.3539, 55.5652), "Saint-Pierre": (-21.3393, 55.4781), "Le Tampon": (-21.2779, 55.5177),
    "La Plaine des Cafres": (-21.2140, 55.5730), "Entre-Deux": (-21.2470, 55.4720), "Saint-Louis": (-21.2862, 55.4114),
    "La Rivière": (-21.2600, 55.4400), "L'Étang-Salé": (-21.2650, 55.3664), "Les Avirons": (-21.2413, 55.3392),
    "Saint-Leu": (-21.1706, 55.2884), "Les Trois-Bassins": (-21.1050, 55.3010), "Saint-Paul": (-21.0096, 55.2707),
    "Saint-Gilles-les-Bains": (-21.0539, 55.2253), "L'Hermitage": (-21.0790, 55.2270), "La Saline": (-21.0870, 55.2440),
    "Savanna": (-20.9950, 55.2950), "Le Port": (-20.9373, 55.2919), "La Possession": (-20.9253, 55.3361),
    "Cilaos": (-21.1340, 55.4718), "Salazie": (-21.0272, 55.5390), "Le Chaudron": (-20.8960, 55.4990),
    "La Montagne": (-20.8930, 55.4220), "Le Moufia": (-20.9020, 55.4930), "Bois-de-Nèfles": (-20.9230, 55.4740),
    "Ravine des Cabris": (-21.2950, 55.4960), "Terre-Sainte": (-21.3460, 55.4880),
}
ALIAS_COMMUNES = {
    "st denis": "Saint-Denis", "ste clotilde": "Sainte-Clotilde", "ste marie": "Sainte-Marie", "ste suzanne": "Sainte-Suzanne",
    "st andre": "Saint-André", "st benoit": "Saint-Benoît", "st pierre": "Saint-Pierre", "tampon": "Le Tampon",
    "st louis": "Saint-Louis", "st leu": "Saint-Leu", "st paul": "Saint-Paul", "st gilles": "Saint-Gilles-les-Bains",
    "saint gilles": "Saint-Gilles-les-Bains", "saint gilles les bains": "Saint-Gilles-les-Bains", "ermitage": "L'Hermitage",
    "etang sale": "L'Étang-Salé", "port": "Le Port", "possession": "La Possession", "plaine des palmistes": "La Plaine-des-Palmistes",
    "st joseph": "Saint-Joseph", "st philippe": "Saint-Philippe", "ste rose": "Sainte-Rose", "petite ile": "Petite-Île",
    "trois bassins": "Les Trois-Bassins", "avirons": "Les Avirons", "riviere saint louis": "La Rivière", "chaudron": "Le Chaudron",
    "moufia": "Le Moufia", "savannah": "Savanna", "bois de nefles": "Bois-de-Nèfles", "plaine des cafres": "La Plaine des Cafres",
    "entre deux": "Entre-Deux", "duparc": "Duparc",
}
CP_COMMUNES = {
    "97400": "Saint-Denis", "97490": "Sainte-Clotilde", "97438": "Sainte-Marie", "97441": "Sainte-Suzanne", "97440": "Saint-André",
    "97412": "Bras-Panon", "97470": "Saint-Benoît", "97431": "La Plaine-des-Palmistes", "97439": "Sainte-Rose",
    "97442": "Saint-Philippe", "97480": "Saint-Joseph", "97429": "Petite-Île", "97410": "Saint-Pierre", "97432": "Saint-Pierre",
    "97430": "Le Tampon", "97418": "Le Tampon", "97414": "Entre-Deux", "97450": "Saint-Louis", "97421": "Saint-Louis",
    "97427": "L'Étang-Salé", "97425": "Les Avirons", "97436": "Saint-Leu", "97416": "Saint-Leu", "97426": "Les Trois-Bassins",
    "97460": "Saint-Paul", "97411": "Saint-Paul", "97422": "Saint-Paul", "97423": "Saint-Paul", "97434": "Saint-Gilles-les-Bains",
    "97435": "Saint-Paul", "97420": "Le Port", "97419": "La Possession", "97413": "Cilaos", "97433": "Salazie",
    "97437": "Saint-Benoît", "97424": "Saint-Louis", "97417": "Saint-Denis",
}


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def mots(s):
    return " " + re.sub(r"[^a-z0-9]+", " ", norm(s)).strip() + " "


def commune_de(*textes):
    """La commune réunionnaise citée (code postal ou nom), sinon ''."""
    for t in textes:
        cp = re.search(r"\b(974\d\d)\b", str(t or ""))
        if cp and cp.group(1) in CP_COMMUNES:
            return CP_COMMUNES[cp.group(1)]
    noms = {mots(c).strip(): c for c in COMMUNES}
    noms.update(ALIAS_COMMUNES)
    for t in textes:
        m = mots(t)
        for nom in sorted(noms, key=len, reverse=True):
            if f" {nom} " in m:
                return noms[nom]
    return ""


def lieu(nom, commune, adresse=""):
    lat, lng = COMMUNES.get(commune, (None, None))
    return {"nom": nom, "commune": commune, "adresse": adresse, "lat": lat, "lng": lng}


# ---------------------------------------------------------------- outils

def get(url, **kw):
    for essai in range(3):
        try:
            r = requests.get(url, timeout=40, **IMPERSONATE, **kw)
            if r.status_code == 200:
                return r
            print(f"  {r.status_code} {url}", file=sys.stderr)
            if r.status_code in (403, 404, 410):
                return None
        except Exception as e:  # réseau
            print(f"  erreur {url}: {e}", file=sys.stderr)
        time.sleep(3 * (essai + 1))
    return None


def texte(fragment):
    t = re.sub(r"<br\s*/?>|</p>|</li>|</div>|</h\d>", "\n", fragment or "", flags=re.I)
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", t, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"[ \t\xa0 ]+", " ", t)
    return re.sub(r"\s*\n\s*", "\n", t).strip()


def ligne(fragment):
    return re.sub(r"\s+", " ", texte(fragment)).strip()


def prix_de(txt):
    """« 1 329,99 € » -> 1329.99 ; « 24.00 » -> 24.0"""
    if isinstance(txt, (int, float)):
        return float(txt)
    t = html.unescape(str(txt or "")).replace("\xa0", " ").replace(" ", " ")
    m = re.search(r"\d[\d .]*(?:,\d{1,2})?|\d+\.\d{1,2}", t)
    if not m:
        return None
    s = m.group(0).strip().replace(" ", "")
    if re.fullmatch(r"\d+\.\d{1,2}", s):
        return float(s)
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def arrondi(p):
    if p is None:
        return None
    return int(p) if float(p).is_integer() else round(p, 2)


def ld_json(h):
    """Tous les objets schema.org de la page, à plat."""
    objets = []
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', h, re.S):
        try:
            d = json.loads(m.group(1).strip(), strict=False)
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


# ---------------------------------------------------------------- reconnaître un produit Apple

APPAREILS = [
    ("iphone", r"\biphone\b"),
    ("ipad", r"\bipad\b"),
    ("mac", r"\bmacbook\b|\bimac\b|\bmac ?mini\b|\bmac ?studio\b|\bmac ?pro\b|\bmac neo\b|^mac\b|\bapple mac\b"),
    ("watch", r"\bapple ?watch\b|\bwatch (?:series|ultra|se)\b|\biwatch\b"),
    ("airpods", r"\bairpods?\b|\bbeats\b"),
    ("maison", r"\bapple ?tv\b|\bhomepod\b|\bvision pro\b"),
]
ACCESSOIRE = (r"\bcoques?\b|\betuis?\b|\bhousses?\b|\bprotections?\b|\bverres? trempes?\b|\bfilms?\b|\bchargeurs?\b|"
              r"\bcables?\b|\badaptateurs?\b|\bbracelets?\b|\bboucle\b|\bsupports?\b|\bsocles?\b|\bstations?\b|\bbatteries? externes?\b|"
              r"\bpower ?bank\b|\bstylets?\b|\bpencil\b|\bclaviers?\b|\bkeyboard\b|\bsouris\b|\bmouse\b|\btrackpad\b|\bairtags?\b|"
              r"\bhubs?\b|\bdocks?\b|\bsacoches?\b|\bsacs?\b|\bsleeve\b|\bfolio\b|\bsmart cover\b|\bmagsafe\b|\bcordons?\b|"
              r"\bdragonnes?\b|\bprises?\b|\balimentation\b|\bbumper\b|\bportefeuille\b|\bwallet\b|\bmagstick\b|\bcase\b|"
              r"\bglass\b|\bsafe privacy\b|\blightning\b|\busb ?c\b|\bcover\b|\bembouts?\b|\btelecommande\b|\bremote\b|\bpochettes?\b|"
              r"\bprotege\b|\baircase\b|\bsilicone\b|\bsupport\b|\bskin\b|\bcoverbook\b|\bcharging\b|\bcharger\b|\bholder\b|\bstand\b")
SOUS_CATS = [
    ("Bracelets Apple Watch", r"\bbracelets?\b|\bboucle\b|\bband\b|\bloop\b|\bdragonne\b"),
    ("AirTag", r"\bairtags?\b"),
    ("Apple Pencil", r"\bpencil\b|\bstylets?\b"),
    ("Claviers et souris", r"\bclaviers?\b|\bkeyboard\b|\bsouris\b|\bmouse\b|\btrackpad\b"),
    ("MagSafe", r"\bmagsafe\b|\bqi2\b|\bmagstick\b"),
    ("Coques et protections", r"\bcoques?\b|\betuis?\b|\bhousses?\b|\bprotections?\b|\bverres?\b|\bfilms?\b|\bfolio\b|"
                              r"\bsmart cover\b|\bbumper\b|\bpochettes?\b|\baircase\b|\bsilicone\b|\bsleeve\b|\bsacoches?\b|\bsacs?\b|\bcase\b|\bglass\b|\bcover\b"),
    ("Chargeurs et câbles", r"\bchargeurs?\b|\bcables?\b|\badaptateurs?\b|\balimentation\b|\bhubs?\b|\bdocks?\b|"
                            r"\bbatteries?\b|\bpower ?bank\b|\bstations?\b|\bprises?\b|\blightning\b|\busb\b|\bcordons?\b"),
    ("Audio", r"\bcasques?\b|\becouteurs?\b|\benceintes?\b|\bbeats\b"),
]
POUR_APPAREIL = r"\b(?:pour|compatibles?|compat|for)\s+(?:l |les? |la |votre |vos )?(?:iphone|ipad|mac|macbook|apple|airpods|watch)"
APPLE_ACCESSOIRE = r"\bmagsafe\b|\bapple\b|\bairtag|\bpencil\b|\bmagic (?:keyboard|mouse|trackpad)\b|\blightning\b"
AUTRES_MARQUES = r"\b(?:samsung|galaxy|huawei|xiaomi|redmi|garmin|amazfit|fitbit|honor|oppo|pixel|oneplus|motorola|sony|jbl|lenovo|asus|acer|hp|dell|msi|polar|suunto|realme|nokia|bose)\b"
PAS_A_VENDRE = r"\b(?:recherche|recherches|cherche|cherchons|achete|achat de|rachete|rachat|echange contre|troc)\b"


def accessoire_seul(t):
    """« iPhone 18 Pro Clear Case », « AirPods 4 coque silicone » : un accessoire nommé après l'appareil.
    Mais « iPhone 13 avec coque » ou « iPad + étui » restent des appareils vendus avec un accessoire."""
    for m in re.finditer(ACCESSOIRE, t):
        if not re.search(r"\b(?:avec|et|plus|offerte?s?|inclus|fournie?s?|sans)\s(?:\w+\s){0,2}$", t[:m.start()]):
            if m.group(0) not in ("lightning", "usb c", "usbc", "support", "stand", "remote", "magsafe", "charging"):
                return True
    return False


def classer(titre, marque="", description=""):
    """(catégorie, étiquettes) pour un produit Apple ou un accessoire pour appareil Apple ; None sinon."""
    t = mots(titre.replace("+", " plus ")).strip()
    if re.search(AUTRES_MARQUES, t):
        return None
    debut = None
    for cat, motif in APPAREILS:
        m = re.search(motif, t)
        if m and (debut is None or m.start() < debut[1]):
            debut = (cat, m.start())
    acc = re.search(ACCESSOIRE, t)
    apple = norm(marque) in ("apple", "beats") or re.search(r"\bapple\b", t)
    if debut is None:
        if acc and (apple or re.search(APPLE_ACCESSOIRE, t)):
            cat = "accessoires"
        else:
            return None
    elif acc and (acc.start() < debut[1] or re.search(POUR_APPAREIL, t) or accessoire_seul(t)):
        cat = "accessoires"
    else:
        cat = debut[0]
    if cat != "accessoires" and norm(marque) not in ("", "apple", "beats"):
        return None  # un appareil d'une autre marque
    etiquettes = []
    if cat == "accessoires":
        etiquettes = [nom for nom, motif in SOUS_CATS if re.search(motif, t)] or ["Autres"]
        if "Bracelets Apple Watch" in etiquettes and not re.search(r"watch|\bmm\b", t + mots(description)):
            etiquettes.remove("Bracelets Apple Watch")
        etiquettes = etiquettes or ["Autres"]
    return cat, etiquettes


# ---------------------------------------------------------------- caractéristiques

COULEURS = [
    ("Titane naturel", r"titane naturel|natural titanium"), ("Titane noir", r"titane noir|black titanium"),
    ("Titane blanc", r"titane blanc|white titanium"), ("Titane bleu", r"titane bleu|blue titanium"),
    ("Titane sable", r"titane (?:sable|desert)|desert titanium"), ("Gris sidéral", r"gris sideral|space gr[ae]y|gris espace"),
    ("Lumière stellaire", r"lumiere stellaire|starlight"), ("Minuit", r"\bminuit\b|\bmidnight\b"),
    ("Bleu intense", r"bleu intense|deep blue"), ("Orange cosmique", r"orange cosmique|cosmic orange"),
    ("Bleu brume", r"bleu brume|mist blue"), ("Bleu ciel", r"bleu ciel|sky blue"), ("Ciel nocturne", r"ciel nocturne"),
    ("Bleu alpin", r"bleu alpin|sierra blue|alpine blue"), ("Vert alpin", r"vert alpin|alpine green"),
    ("Lavande", r"\blavande\b|\blavender\b"), ("Sauge", r"\bsauge\b|\bsage\b"), ("Graphite", r"\bgraphite\b"),
    ("Outremer", r"\boutremer\b|\bultramarine\b"), ("Sarcelle", r"\bsarcelle\b|\bteal\b"),
    ("Noir", r"\bnoire?s?\b|\bblack\b|\bnoir de jais\b"), ("Blanc", r"\bblanche?s?\b|\bwhite\b"),
    ("Argent", r"\bargente?\b|\bsilver\b"), ("Or", r"\bor\b|\bgold\b|\bdore\b"), ("Rose", r"\broses?\b|\bpink\b"),
    ("Bleu", r"\bbleue?s?\b|\bblue\b"), ("Vert", r"\bverte?s?\b|\bgreen\b"), ("Violet", r"\bviolet\b|\bmauve\b|\bpurple\b"),
    ("Rouge", r"\brouge\b|\bred\b|\(product\)red"), ("Jaune", r"\bjaune\b|\byellow\b"), ("Orange", r"\borange\b"),
    ("Gris", r"\bgris\b|\bgr[ae]y\b"),
]


def capacites(txt):
    """Les tailles citées, en Go : « 256 Go », « 1 To », « 16Go/512Go »…"""
    res = []
    for m in re.finditer(r"(?<![\d.,])(\d{1,4})\s?(go|gb|gigas?|to|tb)\b", norm(txt)):
        n = int(m.group(1))
        res.append(n * 1024 if m.group(2) in ("to", "tb") else n)
    return res


def taille_txt(go):
    return f"{go // 1024} To" if go >= 1024 and go % 1024 == 0 else f"{go} Go"


def caracteristiques(titre, description, cat, en_plus=None):
    c = {}
    t = norm(titre)
    td = norm(titre + " \n " + (description or "")[:1500])
    tailles = capacites(titre) or capacites((description or "")[:600])
    if cat in ("mac", "ipad") and len(set(tailles)) >= 2:
        petit, grand = min(tailles), max(tailles)
        if petit <= 64 and grand >= 128:
            c["Mémoire"] = taille_txt(petit)
        c["Capacité"] = taille_txt(grand)
    elif tailles and cat in ("iphone", "ipad", "mac") and min(tailles) <= 8192:
        c["Capacité"] = taille_txt(max(g for g in tailles if g <= 8192))
    puce = re.search(r"\b(m[1-6])(?:\s?(pro|max|ultra))?\b", t) or re.search(r"\b(a1\d|a\d{2})(?:\s?(pro|bionic))?\b", t)
    if puce and cat in ("mac", "ipad", "iphone", "maison"):
        c["Puce"] = (puce.group(1).upper() + (" " + puce.group(2).capitalize() if puce.group(2) else "")).replace("Bionic", "Bionic")
    ecran = re.search(r"(?<![\d,.])(\d{1,2}(?:[.,]\d)?)\s?(?:\"|”|″|''|pouces?|inch|po\b)", t) or \
        (re.search(r"(?<![\d,.])(\d{1,2}(?:[.,]\d)?)\s?(?:\"|”|″|''|pouces?)", td) if cat in ("mac", "ipad", "iphone") else None)
    if ecran and cat in ("mac", "ipad", "iphone") and 4 <= float(ecran.group(1).replace(",", ".")) <= 32:
        c["Écran"] = ecran.group(1).replace(".", ",") + " pouces"
    elif cat == "mac" and re.search(r"\b(?:air|pro|neo) (1[3-6])\b", t):
        c["Écran"] = re.search(r"\b(?:air|pro|neo) (1[3-6])\b", t).group(1) + " pouces"
    if cat == "watch" or (cat == "accessoires" and "watch" in t):
        mm = re.search(r"\b(3[8-9]|4[0-9]|5[0-2])\s?mm\b", td)
        if mm:
            c["Taille"] = mm.group(1) + " mm"
        if re.search(r"gps\s?\+\s?cellular|cellular|4g|lte", td):
            c["Connectivité"] = "GPS + Cellular"
        elif "gps" in td:
            c["Connectivité"] = "GPS"
    elif cat == "ipad":
        if re.search(r"cellular|4g|5g|lte", t):
            c["Connectivité"] = "Wi-Fi + Cellular"
        elif "wi-fi" in t or "wifi" in t:
            c["Connectivité"] = "Wi-Fi"
    elif cat == "iphone" and re.search(r"\b5g\b", td):
        c["Connectivité"] = "5G"
    couleur = next((nom for nom, motif in COULEURS if re.search(motif, t)), "")
    if couleur:
        c["Couleur"] = couleur
    annee = re.search(r"\b(20(?:1[5-9]|2\d))\b", t)
    if annee and cat in ("mac", "ipad", "iphone", "watch", "maison"):
        c["Année"] = annee.group(1)
    batterie = re.search(r"batterie[^.\n]{0,25}?(\d{2,3})\s?%|(\d{2,3})\s?%\s?(?:de )?(?:batterie|sante|capacite)", td)
    if batterie:
        v = int(batterie.group(1) or batterie.group(2))
        if 50 <= v <= 100:
            c["Batterie"] = f"{v} %"
    garantie = re.search(r"garantie?\s*(?:de\s*)?(\d{1,2})\s*(mois|ans?)\b", td)
    if garantie:
        c["Garantie"] = f"{garantie.group(1)} {garantie.group(2)}"
    for k, v in (en_plus or {}).items():
        if v and k not in c:
            c[k] = v
    return c


def modele(titre, cat):
    """Nom court du modèle, pour comparer les prix d'un vendeur à l'autre."""
    t = mots(titre)
    if cat == "iphone":
        m = re.search(r" iphone ?(\d{1,2}e?|se|xs|xr|x|air|duo|fold)(?: (pro max|pro|plus|mini|max))?(?: (20\d\d))?", t)
        if m:
            nom = m.group(1).upper() if m.group(1) in ("se", "xs", "xr", "x") else m.group(1).capitalize() if m.group(1) in ("air", "duo", "fold") else m.group(1)
            return " ".join(x for x in ["iPhone", nom, (m.group(2) or "").title(), m.group(3) if m.group(1) == "se" else ""] if x)
    if cat == "ipad":
        m = re.search(r" ipad ?(pro|air|mini)?", t)
        puce = re.search(r" (m[1-6]|a1[5-9]) ", t)
        if m:
            return " ".join(x for x in ["iPad", (m.group(1) or "").capitalize(), puce.group(1).upper() if puce else ""] if x)
    if cat == "mac":
        m = re.search(r" (macbook air|macbook pro|macbook neo|macbook|imac|mac mini|mac studio|mac pro)", t)
        puce = re.search(r" (m[1-6])(?: (pro|max|ultra))? ", t)
        if m:
            nom = {"macbook air": "MacBook Air", "macbook pro": "MacBook Pro", "macbook neo": "MacBook Neo", "macbook": "MacBook",
                   "imac": "iMac", "mac mini": "Mac mini", "mac studio": "Mac Studio", "mac pro": "Mac Pro"}[m.group(1)]
            ecran = re.search(r" (13|14|15|16|24) (?:pouces|po|inch)?", t)
            return " ".join(x for x in [nom, ecran.group(1) + "\"" if ecran and nom.startswith("MacBook") else "",
                                        (puce.group(1).upper() + (" " + puce.group(2).capitalize() if puce.group(2) else "")) if puce else ""] if x)
    if cat == "watch":
        m = re.search(r" (?:series|serie|s) ?(\d{1,2}) | ultra ?(\d)? | se ?(\d)? ", t)
        if m:
            if m.group(1):
                return f"Apple Watch Series {m.group(1)}"
            if "ultra" in m.group(0):
                return "Apple Watch Ultra" + (f" {m.group(2)}" if m.group(2) else "")
            return "Apple Watch SE" + (f" {m.group(3)}" if m.group(3) else "")
    if cat == "airpods":
        m = re.search(r" airpods ?(pro|max)? ?(\d)? ", t)
        if m:
            return " ".join(x for x in ["AirPods", (m.group(1) or "").capitalize(), m.group(2) or ""] if x)
    if cat == "maison":
        m = re.search(r" (apple tv 4k|apple tv|homepod mini|homepod|vision pro)", t)
        if m:
            return {"apple tv 4k": "Apple TV 4K", "apple tv": "Apple TV", "homepod mini": "HomePod mini",
                    "homepod": "HomePod", "vision pro": "Apple Vision Pro"}[m.group(1)]
    return ""


def rang(a):
    """Ordre « pertinence » : appareils récents d'abord, puis le reste."""
    t = mots(a["titre"])
    score = 0
    if a["cat"] != "accessoires":
        score += 40
    gen = re.search(r" iphone ?(\d{1,2})", t)
    if gen:
        score += int(gen.group(1)) * 2
    puce = re.search(r" m([1-6]) ", t)
    if puce:
        score += 20 + int(puce.group(1)) * 3
    serie = re.search(r" (?:series|serie) ?(\d{1,2}) ", t)
    if serie:
        score += int(serie.group(1)) * 2
    if a["photos"]:
        score += 6
    if a["etat"] == "Neuf":
        score += 3
    return score


def produit(**champs):
    a = {"id": "", "vendeur": "", "pro": True, "etat": "Neuf", "cat": "", "tags": [], "titre": "", "modele": "",
         "prix": None, "prix_avant": None, "photos": [], "url": "", "lieux": [], "carac": {}, "description": "",
         "dispo": True}
    a.update(champs)
    return a


# ---------------------------------------------------------------- PrestaShop (Microstor, Phenix Store)

def prestashop_miniatures(h, base):
    """Produits d'une page de catégorie PrestaShop : JSON-LD de chaque vignette, sinon le HTML de la vignette."""
    res = []
    for bloc in re.split(r'<article[^>]+class="[^"]*product-miniature', h)[1:]:
        bloc = bloc.split("</article>")[0]
        lien = re.search(r'href="(https?://[^"]+\.html)[^"]*"', bloc)
        if not lien:
            continue
        p = {"url": lien.group(1), "titre": "", "prix": None, "prix_avant": None, "photo": "", "dispo": True, "marque": ""}
        for o in ld_json(bloc):
            if o.get("@type") == "Product":
                p["titre"] = html.unescape(o.get("name") or "")
                img = o.get("image")
                p["photo"] = img[0] if isinstance(img, list) else img or ""
                p["marque"] = ((o.get("brand") or {}).get("name") or "") if isinstance(o.get("brand"), dict) else ""
                off = o.get("offers") or {}
                if isinstance(off, list):
                    off = off[0] if off else {}
                p["prix"] = prix_de(off.get("price"))
                p["dispo"] = "OutOfStock" not in str(off.get("availability", ""))
        if not p["titre"]:
            t = re.search(r'class="[^"]*product-title[^"]*"[^>]*>(.*?)</h\d>', bloc, re.S) or \
                re.search(r'class="[^"]*product-miniature__title[^"]*"[^>]*>(.*?)</', bloc, re.S)
            p["titre"] = ligne(t.group(1)) if t else ""
        if p["prix"] is None:
            m = re.search(r'class="[^"]*(?:product-miniature__price|price)"[^>]*>(.*?)</span>', bloc, re.S)
            p["prix"] = prix_de(ligne(m.group(1))) if m else None
        avant = re.search(r'class="[^"]*regular-price[^"]*"[^>]*>(.*?)</span>', bloc, re.S)
        if avant:
            p["prix_avant"] = prix_de(ligne(avant.group(1)))
        if not p["photo"]:
            img = re.search(r'data-full-size-image-url\s*=\s*"([^"]+)"', bloc) or re.search(r'<img[^>]+src\s*=\s*"([^"]+)"', bloc)
            p["photo"] = img.group(1) if img else ""
        if re.search(r"out-of-stock|rupture|epuise|indisponible", norm(bloc)) and "InStock" not in bloc:
            p["dispo"] = False
        p["photo"] = urljoin(base, p["photo"]) if p["photo"] else ""
        res.append(p)
    return res


def prestashop_categorie(url, pages_max=30):
    vus, res = set(), []
    for n in range(1, pages_max + 1):
        r = get(url + (("&" if "?" in url else "?") + f"page={n}" if n > 1 else ""))
        if not r:
            break
        nouveaux = [p for p in prestashop_miniatures(r.text, url) if p["url"] not in vus]
        if not nouveaux:
            break
        for p in nouveaux:
            vus.add(p["url"])
        res += nouveaux
        if not re.search(r'page=%d\b' % (n + 1), r.text):
            break
        time.sleep(0.5)
    return res


def prestashop_liens_categories(h, base, motif):
    """Liens vers les catégories, y compris ceux cachés en base64 (data-href) par certains thèmes."""
    liens = set(re.findall(r'href="(' + re.escape(base) + r'/\d+-[a-z0-9_-]+)"', h))
    for code in re.findall(r'(?:data-href|href)="(?:' + re.escape(base) + r'/)?([A-Za-z0-9+/=]{12,})"', h):
        try:
            u = base64.b64decode(code + "=" * (-len(code) % 4)).decode("utf-8")
        except Exception:
            continue
        u = urljoin(base + "/", u)
        if re.fullmatch(re.escape(base) + r"/\d+-[a-z0-9_-]+", u):
            liens.add(u)
    return sorted(u for u in liens if re.search(motif, u.split("/")[-1]))


def prestashop_fiche(h):
    """Infos de la page produit : titre, photos, description, options (stockage, couleur…)."""
    f = {"titre": "", "photos": [], "description": "", "options": {}, "marque": "", "prix": None}
    for o in ld_json(h):
        if o.get("@type") == "Product":
            f["titre"] = html.unescape(o.get("name") or "")
            imgs = (o.get("offers") or {}).get("image") if isinstance(o.get("offers"), dict) else None
            imgs = imgs or o.get("image") or []
            f["photos"] = [imgs] if isinstance(imgs, str) else list(imgs)
            if isinstance(o.get("brand"), dict):
                f["marque"] = o["brand"].get("name") or ""
            off = o.get("offers") or {}
            if isinstance(off, list):
                off = off[0] if off else {}
            f["prix"] = prix_de(off.get("price"))
            break
    if not f["titre"]:
        t = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
        f["titre"] = ligne(t.group(1)) if t else meta(h, "og:title")
    if not f["photos"]:
        f["photos"] = re.findall(r'data-image-large-src="([^"]+)"', h) or re.findall(r'data-zoom-image="([^"]+)"', h) or \
            ([meta(h, "og:image")] if meta(h, "og:image") else [])
    if f["prix"] is None:
        p = re.search(r'itemprop="price"[^>]*content="([\d.]+)"', h) or re.search(r'class="[^"]*current-price[^"]*"[^>]*>\s*(?:<span[^>]*>)?([^<]+)<', h)
        f["prix"] = prix_de(p.group(1)) if p else None
    morceaux = []
    for motif in [r'class="[^"]*product__description-short[^"]*"[^>]*>(.*?)</div>\s*</div>',
                  r'id="product-description-short[^"]*"[^>]*>(.*?)</div>',
                  r'class="[^"]*product-description[^"]*"[^>]*>(.*?)</div>\s*</div>',
                  r'id="description"[^>]*>(.*?)</section>']:
        m = re.search(motif, h, re.S)
        if m:
            t = texte(m.group(1))
            if t and t not in morceaux:
                morceaux.append(t)
    f["description"] = "\n".join(morceaux)[:2500] or html.unescape(meta(h, "description"))
    variantes = re.search(r'class="[^"]*product(?:-|__)variants[^"]*"(.*?)(?:product-add-to-cart|product__add-to-cart|product-quantity|id="add-to-cart)', h, re.S)
    if variantes:
        for bloc in re.split(r'class="(?:[^"]*product-variants-item|variant)"', variantes.group(1))[1:]:
            nom = re.search(r'<(?:label|span)[^>]*class="[^"]*(?:control-label|form-label)[^"]*"[^>]*>(.*?)</', bloc, re.S)
            valeurs = [html.unescape(v) for v in re.findall(r'title="([^"]+)"', bloc)] or \
                [ligne(v) for v in re.findall(r"<option[^>]*>(.*?)</option>", bloc, re.S)]
            nom = ligne(nom.group(1)).split(":")[0].strip() if nom else ""  # « Couleur : Minuit »
            valeurs = list(dict.fromkeys(v for v in valeurs if v and len(v) < 40))
            if nom and valeurs:
                f["options"][nom] = valeurs
    return f


MICROSTOR_BOUTIQUES = [  # leurs pages ne donnent pas toujours l'adresse : commune seulement
    ("Microstor Saint-Denis", "Saint-Denis"), ("Microstor Sainte-Clotilde", "Sainte-Clotilde"),
    ("Microstor Duparc", "Duparc"), ("Microstor Saint-André", "Saint-André"), ("Microstor Saint-Gilles", "Saint-Gilles-les-Bains"),
    ("Microstor Le Port", "Le Port"), ("Microstor Saint-Pierre", "Saint-Pierre"),
]
MICROSTOR_RAYONS = r"iphone|ipad|mac|imac|airpods|watch|apple-tv|homepod|reconditionnes|accessoires|coques|cables|claviers|" \
                   r"adaptateurs|stockage|bracelets|stylets|souris|magsafe|batteries|airtag|ecrans|stations|sacs|maison"


def microstor():
    base = "https://microstor.fr"
    accueil = get(base + "/")
    rayons = prestashop_liens_categories(accueil.text, base, MICROSTOR_RAYONS) if accueil else []
    principaux = [base + p for p in ["/56-iphone", "/51-ipad", "/43-mac", "/63-apple-watch", "/42-airpods-audio",
                                     "/113-reconditionnes", "/4-accessoires", "/72-accessoires", "/121-son-maison"]]
    lieux = [lieu(n, c) for n, c in MICROSTOR_BOUTIQUES]
    res = {}
    for url in dict.fromkeys(principaux + rayons):
        reconditionne = "reconditionn" in url
        for p in prestashop_categorie(url):
            classe = classer(p["titre"], p["marque"])
            if not classe or p["url"] in res:
                if p["url"] in res and reconditionne:
                    res[p["url"]]["etat"] = "Reconditionné"
                continue
            cat, tags = classe
            res[p["url"]] = produit(
                id="ms-" + (re.search(r"/(\d+)-", p["url"]) or re.search(r"(.*)", p["url"])).group(1), vendeur="Microstor",
                etat="Reconditionné" if reconditionne or "reconditionn" in norm(p["titre"] + p["url"]) else "Neuf",
                cat=cat, tags=tags, titre=p["titre"], prix=arrondi(p["prix"]), prix_avant=arrondi(p["prix_avant"]),
                photos=[p["photo"]] if p["photo"] else [], url=p["url"], lieux=lieux, dispo=p["dispo"], marque=p["marque"])
    return list(res.values())


def phenix_lieux():
    lieux = []
    for page in ("https://phenix-store.com/nous-contacter", "https://phenix-store.com/content/4-a-propos"):
        r = get(page)
        if not r:
            continue
        corps = re.sub(r"\s+", " ", texte(r.text))
        m = re.search(r"((?:\d{1,4}[ ,]*(?:bis|ter)?[ ,]*)?(?:rue|avenue|bd|boulevard|chemin|route|zac|za|zi|centre|galerie|place|allee|allée|lotissement|résidence|residence)[^,;:|]{3,60}?)[ ,-]*(974\d\d)\s+([A-Za-zÀ-ÿ'’ -]{3,30})", corps, re.I)
        if m and CP_COMMUNES.get(m.group(2)):
            commune = CP_COMMUNES[m.group(2)]
            return [lieu("Phenix Store " + commune, commune, f"{m.group(1).strip()}, {m.group(2)} {m.group(3).strip()}")]
    r = get("https://phenix-store.com/magasins")
    if r:
        for bloc in re.split(r'<article[^>]*class="[^"]*store-item|<div[^>]*class="[^"]*store-item', r.text)[1:]:
            nom = re.search(r"<h3[^>]*>(.*?)</h3>", bloc, re.S) or re.search(r'class="[^"]*card-title[^"]*"[^>]*>(.*?)</', bloc, re.S)
            adr = re.search(r"<address[^>]*>(.*?)</address>", bloc, re.S)
            adresse = ligne(adr.group(1)) if adr else ""
            commune = commune_de(adresse, ligne(nom.group(1)) if nom else "")
            if commune:
                lieux.append(lieu("Phenix Store " + (ligne(nom.group(1)) if nom else commune), commune, adresse))
    return lieux


def phenix():
    base = "https://phenix-store.com"
    accueil = get(base + "/")
    rayons = prestashop_liens_categories(accueil.text, base, r"apple|iphone|ipad|watch|mac|neuf|reconditionne|smartphones|accessoires|ecouteurs") if accueil else []
    principaux = [base + p for p in ["/23-apple", "/3-smartphones", "/5-neuf", "/6-reconditionne", "/20-ipad", "/15-apple-watch",
                                     "/7-accessoires-apple", "/93-ecouteurs_apple", "/114-nos-offres"]]
    lieux = phenix_lieux()  # sans adresse trouvée, l'appli indique « vente en ligne »
    print(f"  Phenix Store : magasin {[l['adresse'] for l in lieux]}", file=sys.stderr)
    res = {}
    for url in dict.fromkeys(principaux + rayons):
        for p in prestashop_categorie(url):
            classe = classer(p["titre"].rstrip(".").rstrip(), p["marque"])
            if not classe or p["url"] in res:
                continue
            cat, tags = classe
            res[p["url"]] = produit(
                id="px-" + (re.search(r"/(\d+)-", p["url"]) or re.search(r"(.*)", p["url"])).group(1), vendeur="Phenix Store",
                etat="Reconditionné" if "reconditionn" in norm(p["titre"] + p["url"]) else "Neuf",
                cat=cat, tags=tags, titre=p["titre"], prix=arrondi(p["prix"]), prix_avant=arrondi(p["prix_avant"]),
                photos=[p["photo"]] if p["photo"] else [], url=p["url"], lieux=lieux, dispo=p["dispo"], titre_coupe=p["titre"].endswith("..."))
    return list(res.values())


# ---------------------------------------------------------------- iShop

def ishop_lieux():
    r = get("https://ishop.re/trouver-un-magasin")
    lieux = []
    if r:
        for bloc in r.text.split('class="card-header"')[1:]:
            nom = ligne(bloc.split("</div>")[0].split(">", 1)[-1])
            corps = re.search(r'class="card-text"[^>]*>(.*?)</p>', bloc, re.S)
            lignes = [x.strip() for x in texte(corps.group(1)).split("\n") if x.strip()] if corps else []
            adresse = ", ".join(x for x in lignes[:2] if not x.lower().startswith("tel"))
            commune = commune_de(adresse, nom)
            if commune:
                tel = next((x.split(":", 1)[1].strip() for x in lignes if x.lower().startswith("tel. magasin")), "")
                l = lieu(nom if nom.lower().startswith("ishop") else "iShop " + nom, commune, adresse)
                if tel:
                    l["tel"] = tel
                lieux.append(l)
    return lieux or [lieu("iShop Saint-Denis", "Saint-Denis", "85 rue Alexis de Villeneuve, 97400 Saint-Denis")]


def ishop():
    base = "https://ishop.re"
    a_lire = [base + "/", base + "/apple/iphone", base + "/apple/ipad", base + "/apple/mac", base + "/apple/watch",
              base + "/apple/iphone/airpods", base + "/apple/iphone/airtag", base + "/apple/iphone/accessoires-iphone",
              base + "/produits-reconditionnes/produit-reconditionnes", base + "/promo/promo", base + "/musique/musique"]
    vues, produits = set(), {}  # url produit -> (catégorie du site, reconditionné ?)
    while a_lire and len(vues) < 120:
        url = a_lire.pop(0)
        if url in vues:
            continue
        vues.add(url)
        r = get(url)
        if not r:
            continue
        reconditionne = "reconditionn" in url
        for lien in re.findall(r'href="((?:https://ishop\.re)?/[a-z0-9-]+/[^"#?\s]+?,\d+)"', r.text):
            lien = urljoin(base, lien)
            if "/decouvrir/" in lien:
                lien = lien.replace("/decouvrir/", "/produit/")
            if re.search(r"/(?:produit|produits?-reconditionnes?|reconditionne)[a-z-]*/", lien):
                avant = produits.get(lien, False)
                produits[lien] = avant or reconditionne
        for lien in re.findall(r'href="((?:https://ishop\.re)?/(?:apple|produits-reconditionnes|promo|musique)/[a-z0-9/-]+)"', r.text):
            lien = urljoin(base, lien)
            if lien not in vues and lien.count("/") <= 6:
                a_lire.append(lien)
        time.sleep(0.3)
    print(f"  iShop : {len(vues)} pages de rayon, {len(produits)} produits", file=sys.stderr)
    lieux = ishop_lieux()
    res = []
    for url, reconditionne in produits.items():
        ident = url.rsplit(",", 1)[-1]
        slug = url.rsplit("/", 1)[-1].rsplit(",", 1)[0]
        titre = slug.replace("-", " ").strip()
        res.append(produit(id="is-" + ident, vendeur="iShop", etat="Reconditionné" if reconditionne or "reconditionn" in titre else "Neuf",
                           titre=titre, url=url, lieux=lieux, a_completer=True))
    return res


def ishop_fiche(h):
    f = {"titre": "", "photos": [], "description": "", "options": {}, "prix": None, "dispo": True}
    t = re.search(r'<h5 class="font-weight-bold">Acheter (?:un|une|des|le|la|l\')?\s*</h5>\s*<h5 class="font-weight-bold">(.*?)</h5>', h, re.S) or \
        re.search(r'<h6 class="font-weight-bold">([^<]+)</h6>\s*</div>\s*<div[^>]*>\s*<h6 class="font-weight-bold">À partir', h)
    f["titre"] = ligne(t.group(1)) if t else re.sub(r"\s*[-|]\s*iShop.*$", "", meta(h, "og:title") or "")
    p = re.search(r"partir de\s*([\d  .,]+)\s*€", h)
    f["prix"] = prix_de(p.group(1)) if p else None
    f["photos"] = list(dict.fromkeys(urljoin("https://ishop.re", x) for x in re.findall(r'<img[^>]+class="[^"]*product_image[^"]*"[^>]+src="([^"]+)"', h) +
                                     re.findall(r'<img[^>]+src="([^"]*/images/product/(?:large/)?[^"]+)"', h)))
    d = re.search(r'class="product_details"[^>]*>(.*?)</div>', h, re.S)
    f["description"] = texte(d.group(1))[:2500] if d else meta(h, "description")
    for sel in re.findall(r"<select[^>]*>(.*?)</select>", h, re.S):
        valeurs = [ligne(v) for v in re.findall(r"<option[^>]*value=\"[^\"]+\"[^>]*>(.*?)</option>", sel, re.S)]
        valeurs = [v for v in valeurs if v and not re.search(r"choisi|sélection|selection", v.lower()) and len(v) < 40]
        if valeurs:
            nom = "Stockage" if any(capacites(v) for v in valeurs) else "Couleur" if any(any(re.search(m, norm(v)) for _, m in COULEURS) for v in valeurs) else "Choix"
            f["options"].setdefault(nom, valeurs)
    if re.search(r"rupture de stock|indisponible", norm(texte(h)[:20000])) and f["prix"] is None:
        f["dispo"] = False
    return f


# ---------------------------------------------------------------- Darty Réunion

DARTY_RAYONS = ["/c/iphone", "/c/info-apple", "/c/tablette-tactile", "/c/casque-ecouteurs", "/c/objets-connectes-high-tech",
                "/c/ordinateur-portable", "/c/smartphone", "/c/peripheriques-pc", "/c/enceinte-bluetooth"]


def darty():
    base = "https://reunion.darty-dom.com"
    res = {}
    for rayon in DARTY_RAYONS:
        for n in range(1, 21):
            r = get(base + rayon + (f"?page={n}" if n > 1 else ""))
            if not r:
                break
            nouveaux = 0
            for bloc in r.text.split('class="product-box-line-container"')[1:]:
                lien = re.search(r'href="(/p/[^"]+)"', bloc)
                titre = re.search(r'data-gtm-product-title="([^"]+)"', bloc)
                marque = re.search(r'data-gtm-product-brand="([^"]*)"', bloc)
                if not (lien and titre):
                    continue
                url = base + lien.group(1)
                if url in res:
                    continue
                nouveaux += 1
                titre = html.unescape(titre.group(1))
                if norm(marque.group(1) if marque else "") not in ("apple", "beats") and not classer(titre, ""):
                    continue
                classe = classer(titre, marque.group(1) if marque else "")
                if not classe:
                    continue
                prix = re.search(r'class="price-int">(.*?)</span>.*?class="price-decimal">(\d+)<', bloc, re.S)
                prix = prix_de(ligne(prix.group(1)) + "," + prix.group(2)) if prix else prix_de((re.search(r'data-gtm-product-price="([\d.]+)"', bloc) or [None, None])[1])
                avant = re.search(r'class="[^"]*(?:old-price|price-barre|strike)[^"]*"[^>]*>(.*?)</', bloc, re.S)
                img = re.search(r'data-src="([^"]+)"', bloc) or re.search(r'<img[^>]+src="([^"]+)"', bloc)
                points = [ligne(x) for x in re.findall(r"<li>(.*?)</li>", (re.search(r'strong-points-list">(.*?)</ul>', bloc, re.S) or [None, ""])[1], re.S)]
                dispo = "out-stock" not in bloc
                cat, tags = classe
                res[url] = produit(id="dy-" + lien.group(1).rsplit("/", 1)[-1], vendeur="Darty", cat=cat, tags=tags,
                                   etat="Reconditionné" if re.search(r"recon", norm(titre + url)) else "Neuf",
                                   titre=re.sub(r"^Apple\s+", "", titre).strip(), prix=arrondi(prix),
                                   prix_avant=arrondi(prix_de(ligne(avant.group(1)))) if avant else None,
                                   photos=[img.group(1)] if img and "default_image" not in img.group(1) else [],
                                   url=url, description="\n".join(points), dispo=dispo, lieux=[])
            if not nouveaux or f"page={n + 1}" not in r.text:
                break
            time.sleep(0.5)
    # Darty Réunion vend surtout en ligne (livraison sur l'île) : seuls les produits disponibles sont gardés
    return [a for a in res.values() if a["dispo"]]


def darty_fiche(h):
    f = {"titre": "", "photos": [], "description": "", "options": {}, "prix": None}
    for o in ld_json(h):
        if o.get("@type") == "Product":
            img = o.get("image") or []
            f["photos"] = [img] if isinstance(img, str) else list(img)
            f["description"] = texte(html.unescape(o.get("description") or ""))[:2500]
    if not f["photos"]:
        f["photos"] = list(dict.fromkeys(re.findall(r'(https://reunion\.darty-dom\.com/thumbnails/product/[^"\s]+?/(?:box|zoom)/[^"\s]+\.jpe?g)', h)))[:8]
    carac = {}
    for nom, val in re.findall(r"<t[hd][^>]*>\s*([^<]{2,40}?)\s*</t[hd]>\s*<td[^>]*>\s*(.*?)\s*</td>", h, re.S)[:60]:
        nom, val = ligne(nom), ligne(val)
        if nom and val and len(val) < 60:
            carac[nom] = val
    f["carac_site"] = carac
    return f


# ---------------------------------------------------------------- Cash Express (magasins de La Réunion)

CASH_MAGASINS = {"saint-pierre": ("Cash Express Saint-Pierre", "Saint-Pierre"),
                 "sainte-clotilde": ("Cash Express Sainte-Clotilde", "Sainte-Clotilde")}
CASH_RAYONS = [("c-1001", "iphone"), ("c-118", "tablettes"), ("c-11", "informatique"), ("c-2019", "apple-watch"),
               ("c-126", "montres-connectees"), ("c-2305", "ecouteurs-casques-enceintes-connectees")]
ETATS_CASH = ["Jamais servi", "Comme neuf", "Très bon état", "Bon état", "Correct"]


def cashexpress():
    res = {}
    for slug, (nom, commune) in CASH_MAGASINS.items():
        for code, rayon in CASH_RAYONS:
            for n in range(1, 16):
                url = f"https://www.cashexpress.fr/{code}/magasin/{slug}/{rayon}" + (f"?page={n}" if n > 1 else "")
                r = get(url)
                if not r:
                    break
                nouveaux = 0
                for c in re.split(r'<a class="product-card" ', r.text)[1:]:
                    lien = re.search(r'href="([^"]+)"', c)
                    titre = re.search(r'__name">(.*?)</div>', c, re.S)
                    marque = re.search(r'__brand[^>]*>(.*?)</div>', c, re.S)
                    prix = re.search(r'class="price">(.*?)</div>', c, re.S)
                    if not (lien and titre) or "{{" in lien.group(1):
                        continue
                    lien = urljoin("https://www.cashexpress.fr", lien.group(1))
                    marque = ligne(marque.group(1)) if marque else ""
                    titre = ligne(titre.group(1))
                    if norm(marque) not in ("apple", "beats"):
                        continue
                    if lien in res:
                        if lieu(nom, commune) not in res[lien]["lieux"]:
                            res[lien]["lieux"].append(lieu(nom, commune))
                        continue
                    nouveaux += 1
                    classe = classer(("Apple " if not re.search(r"apple|iphone|ipad|mac|airpods|beats", norm(titre)) else "") + titre, marque)
                    if not classe:
                        continue
                    image = re.search(r'<img src="([^"]+)"', c)
                    cat, tags = classe
                    res[lien] = produit(id="ce-" + lien.rstrip("/").split("/")[-2], vendeur="Cash Express", etat="Occasion",
                                        cat=cat, tags=tags, titre=re.sub(r"^(iphone|ipad|macbook|imac)", lambda m: {"iphone": "iPhone", "ipad": "iPad", "macbook": "MacBook", "imac": "iMac"}[m.group(1).lower()], titre, flags=re.I),
                                        prix=arrondi(prix_de(ligne(prix.group(1)))) if prix else None, a_partir="partir" in c,
                                        photos=[urljoin("https://www.cashexpress.fr", image.group(1))] if image else [],
                                        url=lien, lieux=[lieu(nom, commune)])
                if not nouveaux or f"page={n + 1}" not in r.text:
                    break
                time.sleep(0.5)
    return list(res.values())


def cashexpress_fiche(h):
    f = {"photos": [], "description": "", "options": {}, "etat": "", "magasins": []}
    h = html.unescape(h)
    variation = re.search(r'"currentVariation":\{.*?"images":\{(.*?)\}\}', h, re.S)
    if variation:
        f["photos"] = ["https://www.cashexpress.fr" + p.replace("\\/", "/") for p in re.findall(r'"src":"([^"]+)"', variation.group(1))]
    f["magasins"] = sorted(set(re.findall(r'"shop":\{[^}]*"city":"([^"]*)"', h)))
    corps = re.sub(r"\s+", " ", texte(re.sub(r"<(script|style|svg).*?</\1>", "", h, flags=re.S)))
    etats = re.findall(r"État : (?:État )?(.{2,40}?) [\d ]+,\d\d ?€", corps)
    trouves = [x for x in ETATS_CASH if any(norm(x) in norm(e) for e in etats)]
    if trouves:
        f["etat"] = trouves[0]
        f["options"]["États disponibles"] = trouves
    desc = re.search(r"Ajouter au panier Description (.*?) Caractéristiques", corps)
    if desc:
        f["description"] = desc.group(1).strip()[:2500]
    carac = re.search(r"Caractéristiques (.*?)(?: Avis| Vous aimerez| Description|$)", corps)
    f["carac_site"] = {}
    if carac:
        for k, v in re.findall(r"([A-ZÉ][\wéèêà' ]{2,30}) : ([^:]{1,40}?)(?= [A-ZÉ][\wéèêà' ]{2,30} :|$)", carac.group(1)[:1500]):
            f["carac_site"][k.strip()] = v.strip()
    return f


# ---------------------------------------------------------------- ParuVendu (particuliers et pros de l'île)

PARUVENDU_RECHERCHES = ["iphone", "ipad", "macbook", "imac", "mac mini", "apple watch", "airpods", "apple", "homepod",
                        "apple tv", "apple pencil", "magic keyboard", "airtag", "iphone 16", "iphone 15", "iphone 14",
                        "iphone 13", "iphone 12", "iphone 17", "macbook pro", "macbook air", "ipad pro", "ipad air"]


def paruvendu():
    annonces = {}
    for recherche in PARUVENDU_RECHERCHES:
        r = get(f"https://www.paruvendu.re/vente-occasion/?q={recherche.replace(' ', '+')}")
        if not r:
            continue
        for c in r.text.split("<app-annonce")[1:]:
            lien = re.search(r'href="(/[^"]+/([a-z0-9-]+)-(\d{5})/[^"]*/(\d+)/)"', c)
            if not lien or f"pv-{lien.group(4)}" in annonces:
                continue
            titre = ligne((re.search(r'class="ann-ttl[^"]*">(.*?)</p>', c, re.S) or [None, ""])[1])
            desc = ligne((re.search(r'class="card-text[^"]*">(.*?)</p>', c, re.S) or [None, ""])[1])
            if re.search(PAS_A_VENDRE, mots(titre)):
                continue
            classe = classer(titre, "", desc)
            if not classe:
                continue
            prix = re.search(r'class="[^"]*prix[^"]*">([^<]*)<', c)
            ville = re.search(r"location_on</i>([^<]*)<", c)
            image = re.search(r'<img[^>]+src="(https://media\.paruvendu\.re/[^"]+)"', c)
            commune = commune_de(lien.group(3), ligne(ville.group(1)) if ville else "", lien.group(2).replace("-", " "))
            cat, tags = classe
            annonces[f"pv-{lien.group(4)}"] = produit(
                id=f"pv-{lien.group(4)}", vendeur="ParuVendu", pro=False, etat="Occasion", cat=cat, tags=tags,
                titre=titre, prix=arrondi(prix_de(prix.group(1))) if prix else None, description=desc,
                photos=[image.group(1)] if image else [], url="https://www.paruvendu.re" + lien.group(1),
                lieux=[lieu(ligne(ville.group(1)) if ville else commune, commune)] if commune else [])
        time.sleep(0.5)
    return list(annonces.values())


def paruvendu_fiche(h):
    f = {"photos": [], "description": "", "options": {}, "etat": "", "vendeur": "", "date": ""}
    photos = re.findall(r'(https://media\.paruvendu\.re/media_ext/[^"&?\s]+_sizecrop_1000x1000)', h)
    f["photos"] = list(dict.fromkeys(photos))
    desc = re.search(r'card-title">Description</p>\s*<p[^>]*>(.*?)</p>', h, re.S)
    if desc:
        f["description"] = texte(desc.group(1))[:2500]
    etat = re.search(r"Etat du produit</strong>(.*?)<", h, re.S)
    if etat:
        f["etat"] = ligne(etat.group(1))
    date = re.search(r"Dernière mise à jour : (\d\d)/(\d\d)/(\d{4})", h)
    if date:
        f["date"] = f"{date.group(3)}-{date.group(2)}-{date.group(1)}"
    vendeur = re.search(r'alt="logo annonceur".*?<p[^>]*class="mb-0">([^<]+)</p>', h, re.S)
    if vendeur:
        f["vendeur"] = ligne(vendeur.group(1))
    return f


# ---------------------------------------------------------------- pages produit (avec mémoire)

def lire_fiche(a):
    r = get(a["url"])
    if not r:
        return None
    h = r.text
    v = a["vendeur"]
    if v in ("Microstor", "Phenix Store"):
        f = prestashop_fiche(h)
    elif v == "iShop":
        f = ishop_fiche(h)
    elif v == "Darty":
        f = darty_fiche(h)
    elif v == "Cash Express":
        f = cashexpress_fiche(h)
    else:
        f = paruvendu_fiche(h)
    f["lu"] = datetime.now(timezone.utc).isoformat(timespec="minutes")
    f["v"] = VERSION_FICHE
    f["photos"] = list(dict.fromkeys(urljoin(a["url"], p) for p in f.get("photos", []) if p and not re.search(r"logo|icon|favicon|placeholder|default_image", p)))[:10]
    return f


def completer(produits, fiches):
    limite = (datetime.now(timezone.utc) - timedelta(days=FICHE_JOURS)).isoformat()
    a_lire = [a for a in produits if a["url"] not in fiches or fiches[a["url"]].get("lu", "") < limite
              or fiches[a["url"]].get("v") != VERSION_FICHE]
    # d'abord les produits jamais lus (iShop en tête : sa page de rayon ne donne ni le nom complet ni le prix)
    a_lire.sort(key=lambda a: (a["url"] in fiches, not a.get("a_completer"), a["vendeur"] == "ParuVendu"))
    lus = 0
    for a in a_lire[:FICHES_PAR_PASSAGE]:
        f = lire_fiche(a)
        if f:
            fiches[a["url"]] = f
            lus += 1
        elif a["url"] in fiches and a["vendeur"] != "ParuVendu":
            del fiches[a["url"]]  # page produit disparue
        time.sleep(0.25)
    print(f"Pages produit lues : {lus} (encore {max(0, len(a_lire) - FICHES_PAR_PASSAGE)} à lire)")
    for a in produits:
        f = fiches.get(a["url"])
        if not f:
            if a.get("a_completer"):
                a["dispo"] = False  # iShop : sans sa page produit, ni nom complet ni prix
            continue
        if f.get("titre") and (a.get("a_completer") or a.get("titre_coupe")):
            a["titre"] = f["titre"]
        if f.get("photos"):
            a["photos"] = list(dict.fromkeys(f["photos"] + a["photos"]))[:10]
        if f.get("description") and len(f["description"]) > len(a["description"]):
            a["description"] = f["description"]
        if f.get("prix") and (a.get("a_completer") or a["prix"] is None or a["prix"] < 0.2 * f["prix"]):
            a["prix"] = arrondi(f["prix"])  # Microstor : la liste montre 1, 2, 3 € pour les produits à options
        if a.get("a_completer") and f.get("dispo") is False:
            a["dispo"] = False
        a["options"] = f.get("options") or {}
        a["carac_site"] = f.get("carac_site") or {}
        if f.get("etat"):
            a["etat_detail"] = f["etat"]
        if a["vendeur"] == "Cash Express" and f.get("magasins"):
            communes = {commune_de(m.replace("-", " ")) for m in f["magasins"]}
            gardes = [l for l in a["lieux"] if l["commune"] in communes]
            a["lieux"] = gardes or a["lieux"]
        if a["vendeur"] == "ParuVendu":
            a["annonceur"] = f.get("vendeur", "")
            a["date"] = f.get("date", "")


def finaliser(a):
    """Catégorie (iShop : connue seulement après la page produit), caractéristiques, nom du modèle."""
    if not a["cat"]:
        classe = classer(a["titre"], "apple")
        if not classe:
            return None
        a["cat"], a["tags"] = classe
    en_plus = {}
    opts = a.pop("options", {}) or {}
    for nom, valeurs in opts.items():
        n = norm(nom)
        if len(valeurs) > 1:
            cle = "Stockages proposés" if "stock" in n or "capacit" in n else "Couleurs proposées" if "couleur" in n else nom
            en_plus[cle] = ", ".join(valeurs[:8])
        elif valeurs and ("stock" in n or "capacit" in n):
            en_plus["Capacité"] = valeurs[0]
        elif valeurs and "etat" not in n:
            en_plus[nom] = valeurs[0]
    site = a.pop("carac_site", {}) or {}
    for k in ("Processeur", "Système d'exploitation", "Mémoire vive", "Taille de l'écran", "Résolution", "Capacité de stockage", "Couleur"):
        if site.get(k):
            en_plus[k] = site[k]
    detail = a.pop("etat_detail", "")
    a["carac"] = caracteristiques(a["titre"], a["description"], a["cat"], en_plus)
    if detail and norm(detail) != norm(a["etat"]):
        a["carac"]["État"] = detail
    # prix de la version la moins chère : l'appli écrit « dès … »
    a["des"] = bool(a.pop("a_partir", False) or any(len(v) > 1 for k, v in opts.items() if "couleur" not in norm(k)))
    if a["vendeur"] == "ParuVendu":
        if a.get("annonceur"):
            a["carac"]["Vendeur"] = a["annonceur"]
        if a.get("date"):
            a["carac"]["Mise à jour"] = "/".join(reversed(a["date"].split("-")))
        t = norm(a["titre"] + " " + a["description"][:300])
        if re.search(r"jamais servi|neuf sous blister|sous blister|scelle|neuf jamais|encore emballe", t):
            a["carac"]["État"] = "Neuf (vendu par un particulier)"
        elif re.search(r"pour pieces|hs\b|casse|ne s'allume|bloque icloud|ecran fissure", t):
            a["carac"]["État"] = "Pour pièces ou à réparer"
    a["modele"] = modele(a["titre"], a["cat"])
    if a["vendeur"] == "Cash Express":  # « Montre connectee watch se 3 40mm gps » -> « Apple Watch SE 3 · 40 mm · GPS »
        if a["modele"]:
            a["titre"] = " · ".join([a["modele"]] + [a["carac"][k] for k in ("Capacité", "Taille", "Connectivité") if a["carac"].get(k)])
        else:
            a["titre"] = a["titre"][:1].upper() + a["titre"][1:]
    a["rang"] = rang(a)
    for cle in ("a_completer", "titre_coupe", "marque", "annonceur", "date"):
        a.pop(cle, None)
    return a


def sans_doublons(produits):
    uniques = {}
    for a in produits:
        cle = a["url"] if a["pro"] else (mots(a["titre"]), a["prix"], mots(a["description"])[:60])
        uniques.setdefault(cle, a)
    return list(uniques.values())


def photos_categories(produits):
    """Une belle photo de produit neuf par catégorie, pour les vignettes de l'accueil."""
    res = {}
    for cat in ("iphone", "watch", "ipad", "mac", "airpods", "maison", "accessoires"):
        candidats = [a for a in produits if a["cat"] == cat and a["photos"] and a["etat"] == "Neuf" and a["vendeur"] in ("Microstor", "iShop", "Phenix Store", "Darty")]
        candidats.sort(key=lambda a: (-(a["vendeur"] == "Microstor"), -a["rang"], a["prix"] or 0))
        if cat == "accessoires":
            candidats = [a for a in candidats if "MagSafe" in a["tags"]] or candidats
        if candidats:
            res[cat] = candidats[0]["photos"][0]
    return res


# ---------------------------------------------------------------- main

SOURCES = [("iShop", ishop), ("Microstor", microstor), ("Phenix Store", phenix), ("Darty", darty),
           ("Cash Express", cashexpress), ("ParuVendu", paruvendu)]


def main():
    seules = [s.strip() for s in os.environ.get("SOURCES", "").split(",") if s.strip()]
    fiches = json.loads(FICHES_FILE.read_text()) if FICHES_FILE.exists() else {}
    vus = json.loads(VUS_FILE.read_text()) if VUS_FILE.exists() else {}
    tous, sources_ok = [], []
    for nom, fonction in SOURCES:
        if seules and nom not in seules:
            continue
        try:
            trouves = fonction()
        except Exception as e:
            print(f"{nom} : erreur {e!r}", file=sys.stderr)
            continue
        print(f"{nom} : {len(trouves)} produits")
        if trouves:
            sources_ok.append(nom)
        tous += trouves
    if not tous:
        print("Aucune source n'a répondu : la page n'est pas modifiée.")
        return
    completer(tous, fiches)
    gardes = [a for a in (finaliser(a) for a in sans_doublons(tous)) if a]
    # le stock disparu d'un magasin n'a rien à faire dans l'appli
    gardes = [a for a in gardes if a["dispo"] is not False or a["vendeur"] == "ParuVendu"]
    maintenant = datetime.now(REUNION)
    for a in gardes:
        a["vu"] = vus.setdefault(a["id"], maintenant.isoformat(timespec="minutes"))
    gardes.sort(key=lambda a: (-a["rang"], a["prix"] or 0))
    par = {}
    for a in gardes:
        par[(a["vendeur"], a["cat"])] = par.get((a["vendeur"], a["cat"]), 0) + 1
    print("Gardés :", len(gardes))
    for (v, c), n in sorted(par.items()):
        print(f"  {v:13} {c:12} {n}")
    # on oublie les pages produit lues il y a plus de 30 jours
    limite = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    fiches = {u: f for u, f in fiches.items() if f.get("lu", "") > limite}
    FICHES_FILE.parent.mkdir(exist_ok=True)
    FICHES_FILE.write_text(json.dumps(fiches, ensure_ascii=False))
    VUS_FILE.write_text(json.dumps(vus, ensure_ascii=False))
    jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    maj = f"{jours[maintenant.weekday()]} {maintenant:%d/%m à %Hh%M}"
    donnees = {"maj": maj, "sources": sources_ok, "communes": {c: list(v) for c, v in COMMUNES.items()},
               "photos_cat": photos_categories(gardes), "annonces": gardes}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "annonces.json").write_text(json.dumps(donnees, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    gabarit = (ROOT / "apple_page.html").read_text(encoding="utf-8")
    (OUT_DIR / "index.html").write_text(gabarit.replace("__MAJ__", html.escape(maj))
                                        .replace("__SOURCES__", html.escape(", ".join(sources_ok)))
                                        .replace("__VERSION__", maintenant.strftime("%Y%m%d%H%M")), encoding="utf-8")


if __name__ == "__main__":
    main()
