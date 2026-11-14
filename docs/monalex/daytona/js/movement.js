// INTERPRÉTATION PÉDAGOGIQUE d'un mouvement chronographe automatique inspiré du calibre 4131.
// Ce n'est pas une copie certifiée : disposition, formes et nombres de dents sont plausibles, pas relevés sur pièce.
// Rouages : barillet → roue de centre (1 tr/h) → roue moyenne → roue de seconde (1 tr/min) → roue d'échappement (16 tr/min,
// 15 dents → 4 dents/s = 4 Hz, 28 800 alt/h) → ancre → balancier-spiral. Vu depuis le fond (vers -Z).
import * as THREE from "three";
import { D } from "./dims.js";
import { TAU, roue, plaque, uvPlan, tour, piece } from "./geo.js";

const ZP = -1.2, Z_ROUE = -2.25, Z_PONT = -2.95, Z_ROTOR = -4.0;  // niveaux (estimés)

function enveloppe(cercles, n = 28) {          // enveloppe convexe de cercles → forme de pont arrondie
  const pts = [];
  for (const [x, y, r] of cercles) for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

export function mouvement(M) {
  const g = new THREE.Group(); g.name = "mouvement";
  const rouge = new THREE.MeshPhysicalMaterial({ name: "Aluminium anodisé rouge", color: 0xb3242e, metalness: .7, roughness: .3, side: THREE.DoubleSide });
  // --- platine perlée
  const platGeo = new THREE.CylinderGeometry(14.2, 14.2, 1.2, 128).rotateX(Math.PI / 2).translate(0, 0, ZP);
  g.add(piece(new THREE.Mesh(platGeo, [M.acierMvt, M.platine, M.platine]), "Platine", "Plaque de base du mouvement, décorée d'un perlage (cercles qui se chevauchent)."));
  g.add(new THREE.Mesh(tour([[14.22, -4.8], [14.55, -4.8], [14.55, -.6], [14.22, -.6]], 128), M.acierMvt)); // cercle d'emboîtage

  // --- rouage (positions estimées, entraxes calculés pour que roues et pignons engrènent)
  const P = {};
  P.C = [0, 0];
  P.B = [-.8 * 5.25, .6 * 5.25];
  P.T = [.55 * 4.4, .83 * 4.4];
  P.F = [P.T[0] + 3.63, P.T[1] + .37];
  P.E = [P.F[0] + .35 * 3.15, P.F[1] - .94 * 3.15];
  P.A = [P.E[0] - .1, P.E[1] - 3.0];             // axe de l'ancre
  P.Bal = [5.0, -6.3];
  P.Col = [-6.6, -5.4];
  const mobiles = {};
  const mobile = (nom, details, [x, y], rW, dents, rPig, feuilles, z = Z_ROUE, mat = M.laiton, opts = {}) => {
    const p = new THREE.Group(); p.position.set(x, y, z);
    p.add(new THREE.Mesh(roue(rW, dents, { prof: Math.min(.32, rW * .09), ep: .28, bras: rW > 1.6 ? 4 : 0, rMoyeu: rW * .22, bev: .02, ...opts }), mat));
    if (rPig) p.add(new THREE.Mesh(roue(rPig, feuilles, { prof: rPig * .28, ep: .7, bev: 0 }).translate(0, 0, .45), M.acierMvt));
    p.add(new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 1.8, 12).rotateX(Math.PI / 2), M.acierMvt));
    g.add(piece(p, nom, details)); mobiles[nom] = p; return p;
  };
  const barillet = mobile("Barillet", "Contient le ressort de marche : environ 72 h de réserve (officiel).", P.B, 4.6, 90, 0, 0, Z_ROUE - .25, M.laiton);
  barillet.add(new THREE.Mesh(new THREE.CylinderGeometry(4.15, 4.15, .9, 64).rotateX(Math.PI / 2).translate(0, 0, .5), M.acierMvt));
  const centre = mobile("Roue de centre", "Un tour par heure. Entraîne l'aiguille des minutes.", P.C, 3.9, 80, .9, 12);
  const moyenne = mobile("Roue moyenne", "Démultiplie entre la roue de centre et la roue de seconde (rapport 8).", P.T, 3.2, 75, .7, 10);
  const seconde = mobile("Roue de seconde", "Un tour par minute. Entraîne la petite seconde à 9 h.", P.F, 2.8, 80, .65, 10);
  // roue d'échappement : 15 dents en forme de crochet
  const ech = new THREE.Group(); ech.position.set(...P.E, Z_ROUE);
  {
    const s = new THREE.Shape(), n = 15, r0 = 1.35, r1 = 2.0;
    for (let i = 0; i < n; i++) { const a = i / n * TAU, da = TAU / n; const pts = [[r0, a], [r1, a + da * .12], [r1 - .12, a + da * .3], [r0, a + da * .62]]; pts.forEach(([r, b], k) => (i === 0 && k === 0 ? s.moveTo : s.lineTo).call(s, r * Math.cos(b), r * Math.sin(b))); }
    for (let b = 0; b < 4; b++) { const h = new THREE.Path(), a0 = b / 4 * TAU + .25, a1 = (b + 1) / 4 * TAU - .25; h.absarc(0, 0, 1.05, a0, a1, false); h.absarc(0, 0, .45, a1 - .2, a0 + .2, true); h.closePath(); s.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(s, { depth: .22, bevelEnabled: false, curveSegments: 4 }); geo.translate(0, 0, -.11);
    ech.add(new THREE.Mesh(geo, M.acierMvt));
    ech.add(new THREE.Mesh(roue(.55, 8, { prof: .16, ep: .7, bev: 0 }).translate(0, 0, .45), M.acierMvt));
    ech.add(new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, 1.6, 12).rotateX(Math.PI / 2), M.acierMvt));
  }
  g.add(piece(ech, "Roue d'échappement", "15 dents, 16 tours par minute : libère le rouage 8 fois par seconde."));
  // ancre (pivot en P.A) : bras vers la roue, dard vers le balancier
  const ancre = new THREE.Group(); ancre.position.set(...P.A, Z_ROUE - .05);
  {
    const ang = Math.atan2(P.Bal[1] - P.A[1], P.Bal[0] - P.A[0]), L = Math.hypot(P.Bal[0] - P.A[0], P.Bal[1] - P.A[1]) - .9;
    const corps = new THREE.Group(); corps.rotation.z = ang;
    corps.add(new THREE.Mesh(plaque([[0, -.32], [L - .5, -.18], [L, -.38], [L + .25, -.12], [L + .25, .12], [L, .38], [L - .5, .18], [0, .32]], .2, .02), M.acierMvt));
    // traverse des levées, côté roue
    const tr = new THREE.Group(); tr.rotation.z = -ang + Math.PI / 2; corps.add(tr);
    tr.add(new THREE.Mesh(plaque([[-1.9, 2.0], [-1.5, 2.45], [0, .4], [1.5, 2.45], [1.9, 2.0], [0, -.45]], .2, .02), M.acierMvt));
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.28, .7, .3), M.rubis); l.position.set(sx * 1.7, 2.55, 0); l.rotation.z = sx * .5; tr.add(l); }
    ancre.add(corps);
    ancre.add(new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 1.4, 10).rotateX(Math.PI / 2), M.acierMvt));
  }
  g.add(piece(ancre, "Ancre", "Pièce en acier à deux levées en rubis : bloque et libère la roue d'échappement à chaque alternance."));
  // balancier (or, inerties variables) + spiral bleu
  const bal = new THREE.Group(); bal.position.set(...P.Bal, Z_ROUE - .1);
  {
    bal.add(new THREE.Mesh(tour([[3.75, -.25], [4.25, -.25], [4.25, .25], [3.75, .25], [3.75, -.25]], 96), M.laiton));
    for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(7.6, .5, .22), M.laiton); b.rotation.z = a; bal.add(b); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4, m = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .55, 16).rotateX(Math.PI / 2), M.orRotor); m.position.set(Math.cos(a) * 3.45, Math.sin(a) * 3.45, 0); bal.add(m); }
    bal.add(new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, .25, 24).rotateX(Math.PI / 2).translate(0, 0, .3), M.acierMvt));  // plateau
    bal.add(new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 2, 12).rotateX(Math.PI / 2), M.acierMvt));
  }
  g.add(piece(bal, "Balancier", "Balancier à inerties variables (écrous en or), 4 Hz : 28 800 alternances par heure (officiel)."));
  const spiralPts = []; for (let i = 0; i <= 13 * 48; i++) { const a = i / 48 * TAU, r = .55 + (2.95 - .55) * i / (13 * 48); spiralPts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0)); }
  const spiral = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPts), 13 * 48, .045, 4), M.bleui);
  spiral.position.set(...P.Bal, Z_ROUE - .55);
  g.add(piece(spiral, "Spiral Parachrom bleu", "Spiral paramagnétique bleu : insensible aux champs magnétiques et dix fois plus résistant aux chocs (selon le fabricant)."));

  // --- chronographe : roue à colonnes, leviers, ressorts, marteau
  const col = new THREE.Group(); col.position.set(...P.Col, Z_PONT - .5);
  col.add(new THREE.Mesh(roue(1.7, 21, { prof: .2, ep: .3 }), M.acierMvt));
  const colonnes = new THREE.Mesh(roue(1.25, 7, { prof: .5, ep: .65, bev: .03 }).translate(0, 0, -.45), M.acierMvt); col.add(colonnes);
  col.add(new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 1.1, 16).rotateX(Math.PI / 2).translate(0, 0, -.55), M.bleui));
  g.add(piece(col, "Roue à colonnes", "Pilote départ, arrêt et remise à zéro du chronographe (commande la plus noble)."));
  const levier = (nom, details, pts, z, pivot) => {
    const p = new THREE.Group(); p.position.set(...pivot, z);
    p.add(new THREE.Mesh(plaque(pts.map(([x, y]) => [x - pivot[0], y - pivot[1]]), .25, .04), M.acierMvt));
    p.add(new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .32, 20).rotateX(Math.PI / 2), M.bleui));
    g.add(piece(p, nom, details)); return p;
  };
  const embr = levier("Levier d'embrayage", "Accouple le chronographe au mouvement (embrayage vertical).", [[-5.4, -4.2], [-1.2, -8.6], [.6, -10.4], [1.4, -9.6], [-.5, -7.6], [-4.6, -3.4]], Z_PONT - .32, [-1.2, -8.6]);
  const frein = levier("Levier de frein", "Immobilise la trotteuse du chronographe à l'arrêt.", [[-5.3, -6.8], [-8.6, -9.2], [-9.6, -8.6], [-9.2, -7.6], [-6.0, -5.8]], Z_PONT - .32, [-9.2, -8.4]);
  const marteau = levier("Marteau de remise à zéro", "Frappe les cœurs des compteurs pour les ramener à zéro.", [[-7.8, -3.4], [-12.2, .4], [-11.6, 1.6], [-10.8, 1.2], [-7.0, -2.4]], Z_PONT - .32, [-11.4, .9]);
  const ressort = (pts, nom) => { const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, Z_PONT - .32))); g.add(piece(new THREE.Mesh(new THREE.TubeGeometry(c, 40, .1, 6), M.acierMvt), nom, "Ressort-lame en acier poli qui ramène le levier.")); };
  ressort([[-12.6, -3.6], [-11.6, -2.4], [-10.6, -2.0], [-9.4, -2.4]], "Ressort du marteau");
  ressort([[-4.0, -12.3], [-5.2, -11.2], [-6.4, -10.6], [-7.6, -9.6]], "Ressort du frein");
  ressort([[2.8, -12.4], [2.4, -11.2], [1.8, -10.6], [1.1, -10.2]], "Ressort d'embrayage");

  // --- ponts (Côtes de Genève continues, anglage poli)
  const pont = (nom, details, cercles, z = Z_PONT, ep = .7) => {
    const pts = enveloppe(cercles);
    const geo = plaque(pts, ep, .17); geo.translate(0, 0, z); uvPlan(geo, 14.2);
    const m = new THREE.Mesh(geo, [M.pont, M.acierMvt]); g.add(piece(m, nom, details)); return m;
  };
  pont("Pont de barillet", "Ponts décorés de Côtes de Genève, angles polis.", [[...P.B, 5.0], [-12.0, 3.0, 1.8], [-9.0, 9.6, 1.8], [-3.0, 11.6, 1.6], [-2.0, 6.0, 1.6]]);
  pont("Pont de rouage", "Maintient roue moyenne et roue de seconde.", [[...P.T, 1.8], [...P.F, 1.7], [11.2, 7.0, 1.6], [4.6, 11.8, 1.6], [1.6, 9.2, 1.6]]);
  pont("Pont de remontage", "Porte le rochet et la roue de couronne du remontage.", [[-12.6, -.6, 1.4], [-8.6, .4, 1.6], [-9.6, -2.8, 1.4]], Z_PONT + .05, .55);
  pont("Pont de balancier traversant", "Pont de balancier fixé en deux points : meilleure tenue aux chocs.", [[...P.Bal, 1.3], [.6, -8.8, 1.6], [11.0, -3.8, 1.6]], Z_PONT - .25, .55);
  pont("Coq d'ancre", "", [[...P.E, .95], [...P.A, .9], [10.9, -.6, 1.2]], Z_PONT + .1, .45);
  pont("Pont de chronographe", "", [[...P.Col, 1.9], [-2.0, -11.4, 1.5], [-11.4, -3.0, 1.5]], Z_PONT + .15, .5);
  // pierres (rubis) et vis bleuies
  const pierre = ([x, y], z) => { const j = new THREE.Group(); j.position.set(x, y, z); j.add(new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .16, 20).rotateX(Math.PI / 2), M.rubis)); j.add(new THREE.Mesh(new THREE.TorusGeometry(.56, .1, 8, 24), M.acierMvt)); g.add(j); return j; };
  const zDessus = z => z - .38;
  for (const p of [P.B, P.T, P.F, [-3.0, 11.6], [4.6, 11.8]]) pierre(p, zDessus(Z_PONT));
  pierre([-8.6, .4], zDessus(Z_PONT + .05));
  pierre(P.Bal, zDessus(Z_PONT - .25)); pierre(P.E, zDessus(Z_PONT + .1)); pierre(P.A, zDessus(Z_PONT + .1));
  const vis = ([x, y], z) => { const v = new THREE.Group(); v.position.set(x, y, z); v.add(new THREE.Mesh(new THREE.CylinderGeometry(.62, .66, .3, 24).rotateX(Math.PI / 2), M.bleui)); const fente = new THREE.Mesh(new THREE.BoxGeometry(1.1, .16, .14), M.joint); fente.position.z = -.12; fente.rotation.z = Math.random() * 3; v.add(fente); g.add(v); };
  for (const [p, z] of [[[-12.0, 3.0], Z_PONT], [[-9.0, 9.6], Z_PONT], [[11.2, 7.0], Z_PONT], [[1.6, 9.2], Z_PONT], [[-12.6, -.6], Z_PONT + .05], [[-9.6, -2.8], Z_PONT + .05], [[.6, -8.8], Z_PONT - .25], [[11.0, -3.8], Z_PONT - .25], [[10.9, -.6], Z_PONT + .1], [[-2.0, -11.4], Z_PONT + .15], [[-11.4, -3.0], Z_PONT + .15]]) vis(p, zDessus(z) + .05);

  // --- masse oscillante (rotor) + roues d'inverseur rouges
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(roue(1.55, 30, { prof: .14, ep: .26, bev: 0 }), rouge); w.position.set(sx * 2.1, 2.35, -3.42); g.add(piece(w, "Roue d'inverseur", "Roues d'inverseur du remontage automatique bidirectionnel.")); }
  const rotor = new THREE.Group(); rotor.position.z = Z_ROTOR;
  {
    const s = new THREE.Shape(); s.absarc(0, 0, 13.7, 0, Math.PI, false); s.absarc(0, 0, 2.4, Math.PI, 0, true);
    const plat = new THREE.ExtrudeGeometry(s, { depth: .5, bevelEnabled: true, bevelThickness: .08, bevelSize: .08, bevelSegments: 2, curveSegments: 48 }); plat.translate(0, 0, -.25); uvPlan(plat, 14);
    rotor.add(new THREE.Mesh(plat, [M.orRotor, M.acierMvt]));
    const sm = new THREE.Shape(); sm.absarc(0, 0, 13.7, 0, Math.PI, false); sm.absarc(0, 0, 11.9, Math.PI, 0, true);
    const masse = new THREE.ExtrudeGeometry(sm, { depth: 1.2, bevelEnabled: true, bevelThickness: .12, bevelSize: .12, bevelSegments: 2, curveSegments: 48 }); masse.translate(0, 0, -.75); uvPlan(masse, 14);
    rotor.add(new THREE.Mesh(masse, [M.orRotor, M.acierMvt]));
    rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, .9, 48).rotateX(Math.PI / 2), M.acierMvt));
    rotor.add(new THREE.Mesh(new THREE.TorusGeometry(1.65, .28, 10, 32).translate(0, 0, -.4), M.acierMvt));       // roulement à billes
    rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, .5, 6).rotateX(Math.PI / 2).translate(0, 0, -.5), M.bleui));
  }
  g.add(piece(rotor, "Masse oscillante", "Remontage automatique bidirectionnel sur roulement à billes (interprétation)."));

  // --- animation : rapports cohérents ; « ralenti » pour voir l'échappement
  const vitesse = { C: 1 / 3600, T: -8 / 3600, F: 1 / 60, E: -16 / 60, B: -1 / 43200 }; // tours par seconde (signe = sens)
  let t = 0, phi = 0, omega = 0;
  const gLoc = new THREE.Vector3(), qInv = new THREE.Quaternion();
  function anime(dt, { ralenti = 1, montre } = {}) {
    t += dt * ralenti;
    centre.rotation.z = vitesse.C * t * TAU; moyenne.rotation.z = vitesse.T * t * TAU; seconde.rotation.z = vitesse.F * t * TAU; barillet.rotation.z = vitesse.B * t * TAU;
    const alt = t * 8, k = Math.floor(alt), f = alt - k, saut = Math.min(1, f * 8);          // 8 alternances par seconde
    ech.rotation.z = -(k + saut * saut * (3 - 2 * saut)) * TAU / 30;                         // une demi-dent par alternance
    const theta = 4.7 * Math.sin(TAU * 4 * t);                                               // amplitude ≈ 270°
    bal.rotation.z = theta; spiral.rotation.z = theta * .985;
    spiral.scale.setScalar(1 + .025 * Math.sin(TAU * 4 * t));                                // le spiral « respire »
    ancre.rotation.z = .16 * Math.tanh(4 * Math.sin(TAU * 4 * t));
    // masse oscillante : pendule amorti soumis à la gravité (repère de la montre)
    if (montre) {
      montre.getWorldQuaternion(qInv).invert(); gLoc.set(0, -1, 0).applyQuaternion(qInv);
      const gxy = Math.hypot(gLoc.x, gLoc.y), cible = Math.atan2(gLoc.y, gLoc.x) - Math.PI / 2;
      const dtp = Math.min(dt, .05);
      omega += (14 * gxy * Math.sin(cible - phi) - 1.6 * omega) * dtp; phi += omega * dtp;
      rotor.rotation.z = phi;
    }
  }
  const setChrono = marche => { embr.rotation.z = marche ? -.06 : 0; frein.rotation.z = marche ? .08 : 0; col.rotation.z += TAU / 14; };
  const remise = () => { marteau.rotation.z = -.12; setTimeout(() => (marteau.rotation.z = 0), 260); col.rotation.z += TAU / 14; };
  return { groupe: g, anime, setChrono, remise, rotor };
}
