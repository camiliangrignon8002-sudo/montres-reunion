// Aiguilles : chaque aiguille a son propre pivot (groupe), rotation horaire autour de Z.
import * as THREE from "three";
import { D } from "./dims.js";
import { TAU, plaque, piece } from "./geo.js";

function baton(L, w, queue, M, lume = true) {
  const g = new THREE.Group();
  const pts = [[-w * .32, -queue], [w * .32, -queue], [w / 2, L * .12], [w / 2, L - w * .85], [0, L], [-w / 2, L - w * .85], [-w / 2, L * .12]];
  g.add(new THREE.Mesh(plaque(pts, .1, .025), M.orGris));
  if (lume) { const l = new THREE.Mesh(plaque([[-w * .28, L * .2], [w * .28, L * .2], [w * .28, L - w * 1.05], [0, L - w * .5], [-w * .28, L - w * 1.05]], .05, .015), M.chromalight); l.position.z = .08; g.add(l); }
  const moyeu = new THREE.Mesh(new THREE.CylinderGeometry(w * .62, w * .62, .16, 32).rotateX(Math.PI / 2), M.orGris); g.add(moyeu);
  return g;
}
function aiguille(L, queue, w, mat, contrepoids = 0) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(plaque([[-w, -queue], [w, -queue], [w * .6, L * .9], [0, L], [-w * .6, L * .9]], .07, .01), mat));
  if (contrepoids) { const c = new THREE.Mesh(new THREE.CylinderGeometry(contrepoids, contrepoids, .08, 32).rotateX(Math.PI / 2), mat); c.position.y = -queue + contrepoids * .6; g.add(c); }
  const rm = Math.max(.3, w * 1.8 + .12); g.add(new THREE.Mesh(new THREE.CylinderGeometry(rm, rm, .16, 32).rotateX(Math.PI / 2), mat));
  return g;
}
export function aiguilles(M) {
  const g = new THREE.Group(); g.name = "aiguilles";
  const noir = new THREE.MeshPhysicalMaterial({ color: 0x111112, roughness: .3, metalness: .4, clearcoat: .6 });
  const pivot = (obj, z, x = 0, y = 0) => { const p = new THREE.Group(); p.position.set(x, y, z); p.add(obj); g.add(p); return p; };
  const [zh, zm, zc] = D.zAiguilles, zp = 2.75, P = D.posCompteurs;
  const h = {
    heures: pivot(piece(baton(8.3, 1.05, 1.6, M), "Aiguille des heures", "Or gris 18 ct, Chromalight."), zh),
    minutes: pivot(piece(baton(12.6, .85, 1.9, M), "Aiguille des minutes", "Or gris 18 ct, Chromalight."), zm),
    chrono: pivot(piece(aiguille(13.85, 3.4, .1, M.orGris, .55), "Trotteuse du chronographe", "Centrale, au 1/8 de seconde. Démarrage et arrêt par le poussoir à 2 h."), zc),
    cMinutes: pivot(piece(aiguille(3.35, .8, .12, noir), "Totalisateur 30 minutes", "Remise à zéro par le poussoir à 4 h."), zp, ...P.minutes),
    cHeures: pivot(piece(aiguille(3.35, .8, .12, noir), "Totalisateur 12 heures", ""), zp, ...P.heures),
    secondes: pivot(piece(aiguille(3.35, .8, .12, noir), "Petite seconde", "Toujours en marche."), zp, ...P.secondes),
  };
  // axe central (canon)
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 1.25, 24).rotateX(Math.PI / 2).translate(0, 0, D.zCadran + .6), M.orGris));
  const regle = (p, f) => { p.rotation.z = -f * TAU; };
  // chrono : { ecoule } en secondes
  function regler(date, chrono) {
    const s = date.getSeconds() + Math.floor(date.getMilliseconds() / 125) / 8, mn = date.getMinutes() + s / 60, hr = (date.getHours() % 12) + mn / 60;
    regle(h.heures, hr / 12); regle(h.minutes, mn / 60); regle(h.secondes, s / 60);
    const e = Math.floor(chrono * 8) / 8;
    regle(h.chrono, (e % 60) / 60); regle(h.cMinutes, (e / 60 % 30) / 30); regle(h.cHeures, (e / 3600 % 12) / 12);
  }
  return { groupe: g, pivots: h, regler };
}
