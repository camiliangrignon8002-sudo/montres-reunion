"""Vols directs France → La Réunion (aller simple), les moins chers, avec 1 bagage en soute et 1 bagage cabine.

Interroge Google Flights (via fast-flights) jour par jour, pour chaque aéroport français qui a des vols
sans escale vers Roland-Garros (RUN), toutes compagnies confondues. Les prix demandés comprennent les frais
estimés d'un bagage en soute et d'un bagage cabine, pour 1 adulte : l'appli calcule ensuite le total selon les
voyageurs, leurs âges, les bagages en plus et les animaux.

Les réponses sont gardées dans data/vols_cache.json : chaque passage relit en priorité les jours les plus
anciens et les plus proches, pour que tout le calendrier reste frais sans trop solliciter Google.
Écrit docs/vols/vols.json et docs/vols/index.html. Lancé par GitHub Actions (.github/workflows/vols.yml).
"""

import html
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from threading import Lock

from fast_flights import FlightQuery, Passengers, create_query, fetch_flights_html
from selectolax.lexbor import LexborHTMLParser

ROOT = Path(__file__).parent
CACHE_FILE = ROOT / "data" / "vols_cache.json"
OUT_DIR = ROOT / "docs" / "vols"
REUNION = timezone(timedelta(hours=4))

ARRIVEE = "RUN"  # Saint-Denis Roland-Garros
DEPARTS = {
    "CDG": "Paris-Charles-de-Gaulle", "ORY": "Paris-Orly",
    "LYS": "Lyon", "MRS": "Marseille", "BOD": "Bordeaux", "TLS": "Toulouse", "NTE": "Nantes",
    "MPL": "Montpellier", "NCE": "Nice", "LIL": "Lille", "SXB": "Strasbourg",
}
PARIS = {"CDG", "ORY"}  # vols tous les jours : relus plus souvent
JOURS = int(os.environ.get("JOURS", "330"))                 # les compagnies vendent environ 11 mois à l'avance
REQUETES_MAX = int(os.environ.get("REQUETES_MAX", "450"))   # questions à Google par passage
DUREE_MAX = int(os.environ.get("DUREE_MAX", "35")) * 60     # secondes
TRAVAILLEURS = 3
ERREURS_MAX = 25  # erreurs d'affilée : Google nous bloque, on s'arrête là

# Règles des compagnies, pour le calcul du total dans l'appli. Montants en euros, par aller simple :
# ce sont des estimations relevées sur les sites des compagnies et des comparatifs (2026), à vérifier
# au moment de réserver. enfant / bebe = part du prix adulte payée pour un enfant de 2 à 11 ans
# et un bébé de moins de 2 ans sur les genoux. bagage_sup = un bagage de 23 kg de plus.
# animal_cabine / animal_soute = None si la compagnie ne l'accepte pas.
COMPAGNIES = {
    "AF": {"nom": "Air France", "couleur": "#002157", "site": "https://wwws.airfrance.fr/",
           "animaux": "https://wwws.airfrance.fr/information/passagers/voyager-avec-animal",
           "enfant": 0.85, "bebe": 0.15, "bagage_sup": 70, "animal_cabine": 125, "animal_soute": 200},
    "UU": {"nom": "Air Austral", "couleur": "#00808a", "site": "https://www.air-austral.com/",
           "animaux": "https://www.air-austral.com/preparer-mon-vol/demandes-speciales/animaux.html",
           "enfant": 0.85, "bebe": 0.15, "bagage_sup": 60, "animal_cabine": 125, "animal_soute": 200},
    "SS": {"nom": "Corsair", "couleur": "#1c3f94", "site": "https://www.flycorsair.com/fr",
           "animaux": "https://www.flycorsair.com/fr/informations/avant-le-vol/transport-animal",
           "enfant": 0.85, "bebe": 0.15, "bagage_sup": 70, "animal_cabine": 75, "animal_soute": 150},
    "BF": {"nom": "French bee", "couleur": "#2f8fd8", "site": "https://www.frenchbee.com/fr",
           "animaux": "https://www.frenchbee.com/fr/infos-pratiques/animaux",
           "enfant": 0.85, "bebe": 0.15, "bagage_sup": 60, "animal_cabine": 75, "animal_soute": 150},
}
PAR_DEFAUT = {"couleur": "#5b5b66", "site": "", "animaux": "", "enfant": 0.85, "bebe": 0.15,
              "bagage_sup": 70, "animal_cabine": None, "animal_soute": None}
NOMS = {c["nom"].lower(): code for code, c in COMPAGNIES.items()}


class PageIllisible(Exception):
    """Google n'a pas renvoyé la page de résultats attendue (blocage, captcha, page changée)."""


# ---------------------------------------------------------------- lecture de Google Flights

def requete(aeroport, jour):
    return create_query(
        flights=[FlightQuery(date=jour, from_airport=aeroport, to_airport=ARRIVEE, max_stops=0)],
        trip="one-way", seat="economy", passengers=Passengers(adults=1),
        language="fr", currency="EUR", carry_on_bags=1, checked_bags=1)


def heure(valeur):
    # Google omet les zéros : [8] = 08:00, [None, 31] = 00:31
    h, m = [*(valeur or []), None, None][:2]
    return f"{h or 0:02d}:{m or 0:02d}"


def jour_iso(valeur):
    a, m, j = valeur
    return f"{a:04d}-{m:02d}-{j:02d}"


def lire_page(page, aeroport):
    script = LexborHTMLParser(page).css_first(r"script.ds\:1")
    if script is None:
        titre = LexborHTMLParser(page).css_first("title")
        raise PageIllisible(f"pas de résultats dans la page ({len(page)} caractères, titre "
                            f"{titre.text() if titre else '?'!r}, début {page[:150]!r})")
    js = script.text()
    donnees = js.split("data:", 1)[1].rsplit(",", 1)[0]
    if "errorHasStatus: true" in js:
        return []  # aucun vol ce jour-là
    payload = json.loads(donnees)
    if not isinstance(payload, list) or len(payload) < 4:
        return []
    noms = {}
    try:
        noms = {code: nom for code, nom in payload[7][1][1]}
    except (IndexError, TypeError, ValueError):
        pass
    vols = {}
    for bloc in (payload[2], payload[3]):  # « meilleurs vols » puis « autres vols »
        if not isinstance(bloc, list) or not bloc or not isinstance(bloc[0], list):
            continue
        for k in bloc[0]:
            try:
                vol = lire_vol(k, aeroport, noms)
            except (IndexError, TypeError, ValueError, KeyError):
                continue
            if vol and (vol["num"] not in vols or vol["prix"] < vols[vol["num"]]["prix"]):
                vols[vol["num"]] = vol
    return sorted(vols.values(), key=lambda v: (v["prix"], v["dep"]))


def lire_vol(k, aeroport, noms):
    itineraire, prix = k[0], k[1][0][1]
    segments = itineraire[2]
    if len(segments) != 1 or not prix:
        return None  # pas un vol direct, ou pas de prix
    s = segments[0]
    if s[3] != aeroport or s[6] != ARRIVEE:
        return None
    code, numero = "", ""
    if isinstance(s[22], list) and s[22]:
        code, numero = s[22][0] or "", str(s[22][1] or "")
    nom = (itineraire[1] or [""])[0] or noms.get(code, code)
    if not code:
        code = NOMS.get(nom.lower(), itineraire[0] if len(str(itineraire[0])) == 2 else "")
    if code in COMPAGNIES:
        nom = COMPAGNIES[code]["nom"]
    return {
        "cie": code, "compagnie": nom,
        "num": f"{code} {numero}".strip() if numero else f"{nom} {heure(s[8])}",
        "de": aeroport, "jour": jour_iso(s[20]), "dep": heure(s[8]),
        "jarr": jour_iso(s[21]), "arr": heure(s[10]), "duree": s[11], "avion": s[17] or "",
        "prix": int(prix),
    }


def chercher(aeroport, jour):
    page = fetch_flights_html(requete(aeroport, jour))
    return lire_page(page, aeroport)


# ---------------------------------------------------------------- calendrier à relire

def importance(cle, entree, maintenant, aujourdhui):
    """Plus c'est grand, plus il faut relire ce jour. Au-dessus de 1, il est temps."""
    aeroport, jour = cle.split("|")
    dans = (date.fromisoformat(jour) - aujourdhui).days
    if entree is None:  # jamais lu : Paris d'abord, les dates proches d'abord
        return 1000 + (500 if aeroport in PARIS else 0) - dans
    age = (maintenant - datetime.fromisoformat(entree["lu"])).total_seconds() / 3600
    if entree.get("erreur"):
        intervalle = 3
    elif entree["vols"]:
        intervalle = 6 if dans < 45 else 12 if dans < 120 else 24
    else:  # pas de vol direct ce jour-là : ça change rarement
        intervalle = 48 if aeroport in PARIS else 24 * 7
    return age / intervalle


def a_relire(cache, maintenant, aujourdhui):
    cles = [f"{a}|{aujourdhui + timedelta(days=d)}" for a in DEPARTS for d in range(1, JOURS + 1)]
    notes = [(importance(c, cache.get(c), maintenant, aujourdhui), c) for c in cles]
    return [c for n, c in sorted(notes, reverse=True) if n >= 1][:REQUETES_MAX]


def relire(cache, cles, maintenant):
    debut, verrou = time.monotonic(), Lock()
    etat = {"ok": 0, "erreurs": 0, "suite": 0}

    def une(cle):
        if time.monotonic() - debut > DUREE_MAX or etat["suite"] >= ERREURS_MAX:
            return
        aeroport, jour = cle.split("|")
        try:
            vols = chercher(aeroport, jour)
        except Exception as e:
            with verrou:
                etat["erreurs"] += 1
                etat["suite"] += 1
                if etat["erreurs"] <= 5:
                    print(f"{cle} : erreur {e!r}", file=sys.stderr)
                ancien = cache.get(cle)
                if ancien is None:
                    cache[cle] = {"lu": maintenant.isoformat(), "vols": [], "erreur": True}
                else:
                    ancien["erreur"] = True
            return
        with verrou:
            etat["ok"] += 1
            etat["suite"] = 0
            avant = {v["num"]: v["prix"] for v in (cache.get(cle) or {}).get("vols", [])}
            for v in vols:  # on garde le prix d'avant pour montrer les baisses
                ancien = avant.get(v["num"])
                if ancien and ancien != v["prix"]:
                    v["avant"] = ancien
            cache[cle] = {"lu": datetime.now(timezone.utc).isoformat(timespec="seconds"), "vols": vols}
        time.sleep(0.4)

    with ThreadPoolExecutor(TRAVAILLEURS) as pool:
        list(pool.map(une, cles))
    print(f"Google Flights : {etat['ok']} jours lus, {etat['erreurs']} erreurs")
    return etat


# ---------------------------------------------------------------- page

def main():
    maintenant = datetime.now(timezone.utc)
    aujourdhui = datetime.now(REUNION).date()
    cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
    # on oublie les jours passés
    cache = {c: e for c, e in cache.items() if c.split("|")[1] > str(aujourdhui) and c.split("|")[0] in DEPARTS}
    cles = a_relire(cache, maintenant, aujourdhui)
    print(f"{len(cles)} jours à relire")
    etat = relire(cache, cles, maintenant)
    CACHE_FILE.parent.mkdir(exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")))

    vols, couverture = [], {}
    for cle, entree in cache.items():
        aeroport, jour = cle.split("|")
        c = couverture.setdefault(aeroport, {"lus": 0, "vols": 0})
        if not entree.get("erreur") or entree["vols"]:
            c["lus"] += 1
        for v in entree["vols"]:
            vols.append({**v, "id": f"{v['num']}|{v['jour']}".replace(" ", ""), "lu": entree["lu"][:16]})
            c["vols"] += 1
    vols.sort(key=lambda v: (v["prix"], v["jour"], v["dep"]))
    if not vols and etat["ok"] == 0:
        print("Google n'a pas répondu : la page n'est pas modifiée.")
        sys.exit(1)
    par = {}
    for v in vols:
        par[(v["de"], v["compagnie"])] = par.get((v["de"], v["compagnie"]), 0) + 1
    for (a, c), n in sorted(par.items()):
        print(f"  {a} {c:14} {n} vols")

    vues = {v["cie"] or v["compagnie"] for v in vols}
    compagnies = {code: {**PAR_DEFAUT, **regles} for code, regles in COMPAGNIES.items()}
    for v in vols:  # une compagnie inconnue de COMPAGNIES : règles par défaut
        code = v["cie"] or v["compagnie"]
        compagnies.setdefault(code, {**PAR_DEFAUT, "nom": v["compagnie"]})
    local = datetime.now(REUNION)
    jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    maj = f"{jours[local.weekday()]} {local:%d/%m à %Hh%M} (heure de La Réunion)"
    donnees = {
        "maj": maj, "maj_iso": maintenant.isoformat(timespec="minutes"), "arrivee": ARRIVEE,
        "aeroports": DEPARTS, "jours": JOURS,
        "compagnies": {c: r for c, r in compagnies.items() if c in vues or c in COMPAGNIES},
        "couverture": {a: {**c, "total": JOURS} for a, c in couverture.items()},
        "vols": vols,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "vols.json").write_text(json.dumps(donnees, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    gabarit = (ROOT / "vols_page.html").read_text(encoding="utf-8")
    (OUT_DIR / "index.html").write_text(gabarit.replace("__MAJ__", html.escape(maj))
                                        .replace("__VERSION__", local.strftime("%Y%m%d%H%M")), encoding="utf-8")
    print(f"{len(vols)} vols directs publiés")


if __name__ == "__main__":
    main()
