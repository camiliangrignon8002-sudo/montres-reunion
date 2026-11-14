// Bracelet Oyster trois rangs : maillons extérieurs satinés, maillon central poli, effilé de 20 à 16 mm.
// Chaque rangée est un groupe-pivot posé le long d'une courbe « poignet » (cubique de Bézier), par abscisse curviligne.
import * as THREE from "three";
import { D } from "./dims.js";
import { pave, piece, courber } from "./geo.js";

export const ZFERMOIR = -40, DEMI_FERMOIR = 16.2;
const P0 = new THREE.Vector2(21.9, -1.6);              // barrette à ressort entre les cornes (y, z)
const COURBE = new THREE.CubicBezierCurve(P0, new THREE.Vector2(27.6, -11.2), new THREE.Vector2(26.5, ZFERMOIR), new THREE.Vector2(DEMI_FERMOIR, ZFERMOIR));
const L = COURBE.getLength();

// rayon de courbure local (mm), pour cintrer chaque maillon comme la courbe
function rayon(s) { const a = repere(s - .6).a, b = repere(s + .6).a; let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) < 1e-4 ? 0 : 1.2 / Math.abs(d); }
const cintre = (geo, R) => (R && R < 400 ? courber(geo, R) : geo);
// repère au point d'abscisse s (mm) : position (y, z) et angle (rotation autour de X)
function repere(s) {
  const t = COURBE.getTangentAt(0);
  if (s < 0) return { y: P0.x + t.x * s, z: P0.y + t.y * s, a: Math.atan2(t.y, t.x) };
  const u = Math.min(1, s / L), p = COURBE.getPointAt(u), tg = COURBE.getTangentAt(u);
  return { y: p.x, z: p.y, a: Math.atan2(tg.y, tg.x) };
}

function cote(M) {
  const g = new THREE.Group();
  const lenE = 5.5, n = Math.round((L - lenE) / D.pasMaillon), pas = (L - lenE) / n;
  const largeur = s => D.largeurAttache - (D.largeurAttache - D.largeurFermoir) * Math.min(1, Math.max(0, s / L));
  // embout (pièce pleine qui épouse la carrure)
  const e = repere(lenE / 2 - 1.2), emb = new THREE.Group();
  emb.position.set(0, e.y, e.z); emb.rotation.x = e.a;
  const Re = rayon(lenE / 2);
  const ePlein = new THREE.Mesh(cintre(pave(19.7, lenE + 2.4, 3.3, .6, .5, 3), Re), M.acierSatine);
  const eCentre = new THREE.Mesh(cintre(pave(7.1, lenE + 2.2, 3.4, .5, .45, 3), Re), M.acierPoli); eCentre.position.z = .02;
  emb.add(ePlein, eCentre); g.add(piece(emb, "Embout plein", "Attache massive qui fait la jonction entre la carrure et le bracelet."));
  const rangs = [];
  for (let i = 0; i < n; i++) {
    const s = lenE + (i + .5) * pas, r = repere(s), w = largeur(s), wc = w * .36, wo = (w - wc) / 2 - .24;
    const rang = new THREE.Group(); rang.position.set(0, r.y, r.z); rang.rotation.x = r.a;
    const R = rayon(s);
    const centre = new THREE.Mesh(cintre(pave(wc, pas - .22, 3.05, .55, .5, 3), R), M.acierPoli); centre.position.z = .08;
    rang.add(centre);
    for (const sx of [1, -1]) { const o = new THREE.Mesh(cintre(pave(wo, pas - .06, 2.9, .5, .45, 3), R), M.acierSatine); o.position.x = sx * (wc / 2 + .12 + wo / 2); rang.add(o); }
    const goupille = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, w - .25, 12).rotateZ(Math.PI / 2), M.acierMvt); goupille.position.y = -pas / 2;
    rang.add(goupille);
    rangs.push(rang); g.add(piece(rang, `Maillon Oyster n° ${i + 1}`, `Trois rangs : extérieurs satinés, central poli. Largeur ${w.toFixed(1)} mm (estimée).`));
  }
  return { g, rangs };
}

export function bracelet(M) {
  const g = new THREE.Group(); g.name = "bracelet";
  const haut = cote(M), bas = cote(M);
  bas.g.scale.y = -1;                                  // côté 6 h : miroir du côté 12 h
  haut.g.name = "bracelet-12h"; bas.g.name = "bracelet-6h";
  // pivots sur les barrettes à ressort : le bracelet peut s'ouvrir pour dégager le fond
  const pivH = new THREE.Group(), pivB = new THREE.Group();
  pivH.position.set(0, P0.x, P0.y); haut.g.position.set(0, -P0.x, -P0.y);
  pivB.position.set(0, -P0.x, P0.y); bas.g.position.set(0, P0.x, -P0.y);
  pivH.add(haut.g); pivB.add(bas.g); g.add(pivH, pivB);
  let ouv = 0, cible = 0;
  const lisse = t => t * t * (3 - 2 * t);
  return {
    groupe: g, haut: haut.g, bas: bas.g, pivotHaut: pivH, longueur: L,
    ouvrir(v) { cible = v ? 1 : 0; },
    anime(dt) { if (ouv === cible) return; ouv += Math.sign(cible - ouv) * Math.min(Math.abs(cible - ouv), dt * 1.4); const k = lisse(ouv); pivH.rotation.x = 1.3 * k; pivB.rotation.x = -1.3 * k; },
  };
}
