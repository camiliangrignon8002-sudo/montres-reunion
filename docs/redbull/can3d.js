// Une seule canette en 3D (Three.js) : étiquette 360° préparée à l'avance (face + vrai dos).
// Rendu uniquement quand quelque chose change, pour rester léger.
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const TAU = Math.PI * 2;

function lidTexture(){
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, "#d9dce1"); rg.addColorStop(.62, "#c3c7cd"); rg.addColorStop(.7, "#f4f5f7"); rg.addColorStop(.77, "#8d9299"); rg.addColorStop(.87, "#e9ebee"); rg.addColorStop(1, "#7c8188");
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#b9bdc3"; g.strokeStyle = "#7f848b"; g.lineWidth = 3;
  g.beginPath(); g.ellipse(128, 118, 30, 46, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = "#6f747b"; g.beginPath(); g.ellipse(128, 100, 14, 13, 0, 0, TAU); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function create({ canvas, lite = false, mid = false, onChange = null }){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mid && !lite, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); }
  const camera = new THREE.PerspectiveCamera(26, 1, .1, 50); camera.position.set(0, 0, 10);
  const amb = new THREE.AmbientLight(0xffffff, .25); scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-2.5, 3, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(3, 1, -2); scene.add(rim);

  const SEG = lite || mid ? 40 : 96;
  // étiquette : vernis brillant (clearcoat) sur l'impression ; métal brossé pour le haut et le bas
  const label = (lite || mid)
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .3, roughness: .38, envMapIntensity: .8 })
    : new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: .35, roughness: .32, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: .85 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xdfe2e6, metalness: 1, roughness: .26, envMapIntensity: 1.15, side: THREE.DoubleSide });
  const lid = new THREE.MeshStandardMaterial({ map: lidTexture(), metalness: .95, roughness: .32, envMapIntensity: 1.1, polygonOffset: true, polygonOffsetFactor: -1 });
  const can = new THREE.Group(), spin = new THREE.Group(); can.add(spin); scene.add(can);
  const marker = new THREE.Object3D(); spin.add(marker);      // centre de la zone d'info sur le dos
  const parts = {};
  function build(r){
    for (const m of Object.values(parts)){ spin.remove(m); m.geometry.dispose(); }
    // corps imprimé
    parts.body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, SEG, 1, true), label);
    // haut : épaule arrondie, goulot, rebord roulé, couvercle en creux
    const top = [[r,.5],[r*.996,.507],[r*.983,.514],[r*.958,.522],[r*.925,.53],[r*.89,.537],[r*.862,.543],[r*.85,.547],[r*.852,.551],[r*.866,.554],[r*.876,.557],[r*.87,.561],[r*.85,.562],[r*.83,.558],[r*.82,.551],[r*.64,.549],[0,.55]];
    parts.top = new THREE.Mesh(new THREE.LatheGeometry(top.map(([x,y]) => new THREE.Vector2(x,y)), SEG), silver);
    // bas : arrondi, anneau d'appui, fond bombé
    const bot = [[0,-.512],[r*.45,-.516],[r*.66,-.524],[r*.76,-.532],[r*.8,-.536],[r*.85,-.536],[r*.91,-.53],[r*.955,-.521],[r*.985,-.511],[r*.998,-.505],[r,-.5]];
    parts.bot = new THREE.Mesh(new THREE.LatheGeometry(bot.map(([x,y]) => new THREE.Vector2(x,y)), SEG), silver);
    parts.lid = new THREE.Mesh(new THREE.CircleGeometry(r*.82, SEG), lid); parts.lid.rotation.x = -Math.PI/2; parts.lid.position.y = .5495;
    for (const m of Object.values(parts)) spin.add(m);
    marker.position.set(-r, 0, 0);
  }
  build(.21);
  // projecteur qui éclaire la zone d'info, et reflet qui balaie la canette
  const spot = new THREE.SpotLight(0xffffff, 0, 20, .2, .9, 1.4); spot.position.set(-1.5, 1.5, 8); scene.add(spot, spot.target);
  const cache = new Map(), loader = new THREE.TextureLoader();
  function load(url){
    if (!cache.has(url)) cache.set(url, new Promise(res => loader.load(url, t => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.wrapS = THREE.RepeatWrapping;
      renderer.initTexture(t); res(t);
    }, undefined, () => res(null))));
    return cache.get(url);
  }
  let token = 0, dirty = true;
  async function set(f, next){
    const my = ++token;
    const t = await load(f.label);
    if (my !== token) return;
    if (t){ label.map = t; label.needsUpdate = true; }
    build(f.ratio || .21);
    dirty = true; if (onChange) onChange();
    if (next) setTimeout(() => load(next.label), 400);   // précharge la suivante
  }

  let W = 0, H = 0;
  function resize(){
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lite ? 1 : mid ? 1.35 : 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix();
    dirty = true;
  }
  resize();

  const VH = 2 * 10 * Math.tan(13 * Math.PI/180); // hauteur visible
  let last = "", out = { x: 0, y: 0, face: 0 };
  const wp = new THREE.Vector3(), nrm = new THREE.Vector3();
  // s = { ang (°), tilt (°), x, y, h, p (progression), zone (fraction depuis le haut ou null), focus }
  function update(s){
    const sig = [s.ang, s.tilt, s.x, s.y, s.h, s.p, s.zone, s.focus, W, H].map(v => (+v || 0).toFixed(3)).join("|");
    if (dirty || sig !== last){
      last = sig; dirty = false;
      can.scale.setScalar(s.h * VH);
      can.position.set(s.x * VH * camera.aspect, -s.y * VH, 0);
      can.rotation.set(0, 0, -s.tilt * Math.PI/180);
      spin.rotation.y = -Math.PI/2 + s.ang * Math.PI/180;
      // reflet : la lumière principale glisse d'un côté à l'autre avec le défilement
      const sw = Math.sin((s.p || 0) * Math.PI * 3);
      key.position.set(-3 + sw * 5, 3, 6); rim.position.set(3.5 - sw * 2, 1, -2);
      const fo = s.focus || 0;
      key.intensity = 1.6 - fo * .15; rim.intensity = 1.4 - fo * .3; amb.intensity = .25;
      if (s.zone != null){ marker.position.y = .5 - s.zone; }
      can.updateMatrixWorld(true);
      marker.getWorldPosition(wp);
      spot.target.position.copy(wp); spot.position.set(wp.x - 1.2, wp.y + 1.6, 8);
      spot.intensity = 0;
      renderer.render(scene, camera);
      // position de la zone à l'écran, et à quel point elle est tournée vers nous
      nrm.set(-1, 0, 0).applyQuaternion(spin.getWorldQuaternion(new THREE.Quaternion()));
      out.face = Math.max(0, nrm.z);
      wp.project(camera); out.x = (wp.x + 1) / 2 * W; out.y = (1 - wp.y) / 2 * H;
    }
    return out;
  }
  function preload(urls){ (function next(i){ if (i >= urls.length) return; load(urls[i]).then(() => setTimeout(() => next(i + 1), 120)); })(0); }
  return { set, preload, update, resize, setLite(v){ lite = v; resize(); } };
}
