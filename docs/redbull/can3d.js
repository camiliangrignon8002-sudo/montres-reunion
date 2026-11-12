// Canettes en 3D (Three.js) : chaque photo de face devient l'étiquette d'un vrai cylindre.
// Le dos de la canette est généré avec les infos du goût, pour qu'on les voie quand elle tourne.
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
const lerp = (a, b, t) => a + (b - a)*t;
const FOV = 30, CAM_Z = 10;
const HW = 2 * CAM_Z * Math.tan(FOV/2 * Math.PI/180); // hauteur visible à z = 0

function loadImage(src){
  return new Promise((res, rej) => { const im = new Image(); im.decoding = "async"; im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

// Analyse la photo : où commence et finit le corps de la canette (hors goulot et fond)
function analyse(img){
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  const L = new Int32Array(height).fill(-1), R = new Int32Array(height).fill(-1);
  for (let y = 0; y < height; y++){
    for (let x = 0; x < width; x++){ if (data[(y*width + x)*4 + 3] > 128){ L[y] = x; break; } }
    for (let x = width - 1; x >= 0; x--){ if (data[(y*width + x)*4 + 3] > 128){ R[y] = x; break; } }
  }
  let maxW = 0; for (let y = 0; y < height; y++) if (L[y] >= 0) maxW = Math.max(maxW, R[y] - L[y]);
  let top = 0, bot = height - 1;
  while (top < height && !(L[top] >= 0 && R[top] - L[top] >= maxW*.965)) top++;
  while (bot > 0 && !(L[bot] >= 0 && R[bot] - L[bot] >= maxW*.965)) bot--;
  // marge pour éviter les bords arrondis
  const pad = Math.round((bot - top) * .012); top += pad; bot -= pad;
  const ls = [], rs = [];
  for (let y = top; y <= bot; y += 4){ ls.push(L[y]); rs.push(R[y]); }
  ls.sort((a,b)=>a-b); rs.sort((a,b)=>a-b);
  const left = ls[ls.length>>1], right = rs[rs.length>>1];
  return { canvas: c, top, bot, cx: (left + right)/2, r: (right - left)/2 };
}

function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x+r, y); g.arcTo(x+w, y, x+w, y+h, r); g.arcTo(x+w, y+h, x, y+h, r); g.arcTo(x, y+h, x, y, r); g.arcTo(x, y, x+w, y, r); g.closePath(); }

// Étiquette complète : face = photo « déroulée », dos = fiche du goût
function buildLabel(f, A, idx, total, maxAniso, W = 2048){
  const H = W/2;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const bh = A.bot - A.top;
  const aspect = (TAU * A.r / W) / (bh / H); // largeur réelle d'un texel / hauteur

  // --- dos
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, f.c1); grad.addColorStop(.5, f.c1); grad.addColorStop(1, shade(f.c1, -.18));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // fines bandes métalliques en haut et en bas
  const metal = (y, h) => { const m = g.createLinearGradient(0, y, 0, y + h); m.addColorStop(0, "#8f949c"); m.addColorStop(.5, "#eef0f3"); m.addColorStop(1, "#9aa0a8"); g.fillStyle = m; g.fillRect(0, y, W, h); };
  metal(0, H*.018); metal(H - H*.018, H*.018);

  const cx = W * .75; // centre du dos
  g.save(); g.translate(cx, 0); g.scale(H/1024/aspect, H/1024);
  const ink = f.ink, acc = f.acc;
  const colW = 300; // demi-largeur utile (unités non déformées)
  g.textAlign = "center"; g.fillStyle = ink;
  g.font = '500 26px "JetBrains Mono", monospace';
  g.globalAlpha = .8; g.fillText(`N° ${String(idx+1).padStart(2,"0")} / ${String(total).padStart(2,"0")}`, 0, 110); g.globalAlpha = 1;
  // nom du goût, en grand, sur 1 ou 2 lignes
  const words = f.short.toUpperCase().split(" ");
  let size = 120; g.font = `900 ${size}px "Archivo", sans-serif`;
  const lines = [];
  for (const w of words){ const l = lines.length ? lines[lines.length-1] + " " + w : w; if (lines.length && g.measureText(l).width < colW*2) lines[lines.length-1] = l; else lines.push(w); }
  while (lines.some(l => g.measureText(l).width > colW*2) && size > 50){ size -= 6; g.font = `900 ${size}px "Archivo", sans-serif`; }
  lines.forEach((l, n) => g.fillText(l, 0, 230 + n*size*.92));
  let y = 230 + (lines.length - 1)*size*.92 + 60;
  g.font = '700 30px "Archivo Narrow", sans-serif'; g.globalAlpha = .9;
  g.fillText(f.tag.toUpperCase(), 0, y); g.globalAlpha = 1;
  y += 40;
  g.fillStyle = acc === ink ? shade(ink, -.3) : acc; g.fillRect(-colW*.6, y, colW*1.2, 6);
  y += 70;
  const rows = [["Caféine","32 mg"],["Taurine","400 mg"],["Sucres", f.sug ? `${String(f.sug).replace(".",",")} g` : "0 g"],["Énergie", `${f.kcal} kcal`]];
  g.textAlign = "left";
  for (const [k, v] of rows){
    g.fillStyle = ink; g.globalAlpha = .75; g.font = '500 26px "JetBrains Mono", monospace'; g.fillText(k.toUpperCase(), -colW*.82, y);
    g.globalAlpha = 1; g.textAlign = "right"; g.font = '900 44px "Archivo", sans-serif'; g.fillText(v, colW*.82, y + 4); g.textAlign = "left";
    g.globalAlpha = .25; g.fillRect(-colW*.82, y + 22, colW*1.64, 2); g.globalAlpha = 1;
    y += 82;
  }
  g.textAlign = "center"; g.font = '500 22px "JetBrains Mono", monospace'; g.globalAlpha = .7;
  g.fillText("POUR 100 ML · 250 ML", 0, y + 10); g.globalAlpha = 1;
  // code-barres
  g.fillStyle = "#fff"; roundRect(g, -110, 1024 - 190, 220, 110, 8); g.fill();
  g.fillStyle = "#111"; let bx = -96; let s = 7 + idx;
  while (bx < 96){ s = (s*16807) % 2147483647; const w = 2 + (s % 4); g.fillRect(bx, 1024 - 176, w, 82); bx += w + 2 + (s >> 3) % 3; }
  g.restore();

  // --- face : photo déroulée sur 140°, fondue sur les côtés
  const TMAX = 70 * Math.PI/180, FADE = 14 * Math.PI/180;
  for (let i = 0; i < W; i++){
    const th = (i/W - .25) * TAU;
    if (Math.abs(th) > TMAX) continue;
    const sx = A.cx + A.r * Math.sin(th);
    g.globalAlpha = clamp((TMAX - Math.abs(th)) / FADE);
    g.drawImage(A.canvas, Math.floor(sx), A.top, 1, bh, i, 0, 1, H);
  }
  g.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return { tex: t, ratio: A.r / bh };
}

function shade(hex, amt){
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = n >> 8 & 255, b = n & 255;
  const f = v => Math.round(clamp(amt < 0 ? v*(1 + amt) : v + (255 - v)*amt, 0, 255));
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}

function lidTexture(){
  const c = document.createElement("canvas"); c.width = c.height = 512; const g = c.getContext("2d");
  const rg = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  rg.addColorStop(0, "#d9dce1"); rg.addColorStop(.62, "#c3c7cd"); rg.addColorStop(.7, "#f4f5f7"); rg.addColorStop(.76, "#8d9299"); rg.addColorStop(.86, "#e9ebee"); rg.addColorStop(1, "#7c8188");
  g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 3; g.beginPath(); g.arc(256, 256, 150, 0, TAU); g.stroke();
  // languette
  g.fillStyle = "#b9bdc3"; g.strokeStyle = "#7f848b"; g.lineWidth = 6;
  roundRect(g, 196, 150, 120, 190, 56); g.fill(); g.stroke();
  g.fillStyle = "#6f747b"; roundRect(g, 226, 178, 60, 56, 26); g.fill();
  g.beginPath(); g.arc(256, 300, 14, 0, TAU); g.fillStyle = "#8d9299"; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowTexture(){
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(.35, "rgba(255,255,255,.55)"); rg.addColorStop(.7, "rgba(255,255,255,.12)"); rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export async function create({ canvas, flavors, lite = false, onChange = null }){
  let busyFlag = true;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true, powerPreference: "high-performance" });
  const SEG = lite ? 40 : 64, TEX = lite ? 1024 : 2048;
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 100); camera.position.set(0, 0, CAM_Z);
  scene.add(new THREE.AmbientLight(0xffffff, .35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 4, 6); scene.add(key);
  const rimL = new THREE.PointLight(0xffffff, 18, 12); rimL.position.set(-3, 1, -2); scene.add(rimL);
  const rimR = new THREE.PointLight(0xffffff, 14, 12); rimR.position.set(3.2, -1, -1.5); scene.add(rimR);

  const N = flavors.length;
  const lidTex = lidTexture();
  const cans = flavors.map((f, i) => {
    const group = new THREE.Group(), spin = new THREE.Group(); group.add(spin);
    const r = .2;  // rayon provisoire, ajusté quand la photo est analysée
    const label = new THREE.MeshStandardMaterial({ color: new THREE.Color(f.c1), metalness: .35, roughness: .32, envMapIntensity: .9, transparent: true });
    const silver = new THREE.MeshStandardMaterial({ color: 0xd6d9de, metalness: 1, roughness: .22, envMapIntensity: 1.1, transparent: true });
    const lid = new THREE.MeshStandardMaterial({ map: lidTex, metalness: .9, roughness: .3, transparent: true });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, SEG, 1, true), label);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(r*.86, r, .07, SEG, 1, true), silver); neck.position.y = .535;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r*.86, .012, 8, SEG), silver); rim.rotation.x = Math.PI/2; rim.position.y = .57;
    const top = new THREE.Mesh(new THREE.CircleGeometry(r*.86, SEG), lid); top.rotation.x = -Math.PI/2; top.position.y = .565;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(r, r*.82, .045, SEG, 1, true), silver); foot.position.y = -.5225;
    const base = new THREE.Mesh(new THREE.CircleGeometry(r*.82, SEG), silver); base.rotation.x = Math.PI/2; base.position.y = -.545;
    [body, neck, rim, top, foot, base].forEach(m => { m.userData.i = i; spin.add(m); });
    spin.rotation.y = -Math.PI/2; // le centre de la face vers la caméra
    scene.add(group);
    return { f, i, group, spin, parts: { body, neck, rim, top, foot, base }, mats: [label, silver, lid], ready: false, r };
  });

  // socle lumineux sous la canette choisie
  const glowTex = glowTexture();
  const podium = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  podium.rotation.x = -Math.PI/2; scene.add(podium);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.47, .5, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI/2; scene.add(ring);

  function applyGeometry(c, ratio){
    const r = ratio; c.r = r;
    const p = c.parts;
    p.body.geometry.dispose(); p.body.geometry = new THREE.CylinderGeometry(r, r, 1, SEG, 1, true);
    p.neck.geometry.dispose(); p.neck.geometry = new THREE.CylinderGeometry(r*.86, r, .07, SEG, 1, true);
    p.rim.geometry.dispose(); p.rim.geometry = new THREE.TorusGeometry(r*.86, r*.06, 8, SEG);
    p.top.geometry.dispose(); p.top.geometry = new THREE.CircleGeometry(r*.86, SEG);
    p.foot.geometry.dispose(); p.foot.geometry = new THREE.CylinderGeometry(r, r*.82, .045, SEG, 1, true);
    p.base.geometry.dispose(); p.base.geometry = new THREE.CircleGeometry(r*.82, SEG);
  }
  async function prepare(c){
    if (c.ready || c.loading) return; c.loading = true;
    try {
      const img = await loadImage(c.f.img);
      const A = analyse(img);
      const { tex, ratio } = buildLabel(c.f, A, c.i, N, maxAniso, TEX);
      applyGeometry(c, ratio);
      const m = c.mats[0]; m.map = tex; m.color.set(0xffffff); m.needsUpdate = true; prevKey = "";
      renderer.initTexture(tex);
      c.ready = true;
      if (onChange) onChange();
    } catch (e) { console.warn("Canette 3D", c.f.id, e); }
  }

  let cur = 0, pos = 0, target = 0, W = 0, H = 0, dpr = 1;
  function resize(){
    prevKey = "";
    W = canvas.clientWidth; H = canvas.clientHeight;
    dpr = Math.min(devicePixelRatio || 1, lite ? 1 : 1.5);
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix();
  }
  resize();

  function setColors(f){
    const col = new THREE.Color(f.acc);
    rimL.color.copy(col); rimR.color.copy(new THREE.Color(f.c1)).lerp(new THREE.Color(0xffffff), .3);
    podium.material.color.copy(col); ring.material.color.copy(col);
  }
  function select(i){
    let d = ((i - cur) % N + N) % N; if (d > N/2) d -= N;
    target += d; cur = i; setColors(flavors[i]);
    // la canette choisie d'abord, puis ses voisines, puis le reste
    prepare(cans[i]).then(() => {
      const order = [...Array(N).keys()].sort((a, b) => dist(a) - dist(b));
      const idle = window.requestIdleCallback || (fn => setTimeout(fn, 60));
      (function next(k){ if (k >= order.length) return; idle(() => prepare(cans[order[k]]).then(() => next(k + 1))); })(0);
    });
  }
  const dist = j => { let o = ((j - cur) % N + N) % N; return Math.min(o, N - o); };

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(x, y){
    const rect = canvas.getBoundingClientRect();
    ndc.set((x - rect.left)/rect.width*2 - 1, -(y - rect.top)/rect.height*2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(cans.filter(c => c.group.visible).map(c => c.spin), true);
    return hits.length ? hits[0].object.userData.i : -1;
  }

  // s : { h, k:{x,y,s,z}, k0, ang, tx, ty, now, vh, chPx, opacity, mob, idle }
  const grey = new THREE.Color();
  let prevKey = "";
  function update(s){
    const ww = HW * W / Math.max(1, H);
    const moving = Math.abs(target - pos) > .0005;
    pos = moving ? lerp(pos, target, .14) : target;
    const he = ease(clamp(s.h));
    const idle = s.idle && he < 1;
    const key = [s.h, s.k.x, s.k.y, s.k.s, s.k.z, s.ang, s.tx, s.ty, s.opacity, pos, W, H].map(v => typeof v === "number" ? v.toFixed(3) : v).join("|");
    busyFlag = moving || idle;
    if (!idle && !moving && key === prevKey) return false; // rien n'a bougé : pas de rendu
    prevKey = key;
    const canH = s.chPx / s.vh * HW;
    const heroY = -s.k0.y / 100 * HW;
    const arc = ww * (s.mob ? .62 : .4);
    const t = s.now / 1000;
    for (const c of cans){
      let o = c.i - pos; o = ((o % N) + N + N/2) % N - N/2;
      const ao = Math.abs(o);
      if (c.i !== cur && (ao > 3.4 || he >= 1)){ c.group.visible = false; continue; }
      // vitrine en arc : la canette du centre en avant, les autres penchées et dans l'ombre
      const a = clamp(o * .36, -1.3, 1.3);
      let x = Math.sin(a) * arc, z = -(1 - Math.cos(a)) * 4.2 - ao * .25;
      let y = heroY + (ao > 0 ? (Math.min(ao, 1) * .06 + Math.sin(c.i * 1.7) * .05) * canH : 0);
      let sc = canH * s.k0.s * (1 - Math.min(ao, 3) * .05);
      const lean = (c.i % 2 ? 1 : -1) * Math.min(ao, 1);
      let rz = lean * .2 - o * .05, rx = Math.min(ao, 1) * .08;
      let ry = o * .45 + (idle ? Math.sin(t * .6 + c.i) * .12 : 0);
      let op = clamp(3.4 - ao);
      let lit = 1 - Math.min(ao, 2.5) * .26;
      if (idle && ao < .5) y += Math.sin(t * 1.4) * .03 * canH;
      if (c.i === cur){
        const kx = s.k.x/100 * ww, ky = -s.k.y/100 * HW;
        x = lerp(x, kx, he); y = lerp(y, ky, he); z = lerp(z, 0, he);
        sc = lerp(sc, canH * s.k.s, he);
        rz = lerp(rz, -s.k.z * Math.PI/180, he);
        ry = lerp(ry, s.ang * Math.PI/180, he) + s.tx * .35;
        rx = lerp(rx, 0, he) + s.ty * .12;
        op = s.opacity; lit = lerp(lit, 1, he);
      } else { z -= he * 6; op *= 1 - he; }
      c.group.visible = op > .01;
      if (!c.group.visible) continue;
      c.group.position.set(x, y, z);
      c.group.scale.setScalar(sc);
      c.group.rotation.set(rx, 0, rz);
      c.spin.rotation.y = -Math.PI/2 + ry;
      grey.setScalar(lit);
      if (c.ready) c.mats[0].color.copy(grey);
      c.mats[1].color.setRGB(.84*lit, .85*lit, .87*lit);
      for (const m of c.mats) m.opacity = op;
    }
    const sel = cans[cur];
    const po = (1 - he) * clamp(1 - Math.abs(target - pos) * 2);
    podium.visible = ring.visible = po > .01;
    if (podium.visible){
      const g = sel.group, base = g.position.y - g.scale.y * .56;
      podium.position.set(g.position.x, base, g.position.z); podium.scale.setScalar(g.scale.y * 1.7);
      podium.material.opacity = po * .8;
      ring.position.set(g.position.x, base + .002, g.position.z); ring.scale.setScalar(g.scale.y * .95);
      ring.material.opacity = po * .7;
    }
    renderer.render(scene, camera);
    return true;
  }

  return { select, update, pick, resize, busy: () => busyFlag, setLite(v){ lite = v; resize(); prevKey = ""; }, prepare: () => prepare(cans[cur]) };
}
