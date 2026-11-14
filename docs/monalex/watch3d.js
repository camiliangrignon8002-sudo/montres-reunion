// Monalex — montre en 3D (Three.js), version légère et fluide :
// - bracelet en « instances » (2 à 3 dessins au lieu de ~150), verre simple sans effet de transmission ;
// - rendu seulement quand on fait défiler ou qu'on tourne la montre, jamais en continu ;
// - rien n'est calculé quand la montre n'est pas à l'écran ; tout est libéré quand elle disparaît.
import * as THREE from "three";

const METAL = { steel: 0xd6d9de, platinum: 0xe4e6e9, whitegold: 0xe4e6e9, gold: 0xe2b85a, everose: 0xe0a585, leather: 0x5a341d, rubber: 0x18191b };

function studio(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 16, 8), new THREE.MeshBasicMaterial({ color: 0x2a2c30, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, ry, rx, lum) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(lum), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); env.add(m);
  };
  panel(4, 14, -7, 0, 3, Math.PI / 2.6, 0, 5);
  panel(2, 14, 7, 0, 2, -Math.PI / 2.2, 0, 3.6);
  panel(12, 5, 0, 9, 0, 0, Math.PI / 2, 2.6);
  panel(8, 3, 0, -1, 9, Math.PI, 0, 1.3);
  const pm = new THREE.PMREMGenerator(renderer);
  const t = pm.fromScene(env, .03).texture; pm.dispose(); return t;
}

function faceTexture(svg, size) {
  return new Promise(ok => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = size;
      const g = c.getContext("2d");
      g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.clip();
      g.drawImage(img, 0, 0, size, size);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; ok(t);
    };
    img.onerror = () => ok(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

const metalMat = (key, rough = .2) => new THREE.MeshStandardMaterial({ color: METAL[key] ?? METAL.steel, metalness: 1, roughness: rough, envMapIntensity: 1.15 });

function buildWatch(skin, face) {
  const ms = window.metalSet ? window.metalSet(skin.metal) : { kase: "steel", bezel: "steel", center: "steel" };
  const g = new THREE.Group();
  const kase = metalMat(ms.kase, .22), bezel = metalMat(ms.bezel, .16), center = metalMat(ms.center, .12);
  const prof = [[0, -.26], [1.2, -.26], [1.3, -.2], [1.32, .05], [1.3, .16], [1.26, .2], [0, .2]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), kase); body.rotation.x = Math.PI / 2; g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, .085, 12, 64), bezel); ring.position.z = .2; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 64), new THREE.MeshStandardMaterial({ map: face, roughness: .3, metalness: .1 }));
  disc.position.z = .215; g.add(disc);
  // verre : simple reflet transparent (l'effet « transmission » doublait le coût du rendu)
  const glass = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 8, 0, Math.PI * 2, 0, .36), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .1, roughness: 0, metalness: 1, depthWrite: false }));
  glass.rotation.x = Math.PI / 2; glass.position.z = .215 - 3.2 * Math.cos(.36) + .03; g.add(glass);
  const crownMat = metalMat(ms.bezel === "gold" ? "gold" : ms.kase, .25);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .22, 16), crownMat);
  crown.rotation.z = Math.PI / 2; crown.position.set(1.42, 0, -.02); g.add(crown);
  if (skin.type === "daytona") {   // poussoirs du chronographe, à 2 h et 4 h, avec leurs protections vissées
    for (const ang of [Math.PI / 6, -Math.PI / 6]) {
      const pp = new THREE.Group(); pp.rotation.z = ang;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .14, 16), crownMat); tube.rotation.z = Math.PI / 2; tube.position.set(1.36, 0, -.02);
      const tete = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .12, 16), crownMat); tete.rotation.z = Math.PI / 2; tete.position.set(1.48, 0, -.02);
      pp.add(tube, tete); g.add(pp);
    }
  }
  const lugGeo = new THREE.BoxGeometry(.32, .62, .34);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const lug = new THREE.Mesh(lugGeo, kase); lug.position.set(sx * .62, sy * 1.28, -.03); lug.rotation.z = sx * sy * -.12; g.add(lug);
  }
  // bracelet : chaque colonne de maillons = une seule « instance » dessinée en une fois
  const strap = skin.bracelet, R = 2.25, cz = -1.95, a0 = Math.asin(1.5 / R), n = 34;
  const cols = strap === "rubber" || strap === "leather"
    ? [[0, 1.08, new THREE.MeshStandardMaterial({ color: METAL[strap], roughness: strap === "rubber" ? .55 : .75, metalness: 0 })]]
    : strap === "jubilee" ? [[-.42, .3, kase], [-.17, .18, center], [0, .14, center], [.17, .18, center], [.42, .3, kase]]
    : [[-.36, .38, kase], [0, .34, ms.center !== ms.kase || strap === "president" ? center : kase], [.36, .38, kase]];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  for (const [x, w, mat] of cols) {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(w, .4, strap === "rubber" || strap === "leather" ? .16 : .14), mat, n + 1);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (Math.PI * 2 - 2 * a0) * i / n;
      pos.set(x, R * Math.sin(a), cz + R * Math.cos(a)); q.setFromEuler(e.set(-a, 0, 0));
      inst.setMatrixAt(i, m4.compose(pos, q, one));
    }
    g.add(inst);
  }
  return g;
}

// Vrai modèle 3D : models/daytona.glb, s'il existe. Il est centré et mis à l'échelle tout seul.
async function vraiModele(url) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    if (!r.ok) return null;
    const { GLTFLoader } = await import("./vendor/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(url);
    const obj = gltf.scene, box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    obj.position.sub(c);
    const g = new THREE.Group(); g.add(obj); g.scale.setScalar(4.6 / Math.max(size.x, size.y, size.z));
    return g;
  } catch (e) { return null; }
}

// Vraie photo de montre détourée : le fond uni (pris dans les coins) devient transparent, la montre est recadrée.
function photoDetouree(url) {
  return new Promise((ok, ko) => {
    const img = new Image(); img.crossOrigin = "anonymous"; img.decoding = "async";
    img.onload = () => {
      const W = Math.min(1100, img.naturalWidth), H = Math.round(W * img.naturalHeight / img.naturalWidth);
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
      let d; try { d = g.getImageData(0, 0, W, H); } catch (e) { ko(e); return; }
      const px = d.data, coin = (x, y) => { const i = (y * W + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
      const cs = [coin(2, 2), coin(W - 3, 2), coin(2, H - 3), coin(W - 3, H - 3)];
      const fond = [0, 1, 2].map(k => cs.reduce((a, c) => a + c[k], 0) / 4);
      const uni = cs.every(c => Math.abs(c[0] - fond[0]) + Math.abs(c[1] - fond[1]) + Math.abs(c[2] - fond[2]) < 40);
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const dist = Math.abs(px[i] - fond[0]) + Math.abs(px[i + 1] - fond[1]) + Math.abs(px[i + 2] - fond[2]);
        const a = uni ? Math.max(0, Math.min(255, (dist - 18) * 6)) : 255;
        px[i + 3] = a;
        if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      g.putImageData(d, 0, 0);
      if (x1 <= x0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = document.createElement("canvas"); out.width = cw; out.height = ch;
      out.getContext("2d").drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
      const t = new THREE.CanvasTexture(out); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      ok({ t, ratio: cw / ch });
    };
    img.onerror = ko;
    img.src = url;
  });
}
function photoWatch({ t, ratio }) {
  const g = new THREE.Group(), h = 4.6, w = h * ratio;
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: .08, roughness: .35, metalness: .25, side: THREE.DoubleSide });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); g.add(face);
  // reflet qui glisse sur la montre quand elle tourne
  const reflet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ alphaMap: t, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  reflet.position.z = .01; g.add(reflet); g.userData.reflet = reflet; g.userData.photo = true;
  return g;
}

export async function mountWatch3D(canvas, skin, { svg, scrollEl = window, drag = true, actif = () => true, modele = "", photo = "" } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 1.5, alpha: true, powerPreference: "default" }); }
  catch (e) { return null; }
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene(); scene.environment = studio(renderer);
  scene.add(new THREE.AmbientLight(0xffffff, .35));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-3, 4, 6); scene.add(key);
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 60); camera.position.set(0, 0, 12);

  let watch = modele && await vraiModele(modele);
  if (!watch && photo) { try { watch = photoWatch(await photoDetouree(photo)); } catch (e) { watch = null; } }
  if (!watch) watch = buildWatch(skin, await faceTexture(svg, dpr > 1.2 ? 1024 : 768));
  scene.add(watch);
  const estPhoto = !!watch.userData.photo;
  let rx = -.35, ry = -.5, tx = rx, ty = ry, dragX = 0, dragY = 0, raf = 0, visible = true, mort = false;
  watch.rotation.set(rx, ry, .12);
  const scrollY = () => scrollEl === window ? window.scrollY : scrollEl.scrollTop;
  const draw = () => renderer.render(scene, camera);
  let tPrec = 0, spin = 0;
  const calme = () => document.documentElement.classList.contains("calm") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loop = (t) => {
    raf = 0;
    if (mort) return;
    if (!canvas.isConnected) { dispose(); return; }
    if (!visible || !actif() || document.hidden) { tPrec = 0; return; }
    const dt = tPrec ? Math.min(.05, (t - tPrec) / 1000) : 0; tPrec = t;
    if (!calme()) spin += dt * 1.1;                              // tour complet en ~6 s, indépendant de la vitesse de l'écran
    const y = scrollY();
    if (estPhoto) {
      const ang = spin * 1.6 + y * .009 + dragX;
      ty = Math.sin(ang) * .62; tx = Math.sin(ang * .5) * .12 + dragY * .5;
      watch.userData.reflet.material.opacity = Math.max(0, Math.sin(ang)) * .22;
    } else { ty = -.5 + spin + y * .009 + dragX; tx = -.35 + Math.sin(y * .006) * .25 + dragY; }   // deux fois plus réactif au défilement
    const k = 1 - Math.pow(.0005, dt || .016);                  // lissage calé sur le temps réel
    rx += (tx - rx) * k; ry += (ty - ry) * k;
    watch.rotation.x = rx; watch.rotation.y = ry; if (estPhoto) watch.rotation.z = 0;
    draw();
    if (!calme() || Math.abs(tx - rx) + Math.abs(ty - ry) > .001) raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && !mort) raf = requestAnimationFrame(loop); };
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.position.z = w / h < .8 ? 16.5 : 12.5; camera.updateProjectionMatrix(); draw();
  };
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); });
  document.addEventListener("visibilitychange", kick);
  io.observe(canvas);
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  scrollEl.addEventListener("scroll", kick, { passive: true });
  if (drag) {
    let p0 = null;
    canvas.addEventListener("pointerdown", e => { p0 = { x: e.clientX, y: e.clientY, dx: dragX, dy: dragY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", e => { if (!p0) return; dragX = p0.dx + (e.clientX - p0.x) * .01; dragY = Math.max(-.9, Math.min(.9, p0.dy + (e.clientY - p0.y) * .006)); kick(); });
    const up = () => { p0 = null; }; canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  }
  function dispose() {
    if (mort) return; mort = true;
    io.disconnect(); ro.disconnect(); scrollEl.removeEventListener("scroll", kick);
    scene.traverse(o => { o.geometry?.dispose?.(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m?.map?.dispose?.(); m?.dispose?.(); }); });
    scene.environment?.dispose?.(); renderer.dispose();
  }
  resize(); kick();
  return { dispose, kick };
}
