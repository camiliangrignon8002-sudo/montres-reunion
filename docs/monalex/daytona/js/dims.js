// Dimensions de référence (millimètres). Repère : centre du cadran à l'origine, face vers +Z, 12 h vers +Y, 3 h vers +X.
// « officiel » = publié par Rolex pour la 126500LN ; « estimé » = estimation de modélisation, modifiable ici.
export const D = {
  boitierDiametre: 40,        // officiel
  boitierEpaisseur: 11.9,     // estimé (valeur indicative courante)
  corneACorne: 46.5,          // estimé
  entreCornes: 20,            // estimé (largeur du bracelet à l'attache)
  etancheite: 100,            // officiel (mètres)
  reserveMarche: 72,          // officiel (heures)
  frequence: 28800,           // officiel (alternances par heure, 4 Hz)

  // --- niveaux sur l'axe Z (estimés) : de l'arrière vers l'avant
  zFond: -5.95,               // extérieur du fond vissé
  zCarrureBas: -4.9,
  zMouvementBas: -4.6,
  zMouvementHaut: -.7,
  zCadran: 2.55,
  zCompteur: 2.43,            // compteurs légèrement en creux
  zIndex: 2.55,
  zAiguilles: [2.95, 3.2, 3.45, 3.7], // heures, minutes, trotteuse chrono (petites aiguilles à 2.75)
  zCarrureHaut: 4.15,
  zLunetteHaut: 5.35,
  zVerreHaut: 5.95,           // fond + 5.95 ≈ 11.9 mm d'épaisseur totale

  // --- rayons (estimés, mesurés sur les vues de face)
  rCarrure: 20.0,
  rLunetteExt: 19.95,
  rLunetteInt: 14.65,
  rCadran: 14.4,
  rVerre: 14.9,
  rCompteur: 3.35,            // partie claire du compteur
  rAnneauCompteur: 4.3,       // anneau noir
  posCompteurs: { minutes: [7.35, 0], heures: [0, -7.35], secondes: [-7.35, 0] },  // 30 min à 3 h, 12 h à 6 h, petite seconde à 9 h

  // --- bracelet Oyster (estimé)
  pasMaillon: 4.7,
  largeurAttache: 20,
  largeurFermoir: 16,
  rayonPoignet: 27,           // forme posée « au poignet »
};
