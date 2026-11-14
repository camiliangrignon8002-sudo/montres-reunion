// Éclairage studio : environnement HDR généré (boîtes à lumière, sol sombre) filtré par PMREM, ombre de contact au sol.
import * as THREE from "three";

export function studio(renderer, scene) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), new THREE.MeshBasicMaterial({ color: 0x48494e, side: THREE.BackSide })));
  const boite = (w, h, k, pos, couleur = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(couleur).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m); return m;
  };
  boite(70, 46, 7, [0, 62, 38]);             // grande boîte à lumière au-dessus, légèrement devant
  boite(18, 90, 5.5, [-70, 10, 20]);           // bande verticale gauche
  boite(14, 80, 2.4, [70, 6, -30]);            // bande verticale droite
  boite(60, 14, 2.2, [0, 18, -80], 0xf4f1ea);  // contre-jour
  boite(40, 40, 1.6, [30, -10, 75], 0xfff6ea); // débouchage chaud de face
  const sol = new THREE.Mesh(new THREE.CircleGeometry(100, 48), new THREE.MeshBasicMaterial({ color: 0x34353a }));
  sol.rotation.x = -Math.PI / 2; sol.position.y = -45; env.add(sol);             // horizon sombre : contraste des polis
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, .035).texture;
  pmrem.dispose();
  const cle = new THREE.DirectionalLight(0xffffff, 1.1); cle.position.set(30, 60, 50); scene.add(cle);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4cc, .25));
  return { cle };
}

export function ombreContact(y = -36) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(40,38,34,.42)"); gr.addColorStop(.45, "rgba(40,38,34,.18)"); gr.addColorStop(1, "rgba(40,38,34,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.scale.set(78, 62, 1); m.renderOrder = -1;
  return m;
}
