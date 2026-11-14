// Cadran : plaque laquée percée de trois compteurs en creux, index appliqués en or gris avec Chromalight, typographie imprimée.
import * as THREE from "three";
import { D } from "./dims.js";
import { TAU, uvPlan, pave, piece } from "./geo.js";
import { cadran, azurageRelief } from "./textures.js";

export function cadranGroupe(M, { marquages = true } = {}) {
  const g = new THREE.Group(); g.name = "cadran";
  const map = cadran(2048, marquages);
  const laque = new THREE.MeshPhysicalMaterial({ name: "Cadran laqué", map, roughness: .32, metalness: 0, clearcoat: .55, clearcoatRoughness: .12, side: THREE.DoubleSide });
  const s = new THREE.Shape(); s.absarc(0, 0, D.rCadran, 0, TAU, false);
  const comp = Object.values(D.posCompteurs);
  for (const [x, y] of comp) { const h = new THREE.Path(); h.absarc(x, y, D.rAnneauCompteur, 0, TAU, true); s.holes.push(h); }
  const plaque = new THREE.ExtrudeGeometry(s, { depth: .3, bevelEnabled: false, curveSegments: 96 });
  plaque.translate(0, 0, D.zCadran - .3); uvPlan(plaque, D.rCadran);
  g.add(piece(new THREE.Mesh(plaque, laque), "Cadran", "Cadran laqué blanc, minuterie au quart de seconde, compteurs à anneau noir."));
  const fondC = laque.clone(); fondC.roughness = .4; fondC.clearcoat = .3;
  const sillons = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .55, roughness: .25, metalness: .15, bumpMap: azurageRelief(), bumpScale: 1.4, depthWrite: false, side: THREE.DoubleSide });
  const paroi = new THREE.MeshStandardMaterial({ color: 0x101011, roughness: .5, side: THREE.DoubleSide });
  const noms = ["Compteur 30 minutes (à 3 h)", "Compteur 12 heures (à 6 h)", "Petite seconde (à 9 h)"];
  comp.forEach(([x, y], i) => {
    const sg = new THREE.Group();
    const f = new THREE.CircleGeometry(D.rAnneauCompteur, 96); f.translate(x, y, D.zCompteur); uvPlan(f, D.rCadran);
    sg.add(new THREE.Mesh(f, fondC));
    const az = new THREE.Mesh(new THREE.CircleGeometry(D.rCompteur - .05, 96), sillons); az.position.set(x, y, D.zCompteur + .006); sg.add(az);
    const w = new THREE.CylinderGeometry(D.rAnneauCompteur, D.rAnneauCompteur, D.zCadran - D.zCompteur, 96, 1, true); w.rotateX(Math.PI / 2); w.translate(x, y, (D.zCadran + D.zCompteur) / 2);
    sg.add(new THREE.Mesh(w, paroi));
    g.add(piece(sg, noms[i], "Compteur légèrement en creux, centre azuré, anneau noir gradué."));
  });
  // index appliqués : or gris 18 ct + Chromalight (bleu dans l'obscurité)
  const index = new THREE.Group();
  for (const h of [1, 2, 4, 5, 7, 8, 10, 11, 12]) {
    const a = h / 12 * TAU, large = h === 12 ? 1.35 : .9, r = 11.75;
    const ig = new THREE.Group(); ig.position.set(Math.sin(a) * r, Math.cos(a) * r, D.zCadran + .19); ig.rotation.z = -a;
    ig.add(new THREE.Mesh(pave(large, 2.35, .38, .22, .1, 2), M.orGris));
    const l = new THREE.Mesh(pave(large * .48, 1.8, .12, .1, .03, 1), M.chromalight); l.position.z = .2; ig.add(l);
    index.add(ig);
  }
  g.add(piece(index, "Index appliqués", "Or gris 18 ct, remplis de Chromalight (luminescence bleue longue durée)."));
  return g;
}
