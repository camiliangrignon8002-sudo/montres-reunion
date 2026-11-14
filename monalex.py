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


def est_rolex(*champs):
    t = norm(" ".join(str(c) for c in champs))
    return "rolex" in t and not any(norm(x) in t for x in PAS_UNE_MONTRE)


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
            if not est_rolex(p.get("title"), p.get("vendor"), " ".join(p.get("tags") or [])):
                continue
            variants = p.get("variants") or [{}]
            if not any(v.get("available", True) for v in variants):
                continue  # vendue
            prix = float(variants[0].get("price") or 0) or None
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
            if not p.get("is_in_stock", True) or not est_rolex(p.get("name"), " ".join(c.get("name", "") for c in p.get("categories") or [])):
                continue
            pr = p.get("prices") or {}
            prix = int(pr["price"]) / 10 ** int(pr.get("currency_minor_unit", 2)) if pr.get("price") else None
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
                if not est_rolex(p.get("name"), marque):
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
