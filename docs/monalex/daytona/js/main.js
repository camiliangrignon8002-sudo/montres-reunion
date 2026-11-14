// Point d'entrée : assemble les modules, la scène, la boucle de rendu et la sélection des pièces.
import * as THREE from "three";
import { materiaux } from "./materials.js";
import { boitier } from "./case.js";
import { lunetteGroupe } from "./bezel.js";
import { verre } from "./glass.js";
import { cadranGroupe } from "./dial.js";
import { aiguilles } from "./hands.js";
import { couronne } from "./crown.js";
import { poussoirs } from "./pushers.js";
import { bracelet } from "./bracelet.js";
import { fermoir } from "./clasp.js";
import { mouvement } from "./movement.js";
import { studio, ombreContact } from "./lighting.js";
import { camera } from "./camera.js";
import { eclate } from "./explode.js";
import { animations } from "./animations.js";
import { interface_ } from "./ui.js";

const canvas = document.getElementById("scene");
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); }
catch (e) { document.body.classList.add("sans-webgl"); throw e; }
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
let pr = Math.min(window.devicePixelRatio || 1, 1.75); renderer.setPixelRatio(pr);

const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf4f3ef);
studio(renderer, scene);
scene.add(ombreContact(-35));

const params = new URLSearchParams(location.search);
const M = materiaux();
const montre = new THREE.Group(); montre.position.z = -17; scene.add(montre);      // pivot de rotation au centre du bracelet
const asm = new THREE.Group(); asm.position.z = 17; montre.add(asm);

const B = boitier(M), cour = couronne(M), pous = poussoirs(M);
B.groupe.add(cour.groupe, pous.groupe);
const lun = lunetteGroupe(M), ver = verre(M), cad = cadranGroupe(M, { marquages: params.get("marquages") !== "0" }), aig = aiguilles(M);
const mvt = mouvement(M), bra = bracelet(M), fer = fermoir(M);
asm.add(B.groupe, lun, ver, aig.groupe, cad, mvt.groupe, B.fond, bra.groupe);
{ const p = bra.pivotHaut.position; fer.groupe.position.sub(p); bra.pivotHaut.add(fer.groupe); }  // le fermoir suit le côté 12 h

const ecl = eclate([
  { obj: bra.haut, v: [0, 20, 0] }, { obj: bra.bas, v: [0, -20, 0] }, { obj: fer.groupe, v: [0, 0, -16] },
  { obj: B.groupe, v: [0, 0, 0] }, { obj: lun, v: [0, 0, 20] }, { obj: ver, v: [0, 0, 30] },
  { obj: aig.groupe, v: [0, 0, 12] }, { obj: cad, v: [0, 0, 5] }, { obj: mvt.groupe, v: [0, 0, -11] }, { obj: B.fond, v: [0, 0, -24] },
]);
const anim = animations({ montre, aiguilles: aig, mouvement: mvt, poussoirs: pous, fermoir: fer, eclate: ecl });
const C = camera(canvas);
let technique = false;

const app = {
  etat: anim.etat,
  rotation(v) { anim.etat.rotation = v; if (!v) anim.recentrer(); return v; },
  vue(id, d) { anim.recentrer(); anim.etat.rotation = false; C.aller(id, d); bra.ouvrir(technique || id === "fond" || id === "mouvement"); },
  departArret: () => anim.departArret(),
  remiseAZero: () => anim.remiseAZero(),
  fermoir: () => fer.ouvrir(),
  easylink: () => fer.easylink(),
  mode(tech) { technique = tech; B.setMode(tech); anim.etat.mouvementVisible = tech; bra.ouvrir(tech); },
  ralenti() { anim.etat.ralenti = anim.etat.ralenti === 1 ? .08 : 1; return anim.etat.ralenti !== 1; },
  eclate: () => ecl.basculer(),
  reinitialiser() { fer.ouvrir(0); fer.easylink(0); ecl.basculer(0); anim.etat.ralenti = 1; if (anim.etat.chrono.marche) anim.departArret(); anim.etat.chrono.cumul = 0; },
  onSelection: null,
};
interface_(app);
app.mode(false);

// --- sélection d'une pièce au clic (sans déclencher pendant une rotation de caméra)
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let down = null;
const visible = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
const infoDe = o => { for (; o; o = o.parent) if (o.userData.info) return o.userData.info; return null; };
canvas.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; anim.interaction(); });
canvas.addEventListener("wheel", () => anim.interaction(), { passive: true });
canvas.addEventListener("pointerup", e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const r = canvas.getBoundingClientRect();
  ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, C.cam);
  const hits = ray.intersectObject(asm, true).filter(x => visible(x.object) && infoDe(x.object));
  let h = hits[0];
  if (h && infoDe(h.object).nom === "Verre saphir" && hits[1]) h = hits[1];       // le verre laisse voir la pièce dessous
  const info = h ? infoDe(h.object) : null;
  if (info && /Poussoir à 2/.test(info.nom)) document.getElementById("b-chrono").click();
  else if (info && /Poussoir à 4/.test(info.nom)) app.remiseAZero();
  else if (info && /Fermoir Oysterlock|Levier de sécurité/.test(info.nom)) document.getElementById("b-ferm").click();
  app.onSelection?.(info);
});

// --- taille, boucle de rendu, résolution adaptative
function taille() {
  const w = canvas.clientWidth, hh = canvas.clientHeight;
  renderer.setSize(w, hh, false); C.cam.aspect = w / hh;
  C.cam.fov = w < hh ? 34 : 28; C.cam.updateProjectionMatrix();
}
new ResizeObserver(taille).observe(canvas); taille();
const horloge = new THREE.Clock();
let somme = 0, nb = 0;
function image(dt) {
  anim.tick(dt); C.anime(dt); bra.anime(dt);
  mvt.groupe.visible = technique || ecl.actif;
  renderer.render(scene, C.cam);
  somme += dt; nb++;
  if (nb === 90) {                     // trop lent ? on baisse la résolution (jamais sous 1)
    const moy = somme / nb; somme = nb = 0;
    if (moy > 1 / 38 && pr > 1) { pr = Math.max(1, pr - .25); renderer.setPixelRatio(pr); taille(); }
  }
}
// ?test : pas de boucle continue, les images sont rendues à la demande (tests automatisés)
if (params.has("test")) { pr = 1; renderer.setPixelRatio(1); taille(); image(0); }
else renderer.setAnimationLoop(() => image(Math.min(horloge.getDelta(), .1)));
document.body.classList.add("pret");
window.__daytona = { app, scene, C, anim, renderer, rendre(s = 1, pas = 1 / 30) { for (let i = 0; i < s / pas; i++) { anim.tick(pas); C.anime(pas); bra.anime(pas); } image(0); } };
