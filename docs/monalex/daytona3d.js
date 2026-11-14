// Monalex — Cosmograph Daytona 126500LN modélisée en 3D, pièce par pièce, d'après les vues de référence
// (face, 3/4, profils, arrière, fermoir). Unités : millimètres (boîtier de 40 mm), mis à l'échelle à la fin.
// Pas de logo ni de nom de marque sur le cadran : ce sont des marques déposées.
import * as THREE from "three";

const TAU = Math.PI * 2;

// --------------------------------------------------------------- textures de matière (générées une fois)
// relief du brossage : fines stries parallèles -> carte de normales
function stries(size = 512, sens = "x") {
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
  const h = new Float32Array(size * size);
  for (let i = 0; i < size; i++) { let v = 0, f = Math.random() * .5; for (let j = 0; j < size; j++) { v += (Math.random() - .5) * .35; v *= .96; h[sens === "x" ? i * size + j : j * size + i] = v + f; } }
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const H = (xx, yy) => h[((yy + size) % size) * size + ((xx + size) % size)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, k = (y * size + x) * 4;
    img.data[k] = 128 + dx * 127; img.data[k + 1] = 128 + dy * 127; img.data[k + 2] = 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}
// Côtes de Genève (bandes ondulées du rotor et des ponts)
function cotes(size = 1024, teinte = [226, 184, 90]) {
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
  const [r, v, bl] = teinte;
  for (let i = -size; i < size * 2; i += size / 14) {
    const gr = g.createLinearGradient(i, 0, i + size / 14, size / 7);
    gr.addColorStop(0, `rgb(${r * .78 | 0},${v * .78 | 0},${bl * .78 | 0})`); gr.addColorStop(.5, `rgb(${Math.min(255, r * 1.12) | 0},${Math.min(255, v * 1.12) | 0},${Math.min(255, bl * 1.12) | 0})`); gr.addColorStop(1, `rgb(${r * .78 | 0},${v * .78 | 0},${bl * .78 | 0})`);
    g.save(); g.translate(i, 0); g.rotate(-.5); g.fillStyle = gr; g.fillRect(0, -size, size / 14, size * 3); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// perlage de la platine (petits cercles grainés qui se chevauchent)
function perlage(size = 1024) {
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
  g.fillStyle = "#c9cdd3"; g.fillRect(0, 0, size, size);
  const r = size / 26;
  for (let y = 0; y < size + r; y += r * 1.1) for (let x = 0; x < size + r; x += r * 1.1) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "#eef0f3"); gr.addColorStop(.55, "#c3c7cd"); gr.addColorStop(.85, "#a9aeb5"); gr.addColorStop(1, "rgba(160,165,172,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(x + (Math.random() - .5) * 2, y + (Math.random() - .5) * 2, r, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// --------------------------------------------------------------- matières
function matieres() {
  const nBrosse = stries(512, "x");
  const poli = new THREE.MeshPhysicalMaterial({ color: 0xf1f3f6, metalness: 1, roughness: .045, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 1.45 });
  const brosse = new THREE.MeshPhysicalMaterial({ color: 0xe4e7eb, metalness: 1, roughness: .26, anisotropy: .85, anisotropyRotation: Math.PI / 2, normalMap: nBrosse, normalScale: new THREE.Vector2(.22, .22), envMapIntensity: 1.35 });
  const ceramique = new THREE.MeshPhysicalMaterial({ color: 0x020203, metalness: 0, roughness: .08, specularIntensity: .35, clearcoat: .35, clearcoatRoughness: .03, envMapIntensity: .18 });
  const orGris = new THREE.MeshPhysicalMaterial({ color: 0xf3f4f6, metalness: 1, roughness: .12, clearcoat: .4, envMapIntensity: 1.3 });
  const lume = new THREE.MeshStandardMaterial({ color: 0xf6f4ea, roughness: .55, metalness: 0 });
  const noir = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: .35, metalness: .2 });
  const or = new THREE.MeshPhysicalMaterial({ map: cotes(1024), color: 0xffffff, metalness: 1, roughness: .2, clearcoat: .6, envMapIntensity: 1.4 });
  const platine = new THREE.MeshStandardMaterial({ map: perlage(1024), color: 0xb4b9c0, metalness: .7, roughness: .45, envMapIntensity: .7 });
  const pont = new THREE.MeshPhysicalMaterial({ map: cotes(1024, [196, 202, 210]), metalness: .85, roughness: .26, clearcoat: .4, envMapIntensity: .85 });
  const rubis = new THREE.MeshPhysicalMaterial({ color: 0xa3122d, metalness: 0, roughness: .05, clearcoat: 1, envMapIntensity: 1.6, emissive: 0x3a0610, emissiveIntensity: .6 });
  const bleui = new THREE.MeshPhysicalMaterial({ color: 0x1f3f9a, metalness: 1, roughness: .18, envMapIntensity: 1.4 });
  const saphir = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transparent: true, opacity: .07, clearcoat: 1, envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide });
  return { poli, brosse, ceramique, orGris, lume, noir, or, platine, pont, rubis, bleui, saphir };
}

// remap des axes d'une géométrie (pour construire facilement des pièces extrudées)
function remap(geo, f) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const [x, y, z] = f(v.x, v.y, v.z); p.setXYZ(i, x, y, z); }
  p.needsUpdate = true; geo.computeVertexNormals(); return geo;
}
// profil tourné autour de l'axe Z (face de la montre vers +Z) : points [rayon, hauteur]
function tour(points, seg = 96) {
  const g = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  return remap(g, (x, y, z) => [x, -z, y]);
}
// roue crantée (couronne, tubes des poussoirs) : axe X
function crantee(r, dents, prof, longueur, x0) {
  const s = new THREE.Shape();
  for (let i = 0; i <= dents * 2; i++) {
    const a = i / (dents * 2) * TAU, rr = i % 2 ? r - prof : r;
    i ? s.lineTo(rr * Math.cos(a), rr * Math.sin(a)) : s.moveTo(rr, 0);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: longueur, bevelEnabled: true, bevelThickness: .25, bevelSize: .2, bevelSegments: 2, curveSegments: 2 });
  return remap(g, (x, y, z) => [x0 + z, x, y]);
}
// pavé arrondi (maillons, fermoir)
function pave(w, h, d, r = .8, seg = 3) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const bev = Math.min(.45, d / 4);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: seg, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * bev) / 2); return g;
}

// --------------------------------------------------------------- textures dessinées (cadran et lunette)
function texture(size, dessin) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  dessin(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const R_CADRAN = 15.6, R_LUN_INT = 16.5, R_LUN_EXT = 19.6;
// cadran blanc laqué : minuterie 1/4 de seconde, trois compteurs noirs
function texCadran(size) {
  return texture(size, (g, S) => {
    const k = S / (2 * R_CADRAN), C = S / 2, mm = v => v * k;
    const fond = g.createRadialGradient(C, C * .8, 0, C, C, C);
    fond.addColorStop(0, "#fbfbf8"); fond.addColorStop(.75, "#f1f0eb"); fond.addColorStop(1, "#e4e3dd");
    g.fillStyle = fond; g.fillRect(0, 0, S, S);
    g.strokeStyle = "#1a1a1a";
    for (let i = 0; i < 240; i++) {        // échelle des 1/4 de seconde
      const a = i / 240 * TAU, l = i % 20 === 0 ? 1.3 : i % 4 === 0 ? .9 : .55;
      g.lineWidth = mm(i % 4 === 0 ? .16 : .08);
      g.beginPath(); g.moveTo(C + Math.sin(a) * mm(15.2), C - Math.cos(a) * mm(15.2)); g.lineTo(C + Math.sin(a) * mm(15.2 - l), C - Math.cos(a) * mm(15.2 - l)); g.stroke();
    }
    const compteur = (cx, cy, nombres, graduations) => {
      cx = C + mm(cx); cy = C - mm(cy);
      g.fillStyle = "#0e0e0f"; g.beginPath(); g.arc(cx, cy, mm(4.35), 0, TAU); g.fill();
      g.fillStyle = "#f2f1ec"; g.beginPath(); g.arc(cx, cy, mm(3.35), 0, TAU); g.fill();
      // fines cannelures concentriques (« azuré »)
      g.strokeStyle = "rgba(0,0,0,.05)"; g.lineWidth = mm(.05);
      for (let r = .4; r < 3.3; r += .22) { g.beginPath(); g.arc(cx, cy, mm(r), 0, TAU); g.stroke(); }
      g.strokeStyle = "#f4f4f2";
      for (let i = 0; i < graduations; i++) {
        const a = i / graduations * TAU, l = i % (graduations / (nombres.length)) === 0 ? .55 : .3;
        g.lineWidth = mm(.1); g.beginPath(); g.moveTo(cx + Math.sin(a) * mm(4.25), cy - Math.cos(a) * mm(4.25)); g.lineTo(cx + Math.sin(a) * mm(4.25 - l), cy - Math.cos(a) * mm(4.25 - l)); g.stroke();
      }
      g.fillStyle = "#f4f4f2"; g.font = `600 ${mm(.95)}px Helvetica, Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      nombres.forEach((n, i) => { const a = (i + 1) / nombres.length * TAU; g.fillText(n, cx + Math.sin(a) * mm(3.85), cy - Math.cos(a) * mm(3.85)); });
    };
    compteur(7.4, 0, ["10", "20", "30"], 30);         // 3 h : minutes du chronographe
    compteur(-7.4, 0, ["20", "40", "60"], 60);        // 9 h : petite seconde
    compteur(0, -7.4, ["3", "6", "9", "12"], 24);     // 6 h : heures du chronographe
    // fine inscription neutre sous 12 h
    g.fillStyle = "#1c1c1c"; g.font = `500 ${mm(.75)}px Georgia, serif`; g.textAlign = "center";
    g.fillText("PERPETUAL · CHRONOGRAPH", C, C - mm(4.2));
  });
}
// lunette céramique : échelle tachymétrique gravée (texte clair), transparente ailleurs
function texLunette(size) {
  return texture(size, (g, S) => {
    const k = S / (2 * R_LUN_EXT), C = S / 2, mm = v => v * k;
    g.clearRect(0, 0, S, S);
    g.fillStyle = g.strokeStyle = "#e9e7e2";
    const R = 18.05;
    const valeurs = [400, 300, 240, 200, 180, 150, 140, 130, 120, 110, 100, 90, 85, 80, 75, 70, 65, 60];
    g.font = `600 ${mm(1.35)}px Helvetica, Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    for (const v of valeurs) {
      const a = 3600 / v / 60 * TAU;
      if (v !== 60) { g.save(); g.translate(C + Math.sin(a) * mm(R), C - Math.cos(a) * mm(R)); g.rotate(a); g.fillText(String(v), 0, 0); g.restore(); }
      g.lineWidth = mm(.18); g.beginPath(); g.moveTo(C + Math.sin(a) * mm(19.35), C - Math.cos(a) * mm(19.35)); g.lineTo(C + Math.sin(a) * mm(18.95), C - Math.cos(a) * mm(18.95)); g.stroke();
    }
    // inscription en haut, comme sur la vraie lunette
    g.font = `600 ${mm(1.05)}px Helvetica, Arial, sans-serif`;
    ["UNITS PER", "HOUR"].forEach((t, i) => { const a = .5 + i * .02; g.save(); g.translate(C + Math.sin(a) * mm(R + .6 - i * 1.2), C - Math.cos(a) * mm(R + .6 - i * 1.2)); g.rotate(a); g.fillText(t, 0, 0); g.restore(); });
    g.save(); g.translate(C, C - mm(R)); g.font = `600 ${mm(1.35)}px Helvetica, Arial, sans-serif`; g.fillText("60", 0, 0); g.restore();
  });
}

// --------------------------------------------------------------- mouvement automatique (vu par le fond saphir)
function mouvement(M, seg) {
  const g = new THREE.Group(), face = geo => remap(geo, (x, y, z) => [x, y, -z]);   // pièces tournées vers l'arrière
  const platine = new THREE.Mesh(face(new THREE.CircleGeometry(12.7, seg)), M.platine); platine.position.z = -6.25; g.add(platine);
  // ponts (Côtes de Genève) en relief
  const ponts = [
    [[-11.5, 2], [-3, 9.5], [4, 10.5], [6, 5], [-2, 1], [-9, -2]],
    [[2, -1], [11.6, 3.5], [11, -6], [5, -10], [0, -6]],
    [[-10.5, -4], [-4, -3], [-1, -9], [-4, -11.2], [-9, -8.5]],
  ];
  for (const p of ponts) {
    const sh = new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: .45, bevelEnabled: true, bevelThickness: .1, bevelSize: .12, bevelSegments: 2 });
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 25 + .5, uv.getY(i) / 25 + .5);
    const m = new THREE.Mesh(face(geo), M.pont); m.position.z = -6.3; g.add(m);
  }
  // rubis et vis bleuies
  const rub = new THREE.CylinderGeometry(.42, .42, .25, 16), vis = new THREE.CylinderGeometry(.5, .5, .2, 16);
  for (const [x, y] of [[-6, 6], [1, 7.5], [8, -1], [3.5, -7], [-6.5, -7], [-2.5, 3.5], [6, 3], [-8.5, 0.5]]) { const r = new THREE.Mesh(rub, M.rubis); r.rotation.x = Math.PI / 2; r.position.set(x, y, -6.85); g.add(r); }
  for (const [x, y] of [[-9.8, 1], [-1.5, 9], [10.2, 1.5], [7, -7.5], [-7.5, -9.8], [3.2, 5.5]]) { const v = new THREE.Mesh(vis, M.bleui); v.rotation.x = Math.PI / 2; v.position.set(x, y, -6.86); g.add(v);
    const fente = new THREE.Mesh(new THREE.BoxGeometry(.75, .1, .06), M.noir); fente.position.set(x, y, -6.97); fente.rotation.z = Math.random() * 3; g.add(fente); }
  // balancier qui oscille
  const bal = new THREE.Group();
  bal.add(new THREE.Mesh(new THREE.TorusGeometry(3.1, .22, 10, 48), M.or));
  for (const a of [0, Math.PI / 2]) { const bras = new THREE.Mesh(new THREE.BoxGeometry(6.2, .28, .18), M.or); bras.rotation.z = a; bal.add(bras); }
  const spiral = new THREE.Mesh(new THREE.TorusGeometry(1.6, .05, 6, 40), M.bleui); bal.add(spiral);
  bal.position.set(6.6, -4.6, -6.95); g.add(bal);
  const coqB = new THREE.Mesh(face(new THREE.ExtrudeGeometry(new THREE.Shape([[3.2, -6.5], [10.5, -6.5], [10.5, -3.6], [7, -3.6]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: .3, bevelEnabled: false })), M.pont);
  coqB.position.z = -7.0; g.add(coqB);
  // rotor en or, Côtes de Genève, sur son roulement central
  const rs = new THREE.Shape(); rs.absarc(0, 0, 12.2, 0, Math.PI, false); rs.lineTo(-2.3, 0); rs.absarc(0, 0, 2.3, Math.PI, 0, true); rs.closePath();
  const rgeo = new THREE.ExtrudeGeometry(rs, { depth: .35, bevelEnabled: true, bevelThickness: .08, bevelSize: .1, bevelSegments: 2, curveSegments: 48 });
  const uv = rgeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 26 + .5, uv.getY(i) / 26 + .5);
  const rotor = new THREE.Group(); rotor.add(new THREE.Mesh(face(rgeo), M.or));
  const masse = new THREE.Mesh(face(new THREE.TorusGeometry(11.4, .8, 10, 48, Math.PI)), M.or); masse.position.z = -.25; rotor.add(masse);
  const moyeu = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, .7, 32), M.poli); moyeu.rotation.x = Math.PI / 2; rotor.add(moyeu);
  const rubC = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .75, 16), M.rubis); rubC.rotation.x = Math.PI / 2; rotor.add(rubC);
  rotor.position.z = -7.12; g.add(rotor);
  // animation : le rotor tourne (et suit les mouvements de la montre), le balancier bat
  let tt = 0, vr = .6;
  g.userData.anime = (dt, vitesseMontre = 0) => {
    tt += dt; vr += (vitesseMontre * 2.2 - vr) * Math.min(1, dt * .8);
    rotor.rotation.z += (vr + .35) * dt;
    bal.rotation.z = Math.sin(tt * TAU * 2.5) * 1.6;
  };
  return g;
}

// --------------------------------------------------------------- la montre
export function buildDaytona({ hi = true, photo = "" } = {}) {
  const M = matieres(), w = new THREE.Group();
  const seg = hi ? 128 : 72;

  // boîtier (carrure) : flanc bombé poli, dessus brossé
  w.add(new THREE.Mesh(tour([[0, -6.0], [17.2, -6.0], [19.0, -5.4], [19.85, -3.6], [20.05, -.5], [19.95, 2.4], [19.6, 3.9], [19.0, 4.45], [16.4, 4.45]], seg), M.poli));
  // fond vissé à glace saphir : on voit le mouvement automatique
  w.add(new THREE.Mesh(tour([[12.7, -7.25], [13.1, -7.45], [14.6, -7.4], [16.4, -6.75], [17.2, -6.0]], seg), M.brosse));
  const mvt = mouvement(M, seg); w.add(mvt);
  const glaceDos = new THREE.Mesh(tour([[12.75, -7.3], [8, -7.42], [0, -7.45]], seg), M.saphir); w.add(glaceDos);
  if (photo) {
    // --- version photoréaliste : la vraie photo de face (cadran, compteurs, aiguilles, lunette) posée sur le relief 3D
    const tex = new THREE.TextureLoader().load(photo, () => { if (w.userData.onPret) w.userData.onPret(); });
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const RT = 20.93;                                   // rayon couvert par la photo, en mm (lunette = 19.95 mm)
    const planaire = geo => { const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv[i * 2] = .5 + p.getX(i) / (2 * RT); uv[i * 2 + 1] = .5 + p.getY(i) / (2 * RT); }
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); return geo; };
    const photoMat = new THREE.MeshBasicMaterial({ map: tex });
    const RI = 14.6, RC = 14.35;                        // bord intérieur de la lunette et du cadran, mesurés sur la photo
    // lunette : relief arrondi, avec la vraie lunette de la photo
    w.add(new THREE.Mesh(planaire(tour([[19.9, 4.45], [19.97, 4.85], [19.85, 5.2], [19.4, 5.42], [16.2, 5.36], [RI + .15, 5.12], [RI, 4.95], [RI, 4.4]], seg)), photoMat));
    // vernis brillant de la céramique : reflets mobiles par-dessus la photo
    const glacis = new THREE.Mesh(tour([[19.85, 5.23], [19.4, 5.45], [16.2, 5.39], [RI + .15, 5.15]], seg), new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: .06, transparent: true, opacity: .55, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 1.1, depthWrite: false, blending: THREE.AdditiveBlending }));
    w.add(glacis);
    // rehaut et cadran : la photo, à plat sous le verre
    w.add(new THREE.Mesh(planaire(tour([[RC, 3.05], [RI, 4.45]], seg)), photoMat));
    const cadran = new THREE.Mesh(planaire(new THREE.CircleGeometry(RC, seg)), photoMat); cadran.position.z = 3.05; w.add(cadran);
    // verre bombé avec reflet
    const verreP = new THREE.Mesh(tour([[0, 5.62], [8, 5.55], [13, 5.38], [RI + .1, 5.1]], seg), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transparent: true, opacity: .06, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false }));
    w.add(verreP);
  } else {
    // lunette céramique (profil arrondi) + échelle gravée
    w.add(new THREE.Mesh(tour([[19.85, 4.45], [19.95, 5.2], [19.75, 6.0], [19.2, 6.35], [17.2, 6.35], [R_LUN_INT, 5.9], [R_LUN_INT, 4.4]], seg), M.ceramique));
    const lun = new THREE.Mesh(new THREE.RingGeometry(R_LUN_INT + .55, R_LUN_EXT - .1, seg, 1), new THREE.MeshStandardMaterial({ map: texLunette(hi ? 2048 : 1024), transparent: true, alphaTest: .25, roughness: .4, metalness: .6 }));
    lun.position.z = 6.36; w.add(lun);
    // rehaut (bague intérieure) et cadran
    w.add(new THREE.Mesh(tour([[R_CADRAN, 3.05], [R_LUN_INT, 4.45]], seg), new THREE.MeshStandardMaterial({ color: 0xe6e5e0, roughness: .5 })));
    const texC = texCadran(hi ? 2048 : 1024);
    const cadran = new THREE.Mesh(new THREE.CircleGeometry(R_CADRAN, seg), new THREE.MeshPhysicalMaterial({ map: texC, emissiveMap: texC, emissive: 0xffffff, emissiveIntensity: .32, roughness: .3, metalness: 0, clearcoat: .8, clearcoatRoughness: .1 }));
    cadran.position.z = 3.05; w.add(cadran);
    // bagues des compteurs en relief
    for (const [x, y] of [[7.4, 0], [-7.4, 0], [0, -7.4]]) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(4.38, .13, 8, 48), M.orGris); b.position.set(x, y, 3.12); w.add(b);
    }
    // index appliqués en or gris avec matière luminescente
    const idxGeo = pave(.95, 3.0, .55, .25, 2), lumGeo = new THREE.PlaneGeometry(.42, 2.4);
    for (let h = 0; h < 12; h++) {
      if (h === 3 || h === 6 || h === 9) continue;
      const a = h / 12 * TAU, r = 12.7;
      const pos = (n, dz) => { const m = new THREE.Mesh(n === "l" ? lumGeo : idxGeo, n === "l" ? M.lume : M.orGris); m.position.set(Math.sin(a) * r, Math.cos(a) * r, 3.35 + dz); m.rotation.z = -a; return m; };
      if (h === 0) { for (const dx of [-.75, .75]) { const m = pos("i", 0), l = pos("l", .3); m.position.x += dx; l.position.x += dx; w.add(m, l); } }
      else w.add(pos("i", 0), pos("l", .3));
    }
    // aiguilles (10 h 10) : bâtons en or gris avec luminescent ; trotteuse centrale ; aiguilles des compteurs
    const aiguille = (long, larg, z, angle, avecLume = true) => {
      const s = new THREE.Shape(); s.moveTo(-larg / 2, -1.6); s.lineTo(larg / 2, -1.6); s.lineTo(larg / 2, long - larg); s.lineTo(0, long); s.lineTo(-larg / 2, long - larg); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: .22, bevelEnabled: true, bevelThickness: .06, bevelSize: .05, bevelSegments: 1 });
      const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, M.orGris));
      if (avecLume) { const l = new THREE.Mesh(new THREE.PlaneGeometry(larg * .45, long * .62), M.lume); l.position.set(0, long * .52, .32); grp.add(l); }
      grp.position.z = z; grp.rotation.z = -angle; return grp;
    };
    w.add(aiguille(9.2, 1.25, 3.6, (10 + 10 / 60) / 12 * TAU));
    w.add(aiguille(13.4, 1.0, 3.95, 10 / 60 * TAU));
    const trot = new THREE.Group();
    trot.add(new THREE.Mesh(new THREE.BoxGeometry(.18, 18, .12), M.orGris)); trot.children[0].position.y = 4.8;
    const cw = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .14, 24), M.orGris); cw.rotation.x = Math.PI / 2; cw.position.y = -3.4; trot.add(cw);
    trot.position.z = 4.3; w.add(trot);
    const centre = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 1.4, 24), M.orGris); centre.rotation.x = Math.PI / 2; centre.position.z = 3.8; w.add(centre);
    for (const [x, y, a] of [[7.4, 0, 1.2], [-7.4, 0, 4.6], [0, -7.4, 2.4]]) {
      const pa = new THREE.Mesh(new THREE.BoxGeometry(.2, 3.3, .1), M.orGris); pa.geometry.translate(0, 1.4, 0);
      pa.position.set(x, y, 3.25); pa.rotation.z = -a; w.add(pa);
      const ax = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .3, 16), M.orGris); ax.rotation.x = Math.PI / 2; ax.position.set(x, y, 3.3); w.add(ax);
    }
  }
  // verre saphir (léger reflet) — version dessinée
  if (!photo) { const verre = new THREE.Mesh(new THREE.CircleGeometry(R_LUN_INT + .2, seg), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transparent: true, opacity: .035, clearcoat: 1, envMapIntensity: 1.2, depthWrite: false }));
  verre.position.z = 6.0; w.add(verre); }

  // cornes galbées (vue de profil) : 4 pièces extrudées
  const corne = new THREE.Shape();
  corne.moveTo(15.5, -5.2); corne.lineTo(22.4, -5.0); corne.quadraticCurveTo(24.4, -4.7, 24.0, -2.2);
  corne.quadraticCurveTo(22.6, 2.6, 17.2, 3.6); corne.lineTo(15.5, 3.7); corne.closePath();
  const corneGeo = new THREE.ExtrudeGeometry(corne, { depth: 3.0, bevelEnabled: true, bevelThickness: .55, bevelSize: .5, bevelSegments: 3, curveSegments: 12 });
  for (const sy of [1, -1]) for (const sx of [1, -1]) {
    const g = remap(corneGeo.clone(), (x, y, z) => [sx * (10.15 + z), sy * x, y]);
    w.add(new THREE.Mesh(g, M.poli));
  }
  // protège-couronne et couronne Triplock cannelée
  const prot = new THREE.Shape(); prot.moveTo(-5.4, 0); prot.quadraticCurveTo(-4.4, 2.6, -2.4, 2.7); prot.lineTo(2.4, 2.7); prot.quadraticCurveTo(4.4, 2.6, 5.4, 0); prot.closePath();
  const protGeo = new THREE.ExtrudeGeometry(prot, { depth: 4.2, bevelEnabled: true, bevelThickness: .4, bevelSize: .4, bevelSegments: 2, curveSegments: 10 });
  w.add(new THREE.Mesh(remap(protGeo, (x, y, z) => [19.4 + y, x, z - 3.4]), M.poli));
  w.add(new THREE.Mesh(crantee(3.0, 30, .22, 3.4, 21.3), M.poli));
  const tete = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.75, .5, 48), M.poli); tete.rotation.z = Math.PI / 2; tete.position.x = 25.0; w.add(tete);
  // poussoirs vissés du chronographe (2 h et 4 h)
  for (const sy of [1, -1]) {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(crantee(2.25, 22, .18, 3.0, 0), M.poli));
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 2.2, 32), M.poli); p.rotation.z = Math.PI / 2; p.position.x = 4.0; grp.add(p);
    const bout = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.45, .35, 32), M.poli); bout.rotation.z = Math.PI / 2; bout.position.x = 5.25; grp.add(bout);
    grp.position.set(18.0, sy * 10.9, -.6); grp.rotation.z = sy * .5; w.add(grp);
  }

  // --- embouts pleins qui épousent le boîtier entre les cornes
  const embout = new THREE.Shape();
  embout.moveTo(19.4, -4.9); embout.lineTo(24.4, -4.9); embout.quadraticCurveTo(25.3, -4.8, 25.2, -3.2);
  embout.lineTo(25.0, -.6); embout.quadraticCurveTo(24.6, .9, 22.6, 1.3); embout.lineTo(20.6, 1.5);
  embout.absarc(0, 0, 20.55, Math.asin(1.5 / 20.55), -Math.asin(4.9 / 20.55), true); embout.closePath();
  const emboutGeo = new THREE.ExtrudeGeometry(embout, { depth: 19.6, bevelEnabled: true, bevelThickness: .35, bevelSize: .35, bevelSegments: 3, curveSegments: 24 });
  for (const sy of [1, -1]) w.add(new THREE.Mesh(remap(emboutGeo.clone(), (x, y, z) => [z - 9.8, sy * x, y]), M.brosse));

  // --- bracelet Oyster : maillons extérieurs larges et bombés (brossés), maillon central plus étroit et poli, chanfreins
  const profil = (larg, haut, bombe) => {
    const sh = new THREE.Shape(), l = larg / 2;
    sh.moveTo(-l + .5, -haut / 2); sh.lineTo(l - .5, -haut / 2); sh.quadraticCurveTo(l, -haut / 2, l, -haut / 2 + .5);
    sh.lineTo(l, haut / 2 - .7); sh.quadraticCurveTo(l * .6, haut / 2 + bombe, 0, haut / 2 + bombe);
    sh.quadraticCurveTo(-l * .6, haut / 2 + bombe, -l, haut / 2 - .7); sh.lineTo(-l, -haut / 2 + .5); sh.quadraticCurveTo(-l, -haut / 2, -l + .5, -haut / 2);
    return sh;
  };
  const maillon = (larg, haut, bombe, long) => {
    const g = new THREE.ExtrudeGeometry(profil(larg, haut, bombe), { depth: long - .5, bevelEnabled: true, bevelThickness: .25, bevelSize: .22, bevelSegments: hi ? 3 : 2, curveSegments: hi ? 10 : 6 });
    return remap(g, (x, y, z) => [x, z - (long - .5) / 2, y]);
  };
  const pas = 4.75;
  const a = 26.2, b = 22.5, c = -6.5;                 // boucle du poignet (ovale), départ au bout des embouts
  const t0 = Math.asin(25.6 / a);
  const pts = []; let L = 0, prev = null;
  for (let i = 0; i <= 800; i++) { const t = t0 + (TAU - 2 * t0) * i / 800; const p = new THREE.Vector2(a * Math.sin(t), c + b * Math.cos(t)); if (prev) L += p.distanceTo(prev); pts.push({ t, L, p }); prev = p; }
  const n = Math.floor(L / pas);
  const gExt = maillon(6.3, 2.9, .45, pas), gMil = maillon(6.9, 3.15, .25, pas);
  const iExt = new THREE.InstancedMesh(gExt, M.brosse, n * 2), iMil = new THREE.InstancedMesh(gMil, M.poli, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  let k = 0, j = 0;
  const OUV = .9, tFerm = Math.PI - OUV - .5;            // bracelet ouvert derrière (on voit le mouvement), fermoir au bout du brin du haut
  for (let i = 0; i < n; i++) {
    const s = (i + .5) * pas, pt = pts.find(x => x.L >= s) || pts[pts.length - 1], t = pt.t;
    const u = (t - t0) / (TAU - 2 * t0), larg = 1 - .2 * Math.sin(u * Math.PI);   // 20 mm aux cornes -> 16 mm au fermoir
    if (Math.abs(t - Math.PI) < OUV || Math.abs(t - tFerm) < .5) continue;
    e.set(-t, 0, 0); q.setFromEuler(e); sc.set(larg, 1, 1);   // à plat sur le poignet, dans le sens du bracelet
    pos.set(0, pt.p.x, pt.p.y); iMil.setMatrixAt(j++, m4.compose(pos, q, sc));
    for (const sx of [-1, 1]) { pos.set(sx * 6.62 * larg, pt.p.x, pt.p.y); iExt.setMatrixAt(k++, m4.compose(pos, q, sc)); }
  }
  iExt.count = k; iMil.count = j;
  w.add(iExt, iMil);

  // --- fermoir Oysterlock sous le poignet : capot poli bombé, flancs brossés, levier de sécurité
  const fermoir = new THREE.Group();
  const capot = new THREE.Mesh(maillon(17.6, 1.6, .55, 22), M.poli); capot.position.z = .9; fermoir.add(capot);
  for (const sx of [-1, 1]) { const flanc = new THREE.Mesh(maillon(1.8, 3.2, .2, 22), M.brosse); flanc.position.set(sx * 8.3, 0, -.3); fermoir.add(flanc); }
  const levier = new THREE.Mesh(maillon(10, 1.1, .3, 5.5), M.poli); levier.position.set(0, -9.5, 1.95); fermoir.add(levier);
  const rainure = new THREE.Mesh(new THREE.BoxGeometry(16.6, .16, .3), M.noir); rainure.position.set(0, 7.4, 1.85); fermoir.add(rainure);
  // posé sur le poignet, dans l'axe du bracelet, à la place des maillons qu'il recouvre
  fermoir.rotation.x = -tFerm; fermoir.position.set(0, a * Math.sin(tFerm), c + b * Math.cos(tFerm)); fermoir.scale.set(.82, 1, 1);
  w.add(fermoir);

  w.scale.setScalar(4.6 / 52);          // la montre et son bracelet tiennent dans le cadre
  w.userData.daytona = true;
  w.userData.anime = mvt.userData.anime;
  return w;
}

// Studio photo de joaillerie : fond sombre, grandes boîtes à lumière et bandes fines -> acier contrasté, céramique noire profonde
export function studioDaytona(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: 0x404348, side: THREE.BackSide })));
  const boite = (w, h, x, y, z, rx, ry, lum) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(lum), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
  };
  boite(14, 6, 0, 10, 2, Math.PI / 2, 0, 3.2);          // grande boîte à lumière au-dessus
  boite(2.2, 16, -9, 0, 4, 0, Math.PI / 2.5, 7);        // bande verticale à gauche
  boite(1.1, 16, 9, 0, 5, 0, -Math.PI / 2.4, 5);        // bande fine à droite
  boite(12, 2.2, 0, -5, 10, -.3, Math.PI, 1.6);         // réflecteur bas, devant
  boite(4, 12, 0, 2, -10, 0, 0, 2.6);                   // contre-jour
  boite(6, 6, 7, 7, 8, 0, -Math.PI / 4, 2.4);           // reflet d'angle
  boite(10, 8, -6, 3, 9, 0, Math.PI * .85, 2.2);        // grande boîte douce de face, à gauche
  boite(16, 4, 0, -9, 0, -Math.PI / 2, 0, .9);          // sol clair
  const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(env, .035).texture; pm.dispose(); return t;
}
