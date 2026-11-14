// Monalex — montre en 3D (Three.js) : boîtier, lunette, couronne, verre et bracelet en vrai relief,
// cadran tiré du dessin vectoriel de la montre. Tourne au défilement, se manipule au doigt. Rendu seulement quand ça bouge.
import * as THREE from "three";

const METAL = {
  steel: 0xd6d9de, platinum: 0xe4e6e9, whitegold: 0xe4e6e9, gold: 0xe2b85a, everose: 0xe0a585,
  leather: 0x5a341d, rubber: 0x18191b,
};

function studio(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x2a2c30, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, ry, rx, lum) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(lum), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); env.add(m);
  };
  panel(4, 14, -7, 0, 3, Math.PI / 2.6, 0, 5);
  panel(2, 14, 7, 0, 2, -Math.PI / 2.2, 0, 3.6);
  panel(12, 5, 0, 9, 0, 0, Math.PI / 2, 2.6);
  panel(8, 3, 0, -1, 9, Math.PI, 0, 1.3);
  panel(3, 10, 0, 0, -9, 0, 0, 2.4);
  const pm = new THREE.PMREMGenerator(renderer);
  const t = pm.fromScene(env, .03).texture; pm.dispose(); return t;
}

// Le cadran (avec lunette et aiguilles) : rendu du dessin SVG dans une texture
function faceTexture(svg, size = 1024) {
  return new Promise(ok => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = size;
      const g = c.getContext("2d");
      g.save(); g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.clip();
      g.drawImage(img, 0, 0, size, size); g.restore();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; ok(t);
    };
    img.onerror = () => ok(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

function metalMat(key, rough = .2) {
  return new THREE.MeshPhysicalMaterial({ color: METAL[key] ?? METAL.steel, metalness: 1, roughness: rough, clearcoat: .3, clearcoatRoughness: .2, envMapIntensity: 1.15 });
}

function buildWatch(skin, face) {
  const ms = window.metalSet ? window.metalSet(skin.metal) : { kase: "steel", bezel: "steel", center: "steel" };
  const g = new THREE.Group();
  const kase = metalMat(ms.kase, .22), bezel = metalMat(ms.bezel, .16), center = metalMat(ms.center, .12);

  // boîtier (profil tourné : flanc arrondi) + face
  const prof = [[0, -.26], [1.2, -.26], [1.3, -.2], [1.32, .05], [1.3, .16], [1.26, .2], [0, .2]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), kase); body.rotation.x = Math.PI / 2; g.add(body);
  // lunette en relief
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, .085, 24, 128), bezel); ring.position.z = .2; g.add(ring);
  // cadran + lunette dessinés
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 128), new THREE.MeshPhysicalMaterial({ map: face, roughness: .35, metalness: .1, clearcoat: 1, clearcoatRoughness: .05 }));
  disc.position.z = .215; g.add(disc);
  // verre saphir bombé
  const glass = new THREE.Mesh(new THREE.SphereGeometry(3.2, 64, 16, 0, Math.PI * 2, 0, .36), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0, thickness: .05, transparent: true, opacity: .18, envMapIntensity: 1.4, clearcoat: 1 }));
  glass.rotation.x = Math.PI / 2; glass.position.z = .215 - 3.2 * Math.cos(.36) + .03; g.add(glass);
  // couronne
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .22, 24), metalMat(ms.bezel === "gold" ? "gold" : ms.kase, .25));
  crown.rotation.z = Math.PI / 2; crown.position.set(1.42, 0, -.02); g.add(crown);
  // cornes
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(.32, .62, .34), kase);
    lug.position.set(sx * .62, sy * 1.28, -.03); lug.rotation.z = sx * sy * -.12; g.add(lug);
  }
  // bracelet : maillons le long d'une boucle qui passe derrière le boîtier (comme portée au poignet)
  const strap = skin.bracelet;
  const R = 2.25, cz = -1.95, a0 = Math.asin(1.5 / R), n = 34;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (Math.PI * 2 - 2 * a0) * i / n;          // de la corne du haut, par l'arrière, à la corne du bas
    const y = R * Math.sin(a), z = cz + R * Math.cos(a);
    const link = new THREE.Group();
    if (strap === "rubber" || strap === "leather") {
      link.add(new THREE.Mesh(new THREE.BoxGeometry(1.08, .44, .16), new THREE.MeshPhysicalMaterial({ color: METAL[strap], roughness: strap === "rubber" ? .55 : .7, metalness: 0, clearcoat: strap === "rubber" ? .3 : 0 })));
    } else {
      const cols = strap === "jubilee" ? [[-.42, .3, kase], [-.17, .18, center], [0, .14, center], [.17, .18, center], [.42, .3, kase]] : [[-.36, .38, kase], [0, .34, ms.center !== ms.kase || strap === "president" ? center : kase], [.36, .38, kase]];
      for (const [x, w, mat] of cols) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, .4, .14), mat); b.position.x = x; link.add(b); }
    }
    link.position.set(0, y, z); link.rotation.x = -a; g.add(link);   // le maillon suit la courbe du bracelet
  }
  return g;
}

export async function mountWatch3D(canvas, skin, { svg, scrollEl = window, drag = true } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }); }
  catch (e) { return null; }
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene(); scene.environment = studio(renderer);
  scene.add(new THREE.AmbientLight(0xffffff, .35));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-3, 4, 6); scene.add(key);
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 60); camera.position.set(0, 0, 11);

  const face = await faceTexture(svg);
  const watch = buildWatch(skin, face); scene.add(watch);
  watch.rotation.set(-.35, -.5, .12);

  let tx = -.35, ty = -.5, dragX = 0, dragY = 0, dirty = true, raf = 0, alive = true, idle = 0;
  const scrollY = () => scrollEl === window ? window.scrollY : scrollEl.scrollTop;
  const target = () => {
    const y = scrollY();
    ty = -.5 + y * .0045 + dragX + idle; tx = -.35 + Math.sin(y * .003) * .25 + dragY;
  };
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.position.z = w / h < .8 ? 16.5 : 12.5; camera.updateProjectionMatrix(); dirty = true; kick();
  };
  const loop = () => {
    raf = 0; if (!alive) return;
    target();
    const dx = tx - watch.rotation.x, dy = ty - watch.rotation.y;
    watch.rotation.x += dx * .12; watch.rotation.y += dy * .12;
    if (Math.abs(dx) + Math.abs(dy) > .0005 || dirty) { renderer.render(scene, camera); dirty = false; kick(); }
  };
  const kick = () => { if (!raf && alive) raf = requestAnimationFrame(loop); };
  const calm = () => document.documentElement.classList.contains("calm") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  // légère rotation quand rien ne bouge
  const idleT = setInterval(() => { if (!calm() && !document.hidden && canvas.isConnected) { idle += .004; kick(); } }, 40);
  scrollEl.addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", resize);
  if (drag) {
    let p0 = null;
    canvas.addEventListener("pointerdown", e => { p0 = { x: e.clientX, y: e.clientY, dx: dragX, dy: dragY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", e => { if (!p0) return; dragX = p0.dx + (e.clientX - p0.x) * .01; dragY = Math.max(-.9, Math.min(.9, p0.dy + (e.clientY - p0.y) * .006)); kick(); });
    const up = () => { p0 = null; }; canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  }
  resize(); kick();
  return { dispose() { alive = false; clearInterval(idleT); scrollEl.removeEventListener("scroll", kick); removeEventListener("resize", resize); renderer.dispose(); } };
}
