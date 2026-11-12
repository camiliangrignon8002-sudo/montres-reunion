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
  // largeur de référence : la médiane du milieu de la canette
  const mids = [];
  for (let y = Math.floor(height*.3); y < height*.7; y++) if (L[y] >= 0) mids.push(R[y] - L[y]);
  mids.sort((a,b)=>a-b);
  const midW = mids[mids.length>>1] || width;
  const ok = y => L[y] >= 0 && R[y] - L[y] >= midW*.96;
  let top = Math.floor(height*.3), bot = Math.floor(height*.7);
  while (top > 0 && ok(top - 1)) top--;
  while (bot < height - 1 && ok(bot + 1)) bot++;
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

  // --- dos : les vraies mentions du dos de la canette, recomposées en net
  const classic = ["energy-drink", "sugarfree", "zero"].includes(f.id);
  let bg;
  // couleurs de la palette des fiches fournies
  const PAL = { "white-edition": "#f1f1f1", "red-edition": "#c5001a", "blue-edition": "#0022b8", "yellow-edition": "#ffd200", "green-edition": "#7ed321", "orange-edition": "#ff6a00", "purple-edition": "#6a1b9a", "pink-edition": "#ff2d93", "peach-edition": "#ff9c7a", "winter-edition": "#8fd7ff" };
  if (classic) bg = "#c9cdd3";
  else if (PAL[f.id]) bg = shade(PAL[f.id], -.1);
  else {
    // couleur de la canette, prise sur la photo (zones unies près des bords de la face)
    const gg = A.canvas.getContext("2d"), cols = [];
    for (const th of [-.7, -.55, .55, .7]) for (let k = .45; k < .8; k += .05){
      const d = gg.getImageData(Math.round(A.cx + A.r*Math.sin(th)), Math.round(A.top + bh*k), 1, 1).data; cols.push([d[0], d[1], d[2]]);
    }
    const med = i => cols.map(c => c[i]).sort((x, y) => x - y)[cols.length >> 1];
    bg = shade(`#${[med(0), med(1), med(2)].map(v => v.toString(16).padStart(2, "0")).join("")}`, -.03);
  }
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, bg); grad.addColorStop(1, bg);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  if (classic){ const m = g.createLinearGradient(0, 0, 0, H); m.addColorStop(0, "rgba(255,255,255,.18)"); m.addColorStop(.5, "rgba(255,255,255,0)"); m.addColorStop(1, "rgba(0,0,0,.12)"); g.fillStyle = m; g.fillRect(0, 0, W, H); }
  const INK = { "energy-drink": "#1b2f7a", "sugarfree": "#1f74c0", "zero": "#0f1a30", "white-edition": "#5b2a86", "yellow-edition": "#c8102e" };
  const ink = INK[f.id] || "#ffffff";
  const sx = H/1024/aspect, sy = H/1024; // unités non déformées
  g.save(); g.translate(W*.75, 0); g.scale(sx, sy);
  const colW = (W * 52/360) / sx;
  const x0 = -colW*.84, maxW = colW*1.7;
  const ed = f.name.replace(/ Edition$/, "");
  const title = classic ? `Red Bull® ${f.id === "energy-drink" ? "Energy Drink" : f.name.toUpperCase() === "ZERO" ? "ZERO" : f.name}.` : `Red Bull® The ${ed} Edition®`;
  const para = classic
    ? (f.sf ? ["Boisson énergisante", "sans sucres.", "Contient de la caféine,", "de la taurine et des", "vitamines B.", "À consommer avec", "modération."]
            : ["Boisson énergisante.", "Contient de la caféine,", "de la taurine et des", "vitamines B.", "À consommer avec", "modération."])
    : ["Boisson énergisante", `saveur ${f.tag}.`, "Contient de la caféine,", "de la taurine et des", "vitamines B.", "À consommer avec", "modération."];
  g.fillStyle = ink; g.textAlign = "left"; g.textBaseline = "alphabetic";
  let fs = 74, ft = 74;
  const wOf = (t, w, z) => { g.font = `${w} ${z}px "Archivo Narrow", sans-serif`; return g.measureText(t).width; };
  while (Math.max(...para.map(l => wOf(l, 500, fs))) > maxW && fs > 24) fs -= 2;
  while (wOf(title, 700, ft) > maxW && ft > 24) ft -= 2;
  ft = Math.min(ft, fs*1.05);
  let y = 110;
  g.font = `700 ${ft}px "Archivo Narrow", sans-serif`; g.fillText(title, x0, y); y += fs*1.3;
  g.font = `500 ${fs}px "Archivo Narrow", sans-serif`;
  for (const l of para){ g.fillText(l, x0, y); y += fs*1.12; }
  y += fs*.5;
  g.font = `500 ${Math.round(fs*.56)}px "Archivo Narrow", sans-serif`; g.globalAlpha = .85;
  for (const l of ["Teneur élevée en caféine (32 mg/100 ml).", "Déconseillé aux enfants et aux femmes", "enceintes ou allaitantes."]){ g.fillText(l, x0, y); y += fs*.66; }
  g.globalAlpha = 1;
  // code-barres (vertical, en bas à gauche)
  const bw = colW*.62, bht = 300, by = 1024 - bht - 60;
  g.fillStyle = "#fff"; roundRect(g, x0, by, bw, bht, 10); g.fill();
  g.fillStyle = "#111"; let yy = by + 16, sd = 11 + idx;
  while (yy < by + bht - 40){ sd = (sd*16807) % 2147483647; const h = 3 + (sd % 6); g.fillRect(x0 + 16, yy, bw - 60, h); yy += h + 3 + (sd >> 4) % 4; }
  g.save(); g.translate(x0 + bw - 18, by + bht - 20); g.rotate(-Math.PI/2); g.font = '500 20px "JetBrains Mono", monospace'; g.fillText("9 002490 2" + String(idx).padStart(5, "0"), 0, 0); g.restore();
  // logos de recyclage et volume
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 4;
  const tri = (cx, cy, r) => { g.beginPath(); for (let k = 0; k < 3; k++){ const a = -Math.PI/2 + k*TAU/3; g[k ? "lineTo" : "moveTo"](cx + r*Math.cos(a), cy + r*Math.sin(a)); } g.closePath(); g.stroke(); };
  const rx = x0 + bw + colW*.32;
  tri(rx, by + 60, 44); g.font = '700 22px "Archivo Narrow", sans-serif'; g.textAlign = "center"; g.fillText("ALU", rx, by + 118);
  g.beginPath(); g.arc(rx, by + 175, 36, 0, TAU); g.stroke(); g.font = '700 26px "Archivo Narrow", sans-serif'; g.fillText("♻", rx, by + 185);
  g.textAlign = "right"; g.font = `700 ${Math.round(colW*.28)}px "Archivo Narrow", sans-serif`; g.fillText("250 ml℮", colW*.86, 1024 - 70);
  g.restore();
  // gouttes d'eau, comme sur la face
  g.save(); g.scale(sx, sy);
  let sd2 = 5 + idx*7; const R = () => (sd2 = (sd2*16807) % 2147483647, (sd2 - 1)/2147483646);
  for (let k = 0; k < 900; k++){
    const x = R()*W/sx, yv = R()*1024, r = 2 + R()*R()*9;
    g.fillStyle = "rgba(0,0,0,.14)"; g.beginPath(); g.arc(x + r*.25, yv + r*.3, r, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,.22)"; g.beginPath(); g.arc(x, yv, r, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.arc(x - r*.35, yv - r*.35, r*.28, 0, TAU); g.fill();
  }
  g.restore();

  // --- face : photo déroulée sur 140°, fondue sur les côtés
  const TMAX = 82 * Math.PI/180, FADE = 26 * Math.PI/180;
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
  return { tex: t, ratio: A.r / bh * .93 };
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
  let busyFlag = true, prevKey = "";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite && (devicePixelRatio || 1) < 2, alpha: true, powerPreference: "high-performance" });
  const SEG = lite ? 40 : 64, TEX = lite ? 1024 : 1536;
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
  const amb = scene.children.find(o => o.isAmbientLight);
  // projecteur qui se resserre sur la canette quand elle montre ses infos
  const spot = new THREE.SpotLight(0xffffff, 0, 30, .26, .8, 1.2); spot.position.set(0, 2.5, 9); scene.add(spot); scene.add(spot.target);

  const N = flavors.length;
  const lidTex = lidTexture();
  const cans = flavors.map((f, i) => {
    const group = new THREE.Group(), spin = new THREE.Group(); group.add(spin);
    const r = .2;  // rayon provisoire, ajusté quand la photo est analysée
    const label = new THREE.MeshStandardMaterial({ color: new THREE.Color(f.c1), metalness: .22, roughness: .42, envMapIntensity: .75, transparent: true });
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
      let tex, ratio;
      if (false && c.f.label){
        // étiquette 360° préparée à l'avance (face, côtés et vrai dos de la canette)
        const img = await loadImage(c.f.label);
        tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso; tex.needsUpdate = true;
        ratio = c.f.ratio;
      } else {
        const img = await loadImage(c.f.img);
        ({ tex, ratio } = buildLabel(c.f, analyse(img), c.i, N, maxAniso, TEX));
      }
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
    dpr = Math.min(devicePixelRatio || 1, lite ? 1 : (W < 760 ? 1.25 : 1.5));
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
  function update(s){
    const ww = HW * W / Math.max(1, H);
    const moving = Math.abs(target - pos) > .0005;
    pos = moving ? lerp(pos, target, .14) : target;
    const he = ease(clamp(s.h));
    const idle = s.idle && he < 1;
    const sig = [s.focus, s.h, s.k.x, s.k.y, s.k.s, s.k.z, s.ang, s.tx, s.ty, s.opacity, pos, W, H].map(v => typeof v === "number" ? v.toFixed(3) : v).join("|");
    busyFlag = moving || idle;
    if (!idle && !moving && sig === prevKey) return false; // rien n'a bougé : pas de rendu
    prevKey = sig;
    const canH = s.chPx / s.vh * HW;
    const heroY = -s.k0.y / 100 * HW;
    const arc = ww * (s.mob ? .78 : .5);
    const t = s.now / 1000;
    for (const c of cans){
      let o = c.i - pos; o = ((o % N) + N + N/2) % N - N/2;
      const ao = Math.abs(o);
      const far = s.mob ? 2.4 : 3.4;
      if (c.i !== cur && (ao > far || he >= 1)){ c.group.visible = false; continue; }
      // vitrine en arc : la canette du centre en avant, les autres penchées et dans l'ombre
      const a = clamp(o * .5, -1.35, 1.35);
      let x = Math.sin(a) * arc, z = -(1 - Math.cos(a)) * 6 - Math.min(ao, 1) * 1.4;
      let y = heroY + (ao > 0 ? (Math.min(ao, 1) * .06 + Math.sin(c.i * 1.7) * .05) * canH : 0);
      let sc = canH * s.k0.s * (1 - Math.min(ao, 1) * .22 - Math.max(0, Math.min(ao, 3) - 1) * .06);
      const lean = (c.i % 2 ? 1 : -1) * Math.min(ao, 1);
      let rz = lean * .2 - o * .05, rx = Math.min(ao, 1) * .08;
      let ry = o * .45 + (idle ? Math.sin(t * .6 + c.i) * .12 : 0);
      let op = clamp(far - ao);
      let lit = 1 - Math.min(ao, 2.5) * .26;
      if (idle && ao < .5) y += Math.sin(t * 1.4) * .03 * canH;
      if (c.i === cur){
        const kx = s.k.x/100 * ww, ky = -s.k.y/100 * HW;
        x = lerp(x, kx, he); y = lerp(y, ky, he); z = lerp(z, 0, he);
        sc = lerp(sc, canH * s.k.s, he);
        rz = lerp(rz, -s.k.z * Math.PI/180, he);
        ry = s.ang * Math.PI/180 + s.tx * .35;          // la canette du centre tourne sur elle-même
        rz = rz - (s.k0.z || 0) * Math.PI/180 * (1 - Math.min(ao, 1));
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
      podium.position.set(g.position.x, base, g.position.z); podium.scale.setScalar(g.scale.y * 1.1);
      podium.material.opacity = po * .55;
      ring.position.set(g.position.x, base + .002, g.position.z); ring.scale.setScalar(g.scale.y * .62);
      ring.material.opacity = po * .45;
    }
    // lumière de focus : le reste s'assombrit, un faisceau éclaire la canette
    const fo = s.focus || 0;
    spot.intensity = fo * 70; spot.position.set(sel.group.position.x + 1.2, sel.group.position.y + 3, 8); spot.target.position.copy(sel.group.position);
    key.intensity = lerp(1.6, .7, fo); amb.intensity = lerp(.35, .08, fo);
    rimL.intensity = lerp(18, 6, fo); rimR.intensity = lerp(14, 4, fo);
    for (const m of sel.mats) m.envMapIntensity = lerp(.9, .35, fo);
    renderer.render(scene, camera);
    return true;
  }

  return { select, update, pick, resize, busy: () => busyFlag, setLite(v){ lite = v; resize(); prevKey = ""; }, prepare: () => prepare(cans[cur]) };
}
