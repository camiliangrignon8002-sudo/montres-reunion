// Vue éclatée : chaque module s'écarte selon son propre vecteur, dans l'ordre demandé, avec un léger décalage temporel.
import * as THREE from "three";

const lisse = t => t * t * (3 - 2 * t);
export function eclate(parts) {
  // parts : [{ obj, v:[x,y,z] }] dans l'ordre bracelet, fermoir, boîtier, lunette, verre, aiguilles, cadran, mouvement, fond
  const base = parts.map(p => p.obj.position.clone());
  let e = 0, cible = 0;
  const n = parts.length;
  function poser() {
    parts.forEach((p, i) => {
      const d = i / n * .55, k = lisse(Math.min(1, Math.max(0, (e - d) / .45)));
      p.obj.position.copy(base[i]).add(new THREE.Vector3(...p.v).multiplyScalar(k));
    });
  }
  return {
    basculer(v = cible ? 0 : 1) { cible = v; return cible; },
    get actif() { return cible === 1 || e > 0; },
    get valeur() { return e; },
    anime(dt) { if (e === cible) return; e += Math.sign(cible - e) * Math.min(Math.abs(cible - e), dt * .6); poser(); },
  };
}
