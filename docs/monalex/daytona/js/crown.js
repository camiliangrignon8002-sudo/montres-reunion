// Couronne Triplock vissée : tube, trois joints, couronne cannelée. Axe = +X, centrée à 3 h.
import * as THREE from "three";
import { cannele, piece } from "./geo.js";

const cyl = (r, l, x0, seg = 48) => new THREE.CylinderGeometry(r, r, l, seg).rotateZ(-Math.PI / 2).translate(x0 + l / 2, 0, 0);

export function couronne(M) {
  const g = new THREE.Group(); g.name = "couronne"; g.position.set(0, 0, -.35);
  g.add(new THREE.Mesh(cyl(1.75, 1.6, 19.4), M.acierPoli));                        // tube
  const corps = new THREE.Group();
  corps.add(new THREE.Mesh(cannele(3.05, 26, .2, 2.7, 21.0, .25), M.acierPoli));   // couronne cannelée
  corps.add(new THREE.Mesh(cyl(2.55, .22, 23.62, 64), M.acierPoli));                // face
  for (const [x, r] of [[20.95, 2.4], [21.15, 2.4], [21.35, 2.4]]) {             // zone Triplock (3 joints)
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, .09, 10, 64).rotateY(Math.PI / 2).translate(x, 0, 0), M.joint); corps.add(t);
  }
  g.add(corps);
  piece(g, "Couronne Triplock", "Vissée, triple étanchéité (trois zones de joints). Remontage, mise à l'heure.");
  return { groupe: g, corps };
}
