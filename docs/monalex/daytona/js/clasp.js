// Fermoir Oysterlock : capot, levier de sécurité, deux lames déployantes, rallonge Easylink 5 mm. Chaque pièce a sa charnière.
import * as THREE from "three";
import { pave, piece } from "./geo.js";
import { ZFERMOIR, DEMI_FERMOIR } from "./bracelet.js";

const lisse = t => t * t * (3 - 2 * t), seg = (x, a, b) => lisse(Math.min(1, Math.max(0, (x - a) / (b - a))));

export function fermoir(M) {
  const g = new THREE.Group(); g.name = "fermoir"; g.position.set(0, 0, ZFERMOIR); g.rotation.x = Math.PI;
  const H = DEMI_FERMOIR;
  // capot : charnière à l'extrémité +Y
  const chCapot = new THREE.Group(); chCapot.position.set(0, H - .6, .3);
  const capot = new THREE.Group(); capot.position.y = -(H - .6);
  const plaque = new THREE.Mesh(pave(16.4, 2 * H, 1.6, .9, .55, 3), M.acierSatine);
  const nervure = new THREE.Mesh(pave(6.2, 2 * H - 3, .4, .6, .18, 2), M.acierPoli); nervure.position.z = .85;
  capot.add(plaque, nervure);
  // levier Oysterlock (sécurité), charnière sur le capot
  const chLevier = new THREE.Group(); chLevier.position.set(0, -H + 9.5, 1.0);
  const levier = new THREE.Mesh(pave(9.4, 6.8, 1.0, .9, .35, 3), M.acierPoli); levier.position.y = -3.4;
  chLevier.add(levier); capot.add(chLevier); chCapot.add(capot); g.add(chCapot);
  // lames déployantes (sous le capot)
  const chLame1 = new THREE.Group(); chLame1.position.set(0, H - 1.5, -1.2);
  const lame1 = new THREE.Mesh(pave(14.4, 2 * H - 2.5, .8, .5, .25, 2), M.acierPoli); lame1.position.y = -(H - 1.5) + .4;
  chLame1.add(lame1); g.add(chLame1);
  const chLame2 = new THREE.Group(); chLame2.position.set(0, -H + 2, -2.05);
  const lame2 = new THREE.Mesh(pave(13.2, 2 * H - 6, .7, .5, .22, 2), M.acierPoli); lame2.position.y = H - 4.5;
  chLame2.add(lame2); g.add(chLame2);
  // Easylink : petite rallonge de 5 mm qui se déplie à l'extrémité -Y
  const chEasy = new THREE.Group(); chEasy.position.set(0, -H + .4, -.4);
  const easy = new THREE.Mesh(pave(14.8, 5, .9, .5, .3, 2), M.acierSatine); easy.position.y = 2.5;
  chEasy.add(easy); g.add(chEasy);
  piece(chCapot, "Fermoir Oysterlock", "Fermoir déployant avec levier de sécurité qui évite toute ouverture accidentelle.");
  piece(chLevier, "Levier de sécurité Oysterlock", "Doit être soulevé avant d'ouvrir le capot.");
  piece(chLame1, "Lame déployante", "Lame articulée en acier poli.");
  piece(chLame2, "Lame déployante intérieure", "Seconde lame articulée.");
  piece(chEasy, "Rallonge Easylink", "Allonge le bracelet d'environ 5 mm sans outil (confort selon la température).");
  let ouv = 0, cible = 0, easyOuv = 0, easyCible = 0;
  function poser() {
    chLevier.rotation.x = -1.25 * seg(ouv, 0, .3);
    chCapot.rotation.x = -1.55 * seg(ouv, .2, 1);
    chLame1.rotation.x = -.8 * seg(ouv, .45, 1);
    chLame2.rotation.x = .6 * seg(ouv, .6, 1);
    chEasy.rotation.x = Math.PI * lisse(easyOuv);
  }
  poser();
  return {
    groupe: g,
    ouvrir(v = cible ? 0 : 1) { cible = v; return cible; },
    easylink(v = easyCible ? 0 : 1) { easyCible = v; return easyCible; },
    get ouvert() { return cible === 1; },
    anime(dt) {
      const k = Math.min(1, dt * 1.6), ko = ouv, ke = easyOuv;
      ouv += Math.sign(cible - ouv) * Math.min(Math.abs(cible - ouv), k * .9);
      easyOuv += Math.sign(easyCible - easyOuv) * Math.min(Math.abs(easyCible - easyOuv), k * 1.2);
      if (ko !== ouv || ke !== easyOuv) poser();
    },
  };
}
