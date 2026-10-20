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

def texte(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment or "")).replace("\xa0", " ").strip()


def paruvendu():
    """Annonces « montre » de ParuVendu Réunion (pages publiques, robots autorisés)."""
    annonces = []
    for page in (1, 2, 3):
        url = "https://www.paruvendu.re/vente-occasion/?q=montre" + (f"&p={page}" if page > 1 else "")
        r = requests.get(url, timeout=30, **IMPERSONATE)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
        cartes = r.text.split("<app-annonce")[1:]
        nouvelles = 0
        for c in cartes:
            lien = re.search(r'href="(/[^"]+/([a-z0-9-]+)-(\d{5})/[^"]*/(\d+)/)"', c)
            if not lien:
                continue
            ident = f"pv-{lien.group(4)}"
            if any(a["id"] == ident for a in annonces):
                continue
            prix = re.search(r'class="[^"]*prix[^"]*">([^<]*)<', c)
            chiffres = re.sub(r"\D", "", prix.group(1)) if prix else ""
            image = re.search(r'class="card-img-left"[^>]*src="([^"]+)"|src="([^"]+)"[^>]*class="card-img-left"', c)
            image = (image.group(1) or image.group(2)) if image else ""
            ville = re.search(r"location_on</i>([^<]*)<", c)
            annonces.append({
                "id": ident,
                "source": "ParuVendu",
                "titre": texte((re.search(r'class="ann-ttl[^"]*">(.*?)</p>', c, re.S) or [None, ""])[1]),
                "description": texte((re.search(r'class="card-text[^"]*">(.*?)</p>', c, re.S) or [None, ""])[1]),
                "prix": int(chiffres) if chiffres else None,
                "url": "https://www.paruvendu.re" + lien.group(1),
                "image": "" if "novisu" in image else image,
                "ville": texte(ville.group(1)) if ville else "",
                "cp": lien.group(3),
                "lat": None,
                "lng": None,
                "date": "",
            })
            nouvelles += 1
        if nouvelles == 0:
            break
    return [a for a in annonces if a["prix"] is None or a["prix"] <= PRIX_MAX]


SOURCES = [paruvendu]


# ---------------------------------------------------------------- page web

def carte_google(a):
    if a.get("lat") and a.get("lng"):
        q = f"{a['lat']},{a['lng']}"
    else:
        q = f"{a.get('ville') or ''} {a.get('cp') or ''}, La Réunion".strip()
    return f"https://www.google.com/maps/search/?api=1&query={quote(q)}"


ICONE_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>'
ICONE_MSG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5Z"/></svg>'


def page_html(annonces, maj):
    e = html.escape
    cartes = []
    for a in annonces:
        prix = f"{a['prix']} €" if a.get("prix") is not None else "Prix libre"
        nouveau = '<span class="tag">Nouveau</span>' if a.get("nouveau") else ""
        img = (f'<img src="{e(a["image"])}" alt="{e(a["titre"])}" loading="lazy">' if a.get("image")
               else '<div class="sans-photo">Pas de photo</div>')
        desc = f'<p class="desc">{e(a["description"][:220])}</p>' if a.get("description") else ""
        cartes.append(f"""
    <article class="carte" data-prix="{a.get('prix') if a.get('prix') is not None else 99999}" data-nouveau="{int(bool(a.get('nouveau')))}">
      <a class="photo" href="{e(a['url'])}" target="_blank" rel="noopener">{img}{nouveau}</a>
      <div class="infos">
        <div class="ligne"><h2>{e(a['titre'])}</h2><span class="prix">{prix}</span></div>
        <p class="lieu">{ICONE_PIN}{e(a['ville'] or 'La Réunion')}<span>·</span>{e(a['source'])}</p>
        {desc}
        <div class="actions">
          <a class="btn plein" href="{e(a['url'])}" target="_blank" rel="noopener">{ICONE_MSG}Contacter</a>
          <a class="btn" href="{e(carte_google(a))}" target="_blank" rel="noopener">{ICONE_PIN}Carte</a>
        </div>
      </div>
    </article>""")
    nb_nouv = sum(1 for a in annonces if a.get("nouveau"))
    vide = """
    <div class="vide"><p class="vide-titre">Rien pour l'instant</p>
    <p>Aucune montre homme à moins de %d € ce matin. Prochaine recherche demain à 10h.</p></div>""" % PRIX_MAX
    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Montres Réunion</title>
<meta name="description" content="Montres homme d'occasion à La Réunion, moins de {PRIX_MAX} €.">
<meta name="theme-color" content="#f6f2ea" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121614" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Montres">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" href="icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{{--fond:#f6f2ea;--carte:#fffdf9;--encre:#1b1f1d;--doux:#6f6a60;--trait:#e6dfd2;--vert:#14332c;--or:#a87a2a;--sur-vert:#f6f2ea}}
@media (prefers-color-scheme:dark){{:root{{--fond:#121614;--carte:#1a1f1c;--encre:#ece7dc;--doux:#9b958a;--trait:#2a312d;--vert:#cfe3d9;--or:#d6a957;--sur-vert:#121614}}}}
*{{box-sizing:border-box;margin:0}}
html{{-webkit-text-size-adjust:100%}}
body{{background:var(--fond);color:var(--encre);font:15px/1.5 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}}
.wrap{{max-width:1080px;margin:0 auto;padding:0 16px}}
header{{padding:36px 0 20px}}
.sur-titre{{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--or);font-weight:600}}
h1{{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:clamp(30px,7vw,44px);line-height:1.05;letter-spacing:-.01em;margin-top:8px}}
.resume{{color:var(--doux);margin-top:10px}}
.resume b{{color:var(--encre);font-weight:600}}
.barre{{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--fond) 88%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid var(--trait);margin:0 -16px;padding:10px 16px}}
.choix{{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}}
.choix button{{flex:none;font:inherit;font-size:13px;font-weight:500;color:var(--encre);background:transparent;border:1px solid var(--trait);border-radius:99px;padding:7px 14px;cursor:pointer}}
.choix button[aria-pressed=true]{{background:var(--vert);border-color:var(--vert);color:var(--sur-vert)}}
main{{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));padding:20px 0 48px}}
.carte{{background:var(--carte);border:1px solid var(--trait);border-radius:18px;overflow:hidden;display:flex;flex-direction:column}}
.photo{{position:relative;display:block;aspect-ratio:4/3;background:var(--trait);overflow:hidden}}
.photo img{{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease}}
.photo:hover img{{transform:scale(1.03)}}
.sans-photo{{display:grid;place-items:center;height:100%;color:var(--doux);font-size:13px}}
.tag{{position:absolute;top:12px;left:12px;background:var(--carte);color:var(--or);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:99px}}
.infos{{padding:16px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}}
.ligne{{display:flex;justify-content:space-between;align-items:baseline;gap:12px}}
h2{{font-size:16px;font-weight:600;line-height:1.3}}
.prix{{font-family:Fraunces,Georgia,serif;font-size:20px;font-weight:600;color:var(--vert);white-space:nowrap}}
.lieu{{display:flex;align-items:center;gap:6px;color:var(--doux);font-size:13px}}
.lieu svg{{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2}}
.desc{{color:var(--doux);font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}
.actions{{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto;padding-top:8px}}
.btn{{display:flex;align-items:center;justify-content:center;gap:7px;padding:11px;border-radius:12px;border:1px solid var(--trait);color:var(--encre);text-decoration:none;font-weight:600;font-size:14px}}
.btn svg{{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}}
.btn.plein{{background:var(--vert);border-color:var(--vert);color:var(--sur-vert)}}
.vide{{grid-column:1/-1;text-align:center;padding:64px 16px;color:var(--doux)}}
.vide-titre{{font-family:Fraunces,Georgia,serif;font-size:24px;color:var(--encre);margin-bottom:6px}}
footer{{color:var(--doux);font-size:12px;text-align:center;padding:0 0 32px}}
</style></head><body>
<div class="wrap">
  <header>
    <p class="sur-titre">La Réunion · moins de {PRIX_MAX} €</p>
    <h1>Montres homme</h1>
    <p class="resume"><b>{len(annonces)}</b> en vente{f' dont <b>{nb_nouv}</b> nouvelle{"s" if nb_nouv > 1 else ""}' if nb_nouv else ''} · mis à jour le {maj}</p>
  </header>
  <div class="barre"><div class="choix" role="group" aria-label="Trier">
    <button data-tri="nouveau" aria-pressed="true">Nouveautés</button>
    <button data-tri="prix-asc" aria-pressed="false">Prix croissant</button>
    <button data-tri="prix-desc" aria-pressed="false">Prix décroissant</button>
  </div></div>
  <main id="liste">{''.join(cartes) if annonces else vide}
  </main>
  <footer>Hors montres connectées et de sport · Sources : ParuVendu Réunion</footer>
</div>
<script>
const liste = document.getElementById('liste');
const ordre = [...liste.querySelectorAll('.carte')];
document.querySelectorAll('[data-tri]').forEach(b => b.addEventListener('click', () => {{
  document.querySelectorAll('[data-tri]').forEach(x => x.setAttribute('aria-pressed', x === b));
  const t = b.dataset.tri, cartes = [...ordre];
  if (t !== 'nouveau') cartes.sort((a, c) => (a.dataset.prix - c.dataset.prix) * (t === 'prix-asc' ? 1 : -1));
  cartes.forEach(c => liste.appendChild(c));
}}));
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
        prix = f"{a['prix']} €" if a.get("prix") is not None else "Prix libre"
        msg = {
            "title": f"{prix} · {a['ville'] or 'La Réunion'}",
            "message": a["titre"],
            "click": a["url"],
            "actions": [
                {"action": "view", "label": "Contacter le vendeur", "url": a["url"]},
                {"action": "view", "label": "Google Maps", "url": carte_google(a)},
            ],
        }
        if a.get("image"):
            msg["attach"] = a["image"]
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

    maj = datetime.now(REUNION).strftime("%d/%m à %Hh%M")
    OUT_FILE.parent.mkdir(exist_ok=True)
    OUT_FILE.write_text(page_html(montres, maj), encoding="utf-8")
    SEEN_FILE.parent.mkdir(exist_ok=True)
    SEEN_FILE.write_text(json.dumps(sorted(vus | {a["id"] for a in montres})))
    print(f"{len(annonces)} annonces récupérées, {len(montres)} montres homme, {len(nouvelles)} nouvelles.")
    for a in montres:
        print(f"::notice::{a['prix']} € | {a['titre']} | {a['ville']}")

    if erreurs and not annonces:
        if NTFY_TOPIC:
            envoyer(title="Montres Réunion : erreur", tags=["warning"],
                    message=("Recherche impossible aujourd'hui : " + "; ".join(erreurs))[:300])
        sys.exit(1)
    notifier(len(montres), nouvelles)


if __name__ == "__main__":
    main()
