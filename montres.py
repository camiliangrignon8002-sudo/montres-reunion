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


def carte_embed(a):
    """Carte Google Maps intégrable (sans clé API)."""
    if a.get("lat") and a.get("lng"):
        q = f"{a['lat']},{a['lng']}"
    else:
        q = f"{a.get('ville') or ''} {a.get('cp') or ''}, La Réunion".strip()
    return f"https://maps.google.com/maps?q={quote(q)}&z=12&output=embed"


ICONES = {
    "pin": '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
    "msg": '<path d="M4 5h16v11H8l-4 4V5Z"/>',
    "x": '<path d="M6 6l12 12M18 6 6 18"/>',
    "montre": '<circle cx="12" cy="12" r="6"/><path d="M12 9.5V12l1.6 1.2M9 6.5 9.6 2h4.8l.6 4.5M9 17.5l.6 4.5h4.8l.6-4.5"/>',
}


def icone(nom):
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{ICONES[nom]}</svg>'


def page_html(annonces, maj):
    e = html.escape
    donnees, cartes = [], []
    for i, a in enumerate(annonces):
        prix = f"{a['prix']} €" if a.get("prix") is not None else "Prix libre"
        donnees.append({
            "titre": a["titre"], "prix": prix, "ville": a["ville"] or "La Réunion",
            "source": a["source"], "description": a.get("description", ""), "image": a.get("image", ""),
            "url": a["url"], "carte": carte_google(a), "embed": carte_embed(a),
        })
        img = (f'<img src="{e(a["image"])}" alt="" loading="lazy">' if a.get("image")
               else f'<div class="sans-photo">{icone("montre")}</div>')
        nouveau = '<span class="badge">Nouveau</span>' if a.get("nouveau") else ""
        cartes.append(f"""
    <article class="carte" style="--i:{min(i, 12)}" data-i="{i}" data-prix="{a['prix'] if a.get('prix') is not None else 99999}">
      <button class="photo" aria-label="Voir {e(a['titre'])}">{img}{nouveau}<span class="prix">{prix}</span></button>
      <div class="infos">
        <h2>{e(a['titre'])}</h2>
        <p class="lieu">{icone("pin")}{e(a['ville'] or 'La Réunion')}</p>
      </div>
      <div class="actions">
        <a class="btn plein" href="{e(a['url'])}" target="_blank" rel="noopener">{icone("msg")}Contacter</a>
        <a class="btn rond" href="{e(carte_google(a))}" target="_blank" rel="noopener" aria-label="Voir sur Google Maps">{icone("pin")}</a>
      </div>
    </article>""")

    nb_nouv = sum(1 for a in annonces if a.get("nouveau"))
    prix_connus = [a["prix"] for a in annonces if a.get("prix") is not None]
    stats = [(len(annonces), "en vente"), (nb_nouv, "nouvelle" + ("s" if nb_nouv > 1 else ""))]
    if prix_connus:
        stats.append((f"{min(prix_connus)} €", "le moins cher"))
    stats_html = "".join(f'<div class="stat"><span class="chiffre">{v}</span><span class="legende">{l}</span></div>'
                         for v, l in stats)
    vide = f"""
    <div class="vide">{icone("montre")}<p class="vide-titre">Rien ce matin</p>
    <p>Aucune montre homme à moins de {PRIX_MAX} € pour l'instant.<br>Prochaine recherche demain à 10h.</p></div>"""
    json_donnees = json.dumps(donnees, ensure_ascii=False).replace("</", "<\\/")

    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Montres Réunion</title>
<meta name="description" content="Montres homme d'occasion à La Réunion, moins de {PRIX_MAX} €.">
<meta name="theme-color" content="#f4efe6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1311" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Montres">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" href="icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{{
  --fond:#f4efe6;--fond-2:#ebe4d7;--carte:#fffcf6;--encre:#191d1b;--doux:#6e685d;--trait:#e2d9c9;
  --vert:#14332c;--sur-vert:#f4efe6;--or:#a4772a;--sur-or:#fff;--ombre:0 1px 2px rgba(40,30,10,.05),0 8px 24px -12px rgba(40,30,10,.18);
  --verre:rgba(255,252,246,.82)}}
@media (prefers-color-scheme:dark){{:root{{
  --fond:#0f1311;--fond-2:#161b18;--carte:#171c19;--encre:#ede8dd;--doux:#9a9488;--trait:#262d29;
  --vert:#d5e6dc;--sur-vert:#0f1311;--or:#d9ad5c;--sur-or:#0f1311;--ombre:0 1px 2px rgba(0,0,0,.3),0 8px 24px -12px rgba(0,0,0,.6);
  --verre:rgba(15,19,17,.78)}}}}
*{{box-sizing:border-box;margin:0;padding:0}}
html{{-webkit-text-size-adjust:100%;scroll-behavior:smooth}}
body{{background:var(--fond);color:var(--encre);font:15px/1.5 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;
  padding-bottom:env(safe-area-inset-bottom);min-height:100vh}}
button{{font:inherit;color:inherit;background:none;border:0;cursor:pointer}}
svg{{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}}
.wrap{{max-width:1080px;margin:0 auto;padding:0 20px}}

/* En-tête */
header{{padding:calc(env(safe-area-inset-top) + 28px) 0 24px}}
.marque{{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;letter-spacing:.02em}}
.marque img{{width:28px;height:28px;border-radius:8px}}
.marque span{{color:var(--doux);font-weight:500}}
h1{{font-family:Fraunces,Georgia,serif;font-weight:500;font-size:clamp(36px,10vw,56px);line-height:1;letter-spacing:-.02em;margin-top:28px}}
h1 em{{font-style:italic;color:var(--or)}}
.sous-titre{{color:var(--doux);margin-top:12px}}
.stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--trait);border:1px solid var(--trait);border-radius:16px;overflow:hidden;margin-top:24px}}
.stat{{background:var(--carte);padding:14px 12px;display:flex;flex-direction:column;gap:2px}}
.chiffre{{font-family:Fraunces,Georgia,serif;font-size:24px;font-weight:600;line-height:1.1}}
.legende{{font-size:12px;color:var(--doux)}}

/* Barre de tri */
.barre{{position:sticky;top:0;z-index:5;margin:0 -20px;padding:calc(env(safe-area-inset-top) + 10px) 20px 10px;
  background:var(--verre);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);
  border-bottom:1px solid transparent;transition:border-color .2s}}
.barre.colle{{border-color:var(--trait)}}
.choix{{display:inline-flex;gap:2px;padding:3px;background:var(--fond-2);border-radius:99px;max-width:100%;overflow-x:auto;scrollbar-width:none}}
.choix button{{flex:none;font-size:13px;font-weight:500;color:var(--doux);border-radius:99px;padding:7px 14px;transition:background .2s,color .2s}}
.choix button[aria-pressed=true]{{background:var(--carte);color:var(--encre);box-shadow:var(--ombre)}}

/* Grille */
main{{display:grid;gap:22px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));padding:20px 0 40px}}
.carte{{background:var(--carte);border-radius:22px;box-shadow:var(--ombre);padding:8px;display:flex;flex-direction:column;
  animation:monte .6s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i) * 60ms)}}
@keyframes monte{{from{{opacity:0;transform:translateY(14px)}}to{{opacity:1;transform:none}}}}
.photo{{position:relative;display:block;width:100%;aspect-ratio:1;border-radius:16px;overflow:hidden;background:var(--fond-2)}}
.photo img{{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s cubic-bezier(.2,.7,.2,1)}}
.photo:hover img{{transform:scale(1.04)}}
.sans-photo{{display:grid;place-items:center;height:100%;color:var(--doux)}}
.sans-photo svg{{width:56px;height:56px;stroke-width:1.2}}
.badge{{position:absolute;top:12px;left:12px;background:var(--or);color:var(--sur-or);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:5px 10px;border-radius:99px}}
.prix{{position:absolute;bottom:12px;left:12px;background:var(--verre);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  font-family:Fraunces,Georgia,serif;font-weight:600;font-size:19px;padding:5px 13px;border-radius:12px}}
.infos{{padding:14px 8px 4px}}
h2{{font-size:16px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}
.lieu{{display:flex;align-items:center;gap:5px;color:var(--doux);font-size:13px;margin-top:4px}}
.lieu svg{{width:14px;height:14px}}
.actions{{display:flex;gap:8px;padding:12px 4px 4px;margin-top:auto}}
.btn{{display:flex;align-items:center;justify-content:center;gap:8px;height:46px;border-radius:14px;text-decoration:none;font-weight:600;font-size:14px;color:var(--encre);border:1px solid var(--trait);transition:transform .15s}}
.btn:active{{transform:scale(.97)}}
.btn.plein{{flex:1;background:var(--vert);border-color:var(--vert);color:var(--sur-vert)}}
.btn.rond{{width:46px;flex:none}}
.btn.large{{flex:1}}

/* Vide */
.vide{{grid-column:1/-1;text-align:center;padding:72px 16px;color:var(--doux)}}
.vide svg{{width:48px;height:48px;stroke-width:1.2;margin-bottom:14px}}
.vide-titre{{font-family:Fraunces,Georgia,serif;font-size:26px;color:var(--encre);margin-bottom:6px}}
footer{{color:var(--doux);font-size:12px;text-align:center;padding:0 20px 36px}}

/* Fiche détaillée */
dialog{{margin:auto auto 0;width:100%;max-width:560px;max-height:92vh;border:0;border-radius:26px 26px 0 0;background:var(--carte);color:var(--encre);
  padding:0 0 env(safe-area-inset-bottom);overflow:auto;overscroll-behavior:contain}}
@media (min-width:640px){{dialog{{margin:auto;border-radius:26px}}}}
dialog[open]{{animation:glisse .35s cubic-bezier(.2,.8,.2,1)}}
@keyframes glisse{{from{{transform:translateY(40px);opacity:0}}to{{transform:none;opacity:1}}}}
dialog::backdrop{{background:rgba(10,12,11,.45);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}}
.fiche-photo{{position:relative;aspect-ratio:1;background:var(--fond-2)}}
.fiche-photo img{{width:100%;height:100%;object-fit:cover;display:block}}
.fermer{{position:absolute;top:14px;right:14px;width:38px;height:38px;border-radius:99px;display:grid;place-items:center;background:var(--verre);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}}
.fiche-corps{{padding:20px 20px 24px;display:flex;flex-direction:column;gap:14px}}
.fiche-tete{{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}}
.fiche-tete h3{{font-family:Fraunces,Georgia,serif;font-weight:500;font-size:24px;line-height:1.15}}
.fiche-prix{{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:24px;color:var(--or);white-space:nowrap}}
.fiche-desc{{color:var(--doux);white-space:pre-line}}
.fiche-carte{{border-radius:16px;overflow:hidden;border:1px solid var(--trait);height:190px;background:var(--fond-2)}}
.fiche-carte iframe{{width:100%;height:100%;border:0;display:block}}

@media (prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}}}
</style></head><body>
<div class="wrap">
  <header>
    <div class="marque"><img src="icon-192.png" alt="">Montres <span>· La Réunion</span></div>
    <h1>Montres homme,<br><em>moins de {PRIX_MAX} €</em></h1>
    <p class="sous-titre">Mis à jour le {maj}</p>
    <div class="stats">{stats_html}</div>
  </header>
  <div class="barre" id="barre"><div class="choix" role="group" aria-label="Trier">
    <button data-tri="nouveau" aria-pressed="true">Nouveautés</button>
    <button data-tri="prix-asc" aria-pressed="false">Prix ↑</button>
    <button data-tri="prix-desc" aria-pressed="false">Prix ↓</button>
  </div></div>
  <main id="liste">{''.join(cartes) if annonces else vide}
  </main>
  <footer>Sans montres connectées ni montres de sport · Source : ParuVendu Réunion</footer>
</div>

<dialog id="fiche" aria-label="Détail de la montre">
  <div class="fiche-photo"><img id="f-img" alt=""><button class="fermer" id="f-fermer" aria-label="Fermer">{icone("x")}</button></div>
  <div class="fiche-corps">
    <div class="fiche-tete"><h3 id="f-titre"></h3><span class="fiche-prix" id="f-prix"></span></div>
    <p class="lieu" id="f-lieu"></p>
    <p class="fiche-desc" id="f-desc"></p>
    <div class="fiche-carte"><iframe id="f-carte" loading="lazy" title="Carte"></iframe></div>
    <div class="actions" style="padding:0">
      <a class="btn plein" id="f-contact" target="_blank" rel="noopener">{icone("msg")}Contacter le vendeur</a>
      <a class="btn rond" id="f-maps" target="_blank" rel="noopener" aria-label="Ouvrir dans Google Maps">{icone("pin")}</a>
    </div>
  </div>
</dialog>

<script>
const montres = {json_donnees};
const liste = document.getElementById('liste'), ordre = [...liste.querySelectorAll('.carte')];
const $ = id => document.getElementById(id), fiche = $('fiche');

document.querySelectorAll('[data-tri]').forEach(b => b.addEventListener('click', () => {{
  document.querySelectorAll('[data-tri]').forEach(x => x.setAttribute('aria-pressed', x === b));
  const t = b.dataset.tri, cartes = [...ordre];
  if (t !== 'nouveau') cartes.sort((a, c) => (a.dataset.prix - c.dataset.prix) * (t === 'prix-asc' ? 1 : -1));
  cartes.forEach(c => {{ c.style.animation = 'none'; liste.appendChild(c); }});
}}));

liste.addEventListener('click', ev => {{
  const bouton = ev.target.closest('.photo'); if (!bouton) return;
  const m = montres[bouton.closest('.carte').dataset.i];
  $('f-img').src = m.image || 'icon-512.png';
  $('f-titre').textContent = m.titre; $('f-prix').textContent = m.prix;
  $('f-lieu').innerHTML = '{icone("pin")}'; $('f-lieu').append(m.ville + ' · ' + m.source);
  $('f-desc').textContent = m.description || 'Pas de description.';
  $('f-carte').src = m.embed; $('f-contact').href = m.url; $('f-maps').href = m.carte;
  fiche.showModal();
}});
$('f-fermer').addEventListener('click', () => fiche.close());
fiche.addEventListener('click', ev => {{ if (ev.target === fiche) fiche.close(); }});
fiche.addEventListener('close', () => {{ $('f-carte').src = 'about:blank'; }});

new IntersectionObserver(([e]) => $('barre').classList.toggle('colle', !e.isIntersecting))
  .observe(document.querySelector('.stats'));
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
