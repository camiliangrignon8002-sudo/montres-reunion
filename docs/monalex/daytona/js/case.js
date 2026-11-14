// Boîtier Oyster : carrure, cornes (flancs polis, dessus satiné), épaulements de couronne, fond vissé ou fond saphir (mode technique).
import * as THREE from "three";
import { D } from "./dims.js";
import { tour, cannele, pave, piece, remap } from "./geo.js";

function corne(M, xIn, sens) {
  // profil de la corne dans le plan (y, z), extrudé selon X sur 2,6 mm
  const s = new THREE.Shape(), L = D.corneACorne / 2;
  s.moveTo(15.2, 3.7);
  s.bezierCurveTo(18.6, 3.5, 21.2, 2.3, L - .45, .35);
  s.quadraticCurveTo(L + .05, -.5, L - .2, -1.75);
  s.quadraticCurveTo(L - 1.1, -2.55, 19.8, -2.95);
  s.lineTo(15.2, -3.5); s.closePath();
  const ep = 2.35, bev = .32;
  const g = new THREE.ExtrudeGeometry(s, { depth: ep - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 24 });
  remap(g, (a, b, c) => [xIn + bev + c, sens * a, b]);
  // groupe 0 = faces (flancs, polis) ; groupe 1 = pourtour (dessus/dessous, satinés)
  const m = new THREE.Mesh(g, [M.acierPoli, M.acierSatine]);
  return m;
}

export function boitier(M) {
  const g = new THREE.Group(); g.name = "boitier";
  const carrure = new THREE.Mesh(tour([
    [14.6, -3.7], [18.6, -3.7], null, [18.6, -3.7], [19.42, -3.45], [19.86, -2.85], [19.97, -2.1], [19.97, 3.25], [19.84, 3.82], [19.55, 4.15], null,
    [19.55, 4.15], [14.95, 4.15], null, [14.95, 4.15], [14.95, 2.75], [14.6, 2.6], null, [14.6, 2.6], [14.6, -3.7]], 200), M.acierPoli);
  g.add(piece(carrure, "Carrure Oyster", "Monobloc en Oystersteel (acier 904L), Ø 40 mm, côtés polis. Étanche à 100 m."));
  const cornes = new THREE.Group();
  for (const sx of [1, -1]) for (const sy of [1, -1]) cornes.add(corne(M, sx > 0 ? 10 : -12.35, sy));
  g.add(piece(cornes, "Cornes", "Quatre cornes : dessus satiné, flancs polis. 20 mm entre cornes (estimé)."));
  // épaulements protégeant la couronne
  const ep = new THREE.Group();
  for (const sy of [1, -1]) {
    const f = new THREE.Shape(); f.moveTo(18.2, sy * 8.2); f.quadraticCurveTo(20.6, sy * 7.4, 21.25, sy * 5.0); f.quadraticCurveTo(21.5, sy * 3.9, 20.9, sy * 3.55); f.lineTo(18.2, sy * 3.3); f.closePath();
    const geo = new THREE.ExtrudeGeometry(f, { depth: 4.6, bevelEnabled: true, bevelThickness: .55, bevelSize: .45, bevelSegments: 4, curveSegments: 20 });
    geo.translate(0, 0, -2.1); ep.add(new THREE.Mesh(geo, M.acierPoli));
  }
  g.add(piece(ep, "Épaulements", "Protègent la couronne Triplock, venus de la carrure."));
  // anneau intérieur (rehaut) entre le cadran et le verre
  const rehaut = new THREE.Mesh(tour([[14.38, 2.56], [14.95, 4.1]], 160), new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: .5, side: THREE.DoubleSide }));
  g.add(piece(rehaut, "Rehaut", "Anneau intérieur qui borde le cadran."));

  // --- fond vissé (authentique) et fond saphir (technique)
  const cannelures = new THREE.Mesh(cannele(18.05, 72, .22, .5, -4.2, .08, 16.9), M.acierPoli);
  cannelures.geometry.rotateY(-Math.PI / 2);
  const fondPlein = new THREE.Mesh(tour([[17.95, -4.2], [17.5, -4.55], [16.2, -5.25], [12, -5.75], [6, -5.92], [0, -5.95]], 200), M.acierPoli);
  const fondOuvert = new THREE.Group();
  fondOuvert.add(new THREE.Mesh(tour([[17.95, -4.2], [17.5, -4.55], [16.2, -5.25], [15.2, -5.5], null, [15.2, -5.5], [14.4, -5.45], [14.4, -4.9]], 200), M.acierPoli));
  const glace = new THREE.Mesh(tour([[0, -5.62], [14.42, -5.48], [14.42, -4.95], [0, -4.95]], 96), M.saphir);
  fondOuvert.add(piece(glace, "Fond saphir (mode technique)", "Présentation pédagogique : le fond réel de la 126500LN est en acier plein."));
  const fond = new THREE.Group(); fond.name = "fond";
  fond.add(cannelures, fondPlein, fondOuvert);
  piece(fond, "Fond vissé", "Fond Oyster cannelé, vissé hermétiquement avec un outil spécifique au fabricant.");
  const setMode = tech => { fondPlein.visible = !tech; fondOuvert.visible = tech; };
  setMode(false);
  return { groupe: g, fond, setMode };
}
