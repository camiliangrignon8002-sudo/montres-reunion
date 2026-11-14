// Poussoirs vissés du chronographe à 2 h (départ/arrêt) et 4 h (remise à zéro). Pressables : la tête recule de 0,6 mm.
import * as THREE from "three";
import { cannele, piece } from "./geo.js";

const cyl = (r, l, x0, seg = 48) => new THREE.CylinderGeometry(r, r, l, seg).rotateZ(-Math.PI / 2).translate(x0 + l / 2, 0, 0);

function poussoir(M, angle, nom, details) {
  const g = new THREE.Group(); g.rotation.z = angle; g.position.z = .2;
  const p = new THREE.Group(); p.position.set(0, 0, 0);
  p.add(new THREE.Mesh(cyl(1.25, 3.0, 19.0), M.acierPoli));
  p.add(new THREE.Mesh(cannele(1.95, 18, .14, 1.5, 19.75, .15), M.acierPoli));   // bague vissée cannelée
  const tete = new THREE.Group();
  tete.add(new THREE.Mesh(cyl(.8, 1.6, 20.9), M.acierPoli));
  tete.add(new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.5, 1.1, 48).rotateZ(-Math.PI / 2).translate(22.9, 0, 0), M.acierPoli));
  tete.add(new THREE.Mesh(new THREE.SphereGeometry(3, 48, 8, 0, Math.PI * 2, 0, .504).rotateZ(-Math.PI / 2).translate(20.83, 0, 0), M.acierPoli));
  p.add(tete); g.add(p);
  piece(g, nom, details);
  let t = 0;
  return {
    groupe: g, tete,
    presser() { t = 1; },
    anime(dt) { if (t > 0) { t = Math.max(0, t - dt * 4); } const k = t > .5 ? (1 - t) * 2 : t * 2; tete.position.x = -.6 * k; },
  };
}
export function poussoirs(M) {
  const haut = poussoir(M, Math.PI / 6, "Poussoir à 2 h", "Départ et arrêt du chronographe. Vissé : à dévisser avant usage (ici simulé).");
  const bas = poussoir(M, -Math.PI / 6, "Poussoir à 4 h", "Remise à zéro du chronographe à l'arrêt.");
  const g = new THREE.Group(); g.name = "poussoirs"; g.add(haut.groupe, bas.groupe);
  return { groupe: g, haut, bas };
}
