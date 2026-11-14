"use strict";
// Dessin des montres en vectoriel : net à toutes les tailles, sans photo.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
let UID = 0;
const METALS = {
  steel:    ["#fdfdfe", "#c9cdd2", "#8d949c", "#eef0f2", "#a9afb6"],
  gold:     ["#fff4c9", "#e3bd60", "#a77a25", "#f5da8d", "#c59b3f"],
  everose:  ["#ffe5d6", "#e6aa8c", "#a6644a", "#f3c6ad", "#c98b6e"],
  platinum: ["#ffffff", "#dde0e4", "#a6acb3", "#f1f3f5", "#c4c9ce"],
  leather:  ["#7a4b2c", "#5a341d", "#3e2213", "#6b4126", "#4b2a17"],
  rubber:   ["#2a2b2d", "#151617", "#060607", "#1d1e20", "#0d0d0e"],
};
METALS.whitegold = METALS.platinum;
function metalSet(m) {
  // boîtier, lunette, maillons centraux
  if (m === "twotone") return { kase: "steel", bezel: "gold", center: "gold", hands: "gold" };
  if (m === "everose-tt") return { kase: "steel", bezel: "everose", center: "everose", hands: "everose" };
  return { kase: m, bezel: m, center: m, hands: m === "steel" ? "platinum" : m };
}
function lum(hex) {
  if (!hex || hex[0] !== "#") return 0.1;
  const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function lin(id, stops, x2 = 1, y2 = 0) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map((c, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join("")}</linearGradient>`;
}
const P = (r, a, cx = 200, cy = 300) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
function arc(r1, r2, a1, a2) {
  const [x1, y1] = P(r2, a1), [x2, y2] = P(r2, a2), [x3, y3] = P(r1, a2), [x4, y4] = P(r1, a1);
  const big = a2 - a1 > 180 ? 1 : 0;
  return `M${x1} ${y1}A${r2} ${r2} 0 ${big} 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 ${big} 0 ${x4} ${y4}Z`;
}

function strap(u, s, ms, top) {
  // bracelet du haut (y 0→175) ou du bas (425→600), en léger trapèze
  const y0 = top ? -10 : 425, y1 = top ? 175 : 610;
  const wIn = 138, wOut = 122;
  const [wa, wb] = top ? [wOut, wIn] : [wIn, wOut];
  const clip = `${200 - wa / 2},${y0} ${200 + wa / 2},${y0} ${200 + wb / 2},${y1} ${200 - wb / 2},${y1}`;
  const id = `${u}s${top ? "t" : "b"}`;
  let g = `<clipPath id="${id}"><polygon points="${clip}"/></clipPath><g clip-path="url(#${id})">`;
  const W = 150, X = 125, H = y1 - y0;
  const b = s.bracelet;
  if (b === "rubber" || b === "leather") {
    const base = b === "rubber" ? "url(#" + u + "rb)" : "url(#" + u + "lt)";
    g += `<rect x="${X}" y="${y0}" width="${W}" height="${H}" fill="${base}"/>`;
    if (b === "leather") {
      g += `<path d="M${X + 14} ${y0}V${y1}M${X + W - 14} ${y0}V${y1}" stroke="#d9b58c" stroke-width="1.3" stroke-dasharray="5 4" opacity=".7"/>`;
      for (let y = y0 + 8; y < y1; y += 9) g += `<path d="M${X + 22} ${y}q${(W - 44) / 2} 3 ${W - 44} 0" stroke="#2a160b" stroke-width=".6" fill="none" opacity=".35"/>`;
    } else {
      for (let y = y0 + 14; y < y1; y += 26) g += `<rect x="${X + 30}" y="${y}" width="${W - 60}" height="3" rx="1.5" fill="#000" opacity=".5"/>`;
    }
  } else {
    const cols = b === "jubilee" ? [0.3, 0.13, 0.14, 0.13, 0.3] : [0.34, 0.32, 0.34];
    const step = b === "jubilee" ? 15 : b === "president" ? 22 : 30;
    let x = X;
    cols.forEach((w, i) => {
      const ww = w * W;
      const isCenter = b === "jubilee" ? (i >= 1 && i <= 3) : i === 1;
      const mat = isCenter ? ms.center : ms.kase;
      const polished = isCenter && (b !== "oyster" || ms.center !== ms.kase);
      g += `<rect x="${x}" y="${y0}" width="${ww}" height="${H}" fill="url(#${u}${polished ? "bp" : "bb"}${mat})"/>`;
      const off = b === "jubilee" && i % 2 ? step / 2 : 0;
      for (let y = y0 + off; y < y1; y += step) {
        if (b === "president" && isCenter) g += `<rect x="${x + 2}" y="${y + 2}" width="${ww - 4}" height="${step - 4}" rx="${(step - 4) / 2}" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.2"/>`;
        else g += `<rect x="${x}" y="${y}" width="${ww}" height="1.4" fill="rgba(0,0,0,.32)"/><rect x="${x}" y="${y + 1.4}" width="${ww}" height="1" fill="rgba(255,255,255,.55)"/>`;
      }
      g += `<rect x="${x}" y="${y0}" width="1" height="${H}" fill="rgba(0,0,0,.25)"/>`;
      x += ww;
    });
    if (!top) g += `<rect x="${X + 10}" y="${y0 + 118}" width="${W - 20}" height="44" rx="6" fill="url(#${u}bp${ms.kase})" stroke="rgba(0,0,0,.25)"/><rect x="${X + 40}" y="${y0 + 132}" width="${W - 80}" height="16" rx="8" fill="rgba(0,0,0,.12)"/>`;
  }
  // ombre portée près du boîtier
  g += `<rect x="${X}" y="${top ? y1 - 40 : y0}" width="${W}" height="40" fill="url(#${u}sh${top ? "t" : "b"})"/>`;
  return g + "</g>";
}

function watchSVG(s, o = {}) {
  const u = "w" + (++UID);
  const ms = metalSet(s.metal);
  const T = s.type;
  const dial = s.dial || "#111";
  const dialFill = dial === "grad-deepblue" ? `url(#${u}db)` : dial;
  const light = dial !== "grad-deepblue" && lum(dial) > 0.55;
  const ink = light ? "#1b1b1d" : "#f2f2f2";
  const lume = "#f3efe2";
  const handM = ms.hands;
  const k = Math.max(0.84, Math.min(1.05, 0.88 + ((o.diam || 40) - 36) * 0.022));
  let d = "<defs>";
  for (const [n, st] of Object.entries(METALS)) {
    d += lin(`${u}bb${n}`, [st[2], st[1], st[0], st[1], st[4], st[2]]);       // brossé, en largeur
    d += lin(`${u}bp${n}`, [st[4], st[0], st[3], st[0], st[1], st[4]]);       // poli
    d += lin(`${u}c${n}`, [st[0], st[1], st[2], st[3], st[4]], 1, 1);          // boîtier en diagonale
  }
  d += `<linearGradient id="${u}rb" x1="0" x2="1">${["#0a0a0b", "#26272a", "#141516", "#26272a", "#0a0a0b"].map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join("")}</linearGradient>`;
  d += `<linearGradient id="${u}lt" x1="0" x2="1">${["#3a1f10", "#6e4326", "#7d4e2d", "#6e4326", "#3a1f10"].map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join("")}</linearGradient>`;
  d += `<linearGradient id="${u}sht" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>`;
  d += `<linearGradient id="${u}shb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`;
  d += `<radialGradient id="${u}sun" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#fff" stop-opacity="${light ? .35 : .22}"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${light ? .12 : .35}"/></radialGradient>`;
  d += `<radialGradient id="${u}db" cx=".5" cy=".15" r=".95"><stop offset="0" stop-color="#2a63c4"/><stop offset=".5" stop-color="#11306e"/><stop offset="1" stop-color="#020306"/></radialGradient>`;
  d += `<radialGradient id="${u}dome" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>`;
  d += `<linearGradient id="${u}glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  d += `<filter id="${u}ds" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1" flood-opacity=".45"/></filter>`;
  d += "</defs>";

  let g = d;
  g += strap(u, s, ms, true) + strap(u, s, ms, false);
  g += `<g transform="translate(200 300) scale(${k}) translate(-200 -300)">`;
  // cornes
  g += `<path d="M122 170 Q118 230 96 262 L96 338 Q118 370 122 430 L278 430 Q282 370 304 338 L304 262 Q282 230 278 170Z" fill="url(#${u}c${ms.kase})" stroke="rgba(0,0,0,.25)" stroke-width="1"/>`;
  // couronne (+ épaulements pour les plongeuses)
  if (["sub", "gmt", "yacht", "exp2"].includes(T)) g += `<path d="M318 262 Q336 280 338 300 Q336 320 318 338Z" fill="url(#${u}c${ms.kase})" stroke="rgba(0,0,0,.25)"/>`;
  g += `<rect x="326" y="284" width="22" height="32" rx="4" fill="url(#${u}bp${ms.bezel === "gold" ? "gold" : ms.kase})" stroke="rgba(0,0,0,.35)"/>`;
  for (let y = 287; y < 314; y += 3) g += `<rect x="343" y="${y}" width="5" height="1.2" fill="rgba(0,0,0,.35)"/>`;
  // boîtier
  g += `<circle cx="200" cy="300" r="129" fill="url(#${u}c${ms.kase})" stroke="rgba(0,0,0,.3)"/>`;

  // lunette
  const bz = s.bezel;
  const insertTypes = ["sub", "gmt", "daytona", "yacht", "exp2"];
  if (insertTypes.includes(T)) {
    const rot = ["sub", "gmt", "yacht"].includes(T);
    g += `<circle cx="200" cy="300" r="126" fill="url(#${u}c${ms.bezel})"/>`;
    if (rot) for (let a = 0; a < 360; a += 3) { const [x1, y1] = P(126, a), [x2, y2] = P(121.5, a); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(0,0,0,.35)" stroke-width="1.1"/>`; }
    const ins = s.insert;
    if (Array.isArray(ins)) {
      g += `<path d="${arc(102, 120, -90, 90)}" fill="${ins[0]}"/><path d="${arc(102, 120, 90, 270)}" fill="${ins[1]}"/>`;
    } else {
      g += `<path d="${arc(102, 120, 0, 359.99)}" fill="${ins}"/>`;
    }
    g += `<circle cx="200" cy="300" r="111" fill="none" stroke="url(#${u}dome)" stroke-width="18" opacity=".5"/>`;
    const tc = T === "exp2" ? "#1d1d1f" : (T === "yacht" && lum(ins) > 0.5) ? "#2b2d31" : (ms.bezel === "steel" ? "#e9ebee" : "#e8cf8b");
    const txt = (t, a, size = 12.5) => { const [x, y] = P(111, a); return `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" fill="${tc}" text-anchor="middle" dominant-baseline="central" transform="rotate(${a} ${x} ${y})" font-family="Helvetica,Arial,sans-serif">${t}</text>`; };
    if (T === "sub" || T === "yacht") {
      for (let m = 5; m < 60; m += 5) { const a = m * 6; if (m % 10 === 0) g += txt(m, a); else { const [x1, y1] = P(118, a), [x2, y2] = P(105, a); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${tc}" stroke-width="3.2"/>`; } }
      if (T === "sub") for (let m = 1; m < 15; m++) { if (m % 5 === 0) continue; const [x1, y1] = P(118, m * 6), [x2, y2] = P(112, m * 6); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${tc}" stroke-width="1.4"/>`; }
      const [a1, b1] = P(119, -5.5), [a2, b2] = P(119, 5.5), [a3, b3] = P(104, 0);
      g += `<path d="M${a1} ${b1}L${a2} ${b2}L${a3} ${b3}Z" fill="${tc}"/>`;
      if (T === "sub") g += `<circle cx="200" cy="${300 - 113}" r="3.2" fill="${lume}" stroke="#888" stroke-width=".6"/>`;
    } else if (T === "gmt" || T === "exp2") {
      for (let h = 2; h < 24; h += 2) g += txt(h, h * 15, h >= 10 ? 11 : 12.5);
      for (let h = 1; h < 24; h += 2) { const [x1, y1] = P(118, h * 15), [x2, y2] = P(106, h * 15); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${tc}" stroke-width="3"/>`; }
      const [a1, b1] = P(119, -5.5), [a2, b2] = P(119, 5.5), [a3, b3] = P(104, 0);
      g += `<path d="M${a1} ${b1}L${a2} ${b2}L${a3} ${b3}Z" fill="${tc}"/>`;
    } else if (T === "daytona") {
      [400, 300, 240, 200, 180, 150, 130, 120, 110, 100, 90, 85, 80, 75, 70, 65].forEach(v => { const a = 3600 / v * 6; g += txt(v, a, 9.5); });
      const [x0, y0] = P(117, 0); g += `<text x="${x0}" y="${y0 + 8}" font-size="8" fill="${tc}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" letter-spacing="1">TACHY</text>`;
    }
  } else if (bz && bz.startsWith("fluted")) {
    const mat = bz === "fluted-gold" ? "gold" : bz === "fluted-rose" ? "everose" : (ms.bezel === "steel" ? "platinum" : ms.bezel);
    const st = METALS[mat];
    const thin = bz === "fluted-thin";
    const rIn = thin ? 108 : 101;
    g += `<circle cx="200" cy="300" r="127" fill="url(#${u}c${mat})"/>`;
    const n = thin ? 120 : 72;
    for (let i = 0; i < n; i++) { const a = i * 360 / n; g += `<path d="${arc(rIn, 126, a, a + 360 / n / 2)}" fill="${i % 3 === 0 ? st[0] : st[2]}" opacity=".85"/>`; }
    g += `<circle cx="200" cy="300" r="${(rIn + 126) / 2}" fill="none" stroke="url(#${u}dome)" stroke-width="${126 - rIn}" opacity=".7"/>`;
    if (thin) g += `<path d="${arc(101, 108, 0, 359.99)}" fill="url(#${u}c${mat})"/>`;
  } else {
    const mat = ms.bezel === "steel" ? "steel" : ms.bezel;
    g += `<circle cx="200" cy="300" r="127" fill="url(#${u}c${mat})"/><circle cx="200" cy="300" r="114" fill="none" stroke="url(#${u}dome)" stroke-width="26"/>`;
    g += `<circle cx="200" cy="300" r="101" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1"/>`;
  }

  // rehaut + cadran
  g += `<circle cx="200" cy="300" r="101" fill="${light ? "#d9d9d6" : "#202124"}"/>`;
  g += `<circle cx="200" cy="300" r="96" fill="${dialFill}"/><circle cx="200" cy="300" r="96" fill="url(#${u}sun)"/>`;
  // minuterie
  for (let m = 0; m < 60; m++) {
    const a = m * 6, big = m % 5 === 0;
    const [x1, y1] = P(95, a), [x2, y2] = P(big ? 89 : 91.5, a);
    g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="${big ? 1.6 : .8}" opacity=".85"/>`;
  }
  if (s.red) g += `<text x="200" y="350" font-size="7.5" fill="#c8202b" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" letter-spacing=".8" font-weight="700">1220m</text>`;

  // index
  const hasDate = !!s.date && T !== "daytona";
  const idxMetal = ms.hands === "gold" ? "gold" : ms.hands === "everose" ? "everose" : "platinum";
  const lumeDots = ["sub", "gmt", "yacht", "exp2"].includes(T);
  if (lumeDots) {
    for (let h = 0; h < 12; h++) {
      const a = h * 30;
      if (h === 3 && hasDate) continue;
      if (h === 0) { const [x1, y1] = P(86, -7), [x2, y2] = P(86, 7), [x3, y3] = P(64, 0); g += `<path d="M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}Z" fill="${lume}" stroke="url(#${u}bp${idxMetal})" stroke-width="2" filter="url(#${u}ds)"/>`; continue; }
      if (h === 6 || h === 9 || h === 3) { const [x, y] = P(76, a); g += `<rect x="${x - 4.5}" y="${y - 11}" width="9" height="22" rx="1" fill="${lume}" stroke="url(#${u}bp${idxMetal})" stroke-width="2" transform="rotate(${a} ${x} ${y})" filter="url(#${u}ds)"/>`; continue; }
      const [x, y] = P(78, a); g += `<circle cx="${x}" cy="${y}" r="7" fill="${lume}" stroke="url(#${u}bp${idxMetal})" stroke-width="2" filter="url(#${u}ds)"/>`;
    }
  } else if (T === "explorer" || T === "airking" || T === "1908") {
    const nums = T === "1908" ? { 0: "12", 3: "3", 9: "9" } : T === "airking" ? { 3: "3", 6: "6", 9: "9" } : { 3: "3", 6: "6", 9: "9" };
    for (let h = 0; h < 12; h++) {
      const a = h * 30;
      if (T === "1908" && h === 6) continue;
      if (nums[h]) { const [x, y] = P(T === "1908" ? 76 : 72, a); g += `<text x="${x}" y="${y}" font-size="${T === "1908" ? 22 : 26}" font-weight="${T === "1908" ? 400 : 700}" fill="${T === "1908" ? "#2c2c2e" : lume}" text-anchor="middle" dominant-baseline="central" font-family="${T === "1908" ? "Georgia,serif" : "Helvetica,Arial,sans-serif"}" stroke="${T === "1908" ? "none" : "#b9bcc0"}" stroke-width=".8">${nums[h]}</text>`; continue; }
      if (h === 0 && T !== "1908") { const [x1, y1] = P(87, -7), [x2, y2] = P(87, 7), [x3, y3] = P(66, 0); g += `<path d="M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}Z" fill="${lume}" stroke="#b9bcc0" stroke-width="1.6"/>`; continue; }
      const [x, y] = P(78, a); g += `<rect x="${x - 2.5}" y="${y - 9}" width="5" height="18" rx="1" fill="${T === "1908" ? "#2c2c2e" : lume}" stroke="${T === "1908" ? "none" : "#b9bcc0"}" stroke-width="1.2" transform="rotate(${a} ${x} ${y})"/>`;
    }
    if (T === "airking") for (let m = 5; m <= 55; m += 5) { if (m % 15 === 0) continue; const [x, y] = P(87, m * 6); g += `<text x="${x}" y="${y}" font-size="8" fill="${ink}" text-anchor="middle" dominant-baseline="central" font-family="Helvetica,Arial,sans-serif">${m}</text>`; }
    if (T === "1908") { g += `<circle cx="200" cy="350" r="20" fill="none" stroke="#2c2c2e" stroke-width=".8"/>`; for (let i = 0; i < 60; i += 5) { const [x1, y1] = P(20, i * 6, 200, 350), [x2, y2] = P(16, i * 6, 200, 350); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2c2c2e" stroke-width=".8"/>`; } }
  } else {
    const roman = s.roman;
    const R = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
    for (let h = 0; h < 12; h++) {
      const a = h * 30;
      if (h === 3 && hasDate) continue;
      if (T === "daydate" && h === 0) continue;
      if (T === "daytona" && (h === 3 || h === 6 || h === 9)) continue;
      if (roman) { const [x, y] = P(76, a); g += `<text x="${x}" y="${y}" font-size="15" font-weight="700" fill="url(#${u}bp${idxMetal})" stroke="rgba(0,0,0,.25)" stroke-width=".4" text-anchor="middle" dominant-baseline="central" transform="rotate(${a} ${x} ${y})" font-family="Georgia,serif">${R[h]}</text>`; continue; }
      const dbl = h === 0;
      const [x, y] = P(T === "daytona" ? 80 : 77, a);
      const len = T === "daytona" ? 14 : 20, w = dbl ? 4.5 : 5.5;
      if (dbl) { g += `<rect x="${x - 7}" y="${y - len / 2}" width="${w}" height="${len}" rx="1" fill="url(#${u}bp${idxMetal})" filter="url(#${u}ds)" transform="rotate(${a} ${x} ${y})"/><rect x="${x + 2.5}" y="${y - len / 2}" width="${w}" height="${len}" rx="1" fill="url(#${u}bp${idxMetal})" filter="url(#${u}ds)" transform="rotate(${a} ${x} ${y})"/>`; }
      else g += `<rect x="${x - w / 2}" y="${y - len / 2}" width="${w}" height="${len}" rx="1" fill="url(#${u}bp${idxMetal})" filter="url(#${u}ds)" transform="rotate(${a} ${x} ${y})"/><rect x="${x - 1}" y="${y - len / 2 + 2}" width="2" height="${len * .5}" fill="${lume}" transform="rotate(${a} ${x} ${y})"/>`;
    }
  }

  // compteurs Daytona
  if (T === "daytona") {
    [[-48, 0], [48, 0], [0, 48]].forEach(([dx, dy]) => {
      const cx = 200 + dx, cy = 300 + dy;
      g += `<circle cx="${cx}" cy="${cy}" r="23" fill="${s.sub}" stroke="url(#${u}bp${idxMetal})" stroke-width="2.2"/>`;
      const sc = lum(s.sub) > 0.5 ? "#222" : "#eee";
      for (let i = 0; i < 12; i++) { const [x1, y1] = P(21, i * 30, cx, cy), [x2, y2] = P(17, i * 30, cx, cy); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${sc}" stroke-width="1"/>`; }
      g += `<line x1="${cx}" y1="${cy}" x2="${cx + 12}" y2="${cy - 12}" stroke="${sc}" stroke-width="1.6" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="2" fill="${sc}"/>`;
    });
  }
  // Sky-Dweller : disque 24 h excentré
  if (T === "sky") {
    g += `<circle cx="200" cy="334" r="30" fill="none" stroke="${ink}" stroke-width=".8" opacity=".6"/>`;
    for (let i = 0; i < 24; i++) { const [x1, y1] = P(30, i * 15, 200, 334), [x2, y2] = P(26, i * 15, 200, 334); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width=".8" opacity=".7"/>`; }
    const [tx, ty] = P(30, 0, 200, 334); g += `<path d="M${tx - 4} ${ty - 5}L${tx + 4} ${ty - 5}L${tx} ${ty + 1}Z" fill="#d12a2a"/>`;
    for (let h = 1; h < 12; h++) { if (h === 3) continue; const [x, y] = P(64, h * 30); g += `<rect x="${x - 3}" y="${y - 2.5}" width="6" height="5" fill="${h === 11 ? "#d12a2a" : "rgba(255,255,255,.25)"}"/>`; }
  }
  // Day-Date : jour à 12 h
  if (T === "daydate") {
    g += `<path d="M160 225 Q200 210 240 225 L236 245 Q200 233 164 245Z" fill="#fff" stroke="url(#${u}bp${idxMetal})" stroke-width="2"/>`;
    g += `<text x="200" y="236" font-size="11" font-weight="700" fill="#1a1a1a" text-anchor="middle" dominant-baseline="central" font-family="Helvetica,Arial,sans-serif" letter-spacing="1">SAMEDI</text>`;
  }
  // date + loupe Cyclope
  if (hasDate) {
    g += `<rect x="252" y="289" width="24" height="22" rx="2" fill="#fff" stroke="url(#${u}bp${idxMetal})" stroke-width="1.8"/>`;
    g += `<text x="264" y="300.5" font-size="17" font-weight="700" fill="#111" text-anchor="middle" dominant-baseline="central" font-family="Helvetica,Arial,sans-serif">14</text>`;
    g += `<rect x="247" y="285" width="34" height="30" rx="6" fill="url(#${u}glass)" stroke="rgba(255,255,255,.55)" stroke-width="1"/>`;
  }

  // aiguilles (10 h 10)
  const hm = `url(#${u}bp${handM === "steel" ? "platinum" : handM})`;
  const hand = (a, body) => `<g transform="rotate(${a} 200 300)" filter="url(#${u}ds)">${body}</g>`;
  const sport = ["sub", "gmt", "yacht", "exp2", "explorer", "airking"].includes(T);
  if (T === "gmt" || T === "exp2") {
    const gc = T === "exp2" ? "#e86a12" : (Array.isArray(s.insert) && s.insert[0] === "#0c0c0e") ? "#c9a24a" : (T === "gmt" && Array.isArray(s.insert) && s.insert[1] === "#0c0c0e") ? "#2e8a4b" : "#c8202b";
    g += hand(150, `<rect x="198.8" y="216" width="2.4" height="84" fill="${gc}"/><path d="M192 222L208 222L200 205Z" fill="${gc}" stroke="${hm}" stroke-width="1"/>`);
  }
  if (sport) {
    g += hand(305, `<path d="M197 300V250h6v50Z" fill="${hm}"/><circle cx="200" cy="243" r="11" fill="${lume}" stroke="${hm}" stroke-width="3"/><path d="M200 232v22M190.5 248.5 200 243l9.5 5.5" stroke="${hm}" stroke-width="2.2" fill="none"/><path d="M196.5 232L200 220L203.5 232Z" fill="${hm}"/>`);
    g += hand(60, `<path d="M195.5 300V226L200 216L204.5 226V300Z" fill="${lume}" stroke="${hm}" stroke-width="2.2"/>`);
  } else if (T === "1908") {
    g += hand(305, `<path d="M200 300L196 262L200 246L204 262Z" fill="#2c2c2e"/>`);
    g += hand(60, `<path d="M200 300L197 240L200 216L203 240Z" fill="#2c2c2e"/>`);
  } else {
    g += hand(305, `<path d="M196 302V252L200 244L204 252V302Z" fill="${hm}"/><rect x="198.6" y="254" width="2.8" height="36" fill="${lume}"/>`);
    g += hand(60, `<path d="M196.5 302V222L200 212L203.5 222V302Z" fill="${hm}"/><rect x="199" y="224" width="2" height="60" fill="${lume}"/>`);
  }
  if (T === "1908") g += `<line x1="200" y1="350" x2="${200 + 14 * Math.sin(1.2)}" y2="${350 - 14 * Math.cos(1.2)}" stroke="#2c2c2e" stroke-width="1"/>`;
  else {
    const sc = T === "sea" ? "#c8202b" : (light && !sport ? "#1b1b1d" : hm);
    g += hand(186, `<rect x="199.2" y="214" width="1.6" height="112" fill="${sc}"/>${sport ? `<circle cx="200" cy="236" r="5" fill="${lume}" stroke="${sc}" stroke-width="1.6"/>` : ""}`);
  }
  g += `<circle cx="200" cy="300" r="4.5" fill="${hm}" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>`;
  // reflet du verre
  g += `<path d="M110 270 A96 96 0 0 1 250 213 L235 240 A70 70 0 0 0 135 282Z" fill="#fff" opacity=".09"/>`;
  g += `<circle cx="200" cy="300" r="96" fill="url(#${u}glass)" opacity=".5"/>`;
  g += "</g>";

  const vb = o.vb || "0 0 400 600";
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(o.label || "")}" preserveAspectRatio="${o.par || "xMidYMid meet"}">${g}</svg>`;
}
// Vues de la galerie : montre entière, cadran, lunette, bracelet/fermoir
const VUES = [
  { nom: "Vue de face", vb: "0 0 400 600" },
  { nom: "Le cadran", vb: "100 200 200 200" },
  { nom: "La lunette et la couronne", vb: "205 160 160 160" },
  { nom: "Le bracelet et le fermoir", vb: "105 400 190 190" },
];

