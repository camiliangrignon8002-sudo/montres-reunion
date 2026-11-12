// Canettes en 3D (Three.js) : carrousel et canette principale, toutes en vraie 3D.
// Étiquettes 360° préparées à l'avance (face + vrai dos). Formes partagées, rendu seulement quand ça bouge.
import * as THREE from "three";

const TAU = Math.PI * 2;

function canvasTex(size, draw){
  const c = document.createElement("canvas"); c.width = c.height = size; draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const lidTex = () => canvasTex(256, (g) => {
  const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, "#d9dce1"); rg.addColorStop(.6, "#c3c7cd"); rg.addColorStop(.7, "#f4f5f7"); rg.addColorStop(.78, "#8d9299"); rg.addColorStop(.88, "#e9ebee"); rg.addColorStop(1, "#7c8188");
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 86, 0, TAU); g.stroke();
  g.fillStyle = "#b9bdc3"; g.strokeStyle = "#7f848b"; g.lineWidth = 3;
  g.beginPath(); g.ellipse(128, 112, 30, 46, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = "#6f747b"; g.beginPath(); g.ellipse(128, 94, 14, 13, 0, 0, TAU); g.fill();
  g.fillStyle = "#9aa0a7"; g.beginPath(); g.arc(128, 150, 7, 0, TAU); g.fill();
});
// anneaux de l'aluminium (épaule, rebord, fond) : alternance clair / foncé le long du profil
const ringTex = (stops) => { const t = canvasTex(256, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 256);
  for (const [v, c] of stops) gr.addColorStop(v, c);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  // fines stries de brossage
  for (let y = 0; y < 256; y += 2){ g.fillStyle = `rgba(${Math.random() < .5 ? "255,255,255" : "0,0,0"},${(Math.random()*.05).toFixed(3)})`; g.fillRect(0, y, 256, 1); }
}); return t; };
const shadowTex = () => { const t = canvasTex(128, (g) => {
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(0,0,0,.75)"); rg.addColorStop(.45, "rgba(0,0,0,.4)"); rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
}); t.colorSpace = THREE.NoColorSpace; return t; };

export async function create({ canvas, lite = false, mid = false, onChange = null, pool = 7 }){
  const hi = !lite && !mid;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: hi, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  // studio photo : fond sombre + panneaux lumineux en bandes -> reflets métalliques contrastés
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0b0c10, side: THREE.BackSide })));
    const panel = (w, h, x, y, z, ry, rx, lum, tint) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint || 0xffffff).multiplyScalar(lum), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); env.add(m);
    };
    panel(3, 14, -7, 0, 3, Math.PI/2.6, 0, 5);        // grande bande à gauche
    panel(.7, 14, -2.2, 0, 8, Math.PI*.95, 0, 6);    // reflet vertical fin sur l'étiquette
    panel(1.4, 14, 7, 0, 1, -Math.PI/2.2, 0, 3.5);    // bande fine à droite
    panel(10, 4, 0, 9, 0, 0, Math.PI/2, 2.2);         // plafond doux
    panel(6, 2, 0, -2, 9, Math.PI, 0, .9);            // rappel de face, faible
    panel(2, 10, 0, 0, -9, 0, 0, 2.5);                // contre-jour
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, .02).texture; pm.dispose();
  }
  const camera = new THREE.PerspectiveCamera(26, 1, .1, 60); camera.position.set(0, 0, 10);
  const amb = new THREE.AmbientLight(0xffffff, .22); scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(-3, 3.5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(4, 1.5, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffffff, 1.3); rim2.position.set(-4.5, .5, -2.5); scene.add(rim2);   // second liseré sur le bord gauche
  const tint = new THREE.PointLight(0xffffff, 0, 8, 1.6); tint.position.set(1.8, -1, 2.5); scene.add(tint);

  // formes partagées (rayon de base .21 ; chaque canette est mise à l'échelle selon ses proportions)
  const SEG = hi ? 72 : 44, r = .21;
  const V = pts => pts.map(([x, y]) => new THREE.Vector2(x * r, y));
  const G = {
    body: new THREE.CylinderGeometry(r, r, 1, SEG, 1, true),
    top: new THREE.LatheGeometry(V([[1,.5],[.993,.504],[.975,.508],[.948,.512],[.92,.515],[.898,.517],[.884,.519],[.88,.521],[.886,.523],[.892,.525],[.888,.527],[.874,.528],[.862,.527],[.858,.524],[.856,.522],[.7,.5215],[0,.522]]), SEG),
    bot: new THREE.LatheGeometry(V([[0,-.512],[.45,-.516],[.66,-.524],[.76,-.532],[.8,-.536],[.85,-.536],[.91,-.53],[.955,-.521],[.985,-.511],[.998,-.505],[1,-.5]]), SEG),
    lid: new THREE.CircleGeometry(r * .858, SEG),
    cap: new THREE.CircleGeometry(r * .99, SEG),
    shadow: new THREE.PlaneGeometry(1, 1),
  };
  const LID = lidTex(), SHADOW = shadowTex();
  // v = 0 au bord du corps, 1 au centre (haut) ; profil du bas : v = 0 au centre, 1 au bord
  const TOPR = ringTex([[0,"#b9bdc3"],[.15,"#8a8f96"],[.35,"#cfd2d6"],[.5,"#7a7f86"],[.6,"#d8dbdf"],[.7,"#6f747b"],[.85,"#a3a8ae"],[1,"#8e939a"]]);
  const BOTR = ringTex([[0,"#9ea3aa"],[.35,"#c9ccd1"],[.55,"#7f848b"],[.62,"#eceef1"],[.7,"#8b9097"],[.82,"#d8dbdf"],[.92,"#7a7f86"],[1,"#c4c8cd"]]);
  const mkLabel = () => hi
    ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: .3, roughness: .34, clearcoat: .7, clearcoatRoughness: .14, envMapIntensity: 1.05, transparent: false })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .3, roughness: .36, envMapIntensity: .85, transparent: false });
  const mkSilver = () => false
    ? new THREE.MeshPhysicalMaterial({ color: 0x9a9fa6, metalness: 1, roughness: .22, anisotropy: .5, anisotropyRotation: Math.PI/2, envMapIntensity: 1, side: THREE.DoubleSide, transparent: true })
    : new THREE.MeshStandardMaterial({ color: 0xe4e7eb, metalness: .9, roughness: .3, envMapIntensity: 1.45, side: THREE.DoubleSide, transparent: false });

  const marker = new THREE.Object3D();
  const cans = [];
  for (let i = 0; i < pool; i++){
    const group = new THREE.Group(), spin = new THREE.Group(); group.add(spin);
    const label = mkLabel(), silver = mkSilver(), silverB = mkSilver(); silver.map = TOPR; silverB.map = BOTR;
    const lid = new THREE.MeshStandardMaterial({ map: LID, color: 0xc4c8ce, metalness: .95, roughness: .3, envMapIntensity: 1, transparent: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    spin.add(new THREE.Mesh(G.body, label), new THREE.Mesh(G.top, silver), new THREE.Mesh(G.bot, silverB));
    const l = new THREE.Mesh(G.lid, lid); l.rotation.x = -Math.PI/2; l.position.y = .5215; spin.add(l);
    const cap = new THREE.Mesh(G.cap, silverB); cap.rotation.x = Math.PI/2; cap.position.y = -.5; spin.add(cap);
    const sh = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ map: SHADOW, transparent: true, depthWrite: false, opacity: .5 }));
    sh.rotation.x = -Math.PI/2; sh.position.y = -.56; sh.scale.set(.8, .8, 1); sh.renderOrder = -1;
    group.add(sh); scene.add(group); group.visible = false;
    cans.push({ group, spin, label, mats: [label, silver, silverB, lid], sh, url: null });
  }

  const cache = new Map(), ready = new Map(), loader = new THREE.TextureLoader();
  function load(url){
    if (!cache.has(url)) cache.set(url, new Promise(res => loader.load(url, t => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.wrapS = THREE.RepeatWrapping;
      renderer.initTexture(t); ready.set(url, t); res(t); last = "";
      for (const c of cans) if (!c.label.map){ c.label.map = t; c.label.needsUpdate = true; }   // compile une seule fois
      if (onChange) onChange();
    }, undefined, () => res(null))));
    return cache.get(url);
  }
  function preload(urls){ (function next(i){ if (i >= urls.length) return; load(urls[i]).then(() => setTimeout(() => next(i + 1), 60)); })(0); }

  let W = 0, H = 0, last = "", prOverride = 0;
  function resize(){
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setPixelRatio(prOverride || Math.min(devicePixelRatio || 1, lite ? 1 : mid ? 1.15 : 1.5));
    renderer.setSize(W, H, false);
    camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix(); last = "";
  }
  resize();

  const VH = 2 * 10 * Math.tan(13 * Math.PI/180);
  const wp = new THREE.Vector3(), nrm = new THREE.Vector3(), q = new THREE.Quaternion(), col = new THREE.Color();
  const out = { x: 0, y: 0, face: 0 };
  // items : [{ url, ratio, x, y, h, tilt, ang, alpha, main }]  (x, y : fractions de l'écran depuis le centre ; h : fraction de la hauteur)
  // o : { p, focus, zone, accent }
  function draw(items, o = {}){
    const sig = items.map(it => [it.url, it.x, it.y, it.h, it.tilt, it.ang, it.alpha].map(v => typeof v === "number" ? v.toFixed(4) : v).join(",")).join("|") + "|" + [o.p, o.focus, o.zone, W, H].map(v => (+v || 0).toFixed(3)).join(",") + (o.accent || "");
    if (sig === last) return out;
    last = sig;
    let mainCan = null;
    // chaque canette garde la même étiquette pendant tout son trajet (aucune recompilation en plein mouvement)
    const want = new Set(items.filter(it => it.alpha > .005 && ready.get(it.url)).map(it => it.url));
    for (const c of cans) if (c.url && !want.has(c.url)) { c.url = null; c.group.visible = false; }
    for (const it of items){
      const t = ready.get(it.url);
      if (!t){ load(it.url); continue; }
      if (it.alpha <= .005) continue;
      let c = cans.find(c => c.url === it.url);
      if (!c){ c = cans.find(c => !c.url); if (!c) continue; const first = !c.label.map; c.label.map = t; if (first) c.label.needsUpdate = true; c.url = it.url; }
      c.group.visible = true;
      const k = (it.ratio || .21) / .21;
      c.spin.scale.set(k, 1, k);
      c.group.scale.setScalar(it.h * VH);
      c.group.position.set(it.x * VH * camera.aspect, -it.y * VH, -.6 * (it.depth ?? (it.main ? 0 : 1)));
      c.group.rotation.set(.09, 0, -it.tilt * Math.PI/180);   // vue légèrement plongeante : on voit le couvercle
      c.spin.rotation.y = -Math.PI/2 + it.ang * Math.PI/180;
      const tr = it.alpha < .999;
      for (const m of c.mats){ m.opacity = it.alpha; if (m.transparent !== tr){ m.transparent = tr; m.depthWrite = true; m.needsUpdate = true; } }
      c.sh.material.opacity = .45 * it.alpha * (it.shadow ?? 1);
      if (it.main) mainCan = c;
    }
    const sw = Math.sin((o.p || 0) * Math.PI * 3);
    key.position.set(-3 + sw * 5, 3.5, 6); rim.position.set(4 - sw * 2, 1.5, -3);
    const fo = o.focus || 0;
    key.intensity = 1.7 - fo * .15; rim.intensity = 1.6 - fo * .3;
    if (o.accent){ col.set(o.accent); tint.color.copy(col); }
    if (mainCan){ tint.position.set(mainCan.group.position.x + 1.6, mainCan.group.position.y - .6, 2.4); tint.intensity = 1.5; }
    renderer.render(scene, camera);
    if (mainCan){
      mainCan.spin.add(marker); marker.position.set(0, .5 - (o.zone ?? .5), 0);   // sur l'axe : la lumière reste centrée sur la canette
      mainCan.group.updateMatrixWorld(true); marker.getWorldPosition(wp);
      nrm.set(-1, 0, 0).applyQuaternion(mainCan.spin.getWorldQuaternion(q)); out.face = Math.max(0, nrm.z);
      wp.project(camera); out.x = (wp.x + 1) / 2 * W; out.y = (1 - wp.y) / 2 * H;
    }
    return out;
  }
  const isReady = url => ready.has(url);
  function setPixelRatio(v){ prOverride = v; resize(); }
  return { draw, preload, load, isReady, resize, setPixelRatio };
}
