"""Montres homme à La Réunion (< 250 €) : collecte, filtre, page HTML et notification.

Lancé chaque matin par GitHub Actions (.github/workflows/montres.yml).
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
    from curl_cffi import requests  # imite un vrai navigateur (moins de blocages)
    IMPERSONATE = {"impersonate": "chrome"}
except ImportError:  # pragma: no cover
    import requests
    IMPERSONATE = {}

PRIX_MAX = int(os.environ.get("PRIX_MAX", "250"))
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "")
PAGE_URL = os.environ.get("PAGE_URL", "")
ROOT = Path(__file__).parent
SEEN_FILE = ROOT / "data" / "seen.json"
OUT_FILE = ROOT / "docs" / "index.html"
REUNION = timezone(timedelta(hours=4))

# ---------------------------------------------------------------- filtres

# Exclus : montres connectées, de sport, femme/enfant, et accessoires.
EXCLURE = [
    "smartwatch", "smart watch", "connecte", "apple watch", "galaxy watch",
    "huawei watch", "pixel watch", "garmin", "fitbit", "polar", "suunto",
    "coros", "amazfit", "xiaomi", "mi band", "redmi", "honor band", "withings",
    "fenix", "forerunner", "cardio", "gps", "montre sport", "montre de sport",
    "sport watch", "running", "fitness", "podometre", "tracker", "enfant",
    "kids", "junior", "fille", "garcon", "bebe", "jouet",
    "bracelet pour", "bracelet de montre", "bracelet montre", "boite vide",
    "ecrin", "coffret vide", "presentoir", "remontoir", "pile", "outil",
    "piece detachee", "pour pieces", "recherche", "cherche", "achete",
]
FEMME = ["femme", "dame", "lady", "ladies", "woman", "women"]
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
    return True


# ---------------------------------------------------------------- sources

def leboncoin():
    """Annonces Leboncoin du département 974 (via l'API utilisée par leur site)."""
    payload = {
        "filters": {
            "enums": {"ad_type": ["offer"]},
            "keywords": {"text": "montre"},
            "location": {"locations": [
                {"locationType": "department", "department_id": "974", "region_id": "26"}
            ]},
            "ranges": {"price": {"min": 1, "max": PRIX_MAX}},
        },
        "limit": 100,
        "limit_alu": 0,
        "sort_by": "time",
        "sort_order": "desc",
        "offset": 0,
    }
    headers = {
        "api_key": "ba0c2dad52b3ec",
        "Content-Type": "application/json",
        "Origin": "https://www.leboncoin.fr",
        "Referer": "https://www.leboncoin.fr/",
    }
    annonces = []
    for offset in (0, 100, 200):
        payload["offset"] = offset
        r = requests.post("https://api.leboncoin.fr/finder/search",
                          json=payload, headers=headers, timeout=30, **IMPERSONATE)
        r.raise_for_status()
        ads = r.json().get("ads") or []
        for ad in ads:
            loc = ad.get("location") or {}
            imgs = ad.get("images") or {}
            prix = (ad.get("price") or [None])[0]
            annonces.append({
                "id": f"lbc-{ad.get('list_id')}",
                "source": "Leboncoin",
                "titre": ad.get("subject", ""),
                "description": ad.get("body", ""),
                "prix": prix,
                "url": ad.get("url") or f"https://www.leboncoin.fr/ad/{ad.get('list_id')}",
                "image": (imgs.get("urls_large") or imgs.get("urls") or [imgs.get("thumb_url")])[0],
                "ville": loc.get("city_label") or loc.get("city") or "",
                "lat": loc.get("lat"),
                "lng": loc.get("lng"),
                "date": ad.get("first_publication_date", ""),
            })
        if len(ads) < 100:
            break
    return annonces


SOURCES = [leboncoin]


# ---------------------------------------------------------------- page HTML

def carte_google(a):
    if a.get("lat") and a.get("lng"):
        q = f"{a['lat']},{a['lng']}"
    else:
        q = f"{a['ville']}, La Réunion"
    return (f"https://www.google.com/maps/search/?api=1&query={quote(q)}",
            f"https://maps.google.com/maps?q={quote(q)}&z=12&output=embed")


def page_html(annonces, maj):
    cartes = []
    for a in annonces:
        lien_map, embed = carte_google(a)
        e = html.escape
        prix = f"{a['prix']} €" if a.get("prix") is not None else "Prix ?"
        nouveau = '<span class="new">Nouveau</span>' if a.get("nouveau") else ""
        img = (f'<img src="{e(a["image"])}" alt="" loading="lazy">' if a.get("image")
               else '<div class="noimg">Pas de photo</div>')
        cartes.append(f"""
<article class="card">
  <a class="photo" href="{e(a['url'])}" target="_blank" rel="noopener">{img}{nouveau}</a>
  <div class="body">
    <div class="price">{prix}</div>
    <h2>{e(a['titre'])}</h2>
    <p class="meta">📍 {e(a['ville'] or 'La Réunion')} · {e(a['source'])} · {e(a['date'][:10])}</p>
    <details><summary>Description</summary><p>{e(a['description'][:800])}</p></details>
    <details class="map"><summary>Voir sur la carte</summary>
      <iframe loading="lazy" src="{e(embed)}"></iframe></details>
    <div class="actions">
      <a class="btn primary" href="{e(a['url'])}" target="_blank" rel="noopener">Contacter le vendeur</a>
      <a class="btn" href="{e(lien_map)}" target="_blank" rel="noopener">Google Maps</a>
    </div>
  </div>
</article>""")
    vide = '<p class="empty">Aucune montre trouvée aujourd\'hui.</p>' if not annonces else ""
    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Montres Réunion</title>
<style>
:root{{--bg:#f6f4ef;--card:#fff;--text:#1d1c1a;--muted:#6b675f;--accent:#0f5e4f;--line:#e4e0d8}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151513;--card:#201f1c;--text:#eeebe4;--muted:#a19c92;--accent:#5fc2a8;--line:#34322d}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,sans-serif}}
header{{padding:20px 16px 8px;max-width:1100px;margin:auto}}h1{{margin:0;font-size:22px}}
header p{{margin:4px 0 0;color:var(--muted)}}
main{{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));padding:16px;max-width:1100px;margin:auto}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}}
.photo{{position:relative;display:block;aspect-ratio:1;background:var(--line)}}
.photo img{{width:100%;height:100%;object-fit:cover;display:block}}
.noimg{{display:grid;place-items:center;height:100%;color:var(--muted)}}
.new{{position:absolute;top:10px;left:10px;background:var(--accent);color:var(--card);font-size:12px;font-weight:600;padding:3px 8px;border-radius:99px}}
.body{{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;flex:1}}
.price{{font-size:20px;font-weight:700;color:var(--accent)}}
h2{{font-size:15px;margin:0}}.meta{{margin:0;color:var(--muted);font-size:13px}}
details{{font-size:13px;color:var(--muted)}}summary{{cursor:pointer}}
iframe{{width:100%;height:200px;border:0;border-radius:8px;margin-top:6px}}
.actions{{display:flex;gap:8px;margin-top:auto;padding-top:6px}}
.btn{{flex:1;text-align:center;padding:9px;border-radius:9px;border:1px solid var(--line);color:var(--text);text-decoration:none;font-weight:600;font-size:13px}}
.btn.primary{{background:var(--accent);border-color:var(--accent);color:var(--card)}}
.empty{{grid-column:1/-1;text-align:center;color:var(--muted)}}
</style></head><body>
<header><h1>⌚ Montres homme à La Réunion</h1>
<p>{len(annonces)} annonces à moins de {PRIX_MAX} € · hors montres connectées et de sport · mis à jour le {maj}</p></header>
<main>{vide}{''.join(cartes)}</main>
</body></html>"""


# ---------------------------------------------------------------- notification

def notifier(nb_total, nouvelles):
    if not NTFY_TOPIC:
        print("NTFY_TOPIC non défini : pas de notification.")
        return
    if nouvelles:
        apercu = "\n".join(f"• {a['prix']} € – {a['titre'][:50]} ({a['ville']})" for a in nouvelles[:5])
        msg = f"{len(nouvelles)} nouvelle(s) montre(s) sur {nb_total} en vente :\n{apercu}"
    else:
        msg = f"Pas de nouvelle montre aujourd'hui ({nb_total} toujours en vente)."
    headers = {"Title": "Montres homme Réunion < %d €" % PRIX_MAX, "Tags": "watch"}
    if PAGE_URL:
        headers["Click"] = PAGE_URL
        headers["Actions"] = f"view, Voir les montres, {PAGE_URL}"
    if nouvelles and nouvelles[0].get("image"):
        headers["Attach"] = nouvelles[0]["image"]
    requests.post(f"https://ntfy.sh/{NTFY_TOPIC}", data=msg.encode("utf-8"),
                  headers=headers, timeout=30)


# ---------------------------------------------------------------- main

def main():
    annonces, erreurs = [], []
    for source in SOURCES:
        try:
            annonces += source()
        except Exception as exc:  # une source en panne ne bloque pas les autres
            erreurs.append(f"{source.__name__}: {exc}")
            print(f"[erreur] {source.__name__}: {exc}", file=sys.stderr)

    montres = [a for a in annonces if est_montre_homme(a["titre"], a["description"])]
    vus = set(json.loads(SEEN_FILE.read_text())) if SEEN_FILE.exists() else set()
    for a in montres:
        a["nouveau"] = a["id"] not in vus
    montres.sort(key=lambda a: a.get("date", ""), reverse=True)  # plus récentes d'abord
    montres.sort(key=lambda a: not a["nouveau"])                 # puis nouvelles en tête
    nouvelles = [a for a in montres if a["nouveau"]]

    maj = datetime.now(REUNION).strftime("%d/%m/%Y à %Hh%M")
    OUT_FILE.parent.mkdir(exist_ok=True)
    OUT_FILE.write_text(page_html(montres, maj), encoding="utf-8")
    SEEN_FILE.parent.mkdir(exist_ok=True)
    SEEN_FILE.write_text(json.dumps(sorted(vus | {a["id"] for a in montres})))
    print(f"{len(annonces)} annonces récupérées, {len(montres)} montres homme, {len(nouvelles)} nouvelles.")

    if erreurs and not annonces:
        if NTFY_TOPIC:
            requests.post(f"https://ntfy.sh/{NTFY_TOPIC}",
                          data=("Recherche impossible aujourd'hui : " + "; ".join(erreurs))[:300].encode(),
                          headers={"Title": "Montres Réunion : erreur", "Tags": "warning"}, timeout=30)
        sys.exit(1)
    notifier(len(montres), nouvelles)


if __name__ == "__main__":
    main()
