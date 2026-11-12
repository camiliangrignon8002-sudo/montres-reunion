// Une seule canette en 3D (Three.js) : étiquette 360° préparée à l'avance (face + vrai dos).
// Rendu uniquement quand quelque chose change, pour rester léger.
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js"; // seulement hors mode léger

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

export async function create({ canvas, lite = false, onChange = null }){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite && (devicePixelRatio || 1) < 2, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = lite ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  if (!lite){ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); }
  const camera = new THREE.PerspectiveCamera(26, 1, .1, 50); camera.position.set(0, 0, 10);
  const amb = new THREE.AmbientLight(0xffffff, lite ? .9 : .4); scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-2.5, 3, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(3, 1, -2); scene.add(rim);

  const SEG = lite ? 40 : 72;
  const label = lite ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .25, roughness: .4, envMapIntensity: .7 });
  const silver = lite ? new THREE.MeshLambertMaterial({ color: 0xc9ccd1 }) : new THREE.MeshStandardMaterial({ color: 0xd6d9de, metalness: 1, roughness: .24, envMapIntensity: 1.1 });
  const lid = lite ? new THREE.MeshLambertMaterial({ map: lidTexture() }) : new THREE.MeshStandardMaterial({ map: lidTexture(), metalness: .9, roughness: .3 });
  const can = new THREE.Group(), spin = new THREE.Group(); can.add(spin); scene.add(can);
  const parts = {};
  function build(r){
    for (const m of Object.values(parts)){ spin.remove(m); m.geometry.dispose(); }
    parts.body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, SEG, 1, true), label);
    parts.neck = new THREE.Mesh(new THREE.CylinderGeometry(r*.86, r, .075, SEG, 1, true), silver); parts.neck.position.y = .5375;
    parts.rim = new THREE.Mesh(new THREE.TorusGeometry(r*.86, r*.055, 8, SEG), silver); parts.rim.rotation.x = Math.PI/2; parts.rim.position.y = .575;
    parts.top = new THREE.Mesh(new THREE.CircleGeometry(r*.86, SEG), lid); parts.top.rotation.x = -Math.PI/2; parts.top.position.y = .57;
    parts.foot = new THREE.Mesh(new THREE.CylinderGeometry(r, r*.82, .05, SEG, 1, true), silver); parts.foot.position.y = -.525;
    parts.base = new THREE.Mesh(new THREE.CircleGeometry(r*.82, SEG), silver); parts.base.rotation.x = Math.PI/2; parts.base.position.y = -.55;
    for (const m of Object.values(parts)) spin.add(m);
  }
  build(.21);

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
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lite ? 1 : 1.5));
    renderer.setSize(W, H, false);
    camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix();
    dirty = true;
  }
  resize();

  const VH = 2 * 10 * Math.tan(13 * Math.PI/180); // hauteur visible
  let last = "";
  // s = { ang (°), tilt (°), x, y (fraction d'écran), h (fraction de la hauteur), tx, ty, focus }
  function update(s){
    const sig = [s.ang, s.tilt, s.x, s.y, s.h, s.tx, s.ty, s.focus, W, H].map(v => (+v).toFixed(3)).join("|");
    if (!dirty && sig === last) return;
    last = sig; dirty = false;
    const sc = s.h * VH;
    can.scale.setScalar(sc);
    can.position.set(s.x * VH * camera.aspect, -s.y * VH, 0);
    can.rotation.set(s.ty * .1, 0, -s.tilt * Math.PI/180);
    spin.rotation.y = -Math.PI/2 + s.ang * Math.PI/180 + s.tx * .3;
    const fo = s.focus || 0;
    key.intensity = 1.5 + fo * .6; amb.intensity = .4 - fo * .15; rim.intensity = 1.2 - fo * .5;
    renderer.render(scene, camera);
  }
  return { set, update, resize, setLite(v){ lite = v; resize(); } };
}
