// Interface : barre d'outils, menu des vues, fiche de la pièce sélectionnée, panneau « À propos », aide gestuelle.
import { VUES } from "./camera.js";
import { D } from "./dims.js";

const $ = s => document.querySelector(s);
const h = (tag, attrs = {}, ...enfants) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) k.startsWith("on") ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v); e.append(...enfants); return e; };

export function interface_(app) {
  const barre = $("#barre"), fiche = $("#fiche"), apropos = $("#apropos");
  const bouton = (id, texte, titre, action) => { const b = h("button", { id, type: "button", class: "btn", title: titre, "aria-label": titre, onclick: action }, texte); return b; };
  const etat = (b, actif) => { b.classList.toggle("on", !!actif); b.setAttribute("aria-pressed", actif ? "true" : "false"); };

  // rotation automatique + vitesse
  const bRot = bouton("b-rot", "Rotation", "Rotation automatique : pause ou reprise", () => etat(bRot, app.rotation(!app.etat.rotation)));
  const vit = h("input", { type: "range", min: "0.05", max: "1.2", step: "0.05", value: String(app.etat.vitesse), "aria-label": "Vitesse de rotation", class: "vit", oninput: e => (app.etat.vitesse = +e.target.value) });
  etat(bRot, app.etat.rotation);
  // vues
  const menu = $("#vues");
  VUES.filter(v => !v.cache).forEach((v, i) => menu.append(h("button", { type: "button", class: "vue", onclick: () => { app.vue(v.id); menu.hidden = true; bVues.setAttribute("aria-expanded", "false"); etat(bRot, false); } }, h("span", { class: "n" }, String(i + 1).padStart(2, "0")), v.nom)));
  const bVues = bouton("b-vues", "Vues", "Choisir une vue prédéfinie", () => { menu.hidden = !menu.hidden; if (!menu.hidden) { fiche.hidden = true; apropos.hidden = true; } bVues.setAttribute("aria-expanded", String(!menu.hidden)); });
  bVues.setAttribute("aria-haspopup", "true"); bVues.setAttribute("aria-expanded", "false");
  // chronographe
  const bChrono = bouton("b-chrono", "Départ", "Chronographe : départ ou arrêt (poussoir à 2 h)", () => { const m = app.departArret(); bChrono.textContent = m ? "Arrêt" : "Départ"; etat(bChrono, m); bRaz.disabled = m; });
  const bRaz = bouton("b-raz", "Zéro", "Remise à zéro du chronographe (poussoir à 4 h)", () => app.remiseAZero());
  // fermoir
  const bFerm = bouton("b-ferm", "Fermoir", "Ouvrir ou fermer le fermoir Oysterlock", () => etat(bFerm, app.fermoir()));
  const bEasy = bouton("b-easy", "Easylink", "Déplier la rallonge Easylink de 5 mm", () => etat(bEasy, app.easylink()));
  // mode authentique / technique
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Mode d'affichage" });
  const bAuth = bouton("b-auth", "Authentique", "Fond acier plein, comme la montre réelle", () => mode(false));
  const bTech = bouton("b-tech", "Technique", "Fond saphir pédagogique : mouvement visible", () => mode(true));
  seg.append(bAuth, bTech);
  const bRal = bouton("b-ral", "Ralenti", "Ralentir le mouvement pour voir l'échappement", () => etat(bRal, app.ralenti()));
  bRal.hidden = true;
  function mode(tech) { app.mode(tech); etat(bAuth, !tech); etat(bTech, tech); bRal.hidden = !tech; if (tech) { app.vue("fond"); etat(bRot, app.rotation(false)); } }
  etat(bAuth, true);
  const bEcl = bouton("b-ecl", "Éclaté", "Vue éclatée des composants", () => { const on = app.eclate(); etat(bEcl, on); if (on) { app.vue("eclate", 1.2); etat(bRot, app.rotation(false)); } });
  const bReset = bouton("b-reset", "Réinitialiser", "Revenir à la vue et à l'état de départ", () => { app.reinitialiser(); [bFerm, bEasy, bEcl, bChrono].forEach(b => etat(b, false)); bChrono.textContent = "Départ"; bRaz.disabled = false; mode(false); app.vue("trois-quarts"); etat(bRot, app.rotation(true)); });
  const sep = () => h("span", { class: "sep", "aria-hidden": "true" });
  barre.append(bRot, vit, sep(), bVues, sep(), bChrono, bRaz, sep(), bFerm, bEasy, sep(), seg, bRal, sep(), bEcl, bReset);

  // fiche de pièce

  $("#fiche-x").addEventListener("click", () => (fiche.hidden = true));
  app.onSelection = info => {
    if (!info) { fiche.hidden = true; return; }
    $("#fiche-nom").textContent = info.nom; $("#fiche-txt").textContent = info.details || "";
    fiche.hidden = false; menu.hidden = true; apropos.hidden = true;
  };
  // à propos
  $("#b-info").addEventListener("click", () => { apropos.hidden = !apropos.hidden; if (!apropos.hidden) { fiche.hidden = true; menu.hidden = true; } });
  $("#apropos-x").addEventListener("click", () => (apropos.hidden = true));
  const lignes = [["Diamètre", `${D.boitierDiametre} mm`, "officiel"], ["Épaisseur", `${D.boitierEpaisseur} mm`, "estimé"], ["Corne à corne", `${D.corneACorne} mm`, "estimé"], ["Entre cornes", `${D.entreCornes} mm`, "estimé"], ["Bracelet", `${D.largeurAttache} → ${D.largeurFermoir} mm`, "estimé"], ["Étanchéité", `${D.etancheite} m`, "officiel"], ["Réserve de marche", `${D.reserveMarche} h`, "officiel"], ["Fréquence", `${D.frequence.toLocaleString("fr-FR")} alt/h (4 Hz)`, "officiel"]];
  $("#dims").append(...lignes.map(([a, b, c]) => h("tr", {}, h("th", {}, a), h("td", {}, b), h("td", { class: c }, c))));
  // menus qui se ferment au clic ailleurs / Échap
  document.addEventListener("keydown", e => { if (e.key === "Escape") { menu.hidden = true; fiche.hidden = true; apropos.hidden = true; } });
  document.addEventListener("pointerdown", e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== bVues) menu.hidden = true; });
}
