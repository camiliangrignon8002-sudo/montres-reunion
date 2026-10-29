"""Offres d'alternance et d'emploi à La Réunion.

Alternance (apprentissage, contrat de professionnalisation) : La Bonne Alternance (qui reprend aussi
France Travail, Hellowork, etc.), l'API France Travail et les sites d'emploi, plus les entreprises
qui recrutent souvent des alternants (candidature spontanée).
Emploi (CDI, CDD, intérim, saisonnier) : l'API France Travail et les sites d'emploi. Écrit docs/alternance/index.html
et docs/alternance/annonces.json. Lancé par GitHub Actions (.github/workflows/alternance.yml).

Clés (secrets GitHub, gratuites) :
- LBA_API_TOKEN : jeton de l'API apprentissage (https://api.apprentissage.beta.gouv.fr, « Obtenir un jeton »)
- FT_CLIENT_ID et FT_CLIENT_SECRET : application « Offres d'emploi v2 » sur https://francetravail.io (facultatif)
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

try:
    from curl_cffi import requests
except ImportError:  # pragma: no cover
    import requests

ROOT = Path(__file__).parent
VUS_FILE = ROOT / "data" / "alternance_vus.json"
FICHES_FILE = ROOT / "data" / "alternance_fiches.json"  # annonces des sites d'emploi déjà lues   # id -> date où l'appli a vu l'offre la 1re fois
JSON_FILE = ROOT / "docs" / "alternance" / "annonces.json"
OUT_FILE = ROOT / "docs" / "alternance" / "index.html"
REUNION = timezone(timedelta(hours=4))

LBA_TOKEN = os.environ.get("LBA_API_TOKEN", "")
FT_ID = os.environ.get("FT_CLIENT_ID", "")
FT_SECRET = os.environ.get("FT_CLIENT_SECRET", "")
LBA_URL = "https://api.apprentissage.beta.gouv.fr/api/job/v1/search"
PAGE_URL = os.environ.get("PAGE_URL", "https://camiliangrignon8002-sudo.github.io/montres-reunion/alternance/")
NOTIFIER = os.environ.get("NOTIFIER", "true") == "true"
# Notifications de l'appli (Web Push) : même clé que l'appli Montres (secret VAPID_PRIVATE_KEY)
VAPID_PUBLIQUE = "BELW2vkzh_ExmwyQlA4tQNi6rSXtBDZPDX2i1g-mXCFM2n5sHz6Rw4y065ax3IUcMbcmlRtCNEeXtWAVgpsAsbE"
VAPID_PRIVEE = os.environ.get("VAPID_PRIVATE_KEY", "")
TOPIC_ABONNEMENTS = os.environ.get("TOPIC_ABONNEMENTS", "alternance974-k3v8qz2m-abonnements")
ABONNEMENTS_FILE = ROOT / "data" / "alternance_abonnements.json"
NOTIFS_MAX = 5  # offres envoyées une par une ; au-delà, un résumé

# Zones cherchées : centre, rayon en km et département (pour France Travail).
# Pour chercher ailleurs, ajouter une zone (ex. Paris : (48.8566, 2.3522, 30, "75")).
ZONES = [
    {"nom": "La Réunion", "lat": -21.13, "lon": 55.53, "rayon": 60, "departement": "974"},
]

# Métiers (codes ROME) demandés un par un si l'API refuse une recherche sans métier.
ROMES = ["M1607", "M1602", "M1203", "M1204", "M1205", "M1501", "M1502", "M1503", "M1705", "M1706", "M1707",
         "M1801", "M1802", "M1805", "M1806", "M1810", "D1106", "D1211", "D1212", "D1214", "D1401", "D1402",
         "D1501", "D1502", "D1102", "D1104", "G1602", "G1603", "G1803", "G1703", "G1101", "G1201", "H1203",
         "H1206", "H2502", "I1304", "I1305", "I1604", "I1606", "F1602", "F1603", "F1604", "F1608", "F1703",
         "F1106", "F1104", "J1304", "J1501", "K1302", "K1303", "K1304", "K2111", "N1103", "N1105", "N4101",
         "C1102", "C1206", "C1401", "E1103", "E1205", "A1203", "A1414", "H1502", "M1403", "K1801", "K2104"]

COMMUNES = {  # centre approximatif, pour placer les offres qui n'ont que la commune
    "Saint-Denis": (-20.8823, 55.4504), "Sainte-Clotilde": (-20.8986, 55.4911), "Sainte-Marie": (-20.8969, 55.5495),
    "Sainte-Suzanne": (-20.9064, 55.6070), "Saint-André": (-20.9633, 55.6503), "Bras-Panon": (-21.0016, 55.6773),
    "Saint-Benoît": (-21.0339, 55.7128), "La Plaine-des-Palmistes": (-21.1366, 55.6272), "Sainte-Rose": (-21.1273, 55.7963),
    "Saint-Philippe": (-21.3590, 55.7672), "Saint-Joseph": (-21.3779, 55.6192), "Petite-Île": (-21.3539, 55.5652),
    "Saint-Pierre": (-21.3393, 55.4781), "Le Tampon": (-21.2779, 55.5177), "Entre-Deux": (-21.2470, 55.4720),
    "Saint-Louis": (-21.2862, 55.4114), "L'Étang-Salé": (-21.2650, 55.3664), "Les Avirons": (-21.2413, 55.3392),
    "Saint-Leu": (-21.1706, 55.2884), "Les Trois-Bassins": (-21.1050, 55.3010), "Saint-Paul": (-21.0096, 55.2707),
    "Saint-Gilles-les-Bains": (-21.0539, 55.2253), "Le Port": (-20.9373, 55.2919), "La Possession": (-20.9253, 55.3361),
    "Cilaos": (-21.1340, 55.4718), "Salazie": (-21.0272, 55.5390),
}
CP_COMMUNES = {
    "97400": "Saint-Denis", "97490": "Sainte-Clotilde", "97438": "Sainte-Marie", "97441": "Sainte-Suzanne",
    "97440": "Saint-André", "97412": "Bras-Panon", "97470": "Saint-Benoît", "97431": "La Plaine-des-Palmistes",
    "97439": "Sainte-Rose", "97442": "Saint-Philippe", "97480": "Saint-Joseph", "97429": "Petite-Île",
    "97410": "Saint-Pierre", "97432": "Saint-Pierre", "97430": "Le Tampon", "97418": "Le Tampon", "97414": "Entre-Deux",
    "97450": "Saint-Louis", "97421": "Saint-Louis", "97427": "L'Étang-Salé", "97425": "Les Avirons", "97436": "Saint-Leu",
    "97416": "Saint-Leu", "97426": "Les Trois-Bassins", "97460": "Saint-Paul", "97411": "Saint-Paul", "97422": "Saint-Paul",
    "97423": "Saint-Paul", "97434": "Saint-Gilles-les-Bains", "97435": "Saint-Paul", "97420": "Le Port",
    "97419": "La Possession", "97413": "Cilaos", "97433": "Salazie", "97437": "Saint-Benoît", "97424": "Saint-Louis",
    "97417": "Saint-Denis",
}


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def dig(d, *chemin):
    """d["a"]["b"]… sans planter si une clé manque."""
    for c in chemin:
        if isinstance(d, dict):
            d = d.get(c)
        elif isinstance(d, list) and isinstance(c, int) and len(d) > c:
            d = d[c]
        else:
            return None
    return d


def propre(t, longueur=None):
    t = html.unescape(re.sub(r"<[^>]+>", " ", str(t or "")))
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    t = re.sub(r"\s*\n\s*", "\n", t).strip()
    return t[:longueur] if longueur else t


def liste(v):
    if not v:
        return []
    if isinstance(v, str):
        return [propre(x) for x in re.split(r"\n|•|;", v) if propre(x)]
    return [propre(x.get("libelle") or x.get("label") or "") if isinstance(x, dict) else propre(x) for x in v if x]


TEL = re.compile(r"(?<![\d+])(?:\+33|\+262|0033|00262|0)\s?[1-9](?:[\s.\-]?\d{2}){4}(?!\d)")
MAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def format_tel(t):
    chiffres = re.sub(r"\D", "", t or "")
    if chiffres.startswith("00"):
        chiffres = chiffres[2:]
    if chiffres.startswith("262") or chiffres.startswith("33"):
        chiffres = "0" + chiffres[3 if chiffres.startswith("262") else 2:]
    if len(chiffres) != 10:
        return ""
    return " ".join(chiffres[i:i + 2] for i in range(0, 10, 2))


def commune_de(*textes):
    for t in textes:
        t = t or ""
        cp = re.search(r"\b97[4]\d{2}\b", t)
        if cp and cp.group() in CP_COMMUNES:
            return CP_COMMUNES[cp.group()]
        n = norm(t).replace("-", " ")
        for c in sorted(COMMUNES, key=len, reverse=True):
            if norm(c).replace("-", " ") in n:
                return c
    return ""


NIVEAUX = [("cap", "CAP, BEP"), ("bep", "CAP, BEP"), ("bac+5", "Bac+5"), ("bac +5", "Bac+5"), ("master", "Bac+5"),
           ("ingenieur", "Bac+5"), ("bac+3", "Bac+3"), ("bac +3", "Bac+3"), ("licence", "Bac+3"), ("bachelor", "Bac+3"),
           ("but", "Bac+3"), ("bac+2", "Bac+2"), ("bac +2", "Bac+2"), ("bts", "Bac+2"), ("dut", "Bac+2"),
           ("bac", "Bac"), ("brevet professionnel", "Bac")]
NIVEAU_EUROPEEN = {"3": "CAP, BEP", "4": "Bac", "5": "Bac+2", "6": "Bac+3", "7": "Bac+5", "8": "Bac+5"}


def niveau_de(europeen, *textes):
    if europeen and str(europeen)[-1:] in NIVEAU_EUROPEEN:
        return NIVEAU_EUROPEEN[str(europeen)[-1:]]
    n = " " + norm(" ".join(t or "" for t in textes)) + " "
    for mot, niveau in NIVEAUX:
        if re.search(r"(?<![a-z])" + re.escape(mot) + r"(?![a-z])", n):
            return niveau
    return ""


def type_contrat(*valeurs):
    n = norm(" ".join(str(v) for v in valeurs if v))
    types = []
    if "apprenti" in n:
        types.append("Apprentissage")
    if "profession" in n:
        types.append("Professionnalisation")
    return types or ["Apprentissage"]


def contrat_emploi(*valeurs):
    """CDI, CDD, Intérim, Saisonnier… d'après les libellés et le texte ; None pour un stage."""
    n = norm(" ".join(str(v) for v in valeurs if v))
    if re.search(r"\bstage\b|\bstagiaire\b|\bintern(ship)?\b", n) and not re.search(r"\bcdi\b|\bcdd\b", n):
        return None
    types = []
    for motif, nom in [(r"\bcdi\b|duree indeterminee|permanent", "CDI"), (r"\bcdd\b|duree determinee", "CDD"),
                       (r"interim|\bmis\b|travail temporaire", "Intérim"), (r"saisonn|\bsai\b", "Saisonnier"),
                       (r"independant|freelance|franchise|\blib\b|contractor", "Indépendant")]:
        if re.search(motif, n):
            types.append(nom)
    if not types and re.search(r"temporary|\bseasonal\b", n):
        types.append("CDD")
    if re.search(r"temps partiel|part.time", n):
        types.append("Temps partiel")
    return types or ["Emploi"]


# Domaines (première lettre du code ROME), et mots qui les trahissent quand l'offre n'a pas de code.
DOMAINES = {
    "A": "Agriculture, nature", "B": "Artisanat d'art", "C": "Banque, assurance, immobilier", "D": "Commerce, vente",
    "E": "Communication, médias", "F": "BTP, construction", "G": "Hôtellerie, restauration, tourisme",
    "H": "Industrie", "I": "Mécanique, maintenance", "J": "Santé", "K": "Social, services à la personne",
    "L": "Spectacle, sport", "M": "Gestion, administration", "N": "Transport, logistique",
}
INFORMATIQUE = "Informatique, numérique"
MOTS_DOMAINES = [
    (INFORMATIQUE, r"developpeur|informati|devops|reseau|cyber|web|logiciel|data|numerique|\bit\b|systeme"),
    ("Hôtellerie, restauration, tourisme", r"cuisin|serveu|restaura|hotel|barman|boulang|patiss|commis|plonge|receptionn|touris"),
    ("Commerce, vente", r"vend|commerc|caiss|magasin|employe libre|boutique|conseiller client|e.commerce|merchand"),
    ("BTP, construction", r"macon|electricien|plomb|btp|chantier|charpent|menuisi|peintre|carrel|couvreur|conducteur de travaux|genie civil"),
    ("Mécanique, maintenance", r"mecani|maintenance|carross|vehicule|automobile|garage|technicien de maintenance|frigorist|climatisation"),
    ("Transport, logistique", r"chauffeur|livreu|logisti|cariste|preparateur de commandes|entrepot|transport|manutention"),
    ("Santé", r"infirmi|aide.soignant|pharmac|medical|sante|kine|dentaire|opticien|laborantin"),
    ("Social, services à la personne", r"aide a domicile|auxiliaire de vie|educat|animat|petite enfance|aesh|atsem|nettoyage|menage|agent d.entretien|coiff|esthetic|securite|agent de surete"),
    ("Banque, assurance, immobilier", r"banque|bancaire|assuran|immobili|credit|conseiller financier"),
    ("Gestion, administration", r"comptab|assistant|administrati|ressources humaines|\brh\b|secretair|gestion|paie|juridique|accueil|marketing|achat"),
    ("Communication, médias", r"communication|graphis|journalis|community manager|audiovisu|redact"),
    ("Agriculture, nature", r"agricol|agricult|paysag|jardin|espaces verts|elevage|horticul|maraich"),
    ("Industrie", r"industri|production|operateur|usine|soudeu|chaudronn|agroalimentaire|qualite"),
    ("Spectacle, sport", r"sport|coach|spectacle|musique|animateur sportif"),
]


def domaine_de(romes, *textes):
    romes = [romes] if isinstance(romes, str) else romes or []
    for r in romes:
        r = str(r).upper()
        if r.startswith("M18"):  # systèmes d'information
            return INFORMATIQUE
        if r[:1] in DOMAINES:
            return DOMAINES[r[:1]]
    n = norm(" ".join(t or "" for t in textes))
    for nom, motif in MOTS_DOMAINES:
        if re.search(motif, n):
            return nom
    return "Autres"


def date_courte(v):
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(v or ""))
    return m.group(1) if m else ""


def offre(**champs):
    a = {"categorie": "alternance", "type": "offre", "titre": "", "entreprise": "", "secteur": "", "taille": "", "description": "",
         "a_apprendre": [], "attendu": [], "niveau": "", "contrats": ["Apprentissage"], "debut": "", "duree": "",
         "teletravail": "", "postes": None, "salaire": "", "adresse": "", "commune": "", "lat": None, "lon": None,
         "tel": "", "email": "", "site": "", "postuler": "", "source": "", "publie": "", "siret": "", "ids": []}
    a.update({k: v for k, v in champs.items() if v not in (None, "", [])})
    texte_complet = " ".join([a["description"], " ".join(a["attendu"])])
    if not a["tel"]:
        m = TEL.search(texte_complet)
        a["tel"] = format_tel(m.group()) if m else ""
    else:
        a["tel"] = format_tel(a["tel"])
    if not a["email"]:
        m = MAIL.search(texte_complet)
        a["email"] = m.group().rstrip(".") if m else ""
    if not a["commune"]:
        a["commune"] = commune_de(a["adresse"])
    if (a["lat"] is None or a["lon"] is None) and a["commune"] in COMMUNES:
        a["lat"], a["lon"] = COMMUNES[a["commune"]]
        a["position_approx"] = True
    if not a["niveau"] and a["categorie"] == "alternance":
        a["niveau"] = niveau_de(None, a["titre"], a["description"])
    if not a.get("domaine"):
        a["domaine"] = domaine_de(a.pop("romes", None), a["titre"], a["secteur"]) if a["type"] == "offre" or a["secteur"] \
            else "Autres"
    a.pop("romes", None)
    for cle in ("site", "postuler"):
        if a[cle] and not re.match(r"https?://", a[cle]):
            a[cle] = "https://" + a[cle] if "." in a[cle] and " " not in a[cle] else ""
    return a


# ---------------------------------------------------------------- La Bonne Alternance

def lba_get(params):
    for essai in range(3):
        try:
            r = requests.get(LBA_URL, params=params, timeout=60,
                             headers={"Authorization": f"Bearer {LBA_TOKEN}", "Accept": "application/json"})
            if r.status_code == 200:
                return r.json()
            print(f"  La Bonne Alternance : {r.status_code} {r.text[:200]}", file=sys.stderr)
            if r.status_code in (400, 401, 403, 404):
                return r.status_code
        except Exception as e:
            print(f"  La Bonne Alternance : erreur {e!r}", file=sys.stderr)
        time.sleep(5 * (essai + 1))
    return None


def lba_lieu(w):
    loc = dig(w, "location") or {}
    coords = dig(loc, "geopoint", "coordinates") or []
    lat = lon = None
    if len(coords) == 2:
        lon, lat = coords
    return {"adresse": propre(loc.get("address")), "lat": lat, "lon": lon}


def lba_entreprise(w):
    return {"entreprise": propre(w.get("brand") or w.get("name") or w.get("legal_name")),
            "secteur": propre(dig(w, "domain", "naf", "label")), "taille": propre(w.get("size")),
            "site": propre(w.get("website")), "siret": propre(w.get("siret")),
            "a_propos": propre(w.get("description"), 1500)}


def lba_job(j):
    w, o, c, ap = j.get("workplace") or {}, j.get("offer") or {}, j.get("contract") or {}, j.get("apply") or {}
    ident = j.get("identifier") or {}
    partenaire = propre(ident.get("partner_label"))
    ids = [f"lba:{ident.get('id')}"]
    if ident.get("partner_job_id") and "france travail" in norm(partenaire):
        ids.append(f"ft:{ident['partner_job_id']}")
    duree = c.get("duration")
    return offre(
        titre=propre(o.get("title")), description=propre(o.get("description"), 4000), romes=o.get("rome_codes"),
        a_apprendre=liste(o.get("to_be_acquired_skills")), attendu=liste(o.get("desired_skills")),
        niveau=niveau_de(dig(o, "target_diploma", "european"), dig(o, "target_diploma", "label") or ""),
        contrats=type_contrat(*(c.get("type") or [])), debut=date_courte(c.get("start")),
        duree=f"{duree} mois" if isinstance(duree, (int, float)) else propre(duree),
        teletravail={"onsite": "", "remote": "Télétravail", "hybrid": "Télétravail partiel"}.get(c.get("remote") or "", ""),
        postes=o.get("opening_count"), publie=date_courte(dig(o, "publication", "creation")),
        tel=propre(ap.get("phone")), postuler=propre(ap.get("url")),
        source="La Bonne Alternance" if not partenaire or "bonne alternance" in norm(partenaire) else partenaire,
        ids=ids, **lba_lieu(w), **lba_entreprise(w))


def lba_recruteur(r):
    w, ap = r.get("workplace") or {}, r.get("apply") or {}
    a = offre(type="spontanee", titre="Candidature spontanée", tel=propre(ap.get("phone")),
              postuler=propre(ap.get("url")), source="La Bonne Alternance",
              ids=[f"lba:{dig(r, 'identifier', 'id') or w.get('siret')}"], **lba_lieu(w), **lba_entreprise(w))
    a["description"] = ("Cette entreprise recrute régulièrement des alternants. Elle n'a pas publié d'offre, "
                        "mais tu peux lui envoyer une candidature spontanée.")
    return a


def lba_public():
    """Sans jeton : l'ancienne API publique de La Bonne Alternance (si elle répond encore)."""
    res = []
    for z in ZONES:
        for i in range(0, len(ROMES), 10):
            try:
                r = requests.get("https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/jobs",
                                 params={"romes": ",".join(ROMES[i:i + 10]), "latitude": z["lat"], "longitude": z["lon"],
                                         "radius": z["rayon"], "caller": "alternance974", "insee": "97411"}, timeout=60)
            except Exception as e:
                print(f"  La Bonne Alternance (public) : erreur {e!r}", file=sys.stderr)
                return res
            if r.status_code != 200:
                print(f"  La Bonne Alternance (public) : {r.status_code} {r.text[:150]}", file=sys.stderr)
                return res
            d = r.json()
            for cle in ("peJobs", "matchas", "partnerJobs", "lbaCompanies", "lbbCompanies"):
                bloc = d.get(cle) or {}
                for x in (bloc.get("results") if isinstance(bloc, dict) else bloc) or []:
                    a = lba_v1(x, spont=cle in ("lbaCompanies", "lbbCompanies"))
                    if a:
                        res.append(a)
            time.sleep(1)
    return res


def lba_v1(x, spont):
    place, ent, job, contact = x.get("place") or {}, x.get("company") or {}, x.get("job") or {}, x.get("contact") or {}
    titre = "Candidature spontanée" if spont else propre(x.get("title"))
    if not titre or not ent.get("name"):
        return None
    a = offre(type="spontanee" if spont else "offre", titre=titre, entreprise=propre(ent.get("name")),
              siret=propre(ent.get("siret")), secteur=propre(dig(x, "nafs", 0, "label")), romes=[r.get("code") for r in x.get("romes") or [] if isinstance(r, dict)],
              description=propre(job.get("description") or x.get("description"), 4000),
              debut=date_courte(job.get("jobStartDate")), publie=date_courte(job.get("creationDate")),
              contrats=type_contrat(job.get("contractType"), titre), adresse=propre(place.get("fullAddress")),
              commune=commune_de(place.get("zipCode"), place.get("city"), place.get("fullAddress")),
              lat=place.get("latitude"), lon=place.get("longitude"), tel=propre(contact.get("phone")),
              email=propre(contact.get("email")), site=propre(ent.get("url")),
              postuler=propre(x.get("url")) or f"https://labonnealternance.apprentissage.beta.gouv.fr/recherche-apprentissage?display=list&itemId={x.get('id', '')}",
              source="La Bonne Alternance", ids=[f"lba1:{x.get('id') or ent.get('siret')}"])
    if spont:
        a["description"] = ("Cette entreprise recrute régulièrement des alternants. Elle n'a pas publié d'offre, "
                            "mais tu peux lui envoyer une candidature spontanée.")
    for k in ("lat", "lon"):
        try:
            a[k] = float(a[k]) if a[k] is not None else None
        except (TypeError, ValueError):
            a[k] = None
    return a


def bonne_alternance():
    if not LBA_TOKEN:
        print("La Bonne Alternance : pas de jeton LBA_API_TOKEN, essai de l'accès public")
        return lba_public()
    res = []
    for z in ZONES:
        base = {"latitude": z["lat"], "longitude": z["lon"], "radius": z["rayon"]}
        donnees = lba_get(base)
        paquets = [donnees] if isinstance(donnees, dict) else []
        if donnees == 400:  # l'API veut des métiers : on les demande par paquets
            for i in range(0, len(ROMES), 10):
                d = lba_get({**base, "romes": ",".join(ROMES[i:i + 10])})
                if isinstance(d, dict):
                    paquets.append(d)
                time.sleep(1)
        for d in paquets:
            for w in d.get("warnings") or []:
                print(f"  avertissement : {w}", file=sys.stderr)
            res += [lba_job(j) for j in d.get("jobs") or []]
            res += [lba_recruteur(r) for r in d.get("recruiters") or []]
    return res


# ---------------------------------------------------------------- France Travail

def france_travail():
    if not (FT_ID and FT_SECRET):
        print("France Travail : pas de clés FT_CLIENT_ID / FT_CLIENT_SECRET, source ignorée")
        return []
    r = requests.post("https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire",
                      data={"grant_type": "client_credentials", "client_id": FT_ID, "client_secret": FT_SECRET,
                            "scope": "api_offresdemploiv2 o2dsoffre"}, timeout=60)
    r.raise_for_status()
    jeton = r.json()["access_token"]
    res = []
    # l'API rend 3 150 offres au plus par recherche : on découpe par nature et par type de contrat
    recherches = [{"natureContrat": "E2,FS"}] + [{"typeContrat": t} for t in ("CDI", "CDD", "MIS", "SAI", "LIB,FRA,DIN,CCE,DDI,DDT,TTI")]
    for z in ZONES:
        if not z.get("departement"):
            continue
        for filtre in recherches:
            for debut in range(0, 3000, 150):  # 150 offres au plus par page
                r = requests.get("https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search",
                                 params={"departement": z["departement"], "range": f"{debut}-{debut + 149}", **filtre},
                                 headers={"Authorization": f"Bearer {jeton}", "Accept": "application/json"}, timeout=60)
                if r.status_code == 204:
                    break
                if r.status_code not in (200, 206):
                    print(f"  France Travail : {r.status_code} {r.text[:200]}", file=sys.stderr)
                    break
                page = r.json().get("resultats") or []
                res += [a for a in map(ft_offre, page) if a]
                if len(page) < 150:
                    break
                time.sleep(0.3)
    return res


def ft_offre(o):
    lieu, ent, contact = o.get("lieuTravail") or {}, o.get("entreprise") or {}, o.get("contact") or {}
    coord = " ".join(str(contact.get(k) or "") for k in ("coordonnees1", "coordonnees2", "coordonnees3"))
    mail = contact.get("courriel") or ""
    if mail and not MAIL.fullmatch(mail.strip()):  # « Pour postuler, utiliser le lien suivant : … »
        mail = ""
    commune = commune_de(lieu.get("codePostal"), lieu.get("libelle"), lieu.get("commune"))
    alternance = o.get("natureContrat") in ("Contrat apprentissage", "Cont. professionnalisation") or \
        bool(re.search(r"apprenti|professionnalisation", norm(o.get("natureContrat"))))
    contrats = type_contrat(o.get("natureContrat"), o.get("typeContratLibelle")) if alternance else \
        contrat_emploi(o.get("typeContrat"), o.get("typeContratLibelle"), o.get("dureeTravailLibelleConverti"))
    if not contrats:
        return None
    return offre(
        categorie="alternance" if alternance else "emploi", contrats=contrats,
        romes=o.get("romeCode"), titre=propre(o.get("intitule")), entreprise=propre(ent.get("nom")), a_propos=propre(ent.get("description"), 1500),
        site=propre(ent.get("url")), secteur=propre(o.get("secteurActiviteLibelle")),
        description=propre(o.get("description"), 4000),
        attendu=liste(o.get("competences")) + liste(o.get("qualitesProfessionnelles")),
        niveau=niveau_de(None, " ".join(f.get("niveauLibelle", "") for f in o.get("formations") or []),
                         o.get("intitule") or "") if alternance else "",
        duree=propre(o.get("typeContratLibelle")) if "mois" in norm(o.get("typeContratLibelle")) else "",
        experience=propre(o.get("experienceLibelle")), horaires=propre(o.get("dureeTravailLibelle")),
        postes=o.get("nombrePostes"), salaire=propre(dig(o, "salaire", "libelle")),
        adresse="" if re.match(r"\s*\d+\s*-", lieu.get("libelle") or "") else propre(lieu.get("libelle")), commune=commune,
        lat=lieu.get("latitude"), lon=lieu.get("longitude"),
        tel=propre(contact.get("telephone")) or (format_tel(TEL.search(coord).group()) if TEL.search(coord) else ""),
        email=propre(mail),
        postuler=propre(contact.get("urlPostulation") or dig(o, "origineOffre", "urlOrigine")
                        or f"https://candidat.francetravail.fr/offres/recherche/detail/{o.get('id')}"),
        publie=date_courte(o.get("dateCreation")), source="France Travail", ids=[f"ft:{o.get('id')}"])


# ---------------------------------------------------------------- sites d'emploi (fiches JobPosting)

# Pages de recherche « alternance à La Réunion » et forme des liens vers les offres.
# Chaque offre est lue dans son bloc JSON-LD JobPosting (format standard de Google pour l'emploi).
# {q} vaut « alternance » puis rien (toutes les offres d'emploi).
SITES = [
    ("HelloWork", "https://www.hellowork.com/fr-fr/emploi/recherche.html?k={q}&l=La+R%C3%A9union&p={page}",
     r"/fr-fr/emplois/\d+\.html"),
    ("Domtomemploi", "https://www.domtomemploi.fr/offres-emploi?keywords={q}&location=La+R%C3%A9union&page={page}",
     r"/offres-emploi/[a-z0-9-]+-\d+"),
    ("Meteojob", "https://www.meteojob.com/jobs?what={q}&where=La%20R%C3%A9union&page={page}",
     r"/candidat/offres/offre-d-emploi-[^\"'#?]+"),
    ("ParuVendu", "https://www.paruvendu.fr/emploi/annonces/?tt=1&r={q}&lo=974&p={page}",
     r"/a/emploi/[^\"'#?]+"),
] + [  # la-mairie.com : offres par commune (alt=1 : alternance seulement)
    ("La Mairie", f"https://www.la-mairie.com/{c}/emploi?{{alt}}p={{page}}", rf"/{c}/emploi/[^\"'#?]+")
    for c in ("saint-denis", "saint-pierre", "saint-paul", "le-port", "saint-andre", "le-tampon", "saint-louis",
              "sainte-marie", "saint-benoit", "la-possession")
]
PAGES_PAR_SITE = 40      # pages de résultats parcourues au plus par recherche
LECTURES_MAX = 600       # annonces nouvelles lues au plus par passage (la suite au passage suivant)
DUREE_MAX = 30 * 60      # secondes
ALTERNANCE = re.compile(r"alternan|apprenti|professionnalisation|\bcfa\b", re.I)


def get(url):
    for essai in range(2):
        try:
            kw = {"impersonate": "chrome"} if requests.__name__.startswith("curl_cffi") else {}
            r = requests.get(url, timeout=40, **kw)
            if r.status_code == 200:
                return r.text
            print(f"  {r.status_code} {url}", file=sys.stderr)
            if r.status_code in (403, 404, 410):
                return None
        except Exception as e:
            print(f"  erreur {url}: {e!r}", file=sys.stderr)
        time.sleep(3)
    return None


def job_postings(h):
    res = []
    for bloc in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', h or "", re.S | re.I):
        try:
            d = json.loads(bloc.strip())
        except ValueError:
            continue
        pile = d if isinstance(d, list) else [d]
        while pile:
            x = pile.pop()
            if isinstance(x, list):
                pile += x
            elif isinstance(x, dict):
                t = x.get("@type")
                if t == "JobPosting" or (isinstance(t, list) and "JobPosting" in t):
                    res.append(x)
                pile += [v for k, v in x.items() if k in ("@graph", "itemListElement", "item")]
    return res


def depuis_jobposting(j, url, site):
    lieu = j.get("jobLocation")
    lieu = lieu[0] if isinstance(lieu, list) and lieu else lieu or {}
    adr = dig(lieu, "address") or {}
    if isinstance(adr, str):
        adr = {"streetAddress": adr}
    geo = dig(lieu, "geo") or {}
    org = j.get("hiringOrganization") or {}
    if isinstance(org, str):
        org = {"name": org}
    texte = " ".join(str(j.get(k) or "") for k in ("title", "employmentType", "description"))
    alternance = bool(ALTERNANCE.search(" ".join(str(j.get(k) or "") for k in ("title", "employmentType"))) or
                      re.search(r"contrat d.apprentissage|contrat de professionnalisation|en alternance", texte, re.I))
    contrats = type_contrat(texte) if alternance else contrat_emploi(j.get("employmentType"), j.get("title"), texte[:600])
    adresse = ", ".join(propre(adr.get(k)) for k in ("streetAddress", "postalCode", "addressLocality") if adr.get(k))

    def nombre(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    if not contrats:  # stage
        return None
    salaire = j.get("baseSalary")
    if isinstance(salaire, dict):
        v = salaire.get("value") or {}
        mini, maxi = (v.get("minValue"), v.get("maxValue")) if isinstance(v, dict) else (v, None)
        unite = {"HOUR": "/heure", "MONTH": "/mois", "YEAR": "/an"}.get(str(v.get("unitText") if isinstance(v, dict) else "").upper(), "")
        salaire = " – ".join(f"{m:g} €" if isinstance(m, (int, float)) else str(m) for m in (mini, maxi) if m) + unite
    return offre(
        categorie="alternance" if alternance else "emploi", contrats=contrats, salaire=propre(salaire),
        titre=propre(j.get("title")), entreprise=propre(org.get("name")), site=propre(org.get("sameAs") or org.get("url")),
        description=propre(j.get("description"), 4000),
        niveau=niveau_de(None, propre(dig(j, "educationRequirements", "credentialCategory")
                                       or j.get("educationRequirements") or ""), texte) if alternance else "",
        debut=date_courte(j.get("jobStartDate")), publie=date_courte(j.get("datePosted")),
        adresse=adresse, commune=commune_de(adr.get("postalCode"), adr.get("addressLocality"), adresse),
        lat=nombre(geo.get("latitude")), lon=nombre(geo.get("longitude")),
        tel=propre(org.get("telephone") or dig(j, "applicationContact", "telephone")),
        email=propre(org.get("email") or dig(j, "applicationContact", "email")),
        postuler=propre(j.get("url") or url), source=site, ids=[f"url:{url.split('?')[0]}"])


def meta_page(h, nom):
    m = re.search(r'<meta[^>]+(?:property|name)=["\']' + re.escape(nom) + r'["\'][^>]*content=["\']([^"\']*)', h or "", re.I) or \
        re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + re.escape(nom) + r'["\']', h or "", re.I)
    return propre(m.group(1)) if m else ""


def depuis_page(h, url, site):
    """Offre lue sans JobPosting : titre et description de la page, commune d'après le texte."""
    titre = meta_page(h, "og:title") or propre((re.search(r"<title>(.*?)</title>", h or "", re.S | re.I) or [None, ""])[1])
    titre = re.split(r"\s+[|–-]\s+(?:HelloWork|Meteojob|ParuVendu|Domtomemploi|la-mairie|La Mairie)", titre, flags=re.I)[0]
    description = meta_page(h, "og:description") or meta_page(h, "description")
    texte = propre(re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h or "", flags=re.S | re.I))[:20000]
    commune = commune_de(titre, description, texte[:3000])
    if not titre or not (commune or re.search(r"r[ée]union|\b974\d\d\b", texte, re.I)):
        return None
    alternance = bool(re.search(r"alternan|apprenti|professionnalisation", titre + " " + description, re.I))
    contrats = type_contrat(titre, description) if alternance else contrat_emploi(titre, description, texte[:1500])
    if not contrats:
        return None
    ent = re.search(r'"hiringOrganization"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"', h or "") or \
        re.search(r"(?:Entreprise|Société|Employeur)\s*:?\s*([A-Z][^\n<]{2,60})", texte)
    return offre(categorie="alternance" if alternance else "emploi", contrats=contrats, titre=titre,
                 entreprise=propre(ent.group(1)) if ent else "Entreprise (voir l'annonce)",
                 description=description, commune=commune or "La Réunion", postuler=url, source=site,
                 ids=[f"url:{url.split('?')[0]}"])


def sites_emploi():
    res = []
    recherches = []
    for site, recherche, motif in SITES:
        if "{alt}" in recherche:
            recherches += [(site, recherche.replace("{alt}", a), motif) for a in ("alt=1&", "")]
        elif "{q}" in recherche:
            recherches += [(site, recherche.replace("{q}", q), motif) for q in ("alternance", "")]
        else:
            recherches.append((site, recherche, motif))
    # Annonces déjà lues (url -> offres) : seules les nouvelles sont lues. Une annonce reste tant qu'elle
    # figure dans les résultats du site (ou 3 jours au plus si le site ne répond pas).
    cache = json.loads(FICHES_FILE.read_text()) if FICHES_FILE.exists() else {}
    maintenant = datetime.now(timezone.utc)
    debut, lectures = time.time(), 0
    for site, recherche, motif in recherches:
        hote = re.match(r"https?://[^/]+", recherche).group()
        liens = []
        for page in range(1, PAGES_PAR_SITE + 1):  # toutes les pages de résultats
            h = get(recherche.format(page=page))
            if not h:
                break
            trouves = [hote + l if l.startswith("/") else l for l in re.findall(r'href="((?:https?://[^"/]+)?' + motif + ')"', h)]
            nouveaux = [l for l in dict.fromkeys(trouves) if l not in liens]
            if page == 1 and not nouveaux:
                print(f"  {site} : aucun lien d'offre sur {recherche.format(page=1)} ({len(h)} caractères)")
            if not nouveaux:
                break
            liens += nouveaux
            time.sleep(0.3)
        for url in liens:
            cache.setdefault(url, {"site": site, "offres": [], "lu": ""})["vu_liste"] = maintenant.isoformat()
        a_lire = [u for u in liens if not cache[u]["lu"] or cache[u]["lu"] < (maintenant - timedelta(days=30)).isoformat()]
        lues_ici = 0
        for n, url in enumerate(a_lire):
            if lectures >= LECTURES_MAX or time.time() - debut > DUREE_MAX:
                break  # la suite au prochain passage
            h = get(url)
            lectures += 1
            if h is None:
                continue
            fiches = job_postings(h)
            if n == 0:  # pour le rapport : ce que la première page contient
                adr = json.dumps(dig(fiches[0], "jobLocation") if fiches else None, ensure_ascii=False)[:160]
                print(f"  {site} 1re offre lue : {len(h)} caractères, {len(fiches)} JobPosting, lieu {adr}")
            offres_url = []
            for a in [depuis_jobposting(j, url, site) for j in fiches] or [depuis_page(h, url, site)]:
                if a and not a["commune"]:  # la recherche était limitée à La Réunion
                    texte_page = propre(h)[:5000]
                    a["commune"] = commune_de(texte_page) or ("La Réunion" if re.search(r"r[ée]union|\b974", texte_page, re.I) else "")
                if a and a["commune"]:
                    offres_url.append(a)
            cache[url].update(offres=offres_url, lu=maintenant.isoformat())
            lues_ici += 1
            time.sleep(0.3)
        print(f"  {site} : {len(liens)} annonces en ligne, {lues_ici} lues ce passage ({recherche.split('?')[0]})")
    limite = (maintenant - timedelta(days=3)).isoformat()
    cache = {u: c for u, c in cache.items() if c.get("vu_liste", "") > limite}
    FICHES_FILE.parent.mkdir(exist_ok=True)
    FICHES_FILE.write_text(json.dumps(cache, ensure_ascii=False))
    print(f"  Sites d'emploi : {lectures} annonces lues, {sum(not c['lu'] for c in cache.values())} restent à lire")
    return [json.loads(json.dumps(a)) for c in cache.values() for a in c["offres"]]


# ---------------------------------------------------------------- tri et page

def dans_une_zone(a):
    if a["lat"] is None or a["lon"] is None:
        return bool(a["commune"])  # commune réunionnaise, ou « La Réunion » pour les recherches limitées à l'île
    from math import radians, sin, cos, asin, sqrt
    for z in ZONES:
        dlat, dlon = radians(a["lat"] - z["lat"]), radians(a["lon"] - z["lon"])
        h = sin(dlat / 2) ** 2 + cos(radians(z["lat"])) * cos(radians(a["lat"])) * sin(dlon / 2) ** 2
        if 2 * 6371 * asin(sqrt(h)) <= z["rayon"] + 5:
            return True
    return False


def sans_doublons(offres):
    """Une offre vue par plusieurs sources n'apparaît qu'une fois (on garde la plus complète)."""
    def score(a):
        return sum(bool(a[k]) for k in ("description", "tel", "email", "site", "postuler", "a_apprendre", "attendu"))
    par_id, res = {}, []
    for a in sorted(offres, key=score, reverse=True):
        cle = f"{a['categorie']}|{norm(a['titre'])}|{norm(a['entreprise'])}|{a['commune']}" if a["type"] == "offre" else None
        if cle:
            a["ids"].append(cle)
        if a["type"] == "spontanee" and a["siret"]:
            a["ids"].append(f"siret:{a['siret']}")
        if any(i in par_id for i in a["ids"]):
            garde = next(par_id[i] for i in a["ids"] if i in par_id)
            for k, v in a.items():  # on complète avec ce que l'autre source sait en plus
                if not garde.get(k) and v:
                    garde[k] = v
            for i in a["ids"]:
                par_id[i] = garde
            continue
        for i in a["ids"]:
            par_id[i] = a
        res.append(a)
    # une entreprise qui a déjà une vraie offre n'a pas besoin de sa carte « candidature spontanée »
    avec_offre = {a["siret"] for a in res if a["type"] == "offre" and a["categorie"] == "alternance" and a["siret"]}
    return [a for a in res if not (a["type"] == "spontanee" and a["siret"] in avec_offre)]


# ---------------------------------------------------------------- notifications

def abonnements():
    """Téléphones abonnés, avec leurs choix (section, domaines, lieu, rayon). Le dernier message d'un téléphone l'emporte."""
    connus = {a["endpoint"]: a for a in (json.loads(ABONNEMENTS_FILE.read_text()) if ABONNEMENTS_FILE.exists() else [])}
    try:
        r = requests.get(f"https://ntfy.sh/{TOPIC_ABONNEMENTS}/json?poll=1&since=all", timeout=30)
        for ligne in r.text.splitlines():
            try:
                m = json.loads(json.loads(ligne).get("message", ""))
            except (ValueError, TypeError):
                continue
            abo = m.get("abo") if isinstance(m, dict) else None
            if not (isinstance(abo, dict) and str(abo.get("endpoint", "")).startswith("https://") and "keys" in abo):
                continue
            if m.get("stop"):
                connus.pop(abo["endpoint"], None)
            else:
                choix = m.get("choix") if isinstance(m.get("choix"), dict) else {}
                connus[abo["endpoint"]] = {**abo, "choix": choix}
    except Exception as e:
        print(f"::warning::abonnements ntfy : {e!r}")
    ABONNEMENTS_FILE.parent.mkdir(exist_ok=True)
    ABONNEMENTS_FILE.write_text(json.dumps(list(connus.values()), indent=1))
    return list(connus.values())


def distance(a, lat, lon):
    from math import radians, sin, cos, asin, sqrt
    dlat, dlon = radians(a["lat"] - lat), radians(a["lon"] - lon)
    h = sin(dlat / 2) ** 2 + cos(radians(lat)) * cos(radians(a["lat"])) * sin(dlon / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def pour_lui(a, choix):
    """L'offre correspond-elle à ce que ce téléphone a demandé ?"""
    sections = choix.get("sections") or ["alternance", "emploi"]
    if a["categorie"] not in sections:
        return False
    if a["type"] == "spontanee" and not choix.get("spontanees"):
        return False
    if choix.get("domaines") and a["domaine"] not in choix["domaines"]:
        return False
    try:
        lat, lon, rayon = float(choix["lat"]), float(choix["lon"]), float(choix["rayon"])
    except (KeyError, TypeError, ValueError):
        return True
    return rayon >= 70 or (a["lat"] is not None and distance(a, lat, lon) <= rayon)


def notifier(nouvelles):
    abos = abonnements()
    if not (NOTIFIER and VAPID_PRIVEE and abos and nouvelles):
        print(f"Notifications : {len(abos)} téléphone(s) abonné(s), {len(nouvelles)} nouvelle(s) offre(s)"
              + ("" if VAPID_PRIVEE else ", pas de clé VAPID_PRIVATE_KEY"))
        return
    from pywebpush import webpush, WebPushException
    atteints, morts = 0, []
    for abo in abos:
        siennes = [a for a in nouvelles if pour_lui(a, abo.get("choix") or {})]
        if not siennes:
            continue
        messages = []
        if len(siennes) > 1:
            nb_e = sum(a["categorie"] == "emploi" for a in siennes)
            detail = " et ".join(t for t in (f"{len(siennes) - nb_e} en alternance" if len(siennes) > nb_e else "",
                                             f"{nb_e} en emploi" if nb_e else "") if t)
            messages.append({"title": f"{len(siennes)} nouvelles offres pour toi", "body": f"{detail} à La Réunion.",
                             "url": PAGE_URL, "badge": len(siennes), "tag": "resume"})
        for a in siennes[:NOTIFS_MAX]:
            quoi = "Alternance" if a["categorie"] == "alternance" else " · ".join(a["contrats"][:2])
            messages.append({"title": f"{quoi} · {a['commune'] or 'La Réunion'}",
                             "body": f"{a['titre']} — {a['entreprise']}"
                             if a["type"] == "offre" else f"{a['entreprise']} recrute des alternants (candidature spontanée)",
                             "url": f"{PAGE_URL}#{a['id']}", "badge": len(siennes), "tag": a["id"]})
        ok = False
        for m in messages:
            try:
                webpush(subscription_info={k: abo[k] for k in ("endpoint", "keys")}, data=json.dumps(m, ensure_ascii=False),
                        vapid_private_key=VAPID_PRIVEE, ttl=86400,
                        vapid_claims={"sub": "mailto:montres-reunion@users.noreply.github.com"})
                ok = True
            except WebPushException as e:
                if e.response is not None and e.response.status_code in (404, 410):
                    morts.append(abo["endpoint"])  # téléphone désabonné
                    break
                print(f"::warning::web push : {e}")
        atteints += ok
    if morts:
        ABONNEMENTS_FILE.write_text(json.dumps([a for a in abos if a["endpoint"] not in morts], indent=1))
    print(f"Notifications : {atteints} téléphone(s) prévenu(s) sur {len(abos)}")


def page_html(offres, maj, sources_ok):
    donnees = json.dumps(offres, ensure_ascii=False).replace("</", "<\\/")
    communes = json.dumps(COMMUNES, ensure_ascii=False)
    z = ZONES[0]
    gabarit = (ROOT / "alternance_page.html").read_text(encoding="utf-8")
    return (gabarit.replace("__DONNEES__", donnees).replace("__COMMUNES__", communes)
            .replace("__CENTRE__", json.dumps([z["lat"], z["lon"]])).replace("__ZONE__", html.escape(z["nom"]))
            .replace("__VAPID__", VAPID_PUBLIQUE).replace("__TOPIC__", TOPIC_ABONNEMENTS)
            .replace("__MAJ__", html.escape(maj)).replace("__SOURCES__", html.escape(", ".join(sources_ok) or "aucune")))


def main():
    vus = json.loads(VUS_FILE.read_text()) if VUS_FILE.exists() else {}
    toutes, sources_ok = [], []
    for nom, fonction in [("La Bonne Alternance", bonne_alternance), ("France Travail", france_travail),
                          ("Sites d'emploi", sites_emploi)]:
        try:
            trouvees = fonction()
        except Exception as e:
            print(f"{nom} : erreur {e!r}", file=sys.stderr)
            continue
        print(f"{nom} : {len(trouvees)} offres")
        if trouvees:
            sources_ok += sorted({a["source"] for a in trouvees}) if fonction is sites_emploi else [nom]
        toutes += trouvees
    gardees = sans_doublons([a for a in toutes if a["titre"] and a["entreprise"] and dans_une_zone(a)])
    maintenant = datetime.now(REUNION)
    premiere_fois = not vus  # au tout premier passage, tout est « nouveau » : on ne notifie pas
    en_ligne = set()
    for a in gardees:
        deja = [vus[i] for i in a["ids"] if i in vus]
        a["id"] = a["ids"][0]
        a["vu"] = min(deja) if deja else maintenant.isoformat(timespec="minutes")
        for i in a.pop("ids"):
            vus[i] = a["vu"]
            en_ligne.add(i)
        a.pop("siret", None)
    # les offres d'abord, les plus récentes en tête ; puis les candidatures spontanées
    offres_ = sorted((a for a in gardees if a["type"] == "offre"), key=lambda a: (a["publie"] or a["vu"][:10], a["vu"]), reverse=True)
    gardees = offres_ + [a for a in gardees if a["type"] != "offre"]
    nb_emploi = sum(a["categorie"] == "emploi" for a in offres_)
    print(f"Gardées : {len(offres_) - nb_emploi} offres d'alternance, {nb_emploi} offres d'emploi, "
          f"{len(gardees) - len(offres_)} entreprises en candidature spontanée")
    jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    maj = f"{jours[maintenant.weekday()]} {maintenant:%d/%m à %Hh%M}"
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not toutes and JSON_FILE.exists():
        print("Aucune source n'a répondu : les offres ne sont pas modifiées.")
        return
    # on garde la date de 1re vue des offres encore en ligne (même anciennes), et 60 jours pour les autres
    limite = (maintenant - timedelta(days=60)).isoformat()
    vus = {i: d for i, d in vus.items() if i in en_ligne or d > limite}
    VUS_FILE.parent.mkdir(exist_ok=True)
    VUS_FILE.write_text(json.dumps(vus, ensure_ascii=False))
    JSON_FILE.write_text(json.dumps(gardees, ensure_ascii=False, indent=1))
    OUT_FILE.write_text(page_html(gardees, maj, sources_ok), encoding="utf-8")
    nouvelles = [a for a in gardees if a["vu"] == maintenant.isoformat(timespec="minutes")]
    if not premiere_fois:
        notifier(nouvelles)


if __name__ == "__main__":
    main()
