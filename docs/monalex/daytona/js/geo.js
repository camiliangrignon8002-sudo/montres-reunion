// Outils de géométrie : profils tournés, roues dentées, pavés arrondis, projection de coordonnées.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
export const TAU = Math.PI * 2;

// remappe les sommets (permet de construire une pièce dans un plan puis de l'orienter)
export function remap(geo, f) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const [x, y, z] = f(v.x, v.y, v.z); p.setXYZ(i, x, y, z); }
  p.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere(); return geo;
}
// profil [rayon, z] tourné autour de l'axe Z ; un « null » dans la liste marque une arête vive (normales non lissées)
export function tour(points, seg = 128) {
  const runs = [[]];
  points.forEach((p, i) => { if (p) runs[runs.length - 1].push(p); else runs.push([points[i - 1]]); });
  const geos = runs.filter(r => r.length > 1).map(r => {
    const g = new THREE.LatheGeometry(r.map(([rr, z]) => new THREE.Vector2(Math.max(rr, 1e-4), z)), seg);
    return remap(g, (x, y, z) => [x, -z, y]);
  });
  return geos.length === 1 ? geos[0] : mergeGeometries(geos);
}
// courbe une pièce posée à plat (Y = longueur, Z = vers l'extérieur) sur un cylindre de rayon R (axe X)
export function courber(geo, R) {
  return remap(geo, (x, y, z) => { const a = y / R; return [x, (R + z) * Math.sin(a), (R + z) * Math.cos(a) - R]; });
}
// coordonnées UV planaires (vue de face) : pour poser une texture « imprimée » sur une pièce en relief
export function uvPlan(geo, R) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[2 * i] = .5 + p.getX(i) / (2 * R); uv[2 * i + 1] = .5 + p.getY(i) / (2 * R); }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); return geo;
}
// roue dentée (dents trapézoïdales) dans le plan XY, épaisseur selon Z, centrée
export function roue(rExt, dents, { prof = .25, ep = .3, rTrou = 0, bras = 0, rMoyeu = 0, bev = .03 } = {}) {
  const s = new THREE.Shape(), n = dents, rIn = rExt - prof;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, da = TAU / n;
    const pts = [[rIn, a0], [rExt, a0 + da * .22], [rExt, a0 + da * .48], [rIn, a0 + da * .7]];
    pts.forEach(([r, a], k) => (i === 0 && k === 0 ? s.moveTo : s.lineTo).call(s, r * Math.cos(a), r * Math.sin(a)));
  }
  s.closePath();
  if (bras && rMoyeu) {                       // jante évidée avec bras
    const rJ = rIn - Math.max(.25, rExt * .12);
    for (let b = 0; b < bras; b++) {
      const a0 = b / bras * TAU + .22, a1 = (b + 1) / bras * TAU - .22, h = new THREE.Path();
      h.absarc(0, 0, rJ, a0, a1, false); h.absarc(0, 0, rMoyeu, a1 - .12, a0 + .12, true); h.closePath(); s.holes.push(h);
    }
  }
  if (rTrou) { const h = new THREE.Path(); h.absarc(0, 0, rTrou, 0, TAU, true); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth: ep, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -ep / 2); return g;
}
// profil cannelé (couronne, tubes vissés) : roue à dents arrondies, axe X, de x0 à x0 + longueur
export function cannele(r, n, prof, longueur, x0, bev = .18, rTrou = 0) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 8; i++) { const a = i / (n * 8) * TAU, rr = r - prof * (.5 + .5 * Math.cos(a * n)); i ? s.lineTo(rr * Math.cos(a), rr * Math.sin(a)) : s.moveTo(rr, 0); }
  if (rTrou) { const h = new THREE.Path(); h.absarc(0, 0, rTrou, 0, TAU, true); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth: longueur - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * .8, bevelSegments: 2, curveSegments: 2 });
  return remap(g, (x, y, z) => [x0 + bev + z, x, y]);
}
// pavé à coins arrondis et chanfreins (plan XY, épaisseur Z centrée)
export function pave(w, h, d, r = .8, bev = .3, segs = 3) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2 - .01, h / 2 - .01);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  bev = Math.min(bev, d / 3);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: segs, curveSegments: 6 });
  g.translate(0, 0, -(d - 2 * bev) / 2); return g;
}
// forme extrudée à partir d'une liste de points (plan XY), épaisseur selon Z
export function plaque(points, ep, bev = .06, trous = []) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const [x, y, r] of trous) { const h = new THREE.Path(); h.absarc(x, y, r, 0, TAU, true); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth: ep, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -ep / 2); return g;
}
// pièce identifiée (sélection au clic : nom + caractéristiques)
export function piece(obj, nom, details = "") { obj.userData.info = { nom, details }; return obj; }
