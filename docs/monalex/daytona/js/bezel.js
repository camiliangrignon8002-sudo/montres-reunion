// Lunette : anneau en acier et disque Cerachrom noir, échelle tachymétrique 60–400 gravée puis revêtue de platine (texture couleur + métal + rugosité + relief).
import * as THREE from "three";
import { D } from "./dims.js";
import { tour, uvPlan, piece } from "./geo.js";
import { lunette } from "./textures.js";

export function lunetteGroupe(M) {
  const g = new THREE.Group(); g.name = "lunette";
  const bague = new THREE.Mesh(tour([[14.9, 4.16], [19.6, 4.16], [19.98, 4.3], [19.98, 4.75], [19.72, 5.12], null, [19.72, 5.12], [19.5, 5.14], null, [15.25, 5.32], [14.95, 5.28], [14.75, 5.0], [14.75, 4.4]], 180), M.acierPoli);
  g.add(piece(bague, "Lunette (monture)", "Monture en Oystersteel polie qui reçoit le disque Cerachrom."));
  const t = lunette(2048);
  const ceramique = new THREE.MeshPhysicalMaterial({
    name: "Cerachrom", map: t.map, metalnessMap: t.metal, metalness: 1, roughnessMap: t.rugo, roughness: 1,
    bumpMap: t.metal, bumpScale: -.6, clearcoat: .9, clearcoatRoughness: .04, envMapIntensity: 1.2, side: THREE.DoubleSide,
  });
  const disque = tour([[15.25, 5.33], [19.45, 5.16], null, [19.45, 5.16], [19.5, 5.05]], 256);
  uvPlan(disque, t.R);
  g.add(piece(new THREE.Mesh(disque, ceramique), "Disque Cerachrom", "Céramique noire, quasi inrayable. Échelle tachymétrique 60 à 400 unités par heure, chiffres revêtus de platine."));
  return g;
}
