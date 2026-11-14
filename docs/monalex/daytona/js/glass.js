// Verre saphir bombé, réfraction (ior 1,77), traitement antireflet suggéré par une faible réflexion.
import * as THREE from "three";
import { tour, piece } from "./geo.js";

export function verre(M) {
  const g = new THREE.Group(); g.name = "verre";
  const m = new THREE.Mesh(tour([[0, 5.95], [8, 5.9], [13.6, 5.72], [14.85, 5.45], null, [14.85, 5.45], [14.85, 4.6], null, [14.85, 4.6], [0, 4.7]], 128), M.saphir);
  m.renderOrder = 2;
  g.add(piece(m, "Verre saphir", "Saphir synthétique inrayable, légèrement bombé. Sans loupe Cyclope : la Daytona n'a pas de date."));
  return g;
}
