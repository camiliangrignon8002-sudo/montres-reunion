// Textures générées (aucune image externe) : satinage, perlage, Côtes de Genève, azurage, lunette tachymétrique, cadran.
import * as THREE from "three";
import { D } from "./dims.js";
import { TAU } from "./geo.js";

const canvas = s => { const c = document.createElement("canvas"); c.width = c.height = s; return [c, c.getContext("2d")]; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t; };

// carte de normales d'un satinage : fines stries longitudinales + micro-rayures
export function normalesSatin(size = 512) {
  const h = new Float32Array(size * size);
  for (let i = 0; i < size; i++) { let v = 0; const f = Math.random() * .6; for (let j = 0; j < size; j++) { v = v * .94 + (Math.random() - .5) * .4; h[i * size + j] = v + f; } }
  for (let k = 0; k < 60; k++) {             // micro-rayures aléatoires
    let x = Math.random() * size, y = Math.random() * size; const a = Math.random() * TAU, l = 20 + Math.random() * 90;
    for (let t = 0; t < l; t++) { const xi = (((x | 0) % size) + size) % size, yi = (((y | 0) % size) + size) % size; h[yi * size + xi] -= .8; x += Math.cos(a); y += Math.sin(a); }
  }
  return normales(h, size, 2.0);
}
function normales(h, size, force) {
  const [c, g] = canvas(size), img = g.createImageData(size, size), H = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * force, dy = (H(x, y + 1) - H(x, y - 1)) * force, k = (y * size + x) * 4;
    img.data[k] = 128 + Math.max(-127, Math.min(127, dx * 127)); img.data[k + 1] = 128 + Math.max(-127, Math.min(127, dy * 127)); img.data[k + 2] = 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = tex(c, false); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// perlage (platine du mouvement)
export function perlage(size = 1024) {
  const [c, g] = canvas(size); g.fillStyle = "#c4c8ce"; g.fillRect(0, 0, size, size); const r = size / 30;
  for (let y = 0; y < size + r; y += r * 1.05) for (let x = 0; x < size + r; x += r * 1.05) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "#f0f2f5"); gr.addColorStop(.6, "#bfc4ca"); gr.addColorStop(.9, "#a5aab1"); gr.addColorStop(1, "rgba(160,165,172,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  return tex(c);
}
// Côtes de Genève (ponts, rotor)
export function cotes(size = 1024, [r, v, b] = [205, 210, 216]) {
  const [c, g] = canvas(size), w = size / 13;
  for (let i = -size; i < size * 2; i += w) {
    const gr = g.createLinearGradient(i, 0, i + w, w * .55);
    const f = k => `rgb(${Math.min(255, r * k) | 0},${Math.min(255, v * k) | 0},${Math.min(255, b * k) | 0})`;
    gr.addColorStop(0, f(.8)); gr.addColorStop(.5, f(1.12)); gr.addColorStop(1, f(.8));
    g.save(); g.translate(i, 0); g.rotate(-.55); g.fillStyle = gr; g.fillRect(0, -size, w, size * 3); g.restore();
  }
  return tex(c);
}
// azurage concentrique (fond des compteurs)
export function azurage(size = 512, fond = "#f1f0ec") {
  const [c, g] = canvas(size); g.fillStyle = fond; g.fillRect(0, 0, size, size);
  for (let r = 2; r < size / 2; r += 2.2) { g.strokeStyle = `rgba(0,0,0,${.035 + (r % 4.4 < 2.2 ? .03 : 0)})`; g.lineWidth = 1; g.beginPath(); g.arc(size / 2, size / 2, r, 0, TAU); g.stroke(); }
  return tex(c);
}

// --- lunette Cerachrom : chiffres et graduations « platinés » intégrés à la céramique (couleur + métal + rugosité)
export function lunette(size = 2048) {
  const R = D.rLunetteExt + .3, k = size / (2 * R), C = size / 2, mm = v => v * k;
  const peindre = (g, fond, encre) => {
    g.fillStyle = fond; g.fillRect(0, 0, size, size); g.fillStyle = g.strokeStyle = encre;
    const rTexte = 17.75, f = (t, a, r, taille) => { g.save(); g.translate(C + Math.sin(a) * mm(r), C - Math.cos(a) * mm(r)); g.rotate(a); g.font = `600 ${mm(taille)}px "Helvetica Neue", Helvetica, Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, 0, 0); g.restore(); };
    for (const v of [400, 300, 240, 200, 180, 150, 140, 130, 120, 110, 100, 90, 85, 80, 75, 70, 65]) {
      const a = 3600 / v / 60 * TAU; f(String(v), a, rTexte, 1.32);
      g.lineWidth = mm(.16); g.beginPath(); g.moveTo(C + Math.sin(a) * mm(19.45), C - Math.cos(a) * mm(19.45)); g.lineTo(C + Math.sin(a) * mm(18.9), C - Math.cos(a) * mm(18.9)); g.stroke();
    }
    // échelle fine de 60 à 100 (une graduation par seconde) et triangles séparateurs
    for (let sec = 36; sec <= 60; sec++) { const a = sec / 60 * TAU; g.lineWidth = mm(.1); g.beginPath(); g.moveTo(C + Math.sin(a) * mm(19.45), C - Math.cos(a) * mm(19.45)); g.lineTo(C + Math.sin(a) * mm(19.1), C - Math.cos(a) * mm(19.1)); g.stroke(); }
    f("60", 0, rTexte, 1.32);
    for (const v of [350, 275, 225, 190, 165, 145]) { const a = 3600 / v / 60 * TAU; g.save(); g.translate(C + Math.sin(a) * mm(18.7), C - Math.cos(a) * mm(18.7)); g.rotate(a); g.beginPath(); g.moveTo(-mm(.32), -mm(.25)); g.lineTo(mm(.32), -mm(.25)); g.lineTo(0, mm(.3)); g.closePath(); g.fill(); g.restore(); }
    f("UNITS PER", .43, 18.25, .95); f("HOUR", .43, 17.05, .95);
  };
  const [c1, g1] = canvas(size); peindre(g1, "#050506", "#d9dadc");
  const [c2, g2] = canvas(size); peindre(g2, "#000", "#fff");                  // métal : chiffres platinés
  const [c3, g3] = canvas(size); peindre(g3, "#1a1a1a", "#5a5a5a");            // rugosité : céramique lisse, chiffres un peu moins
  return { map: tex(c1), metal: tex(c2, false), rugo: tex(c3, false), R };
}

// --- cadran blanc laqué : minuterie, anneaux noirs des compteurs, typographie horlogère
export function cadran(size = 2048, marquages = true) {
  const R = D.rCadran, k = size / (2 * R), C = size / 2, mm = v => v * k;
  const [c, g] = canvas(size);
  const fond = g.createRadialGradient(C, C * .82, 0, C, C, C); fond.addColorStop(0, "#fcfcfa"); fond.addColorStop(.8, "#f3f2ee"); fond.addColorStop(1, "#e9e8e3");
  g.fillStyle = fond; g.fillRect(0, 0, size, size);
  // grain très fin (laque satinée)
  const img = g.getImageData(0, 0, size, size); for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - .5) * 5; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; } g.putImageData(img, 0, 0);
  g.strokeStyle = "#1b1b1c";
  for (let i = 0; i < 240; i++) {               // minuterie au 1/4 de seconde
    const a = i / 240 * TAU, l = i % 20 === 0 ? 1.15 : i % 4 === 0 ? .8 : .5;
    g.lineWidth = mm(i % 4 === 0 ? .14 : .07); g.beginPath(); g.moveTo(C + Math.sin(a) * mm(14.05), C - Math.cos(a) * mm(14.05)); g.lineTo(C + Math.sin(a) * mm(14.05 - l), C - Math.cos(a) * mm(14.05 - l)); g.stroke();
  }
  const anneau = ([cx, cy], nombres, grad) => {
    cx = C + mm(cx); cy = C - mm(cy);
    g.fillStyle = "#0d0d0e"; g.beginPath(); g.arc(cx, cy, mm(D.rAnneauCompteur), 0, TAU); g.arc(cx, cy, mm(D.rCompteur), 0, TAU, true); g.fill();
    g.strokeStyle = "#f3f3f1";
    for (let i = 0; i < grad; i++) { const a = i / grad * TAU, l = i % (grad / nombres.length) === 0 ? .5 : .28; g.lineWidth = mm(.08); g.beginPath(); g.moveTo(cx + Math.sin(a) * mm(4.22), cy - Math.cos(a) * mm(4.22)); g.lineTo(cx + Math.sin(a) * mm(4.22 - l), cy - Math.cos(a) * mm(4.22 - l)); g.stroke(); }
    g.fillStyle = "#f3f3f1"; g.font = `600 ${mm(.82)}px "Helvetica Neue", Helvetica, Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    nombres.forEach((t, i) => { const a = (i + 1) / nombres.length * TAU; g.save(); g.translate(cx + Math.sin(a) * mm(3.8), cy - Math.cos(a) * mm(3.8)); g.fillText(t, 0, 0); g.restore(); });
  };
  anneau(D.posCompteurs.minutes, ["10", "20", "30"], 30);
  anneau(D.posCompteurs.heures, ["3", "6", "9", "12"], 24);
  anneau(D.posCompteurs.secondes, ["20", "40", "60"], 60);
  if (marquages) {
    const t = (txt, y, taille, poids = 500, couleur = "#161616", police = '"Helvetica Neue", Helvetica, Arial, sans-serif', esp = .06) => {
      g.fillStyle = couleur; g.font = `${poids} ${mm(taille)}px ${police}`; g.textAlign = "center"; g.textBaseline = "middle";
      if ("letterSpacing" in g) g.letterSpacing = `${mm(esp)}px`; g.fillText(txt, C, C - mm(y));
    };
    t("ROLEX", 8.15, 1.45, 700, "#141414", 'Georgia, "Times New Roman", serif', .12);
    t("OYSTER PERPETUAL", 6.75, .58, 600);
    t("SUPERLATIVE CHRONOMETER", 5.85, .5, 500);
    t("OFFICIALLY CERTIFIED", 5.15, .5, 500);
    t("COSMOGRAPH", 4.3, .62, 600);
    t("DAYTONA", -2.3, .6, 700, "#c4161c");
    t("SWISS MADE", -13.35, .42, 500);
  }
  return tex(c);
}
