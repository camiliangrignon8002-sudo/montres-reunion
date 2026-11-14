// Horloge d'animation : rotation automatique (pause, reprise, vitesse), heure réelle, chronographe, mécanismes.
export function animations({ montre, aiguilles, mouvement, poussoirs, fermoir, eclate }) {
  const etat = {
    rotation: true, vitesse: .25,     // tours par minute ×… (rad/s = vitesse)
    pauseAuto: 0,                     // reprise automatique après une interaction
    chrono: { marche: false, cumul: 0, depuis: 0 },
    ralenti: 1, mouvementVisible: false,
  };
  let t = 0;
  const ecoule = () => etat.chrono.cumul + (etat.chrono.marche ? (performance.now() - etat.chrono.depuis) / 1000 : 0);
  function departArret() {
    poussoirs.haut.presser();
    const c = etat.chrono;
    if (c.marche) { c.cumul = ecoule(); c.marche = false; } else { c.depuis = performance.now(); c.marche = true; }
    mouvement.setChrono(c.marche); return c.marche;
  }
  function remiseAZero() {
    poussoirs.bas.presser();
    if (!etat.chrono.marche) { etat.chrono.cumul = 0; mouvement.remise(); return true; }
    return false;                      // à la Daytona, pas de remise à zéro en marche
  }
  function interaction() { etat.pauseAuto = 4; }
  function tick(dt) {
    t += dt;
    if (etat.pauseAuto > 0) etat.pauseAuto -= dt;
    if (etat.rotation && etat.pauseAuto <= 0) {
      montre.rotation.y += etat.vitesse * dt;
      montre.rotation.z = .06 * Math.sin(t * .8);          // léger balancement du poignet (fait vivre la masse oscillante)
    }
    aiguilles.regler(new Date(), ecoule());
    poussoirs.haut.anime(dt); poussoirs.bas.anime(dt);
    fermoir.anime(dt); eclate.anime(dt);
    if (etat.mouvementVisible || eclate.actif) mouvement.anime(dt, { ralenti: etat.ralenti, montre });
  }
  function recentrer() {               // remet la montre de face (pour les vues prédéfinies)
    const y = montre.rotation.y % (Math.PI * 2);
    montre.rotation.y = y > Math.PI ? y - Math.PI * 2 : y < -Math.PI ? y + Math.PI * 2 : y;
    etat.recentrage = true;
  }
  function tickRecentrage(dt) {
    if (!etat.recentrage) return;
    montre.rotation.y *= Math.max(0, 1 - dt * 5); montre.rotation.z *= Math.max(0, 1 - dt * 5);
    if (Math.abs(montre.rotation.y) < 1e-3) { montre.rotation.y = 0; montre.rotation.z = 0; etat.recentrage = false; }
  }
  return { etat, tick: dt => { tickRecentrage(dt); tick(dt); }, departArret, remiseAZero, interaction, recentrer, ecoule };
}
