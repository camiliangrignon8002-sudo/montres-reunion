"use strict";
/* Monalex — fonctionnement de l'appli.
   Données : montres.json (montres + vendeurs). Compte, favoris, suivis et demandes : gardés sur l'appareil. */

const CONFIG = {
  origine: { lat: 43.7384, lng: 7.4246, nom: "Monaco" },
  donnees: "montres.json",
  detaillants: "detaillants.json",
  annonces: "annonces.json",       // annonces des boutiques, relevées toutes les 2 heures (monalex.py)
  rafraichir: 2 * 60 * 60 * 1000,  // l'appli ouverte se met à jour toutes les 2 heures
  // Clé Google Maps (facultative) : avec elle, le plan stylisé devient une vraie carte Google aux couleurs de l'appli.
  googleMapsKey: "",
};

/* ====================================================================== outils */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const eur = (n, dev = "EUR") => new Intl.NumberFormat("fr-FR", { style: "currency", currency: dev, maximumFractionDigits: 0 }).format(n);
const nf = n => new Intl.NumberFormat("fr-FR").format(n);
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const digits = t => String(t || "").replace(/[^\d+]/g, "");
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
function askConfirm({ titre, texte, oui, non }) {
  return new Promise(res => {
    const d = $("#confirm");
    $("#cfT").textContent = titre; $("#cfP").textContent = texte; $("#cfOui").textContent = oui; $("#cfNon").textContent = non;
    const fin = v => { d.close(); res(v); };
    $("#cfOui").onclick = () => fin(true); $("#cfNon").onclick = () => fin(false);
    d.oncancel = e => { e.preventDefault(); fin(false); };
    d.showModal(); $("#cfNon").focus();
  });
}
/* Cookies : nécessaire = stockage du compte sur le téléphone ; Google Maps (cookies tiers) seulement après accord */
const COOK = { get: () => store.get("rm.cookies", null), set(v) { store.set("rm.cookies", v); $("#cookies").hidden = true; } };
const googleOk = () => COOK.get() === "ok";
function showCookies() { $("#cookies").hidden = false; }
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2200); }
function copy(t) { try { navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); document.execCommand("copy"); a.remove(); } }
const initials = s => String(s || "?").replace(/^(M\.|Mme)\s*/, "").split(/[\s—-]+/).filter(w => /^[A-ZÀ-Ý]/i.test(w) && !/^(du|de|la|le|des|d'|l')$/i.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 5 7 7-7 7"/></svg>`;
const PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-6.5-6.1-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3"/></svg>`;
const HEART = `<svg class="h" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z"/></svg>`;
const BACK = `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`;
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Heure de référence des données : en démonstration, l'heure où le fichier a été produit.
const NOW_DATA = () => DATA.demo && DATA.genere_le ? Date.parse(DATA.genere_le) : Date.now();
function ago(iso, ref = NOW_DATA()) {
  const m = Math.max(0, Math.round((ref - Date.parse(iso)) / 60000));
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h${m % 60 && h < 6 ? ` ${String(m % 60).padStart(2, "0")}` : ""}`;
  const d = Math.floor(h / 24);
  if (d < 31) return `il y a ${d} jour${d > 1 ? "s" : ""}`;
  return `le ${fmtDay(iso)}`;
}
const agoMe = iso => ago(iso, Date.now());
const isOnline = v => NOW_DATA() - Date.parse(v.derniere_connexion) < 5 * 60000;
function fmtDay(iso) { const d = new Date(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; }
function fmtDate(iso) { const d = new Date(iso); return `${fmtDay(iso)} à ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function fmtDur(min) {
  if (min < 60) return `${min} min`;
  if (min < 1440) { const h = Math.round(min / 60); return `${h} h`; }
  const d = Math.round(min / 1440); return `${d} jour${d > 1 ? "s" : ""}`;
}
function moisAnnee(s) { const [y, mo] = String(s || "").split("-"); return mo ? `${MOIS_L[+mo - 1]} ${y}` : y; }

/* ====================================================================== zones */
const EUROPE = new Set("AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM UA VA XK".split(" "));
const ZONES = [
  { id: "monaco", nom: "Monaco", sous: "La Principauté", groupe: "Près de Monaco", test: c => c === "MC" },
  { id: "france", nom: "France", sous: "Toute la France", groupe: "Près de Monaco", test: c => c === "FR" },
  { id: "europe", nom: "Europe", sous: "Tout le continent, Monaco et France compris", groupe: "Près de Monaco", test: c => EUROPE.has(c) },
  { id: "ameriques", nom: "Amériques", sous: "États-Unis, Canada, Amérique latine", groupe: "Dans le monde", test: c => /^(US|CA|MX|BR|AR|CL|CO|PE|PA|UY|DO|PR|BS|KY)$/.test(c) },
  { id: "moyen-orient", nom: "Moyen-Orient", sous: "Émirats, Qatar, Koweït…", groupe: "Dans le monde", test: c => /^(AE|QA|KW|SA|BH|OM|LB|JO|IL|TR)$/.test(c) },
  { id: "asie", nom: "Asie", sous: "Hong Kong, Singapour, Japon…", groupe: "Dans le monde", test: c => /^(HK|SG|JP|CN|TW|KR|TH|MY|ID|PH|VN|IN|MO)$/.test(c) },
  { id: "oceanie", nom: "Océanie", sous: "Australie, Nouvelle-Zélande", groupe: "Dans le monde", test: c => /^(AU|NZ)$/.test(c) },
  { id: "afrique", nom: "Afrique", sous: "", groupe: "Dans le monde", test: c => /^(ZA|MA|EG|NG|KE|MU|TN|SN|CI)$/.test(c) },
  { id: "monde", nom: "Monde entier", sous: "Toutes les boutiques", groupe: "Dans le monde", test: () => true },
];
const REGIONS = [
  ["europe", "Europe", c => EUROPE.has(c)],
  ["ameriques", "Amériques", c => /^(US|CA|MX|BR|AR|CL|CO|PE|PA|UY|DO|PR|BS|KY)$/.test(c)],
  ["moyen-orient", "Moyen-Orient", c => /^(AE|QA|KW|SA|BH|OM|LB|JO|IL|TR)$/.test(c)],
  ["asie", "Asie", c => /^(HK|SG|JP|CN|TW|KR|TH|MY|ID|PH|VN|IN|MO)$/.test(c)],
  ["oceanie", "Océanie", c => /^(AU|NZ)$/.test(c)],
  ["afrique", "Afrique", c => /^(ZA|MA|EG|NG|KE|MU|TN|SN|CI)$/.test(c)],
];
const regionOk = (c, region) => !region || (REGIONS.find(r => r[0] === region) || [, , () => true])[2](c);
const ZONE_NOM = Object.fromEntries(ZONES.map(z => [z.id, z.nom]));
function km(a, b) {
  const R = 6371, t = x => x * Math.PI / 180;
  const dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtKm = d => d < 1 ? "moins de 1 km" : d < 10 ? `${d.toFixed(1).replace(".", ",")} km` : `${nf(Math.round(d))} km`;

/* ====================================================================== état */
let DATA = { vendeurs: {}, montres: [] };
let PHOTOS = { photos: {} };
let ALL = [], VEND = [], DET = [], DETDATA = { detaillants: [] }, ANNDATA = { annonces: [], boutiques: {} };
const S = {
  zone: store.get("rm.zone", "monaco"), region: "", coll: "", etat: "", q: "", sort: "coll", view: "list",
  f: emptyF(), origin: { ...CONFIG.origine }, near: false, inApp: false, lastLoad: 0,
};
function emptyF() { return { prixMax: 0, source: [], colls: [], couleur: [], materiau: [], lunette: [], bracelet: [], diametre: [], complications: [], etat: [], etancheiteMin: 0, entretien: [], condition: [], vendeur: [], set: false, origine: false, enLigne: false }; }
const ME = {
  get compte() { return store.get("rm.compte", null); },
  set compte(v) { v ? store.set("rm.compte", v) : store.del("rm.compte"); },
  favs: new Set(store.get("rm.favs", [])),
  suivis: store.get("rm.suivis", {}),
  demandes: store.get("rm.demandes", []),
  alertes: store.get("rm.alertes", []),
  vues: store.get("rm.vues", []),
  save() { store.set("rm.favs", [...this.favs]); store.set("rm.suivis", this.suivis); store.set("rm.demandes", this.demandes); store.set("rm.vues", this.vues); store.set("rm.alertes", this.alertes); updateDots(); },
};

function materiauGroupe(m) {
  const t = norm(m.materiau);
  if (t.includes("rolesium")) return "Rolesium";
  if (t.includes("platine")) return "Platine";
  if (t.includes("rolesor")) return "Rolesor (bicolore)";
  if (t.includes("or ")) return "Or";
  return "Acier";
}
function entretienGroupe(m) {
  const p = m.entretien?.par || "";
  if (m.etat === "Neuf") return "Neuve";
  if (p === "Rolex") return "Par Rolex";
  if (p === "Horloger indépendant") return "Horloger indépendant";
  return "Aucun ou inconnu";
}
function vendeurGroupe(t) {
  t = norm(t);
  if (t.includes("pre-owned")) return "Certifié Pre-Owned";
  if (t.includes("particulier")) return "Particulier";
  if (t.includes("ventes")) return "Maison de ventes";
  return "Revendeur spécialisé";
}
const toutOrigine = m => (m.pieces || []).every(p => p.statut === "D'origine" || p.statut === "Remplacée par Rolex" || (p.statut === "Polie" && /rolex/i.test(p.note)));

function prepare() {
  VEND = Object.entries(DATA.vendeurs || {}).map(([id, v]) => ({ id, ...v, dist: km(S.origin, v) }));
  [...VEND].sort((a, b) => a.temps_reponse_min - b.temps_reponse_min).forEach((v, i) => v.rang = i + 1);
  DET = (DETDATA.detaillants || []).map(d => ({ ...d, officiel: true, dist: km(S.origin, d) }));
  const byId = Object.fromEntries(VEND.map(v => [v.id, v]));
  // boutiques indépendantes (annonces relevées sur leurs sites)
  for (const [id, b] of Object.entries(ANNDATA.boutiques || {})) { const v = { id, ...b, type: "Boutique", boutique: true, dist: km(S.origin, b) }; VEND.push(v); byId[id] = v; }
  const ph = id => [...((PHOTOS.photos || {})[id] || [])].sort((a, b) => (b.exacte === true) - (a.exacte === true));   // la bonne référence d'abord
  const studio = {};
  for (const a of ANNDATA.annonces || []) {
    if (!a.reference || !a.photos?.length || !byId[a.boutique]) continue;
    const l = studio[a.reference] = studio[a.reference] || [];
    if (l.length < 6) l.push({ ...a.photos[0], exacte: true, auteur: byId[a.boutique].nom, licence: "photo de la boutique", page: a.url, boutique: true });
  }
  // les photos « de face » d'abord (les plus propres)
  Object.values(studio).forEach(l => l.sort((a, b) => /front|face/i.test(b.src) - /front|face/i.test(a.src)));
  ALL = DATA.montres.map(m => ({ ...m, photos: [...(studio[m.reference] || []), ...ph(m.id)],  source: "Catalogue officiel", v: byId[m.vendeur] || null, mat: materiauGroupe(m), ent: entretienGroupe(m) }));
  const TAUX = { EUR: 1, CHF: 1.06, GBP: 1.17, USD: .92, AED: .25, JPY: .0061, HKD: .118, SGD: .69 };  // conversion indicative pour trier et filtrer
  for (const a of ANNDATA.annonces || []) {
    if (!byId[a.boutique]) continue;
    const cat = DATA.montres.find(x => x.reference === a.reference), base = cat || {};
    const m = { ...base, id: "a-" + a.id, annonce: true, source: "Boutiques", vendeur: a.boutique, v: byId[a.boutique],
      collection: a.collection || base.collection || "Autres Rolex", modele: a.titre, reference: a.reference || "",
      prix: a.prix || null, devise: a.devise || "EUR", prix_eur: a.prix ? Math.round(a.prix * (TAUX[a.devise] || 1)) : null,
      etat: a.etat === "Neuf" ? "Neuf" : "Occasion", condition: a.etat === "Neuf" ? "Neuve" : "Occasion", annee: a.annee || "", boite: a.boite, papiers: a.papiers,
      photos: a.photos || [], url: a.url, description: a.description || "", publie: a.premiere_vue, cat: !!cat,
      skin: base.skin || { type: "op", dial: "#222", bezel: "smooth", metal: "steel", bracelet: "oyster" }, statut: "Disponible" };
    m.mat = cat ? materiauGroupe(m) : ""; m.ent = "";
    ALL.push(m);
  }
  placeStores();
}
// Catalogue officiel : chaque référence est proposée par les détaillants officiels ; on rattache le plus proche de la zone choisie.
function placeStores(zoneId = S.zone) {
  const inZone = detsInZone(zoneId), proche = [...DET].sort((a, b) => a.dist - b.dist)[0];
  ALL.forEach(m => {
    if (m.vendeur && m.v) { m.dist = m.v.dist; return; }
    m.dets = inZone; m.v = inZone[0] || proche || { nom: "", ville: "", pays: "", code_pays: "", lat: 0, lng: 0 }; m.dist = m.v.dist || 0;
  });
}
function recalcDist() { VEND.forEach(v => v.dist = km(S.origin, v)); DET.forEach(d => d.dist = km(S.origin, d)); placeStores(); }
const montre = id => ALL.find(x => x.id === id);
const vendeur = id => VEND.find(x => x.id === id) || DET.find(x => x.id === id);
const detaillant = id => DET.find(x => x.id === id);

/* ====================================================================== filtres et tri */
function crit() { return { zone: S.zone, region: S.zone === "monde" ? S.region : "", coll: S.coll, etat: S.etat, q: S.q, f: JSON.parse(JSON.stringify(S.f)) }; }
function filtered(ignoreZone = false) {
  const c = crit(); if (ignoreZone) c.zone = "monde";
  return filterWith(c).sort(sorter(S.sort));
}
function etatDe(m) { if (m.annonce) return m.etat === "Neuf" ? "Neuve" : "Occasion (boutique)"; return m.etat === "Neuf" ? "Neuve" : /pre-owned/i.test(m.v?.type || m.source_type || "") ? `${m.condition} (Pre-Owned)` : m.condition; }
function filterWith(c) {
  const z = ZONES.find(x => x.id === c.zone) || ZONES[3];
  const zoneDet = DET.some(d => z.test(d.code_pays) && regionOk(d.code_pays, c.region));
  const q = norm(c.q).trim().split(/\s+/).filter(Boolean), F = { ...emptyF(), ...c.f };
  const any = (arr, val) => !arr.length || arr.includes(val);
  return ALL.filter(m => {
    if (m.vendeur ? !(z.test(m.v.code_pays) && regionOk(m.v.code_pays, c.region)) : !zoneDet) return false;
    if (c.coll && m.collection !== c.coll) return false;
    if (c.etat && m.etat !== c.etat) return false;
    if (!any(F.source || [], m.source)) return false;
    if (!any(F.colls, m.collection) || !any(F.couleur, m.couleur_cadran) || !any(F.materiau, m.mat) || !any(F.lunette, m.type_lunette) || !any(F.bracelet, m.type_bracelet) || !any(F.diametre, String(m.diametre)) || !any(F.etat, etatDe(m))) return false;
    if (F.complications.length && !F.complications.every(x => (m.complications || []).includes(x))) return false;
    if (F.etancheiteMin && m.etancheite < F.etancheiteMin) return false;
    if (F.prixMax && (m.prix_eur || m.prix) && (m.prix_eur || m.prix) > F.prixMax) return false;
    if (F.entretien.length && !F.entretien.includes(m.ent)) return false;
    if (F.set && !(m.papiers && m.boite) && m.etat !== "Neuf") return false;
    return !q.length || matchQ(m, q);
  });
}
function matchQ(m, q) {
  const hay = norm([m.collection, m.modele, m.reference, m.cadran, m.couleur_cadran, m.materiau, m.mat, m.lunette, m.type_bracelet, (m.complications || []).join(" "), m.etat, m.diametre + " mm", m.v?.nom, m.v?.ville, m.v?.pays].join(" "));
  return q.every(w => hay.includes(w));
}
function sorter(k) {
  const ord = m => (ORDRE.indexOf(m.collection) + 1 || 99) * 1000 + m.diametre;
  return {
    dist: (a, b) => a.dist - b.dist || ord(a) - ord(b),
    coll: (a, b) => ord(a) - ord(b),
    dpa: (a, b) => a.diametre - b.diametre || ord(a) - ord(b),
    dpd: (a, b) => b.diametre - a.diametre || ord(a) - ord(b),
    pa: (a, b) => (a.prix_eur || a.prix || 1e9) - (b.prix_eur || b.prix || 1e9), pd: (a, b) => (b.prix_eur || b.prix || 0) - (a.prix_eur || a.prix || 0),
    recent: (a, b) => (b.publie || "").localeCompare(a.publie || "") || ord(a) - ord(b),
  }[k] || ((a, b) => ord(a) - ord(b));
}
function nbFiltres() {
  const F = S.f; let n = (F.prixMax ? 1 : 0) + (F.etancheiteMin ? 1 : 0);
  for (const k of ["source", "colls", "couleur", "materiau", "lunette", "bracelet", "diametre", "complications", "etat"]) n += F[k].length;
  return n;
}

/* ====================================================================== morceaux réutilisés */
// Photos : on garde seulement les photos nettes (1200 px de large au minimum quand la taille est connue) et une seule fois chacune.
const PHOTO_MIN = 1200;
function taille(src, w) {
  if (/cdn\.shopify\.com|\/cdn\/shop\//.test(src)) return src + (src.includes("?") ? "&" : "?") + "width=" + w;
  if (/upload\.wikimedia\.org\/.*\/thumb\//.test(src)) return src.replace(/\/\d+px-([^/]+)$/, `/${w}px-$1`);
  return src;
}
function photosOf(m) {
  const vues = new Set();
  return (m.photos || []).map(p => typeof p === "string" ? { src: p } : p).filter(p => {
    if (!p || !p.src) return false;
    if (p.w && p.w < PHOTO_MIN) return false;
    const cle = (p.empreinte || p.src.split("?")[0].replace(/[-_](\d{2,4}x\d{2,4}|small|thumb|mini)(?=\.)/i, "")).toLowerCase();
    if (vues.has(cle)) return false;
    vues.add(cle); return true;
  });
}
function checkPhoto(img) { if (img.naturalWidth && img.naturalWidth < PHOTO_MIN * 0.8) { const sl = img.closest(".slide,.pic,button"); if (sl) sl.dataset.basse = "1"; } }
function picOf(m, o = {}) {
  const ph = photosOf(m).filter(p => p.exacte !== false);
  if (ph.length) {
    const src = taille(ph[0].src, 640);
    return `<img src="${esc(src)}" alt="${esc(m.modele)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  }
  return watchSVG(m.skin, { diam: m.diametre, label: m.modele, ...o });
}
const shortMat = s => String(s || "").replace(/\s*\(.*\)/, "");
const lieu = v => v.code_pays === "MC" ? v.ville : `${v.ville}, ${v.pays}`;
const stClass = s => s === "Réservée" ? "res" : s === "Vente aux enchères" ? "auc" : "";
function tagsOf(m) {
  const t = [];
  if (m.etat === "Neuf") t.push(`<span class="tag new">Neuve</span>`);
  else t.push(`<span class="tag">${esc(m.condition)} · ${String(m.note).replace(".", ",")}/10</span>`);
  if (m.etat !== "Neuf" && m.entretien?.par === "Rolex") t.push(`<span class="tag g">Entretien Rolex</span>`);
  if (/pre-owned/i.test(m.v.type)) t.push(`<span class="tag o">Certifiée Pre-Owned</span>`);
  if (m.papiers && m.boite) t.push(`<span class="tag">Boîte et papiers</span>`);
  return t.join("");
}
function cardHTML(m) {
  const baisse = m.prix && m.prix_initial > m.prix;
  return `<a class="card" href="#m/${encodeURIComponent(m.id)}">
    <div class="pic">${m.statut && m.statut !== "Disponible" ? `<span class="status ${stClass(m.statut)}">${esc(m.statut)}</span>` : ""}${picOf(m)}</div>
    <button class="fav" data-fav="${esc(m.id)}" aria-label="Favori" aria-pressed="${ME.favs.has(m.id)}">${HEART}</button>
    <div class="body">
      <span class="coll-n">${esc(m.collection)}</span>
      <h3>${esc(m.modele)}</h3>
      <span class="cap">${m.annonce ? [m.reference, m.annee, m.condition].filter(Boolean).map(esc).join(" · ") : `${esc(m.diametre)} mm · ${esc(m.couleur_cadran || "")} · ${esc(shortMat(m.materiau))}`}</span>
      ${m.annonce ? `<span class="src">${esc(m.v.nom)}</span>` : ""}
      <span class="price">${m.prix ? eur(m.prix, m.devise) + (baisse ? `<s>${eur(m.prix_initial, m.devise)}</s>` : "") : m.annonce ? "Prix sur demande" : "Neuve · prix public sur rolex.com"}</span>
      ${m.v && m.v.nom ? `<span class="where">${PIN}${esc(m.vendeur ? lieu(m.v) : m.v.ville)} · ${fmtKm(m.dist)}${m.dets && m.dets.length > 1 ? ` · ${m.dets.length} détaillants` : ""}</span>` : ""}
    </div></a>`;
}
function avatar(v, big) { return `<span class="avatar ${isOnline(v) ? "on" : ""}" ${big ? 'style="width:72px;height:72px;font-size:24px"' : ""}>${esc(initials(v.nom))}</span>`; }
function sellerRow(v) {
  const n = ALL.filter(m => m.vendeur === v.id).length;
  return `<a class="srow" href="#v/${encodeURIComponent(v.id)}">${avatar(v)}<div class="who"><b>${esc(v.nom)}</b>
    <span><span class="rx">Répond en ~${fmtDur(v.temps_reponse_min)}</span> · ${v.taux_reponse} % de réponses</span>
    <span>${isOnline(v) ? '<span class="live">En ligne</span>' : "Vu " + ago(v.derniere_connexion)} · ${esc(lieu(v))} · ${n} montre${n > 1 ? "s" : ""}</span></div>${CHEV}</a>`;
}
function pitem(m, side = "", extra = "") {
  return `<a class="pitem" href="#m/${encodeURIComponent(m.id)}"><div class="pp">${picOf(m)}</div><div><b>${esc(m.modele)}</b><span>${esc(m.reference)} · ${esc(lieu(m.v))} · ${esc(m.v.nom)}</span>${extra}</div><div class="side">${side || eur(m.prix, m.devise)}</div></a>`;
}

/* ====================================================================== accueil */
function zoneStats(id) {
  const z = ZONES.find(x => x.id === id);
  const boutiques = DET.filter(d => z.test(d.code_pays)).length + VEND.filter(v => v.boutique && z.test(v.code_pays)).length;
  const montres = filterWith({ ...crit(), zone: id, region: "" }).length;
  return { boutiques, montres };
}
function renderZones() {
  const z = ZONES.find(x => x.id === S.zone) || ZONES[0], st = zoneStats(z.id);
  $("#zones").innerHTML = `<button class="zbar" data-zone-open aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>
      <span class="zb-t"><small>Zone de recherche</small><b>${esc(z.nom)}</b><em>${st.boutiques} boutique${st.boutiques > 1 ? "s" : ""} · ${st.montres} montre${st.montres > 1 ? "s" : ""}</em></span>
      <span class="btn btn-green zb-c">Changer</span></button>`;
  $("#fZone").textContent = $("#menuZone").textContent = z.nom;
}
function openZones() {
  const groupes = [...new Set(ZONES.map(z => z.groupe))];
  $("#zoneList").innerHTML = groupes.map(g => `<p class="zs-g">${esc(g)}</p>` + ZONES.filter(z => z.groupe === g).map(z => {
    const st = zoneStats(z.id);
    if (!st.boutiques && z.id !== "monde") return "";
    return `<button class="zs-i" data-z="${z.id}" aria-pressed="${S.zone === z.id}"><span><b>${esc(z.nom)}</b><small>${esc(z.sous)}</small></span><em>${st.boutiques} boutique${st.boutiques > 1 ? "s" : ""}<br>${st.montres} montre${st.montres > 1 ? "s" : ""}</em><i aria-hidden="true">✓</i></button>`;
  }).join("")).join("");
  openOv("zonesheet");
}
const ORDRE = ["Submariner", "Cosmograph Daytona", "GMT-Master II", "Datejust", "Day-Date", "Oyster Perpetual", "Explorer", "Sea-Dweller", "Deepsea", "Yacht-Master", "Sky-Dweller", "1908", "Air-King"];
function collections() {
  const map = new Map();
  ALL.forEach(m => { if (!map.has(m.collection)) map.set(m.collection, { m, n: 0 }); map.get(m.collection).n++; });
  return [...map.entries()].sort((a, b) => (ORDRE.indexOf(a[0]) + 1 || 99) - (ORDRE.indexOf(b[0]) + 1 || 99));
}
function renderColls() {
  const list = collections();
  $("#colls").innerHTML = `<button class="coll" data-c="" aria-pressed="${!S.coll}"><svg viewBox="0 0 64 96"><g fill="none" stroke="#127749" stroke-width="1.6"><circle cx="32" cy="48" r="18"/><circle cx="32" cy="48" r="12"/><path d="M24 30V8h16v22M24 66v22h16V66"/></g></svg><span>Toutes</span><small>${ALL.length} montres</small></button>` +
    list.map(([c, { m, n }]) => `<button class="coll" data-c="${esc(c)}" aria-pressed="${S.coll === c}">${watchSVG(m.skin, { diam: m.diametre })}<span>${esc(c)}</span><small>${n} montre${n > 1 ? "s" : ""}</small></button>`).join("");
  $("#fColls").innerHTML = list.map(([c]) => `<li><a href="#c/${slugC(c)}">${esc(c)}</a></li>`).join("");
}
function renderGrid() {
  const r = filtered();
  const z = ZONES.find(z => z.id === S.zone);
  $("#count").innerHTML = `<span><b>${r.length}</b> référence${r.length > 1 ? "s" : ""} · ${detsInZone().length} détaillant${detsInZone().length > 1 ? "s" : ""} officiel${detsInZone().length > 1 ? "s" : ""} · ${esc(z.sous)}${S.q ? ` · « ${esc(S.q)} » <button class="linkbtn" data-clear-q>effacer</button>` : ""}</span>
    <span>${nbFiltres() || S.q || S.coll ? `<button class="linkbtn" data-save-alert>M'alerter pour cette recherche</button> · ` : ""}Distances depuis ${S.near ? "votre position" : "Monaco"} · <button class="linkbtn" data-near>${PIN}${S.near ? "Revenir à Monaco" : "Autour de moi"}</button></span>`;
  if (!r.length) {
    const next = ZONES[ZONES.findIndex(x => x.id === S.zone) + 1];
    const zn = { monaco: "à Monaco", france: "à Monaco ni en France", europe: "en Europe", monde: "avec ces critères" }[S.zone];
    $("#grid").innerHTML = `<div class="empty"><h3>Aucune montre ${zn} pour l'instant</h3><p>${next ? "Élargissez la recherche à la zone suivante." : "Retirez un ou deux filtres pour voir plus de montres."}</p>${next ? `<button class="btn btn-green" data-z="${next.id}">Voir : ${esc(next.nom)}</button>` : `<button class="btn btn-green" data-reset-all>Tout effacer</button>`}</div>`;
  } else {
    // par paquets : seules les premières montres sont dessinées, la suite arrive quand on descend
    S.vus = Math.min(r.length, S.vus || PAQUET);
    $("#grid").innerHTML = r.slice(0, S.vus).map(cardHTML).join("") + (r.length > S.vus ? `<button class="btn btn-light plus" data-plus>Voir plus de montres (${r.length - S.vus})</button>` : "");
    S.liste = r;
    observerPlus();
  }
  $("#grid").setAttribute("aria-busy", "false");
  if (S.view === "map") renderBigMap(r);
  const n = nbFiltres(); $("#nFilters").hidden = !n; $("#nFilters").textContent = n;
  $$("[data-etat]").forEach(b => b.setAttribute("aria-pressed", b.dataset.etat === S.etat));
  $$(".coll").forEach(b => b.setAttribute("aria-pressed", b.dataset.c === S.coll));
  $("#sort").value = S.sort;
}
const PAQUET = 24;
let ioPlus;
function plus() {
  const r = S.liste || [], de = S.vus; if (de >= r.length) return;
  S.vus = Math.min(r.length, de + PAQUET);
  const btn = $("#grid [data-plus]");
  btn.insertAdjacentHTML("beforebegin", r.slice(de, S.vus).map(cardHTML).join(""));
  if (S.vus >= r.length) btn.remove(); else btn.textContent = `Voir plus de montres (${r.length - S.vus})`;
}
function observerPlus() {
  ioPlus?.disconnect();
  const btn = $("#grid [data-plus]"); if (!btn || !("IntersectionObserver" in window)) return;
  ioPlus = new IntersectionObserver(e => { if (e[0].isIntersecting) plus(); }, { rootMargin: "600px" });
  ioPlus.observe(btn);
}
function renderSellers() { const el = $("#topSellers"); if (el) el.innerHTML = [...VEND].sort((a, b) => a.rang - b.rang).slice(0, 6).map(sellerRow).join(""); }
function tileHTML(href, cls, inner, label, attrs = "") {
  return `<a class="tile ${cls}" href="${href}" ${attrs}><div class="ti">${inner}</div><div class="tl">${label}</div></a>`;
}
function tiles(kind) {
  const nAlert = alerts().length;
  const daytona = ALL.find(m => m.reference === "126500LN") || ALL[0];
  const dj = ALL.find(m => m.reference === "126334") || ALL[0];
  const gmt = ALL.find(m => m.reference === "126710BLRO") || ALL[0];
  const nMc = ALL.filter(m => m.v.code_pays === "MC").length;
  const fav = [...ME.favs].map(montre).filter(Boolean)[0] || gmt;
  if (kind === "menu") return [
    tileHTML("#", "", watchSVG(dj.skin, { diam: dj.diametre }), "Toutes les montres", 'data-goto="list"'),
    tileHTML("#", "dark", `<div class="big">${nMc}<small>montres à Monaco</small></div>`, "Monaco", 'data-zone-go="monaco"'),
    tileHTML("#vendeurs", "blue", `<div class="big">${VEND.length}<small>vendeurs suivis</small></div>`, "Les vendeurs"),
    tileHTML("#suivis", "", watchSVG(fav.skin, { diam: fav.diametre }), `Mes suivis${nAlert ? ` · ${nAlert} nouveau${nAlert > 1 ? "x" : ""}` : ""}`),
  ].join("");
  return [
    tileHTML("#suivis/favoris", "", watchSVG(fav.skin, { diam: fav.diametre }), `Mes favoris (${ME.favs.size})`),
    tileHTML("#suivis", "dark", `<div class="big">${Object.keys(ME.suivis).length}<small>montre${Object.keys(ME.suivis).length > 1 ? "s" : ""} suivie${Object.keys(ME.suivis).length > 1 ? "s" : ""}</small></div>`, nAlert ? `${nAlert} changement${nAlert > 1 ? "s" : ""}` : "Mes suivis"),
    tileHTML("#suivis/demandes", "blue", `<div class="big">${ME.demandes.length}<small>demande${ME.demandes.length > 1 ? "s" : ""} aux vendeurs</small></div>`, "Mes demandes"),
    tileHTML("#compte", "", watchSVG(daytona.skin, { diam: daytona.diametre }), ME.compte ? `Mon compte` : "Créer mon compte"),
  ].join("");
}
function detRow(d) {
  return `<a class="srow" href="#d/${encodeURIComponent(d.id)}"><span class="avatar gold">${esc(initials(d.nom))}</span><div class="who"><b>${esc(d.nom)}</b>
    <span class="rx">Détaillant officiel Rolex${d.service ? " · centre de service" : ""}</span>
    <span>${esc(d.adresse)}, ${esc(d.ville)} · ${fmtKm(d.dist)}</span></div>${CHEV}</a>`;
}
function detsInZone(zoneId = S.zone, region = zoneId === "monde" ? S.region : "") { const z = ZONES.find(x => x.id === zoneId) || ZONES[3]; return DET.filter(d => z.test(d.code_pays) && regionOk(d.code_pays, region)).sort((a, b) => a.dist - b.dist); }
function renderOfficiels() {
  const list = detsInZone();
  $("#offCount").textContent = `${list.length} détaillant${list.length > 1 ? "s" : ""} · ${ZONE_NOM[S.zone]}`;
  $("#officiels").innerHTML = list.slice(0, 9).map(detRow).join("") || `<div class="empty"><h3>Aucun détaillant relevé dans cette zone</h3></div>`;
}
function renderHome() { S.vus = 0; placeStores(); renderZones(); renderGrid(); renderSellers(); renderOfficiels(); $("#homeTiles").innerHTML = tiles("home"); }

/* ====================================================================== cartes géographiques */
const TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const TILES_NOMS = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
function fond(map) {
  L.tileLayer(TILES, { attribution: ATTR, maxNativeZoom: 16, maxZoom: 19 }).addTo(map);
  L.tileLayer(TILES_NOMS, { maxNativeZoom: 16, maxZoom: 19, pane: "overlayPane" }).addTo(map);
  return map;
}
const ATTR = 'Fond &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
let bigMap, bigLayer, pMap;
function baseMap(el, opt) {
  const map = L.map(el, { scrollWheelZoom: false, worldCopyJump: true, ...opt });
  (typeof el === "string" ? document.getElementById(el) : el).classList.add("stylise");
  fond(map);
  return map;
}
function renderBigMap(list) {
  if (!window.L) { $("#bigmap").innerHTML = '<p style="padding:20px">La carte n\'a pas pu se charger.</p>'; return; }
  storeMap($("#bigmap"), detsInZone(), ZONE_NOM[S.zone]);
}
const GSTYLE = [
  { elementType: "geometry", stylers: [{ color: "#f4f2ec" }] }, { elementType: "labels.text.fill", stylers: [{ color: "#545454" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] }, { featureType: "water", elementType: "geometry", stylers: [{ color: "#b9d3c2" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] }, { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e8d9b0" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] }, { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d3e4d7" }, { visibility: "on" }] },
  { featureType: "transit", stylers: [{ visibility: "simplified" }] }, { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#127749" }] },
];
let gLoad;
function googleMaps() {
  if (!CONFIG.googleMapsKey) return Promise.reject();
  if (window.google?.maps) return Promise.resolve(google.maps);
  return gLoad = gLoad || new Promise((ok, ko) => {
    window.__gmOk = () => ok(google.maps);
    const sc = document.createElement("script");
    sc.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CONFIG.googleMapsKey)}&callback=__gmOk&language=fr`;
    sc.onerror = ko; document.head.appendChild(sc);
  });
}
/* ---------- carte des boutiques, façon « trouver une boutique » : épingles regroupées, recherche, panneau de résultats */
const SMAPS = new Map();
const PIN_ICON = `<svg class="pin-ico" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2.4"/>${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, r1 = i % 3 ? 10.2 : 9, x1 = 16 + r1 * Math.sin(a), y1 = 16 - r1 * Math.cos(a), x2 = 16 + 11.4 * Math.sin(a), y2 = 16 - 11.4 * Math.cos(a); return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="currentColor" stroke-width="${i % 3 ? 1.2 : 2}"/>`; }).join("")}<path d="M16 16 11.6 11.2M16 16l5.6-2.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="1.6" fill="currentColor"/></svg>`;
function storeMap(el, dets, titre) {
  if (!window.L || !el) return;
  let st = SMAPS.get(el);
  if (!st || !document.body.contains(st.root)) {
    el.innerHTML = `<div class="smap">
      <div class="smap-map"></div>
      <form class="smap-search" role="search"><label class="sr">Trouver une boutique</label><input type="search" placeholder="Trouver une boutique" autocomplete="off" enterkeyhint="search">
        <button type="button" class="smap-loc" aria-label="Autour de moi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button></form>
      <div class="smap-sheet"><div class="smap-h"><b>Résultats –&nbsp;<span class="smap-z"></span></b><button type="button" class="smap-tg" aria-expanded="false">Liste <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 15 6-6 6 6"/></svg></button></div>
        <div class="smap-chips"><button type="button" data-sk="tous" aria-pressed="true">Détaillants officiels</button><button type="button" data-sk="service" aria-pressed="false">Centres de service</button></div>
        <div class="smap-list" hidden></div></div></div>`;
    const root = el.firstElementChild, mapEl = $(".smap-map", root);
    const map = L.map(mapEl, { scrollWheelZoom: false, worldCopyJump: true, zoomControl: false }).setView([CONFIG.origine.lat, CONFIG.origine.lng], 4);
    fond(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    st = { root, map, layer: L.layerGroup().addTo(map), q: "", kind: "tous", dets: [], titre: "" };
    SMAPS.set(el, st);
    map.on("zoomend", () => drawPins(st));
    $("input", root).addEventListener("input", e => { st.q = e.target.value; fillStores(st, true); });
    $(".smap-search", root).addEventListener("submit", e => { e.preventDefault(); $("input", root).blur(); });
    $(".smap-loc", root).onclick = () => near();
    $(".smap-tg", root).onclick = () => { const l = $(".smap-list", root), open = l.hidden; l.hidden = !open; $(".smap-tg", root).setAttribute("aria-expanded", open); };
    $$("[data-sk]", root).forEach(b => b.onclick = () => { st.kind = b.dataset.sk; $$("[data-sk]", root).forEach(x => x.setAttribute("aria-pressed", x === b)); fillStores(st, true); });
  }
  st.dets = dets; st.titre = titre;
  fillStores(st, true);
}
function storesOf(st) {
  const q = norm(st.q).trim();
  return st.dets.filter(d => (st.kind !== "service" || d.service) && (!q || norm(`${d.nom} ${d.ville} ${d.pays} ${d.adresse} ${d.cp}`).includes(q)));
}
function fillStores(st, fit) {
  const list = storesOf(st), root = st.root;
  $(".smap-z", root).textContent = st.q ? `« ${st.q} »` : st.titre;
  $(".smap-list", root).innerHTML = list.map(d => `<a class="smap-item" href="#d/${encodeURIComponent(d.id)}"><span><b>${esc(d.nom)}</b><small>${esc(d.adresse)}, ${esc(d.cp)} ${esc(d.ville)}</small></span><em>${fmtKm(d.dist)}</em></a>`).join("") || `<p class="smap-empty">Aucune boutique trouvée.</p>`;
  const cadre = () => {
    st.map.invalidateSize();
    const pts = list.map(d => [d.lat, d.lng]);
    if (pts.length === 1) st.map.setView(pts[0], 15); else if (pts.length) st.map.fitBounds(pts, { padding: [70, 50], maxZoom: 13 });
    drawPins(st);
  };
  if (fit) { cadre(); setTimeout(cadre, 80); } else drawPins(st);
}
function drawPins(st) {
  const list = storesOf(st), map = st.map;
  st.layer.clearLayers();
  // regroupement : les boutiques à moins de 64 px l'une de l'autre forment une seule épingle avec leur nombre
  const groups = [];
  list.forEach(d => {
    const pt = map.latLngToLayerPoint([d.lat, d.lng]);
    const g = groups.find(g => g.pt.distanceTo(pt) < 64);
    if (g) g.items.push(d); else groups.push({ pt, items: [d] });
  });
  groups.forEach(g => {
    const lat = g.items.reduce((a, d) => a + d.lat, 0) / g.items.length, lng = g.items.reduce((a, d) => a + d.lng, 0) / g.items.length;
    const icon = L.divIcon({ className: "", html: `<div class="spinw"><div class="spin">${PIN_ICON}</div>${g.items.length > 1 ? `<b>${g.items.length}</b>` : ""}</div>`, iconSize: [58, 70], iconAnchor: [29, 68], popupAnchor: [0, -62] });
    const mk = L.marker([lat, lng], { icon, title: g.items.length > 1 ? `${g.items.length} boutiques` : g.items[0].nom, riseOnHover: true }).addTo(st.layer);
    if (g.items.length > 1) mk.on("click", () => map.fitBounds(g.items.map(d => [d.lat, d.lng]), { padding: [80, 60], maxZoom: 16 }));
    else { const d = g.items[0]; mk.bindPopup(`<div class="pop"><h4>${esc(d.nom)}</h4><div class="pv">${esc(d.adresse)}, ${esc(d.ville)}${d.service ? " · centre de service" : ""}</div><a href="#d/${encodeURIComponent(d.id)}"><span>Voir la boutique</span><b>›</b></a>${d.tel ? `<a href="tel:${digits(d.tel)}" data-log="appel" data-v="${esc(d.id)}"><span>Appeler</span><b>${esc(d.tel)}</b></a>` : ""}</div>`); }
  });
}
function pageMap(id, v) {
  if (!$("#" + id)) return;
  if (CONFIG.googleMapsKey) {
    googleMaps().then(g => {
      const map = new g.Map($("#" + id), { center: { lat: v.lat, lng: v.lng }, zoom: 16, styles: GSTYLE, mapTypeControl: false, streetViewControl: true, fullscreenControl: true });
      new g.Marker({ map, position: { lat: v.lat, lng: v.lng }, title: v.nom, icon: { path: g.SymbolPath.CIRCLE, scale: 9, fillColor: "#127749", fillOpacity: 1, strokeColor: "#c9a961", strokeWeight: 3 } });
    }).catch(() => {});
    return;
  }
  if (!window.L) return;
  if (pMap) { pMap.remove(); pMap = null; }
  pMap = baseMap(id, { worldCopyJump: false }).setView([v.lat, v.lng], 15);
  L.marker([v.lat, v.lng], { icon: L.divIcon({ className: "", html: '<div class="pin one"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) })
    .addTo(pMap).bindPopup(`<div class="pop"><h4>${esc(v.nom)}</h4><div class="pv" style="margin:0">${esc(v.adresse)}, ${esc(v.cp)} ${esc(v.ville)}</div></div>`).openPopup();
  setTimeout(() => pMap && pMap.invalidateSize(), 400);
}
function earthUrl(v) { return `https://earth.google.com/web/search/${encodeURIComponent(`${v.adresse}, ${v.cp} ${v.ville}, ${v.pays}`)}/@${v.lat},${v.lng},60a,600d,35y,0h,65t,0r`; }
function mapBlock(id, v) {
  const L2 = mapsLinks(v);
  return `<div class="mtabs" role="group" aria-label="Type de carte" data-lat="${v.lat}" data-lng="${v.lng}" data-nom="${esc(v.nom)}" data-for="${id}">
      <button data-mt="plan" aria-pressed="true">Plan</button><button data-mt="gmap" aria-pressed="false">Google Maps</button><button data-mt="sat" aria-pressed="false">Satellite</button>
      <a href="${earthUrl(v)}" target="_blank" rel="noopener" class="earth">Google Earth 3D ↗</a></div>
    <div class="mapbox"><div id="${id}"></div><iframe title="Google Maps" loading="lazy" referrerpolicy="no-referrer-when-downgrade" hidden></iframe></div>
    ${v.position_approx ? '<p class="d-note" style="margin-top:8px">Position approximative (ville).</p>' : ""}
    <div class="route"><a class="btn btn-light" href="${L2.google}" target="_blank" rel="noopener">Itinéraire Google</a><a class="btn btn-light" href="${L2.apple}" target="_blank" rel="noopener">Plans</a><a class="btn btn-light" href="${L2.waze}" target="_blank" rel="noopener">Waze</a></div>`;
}
function mapsLinks(v) {
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`,
    apple: `https://maps.apple.com/?ll=${v.lat},${v.lng}&q=${encodeURIComponent(v.nom)}`,
    waze: `https://waze.com/ul?ll=${v.lat},${v.lng}&navigate=yes`,
  };
}

/* ====================================================================== compte, suivis, demandes */
function alerts() {
  const out = [];
  for (const [id, s] of Object.entries(ME.suivis)) {
    const m = montre(id);
    if (!m) { out.push({ id, type: "retiree", texte: "Référence retirée du catalogue" }); continue; }
    if ((m.prix || 0) !== (s.vu_prix || 0)) out.push({ id, m, type: "prix", texte: !s.vu_prix ? `Prix publié : ${eur(m.prix)}` : m.prix < s.vu_prix ? `Prix baissé de ${eur(s.vu_prix - m.prix)} (${eur(s.vu_prix)} → ${eur(m.prix)})` : `Prix : ${eur(s.vu_prix)} → ${eur(m.prix)}` });
    if ((m.statut || "Disponible") !== s.vu_statut) out.push({ id, m, type: "statut", texte: `Statut : ${s.vu_statut} → ${m.statut}` });
  }
  for (const a of ME.alertes) {
    const ids = filterWith(a.crit).map(m => m.id);
    ids.filter(x => !a.vus.includes(x)).forEach(x => out.push({ id: x, m: montre(x), type: "recherche", alerte: a.id, texte: `Nouvelle montre pour votre alerte « ${a.nom} »` }));
  }
  return out;
}
function nomCritere(c) {
  const F = c.f, bits = [];
  if (c.coll) bits.push(c.coll);
  for (const k of ["colls", "etat", "couleur", "materiau", "diametre", "lunette", "bracelet", "complications"]) if (F[k] && F[k].length) bits.push(F[k].map(v => k === "diametre" ? v + " mm" : v).join(" ou "));
  if (F.etancheiteMin) bits.push(`≥ ${nf(F.etancheiteMin)} m`);
  if (F.prixMax) bits.push(`≤ ${eur(F.prixMax)}`);
  if (c.q) bits.push(`« ${c.q} »`);
  bits.push(c.region ? REGIONS.find(r => r[0] === c.region)[1] : ZONE_NOM[c.zone]);
  return bits.join(" · ");
}
function saveAlert() {
  if (!ME.compte) { store.set("rm.apres", { action: "alerte", crit: crit() }); toast("Créez votre compte pour recevoir des alertes."); location.hash = "compte"; return; }
  const c = crit(), ids = filterWith(c).map(m => m.id);
  ME.alertes.unshift({ id: Date.now().toString(36), nom: nomCritere(c), crit: c, vus: ids, cree: new Date().toISOString() });
  ME.save(); toast(`Alerte créée : ${ids.length} montre${ids.length > 1 ? "s" : ""} aujourd'hui, vous serez prévenu des nouvelles.`);
  if (ME.compte && !ME.compte.notif && "Notification" in window && Notification.permission === "default") setTimeout(() => { location.hash = "notifications"; }, 900);
}
function markSeen(id) {
  const m = montre(id), s = ME.suivis[id];
  if (s) { if (!m) delete ME.suivis[id]; else { s.vu_prix = m.prix || 0; s.vu_statut = m.statut || "Disponible"; } }
  ME.alertes.forEach(a => { if (!a.vus.includes(id) && filterWith(a.crit).some(x => x.id === id)) a.vus.push(id); });
  ME.save();
}
function follow(id) {
  const m = montre(id); if (!m) return;
  if (!ME.compte) { store.set("rm.apres", { action: "suivre", id }); toast("Créez votre compte pour recevoir des alertes."); location.hash = "compte"; return; }
  ME.suivis[id] = { depuis: new Date().toISOString(), prix: m.prix || 0, statut: m.statut || "Disponible", vu_prix: m.prix || 0, vu_statut: m.statut || "Disponible" };
  ME.favs.add(id); ME.save(); toast("Alerte créée pour cette montre.");
}
function unfollow(id) { delete ME.suivis[id]; ME.save(); toast("Vous ne suivez plus cette montre"); }
function logDemande(vendeurId, montreId, canal) {
  ME.demandes.unshift({ id: Date.now().toString(36), vendeur: vendeurId, montre: montreId || null, canal, date: new Date().toISOString(), repondu: null });
  ME.demandes = ME.demandes.slice(0, 200); ME.save();
}
function updateDots() {
  const a = alerts().length;
  $("#favDot").hidden = !(a || ME.favs.size); $("#favDot").textContent = a || ME.favs.size;
  $("#menuDot").hidden = !a; $("#menuDot").textContent = a;
}
let notified = new Set();
function notifyAlerts() {
  const comp = ME.compte; if (!comp || !comp.notif || !("Notification" in window) || Notification.permission !== "granted") return;
  alerts().forEach(a => {
    const key = a.id + a.texte; if (notified.has(key)) return; notified.add(key);
    const title = a.m ? `${a.m.modele} · ${a.m.v.nom}` : "Montre suivie";
    const go = () => navigator.serviceWorker?.getRegistration?.().then(r => r ? r.showNotification(title, { body: a.texte, icon: "icon-192.png", data: { url: `#m/${a.id}` } }) : new Notification(title, { body: a.texte }));
    try { go(); } catch (e) {}
  });
}

/* ====================================================================== pages */
const page = () => $("#page");
function openPage(html, title, actions = "") {
  const el = page();
  const same = el.dataset.h === location.hash && el.classList.contains("open");
  const keep = el.scrollTop;
  if (pMap) { pMap.remove(); pMap = null; }
  el.innerHTML = `<div class="p-top"><div class="wrap"><button class="round" data-back aria-label="Retour">${BACK}</button><span class="t">${esc(title)}</span><div class="p-act">${actions}</div></div></div><div class="wrap" style="padding-bottom:calc(60px + var(--safe-b))">${html}</div>`;
  el.scrollTop = same ? keep : 0;
  el.dataset.h = location.hash;
  el.classList.remove("cp");
  el.classList.add("open"); document.body.classList.add("lock");
  document.title = `${title}  · Monalex`;
}
function closePage() {
  page().classList.remove("open"); document.body.classList.remove("lock");
  document.title = "Monalex";
  setTimeout(() => { if (!page().classList.contains("open") && pMap) { pMap.remove(); pMap = null; } }, 400);
}
page().addEventListener("scroll", () => { const t = $(".p-top", page()); if (t) t.classList.toggle("scrolled", page().scrollTop > 4); }, { passive: true });

function check(ok, titre, sous) { return `<div class="check ${ok ? "y" : "x"}"><i>${ok ? "✓" : "–"}</i><div>${esc(titre)}<small>${esc(sous)}</small></div></div>`; }
const statutPiece = s => s === "D'origine" ? "o" : s === "Remplacée par Rolex" ? "r" : s === "Polie" ? "p" : "n";
function messageType(m, v) {
  const c = ME.compte;
  const quoi = m ? `votre ${m.modele} (réf. ${m.reference}, ${m.annee}) affichée à ${eur(m.prix, m.devise)}` : "vos montres";
  return `Bonjour${v.contact && !/^M\.|^Mme/.test(v.contact) ? " " + v.contact.split(" ")[0] : ""},\n\nJe suis intéressé(e) par ${quoi}.\n${m ? "Est-elle toujours disponible ? Serait-il possible de la voir ?" : "Pouvez-vous me dire ce que vous avez en ce moment ?"}\n\nMerci,${c ? `\n${c.prenom} ${c.nom}${c.tel ? "\n" + c.tel : ""}` : ""}`;
}
function contactLinks(v, m) {
  const txt = messageType(m, v), sub = m ? `${m.modele} réf. ${m.reference}` : "Demande d'information";
  return {
    tel: `tel:${digits(v.tel)}`,
    wa: `https://wa.me/${digits(v.whatsapp).replace("+", "")}?text=${encodeURIComponent(txt)}`,
    mail: `mailto:${v.email}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(txt)}`,
    sms: `sms:${digits(v.tel)}${/iPhone|iPad/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(txt)}`,
  };
}
function reactBlock(v) {
  return `<div class="react">
    <div><b>${isOnline(v) ? '<span class="live">En ligne</span>' : esc(ago(v.derniere_connexion))}</b><span>Dernière connexion · ${esc(fmtDate(v.derniere_connexion))}</span></div>
    <div><b>~${fmtDur(v.temps_reponse_min)}</b><span>Temps de réponse habituel${v.rang <= 3 ? ` · n° ${v.rang} des plus réactifs` : ""}</span></div>
    <div><b>${v.taux_reponse} %</b><span>Messages qui reçoivent une réponse</span></div>
    <div><b>${esc(ago(v.derniere_reponse))}</b><span>Dernière réponse à un client</span></div>
    <div><b>★ ${String(v.note).replace(".", ",")}</b><span>${nf(v.avis)} avis de clients</span></div>
    <div><b>${nf(v.ventes)}</b><span>Ventes réalisées · depuis ${esc(v.membre_depuis)}</span></div>
  </div>`;
}
function sellerCard(v, m) {
  const c = contactLinks(v, m);
  return `<div class="seller-card">
    <div style="display:flex;gap:14px;align-items:center">${avatar(v)}<div><div class="eyebrow">${esc(v.ville)}, ${esc(v.pays)}</div><h3 style="margin:2px 0 0">${esc(v.nom)}</h3></div></div>
    <div class="tags" style="margin-top:12px"><span class="tag">${esc(v.type)}</span>${v.verifie ? '<span class="tag g">Identité vérifiée</span>' : '<span class="tag o">Identité non vérifiée</span>'}${v.rang <= 3 ? '<span class="tag g">Parmi les plus réactifs</span>' : ""}</div>
    ${reactBlock(v)}
    <dl>
      <div><dt>Contact</dt><dd>${esc(v.contact)}</dd></div>
      <div><dt>Adresse</dt><dd>${esc(v.adresse)}<br>${esc(v.cp)} ${esc(v.ville)}, ${esc(v.pays)}</dd></div>
      <div><dt>Téléphone</dt><dd><a href="${c.tel}" data-log="appel" data-v="${esc(v.id)}" ${m ? `data-m="${esc(m.id)}"` : ""}>${esc(v.tel)}</a></dd></div>
      <div><dt>E-mail</dt><dd><a href="${c.mail}" data-log="e-mail" data-v="${esc(v.id)}" ${m ? `data-m="${esc(m.id)}"` : ""}>${esc(v.email)}</a></dd></div>
      ${v.site ? `<div><dt>Site</dt><dd><a href="${esc(v.site)}" target="_blank" rel="noopener">${esc(v.site.replace(/^https?:\/\//, ""))}</a></dd></div>` : ""}
      <div><dt>Horaires</dt><dd>${esc(v.horaires)}</dd></div>
      <div><dt>Langues</dt><dd>${esc(v.langues)}</dd></div>
      <div><dt>Annonces</dt><dd>${v.annonces_actives} en ligne</dd></div>
    </dl>
    <div class="sa">
      <a class="btn btn-green" href="${c.tel}" data-log="appel" data-v="${esc(v.id)}" ${m ? `data-m="${esc(m.id)}"` : ""}>Appeler</a>
      <a class="btn btn-light" href="${c.wa}" target="_blank" rel="noopener" data-log="WhatsApp" data-v="${esc(v.id)}" ${m ? `data-m="${esc(m.id)}"` : ""} style="background:#fff">WhatsApp</a>
      <a class="btn btn-light" href="${c.mail}" data-log="e-mail" data-v="${esc(v.id)}" ${m ? `data-m="${esc(m.id)}"` : ""} style="background:#fff">E-mail</a>
      <button class="btn btn-light" data-copy-v="${esc(v.id)}" style="background:#fff">Copier</button>
    </div>
  </div>`;
}
function mesEchanges(vId, mId) {
  const list = ME.demandes.filter(d => d.vendeur === vId && (!mId || d.montre === mId));
  if (!list.length) return "";
  return `<div class="box" style="margin-top:20px"><h3>Vos échanges avec ce vendeur</h3>${list.map(d => {
    const m = d.montre && montre(d.montre);
    const att = Math.round((Date.now() - Date.parse(d.date)) / 60000);
    const rep = d.repondu ? `Réponse reçue en ${fmtDur(Math.max(1, Math.round((Date.parse(d.repondu) - Date.parse(d.date)) / 60000)))}` : `En attente de réponse depuis ${fmtDur(Math.max(1, att))}`;
    return `<div class="mine"><b>${esc(d.canal[0].toUpperCase() + d.canal.slice(1))} · ${esc(fmtDate(d.date))}</b>${m ? esc(m.modele) + " · " : ""}<span class="${d.repondu ? "alert" : "alert w"}" style="display:inline">${rep}</span>
      <div class="row">${d.repondu ? "" : `<button class="btn btn-green" data-rep="${d.id}">Le vendeur m'a répondu</button>`}<button class="btn btn-light" data-del-dem="${d.id}" style="background:var(--bg2)">Effacer</button></div></div>`;
  }).join("")}</div>`;
}

/* ---------- fiche d'une montre */
function pageAnnonce(m) {
  ME.vues = [m.id, ...ME.vues.filter(x => x !== m.id)].slice(0, 12); ME.save();
  const v = m.v, photos = photosOf(m), host = (() => { try { return new URL(m.url).hostname.replace(/^www\./, ""); } catch (e) { return v.site || ""; } })();
  const slides = photos.map((p, i) => ({ nom: `Photo ${i + 1} sur ${photos.length}`, html: `<img src="${esc(taille(p.src, 1400))}" alt="${esc(m.modele)} — photo ${i + 1}" decoding="async" ${i ? 'loading="lazy"' : ""} onload="checkPhoto(this)" referrerpolicy="no-referrer">`, big: taille(p.src, 2000) }));
  const suivi = ME.suivis[m.id];
  const det = [["Référence", m.reference], ["Collection", m.collection], ["Année", m.annee], ["État", m.condition], ["Boîte", m.boite == null ? "" : m.boite ? "Oui" : "Non"], ["Papiers", m.papiers == null ? "" : m.papiers ? "Oui" : "Non"], ["Prix", m.prix ? eur(m.prix, m.devise) + (m.devise !== "EUR" && m.prix_eur ? ` (≈ ${eur(m.prix_eur)})` : "") : "Sur demande"], ["Sur Monalex depuis", m.publie ? fmtDay(m.publie) : ""]].filter(([, b]) => b);
  const html = `
  <nav class="crumbs"><a href="#">Accueil</a> / <a href="#" data-coll-go="${esc(m.collection)}">${esc(m.collection)}</a> / <span>${esc(m.reference || "Annonce")}</span></nav>
  <div class="d-hero">
    <div class="gal">
      <div class="gal-main" id="galMain">${slides.map((s, i) => `<div class="slide" data-i="${i}">${s.html}</div>`).join("") || `<div class="slide">${watchSVG(m.skin, { diam: m.diametre || 40 })}</div>`}</div>
      ${slides.length > 1 ? `<div class="gal-thumbs" id="galThumbs">${slides.map((s, i) => `<button data-i="${i}" aria-label="${esc(s.nom)}" aria-current="${i === 0}">${s.html.replace('decoding="async"', 'decoding="async" loading="lazy"')}</button>`).join("")}</div>` : ""}
      <div class="gal-hint"><span id="galName">${esc(slides[0]?.nom || "")}</span> · photos ${esc(v.nom)}</div>
    </div>
    <div class="d-info">
      <div class="eyebrow">${esc(m.collection)}</div>
      <h1 class="d-ann">${esc(m.modele)}</h1>
      <div class="ref">${[m.reference && "Référence " + m.reference, m.annee].filter(Boolean).map(esc).join(" · ")}</div>
      <div class="d-price"><b>${m.prix ? eur(m.prix, m.devise) : "Prix sur demande"}</b><span class="pill">${esc(m.condition)}</span></div>
      <div class="d-note">Annonce relevée sur le site de ${esc(v.nom)}, vérifiée toutes les 2 heures.</div>
      <div class="d-cta">
        <a class="btn btn-green full" href="${esc(m.url)}" target="_blank" rel="noopener" data-log="site" data-v="${esc(v.id)}" data-m="${esc(m.id)}">Voir l'annonce sur ${esc(host)}</a>
        <button class="btn ${suivi ? "btn-light" : "btn-line"} full" data-follow="${esc(m.id)}" aria-pressed="${!!suivi}">${suivi ? "Alerte active ✓ · arrêter" : "M'alerter (prix, vente)"}</button>
      </div>
      <div class="box"><h3 style="margin-bottom:10px">${esc(v.nom)}</h3><p>Boutique indépendante · ${esc(v.adresse ? v.adresse + ", " : "")}${esc(v.ville)}, ${esc(v.pays)} · à ${fmtKm(v.dist)}</p><p style="margin-top:6px"><a href="${esc(v.site)}" target="_blank" rel="noopener">${esc((v.site || "").replace(/^https?:\/\//, ""))}</a></p></div>
    </div>
  </div>
  <section class="d-sec"><p class="kicker">Détails</p><h2>L'annonce</h2>
    <dl class="specs">${det.map(([a, b]) => `<div class="spec"><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>
    ${m.description ? `<p class="d-resume">${esc(m.description.slice(0, 900))}${m.description.length > 900 ? "…" : ""}</p>` : ""}
    <p class="d-note" style="margin-top:16px">Annonce et photos : ${esc(v.nom)} (${esc(host)}). Monalex n'est pas le vendeur : l'achat se fait auprès de la boutique.</p>
  </section>
  <section class="d-sec"><p class="kicker">Où la voir</p><h2>${esc(v.nom)}</h2>${mapBlock("dmap", { ...v, adresse: v.adresse || v.ville, cp: v.cp || "" })}</section>`;
  openPage(html, m.modele, `<button class="round" data-share aria-label="Partager"><svg viewBox="0 0 24 24"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/></svg></button><button class="round" data-fav="${esc(m.id)}" aria-pressed="${ME.favs.has(m.id)}" aria-label="Favori">${HEART}</button>`);
  const main = $("#galMain"), thumbs = $$("#galThumbs button");
  const setCur = i => { thumbs.forEach((b, j) => b.setAttribute("aria-current", i === j)); if (slides[i]) $("#galName").textContent = slides[i].nom; };
  thumbs.forEach(b => b.onclick = () => { const i = +b.dataset.i; main.scrollTo({ left: main.clientWidth * i, behavior: "smooth" }); setCur(i); });
  main.addEventListener("scroll", () => setCur(Math.round(main.scrollLeft / main.clientWidth)), { passive: true });
  if (slides.length) $$(".slide", main).forEach(el => el.onclick = () => openLB(m, slides, +el.dataset.i));
  pageMap("dmap", v);
}
function pageMontre(id) {
  const m = montre(id);
  if (m && m.annonce) { pageAnnonce(m); return; }
  if (!m) { openPage(`<div class="empty" style="margin-top:30px"><h3>Cette référence n'est plus au catalogue</h3><p>Elle a peut-être été arrêtée par Rolex.</p><button class="btn btn-green" data-goto="list">Voir le catalogue</button></div>`, "Référence introuvable"); return; }
  ME.vues = [id, ...ME.vues.filter(x => x !== id)].slice(0, 12); ME.save();
  const photos = photosOf(m);
  const slides = [...photos.map((p, i) => ({ nom: p.boutique ? `Photo : ${p.auteur}` : p.auteur ? `${p.exacte === false ? `Une autre ${m.collection} (référence différente) · ` : ""}Photo : ${p.auteur} · ${p.licence}` : `Photo ${i + 1}`, credit: p, html: `<img src="${esc(taille(p.src, 1400))}" alt="${esc(m.modele)} — photo ${i + 1}" decoding="async" ${i ? 'loading="lazy"' : ""} onload="checkPhoto(this)">`, big: p.src })),
    ...VUES.slice(0, photos.length ? 1 : 4).map(x => ({ nom: `${x.nom} (illustration)`, html: watchSVG(m.skin, { diam: m.diametre, vb: x.vb, fx: true, label: `${m.modele} — ${x.nom}` }), vb: x.vb }))];
  const dets = detsInZone(), d0 = dets[0] || [...DET].sort((a, b) => a.dist - b.dist)[0];
  const suivi = ME.suivis[m.id];
  const specs = [
    ["Référence", m.reference], ["Collection", m.collection], ["Diamètre", `${m.diametre} mm`], ["Matériau", m.materiau],
    ["Lunette", m.lunette], ["Cadran", m.cadran], ["Mouvement", "Perpétuel, mécanique à remontage automatique"],
    ["Calibre", m.calibre], ["Réserve de marche", `Environ ${m.reserve} heures`], ["Fonctions", m.fonctions],
    ["Bracelet", m.bracelet], ["Fermoir", m.fermoir], ["Étanchéité", `${nf(m.etancheite)} mètres`],
    ["Boîtier", "Oyster, monobloc, fond et couronne vissés"], ["Verre", "Saphir inrayable" + (m.skin.date && m.skin.type !== "daytona" ? ", loupe Cyclope sur la date" : "")],
  ];
  const similar = ALL.filter(x => x.id !== m.id && (x.collection === m.collection || x.couleur_cadran === m.couleur_cadran)).slice(0, 4);
  const html = `
  <nav class="crumbs"><a href="#">Accueil</a> / <a href="#" data-coll-go="${esc(m.collection)}">${esc(m.collection)}</a> / <span>${esc(m.reference)}</span></nav>
  <div class="d-hero">
    <div class="gal">
      <div class="gal-main" id="galMain">${slides.map((s, i) => `<div class="slide" data-i="${i}">${s.html}</div>`).join("")}</div>
      <div class="gal-thumbs" id="galThumbs">${slides.map((s, i) => `<button data-i="${i}" aria-label="${esc(s.nom)}" aria-current="${i === 0}">${s.html}</button>`).join("")}</div>
      <div class="gal-hint"><span id="galName">${esc(slides[0].nom)}</span> · touchez pour agrandir</div>
      ${photos.some(p => p.boutique) ? `<p class="d-note">Photos des boutiques : ${[...new Map(photos.filter(p => p.boutique).map(p => [p.auteur, p])).values()].map(p => `<a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(p.auteur)}</a>`).join(", ")} (voir leurs annonces).</p>` : ""}
      ${photos.some(p => !p.boutique) ? `<p class="d-note">Photos libres de droits : ${photos.filter(p => !p.boutique).map(p => `<a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(p.auteur)} (${esc(p.licence)})</a>`).join(", ")}, via Wikimedia Commons.</p>` : ""}
    </div>
    <div class="d-info">
      <div class="eyebrow">${esc(m.collection)}</div>
      <h1>${esc(m.modele)}</h1>
      <div class="cap">Oyster, ${esc(m.diametre)} mm, ${esc(shortMat(m.materiau))}</div>
      <div class="ref">Référence ${esc(m.reference)} · cadran ${esc(m.cadran.toLowerCase())}</div>
      <div class="d-price"><b>${m.prix ? eur(m.prix, m.devise) : "Neuve"}</b><span class="pill">Catalogue officiel</span></div>
      <div class="d-note">Prix public conseillé affiché sur rolex.com. Rolex ne publie pas le stock de ses détaillants : la disponibilité se confirme en boutique.</div>
      <div class="d-cta">
        ${d0 && d0.tel ? `<a class="btn btn-green" href="tel:${digits(d0.tel)}" data-log="appel" data-v="${esc(d0.id)}" data-m="${esc(m.id)}">Appeler ${esc(d0.ville)}</a>` : `<a class="btn btn-green" href="#d/${encodeURIComponent(d0?.id || "")}">Détaillant le plus proche</a>`}
        <a class="btn btn-light" href="${esc(m.url_ref || m.url_rolex)}" target="_blank" rel="noopener">Prix sur rolex.com</a>
        <button class="btn ${suivi ? "btn-light" : "btn-line"} full" data-follow="${esc(m.id)}" aria-pressed="${!!suivi}">${suivi ? "Alerte active ✓ · arrêter" : "M'alerter pour cette montre"}</button>
        <p class="d-note full" style="margin:0;text-align:center">Notification si elle devient disponible chez un détaillant, ou si son prix change.</p>
      </div>
      ${d0 ? `<a class="box mini-seller" href="#d/${encodeURIComponent(d0.id)}"><span class="avatar gold">${esc(initials(d0.nom))}</span><div class="who"><b>${esc(d0.nom)}</b><span>Détaillant officiel · ${esc(d0.adresse)}, ${esc(d0.ville)}</span><span>À ${fmtKm(d0.dist)} ${S.near ? "de vous" : "de Monaco"}${dets.length > 1 ? ` · ${dets.length} détaillants dans la zone` : ""}</span></div>${CHEV}</a>` : ""}
    </div>
  </div>

  <section class="d-sec" id="contact">
    <p class="kicker">Où l'acheter neuve</p>
    <h2>${dets.length} détaillant${dets.length > 1 ? "s" : ""} officiel${dets.length > 1 ? "s" : ""} · ${esc(ZONE_NOM[S.zone])}</h2>
    <div class="vfilters">${ZONES.map(x => `<button class="chip" data-z="${x.id}" data-rerender aria-pressed="${S.zone === x.id}">${esc(x.nom.replace("+ ", ""))} (${detsInZone(x.id).length})</button>`).join("")}</div>
    <div class="seller"><div class="sellers" style="grid-template-columns:1fr">${dets.map(detRow).join("") || `<div class="empty"><h3>Aucun détaillant relevé dans cette zone</h3><p>Élargissez la zone.</p></div>`}</div>
      <div>${d0 ? mapBlock("dmap", d0) : ""}</div></div>
    ${mesEchanges(d0?.id, m.id)}
  </section>

  <section class="d-sec">
    <p class="kicker">Caractéristiques</p>
    <h2>Fiche technique</h2>
    <dl class="specs">${specs.map(([a, b]) => `<div class="spec"><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>
    <p class="d-note" style="margin-top:16px">D'après rolex.com. <a href="${esc(m.url_ref || m.url_rolex)}" target="_blank" rel="noopener">Voir la page officielle</a>.</p>
  </section>

  ${similar.length ? `<section class="d-sec"><p class="kicker">À découvrir aussi</p><h2>Références proches</h2><div class="similar">${similar.map(cardHTML).join("")}</div></section>` : ""}`;

  openPage(html, m.modele, `<button class="round" data-share aria-label="Partager"><svg viewBox="0 0 24 24"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/></svg></button><button class="round" data-fav="${esc(m.id)}" aria-pressed="${ME.favs.has(m.id)}" aria-label="Favori">${HEART}</button>`);
  const main = $("#galMain"), thumbs = $$("#galThumbs button");
  const setCur = i => { thumbs.forEach((b, j) => b.setAttribute("aria-current", i === j)); $("#galName").textContent = slides[i].nom; };
  thumbs.forEach(b => b.onclick = () => { const i = +b.dataset.i; main.scrollTo({ left: main.clientWidth * i, behavior: "smooth" }); setCur(i); });
  main.addEventListener("scroll", () => { const i = Math.round(main.scrollLeft / main.clientWidth); if (slides[i]) setCur(i); }, { passive: true });
  $$(".slide", main).forEach(el => el.onclick = () => openLB(m, slides, +el.dataset.i));
  if (d0) pageMap("dmap", d0);
  if (alerts().some(a => a.id === m.id)) setTimeout(() => markSeen(m.id), 1500);
}
function formMessage(v, m) {
  const c = ME.compte || {};
  return `<form class="form" data-form-v="${esc(v.id)}" ${m ? `data-form-m="${esc(m.id)}"` : ""}>
    <h3>Écrire au vendeur</h3>
    <p class="h">Le message part depuis votre téléphone (e-mail, WhatsApp ou SMS). Il est noté dans « Mes demandes » pour suivre la réponse.</p>
    <div class="fld"><label class="sr" for="mName">Votre nom</label><input class="inp" id="mName" placeholder="Votre nom" autocomplete="name" value="${esc(c.prenom ? c.prenom + " " + c.nom : "")}"><label class="sr" for="mTel">Votre téléphone</label><input class="inp" id="mTel" placeholder="Votre téléphone" autocomplete="tel" inputmode="tel" value="${esc(c.tel || "")}"></div>
    <label class="sr" for="mTxt">Message</label><textarea class="inp" id="mTxt">${esc(messageType(m, v).replace(/\n\n?Merci,[\s\S]*$/, "\n\nMerci,"))}</textarea>
    <div class="row"><button class="btn btn-green" type="button" data-send="e-mail">Envoyer par e-mail</button><button class="btn btn-light" type="button" data-send="WhatsApp" style="background:#fff">WhatsApp</button><button class="btn btn-light" type="button" data-send="SMS" style="background:#fff">SMS</button></div>
  </form>`;
}

/* ---------- page d'un vendeur */
function pageVendeur(id) {
  const v = vendeur(id);
  if (!v) { location.hash = "vendeurs"; return; }
  const ms = ALL.filter(m => m.vendeur === id).sort((a, b) => b.prix - a.prix);
  const L2 = mapsLinks(v);
  const html = `
  <nav class="crumbs"><a href="#">Accueil</a> / <a href="#vendeurs">Vendeurs</a> / <span>${esc(v.nom)}</span></nav>
  <div class="acc-h">${avatar(v, true)}<div><div class="eyebrow">${esc(v.type)}</div><h1>${esc(v.nom)}</h1><p>${isOnline(v) ? '<span class="live">En ligne maintenant</span>' : "Dernière connexion " + esc(ago(v.derniere_connexion))} · ${esc(lieu(v))} · à ${fmtKm(v.dist)}</p></div></div>
  <div class="stats">
    <div class="stat"><b>${isOnline(v) ? "En ligne" : esc(ago(v.derniere_connexion).replace("il y a ", ""))}</b><span>dernière connexion</span></div>
    <div class="stat"><b>~${fmtDur(v.temps_reponse_min)}</b><span>pour répondre · n° ${v.rang} sur ${VEND.length}</span></div>
    <div class="stat"><b>${v.taux_reponse} %</b><span>de réponses</span></div>
    <div class="stat"><b>★ ${String(v.note).replace(".", ",")}</b><span>${nf(v.avis)} avis</span></div>
    <div class="stat"><b>${nf(v.ventes)}</b><span>ventes depuis ${esc(v.membre_depuis)}</span></div>
  </div>
  <div class="seller">${sellerCard(v, null)}
    <div>${mapBlock("vmap", v)}</div>
  </div>
  ${mesEchanges(v.id)}
  ${formMessage(v, null)}
  <section class="d-sec" style="margin-top:40px"><p class="kicker">En vente</p><h2>${ms.length} montre${ms.length > 1 ? "s" : ""} chez ce vendeur</h2><div class="similar">${ms.map(cardHTML).join("")}</div></section>`;
  openPage(html, v.nom);
  pageMap("vmap", v);
}

/* ---------- page d'une collection : visuel, carrousel des modèles, caractéristiques, aller plus loin, suivant */
const COLL_TXT = {
  "Submariner": ["L'appel des profondeurs", "La montre de plongée de référence : lunette tournante graduée, index lumineux et étanchéité à 300 mètres. Un outil devenu une icône."],
  "Cosmograph Daytona": ["Le temps de la course", "Un chronographe né pour les pilotes : échelle tachymétrique sur la lunette, trois compteurs et une lisibilité sans faille."],
  "GMT-Master II": ["Deux fuseaux, un regard", "Lire l'heure ici et ailleurs d'un seul coup d'œil, grâce à l'aiguille 24 heures et à la lunette bicolore."],
  "Datejust": ["L'élégance de la date", "La date sous sa loupe, une lunette cannelée, un bracelet Jubilé : l'équilibre classique par excellence."],
  "Day-Date": ["Le prestige en toutes lettres", "Le jour en toutes lettres et la date, toujours en or ou en platine, sur le bracelet Président."],
  "Oyster Perpetual": ["La prouesse de l'essentiel", "Trois aiguilles, un cadran net, un boîtier Oyster étanche : la montre réduite à ce qui compte."],
  "Explorer": ["Pensée pour l'extrême", "Une lisibilité parfaite avec ses chiffres 3, 6 et 9, et une robustesse faite pour les expéditions."],
  "Sea-Dweller": ["Plus profond encore", "Une plongeuse taillée pour la saturation, avec valve à hélium et étanchéité à 1 220 mètres."],
  "Deepsea": ["Vers les abysses", "Un boîtier renforcé conçu pour les très grandes profondeurs : étanche jusqu'à 3 900 mètres."],
  "Yacht-Master": ["L'esprit du large", "Une montre de navigation élégante, avec lunette tournante bidirectionnelle aux chiffres en relief."],
  "Sky-Dweller": ["Le voyageur accompli", "Deuxième fuseau horaire et calendrier annuel, réglés simplement par la lunette tournante."],
  "1908": ["L'art du classique", "Un boîtier fin, un cadran épuré et une petite seconde : l'horlogerie habillée dans sa forme la plus pure."],
  "Air-King": ["L'hommage à l'aviation", "Un cadran inspiré des instruments de bord, avec une grande minuterie pour lire les temps de vol."],
};
const slugC = c => norm(c).replace(/[^a-z0-9]+/g, "-");
const collOf = slug => collections().map(([c]) => c).find(c => slugC(c) === slug);
function swatch(m) {
  const set = metalSet(m.skin.metal), a = METALS[set.kase], b = METALS[set.bezel];
  return `linear-gradient(135deg, ${b[0]} 0%, ${b[1]} 35%, ${a[2]} 50%, ${a[1]} 70%, ${a[0]} 100%)`;
}
/* ---------- montres en 3D (Three.js, comme le site Red Bull) */
const M3D = new Map();
// Photo pour la 3D : une vraie photo « de face » d'une montre de la collection, hébergée par Shopify (autorise l'usage en 3D)
function photo3D(collection) {
  const cand = (ANNDATA.annonces || []).filter(a => a.collection === collection && a.photos?.length).flatMap(a => a.photos.map(p => p.src))
    .filter(src => /cdn\.shopify\.com/.test(src));
  const best = cand.find(src => /front/i.test(src)) || cand[0];
  return best ? taille(best, 1100) : "";
}
function mount3D(canvas, m, scrollEl, actif) {
  if (!canvas || M3D.get(canvas)) return;
  M3D.set(canvas, "…");
  const go = () => import("./watch3d.js?v=19").then(mod => mod.mountWatch3D(canvas, m.skin, { svg: watchSVG(m.skin, { diam: m.diametre, vb: "71 171 258 258", fx: true }), scrollEl, actif, modele: m.skin.type === "daytona" ? "models/daytona.glb" : "", photo: photo3D(m.collection || "Cosmograph Daytona") })).then(h => { if (h) { M3D.set(canvas, h); canvas.classList.add("on"); } else canvas.remove(); })
    .catch(() => canvas.remove());
  if (document.documentElement.classList.contains("calm")) { canvas.remove(); return; }
  "requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 400);
}
function pageCollection(slug) {
  const c = collOf(slug);
  if (!c) { location.hash = ""; return; }
  const ms = ALL.filter(m => m.collection === c).sort((a, b) => a.diametre - b.diametre);
  const [titre, texte] = COLL_TXT[c] || [c, ""];
  const liste = collections().map(([x]) => x), suivante = liste[(liste.indexOf(c) + 1) % liste.length];
  const m0 = ms[0], dets = detsInZone();
  const html = `
  <section class="cp-hero">
    <div class="cp-hero-img">${watchSVG(m0.skin, { diam: m0.diametre, vb: "55 90 290 410" })}<canvas class="cp-3d" id="cp3d" aria-label="${esc(m0.modele)} en 3D, faites glisser pour la tourner"></canvas></div>
    <div class="cp-hero-t"><p class="eyebrow">${esc(c)}</p><h1>${esc(titre)}</h1><p>${esc(texte)}</p></div>
  </section>

  <section class="cp-models" id="cp-modeles">
    <div class="cp-track" id="cpTrack">${ms.map((m, i) => `<div class="cp-slide" data-i="${i}"><a href="#m/${encodeURIComponent(m.id)}">${watchSVG(m.skin, { diam: m.diametre, label: m.modele })}</a></div>`).join("")}</div>
    ${ms.length > 1 ? `<p class="cp-hint">Faire glisser pour explorer</p>` : ""}
    <div class="cp-sw" role="tablist" aria-label="Versions">${ms.map((m, i) => `<button role="tab" aria-selected="${i === 0}" data-sw="${i}" aria-label="${esc(m.modele)}, ${esc(shortMat(m.materiau))}" style="background:${swatch(m)}"></button>`).join("")}</div>
    <div class="cp-info" id="cpInfo"></div>
  </section>

  <section class="cp-feat" id="cp-carac">
    <div class="wrap"><p class="cp-lead">${esc(m0.fonctions)}. Boîtier Oyster, mouvement perpétuel, étanchéité ${nf(m0.etancheite)} mètres.</p>
      <a class="btn btn-green" href="#m/${encodeURIComponent(m0.id)}">Découvrir les caractéristiques</a></div>
    <div class="cp-macro">${watchSVG(m0.skin, { diam: m0.diametre, vb: "120 175 280 260", par: "xMidYMid slice" })}</div>
  </section>

  <section class="cp-more" id="cp-plus">
    <h2>Aller plus loin</h2>
    <div class="cp-grid">
      <a class="cp-tile" href="#officiels"><span class="cp-ti">${watchSVG(m0.skin, { diam: m0.diametre, vb: "100 200 200 200" })}</span><b>Où l'acheter</b><small>${dets.length} détaillant${dets.length > 1 ? "s" : ""} · ${esc(ZONE_NOM[S.zone])}</small></a>
      <a class="cp-tile dark" href="#m/${encodeURIComponent(m0.id)}"><span class="cp-ti">${watchSVG(m0.skin, { diam: m0.diametre, vb: "205 160 160 160" })}</span><b>La fiche technique</b><small>Calibre ${esc(m0.calibre)} · ${m0.reserve} h</small></a>
      <button class="cp-tile" data-alert-coll="${esc(c)}"><span class="cp-ti cp-bell"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2ZM10 20a2 2 0 0 0 4 0"/></svg></span><b>M'alerter</b><small>Pour toute nouvelle ${esc(c)}</small></button>
      <button class="cp-tile" data-coll-go="${esc(c)}"><span class="cp-ti">${watchSVG((ms[1] || m0).skin, { diam: (ms[1] || m0).diametre, vb: "105 400 190 190" })}</span><b>Toutes les ${esc(c)}</b><small>${ms.length} référence${ms.length > 1 ? "s" : ""} au catalogue</small></button>
    </div>
  </section>

  <section class="cp-next">
    <p class="eyebrow">Suivant</p>
    <h2>${esc(suivante)}</h2>
    <a class="btn btn-green" href="#c/${slugC(suivante)}">En savoir plus</a>
  </section>

  <footer class="cp-foot">
    <img src="img/logo.png" alt="Monalex" width="220">
    <nav class="crumbs"><a href="#">Accueil</a> / <a href="#" data-goto="list">Montres</a> / <span>${esc(c)}</span></nav>
    <button class="btn btn-light" data-share><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" stroke="currentColor" stroke-width="2"/></svg>Partager</button>
  </footer>

  <div class="cp-bar" id="cpBar"><button class="cp-bar-b" aria-expanded="false">${esc(c)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 15 6-6 6 6"/></svg></button>
    <div class="cp-bar-m" hidden>
      <a href="#cp-modeles" data-cpgo>Les modèles</a><a href="#cp-carac" data-cpgo>Caractéristiques</a><a href="#cp-plus" data-cpgo>Aller plus loin</a>
      <hr>${liste.map(x => `<a href="#c/${slugC(x)}"${x === c ? ' aria-current="page"' : ""}>${esc(x)}</a>`).join("")}
    </div></div>`;
  openPage(html, c);
  page().classList.add("cp");
  mount3D($("#cp3d"), m0, page(), () => page().classList.contains("open"));
  // carrousel des modèles + pastilles
  const track = $("#cpTrack"), info = $("#cpInfo"), sws = $$("[data-sw]");
  const show = i => {
    const m = ms[i];
    sws.forEach((b, j) => b.setAttribute("aria-selected", i === j));
    info.innerHTML = `<p class="cp-new">${m.etat === "Neuf" ? "Catalogue officiel" : esc(m.etat)}</p>
      <button class="cp-fav" data-fav="${esc(m.id)}" aria-pressed="${ME.favs.has(m.id)}">${HEART}<span>${ME.favs.has(m.id) ? "Dans vos favoris" : "Ajouter aux favoris"}</span></button>
      <h3>${esc(m.modele)}</h3><p class="cp-cap">Oyster, ${m.diametre} mm, ${esc(m.materiau.toLowerCase())}</p>
      <a class="cp-link" href="#m/${encodeURIComponent(m.id)}">Découvrir ce modèle ${CHEV}</a>`;
  };
  show(0);
  track.addEventListener("scroll", () => { const i = Math.round(track.scrollLeft / track.clientWidth); if (ms[i] && sws[i]?.getAttribute("aria-selected") !== "true") show(i); }, { passive: true });
  sws.forEach(b => b.onclick = () => { const i = +b.dataset.sw; track.scrollTo({ left: track.clientWidth * i, behavior: "smooth" }); show(i); });
  const bar = $("#cpBar"), bb = $(".cp-bar-b", bar), menu = $(".cp-bar-m", bar);
  bb.onclick = () => { const o = menu.hidden; menu.hidden = !o; bb.setAttribute("aria-expanded", o); };
  $$("[data-cpgo]", bar).forEach(a => a.onclick = e => { e.preventDefault(); menu.hidden = true; bb.setAttribute("aria-expanded", false); const t = $(a.getAttribute("href")); page().scrollTo({ top: t.offsetTop - 70, behavior: "smooth" }); });
}

/* ---------- détaillant officiel (données réelles) */
function pageDetaillant(id) {
  const d = detaillant(id);
  if (!d) { location.hash = "officiels"; return; }
  const proches = DET.filter(x => x.id !== d.id).sort((a, b) => km(d, a) - km(d, b)).slice(0, 3);
  const html = `
  <nav class="crumbs"><a href="#">Accueil</a> / <a href="#officiels">Détaillants officiels</a> / <span>${esc(d.ville)}</span></nav>
  <div class="acc-h"><span class="avatar gold" style="width:72px;height:72px;font-size:24px">${esc(initials(d.nom))}</span><div><div class="eyebrow">Détaillant officiel Rolex${d.service ? " · centre de service" : ""}</div><h1>${esc(d.nom)}</h1><p>${esc(lieu(d))} · à ${fmtKm(d.dist)} ${S.near ? "de vous" : "de Monaco"}</p></div></div>
  <div class="seller">
    <div class="seller-card">
      <div class="tags"><span class="tag g">Détaillant officiel</span>${d.service ? '<span class="tag">Centre de service</span>' : ""}<span class="tag o">Vérifié le ${esc(fmtDay(DETDATA.verifie_le + "T12:00"))}</span></div>
      <dl>
        <div><dt>Adresse</dt><dd>${esc(d.adresse)}<br>${esc(d.cp)} ${esc(d.ville)}, ${esc(d.pays)}</dd></div>
        <div><dt>Téléphone</dt><dd>${d.tel ? `<a href="tel:${digits(d.tel)}" data-log="appel" data-v="${esc(d.id)}">${esc(d.tel)}</a>` : "Voir la fiche officielle"}</dd></div>
        <div><dt>Horaires</dt><dd>${esc(d.horaires || "Voir la fiche officielle")}</dd></div>
        <div><dt>Source</dt><dd><a href="${esc(d.source)}" target="_blank" rel="noopener">${esc(new URL(d.source).hostname.replace(/^www\./, ""))}</a></dd></div>
      </dl>
      <div class="sa">
        ${d.tel ? `<a class="btn btn-green" href="tel:${digits(d.tel)}" data-log="appel" data-v="${esc(d.id)}">Appeler</a>` : ""}
        <a class="btn btn-light" href="${esc(d.source)}" target="_blank" rel="noopener" style="background:#fff">${/rolex\.com/.test(d.source) ? "Voir sur rolex.com" : "Site du détaillant"}</a>
        <a class="btn btn-light" href="${earthUrl(d)}" target="_blank" rel="noopener" style="background:#fff">Google Earth 3D</a>
        <button class="btn btn-light" data-copy-v="${esc(d.id)}" style="background:#fff">Copier</button>
      </div>
      <p class="d-note" style="margin-top:16px">Les détaillants officiels ne publient pas leur stock en ligne : appelez ou passez en boutique pour demander une montre. Les temps de réponse ne sont pas publics : ceux de vos propres demandes s'affichent ci-dessous.</p>
    </div>
    <div>${mapBlock("dmap", d)}</div>
  </div>
  ${mesEchanges(d.id)}
  <section class="d-sec" style="margin-top:40px"><p class="kicker">À proximité</p><h2>Autres détaillants officiels</h2><div class="sellers">${proches.map(detRow).join("")}</div></section>`;
  openPage(html, d.nom);
  pageMap("dmap", d);
}
let OZONE = null;
function pageOfficiels() {
  const zid = OZONE || S.zone;
  const list = detsInZone(zid);
  const html = `
    <nav class="crumbs"><a href="#">Accueil</a> / <span>Détaillants officiels</span></nav>
    <h1 class="p-h1">Les détaillants officiels</h1>
    <p class="p-lead">${DET.length} détaillants officiels Rolex relevés sur rolex.com et sur leurs sites, de Monaco au reste du monde. Choisissez une zone, puis ouvrez une fiche pour le plan, Google Maps, la vue satellite, Google Earth en 3D et le téléphone.</p>
    <div class="vfilters">${ZONES.map(x => `<button class="chip" data-ozone="${x.id}" aria-pressed="${zid === x.id}">${esc(x.nom.replace("+ ", ""))} (${detsInZone(x.id).length})</button>`).join("")}</div>
    <div id="omap" style="margin-bottom:18px"></div>
    <div class="sellers">${list.map(detRow).join("")}</div>
    <p class="d-note" style="margin-top:18px">Liste vérifiée le ${esc(fmtDay(DETDATA.verifie_le + "T12:00"))}. Rolex compte plus de mille détaillants officiels : la liste complète est sur le site officiel de Rolex.</p>`;
  openPage(html, "Détaillants officiels");
  storeMap($("#omap"), list, ZONE_NOM[zid]);

}

/* ---------- à propos, fonctionnement, données personnelles */
function pageInfos() {
  const nPays = new Set(DET.map(d => d.code_pays)).size;
  openPage(`
    <nav class="crumbs"><a href="#">Accueil</a> / <span>À propos</span></nav>
    <p class="kicker">Monalex</p>
    <h1 class="p-h1">Trouver la bonne montre, au bon endroit.</h1>
    <p class="p-lead">Monalex réunit les montres disponibles et les détaillants officiels, de Monaco au monde entier. Pour chaque montre : où elle se trouve, son état réel, son entretien, son prix et le vendeur à contacter.</p>
    <div class="stats" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat"><b>${DET.length}</b><span>détaillants officiels</span></div>
      <div class="stat"><b>${nPays}</b><span>pays couverts</span></div>
      <div class="stat"><b>${ALL.length}</b><span>références au catalogue</span></div>
      <div class="stat"><b>4</b><span>vues de carte</span></div>
    </div>
    <section class="d-sec"><p class="kicker">Comment ça marche</p><h2>En trois gestes</h2>
      <div class="steps">
        <div class="box"><b class="num">1</b><h3>Choisissez une zone</h3><p>Monaco, puis la France, l'Europe ou le monde entier. Les montres et les détaillants sont classés du plus proche au plus loin.</p></div>
        <div class="box"><b class="num">2</b><h3>Lisez la fiche complète</h3><p>État pièce par pièce, entretien Rolex ou indépendant, pièces changées, papiers, garantie, historique de l'annonce.</p></div>
        <div class="box"><b class="num">3</b><h3>Contactez et suivez</h3><p>Appelez, écrivez, suivez la montre : vous êtes prévenu si son prix baisse ou si elle est réservée.</p></div>
      </div>
    </section>
    <section class="d-sec"><p class="kicker">Sources</p><h2>D'où viennent les informations</h2>
      <div class="two">
        <div class="box"><h3>Détaillants officiels</h3><p>Relevés le ${esc(fmtDay((DETDATA.verifie_le || "2026-11-14") + "T12:00"))} sur rolex.com et sur les sites des détaillants. Chaque fiche renvoie à sa source. Horaires et téléphones peuvent changer : appelez avant de vous déplacer.</p></div>
        <div class="box"><h3>Catalogue</h3><p>Références du catalogue Rolex actuel, caractéristiques d'après rolex.com, où figure aussi le prix public conseillé. Rolex ne publie pas le stock de ses détaillants : la disponibilité se confirme en boutique. Aucun site d'occasion, de particuliers ou de petites annonces n'est utilisé.</p></div>
      </div>
    </section>
    <section class="d-sec" id="donnees"><p class="kicker">Données personnelles</p><h2>Vos informations restent sur votre téléphone</h2>
      <div class="two">
        <div class="box"><h3>Ce qui est enregistré</h3><p>Votre compte (nom, e-mail, téléphone, ville), vos favoris, vos montres suivies et l'historique de vos demandes. Tout est conservé dans ce navigateur, sur cet appareil. Monalex n'envoie rien à un serveur.</p></div>
        <div class="box"><h3>Ce que vous contrôlez</h3><p>Vos messages partent de votre téléphone (e-mail, WhatsApp, SMS). Votre position n'est utilisée que si vous touchez « Autour de moi », et n'est pas conservée. Vous pouvez supprimer votre compte à tout moment depuis « Mon compte ».</p></div>
      </div>
    </section>
    <section class="d-sec" id="cookies-info"><p class="kicker">Cookies</p><h2>Ce que Monalex enregistre</h2>
      <div class="two">
        <div class="box"><h3>Nécessaire</h3><p>Le stockage de votre navigateur garde votre compte, vos favoris, vos suivis, vos choix d'affichage et ce choix de cookies. Rien n'est envoyé à un serveur ni à un tiers. Sans lui, l'appli ne peut pas mémoriser votre compte.</p></div>
        <div class="box"><h3>Google Maps (facultatif)</h3><p>Les onglets « Google Maps » et « Satellite » chargent une carte Google, qui dépose ses propres cookies. Ils ne s'affichent qu'avec votre accord. Le plan, les polices et le reste du site n'en utilisent pas. Monalex n'utilise ni publicité ni mesure d'audience.</p></div>
      </div>
      <div class="row" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><button class="btn btn-green" data-ck="ok">Accepter Google Maps</button><button class="btn btn-light" data-ck="non">Refuser</button></div>
      <p class="d-note" style="margin-top:10px">Choix actuel : ${COOK.get() === "ok" ? "accepté" : COOK.get() === "non" ? "refusé" : "pas encore fait"}.</p>
    </section>
    <section class="d-sec"><p class="kicker">Mentions</p><h2>Informations légales</h2>
      <div class="box"><p>Monalex est un service indépendant, non affilié à Rolex SA ni à ses détaillants. Rolex, Oyster, Cosmograph Daytona, Submariner, GMT-Master II, Datejust, Day-Date et les autres noms de modèles sont des marques de Rolex SA, citées pour décrire les montres. Cartes © OpenStreetMap, © CARTO ; Google Maps et Google Earth © Google.</p></div>
    </section>`, "À propos de Monalex");
  if (S.ancre) { const a = S.ancre; S.ancre = null; setTimeout(() => { const el = document.getElementById(a); if (el) page().scrollTop = el.offsetTop - 70; }, 60); }
}

/* ---------- sources, rangées par catégorie */
function pageSources(ouvrir = "") {
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
  const ligne = (nom, sous, url) => `<li><span><b>${esc(nom)}</b>${sous ? `<small>${esc(sous)}</small>` : ""}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(host(url))} ↗</a>` : ""}</li>`;
  const parPays = (items, f) => { const m = new Map(); items.forEach(x => { const k = x.pays || "Autres"; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return [...m.entries()].map(([k, xs]) => `<p class="src-pays">${esc(k)}</p><ul class="src-l">${xs.map(f).join("")}</ul>`).join(""); };
  const bouts = Object.entries(ANNDATA.boutiques || {}).map(([id, b]) => ({ id, ...b, n: (ANNDATA.sources || []).find(x => x.id === id)?.annonces }));
  const groupes = [
    ["catalogue", "Catalogue officiel", "Les références, leurs caractéristiques et le prix public conseillé.", `<ul class="src-l">${ligne("Rolex — les montres", "Caractéristiques et prix public de chaque référence", "https://www.rolex.com/fr/watches")}${ligne("Rolex — trouver un détaillant", "Liste officielle des détaillants", "https://www.rolex.com/fr/store-locator")}</ul>`],
    ["detaillants", `Détaillants officiels (${DET.length})`, `Adresses et téléphones relevés le ${fmtDay((DETDATA.verifie_le || "2026-11-14") + "T12:00")}, chacun avec sa fiche d'origine.`, parPays(DET, d => ligne(d.nom, `${d.adresse}, ${d.ville}`, d.source))],
    ["boutiques", `Boutiques et annonces (${bouts.length})`, `Annonces relevées toutes les 2 heures sur le site de chaque boutique${ANNDATA.mise_a_jour ? `, dernière fois ${ago(ANNDATA.mise_a_jour, Date.now())}` : ""}. Les photos appartiennent aux boutiques.`, parPays(bouts, b => ligne(b.nom, `${b.ville}${b.n != null ? ` · ${b.n} annonce${b.n > 1 ? "s" : ""}` : ""}`, b.site))],
    ["photos", "Photos du catalogue", "Photos libres de droits trouvées sur Wikimedia Commons, avec leur auteur et leur licence. Quand il n'y en a pas, la montre est dessinée.", `<ul class="src-l">${Object.entries(PHOTOS.photos || {}).flatMap(([id, ps]) => ps.map(p => ligne(p.auteur, `${(montre(id) || {}).modele || id} · ${p.licence}`, p.page))).join("") || ligne("Wikimedia Commons", "Recherche des photos en cours", "https://commons.wikimedia.org")}</ul>`],
    ["cartes", "Cartes", "Fonds de carte, vue satellite et 3D.", `<ul class="src-l">${ligne("Esri", "Fond de carte gris clair (Esri, HERE, Garmin)", "https://www.esri.com")}${ligne("OpenStreetMap", "Données cartographiques, © contributeurs OpenStreetMap", "https://www.openstreetmap.org/copyright")}${ligne("Google Maps", "Plan et satellite, sur accord des cookies", "https://maps.google.com")}${ligne("Google Earth", "Vue 3D des adresses", "https://earth.google.com")}</ul>`],
    ["credits", "Polices et outils", "Tous libres d'utilisation.", `<ul class="src-l">${ligne("Cormorant Garamond", "Police des titres · licence SIL OFL", "https://github.com/CatharsisFonts/Cormorant")}${ligne("EB Garamond", "Police du texte · licence SIL OFL", "https://github.com/octaviopardo/EBGaramond12")}${ligne("Three.js", "Montres en 3D · licence MIT", "https://threejs.org")}${ligne("Leaflet", "Cartes interactives · licence BSD", "https://leafletjs.com")}</ul>`],
  ];
  openPage(`
    <nav class="crumbs"><a href="#">Accueil</a> / <span>Sources</span></nav>
    <h1 class="p-h1">Sources</h1>
    <p class="p-lead">D'où viennent les informations de Monalex. Uniquement des sources officielles et des sites de boutiques.</p>
    <div class="src">${groupes.map(([id, titre, sous, corps]) => `<details id="src-${id}"${id === ouvrir || !ouvrir && id === "catalogue" ? " open" : ""}><summary><span>${esc(titre)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><p class="src-sous">${esc(sous)}</p>${corps}</details>`).join("")}</div>
    <p class="copyright" style="text-align:center;margin-top:50px">© ${new Date().getFullYear()} Monalex · Camilian. Tous droits réservés.</p>`, "Sources");
  if (ouvrir) setTimeout(() => { const el = $("#src-" + ouvrir); if (el) page().scrollTop = el.offsetTop - 80; }, 60);
}

/* ---------- notifications */
function pageNotifications() {
  const c = ME.compte, al = alerts();
  const perm = "Notification" in window ? Notification.permission : "indisponible";
  const etat = perm === "granted" && c?.notif ? "Activées sur ce téléphone" : perm === "denied" ? "Bloquées dans les réglages du téléphone" : perm === "indisponible" ? "Non disponibles sur ce navigateur" : "Désactivées";
  openPage(`
    <nav class="crumbs"><a href="#">Accueil</a> / <span>Notifications</span></nav>
    <h1 class="p-h1">Notifications</h1>
    <p class="p-lead">Soyez prévenu quand le prix d'une montre suivie baisse, ou quand elle est réservée ou vendue.</p>
    <div class="box notif-state"><div><h3 style="margin:0 0 4px">${esc(etat)}</h3><p>${perm === "denied" ? "Autorisez Monalex dans les réglages de notifications du téléphone." : perm === "indisponible" ? "Sur iPhone, ajoutez d'abord Monalex à l'écran d'accueil (Partager, puis « Sur l'écran d'accueil »)." : !c ? "Un compte est nécessaire pour suivre des montres." : "Les alertes arrivent quand vous ouvrez ou rafraîchissez Monalex."}</p></div>
      ${!c ? `<a class="btn btn-green" href="#compte">Créer mon compte</a>` : perm === "granted" && c.notif ? `<button class="btn btn-light" data-notif-off style="background:#fff">Désactiver</button>` : perm === "default" || (perm === "granted" && !c.notif) ? `<button class="btn btn-green" data-notif>Activer les notifications</button>` : ""}
    </div>
    <section class="d-sec"><p class="kicker">Mes alertes</p><h2>${ME.alertes.length + Object.keys(ME.suivis).length ? `${ME.alertes.length} recherche${ME.alertes.length > 1 ? "s" : ""} · ${Object.keys(ME.suivis).length} montre${Object.keys(ME.suivis).length > 1 ? "s" : ""}` : "Aucune alerte"}</h2>
      <div class="plist">${ME.alertes.map(a => { const n = filterWith(a.crit).length; return `<div class="pitem" style="grid-template-columns:1fr"><div><b>${esc(a.nom)}</b><span>${n} montre${n > 1 ? "s" : ""} correspondent aujourd'hui · créée le ${esc(fmtDay(a.cree))}</span><div class="mine" style="padding:0;background:none;margin-top:6px"><div class="row"><button class="btn btn-green" data-voir-alert="${a.id}">Voir les montres</button><button class="btn btn-light" data-del-alert="${a.id}" style="background:#fff">Supprimer</button></div></div></div></div>`; }).join("")}
        ${Object.keys(ME.suivis).map(id => montre(id)).filter(Boolean).map(m => pitem(m, "", `<span>Alerte sur cette montre</span>`)).join("")}</div>
      ${!ME.alertes.length ? `<p class="d-note" style="margin-top:12px">Choisissez vos critères dans « Filtres », puis « Créer une alerte avec ces critères ».</p>` : ""}
      <div style="margin-top:14px"><button class="btn btn-line" data-goto="list">Nouvelle recherche</button></div>
    </section>
    <section class="d-sec"><p class="kicker">Nouveautés</p><h2>${al.length ? `${al.length} changement${al.length > 1 ? "s" : ""}` : "Aucune alerte"}</h2>
      ${al.length ? `<div class="plist">${al.map(a => a.m ? pitem(a.m, "", `<span class="alert">● ${esc(a.texte)}</span>`) : `<div class="box"><p>${esc(a.texte)}</p></div>`).join("")}</div><div style="margin-top:16px"><button class="btn btn-light" data-seen-all>Tout marquer comme lu</button></div>`
        : `<div class="empty"><h3>Rien de nouveau</h3><p>Les changements de prix et de statut de vos montres suivies s'afficheront ici.</p><a class="btn btn-green" href="#suivis">Mes montres suivies</a></div>`}
    </section>`, "Notifications");
}

/* ---------- tous les vendeurs */
let VSORT = "react", VZONE = "monde";
function pageVendeurs() {
  const z = ZONES.find(x => x.id === VZONE);
  const list = VEND.filter(v => z.test(v.code_pays)).sort({
    react: (a, b) => a.rang - b.rang,
    vu: (a, b) => Date.parse(b.derniere_connexion) - Date.parse(a.derniere_connexion),
    note: (a, b) => b.note - a.note || b.avis - a.avis,
    dist: (a, b) => a.dist - b.dist,
  }[VSORT]);
  const nOn = VEND.filter(isOnline).length;
  const html = `
    <nav class="crumbs"><a href="#">Accueil</a> / <span>Vendeurs</span></nav>
    <h1 class="p-h1">Les vendeurs</h1>
    <p class="p-lead">${VEND.length} vendeurs, dont ${nOn} en ligne en ce moment. Pour chacun : dernière connexion, temps de réponse habituel, taux de réponse, dernière réponse à un client, avis et ventes.</p>
    <div class="vfilters">${[["react", "Les plus réactifs"], ["vu", "Connectés récemment"], ["note", "Les mieux notés"], ["dist", "Les plus proches"]].map(([k, l]) => `<button class="chip" data-vsort="${k}" aria-pressed="${VSORT === k}">${l}</button>`).join("")}</div>
    <div class="vfilters">${ZONES.map(x => `<button class="chip" data-vzone="${x.id}" aria-pressed="${VZONE === x.id}">${esc(x.nom.replace("+ ", ""))}</button>`).join("")}</div>
    <div class="sellers">${list.map(sellerRow).join("") || `<div class="empty"><h3>Aucun vendeur dans cette zone</h3></div>`}</div>`;
  openPage(html, "Les vendeurs");
}

/* ---------- favoris, suivis et demandes */
function pageSuivis(tab = "suivis") {
  const al = alerts();
  const tabs = [["suivis", `Montres suivies (${Object.keys(ME.suivis).length})`], ["favoris", `Favoris (${ME.favs.size})`], ["demandes", `Mes demandes (${ME.demandes.length})`], ["vues", "Vues récemment"]];
  let body = "";
  if (tab === "suivis") {
    const ids = Object.keys(ME.suivis);
    body = !ME.compte ? `<div class="empty"><h3>Créez votre compte pour suivre des montres</h3><p>Vous verrez chaque baisse de prix, chaque réservation et chaque vente.</p><a class="btn btn-green" href="#compte">Créer mon compte</a></div>`
      : !ids.length ? `<div class="empty"><h3>Aucune montre suivie</h3><p>Suivez une montre pour être prévenu dès que son prix baisse ou qu'elle est réservée.</p><button class="btn btn-green" data-goto="list">Voir les montres</button></div>`
      : `${al.length ? `<div class="box" style="margin-bottom:16px"><h3>${al.length} changement${al.length > 1 ? "s" : ""} depuis votre dernière visite</h3>${al.map(a => `<span class="alert">● ${a.m ? esc(a.m.modele) + " — " : ""}${esc(a.texte)}</span>`).join("")}<div class="mine" style="padding:0;background:none"><div class="row"><button class="btn btn-light" data-seen-all style="background:#fff">Tout marquer comme vu</button></div></div></div>` : ""}
        <div class="plist">${ids.map(id => {
          const m = montre(id), s = ME.suivis[id];
          if (!m) return `<div class="pitem" style="grid-template-columns:1fr auto"><div><b>Annonce retirée</b><span>Suivie depuis le ${esc(fmtDay(s.depuis))} · dernier prix connu ${eur(s.vu_prix)}</span></div><button class="btn btn-light" data-unfollow="${esc(id)}" style="background:#fff;height:40px">Retirer</button></div>`;
          const d = m.prix - s.prix;
          const myAl = al.filter(a => a.id === id).map(a => `<span class="alert">● ${esc(a.texte)}</span>`).join("");
          return pitem(m, `${eur(m.prix)}<br><span class="pill ${stClass(m.statut)}" style="margin-top:6px">${esc(m.statut)}</span>`,
            `<span>Suivie depuis le ${esc(fmtDay(s.depuis))} · ${d ? `${d < 0 ? "−" : "+"}${eur(Math.abs(d))} depuis` : "prix inchangé"}</span><span>Vendeur ${isOnline(m.v) ? '<span class="live">en ligne</span>' : "vu " + esc(ago(m.v.derniere_connexion))} · répond en ~${fmtDur(m.v.temps_reponse_min)}</span>${myAl}`);
        }).join("")}</div>`;
  } else if (tab === "favoris") {
    const ms = [...ME.favs].map(montre).filter(Boolean);
    body = ms.length ? `<div class="grid">${ms.map(cardHTML).join("")}</div>` : `<div class="empty"><h3>Aucun favori</h3><p>Touchez ♡ sur une montre pour la retrouver ici.</p><button class="btn btn-green" data-goto="list">Voir les montres</button></div>`;
  } else if (tab === "demandes") {
    body = ME.demandes.length ? `<div class="plist">${ME.demandes.map(d => {
      const v = vendeur(d.vendeur), m = d.montre && montre(d.montre);
      if (!v) return "";
      const att = Math.max(1, Math.round((Date.now() - Date.parse(d.date)) / 60000));
      const rep = d.repondu ? `<span class="alert">Réponse reçue en ${fmtDur(Math.max(1, Math.round((Date.parse(d.repondu) - Date.parse(d.date)) / 60000)))}</span>` : `<span class="alert w">En attente depuis ${fmtDur(att)} · ${v.temps_reponse_min ? `ce vendeur répond en ~${fmtDur(v.temps_reponse_min)} d'habitude` : "détaillant officiel"}</span>`;
      return `<div class="pitem" style="grid-template-columns:${m ? "76px " : ""}1fr">${m ? `<a class="pp" href="#m/${encodeURIComponent(m.id)}">${picOf(m)}</a>` : ""}<div><b>${esc(v.nom)}</b><span>${esc(d.canal[0].toUpperCase() + d.canal.slice(1))} · ${esc(fmtDate(d.date))}${m ? " · " + esc(m.modele) : ""}</span>${rep}
        <div class="mine" style="padding:0;background:none;margin-top:6px"><div class="row">${d.repondu ? "" : `<button class="btn btn-green" data-rep="${d.id}">Le vendeur m'a répondu</button>`}<a class="btn btn-light" href="#${v.officiel ? "d" : "v"}/${encodeURIComponent(v.id)}" style="background:#fff">Le vendeur</a><button class="btn btn-light" data-del-dem="${d.id}" style="background:#fff">Effacer</button></div></div></div></div>`;
    }).join("")}</div>` : `<div class="empty"><h3>Aucune demande</h3><p>Quand vous appelez ou écrivez à un vendeur depuis Monalex, la demande s'affiche ici avec le temps de réponse.</p></div>`;
  } else {
    const ms = ME.vues.map(montre).filter(Boolean);
    body = ms.length ? `<div class="plist">${ms.map(m => pitem(m)).join("")}</div>` : `<div class="empty"><h3>Aucune montre consultée</h3><p>Les fiches que vous ouvrez s'affichent ici.</p><button class="btn btn-green" data-goto="list">Voir les montres</button></div>`;
  }
  const notifBtn = ME.compte && "Notification" in window && Notification.permission !== "granted" ? `<button class="linkbtn" data-notif>Recevoir une notification à chaque changement</button>` : "";
  const html = `
    <nav class="crumbs"><a href="#">Accueil</a> / <span>Mes suivis</span></nav>
    <h1 class="p-h1">Mes suivis</h1>
    <p class="p-lead">Prix, statut, réactivité du vendeur et réponses à vos demandes. Tirez la page vers le bas ou touchez « Rafraîchir » pour vérifier les changements. ${notifBtn}</p>
    <div class="vfilters">${tabs.map(([k, l]) => `<a class="chip" href="#suivis/${k}" aria-pressed="${tab === k}" style="text-decoration:none">${l}</a>`).join("")}<button class="chip" data-refresh>↻ Rafraîchir</button></div>
    ${body}`;
  openPage(html, "Mes suivis");
}

/* ---------- compte */
function pageCompte() {
  const c = ME.compte;
  if (!c) {
    openPage(`
      <nav class="crumbs"><a href="#">Accueil</a> / <span>Créer un compte</span></nav>
      <h1 class="p-h1">Créer mon compte</h1>
      <p class="p-lead">Pour suivre des montres, garder vos favoris et l'historique de vos demandes aux vendeurs, et préremplir vos messages.</p>
      <form class="form" id="accForm" style="max-width:720px">
        <div class="fld">
          <input class="inp" name="prenom" placeholder="Prénom" autocomplete="given-name" required>
          <input class="inp" name="nom" placeholder="Nom" autocomplete="family-name" required>
          <input class="inp" name="email" type="email" placeholder="E-mail" autocomplete="email" required>
          <input class="inp" name="tel" type="tel" placeholder="Téléphone" autocomplete="tel" inputmode="tel">
          <input class="inp" name="ville" placeholder="Ville" autocomplete="address-level2">
        </div>
        <label class="tog"><span>Me prévenir quand le prix d'une montre suivie baisse</span><input type="checkbox" name="alertPrix" checked></label>
        <label class="tog"><span>Me prévenir quand une montre suivie est réservée ou vendue</span><input type="checkbox" name="alertStatut" checked></label>
        <p class="h" style="margin-top:12px">Votre compte est enregistré sur cet appareil. Pour le retrouver sur un autre téléphone, il faudra brancher l'appli sur un serveur.</p>
        <div class="row"><button class="btn btn-green" type="submit">Créer mon compte</button></div>
      </form>`, "Créer un compte");
    return;
  }
  const rep = ME.demandes.filter(d => d.repondu);
  const moy = rep.length ? Math.round(rep.reduce((s, d) => s + (Date.parse(d.repondu) - Date.parse(d.date)) / 60000, 0) / rep.length) : 0;
  openPage(`
    <nav class="crumbs"><a href="#">Accueil</a> / <span>Mon compte</span></nav>
    <div class="acc-h"><span class="avatar" style="width:72px;height:72px;font-size:24px">${esc((c.prenom[0] || "") + (c.nom[0] || ""))}</span><div><h1>${esc(c.prenom)} ${esc(c.nom)}</h1><p>Compte créé le ${esc(fmtDay(c.cree))}</p></div></div>
    <div class="stats">
      <a class="stat" href="#suivis/favoris" style="text-decoration:none"><b>${ME.favs.size}</b><span>favoris</span></a>
      <a class="stat" href="#suivis" style="text-decoration:none"><b>${Object.keys(ME.suivis).length}</b><span>montres suivies</span></a>
      <a class="stat" href="#suivis/demandes" style="text-decoration:none"><b>${ME.demandes.length}</b><span>demandes envoyées</span></a>
      <div class="stat"><b>${rep.length}</b><span>réponses reçues</span></div>
      <div class="stat"><b>${moy ? fmtDur(moy) : "—"}</b><span>temps de réponse moyen</span></div>
    </div>
    <ul class="menu-list">
      <li><a href="#suivis">Mes suivis${alerts().length ? `<span class="dot">${alerts().length}</span>` : ""}${CHEV}</a></li>
      <li><a href="#suivis/demandes">Mes demandes aux vendeurs${CHEV}</a></li>
      <li><a href="#suivis/favoris">Mes favoris${CHEV}</a></li>
      <li><a href="#suivis/vues">Vues récemment${CHEV}</a></li>
    </ul>
    <form class="form" id="accForm">
      <h3>Mes informations</h3>
      <p class="h">Elles servent à préremplir vos messages aux vendeurs.</p>
      <div class="fld">
        <input class="inp" name="prenom" placeholder="Prénom" value="${esc(c.prenom)}" required>
        <input class="inp" name="nom" placeholder="Nom" value="${esc(c.nom)}" required>
        <input class="inp" name="email" type="email" placeholder="E-mail" value="${esc(c.email)}" required>
        <input class="inp" name="tel" type="tel" placeholder="Téléphone" value="${esc(c.tel || "")}">
        <input class="inp" name="ville" placeholder="Ville" value="${esc(c.ville || "")}">
      </div>
      <label class="tog"><span>Me prévenir quand le prix d'une montre suivie baisse</span><input type="checkbox" name="alertPrix" ${c.alertPrix ? "checked" : ""}></label>
      <label class="tog"><span>Me prévenir quand une montre suivie est réservée ou vendue</span><input type="checkbox" name="alertStatut" ${c.alertStatut ? "checked" : ""}></label>
      <label class="tog"><span>Notifications sur ce téléphone</span><input type="checkbox" name="notif" ${c.notif ? "checked" : ""}></label>
      <div class="row"><button class="btn btn-green" type="submit">Enregistrer</button><button class="btn btn-light" type="button" data-logout style="background:#fff">Supprimer mon compte</button></div>
    </form>`, "Mon compte");
}
async function saveAccount(form) {
  const f = new FormData(form);
  const old = ME.compte;
  const c = { ...(old || {}), prenom: f.get("prenom").trim(), nom: f.get("nom").trim(), email: f.get("email").trim(), tel: (f.get("tel") || "").trim(), ville: (f.get("ville") || "").trim(), alertPrix: !!f.get("alertPrix"), alertStatut: !!f.get("alertStatut"), notif: !!f.get("notif"), cree: old?.cree || new Date().toISOString() };
  if (c.notif && "Notification" in window && Notification.permission === "default") { try { if (await Notification.requestPermission() !== "granted") c.notif = false; } catch (e) { c.notif = false; } }
  ME.compte = c;
  toast(old ? "Informations enregistrées." : `Bienvenue, ${c.prenom}.`);
  const apres = store.get("rm.apres", null);
  store.del("rm.apres");
  if (apres && apres.action === "suivre") { follow(apres.id); location.hash = "m/" + apres.id; return; }
  if (apres && apres.action === "alerte") { Object.assign(S, { zone: apres.crit.zone, coll: apres.crit.coll, q: apres.crit.q, f: { ...emptyF(), ...apres.crit.f } }); saveAlert(); location.hash = "notifications"; return; }
  if (!old) location.hash = "suivis"; else pageCompte();
  renderHome();
}

/* ====================================================================== menu et recherche */
function openOv(id) { $("#" + id).classList.add("open"); document.body.classList.add("lock"); }
function closeOv(id) { $("#" + id).classList.remove("open"); if (!page().classList.contains("open")) document.body.classList.remove("lock"); }
function renderMenu() {
  $("#menuTiles").innerHTML = tiles("menu");
  const a = alerts().length;
  $("#menuList").innerHTML = [
    ["#", "Toutes les montres", 'data-goto="list"'],
    ["#", "Carte des montres", 'data-goto="map"'],
    ["#officiels", "Détaillants officiels", ""],
    ["#suivis", `Mes suivis${a ? `<span class="dot">${a}</span>` : ""}`, ""],
    ["#suivis/demandes", "Mes demandes", ""],
    ["#compte", ME.compte ? "Mon compte" : "Créer un compte", ""],
    ["#notifications", `Notifications${alerts().length ? `<span class="dot">${alerts().length}</span>` : ""}`, ""],
    ["#infos", "À propos de Monalex", ""],
    ["#sources", "Sources", ""],
  ].map(([h, l, at]) => `<li><a href="${h}" ${at}>${l}${CHEV.replace('class="chev"', "")}</a></li>`).join("");
}
function renderSearch() {
  const q = norm($("#q").value).trim().split(/\s+/).filter(Boolean);
  if (!q.length) {
    $("#searchBody").innerHTML = `
      <p class="kicker">Raccourcis</p>
      <ul class="sub-list" style="margin-top:6px">
        <li><button data-goto="list">Trouvez votre montre</button></li>
        <li><button data-zone-go="monaco">Montres à Monaco</button></li>
        <li><a href="#officiels">Détaillants officiels Rolex</a></li>
        <li><a href="#suivis">Mes suivis</a></li>
        <li><a href="#notifications">Mes alertes</a></li>
      </ul>
      <p class="kicker" style="margin-top:30px">Recherches fréquentes</p>
      <div class="vfilters" style="margin-top:12px">${["Daytona", "Submariner", "GMT-Master II", "Day-Date", "Vert", "Bleu", "Or", "Chronographe", "126610LN", "Genève", "Dubaï"].map(t => `<button class="chip" data-qset="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
    return;
  }
  const res = ALL.filter(m => matchQ(m, q)).sort((a, b) => a.dist - b.dist);
  const ds = DET.filter(d => q.every(w => norm(`${d.nom} ${d.ville} ${d.pays} ${d.adresse} officiel rolex`).includes(w))).sort((a, b) => a.dist - b.dist);
  const vs = VEND.filter(v => q.every(w => norm(`${v.nom} ${v.ville} ${v.pays} ${v.type}`).includes(w)));
  $("#searchBody").innerHTML = `
    ${res.length ? `<button class="btn btn-green" data-q-apply style="width:100%;margin-bottom:16px">Voir ${res.length > 1 ? `les ${res.length} montres` : "la montre"}</button>` : ds.length ? "" : `<div class="empty"><h3>Aucun résultat</h3><p>Essayez un modèle, une référence ou une ville.</p></div>`}
    <div class="plist sres">${res.slice(0, 12).map(m => pitem(m)).join("")}</div>
    ${ds.length ? `<p class="kicker" style="margin-top:26px">Détaillants officiels</p><div class="sellers">${ds.slice(0, 9).map(detRow).join("")}</div>` : ""}
    ${vs.length ? `<p class="kicker" style="margin-top:26px">Vendeurs</p><div class="sellers">${vs.map(sellerRow).join("")}</div>` : ""}`;
}

/* ====================================================================== panneau des filtres */
function renderPanel() {
  const F = S.f;
  const cnt = (key, val) => ALL.filter(m => key(m) === val || (Array.isArray(key(m)) && key(m).includes(val))).length;
  const opts = (k, vals, key) => `<div class="opts">${vals.map(v => { const n = key ? cnt(key, v) : null; return `<button class="opt" data-k="${k}" data-v="${esc(v)}" aria-pressed="${F[k].includes(v)}"${n === 0 ? ' data-zero="1"' : ""}>${esc(v)}${n != null ? ` <small>${n}</small>` : ""}</button>`; }).join("")}</div>`;
  const uniq = f => [...new Set(ALL.flatMap(m => [].concat(f(m))))].filter(Boolean);
  const hasPrix = ALL.some(m => m.prix_eur || m.prix);
  const prixMax = hasPrix ? Math.ceil(Math.max(...ALL.filter(m => m.prix_eur || m.prix).map(m => m.prix_eur || m.prix)) / 5000) * 5000 : 0;
  $("#panelBody").innerHTML = `
    <div class="fgroup"><h3>Source</h3>${opts("source", ["Catalogue officiel", "Boutiques"], m => m.source)}</div>
    <div class="fgroup"><h3>Collection</h3>${opts("colls", collections().map(([c]) => c), m => m.collection)}</div>
    <div class="fgroup"><h3>État</h3>${opts("etat", ["Neuve", "Occasion (boutique)", "Comme neuve (Pre-Owned)", "Très bon état (Pre-Owned)", "Bon état (Pre-Owned)"], etatDe)}<p class="d-note" style="margin-top:8px">Pre-Owned : uniquement le programme Rolex Certified Pre-Owned des détaillants officiels. Aucune pour l'instant : créez une alerte pour être prévenu.</p></div>
    <div class="fgroup"><h3>Couleur du cadran</h3>${opts("couleur", uniq(m => m.couleur_cadran).sort(), m => m.couleur_cadran)}</div>
    <div class="fgroup"><h3>Matériau</h3>${opts("materiau", ["Acier", "Rolesor (bicolore)", "Or", "Platine", "Rolesium"], m => m.mat)}</div>
    <div class="fgroup"><h3>Diamètre</h3>${opts("diametre", uniq(m => String(m.diametre)).sort(), m => String(m.diametre))}</div>
    <div class="fgroup"><h3>Lunette</h3>${opts("lunette", uniq(m => m.type_lunette).sort(), m => m.type_lunette)}</div>
    <div class="fgroup"><h3>Bracelet</h3>${opts("bracelet", uniq(m => m.type_bracelet).sort(), m => m.type_bracelet)}</div>
    <div class="fgroup"><h3>Fonctions</h3>${opts("complications", uniq(m => m.complications || []).sort(), m => m.complications || [])}</div>
    <div class="fgroup"><h3>Étanchéité minimum</h3>${`<div class="opts">${[0, 100, 300, 1220, 3900].map(v => `<button class="opt" data-etanche="${v}" aria-pressed="${F.etancheiteMin === v}">${v ? nf(v) + " m" : "Toutes"}</button>`).join("")}</div>`}</div>
    ${hasPrix ? `<div class="fgroup"><h3>Prix maximum</h3><div class="range"><input type="range" id="fPrix" min="5000" max="${prixMax}" step="1000" value="${F.prixMax || prixMax}" aria-label="Prix maximum"><output id="fPrixO">${F.prixMax ? eur(F.prixMax) : "Sans limite"}</output></div></div>` : ""}
    <div class="fgroup" style="border:0"><button class="btn btn-line" data-save-alert style="width:100%">Créer une alerte avec ces critères</button></div>`;
  const r = $("#fPrix");
  if (r) r.oninput = () => { const v = +r.value; F.prixMax = v >= prixMax ? 0 : v; $("#fPrixO").textContent = F.prixMax ? eur(F.prixMax) : "Sans limite"; updApply(); };
  $$(".opt[data-k]", $("#panelBody")).forEach(b => b.onclick = () => {
    const arr = F[b.dataset.k], v = b.dataset.v, i = arr.indexOf(v);
    i < 0 ? arr.push(v) : arr.splice(i, 1);
    b.setAttribute("aria-pressed", i < 0); updApply();
  });
  $$(".opt[data-etanche]", $("#panelBody")).forEach(b => b.onclick = () => { F.etancheiteMin = +b.dataset.etanche; $$(".opt[data-etanche]").forEach(x => x.setAttribute("aria-pressed", x === b)); updApply(); });
  updApply();
}
function updApply() { const n = filtered().length; $("#fApply").textContent = n ? `Voir ${n} montre${n > 1 ? "s" : ""}` : "Aucune montre · créez une alerte"; }
function openPanel() { closeOv("menu"); renderPanel(); $("#panel").classList.add("open"); $("#panelBg").classList.add("open"); }
function closePanel() { $("#panel").classList.remove("open"); $("#panelBg").classList.remove("open"); renderHome(); }
$("#panelClose").onclick = $("#panelBg").onclick = closePanel;
$("#fApply").onclick = () => { closePanel(); goList(); };
$("#fReset").onclick = () => { S.f = emptyF(); renderPanel(); };

/* ====================================================================== visionneuse */
let LB = { z: 1, slides: [], i: 0, m: null };
function openLB(m, slides, i) { LB = { z: 1, slides, i, m }; $("#lb").classList.add("open"); drawLB(); }
function drawLB() {
  const s = LB.slides[LB.i], box = $("#lbBox"), body = $("#lbBody");
  const base = Math.min(body.clientWidth - 24, body.clientHeight - 24);
  box.style.width = box.style.height = Math.round(base * LB.z) + "px";
  box.innerHTML = s.big ? `<img src="${esc(s.big)}" alt="">` : watchSVG(LB.m.skin, { diam: LB.m.diametre, vb: s.vb, fx: true });
  $("#lbTitle").textContent = `${LB.m.modele} — ${s.nom}`;
  $("#lbFoot").textContent = `Zoom ×${LB.z} · ${LB.i + 1}/${LB.slides.length} · double-touchez pour zoomer, glissez pour vous déplacer`;
}
function zoomLB(dir, cx, cy) {
  const body = $("#lbBody"), old = LB.z, nz = Math.max(1, Math.min(6, dir > 0 ? old * 2 : old / 2));
  if (nz === old) return;
  cx = cx ?? body.clientWidth / 2; cy = cy ?? body.clientHeight / 2;
  const px = (body.scrollLeft + cx) / old, py = (body.scrollTop + cy) / old;
  LB.z = nz; drawLB();
  body.scrollLeft = px * nz - cx; body.scrollTop = py * nz - cy;
}
$("#lbIn").onclick = () => zoomLB(1);
$("#lbOut").onclick = () => zoomLB(-1);
$("#lbClose").onclick = () => $("#lb").classList.remove("open");
$("#lbBody").addEventListener("dblclick", e => { const r = $("#lbBody").getBoundingClientRect(); LB.z >= 4 ? (LB.z = 1, drawLB()) : zoomLB(1, e.clientX - r.left, e.clientY - r.top); });

/* ====================================================================== rafraîchir */
async function loadData(force) {
  const r = await fetch(CONFIG.donnees + (force ? `?t=${Date.now()}` : ""), { cache: force ? "no-store" : "no-cache" });
  if (!r.ok) throw new Error(r.status);
  DATA = await r.json();
  try { const ph = await fetch("photos.json" + (force ? `?t=${Date.now()}` : ""), { cache: "no-cache" }); if (ph.ok) PHOTOS = await ph.json(); } catch (e) {}
  try { const a = await fetch(CONFIG.annonces + `?t=${Math.floor(Date.now() / 6e5)}`, { cache: force ? "no-store" : "no-cache" }); if (a.ok) ANNDATA = await a.json(); } catch (e) {}
  try { const d = await fetch(CONFIG.detaillants + (force ? `?t=${Date.now()}` : ""), { cache: force ? "no-store" : "no-cache" }); if (d.ok) DETDATA = await d.json(); } catch (e) {}
  S.lastLoad = Date.now();
  prepare();
}
let refreshing = false;
async function refresh(manual = true) {
  if (refreshing) return; refreshing = true;
  const ptr = $("#ptr"); ptr.classList.add("spin"); ptr.style.transition = "transform .2s,opacity .2s"; ptr.style.opacity = 1; ptr.style.transform = "translateY(0)";
  try {
    await loadData(true);
    renderColls(); renderHome(); route();
    const a = alerts().length;
    if (manual) toast(a ? `Annonces à jour · ${a} changement${a > 1 ? "s" : ""} sur vos suivis` : `Annonces à jour · ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
    notifyAlerts();
  } catch (e) { if (manual) toast("Pas de connexion. Vous voyez les dernières annonces enregistrées."); }
  setTimeout(() => { ptr.classList.remove("spin"); ptr.style.opacity = 0; ptr.style.transform = "translateY(-80px)"; refreshing = false; }, 350);
}
// Tirer vers le bas pour rafraîchir (accueil, pages et menu)
(() => {
  let y0 = null, x0 = 0, dy = 0, el = null;
  const ptr = $("#ptr");
  const scroller = () => page().classList.contains("open") ? page() : null;
  document.addEventListener("touchstart", e => {
    if ($("#lb").classList.contains("open") || $("#panel").classList.contains("open") || $(".ov.open")) { y0 = null; return; }
    const sc = scroller();
    const top = sc ? sc.scrollTop : window.scrollY;
    if (top > 0 || refreshing) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; el = sc;
  }, { passive: true });
  document.addEventListener("touchmove", e => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    const dx = Math.abs(e.touches[0].clientX - x0);
    if (dy <= 0 || dx > dy || (el ? el.scrollTop : window.scrollY) > 0) { ptr.style.opacity = 0; return; }
    const d = Math.min(dy / 2.2, 80);
    ptr.style.transition = "none"; ptr.style.opacity = Math.min(1, d / 50);
    ptr.style.transform = `translateY(${d - 60}px) rotate(${d * 4}deg)`;
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (y0 == null) return;
    const ok = dy / 2.2 > 60; y0 = null;
    if (ok) refresh(true); else { ptr.style.transition = "transform .2s,opacity .2s"; ptr.style.opacity = 0; ptr.style.transform = "translateY(-80px)"; }
  });
})();
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - S.lastLoad > 5 * 60000) refresh(false); });
setInterval(() => { if (!document.hidden) refresh(false); }, CONFIG.rafraichir);

/* ====================================================================== navigation et clics */
function goList(view) {
  closeOv("menu"); closeOv("search");
  if (location.hash && location.hash !== "#") history.pushState(null, "", location.pathname + location.search);
  closePage();
  if (view) setView(view);
  requestAnimationFrame(() => $("#liste").scrollIntoView({ behavior: document.documentElement.classList.contains("calm") ? "auto" : "smooth", block: "start" }));
}
function setView(v) {
  S.view = v;
  $("#vList").setAttribute("aria-pressed", v === "list"); $("#vMap").setAttribute("aria-pressed", v === "map");
  $("#bigmap").hidden = v !== "map";
  renderGrid();
}
function near() {
  if (S.near) { S.near = false; S.origin = { ...CONFIG.origine }; recalcDist(); renderHome(); return; }
  if (!navigator.geolocation) { toast("Position indisponible sur cet appareil. Les distances partent de Monaco."); return; }
  toast("Localisation en cours…");
  navigator.geolocation.getCurrentPosition(p => {
    S.near = true; S.origin = { lat: p.coords.latitude, lng: p.coords.longitude }; S.sort = "dist";
    recalcDist(); renderHome(); toast("Distances calculées depuis votre position");
  }, () => toast("Position non autorisée. Les distances partent de Monaco."), { timeout: 10000 });
}

document.addEventListener("click", e => {
  const t = e.target;
  const fav = t.closest("[data-fav]");
  if (fav) {
    e.preventDefault(); e.stopPropagation();
    const id = fav.dataset.fav, on = !ME.favs.has(id);
    on ? ME.favs.add(id) : ME.favs.delete(id); ME.save();
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach(b => b.setAttribute("aria-pressed", on));
    toast(on ? "Ajoutée aux favoris" : "Retirée des favoris");
    return;
  }
  const ck = t.closest("[data-ck]");
  if (ck) { COOK.set(ck.dataset.ck); toast(ck.dataset.ck === "ok" ? "Cookies acceptés." : "Cookies refusés. Google Maps ne s'affichera qu'à votre demande."); if (page().classList.contains("open")) route(); return; }
  if (t.closest("[data-ck-plus]")) { $("#cookies").hidden = true; }
  if (t.closest("[data-ck-gerer]")) { showCookies(); return; }
  const ga = t.closest("[data-gallow]");
  if (ga) { COOK.set("ok"); const b = ga.closest(".mapbox").previousElementSibling.querySelector('[data-mt="' + ga.dataset.gallow + '"]'); b && b.click(); return; }
  const mt = t.closest("[data-mt]");
  if (mt) {
    const box = mt.closest(".mtabs"), k = mt.dataset.mt, wrap = box.nextElementSibling, fr = $("iframe", wrap), plan = wrap.firstElementChild;
    $$("[data-mt]", box).forEach(b => b.setAttribute("aria-pressed", b === mt));
    if (k === "plan") { $$(".gconsent", wrap).forEach(x => x.remove()); fr.hidden = true; plan.hidden = false; if (pMap) setTimeout(() => pMap.invalidateSize(), 50); }
    else if (!googleOk()) {
      $$(".gconsent", wrap).forEach(x => x.remove());
      plan.hidden = true; fr.hidden = true;
      wrap.insertAdjacentHTML("beforeend", `<div class="gconsent"><div><p>Google Maps dépose ses propres cookies. Autorisez-le pour afficher cette carte.</p><button class="btn btn-green" data-gallow="${k}">Autoriser Google Maps</button></div></div>`);
    } else {
      $$(".gconsent", wrap).forEach(x => x.remove());
      const q = `${box.dataset.lat},${box.dataset.lng}`;
      fr.src = `https://maps.google.com/maps?q=${q}&z=${k === "sat" ? 18 : 16}&t=${k === "sat" ? "k" : "m"}&hl=fr&output=embed`;
      fr.hidden = false; plan.hidden = true;
    }
    return;
  }
  const lt = t.closest("[data-layer]");
  if (lt) { const k = lt.dataset.layer; S[k] = S[k] === false; lt.setAttribute("aria-pressed", S[k] !== false); renderGrid(); return; }
  const an = t.closest("[data-ancre]");
  if (an) { S.ancre = an.dataset.ancre; if (location.hash === "#infos") { e.preventDefault(); pageInfos(); } }
  if (t.closest("[data-plus]")) { plus(); return; }
  const g = t.closest("[data-goto]"); if (g) { e.preventDefault(); goList(g.dataset.goto === "map" ? "map" : "list"); return; }
  const zg = t.closest("[data-zone-go]"); if (zg) { e.preventDefault(); S.zone = zg.dataset.zoneGo; store.set("rm.zone", S.zone); renderHome(); goList(); return; }
  const cg = t.closest("[data-coll-go]"); if (cg) { e.preventDefault(); S.coll = cg.dataset.collGo; S.zone = "monde"; renderHome(); goList(); return; }
  const sg = t.closest("[data-sort-go]"); if (sg) { S.sort = sg.dataset.sortGo; S.zone = "monde"; renderHome(); goList(); return; }
  const rg = t.closest("[data-region]"); if (rg) { S.region = rg.dataset.region; renderHome(); return; }
  if (t.closest("[data-zone-open]")) { openZones(); return; }
  if (t.closest("[data-zone-near]")) { closeOv("zonesheet"); S.zone = "monde"; store.set("rm.zone", S.zone); S.sort = "dist"; near(); return; }
  const z = t.closest("[data-z]"); if (z) { if (z.closest("#zonesheet")) closeOv("zonesheet"); S.zone = z.dataset.z; store.set("rm.zone", S.zone); renderHome(); if (z.hasAttribute("data-rerender")) route(); return; }
  const c = t.closest(".coll"); if (c) { if (c.dataset.c) location.hash = "c/" + slugC(c.dataset.c); else { S.coll = ""; renderHome(); } return; }
  const et = t.closest("[data-etat]"); if (et) { S.etat = et.dataset.etat; renderHome(); return; }
  if (t.closest("[data-open-filters]")) { openPanel(); return; }
  if (t.closest("[data-refresh]")) { closeOv("menu"); refresh(true); return; }
  if (t.closest("[data-near]")) { near(); return; }
  if (t.closest("[data-clear-q]")) { S.q = ""; $("#q").value = ""; renderHome(); return; }
  if (t.closest("[data-reset-all]")) { S.q = ""; S.coll = ""; S.etat = ""; S.f = emptyF(); renderHome(); return; }
  if (t.closest("[data-close]")) { closeOv(t.closest(".ov").id); return; }
  if (t.closest("[data-back]")) { if (S.inApp && history.length > 1) history.back(); else location.hash = ""; return; }
  const fo = t.closest("[data-follow]"); if (fo) { const id = fo.dataset.follow; ME.suivis[id] ? unfollow(id) : follow(id); if (ME.compte) pageMontre(id); return; }
  const uf = t.closest("[data-unfollow]"); if (uf) { unfollow(uf.dataset.unfollow); route(); return; }
  if (t.closest("[data-seen-all]")) { Object.keys(ME.suivis).forEach(markSeen); ME.alertes.forEach(a => a.vus = filterWith(a.crit).map(m => m.id)); ME.save(); route(); renderHome(); return; }
  if (t.closest("[data-save-alert]")) { closePanel(); saveAlert(); return; }
  const ac = t.closest("[data-alert-coll]"); if (ac) { S.coll = ac.dataset.alertColl; S.f = emptyF(); S.q = ""; saveAlert(); return; }
  const da = t.closest("[data-del-alert]"); if (da) { ME.alertes = ME.alertes.filter(a => a.id !== da.dataset.delAlert); ME.save(); toast("Alerte supprimée."); route(); return; }
  const va = t.closest("[data-voir-alert]"); if (va) { const a = ME.alertes.find(x => x.id === va.dataset.voirAlert); if (a) { Object.assign(S, { zone: a.crit.zone, coll: a.crit.coll, q: a.crit.q, f: { ...emptyF(), ...a.crit.f } }); renderHome(); goList(); } return; }
  const vs = t.closest("[data-vsort]"); if (vs) { VSORT = vs.dataset.vsort; pageVendeurs(); return; }
  const oz = t.closest("[data-ozone]"); if (oz) { OZONE = oz.dataset.ozone; pageOfficiels(); return; }
  const vz = t.closest("[data-vzone]"); if (vz) { VZONE = vz.dataset.vzone; pageVendeurs(); return; }
  const rp = t.closest("[data-rep]"); if (rp) { const d = ME.demandes.find(x => x.id === rp.dataset.rep); if (d) { d.repondu = new Date().toISOString(); ME.save(); toast("Réponse enregistrée."); route(); } return; }
  const dd = t.closest("[data-del-dem]"); if (dd) { ME.demandes = ME.demandes.filter(x => x.id !== dd.dataset.delDem); ME.save(); route(); return; }
  const cv = t.closest("[data-copy-v]"); if (cv) { const v = vendeur(cv.dataset.copyV); copy(`${v.nom}\n${v.contact || "Détaillant officiel Rolex"}\n${v.adresse}, ${v.cp} ${v.ville}, ${v.pays}\n${v.tel}\n${v.email}`); toast("Coordonnées copiées"); return; }
  const lg = t.closest("[data-log]"); if (lg) { logDemande(lg.dataset.v, lg.dataset.m, lg.dataset.log); }
  const sc = t.closest("[data-scroll]"); if (sc) { e.preventDefault(); $("#" + sc.dataset.scroll).scrollIntoView({ behavior: "smooth" }); return; }
  const qs = t.closest("[data-qset]"); if (qs) { $("#q").value = qs.dataset.qset; renderSearch(); return; }
  if (t.closest("[data-q-apply]")) { applySearch(); return; }
  if (t.closest("[data-share]")) { share(); return; }
  if (t.closest("[data-notif]")) { askNotif(); return; }
  if (t.closest("[data-notif-off]")) { const c = ME.compte; if (c) { c.notif = false; ME.compte = c; } toast("Notifications désactivées."); route(); return; }
  if (t.closest("[data-logout]")) {
    askConfirm({ titre: "Supprimer votre compte ?", texte: "Vos favoris, montres suivies et demandes seront effacés de ce téléphone. Cette action est définitive.", oui: "Supprimer le compte", non: "Garder mon compte" })
      .then(ok => { if (!ok) return; ME.compte = null; ME.suivis = {}; ME.favs.clear(); ME.demandes = []; ME.save(); toast("Compte supprimé."); location.hash = ""; renderHome(); });
    return;
  }
  const sd = t.closest("[data-send]");
  if (sd) {
    const f = sd.closest("form"), v = vendeur(f.dataset.formV), m = f.dataset.formM ? montre(f.dataset.formM) : null;
    const nom = $("#mName").value.trim(), tel = $("#mTel").value.trim();
    const txt = $("#mTxt").value + (nom ? `\n${nom}` : "") + (tel ? `\n${tel}` : "");
    const k = sd.dataset.send, sub = m ? `${m.modele} réf. ${m.reference}` : "Demande d'information";
    const url = k === "e-mail" ? `mailto:${v.email}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(txt)}`
      : k === "WhatsApp" ? `https://wa.me/${digits(v.whatsapp).replace("+", "")}?text=${encodeURIComponent(txt)}`
      : `sms:${digits(v.tel)}${/iPhone|iPad/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(txt)}`;
    logDemande(v.id, m?.id, k);
    window.open(url, k === "WhatsApp" ? "_blank" : "_self");
    setTimeout(route, 600);
  }
});
document.addEventListener("submit", e => {
  if (e.target.id === "accForm") { e.preventDefault(); saveAccount(e.target); }
});
async function share() {
  const url = location.href;
  if (navigator.share) { try { await navigator.share({ title: document.title, url }); } catch (e) {} }
  else { copy(url); toast("Lien copié"); }
}
async function askNotif() {
  if (!("Notification" in window)) { toast("Ce navigateur ne permet pas les notifications. Ajoutez Monalex à l’écran d’accueil pour les activer."); return; }
  const p = await Notification.requestPermission();
  const c = ME.compte; if (c) { c.notif = p === "granted"; ME.compte = c; }
  if (p === "granted") notifyAlerts();
  toast(p === "granted" ? "Notifications activées" : "Notifications refusées"); route();
}
function applySearch() { S.q = $("#q").value.trim(); S.zone = "monde"; closeOv("search"); renderHome(); goList(); }

$("#btnMenu").onclick = () => { renderMenu(); openOv("menu"); };
$("#btnSearch").onclick = $("#heroSearch").onclick = () => { openOv("search"); renderSearch(); setTimeout(() => $("#q").focus(), 250); };
$("#btnMap").onclick = () => goList("map");
$("#btnFavs").onclick = () => { location.hash = alerts().length || Object.keys(ME.suivis).length ? "suivis" : "suivis/favoris"; };
$("#q").oninput = renderSearch;
$("#searchForm").onsubmit = e => { e.preventDefault(); applySearch(); };
$("#sort").onchange = e => { S.sort = e.target.value; S.vus = 0; renderGrid(); };
$("#vList").onclick = () => setView("list");
$("#vMap").onclick = () => setView("map");
$("#homeLink").onclick = e => { e.preventDefault(); closeOv("menu"); closeOv("search"); if (location.hash) location.hash = ""; window.scrollTo({ top: 0 }); };
$("#menu").addEventListener("click", e => { if (e.target.closest("a[href^='#']") && !e.target.closest("[data-goto],[data-zone-go]")) closeOv("menu"); });
$("#search").addEventListener("click", e => { if (e.target.closest("a[href^='#']")) closeOv("search"); });
$("#demoOk").onclick = () => { $("#demo").hidden = true; store.set("rm.demoOk", 1); };
{ let haut = null; window.addEventListener("scroll", () => { const v = scrollY > 4; if (v !== haut) { haut = v; $("#top").classList.toggle("scrolled", v); } }, { passive: true }); }
// Reflets du vert poker : animés directement par le navigateur au défilement (voir app.css, « reflets »), sans calcul ici.
document.addEventListener("keydown", e => {
  if ($("#lb").classList.contains("open")) {
    if (e.key === "Escape") $("#lb").classList.remove("open");
    if (e.key === "+" || e.key === "=") zoomLB(1);
    if (e.key === "-") zoomLB(-1);
    if (e.key === "ArrowRight" && LB.i < LB.slides.length - 1) { LB.i++; LB.z = 1; drawLB(); }
    if (e.key === "ArrowLeft" && LB.i > 0) { LB.i--; LB.z = 1; drawLB(); }
  } else if (e.key === "Escape") {
    if ($("#panel").classList.contains("open")) closePanel();
    else if ($(".ov.open")) closeOv($(".ov.open").id);
    else if (page().classList.contains("open")) location.hash = "";
  }
});
// Réduire les animations / augmenter le contraste
for (const [id, cls] of [["optCalm", "calm"], ["optContrast", "contrast"]]) {
  const on = store.get("rm." + cls, false);
  $("#" + id).checked = on; document.documentElement.classList.toggle(cls, on);
  $("#" + id).onchange = e => { document.documentElement.classList.toggle(cls, e.target.checked); store.set("rm." + cls, e.target.checked); };
}

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  closeOv("menu"); closeOv("search");
  if (!h) { closePage(); return; }
  S.inApp = S.inApp || S.started;
  const [k, a] = [h.split("/")[0], h.split("/").slice(1).join("/")];
  if (k === "m") pageMontre(a);
  else if (k === "v") pageVendeur(a);
  else if (k === "vendeurs") { location.replace("#officiels"); }
  else if (k === "d") pageDetaillant(a);
  else if (k === "c") pageCollection(a);
  else if (k === "officiels") pageOfficiels();
  else if (k === "infos") pageInfos();
  else if (k === "notifications") pageNotifications();
  else if (k === "sources") pageSources(a);
  else if (k === "suivis") pageSuivis(a || "suivis");
  else if (k === "compte") pageCompte();
  else closePage();
}
window.addEventListener("hashchange", route);

/* ====================================================================== démarrage */
async function start() {
  try { await loadData(false); }
  catch (e) { $("#grid").innerHTML = `<div class="empty"><h3>Les montres ne se chargent pas</h3><p>La connexion semble coupée. Tirez la page vers le bas pour réessayer.</p><button class="btn btn-green" onclick="location.reload()">Réessayer</button></div>`; return; }
  $("#demo").hidden = !DATA.demo || !!store.get("rm.demoOk", 0);
  // Montre 3D de l'accueil (chronographe or, cadran vert poker), avec le dessin en secours
  mount3D($("#hero3d"), { skin: { type: "daytona", dial: "#035837", sub: "#03321e", bezel: "#03321e", insert: "#03321e", metal: "gold", bracelet: "oyster" }, diametre: 40, collection: "Cosmograph Daytona" }, window, () => !page().classList.contains("open"));
  $("#annee").textContent = new Date().getFullYear();
  // Visuel d'accueil assorti au logo : chronographe or, cadran vert
  $("#heroImg").innerHTML = watchSVG({ type: "daytona", dial: "#035837", sub: "#03321e", bezel: "#03321e", insert: "#03321e", metal: "gold", bracelet: "oyster" }, { diam: 40, vb: "75 170 250 260", par: "xMidYMid slice" });
  $("#searchEmblem").innerHTML = $("#homeLink").innerHTML;
  if (DATA.mise_a_jour) $("#updated").textContent = `Annonces mises à jour le ${new Date(DATA.mise_a_jour).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`;
  renderColls(); renderHome(); updateDots();
  route(); S.started = true;
  if (!COOK.get()) setTimeout(showCookies, 900);
  notifyAlerts();
}
start();
// Service worker : dès qu'une nouvelle version est publiée, elle s'installe et la page se recharge une fois.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  const avait = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(r => { r.update().catch(() => {}); setInterval(() => r.update().catch(() => {}), 30 * 60000); }).catch(() => {});
  let recharge = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (avait && !recharge) { recharge = true; location.reload(); } });
}
