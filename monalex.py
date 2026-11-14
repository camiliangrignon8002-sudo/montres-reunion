"""Monalex : relève les montres Rolex en vente sur les sites des boutiques (toutes les 2 heures).

Lancé par GitHub Actions (.github/workflows/monalex.yml). Écrit docs/monalex/annonces.json.
- Seulement des sites de boutiques (liste BOUTIQUES) : pas de petites annonces entre particuliers ni de places de marché.
- Reconnaît tout seul les boutiques Shopify (/products.json), WooCommerce (API publique du magasin)
  et les fiches produit standard (données « schema.org Product » des pages listées dans "pages").
- Garde seulement les montres Rolex disponibles, avec au moins une photo nette (1200 px de large quand la taille est connue),
  chaque photo une seule fois. Respecte le fichier robots.txt de chaque site.
"""

import hashlib
import html
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib import robotparser

try:
    from curl_cffi import requests  # imite un vrai navigateur
    IMPERSONATE = {"impersonate": "chrome"}
except ImportError:  # pragma: no cover
    import requests
    IMPERSONATE = {}

ROOT = Path(__file__).parent
OUT = ROOT / "docs" / "monalex" / "annonces.json"
VUS = ROOT / "data" / "monalex_vus.json"     # id -> date de première apparition
CATALOGUE = ROOT / "docs" / "monalex" / "montres.json"
PHOTOS = ROOT / "docs" / "monalex" / "photos.json"   # photos libres (Wikimedia Commons) des références du catalogue
PHOTO_MIN = 1200
PAUSE = 1.2                                   # secondes entre deux pages d'un même site
UA = "Mozilla/5.0 (compatible; MonalexBot/1.0; recherche de montres)"

# Boutiques suivies. Position : adresse de la boutique quand elle est connue, sinon centre de la ville (approx=True).
# "pages" : pages de catalogue à lire quand le site n'est ni Shopify ni WooCommerce.
BOUTIQUES = {
    "intemporel":  dict(nom="Intemporel Collection", site="https://intemporel-collection.ch", ville="Genève", pays="Suisse", code_pays="CH", adresse="Route des Jeunes 4bis", cp="1227", lat=46.1903, lng=6.1338, devise="CHF"),
    "guichard":    dict(nom="Guichard Collection", site="https://guichard-collection.ch", ville="Genève", pays="Suisse", code_pays="CH", adresse="Rue du Rhône 8", cp="1204", lat=46.2036, lng=6.1474, devise="CHF", pages=["https://guichard-collection.ch/montres/"]),
    "desbiolles":  dict(nom="Horlogerie Desbiolles", site="https://www.artisanhorloger.ch", ville="Genève", pays="Suisse", code_pays="CH", adresse="Boulevard du Théâtre 7", cp="1204", lat=46.2012, lng=6.1419, devise="CHF"),
    "lmdh":        dict(nom="La Maison de l'Horlogerie", site="https://lmdh.ch", ville="Genève", pays="Suisse", code_pays="CH", adresse="Rue du Cendrier 24", cp="1201", lat=46.2091, lng=6.1441, devise="CHF", pages=["https://lmdh.ch/en/watchtrade/"]),
    "lecrin":      dict(nom="L'Écrin Genève", site="https://www.lecrin.ch", ville="Genève", pays="Suisse", code_pays="CH", adresse="Rue François-Versonnex 7", cp="1207", lat=46.2036, lng=6.1561, devise="CHF"),
    "watchproject": dict(nom="The Watch Project Monaco", site="https://www.thewatchprojectmonaco.com", ville="Monaco", pays="Monaco", code_pays="MC", adresse="Boulevard Princesse Charlotte", cp="98000", lat=43.7405, lng=7.4226, devise="EUR"),
    "labelmontre": dict(nom="Label Montre", site="https://www.labelmontre.fr", ville="Nice", pays="France", code_pays="FR", adresse="Nice (sur rendez-vous)", cp="06000", lat=43.7009, lng=7.2683, devise="EUR", approx=True),
    "luxurywatches-nice": dict(nom="Luxury Watches Nice", site="https://www.luxury-watches.fr", ville="Nice", pays="France", code_pays="FR", adresse="14 Avenue Félix Faure", cp="06000", lat=43.6984, lng=7.2727, devise="EUR"),
    "bemon":       dict(nom="Gérald Bémon", site="https://www.geraldbemon.com", ville="Nice", pays="France", code_pays="FR", adresse="Rue Antoine Gautier", cp="06300", lat=43.7012, lng=7.2852, devise="EUR"),
    "manvstime":   dict(nom="Man vs Time", site="https://manvstime.fr", ville="Cannes", pays="France", code_pays="FR", adresse="Cannes", cp="06400", lat=43.5513, lng=7.0128, devise="EUR", approx=True),
    "mikaeldan":   dict(nom="Mikaël Dan", site="https://www.mikaeldan.com", ville="Paris", pays="France", code_pays="FR", adresse="20 rue de Miromesnil", cp="75008", lat=48.8716, lng=2.3166, devise="EUR"),
    "abp":         dict(nom="Atelier du Bracelet Parisien", site="https://abp-paris.com", ville="Paris", pays="France", code_pays="FR", adresse="Paris", cp="75001", lat=48.8662, lng=2.3364, devise="EUR", approx=True),
    "bqwatches":   dict(nom="BQ Watches", site="https://www.bqwatches.com", ville="Londres", pays="Royaume-Uni", code_pays="GB", adresse="Hatton Garden", cp="EC1N", lat=51.5203, lng=-0.1085, devise="GBP"),
    "chronofinder": dict(nom="Chronofinder", site="https://chronofinder.com", ville="Londres", pays="Royaume-Uni", code_pays="GB", adresse="Hatton Garden", cp="EC1N", lat=51.5197, lng=-0.1081, devise="GBP"),
    "luxuryhut":   dict(nom="The Luxury Hut", site="https://www.theluxuryhut.com", ville="Londres", pays="Royaume-Uni", code_pays="GB", adresse="Hatton Garden", cp="EC1N", lat=51.5191, lng=-0.1091, devise="GBP"),
    "maunder":     dict(nom="Maunder Watches", site="https://www.maunderwatches.co.uk", ville="Londres", pays="Royaume-Uni", code_pays="GB", adresse="Burlington Arcade", cp="W1J", lat=51.5091, lng=-0.1405, devise="GBP"),
    "globalwatch": dict(nom="Global Watch Shop", site="https://www.globalwatchshop.co.uk", ville="Londres", pays="Royaume-Uni", code_pays="GB", adresse="London Silver Vaults", cp="WC2A", lat=51.5171, lng=-0.1112, devise="GBP"),
    # États-Unis
    "beckertime":  dict(nom="BeckerTime", site="https://beckertime.com", ville="Keller (Texas)", pays="États-Unis", code_pays="US", adresse="1540 Keller Parkway, Suite 108", cp="TX 76248", lat=32.9346, lng=-97.2297, devise="USD"),
    "watchchest":  dict(nom="Watch Chest", site="https://watchchest.com", ville="Dallas", pays="États-Unis", code_pays="US", adresse="5001 LBJ Freeway, Suite 1010", cp="TX 75244", lat=32.9227, lng=-96.8178, devise="USD"),
    "grandcaliber": dict(nom="Grand Caliber", site="https://grandcaliber.com", ville="Dallas", pays="États-Unis", code_pays="US", adresse="McKinney Avenue, Uptown", cp="TX 75204", lat=32.8010, lng=-96.8010, devise="USD", approx=True),
    "swisswatchexpo": dict(nom="SwissWatchExpo", site="https://www.swisswatchexpo.com", ville="Atlanta", pays="États-Unis", code_pays="US", adresse="315 East Paces Ferry Rd NE", cp="GA 30305", lat=33.8396, lng=-84.3800, devise="USD"),
    "watchguys":   dict(nom="WatchGuys", site="https://www.watchguys.com", ville="Los Angeles", pays="États-Unis", code_pays="US", adresse="613 S. Hill St.", cp="CA 90014", lat=34.0464, lng=-118.2520, devise="USD"),
    "mywatchllc":  dict(nom="My Watch LLC", site="https://mywatchllc.com", ville="Oak Park (Michigan)", pays="États-Unis", code_pays="US", adresse="Oak Park (sur rendez-vous)", cp="MI 48237", lat=42.4595, lng=-83.1827, devise="USD", approx=True),
    "kingjewelers": dict(nom="King Jewelers", site="https://kingjewelers.com", ville="Nashville", pays="États-Unis", code_pays="US", adresse="4121 Hillsboro Pike", cp="TN 37215", lat=36.1030, lng=-86.8160, devise="USD"),
    # Moyen-Orient
    "timepiece360": dict(nom="Timepiece360", site="https://timepiece360.com", ville="Dubaï", pays="Émirats arabes unis", code_pays="AE", adresse="Al Quoz Industrial Area", cp="", lat=25.1350, lng=55.2300, devise="AED", approx=True),
    "watchmaestro": dict(nom="WatchMaestro", site="https://watchmaestro.com", ville="Dubaï", pays="Émirats arabes unis", code_pays="AE", adresse="Dubaï", cp="", lat=25.2048, lng=55.2708, devise="AED", approx=True, pages=["https://watchmaestro.com/rolex/"]),
    "thestore":    dict(nom="The Store Dubai", site="https://www.thestore.ae", ville="Dubaï", pays="Émirats arabes unis", code_pays="AE", adresse="Dubaï", cp="", lat=25.2100, lng=55.2750, devise="AED", approx=True),
    # Asie
    "watchexchange-sg": dict(nom="Watch Exchange", site="https://watchexchange.sg", ville="Singapour", pays="Singapour", code_pays="SG", adresse="Singapour", cp="", lat=1.3050, lng=103.8320, devise="SGD", approx=True, pages=["https://watchexchange.sg/watches/rolex/"]),
    "hjluxury":    dict(nom="HJ Luxury", site="https://www.hjwatch.com", ville="Singapour", pays="Singapour", code_pays="SG", adresse="14 Scotts Road #04-134, Far East Plaza", cp="228213", lat=1.3071, lng=103.8329, devise="SGD"),
}

COLLECTIONS = [("cosmograph daytona", "Cosmograph Daytona"), ("daytona", "Cosmograph Daytona"), ("submariner", "Submariner"),
               ("sea-dweller", "Sea-Dweller"), ("sea dweller", "Sea-Dweller"), ("deepsea", "Deepsea"), ("gmt-master", "GMT-Master II"),
               ("gmt master", "GMT-Master II"), ("day-date", "Day-Date"), ("day date", "Day-Date"), ("president", "Day-Date"),
               ("datejust", "Datejust"), ("date just", "Datejust"), ("sky-dweller", "Sky-Dweller"), ("sky dweller", "Sky-Dweller"),
               ("yacht-master", "Yacht-Master"), ("yachtmaster", "Yacht-Master"), ("yacht master", "Yacht-Master"), ("explorer", "Explorer"),
               ("air-king", "Air-King"), ("air king", "Air-King"), ("milgauss", "Milgauss"), ("oyster perpetual", "Oyster Perpetual"),
               ("1908", "1908"), ("cellini", "Cellini")]
PAS_UNE_MONTRE = ["bracelet seul", "bracelet only", "strap", "boite seule", "box only", "papiers seuls", "papers only", "maillon", "link only",
                  "fermoir", "clasp", "lunette seule", "bezel only", "cadran seul", "dial only", "pochette", "remontoir", "watch winder", "outil"]


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def texte(h):
    h = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h or "", flags=re.S | re.I)
    h = re.sub(r"<br\s*/?>|</p>|</li>", "\n", h, flags=re.I)
    h = html.unescape(re.sub(r"<[^>]+>", " ", h))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", h)).strip()


ACCESSOIRE = re.compile(r"^(bracelet|strap|band|boucle|buckle|ecrin|coffret|box|pochette)\b|\b(bracelet (cuir|caoutchouc|nato|pour|en )|rubber ?b|caoutchouc|nato|strap|watch band|bracelet seul|pour rolex|for rolex|compatible|aftermarket|boucle ardillon|deployant seul)\b")
PRIX_MIN = {"EUR": 1500, "CHF": 1500, "GBP": 1300, "USD": 1600, "AED": 6000, "SGD": 2200, "HKD": 12000, "JPY": 250000}


def est_rolex(titre, marque="", prix=None, devise="EUR"):
    """Une vraie montre Rolex : « Rolex » dans le titre ou la marque, pas un accessoire, et un prix plausible."""
    t, m = norm(titre), norm(marque)
    if "rolex" not in t and m.strip() != "rolex":
        return False
    if ACCESSOIRE.search(t) or any(norm(x) in t for x in PAS_UNE_MONTRE):
        return False
    return not prix or prix >= PRIX_MIN.get(devise, 1500)


def details(titre, desc):
    t = norm(titre + " " + desc)
    ref = re.search(r"\b(?:ref(?:erence)?\.?\s*)?(\d{4,6}[a-z]{0,6})\b", norm(titre)) or re.search(r"\bref(?:erence)?\.?\s*:?\s*(\d{4,6}[a-z]{0,6})\b", t)
    reference = ref.group(1).upper() if ref and not re.fullmatch(r"(19|20)\d\d", ref.group(1)) else ""
    collection = next((nom for k, nom in COLLECTIONS if k in norm(titre)), "") or next((nom for k, nom in COLLECTIONS if k in t), "")
    annee = re.search(r"\b(19[5-9]\d|20[0-2]\d)\b", titre + " " + desc)
    neuf = re.search(r"\b(neuve?|new|unworn|jamais portee|never worn|brand new)\b", t) and not re.search(r"pre-?owned|occasion|used|seconde main", norm(titre))
    full = bool(re.search(r"full set|boite et papiers|box (and|&) papers|complet|box & card", t))
    return dict(reference=reference, collection=collection, annee=annee.group(1) if annee else "",
                etat="Neuf" if neuf else "Occasion", boite=True if full or re.search(r"\bboite\b|\bbox\b", t) else None,
                papiers=True if full or re.search(r"papiers|papers|carte de garantie|warranty card", t) else None)


def photos_nettes(liste):
    """[(url, largeur ou None)] -> photos nettes, chacune une seule fois."""
    vues, out = set(), []
    for src, w in liste:
        if not src:
            continue
        src = urljoin("https:", src) if src.startswith("//") else src
        cle = re.sub(r"[-_](\d{2,4}x\d{2,4}|small|thumb|mini|scaled)(?=\.)", "", src.split("?")[0].lower())
        if cle in vues or (w and w < PHOTO_MIN):
            continue
        vues.add(cle)
        out.append({"src": src, "w": w} if w else {"src": src})
    return out


class Site:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.robots = robotparser.RobotFileParser()
        try:
            r = requests.get(self.base + "/robots.txt", timeout=20, headers={"User-Agent": UA}, **IMPERSONATE)
            self.robots.parse(r.text.splitlines() if r.status_code == 200 else [])
        except Exception:
            self.robots.parse([])

    def get(self, url, **kw):
        if not self.robots.can_fetch(UA, url):
            raise PermissionError(f"interdit par robots.txt : {url}")
        time.sleep(PAUSE)
        return requests.get(url, timeout=30, headers={"User-Agent": UA, "Accept": "application/json,text/html;q=0.9"}, **IMPERSONATE, **kw)


def shopify(site, b):
    out, page = [], 1
    while page <= 20:
        r = site.get(f"{site.base}/products.json?limit=250&page={page}")
        if r.status_code != 200 or "json" not in r.headers.get("content-type", ""):
            return None if page == 1 else out
        prods = r.json().get("products", [])
        if not prods:
            break
        for p in prods:
            variants = p.get("variants") or [{}]
            if not any(v.get("available", True) for v in variants):
                continue  # vendue
            prix = float(variants[0].get("price") or 0) or None
            if not est_rolex(p.get("title"), p.get("vendor"), prix, b["devise"]):
                continue
            ph = photos_nettes([(i.get("src"), i.get("width")) for i in p.get("images") or []])
            out.append(dict(titre=p.get("title", ""), url=f"{site.base}/products/{p.get('handle')}", prix=prix, devise=b["devise"],
                            description=texte(p.get("body_html")), photos=ph))
        page += 1
    return out


def woocommerce(site, b):
    out, page = [], 1
    while page <= 20:
        r = site.get(f"{site.base}/wp-json/wc/store/v1/products?per_page=100&page={page}&search=rolex")
        if r.status_code != 200 or not r.text.strip().startswith("["):
            return None if page == 1 else out
        prods = r.json()
        if not prods:
            break
        for p in prods:
            if not p.get("is_in_stock", True):
                continue
            pr = p.get("prices") or {}
            prix = int(pr["price"]) / 10 ** int(pr.get("currency_minor_unit", 2)) if pr.get("price") else None
            if not est_rolex(html.unescape(p.get("name", "")), "", prix, pr.get("currency_code") or b["devise"]):
                continue
            imgs = []
            for i in p.get("images") or []:
                best = max(((int(w), u) for u, w in re.findall(r"(\S+)\s+(\d+)w", i.get("srcset") or "")), default=None)
                imgs.append((best[1], best[0]) if best else (i.get("src"), None))
            out.append(dict(titre=html.unescape(p.get("name", "")), url=p.get("permalink"), prix=prix or None,
                            devise=pr.get("currency_code") or b["devise"], description=texte(p.get("description") or p.get("short_description")), photos=photos_nettes(imgs)))
        if page >= int(r.headers.get("x-wp-totalpages", page)):
            break
        page += 1
    return out


def jsonld(site, b):
    """Pages de catalogue : on suit les liens de fiches produit et on lit leurs données schema.org Product."""
    out, liens = [], []
    for page in b.get("pages", []):
        r = site.get(page)
        if r.status_code != 200:
            continue
        for href in re.findall(r'href="([^"]+)"', r.text):
            u = urljoin(page, html.unescape(href))
            if urlparse(u).netloc == urlparse(site.base).netloc and "rolex" in norm(u) and u not in liens and u.rstrip("/") != page.rstrip("/"):
                liens.append(u)
    for u in liens[:120]:
        try:
            r = site.get(u)
        except PermissionError:
            continue
        for bloc in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', r.text, re.S):
            try:
                data = json.loads(bloc.strip())
            except ValueError:
                continue
            for p in (data if isinstance(data, list) else data.get("@graph", [data])):
                if not isinstance(p, dict) or "Product" not in str(p.get("@type")):
                    continue
                offre = p.get("offers") or {}
                offre = offre[0] if isinstance(offre, list) and offre else offre
                if "OutOfStock" in str(offre.get("availability", "")) or "SoldOut" in str(offre.get("availability", "")):
                    continue
                marque = p.get("brand", {}).get("name", "") if isinstance(p.get("brand"), dict) else p.get("brand", "")
                try:
                    prix = float(str(offre.get("price") or "").replace(",", ".")) or None
                except ValueError:
                    prix = None
                if not est_rolex(html.unescape(p.get("name", "")), marque, prix, offre.get("priceCurrency") or b["devise"]):
                    continue
                imgs = p.get("image") or []
                imgs = [imgs] if isinstance(imgs, (str, dict)) else imgs
                imgs = [(i.get("url") or i.get("contentUrl"), i.get("width")) if isinstance(i, dict) else (i, None) for i in imgs]
                try:
                    prix = float(str(offre.get("price") or "").replace(",", ".")) or None
                except ValueError:
                    prix = None
                out.append(dict(titre=html.unescape(p.get("name", "")), url=p.get("url") or u, prix=prix, devise=offre.get("priceCurrency") or b["devise"],
                                description=texte(p.get("description")), photos=photos_nettes(imgs)))
    return out


def relever(bid, b):
    site = Site(b["site"])
    for nom, fn in (("Shopify", shopify), ("WooCommerce", woocommerce), ("fiches produit", jsonld)):
        try:
            res = fn(site, b)
        except PermissionError as e:
            return [], f"{e}"
        except Exception as e:  # site indisponible, format inattendu… on passe au suivant
            print(f"  {bid} / {nom} : {type(e).__name__} {e}", file=sys.stderr)
            res = None
        if res is not None and (res or nom == "fiches produit"):
            return res, nom
    return [], "site non reconnu"


# ---------------------------------------------------------------- photos libres du catalogue (Wikimedia Commons)
COPIE = re.compile(r"\b(style|homage|hommage|replica|replique|fake|copie|copy|tribute|watchdives|inspired|clone|mod)\b")
LICENCES_LIBRES = ("cc0", "public domain", "domaine public", "pd", "cc by", "cc-by")


def commons(requete, limite=20):
    r = requests.get("https://commons.wikimedia.org/w/api.php", timeout=30, headers={"User-Agent": "MonalexBot/1.0 (photos de montres)"}, **IMPERSONATE,
                     params=dict(action="query", format="json", generator="search", gsrsearch=requete, gsrnamespace=6, gsrlimit=limite,
                                 prop="imageinfo", iiprop="url|size|mime|extmetadata", iiurlwidth=1600))
    pages = (r.json().get("query") or {}).get("pages") or {}
    out = []
    for p in sorted(pages.values(), key=lambda p: p.get("index", 0)):
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata") or {}
        lic = texte((meta.get("LicenseShortName") or {}).get("value", ""))
        if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp") or (ii.get("width") or 0) < PHOTO_MIN:
            continue
        if not any(norm(lic).startswith(x) for x in LICENCES_LIBRES) or re.search(r"\bnc\b|\bnd\b", norm(lic)):
            continue
        out.append(dict(titre=p.get("title", ""), src=ii.get("thumburl") or ii.get("url"), w=min(ii.get("width"), 1600),
                        auteur=texte((meta.get("Artist") or {}).get("value", ""))[:120] or "Auteur sur Wikimedia Commons",
                        licence=lic, page=ii.get("descriptionurl")))
    return out


def photos_catalogue():
    cat = json.loads(CATALOGUE.read_text())["montres"]
    res, utilisees = {}, set()
    for m in cat:
        ref, mots = m["reference"], [w for w in norm(m["modele"]).split() if len(w) > 2 and w not in ("date", "rolex")]
        trouvees = []
        for q in (f"Rolex {ref}", f"Rolex {m['modele']}"):
            try:
                cand = commons(q)
            except Exception as e:
                print(f"  Commons {q} : {e}", file=sys.stderr)
                cand = []
            for c in cand:
                t = norm(c["titre"])
                if COPIE.search(t):
                    continue  # copies et montres « dans le style de » : jamais
                exacte = norm(ref) in t
                bon = exacte if q.endswith(ref) else ("rolex" in t and all(w in t for w in mots))
                if bon and c["src"] not in utilisees and c["src"] not in [x["src"] for x in trouvees]:
                    trouvees.append({**c, "exacte": exacte})
            if len(trouvees) >= 3:
                break
            time.sleep(PAUSE)
        trouvees = trouvees[:6]
        utilisees.update(x["src"] for x in trouvees)
        res[m["id"]] = trouvees
        print(f"  photos {ref} : {len(trouvees)}")
    PHOTOS.write_text(json.dumps(dict(mise_a_jour=datetime.now(timezone.utc).isoformat(timespec="minutes"), photos=res), ensure_ascii=False, indent=1))


def main():
    vus = json.loads(VUS.read_text()) if VUS.exists() else {}
    maintenant = datetime.now(timezone.utc).isoformat(timespec="minutes")
    ancien = json.loads(OUT.read_text()) if OUT.exists() else {"annonces": []}
    annonces, sources = [], []
    for bid, b in BOUTIQUES.items():
        print(f"{b['nom']} …")
        res, via = relever(bid, b)
        gardees = 0
        for a in res:
            if not a.get("url") or not a["photos"]:
                continue  # pas de photo nette : on n'affiche pas l'annonce
            aid = hashlib.sha1(a["url"].encode()).hexdigest()[:12]
            vus.setdefault(aid, maintenant)
            annonces.append(dict(id=aid, boutique=bid, **details(a["titre"], a["description"]), titre=a["titre"].strip(), url=a["url"],
                                 prix=round(a["prix"]) if a["prix"] else None, devise=a["devise"], photos=a["photos"][:16],
                                 description=a["description"][:1500], premiere_vue=vus[aid]))
            gardees += 1
        sources.append(dict(id=bid, nom=b["nom"], via=via, annonces=gardees))
        print(f"  {via} : {gardees} annonce(s)")
    # si aucun site n'a répondu (panne réseau), on garde les annonces précédentes
    if not annonces and ancien.get("annonces"):
        print("Aucune annonce relevée : on garde les précédentes.")
        return
    boutiques = {k: {x: v for x, v in b.items() if x not in ("pages", "devise")} for k, b in BOUTIQUES.items()}
    OUT.write_text(json.dumps(dict(mise_a_jour=maintenant, sources=sources, boutiques=boutiques, annonces=annonces), ensure_ascii=False, indent=1))
    VUS.parent.mkdir(exist_ok=True)
    VUS.write_text(json.dumps(vus, ensure_ascii=False))
    print(f"{len(annonces)} annonces Rolex au total.")


if __name__ == "__main__":
    main()
    # photos libres du catalogue : une fois par jour suffit (au passage de minuit, heure de Paris environ)
    if os.environ.get("PHOTOS") == "1" or not PHOTOS.exists() or datetime.now(timezone.utc).hour == 22:
        try:
            photos_catalogue()
        except Exception as e:
            print(f"Photos du catalogue : {e}", file=sys.stderr)
