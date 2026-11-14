// Caméra orbitale (souris, tactile, molette, pincement) + 17 vues prédéfinies avec transition douce.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const VUES = [
  { id: "trois-quarts", nom: "Trois-quarts", pos: [94, 46, 140], cible: [0, -1, -4] },
  { id: "face", nom: "Face", pos: [0, 0, 172], cible: [0, 0, 0] },
  { id: "trois-quarts-g", nom: "Trois-quarts gauche", pos: [-99, 40, 137], cible: [0, -1, -4] },
  { id: "profil-3h", nom: "Profil côté couronne", pos: [172, 6, 0], cible: [0, 0, -6] },
  { id: "profil-9h", nom: "Profil côté 9 h", pos: [-172, 6, 0], cible: [0, 0, -6] },
  { id: "dessus", nom: "Dessus (12 h)", pos: [0, 172, 20], cible: [0, 0, -12] },
  { id: "dessous", nom: "Dessous (6 h)", pos: [0, -172, 20], cible: [0, 0, -12] },
  { id: "fond", nom: "Fond", pos: [0, 0, -140], cible: [0, 0, -4] },
  { id: "cadran", nom: "Cadran en gros plan", pos: [0, 0, 50], cible: [0, 0, 2] },
  { id: "lunette", nom: "Lunette tachymétrique", pos: [16, 26, 36], cible: [7, 11, 4] },
  { id: "couronne", nom: "Couronne Triplock", pos: [42, 8, 14], cible: [21, 0, -.5] },
  { id: "poussoirs", nom: "Poussoirs", pos: [40, 24, 16], cible: [19, 6, -.5] },
  { id: "compteurs", nom: "Compteurs", pos: [6, -6, 34], cible: [2, -3, 2.4] },
  { id: "fermoir", nom: "Fermoir Oysterlock", pos: [30, -46, -130], cible: [0, 0, -40] },
  { id: "bracelet", nom: "Bracelet Oyster", pos: [130, 66, -60], cible: [0, 8, -20] },
  { id: "mouvement", nom: "Mouvement en gros plan", pos: [8, -6, -50], cible: [3, -3, -3] },
  { id: "rasante", nom: "Vue rasante", pos: [58, -14, 112], cible: [0, 1, 0] },
  { id: "eclate", nom: "Vue éclatée", pos: [150, 52, 96], cible: [0, 0, -4], cache: true },
];

export function camera(canvas) {
  const cam = new THREE.PerspectiveCamera(28, 1, .5, 2000);
  const ctl = new OrbitControls(cam, canvas);
  ctl.enableDamping = true; ctl.dampingFactor = .08; ctl.minDistance = 22; ctl.maxDistance = 340; ctl.zoomSpeed = .9; ctl.rotateSpeed = .8;
  ctl.enablePan = true; ctl.screenSpacePanning = true;
  let tw = null;
  function aller(id, duree = .9) {
    const v = VUES.find(x => x.id === id) || VUES[0];
    tw = { t: 0, d: duree, p0: cam.position.clone(), c0: ctl.target.clone(), p1: new THREE.Vector3(...v.pos), c1: new THREE.Vector3(...v.cible) };
    return v;
  }
  function anime(dt) {
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / tw.d); const k = 1 - Math.pow(1 - tw.t, 3);
      // trajectoire sphérique autour de la cible : la caméra tourne au lieu de traverser la montre
      const c = tw.c0.clone().lerp(tw.c1, k), a = tw.p0.clone().sub(tw.c0), b = tw.p1.clone().sub(tw.c1);
      const ra = a.length(), rb = b.length(), d = a.normalize().lerp(b.normalize(), k);
      if (d.lengthSq() < 1e-4) d.set(0, 1, 0);
      cam.position.copy(c).add(d.normalize().multiplyScalar(ra + (rb - ra) * k)); ctl.target.copy(c);
      if (tw.t >= 1) tw = null;
    }
    ctl.update();
  }
  cam.position.set(...VUES[0].pos); ctl.target.set(...VUES[0].cible); ctl.update();
  return { cam, ctl, aller, anime, get enTransition() { return !!tw; } };
}
