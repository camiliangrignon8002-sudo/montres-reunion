// Monalex — Cosmograph Daytona 126500LN modélisée en 3D, pièce par pièce, d'après les vues de référence
// (face, 3/4, profils, arrière, fermoir). Unités : millimètres (boîtier de 40 mm), mis à l'échelle à la fin.
// Pas de logo ni de nom de marque sur le cadran : ce sont des marques déposées.
import * as THREE from "three";

const TAU = Math.PI * 2;

// --------------------------------------------------------------- matières
function matieres(env) {
  const poli = new THREE.MeshPhysicalMaterial({ color: 0xeef0f3, metalness: 1, roughness: .1, clearcoat: .5, clearcoatRoughness: .08, envMapIntensity: 1.35 });
  const brosse = new THREE.MeshPhysicalMaterial({ color: 0xe2e5e9, metalness: 1, roughness: .3, envMapIntensity: 1.25 });
  const ceramique = new THREE.MeshPhysicalMaterial({ color: 0x020203, metalness: 0, roughness: .08, specularIntensity: .35, clearcoat: .35, clearcoatRoughness: .03, envMapIntensity: .18 });
  const orGris = new THREE.MeshPhysicalMaterial({ color: 0xf3f4f6, metalness: 1, roughness: .12, clearcoat: .4, envMapIntensity: 1.3 });
  const lume = new THREE.MeshStandardMaterial({ color: 0xf6f4ea, roughness: .55, metalness: 0 });
  const noir = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: .35, metalness: .2 });
  return { poli, brosse, ceramique, orGris, lume, noir };
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

// --------------------------------------------------------------- la montre
export function buildDaytona({ hi = true } = {}) {
  const M = matieres(), w = new THREE.Group();
  const seg = hi ? 128 : 72;

  // boîtier (carrure) : flanc bombé poli, dessus brossé
  w.add(new THREE.Mesh(tour([[0, -6.0], [17.2, -6.0], [19.0, -5.4], [19.85, -3.6], [20.05, -.5], [19.95, 2.4], [19.6, 3.9], [19.0, 4.45], [16.4, 4.45]], seg), M.poli));
  // fond vissé, légèrement bombé
  w.add(new THREE.Mesh(tour([[0, -7.1], [8, -7.05], [14, -6.75], [16.6, -6.3], [17.2, -6.0]], seg), M.brosse));
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
  // verre saphir (léger reflet)
  const verre = new THREE.Mesh(new THREE.CircleGeometry(R_LUN_INT + .2, seg), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transparent: true, opacity: .035, clearcoat: 1, envMapIntensity: 1.2, depthWrite: false }));
  verre.position.z = 6.0; w.add(verre);

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

  // bracelet Oyster : maillons extérieurs brossés, maillon central poli ; boucle autour du poignet, s'affinant jusqu'au fermoir
  const a = 27, b = 24, c = -14, t0 = Math.asin(23.6 / a), pas = 4.5;
  const pts = []; let L = 0, prev = null;
  for (let i = 0; i <= 600; i++) { const t = t0 + (TAU - 2 * t0) * i / 600; const p = new THREE.Vector2(a * Math.sin(t), c + b * Math.cos(t)); if (prev) L += p.distanceTo(prev); pts.push({ t, L, p }); prev = p; }
  const n = Math.floor(L / pas);
  const exter = pave(5.4, pas - .35, 3.0, .7, hi ? 3 : 2), milieu = pave(6.6, pas - .35, 3.2, .9, hi ? 3 : 2);
  const iExt = new THREE.InstancedMesh(exter, M.brosse, n * 2), iMil = new THREE.InstancedMesh(milieu, M.poli, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  let k = 0, j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i + .5) * pas, pt = pts.find(x => x.L >= s) || pts[pts.length - 1];
    const t = pt.t, larg = 1 - .2 * Math.sin((t - t0) / (TAU - 2 * t0) * Math.PI);   // plus fin au fermoir
    e.set(-t + Math.PI / 2, 0, 0); q.setFromEuler(e); sc.set(larg, 1, 1);
    pos.set(0, pt.p.x, pt.p.y); iMil.setMatrixAt(j++, m4.compose(pos, q, sc));
    for (const sx of [-1, 1]) { pos.set(sx * 6.05 * larg, pt.p.x, pt.p.y); iExt.setMatrixAt(k++, m4.compose(pos, q, sc)); }
  }
  w.add(iExt, iMil);
  // maillons de raccord entre les cornes
  for (const sy of [1, -1]) { const r = new THREE.Mesh(pave(20.2, 3.4, 3.4, .8), M.poli); r.position.set(0, sy * 22.4, -1.6); w.add(r); }
  // fermoir Oysterlock (sous le poignet)
  const ferm = new THREE.Mesh(pave(15.2, 19, 1.4, 2.0), M.poli); ferm.position.set(0, 0, c - b - 1.85); w.add(ferm);

  w.scale.setScalar(4.6 / 52);          // la montre et son bracelet tiennent dans le cadre
  w.userData.daytona = true;
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
