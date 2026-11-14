"use strict";
/* Monalex — fonctionnement de l'appli.
   Données : montres.json (montres + vendeurs). Compte, favoris, suivis et demandes : gardés sur l'appareil. */

const CONFIG = {
  origine: { lat: 43.7384, lng: 7.4246, nom: "Monaco" },
  donnees: "montres.json",
  detaillants: "detaillants.json",
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
  { id: "monaco", nom: "Monaco", sous: "La Principauté", test: c => c === "MC" },
  { id: "france", nom: "+ France", sous: "Monaco et France", test: c => c === "MC" || c === "FR" },
  { id: "europe", nom: "+ Europe", sous: "Toute l'Europe", test: c => EUROPE.has(c) },
  { id: "monde", nom: "Monde entier", sous: "Partout dans le monde", test: () => true },
];
const ZONE_NOM = { monaco: "Monaco", france: "Monaco et France", europe: "Europe", monde: "Monde entier" };
function km(a, b) {
  const R = 6371, t = x => x * Math.PI / 180;
  const dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtKm = d => d < 1 ? "moins de 1 km" : d < 10 ? `${d.toFixed(1).replace(".", ",")} km` : `${nf(Math.round(d))} km`;

/* ====================================================================== état */
let DATA = { vendeurs: {}, montres: [] };
let ALL = [], VEND = [], DET = [], DETDATA = { detaillants: [] };
const S = {
  zone: store.get("rm.zone", "monaco"), coll: "", etat: "", q: "", sort: "dist", view: "list",
  f: emptyF(), origin: { ...CONFIG.origine }, near: false, inApp: false, lastLoad: 0,
};
function emptyF() { return { prixMax: 0, entretien: [], condition: [], materiau: [], vendeur: [], set: false, origine: false, enLigne: false }; }
const ME = {
  get compte() { return store.get("rm.compte", null); },
  set compte(v) { v ? store.set("rm.compte", v) : store.del("rm.compte"); },
  favs: new Set(store.get("rm.favs", [])),
  suivis: store.get("rm.suivis", {}),
  demandes: store.get("rm.demandes", []),
  vues: store.get("rm.vues", []),
  save() { store.set("rm.favs", [...this.favs]); store.set("rm.suivis", this.suivis); store.set("rm.demandes", this.demandes); store.set("rm.vues", this.vues); updateDots(); },
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
  if (t.includes("boutique")) return "Boutique";
  if (t.includes("pre-owned")) return "Certifié Pre-Owned";
  if (t.includes("particulier")) return "Particulier";
  if (t.includes("ventes")) return "Maison de ventes";
  return "Revendeur spécialisé";
}
const toutOrigine = m => (m.pieces || []).every(p => p.statut === "D'origine" || p.statut === "Remplacée par Rolex" || (p.statut === "Polie" && /rolex/i.test(p.note)));

function prepare() {
  VEND = Object.entries(DATA.vendeurs).map(([id, v]) => ({ id, ...v, dist: km(S.origin, v) }));
  const rank = [...VEND].sort((a, b) => a.temps_reponse_min - b.temps_reponse_min || b.taux_reponse - a.taux_reponse);
  rank.forEach((v, i) => v.rang = i + 1);
  const byId = Object.fromEntries(VEND.map(v => [v.id, v]));
  DET = (DETDATA.detaillants || []).map(d => ({ ...d, officiel: true, dist: km(S.origin, d) }));
  ALL = DATA.montres.map(m => {
    const v = byId[m.vendeur] || {};
    return { ...m, v, dist: v.dist, mat: materiauGroupe(m), ent: entretienGroupe(m) };
  });
}
function recalcDist() { VEND.forEach(v => v.dist = km(S.origin, v)); DET.forEach(d => d.dist = km(S.origin, d)); ALL.forEach(m => m.dist = m.v.dist); }
const montre = id => ALL.find(x => x.id === id);
const vendeur = id => VEND.find(x => x.id === id) || DET.find(x => x.id === id);
const detaillant = id => DET.find(x => x.id === id);

/* ====================================================================== filtres et tri */
function filtered(ignoreZone = false) {
  const z = ZONES.find(z => z.id === S.zone) || ZONES[3];
  const q = norm(S.q).trim().split(/\s+/).filter(Boolean);
  const F = S.f;
  const r = ALL.filter(m => {
    if (!ignoreZone && !z.test(m.v.code_pays)) return false;
    if (S.coll && m.collection !== S.coll) return false;
    if (S.etat && m.etat !== S.etat) return false;
    if (F.prixMax && m.prix > F.prixMax) return false;
    if (F.entretien.length && !F.entretien.includes(m.ent)) return false;
    if (F.condition.length && !F.condition.includes(m.condition)) return false;
    if (F.materiau.length && !F.materiau.includes(m.mat)) return false;
    if (F.vendeur.length && !F.vendeur.includes(vendeurGroupe(m.v.type))) return false;
    if (F.set && !(m.papiers && m.boite)) return false;
    if (F.origine && !toutOrigine(m)) return false;
    if (F.enLigne && !isOnline(m.v)) return false;
    return !q.length || matchQ(m, q);
  });
  return r.sort(sorter(S.sort));
}
function matchQ(m, q) {
  const hay = norm([m.collection, m.modele, m.reference, m.cadran, m.materiau, m.etat, m.condition, m.v.nom, m.v.ville, m.v.pays, m.annee, m.statut].join(" "));
  return q.every(w => hay.includes(w));
}
function sorter(k) {
  return {
    dist: (a, b) => a.dist - b.dist || a.prix - b.prix,
    recent: (a, b) => (b.publie || "").localeCompare(a.publie || ""),
    react: (a, b) => a.v.rang - b.v.rang || a.dist - b.dist,
    pa: (a, b) => a.prix - b.prix, pd: (a, b) => b.prix - a.prix,
    q: (a, b) => b.note - a.note || a.dist - b.dist,
  }[k] || ((a, b) => a.dist - b.dist);
}
function nbFiltres() {
  const F = S.f;
  return (F.prixMax ? 1 : 0) + F.entretien.length + F.condition.length + F.materiau.length + F.vendeur.length + (F.set ? 1 : 0) + (F.origine ? 1 : 0) + (F.enLigne ? 1 : 0);
}

/* ====================================================================== morceaux réutilisés */
function picOf(m, o = {}) {
  if (m.photos && m.photos.length) {
    const p = m.photos[0], src = typeof p === "string" ? p : p.src;
    return `<img src="${esc(src)}" alt="${esc(m.modele)}" loading="lazy" decoding="async">`;
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
  const baisse = m.prix_initial > m.prix;
  return `<a class="card" href="#m/${encodeURIComponent(m.id)}">
    <div class="pic">${m.statut && m.statut !== "Disponible" ? `<span class="status ${stClass(m.statut)}">${esc(m.statut)}</span>` : ""}${picOf(m)}</div>
    <button class="fav" data-fav="${esc(m.id)}" aria-label="Favori" aria-pressed="${ME.favs.has(m.id)}">${HEART}</button>
    <div class="body">
      <span class="coll-n">${esc(m.collection)}</span>
      <h3>${esc(m.modele)}</h3>
      <span class="cap">${esc(m.diametre)} mm, ${esc(shortMat(m.materiau))}</span>
      <span class="price">${eur(m.prix, m.devise)}${baisse ? `<s>${eur(m.prix_initial, m.devise)}</s>` : ""}</span>
      <span class="where">${PIN}${esc(lieu(m.v))} · ${fmtKm(m.dist)}</span>
      <span class="seen"><span class="live ${isOnline(m.v) ? "" : "off"}">${isOnline(m.v) ? "Vendeur en ligne" : "Vu " + ago(m.v.derniere_connexion)}</span></span>
      <div class="tags">${tagsOf(m)}</div>
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
function renderZones() {
  const base = filtered(true);
  $("#zones").innerHTML = ZONES.map((z, i) => {
    const n = base.filter(m => z.test(m.v.code_pays)).length;
    return `${i ? '<span class="zone-sep" aria-hidden="true">›</span>' : ""}<button class="zone" role="tab" data-z="${z.id}" aria-selected="${S.zone === z.id}">${esc(z.nom)}<small>${n} montre${n > 1 ? "s" : ""}</small></button>`;
  }).join("");
  $("#fZone").textContent = $("#menuZone").textContent = ZONE_NOM[S.zone];
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
  $("#fColls").innerHTML = list.map(([c]) => `<li><button data-coll-go="${esc(c)}">${esc(c)}</button></li>`).join("");
}
function renderGrid() {
  const r = filtered();
  const z = ZONES.find(z => z.id === S.zone);
  $("#count").innerHTML = `<span><b>${r.length}</b> montre${r.length > 1 ? "s" : ""} · ${esc(z.sous)}${S.q ? ` · « ${esc(S.q)} » <button class="linkbtn" data-clear-q>effacer</button>` : ""}</span>
    <span>Distances depuis ${S.near ? "votre position" : "Monaco"} · <button class="linkbtn" data-near>${PIN}${S.near ? "Revenir à Monaco" : "Autour de moi"}</button></span>`;
  if (!r.length) {
    const next = ZONES[ZONES.findIndex(x => x.id === S.zone) + 1];
    $("#grid").innerHTML = `<div class="empty"><h3>Aucune montre ici pour l'instant</h3><p>${next ? "Élargissez la recherche :" : "Essayez avec moins de filtres."}</p>${next ? `<button class="btn btn-green" data-z="${next.id}">Chercher ${esc(next.nom.replace("+ ", "en "))}</button>` : `<button class="btn btn-green" data-reset-all>Tout effacer</button>`}</div>`;
  } else $("#grid").innerHTML = r.map(cardHTML).join("");
  if (S.view === "map") renderBigMap(r);
  $("#layers").hidden = S.view !== "map";
  const n = nbFiltres(); $("#nFilters").hidden = !n; $("#nFilters").textContent = n;
  $$("[data-etat]").forEach(b => b.setAttribute("aria-pressed", b.dataset.etat === S.etat));
  $$(".coll").forEach(b => b.setAttribute("aria-pressed", b.dataset.c === S.coll));
  $("#sort").value = S.sort;
}
function renderSellers() {
  const top = [...VEND].sort((a, b) => a.rang - b.rang).slice(0, 6);
  $("#topSellers").innerHTML = top.map(sellerRow).join("");
}
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
function detsInZone(zoneId = S.zone) { const z = ZONES.find(x => x.id === zoneId) || ZONES[3]; return DET.filter(d => z.test(d.code_pays)).sort((a, b) => a.dist - b.dist); }
function renderOfficiels() {
  const list = detsInZone();
  $("#offCount").textContent = `${list.length} détaillant${list.length > 1 ? "s" : ""} · ${ZONE_NOM[S.zone]}`;
  $("#officiels").innerHTML = list.slice(0, 9).map(detRow).join("") || `<div class="empty"><h3>Aucun détaillant relevé dans cette zone</h3></div>`;
}
function renderHome() { renderZones(); renderGrid(); renderSellers(); renderOfficiels(); $("#homeTiles").innerHTML = tiles("home"); }

/* ====================================================================== cartes géographiques */
const TILES = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>';
let bigMap, bigLayer, pMap;
function baseMap(el, opt) {
  const map = L.map(el, { scrollWheelZoom: false, worldCopyJump: true, ...opt });
  (typeof el === "string" ? document.getElementById(el) : el).classList.add("stylise");
  L.tileLayer(TILES, { attribution: ATTR, subdomains: "abcd", maxZoom: 19, detectRetina: true }).addTo(map);
  return map;
}
function renderBigMap(list) {
  if (!window.L) { $("#bigmap").innerHTML = '<p style="padding:20px">La carte n\'a pas pu se charger.</p>'; return; }
  if (!bigMap) { bigMap = baseMap("bigmap").setView([CONFIG.origine.lat, CONFIG.origine.lng], 4); bigLayer = L.layerGroup().addTo(bigMap); }
  bigLayer.clearLayers();
  if (S.showDet !== false) detsInZone().forEach(d => {
    L.marker([d.lat, d.lng], { icon: L.divIcon({ className: "", html: '<div class="pin gold"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), title: d.nom, zIndexOffset: -100 }).addTo(bigLayer)
      .bindPopup(`<div class="pop"><h4>${esc(d.nom)}</h4><div class="pv">Détaillant officiel · ${esc(d.adresse)}, ${esc(d.ville)}</div><a href="#d/${encodeURIComponent(d.id)}"><span>Voir la fiche, la carte et le téléphone</span><b>›</b></a></div>`);
  });
  const groups = new Map();
  list.forEach(m => { if (!groups.has(m.vendeur)) groups.set(m.vendeur, []); groups.get(m.vendeur).push(m); });
  const pts = [];
  if (S.showAnn === false) groups.clear();
  groups.forEach(ms => {
    const v = ms[0].v;
    const icon = L.divIcon({ className: "", html: `<div class="pin">${ms.length}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
    L.marker([v.lat, v.lng], { icon, title: v.nom }).addTo(bigLayer)
      .bindPopup(`<div class="pop"><h4><a href="#v/${encodeURIComponent(v.id)}" style="border:0;padding:0;display:inline">${esc(v.nom)}</a></h4><div class="pv">${esc(v.ville)}, ${esc(v.pays)} · ${isOnline(v) ? "en ligne" : "vu " + ago(v.derniere_connexion)}</div>${ms.map(m => `<a href="#m/${encodeURIComponent(m.id)}"><span>${esc(m.modele)}</span><b>${eur(m.prix, m.devise)}</b></a>`).join("")}</div>`);
    pts.push([v.lat, v.lng]);
  });
  if (S.showDet !== false) detsInZone().forEach(d => pts.push([d.lat, d.lng]));
  setTimeout(() => {
    bigMap.invalidateSize();
    if (pts.length === 1) bigMap.setView(pts[0], 14);
    else if (pts.length) bigMap.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
  }, 30);
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
    if (!m) { out.push({ id, type: "retiree", texte: "Annonce retirée (vendue ou supprimée)" }); continue; }
    if (m.prix !== s.vu_prix) out.push({ id, m, type: "prix", texte: m.prix < s.vu_prix ? `Prix baissé de ${eur(s.vu_prix - m.prix)} (${eur(s.vu_prix)} → ${eur(m.prix)})` : `Prix augmenté : ${eur(s.vu_prix)} → ${eur(m.prix)}` });
    if ((m.statut || "Disponible") !== s.vu_statut) out.push({ id, m, type: "statut", texte: `Statut : ${s.vu_statut} → ${m.statut}` });
  }
  return out;
}
function markSeen(id) { const m = montre(id), s = ME.suivis[id]; if (!s) return; if (!m) { delete ME.suivis[id]; } else { s.vu_prix = m.prix; s.vu_statut = m.statut || "Disponible"; } ME.save(); }
function follow(id) {
  const m = montre(id); if (!m) return;
  if (!ME.compte) { store.set("rm.apres", { action: "suivre", id }); toast("Créez votre compte pour suivre cette montre"); location.hash = "compte"; return; }
  ME.suivis[id] = { depuis: new Date().toISOString(), prix: m.prix, statut: m.statut || "Disponible", vu_prix: m.prix, vu_statut: m.statut || "Disponible" };
  ME.favs.add(id); ME.save(); toast("Montre suivie : vous verrez chaque changement");
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
  return `Bonjour${v.contact && !/^M\.|^Mme/.test(v.contact) ? " " + v.contact.split(" ")[0] : ""},\n\nJe suis intéressé(e) par ${quoi}.\n${m ? "Est-elle toujours disponible ? Serait-il possible de la voir ?" : "Pouvez-vous me dire ce que vous avez en ce moment ?"}\n\nMerci,${c ? `\n${c.prenom} ${c.nom}${c.tel ? "\n" + c.tel : ""}` : ""}`;
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
function pageMontre(id) {
  const m = montre(id);
  if (!m) { openPage(`<div class="empty" style="margin-top:30px"><h3>Cette annonce n'existe plus</h3><p>Elle a peut-être été vendue ou retirée.</p><a class="btn btn-green" href="#">Voir les montres</a></div>`, "Annonce retirée"); return; }
  ME.vues = [id, ...ME.vues.filter(x => x !== id)].slice(0, 12); ME.save();
  const v = m.v, L2 = mapsLinks(v);
  const photos = (m.photos || []).map(p => typeof p === "string" ? { src: p } : p);
  const slides = photos.length ? photos.map((p, i) => ({ nom: p.legende || `Photo ${i + 1}`, html: `<img src="${esc(p.src)}" alt="${esc(m.modele)} — photo ${i + 1}" decoding="async">`, big: p.hd || p.src }))
    : VUES.map(x => ({ nom: x.nom, html: watchSVG(m.skin, { diam: m.diametre, vb: x.vb, label: `${m.modele} — ${x.nom}` }), vb: x.vb }));
  const ent = m.entretien || {};
  const entIcon = ent.par === "Rolex" || m.etat === "Neuf" ? "" : ent.par === "Horloger indépendant" ? "ind" : "unk";
  const similar = [...ALL.filter(x => x.id !== m.id && x.collection === m.collection).sort((a, b) => a.dist - b.dist),
    ...ALL.filter(x => x.id !== m.id && x.collection !== m.collection).sort((a, b) => Math.abs(a.prix - m.prix) - Math.abs(b.prix - m.prix))].slice(0, 4);
  const specs = [
    ["Référence", m.reference], ["Année", m.annee], ["Diamètre", `${m.diametre} mm`], ["Matériau", m.materiau],
    ["Lunette", m.lunette], ["Cadran", m.cadran], ["Mouvement", "Perpétuel, mécanique à remontage automatique"],
    ["Calibre", m.calibre], ["Réserve de marche", `Environ ${m.reserve} heures`], ["Fonctions", m.fonctions],
    ["Bracelet", m.bracelet], ["Fermoir", m.fermoir], ["Étanchéité", `${nf(m.etancheite)} mètres`],
    ["Boîtier", "Oyster, monobloc, fond et couronne vissés"], ["Verre", "Saphir inrayable" + (m.skin.date && m.skin.type !== "daytona" ? ", loupe Cyclope sur la date" : "")],
  ];
  const det = m.details || {};
  const suivi = ME.suivis[m.id];
  const statut = m.statut || "Disponible";
  const baisse = m.prix_initial > m.prix;
  const c = contactLinks(v, m);
  const histo = (m.historique_annonce || []).slice().reverse();
  const html = `
  <nav class="crumbs"><a href="#">Accueil</a> / <a href="#" data-coll-go="${esc(m.collection)}">${esc(m.collection)}</a> / <span>${esc(m.reference)}</span></nav>
  <div class="d-hero">
    <div class="gal">
      <div class="gal-main" id="galMain">${slides.map((s, i) => `<div class="slide" data-i="${i}">${s.html}</div>`).join("")}</div>
      <div class="gal-thumbs" id="galThumbs">${slides.map((s, i) => `<button data-i="${i}" aria-label="${esc(s.nom)}" aria-current="${i === 0}">${s.html}</button>`).join("")}</div>
      <div class="gal-hint"><span id="galName">${esc(slides[0].nom)}</span> · touchez pour agrandir et zoomer</div>
    </div>
    <div class="d-info">
      <div class="eyebrow">${esc(m.collection)}</div>
      <h1>${esc(m.modele)}</h1>
      <div class="cap">Oyster, ${esc(m.diametre)} mm, ${esc(shortMat(m.materiau))}</div>
      <div class="ref">Référence ${esc(m.reference)} · ${esc(m.annee)}</div>
      <div class="d-price"><b>${eur(m.prix, m.devise)}</b>${baisse ? `<s>${eur(m.prix_initial, m.devise)}</s>` : ""}<span class="pill ${stClass(statut)}">${esc(statut)}</span></div>
      <div class="d-note">${m.etat === "Neuf" ? "Prix public indiqué par le vendeur" : baisse ? `Prix baissé de ${eur(m.prix_initial - m.prix)} depuis la mise en ligne` : "Prix demandé par le vendeur"} · mis à jour ${esc(ago(m.mise_a_jour))}</div>
      <div class="tags" style="margin-top:14px">${tagsOf(m)}</div>
      <div class="d-cta">
        <a class="btn btn-green" href="${c.tel}" data-log="appel" data-v="${esc(v.id)}" data-m="${esc(m.id)}">Appeler</a>
        <a class="btn btn-light" href="#contact" data-scroll="contact">Écrire</a>
        <button class="btn ${suivi ? "btn-light" : "btn-line"} full" data-follow="${esc(m.id)}">${suivi ? "✓ Vous suivez cette montre" : "Suivre cette montre (prix, statut, vendeur)"}</button>
      </div>
      <a class="box mini-seller" href="#v/${encodeURIComponent(v.id)}">${avatar(v)}<div class="who"><b>${esc(v.nom)}</b><span>${isOnline(v) ? '<span class="live">En ligne maintenant</span>' : "Vu " + esc(ago(v.derniere_connexion))} · répond en ~${fmtDur(v.temps_reponse_min)}</span><span>${PIN.replace("<svg", '<svg width="13" height="13" style="vertical-align:-2px;color:#127749"')} ${esc(lieu(v))} · à ${fmtKm(m.dist)} ${S.near ? "de vous" : "de Monaco"}</span></div>${CHEV}</a>
      <div class="box">
        <div class="qual-row"><div><div class="eyebrow">Qualité</div><b style="font-size:17px">${esc(m.condition)}</b></div><div class="qual-score">${String(m.note).replace(".", ",")}<small>/10</small></div></div>
        <div class="bar"><i style="width:${m.note * 10}%"></i></div>
        <p>${esc(m.polissage)}. ${esc(ent.resume || "")}.</p>
      </div>
      ${m.resume ? `<p class="d-resume">${esc(m.resume)}</p>` : ""}
    </div>
  </div>

  <section class="d-sec">
    <p class="kicker">Suivi de l'annonce</p>
    <h2>Tout ce qui se passe sur cette montre</h2>
    <div class="stats">
      <div class="stat"><b>${nf(m.vues)}</b><span>vues de l'annonce</span></div>
      <div class="stat"><b>${nf(m.favoris + (ME.favs.has(m.id) ? 1 : 0))}</b><span>personnes l'ont en favori</span></div>
      <div class="stat"><b>${nf(m.demandes)}</b><span>demandes au vendeur</span></div>
      <div class="stat"><b>${esc(fmtDay(m.publie + "T10:00"))}</b><span>mise en ligne</span></div>
      <div class="stat"><b>${esc(ago(m.mise_a_jour))}</b><span>dernière mise à jour</span></div>
    </div>
    <div class="two">
      <div class="box"><h3>Historique de l'annonce</h3><ul class="tl">${histo.map(e => `<li class="${e.type === "prix" ? "w" : e.type === "statut" ? "b" : ""}"><div class="dt">${esc(fmtDate(e.date))} · ${esc(ago(e.date))}</div><div class="who">${esc(e.texte)}</div></li>`).join("")}</ul></div>
      <div class="box"><h3>Votre suivi</h3>${suivi ? `
        <p>Vous suivez cette montre depuis le ${esc(fmtDate(suivi.depuis))}. Prix à ce moment : <b>${eur(suivi.prix)}</b>${suivi.prix !== m.prix ? `, aujourd'hui <b>${eur(m.prix)}</b> (${m.prix < suivi.prix ? "−" : "+"}${eur(Math.abs(m.prix - suivi.prix))})` : ", inchangé"}. Statut : <b>${esc(statut)}</b>.</p>
        ${alerts().filter(a => a.id === m.id).map(a => `<span class="alert">● ${esc(a.texte)}</span>`).join("")}
        <div class="mine" style="padding:0;background:none"><div class="row"><button class="btn btn-light" data-unfollow="${esc(m.id)}" style="background:#fff">Ne plus suivre</button></div></div>`
        : `<p>Suivez cette montre pour être prévenu dès que son prix baisse, qu'elle est réservée ou vendue. Vos échanges avec le vendeur s'affichent aussi ici.</p><div class="mine" style="padding:0;background:none"><div class="row"><button class="btn btn-green" data-follow="${esc(m.id)}">Suivre cette montre</button></div></div>`}
        ${mesEchanges(v.id, m.id).replace('class="box" style="margin-top:20px"', 'style="margin-top:16px"')}
      </div>
    </div>
  </section>

  <section class="d-sec">
    <p class="kicker">État et historique</p>
    <h2>Ce qui a été fait sur cette montre</h2>
    <dl class="cond">${[["Boîtier", det.boitier], ["Lunette", det.lunette], ["Cadran", det.cadran], ["Verre", det.verre], ["Bracelet", det.bracelet]].map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b || "—")}</dd></div>`).join("")}</dl>
    <div class="two">
      <div class="box">
        <h3>Entretien</h3>
        <div class="maint"><div class="mi ${entIcon}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8 7.2 20l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.5-.6-.6-2.5Z"/></svg></div>
          <div><b>${m.etat === "Neuf" ? "Montre neuve" : ent.par === "Rolex" ? "Entretenue par Rolex" : ent.par === "Horloger indépendant" ? "Entretenue par un horloger indépendant" : ent.par === "Aucun" ? "Aucun entretien à ce jour" : "Entretien inconnu"}</b><span>${esc(ent.resume || "")}</span></div></div>
        ${(ent.historique || []).length ? `<ul class="tl">${ent.historique.map(h => `<li class="${h.par === "Rolex" ? "" : "w"}"><div class="dt">${esc(moisAnnee(h.date))}</div><div class="who">${esc(h.par)} — ${esc(h.lieu)}</div><p>${esc(h.travaux)}</p></li>`).join("")}</ul>` : `<p>Pas d'intervention enregistrée.</p>`}
      </div>
      <div class="box">
        <h3>Pièces d'origine ou changées</h3>
        <ul class="parts">${(m.pieces || []).map(p => `<li><span class="pn">${esc(p.piece)}${p.note ? `<span class="note">${esc(p.note)}</span>` : ""}</span><span class="st ${statutPiece(p.statut)}">${esc(p.statut)}</span></li>`).join("")}</ul>
      </div>
    </div>
    <div style="margin-top:20px"><h3 style="font-size:19px;margin:0 0 12px">Authenticité et accessoires</h3>
      <div class="checks">
        ${check(m.papiers, "Papiers / carte de garantie", m.papiers ? "Fournis" : "Non fournis")}
        ${check(m.boite, "Boîte d'origine", m.boite ? "Fournie" : "Non fournie")}
        ${check(!/aucune|expir/i.test(m.garantie), "Garantie", m.garantie)}
        ${check(toutOrigine(m), "Pièces d'origine Rolex", toutOrigine(m) ? "Aucune pièce non Rolex" : "Au moins une pièce non Rolex")}
        ${check(!!m.achat, "Origine", m.achat || "Montre neuve, vendue par le détaillant")}
        ${check(true, "Accessoires", m.accessoires || "—")}
      </div>
    </div>
  </section>

  <section class="d-sec">
    <p class="kicker">Caractéristiques</p>
    <h2>Fiche technique</h2>
    <dl class="specs">${specs.map(([a, b]) => `<div class="spec"><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>
  </section>

  <section class="d-sec" id="contact">
    <p class="kicker">Où la voir</p>
    <h2>Le vendeur et le plan d'accès</h2>
    <div class="seller">${sellerCard(v, m)}
      <div>${mapBlock("dmap", v)}</div>
    </div>
    ${formMessage(v, m)}
  </section>

  ${similar.length ? `<section class="d-sec"><p class="kicker">À découvrir aussi</p><h2>Montres similaires</h2><div class="similar">${similar.map(cardHTML).join("")}</div></section>` : ""}`;

  openPage(html, m.modele, `<button class="round" data-share aria-label="Partager"><svg viewBox="0 0 24 24"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/></svg></button><button class="round" data-fav="${esc(m.id)}" aria-pressed="${ME.favs.has(m.id)}" aria-label="Favori">${HEART}</button>`);

  const main = $("#galMain"), thumbs = $$("#galThumbs button");
  const setCur = i => { thumbs.forEach((b, j) => b.setAttribute("aria-current", i === j)); $("#galName").textContent = slides[i].nom; };
  thumbs.forEach(b => b.onclick = () => { const i = +b.dataset.i; main.scrollTo({ left: main.clientWidth * i, behavior: "smooth" }); setCur(i); });
  main.addEventListener("scroll", () => { const i = Math.round(main.scrollLeft / main.clientWidth); if (slides[i]) setCur(i); }, { passive: true });
  $$(".slide", main).forEach(el => el.onclick = () => openLB(m, slides, +el.dataset.i));
  pageMap("dmap", v);
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
        <a class="btn btn-light" href="${esc(d.source)}" target="_blank" rel="noopener" style="background:#fff">Fiche officielle</a>
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
    <div class="mapbox" style="margin-bottom:18px"><div id="omap"></div></div>
    <div class="sellers">${list.map(detRow).join("")}</div>
    <p class="d-note" style="margin-top:18px">Liste vérifiée le ${esc(fmtDay(DETDATA.verifie_le + "T12:00"))}. Rolex compte plus de mille détaillants officiels : la liste complète est sur le site officiel de Rolex.</p>`;
  openPage(html, "Détaillants officiels");
  if (window.L && list.length) {
    if (pMap) { pMap.remove(); pMap = null; }
    pMap = baseMap("omap", { worldCopyJump: false });
    const pts = list.map(d => { L.marker([d.lat, d.lng], { icon: L.divIcon({ className: "", html: '<div class="pin gold"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(pMap).bindPopup(`<div class="pop"><h4>${esc(d.nom)}</h4><div class="pv">${esc(d.adresse)}, ${esc(d.ville)}</div><a href="#d/${encodeURIComponent(d.id)}"><span>Ouvrir la fiche</span><b>›</b></a></div>`); return [d.lat, d.lng]; });
    setTimeout(() => { pMap.invalidateSize(); pts.length === 1 ? pMap.setView(pts[0], 15) : pMap.fitBounds(pts, { padding: [30, 30], maxZoom: 14 }); }, 350);
  }
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
  const tabs = [["suivis", `Suivies (${Object.keys(ME.suivis).length})`], ["favoris", `Favoris (${ME.favs.size})`], ["demandes", `Mes demandes (${ME.demandes.length})`], ["vues", "Vues récemment"]];
  let body = "";
  if (tab === "suivis") {
    const ids = Object.keys(ME.suivis);
    body = !ME.compte ? `<div class="empty"><h3>Créez votre compte pour suivre des montres</h3><p>Vous verrez chaque baisse de prix, chaque réservation et chaque vente.</p><a class="btn btn-green" href="#compte">Créer mon compte</a></div>`
      : !ids.length ? `<div class="empty"><h3>Aucune montre suivie</h3><p>Sur la fiche d'une montre, touchez « Suivre cette montre ».</p><button class="btn btn-green" data-goto="list">Voir les montres</button></div>`
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
    body = ms.length ? `<div class="grid">${ms.map(cardHTML).join("")}</div>` : `<div class="empty"><h3>Pas encore de favori</h3><p>Touchez le cœur d'une montre pour la garder ici.</p><button class="btn btn-green" data-goto="list">Voir les montres</button></div>`;
  } else if (tab === "demandes") {
    body = ME.demandes.length ? `<div class="plist">${ME.demandes.map(d => {
      const v = vendeur(d.vendeur), m = d.montre && montre(d.montre);
      if (!v) return "";
      const att = Math.max(1, Math.round((Date.now() - Date.parse(d.date)) / 60000));
      const rep = d.repondu ? `<span class="alert">Réponse reçue en ${fmtDur(Math.max(1, Math.round((Date.parse(d.repondu) - Date.parse(d.date)) / 60000)))}</span>` : `<span class="alert w">En attente depuis ${fmtDur(att)} · ${v.temps_reponse_min ? `ce vendeur répond en ~${fmtDur(v.temps_reponse_min)} d'habitude` : "détaillant officiel"}</span>`;
      return `<div class="pitem" style="grid-template-columns:${m ? "76px " : ""}1fr">${m ? `<a class="pp" href="#m/${encodeURIComponent(m.id)}">${picOf(m)}</a>` : ""}<div><b>${esc(v.nom)}</b><span>${esc(d.canal[0].toUpperCase() + d.canal.slice(1))} · ${esc(fmtDate(d.date))}${m ? " · " + esc(m.modele) : ""}</span>${rep}
        <div class="mine" style="padding:0;background:none;margin-top:6px"><div class="row">${d.repondu ? "" : `<button class="btn btn-green" data-rep="${d.id}">Le vendeur m'a répondu</button>`}<a class="btn btn-light" href="#${v.officiel ? "d" : "v"}/${encodeURIComponent(v.id)}" style="background:#fff">Le vendeur</a><button class="btn btn-light" data-del-dem="${d.id}" style="background:#fff">Effacer</button></div></div></div></div>`;
    }).join("")}</div>` : `<div class="empty"><h3>Aucune demande</h3><p>Quand vous appelez ou écrivez à un vendeur depuis l'appli, la demande s'affiche ici avec le temps de réponse.</p></div>`;
  } else {
    const ms = ME.vues.map(montre).filter(Boolean);
    body = ms.length ? `<div class="plist">${ms.map(m => pitem(m)).join("")}</div>` : `<div class="empty"><h3>Aucune montre vue</h3></div>`;
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
  toast(old ? "Informations enregistrées" : `Bienvenue ${c.prenom} !`);
  const apres = store.get("rm.apres", null);
  store.del("rm.apres");
  if (apres && apres.action === "suivre") { follow(apres.id); location.hash = "m/" + apres.id; return; }
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
    ["#vendeurs", "Vendeurs des annonces", ""],
    ["#suivis", `Mes suivis${a ? `<span class="dot">${a}</span>` : ""}`, ""],
    ["#suivis/demandes", "Mes demandes", ""],
    ["#compte", ME.compte ? "Mon compte" : "Créer un compte", ""],
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
        <li><a href="#vendeurs">Vendeurs les plus réactifs</a></li>
        <li><a href="#suivis">Mes suivis</a></li>
        <li><button data-sort-go="recent">Dernières annonces</button></li>
      </ul>
      <p class="kicker" style="margin-top:30px">Recherches fréquentes</p>
      <div class="vfilters" style="margin-top:12px">${["Daytona", "Submariner", "GMT-Master II", "Day-Date", "Datejust", "126610LN", "Officiel", "Monaco", "Paris", "Genève", "Dubaï"].map(t => `<button class="chip" data-qset="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
    return;
  }
  const res = ALL.filter(m => matchQ(m, q)).sort((a, b) => a.dist - b.dist);
  const ds = DET.filter(d => q.every(w => norm(`${d.nom} ${d.ville} ${d.pays} ${d.adresse} officiel rolex`).includes(w))).sort((a, b) => a.dist - b.dist);
  const vs = VEND.filter(v => q.every(w => norm(`${v.nom} ${v.ville} ${v.pays} ${v.type}`).includes(w)));
  $("#searchBody").innerHTML = `
    ${res.length ? `<button class="btn btn-green" data-q-apply style="width:100%;margin-bottom:16px">Voir les ${res.length} montre${res.length > 1 ? "s" : ""} dans la liste</button>` : ds.length ? "" : `<div class="empty"><h3>Aucun résultat</h3><p>Essayez un modèle, une référence ou une ville.</p></div>`}
    <div class="plist sres">${res.slice(0, 12).map(m => pitem(m)).join("")}</div>
    ${ds.length ? `<p class="kicker" style="margin-top:26px">Détaillants officiels</p><div class="sellers">${ds.slice(0, 9).map(detRow).join("")}</div>` : ""}
    ${vs.length ? `<p class="kicker" style="margin-top:26px">Vendeurs</p><div class="sellers">${vs.map(sellerRow).join("")}</div>` : ""}`;
}

/* ====================================================================== panneau des filtres */
function renderPanel() {
  const F = S.f;
  const prixMax = Math.ceil(Math.max(...ALL.map(m => m.prix)) / 5000) * 5000;
  const opts = (key, vals) => `<div class="opts">${vals.map(v => `<button class="opt" data-k="${key}" data-v="${esc(v)}" aria-pressed="${F[key].includes(v)}">${esc(v)}</button>`).join("")}</div>`;
  $("#panelBody").innerHTML = `
    <div class="fgroup"><h3>Prix maximum</h3><div class="range"><input type="range" id="fPrix" min="5000" max="${prixMax}" step="1000" value="${F.prixMax || prixMax}" aria-label="Prix maximum"><output id="fPrixO">${F.prixMax ? eur(F.prixMax) : "Sans limite"}</output></div></div>
    <div class="fgroup"><h3>Entretien</h3>${opts("entretien", ["Neuve", "Par Rolex", "Horloger indépendant", "Aucun ou inconnu"])}</div>
    <div class="fgroup"><h3>État</h3>${opts("condition", ["Jamais portée", "Comme neuve", "Très bon état", "Bon état"])}</div>
    <div class="fgroup"><h3>Matériau</h3>${opts("materiau", ["Acier", "Rolesor (bicolore)", "Or", "Platine", "Rolesium"])}</div>
    <div class="fgroup"><h3>Vendeur</h3>${opts("vendeur", ["Boutique", "Certifié Pre-Owned", "Revendeur spécialisé", "Maison de ventes", "Particulier"])}</div>
    <div class="fgroup">
      <label class="tog">Boîte et papiers fournis<input type="checkbox" id="fSet" ${F.set ? "checked" : ""}></label>
      <label class="tog">Uniquement des pièces Rolex<input type="checkbox" id="fOrig" ${F.origine ? "checked" : ""}></label>
      <label class="tog">Vendeur en ligne maintenant<input type="checkbox" id="fOn" ${F.enLigne ? "checked" : ""}></label>
    </div>`;
  const r = $("#fPrix");
  r.oninput = () => { const v = +r.value; F.prixMax = v >= prixMax ? 0 : v; $("#fPrixO").textContent = F.prixMax ? eur(F.prixMax) : "Sans limite"; updApply(); };
  $$(".opt", $("#panelBody")).forEach(b => b.onclick = () => {
    const arr = F[b.dataset.k], v = b.dataset.v, i = arr.indexOf(v);
    i < 0 ? arr.push(v) : arr.splice(i, 1);
    b.setAttribute("aria-pressed", i < 0); updApply();
  });
  $("#fSet").onchange = e => { F.set = e.target.checked; updApply(); };
  $("#fOrig").onchange = e => { F.origine = e.target.checked; updApply(); };
  $("#fOn").onchange = e => { F.enLigne = e.target.checked; updApply(); };
  updApply();
}
function updApply() { const n = filtered().length; $("#fApply").textContent = `Voir ${n} montre${n > 1 ? "s" : ""}`; }
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
  box.innerHTML = s.big ? `<img src="${esc(s.big)}" alt="">` : watchSVG(LB.m.skin, { diam: LB.m.diametre, vb: s.vb });
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
  } catch (e) { if (manual) toast("Pas de connexion : affichage des dernières annonces connues"); }
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
  if (!navigator.geolocation) { toast("Position indisponible sur cet appareil"); return; }
  toast("Recherche de votre position…");
  navigator.geolocation.getCurrentPosition(p => {
    S.near = true; S.origin = { lat: p.coords.latitude, lng: p.coords.longitude }; S.sort = "dist";
    recalcDist(); renderHome(); toast("Distances calculées depuis votre position");
  }, () => toast("Position refusée : distances depuis Monaco"), { timeout: 10000 });
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
  const mt = t.closest("[data-mt]");
  if (mt) {
    const box = mt.closest(".mtabs"), k = mt.dataset.mt, wrap = box.nextElementSibling, fr = $("iframe", wrap), plan = wrap.firstElementChild;
    $$("[data-mt]", box).forEach(b => b.setAttribute("aria-pressed", b === mt));
    if (k === "plan") { fr.hidden = true; plan.hidden = false; if (pMap) setTimeout(() => pMap.invalidateSize(), 50); }
    else {
      const q = `${box.dataset.lat},${box.dataset.lng}`;
      fr.src = `https://maps.google.com/maps?q=${q}&z=${k === "sat" ? 18 : 16}&t=${k === "sat" ? "k" : "m"}&hl=fr&output=embed`;
      fr.hidden = false; plan.hidden = true;
    }
    return;
  }
  const lt = t.closest("[data-layer]");
  if (lt) { const k = lt.dataset.layer; S[k] = S[k] === false; lt.setAttribute("aria-pressed", S[k] !== false); renderGrid(); return; }
  const g = t.closest("[data-goto]"); if (g) { e.preventDefault(); goList(g.dataset.goto === "map" ? "map" : "list"); return; }
  const zg = t.closest("[data-zone-go]"); if (zg) { e.preventDefault(); S.zone = zg.dataset.zoneGo; store.set("rm.zone", S.zone); renderHome(); goList(); return; }
  const cg = t.closest("[data-coll-go]"); if (cg) { e.preventDefault(); S.coll = cg.dataset.collGo; S.zone = "monde"; renderHome(); goList(); return; }
  const sg = t.closest("[data-sort-go]"); if (sg) { S.sort = sg.dataset.sortGo; S.zone = "monde"; renderHome(); goList(); return; }
  const z = t.closest("[data-z]"); if (z) { S.zone = z.dataset.z; store.set("rm.zone", S.zone); renderHome(); return; }
  const c = t.closest(".coll"); if (c) { S.coll = c.dataset.c; renderHome(); return; }
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
  if (t.closest("[data-seen-all]")) { Object.keys(ME.suivis).forEach(markSeen); route(); renderHome(); return; }
  const vs = t.closest("[data-vsort]"); if (vs) { VSORT = vs.dataset.vsort; pageVendeurs(); return; }
  const oz = t.closest("[data-ozone]"); if (oz) { OZONE = oz.dataset.ozone; pageOfficiels(); return; }
  const vz = t.closest("[data-vzone]"); if (vz) { VZONE = vz.dataset.vzone; pageVendeurs(); return; }
  const rp = t.closest("[data-rep]"); if (rp) { const d = ME.demandes.find(x => x.id === rp.dataset.rep); if (d) { d.repondu = new Date().toISOString(); ME.save(); toast("Réponse notée"); route(); } return; }
  const dd = t.closest("[data-del-dem]"); if (dd) { ME.demandes = ME.demandes.filter(x => x.id !== dd.dataset.delDem); ME.save(); route(); return; }
  const cv = t.closest("[data-copy-v]"); if (cv) { const v = vendeur(cv.dataset.copyV); copy(`${v.nom}\n${v.contact || "Détaillant officiel Rolex"}\n${v.adresse}, ${v.cp} ${v.ville}, ${v.pays}\n${v.tel}\n${v.email}`); toast("Coordonnées copiées"); return; }
  const lg = t.closest("[data-log]"); if (lg) { logDemande(lg.dataset.v, lg.dataset.m, lg.dataset.log); }
  const sc = t.closest("[data-scroll]"); if (sc) { e.preventDefault(); $("#" + sc.dataset.scroll).scrollIntoView({ behavior: "smooth" }); return; }
  const qs = t.closest("[data-qset]"); if (qs) { $("#q").value = qs.dataset.qset; renderSearch(); return; }
  if (t.closest("[data-q-apply]")) { applySearch(); return; }
  if (t.closest("[data-share]")) { share(); return; }
  if (t.closest("[data-notif]")) { askNotif(); return; }
  if (t.closest("[data-logout]")) {
    if (confirm("Supprimer votre compte, vos suivis et vos demandes de cet appareil ?")) { ME.compte = null; ME.suivis = {}; ME.demandes = []; ME.save(); toast("Compte supprimé"); location.hash = ""; renderHome(); }
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
  if (!("Notification" in window)) { toast("Notifications indisponibles sur ce navigateur"); return; }
  const p = await Notification.requestPermission();
  const c = ME.compte; if (c) { c.notif = p === "granted"; ME.compte = c; }
  toast(p === "granted" ? "Notifications activées" : "Notifications refusées"); route();
}
function applySearch() { S.q = $("#q").value.trim(); S.zone = "monde"; closeOv("search"); renderHome(); goList(); }

$("#btnMenu").onclick = () => { renderMenu(); openOv("menu"); };
$("#btnSearch").onclick = $("#heroSearch").onclick = () => { openOv("search"); renderSearch(); setTimeout(() => $("#q").focus(), 250); };
$("#btnMap").onclick = () => goList("map");
$("#btnFavs").onclick = () => { location.hash = alerts().length || Object.keys(ME.suivis).length ? "suivis" : "suivis/favoris"; };
$("#q").oninput = renderSearch;
$("#searchForm").onsubmit = e => { e.preventDefault(); applySearch(); };
$("#sort").onchange = e => { S.sort = e.target.value; renderGrid(); };
$("#vList").onclick = () => setView("list");
$("#vMap").onclick = () => setView("map");
$("#homeLink").onclick = e => { e.preventDefault(); closeOv("menu"); closeOv("search"); if (location.hash) location.hash = ""; window.scrollTo({ top: 0 }); };
$("#menu").addEventListener("click", e => { if (e.target.closest("a[href^='#']") && !e.target.closest("[data-goto],[data-zone-go]")) closeOv("menu"); });
$("#search").addEventListener("click", e => { if (e.target.closest("a[href^='#']")) closeOv("search"); });
$("#demoOk").onclick = () => { $("#demo").hidden = true; store.set("rm.demoOk", 1); };
window.addEventListener("scroll", () => $("#top").classList.toggle("scrolled", scrollY > 4), { passive: true });
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
  else if (k === "vendeurs") pageVendeurs();
  else if (k === "d") pageDetaillant(a);
  else if (k === "officiels") pageOfficiels();
  else if (k === "suivis") pageSuivis(a || "suivis");
  else if (k === "compte") pageCompte();
  else closePage();
}
window.addEventListener("hashchange", route);

/* ====================================================================== démarrage */
async function start() {
  try { await loadData(false); }
  catch (e) { $("#grid").innerHTML = `<div class="empty"><h3>Impossible de charger les montres</h3><p>Vérifiez la connexion, puis tirez la page vers le bas.</p></div>`; return; }
  $("#demo").hidden = !DATA.demo || !!store.get("rm.demoOk", 0);
  // Visuel d'accueil assorti au logo : chronographe or, cadran vert
  $("#heroImg").innerHTML = watchSVG({ type: "daytona", dial: "#0f4a2c", sub: "#0f4a2c", bezel: "#0c3a22", insert: "#0c3a22", metal: "gold", bracelet: "oyster" }, { diam: 40, vb: "75 170 250 260", par: "xMidYMid slice" });
  $("#searchEmblem").innerHTML = $("#homeLink").innerHTML;
  if (DATA.mise_a_jour) $("#updated").textContent = `Annonces mises à jour le ${new Date(DATA.mise_a_jour).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`;
  renderColls(); renderHome(); updateDots();
  route(); S.started = true;
  notifyAlerts();
}
start();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
