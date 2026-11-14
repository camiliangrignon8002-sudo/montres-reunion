// Galerie de photos de référence (planche fournie par le propriétaire du site) : vue principale + vignettes, glisser ou flèches.
const VUES = [["face", "Face"], ["trois-quarts", "Trois-quarts avant"], ["profil-droit", "Profil côté couronne"], ["profil-gauche", "Profil côté 9 h"], ["arriere", "Fond"], ["fermoir", "Fermoir fermé"], ["trois-quarts-bas", "Trois-quarts bas"], ["trois-quarts-haut", "Trois-quarts haut"], ["fond-mouvement", "Fond saphir et mouvement"], ["calibre", "Calibre 4131"], ["fermoir-ouvert", "Fermoir ouvert"], ["d-cadran", "Cadran"], ["d-compteur", "Compteur"], ["d-lunette", "Lunette Cerachrom"], ["d-couronne", "Couronne Triplock"], ["d-poussoir", "Poussoir"], ["d-maillons", "Maillons Oyster"], ["d-rotor", "Rotor"]];
export function galerie() {
  const g = document.getElementById("galerie"), grand = g.querySelector(".g-grand img"), leg = g.querySelector(".g-leg"), vign = g.querySelector(".g-vign");
  let i = 0;
  const montrer = k => { i = (k + VUES.length) % VUES.length; const [id, nom] = VUES[i]; grand.src = `photos/${id}.jpg`; grand.alt = nom; leg.textContent = `${nom} · ${i + 1}/${VUES.length}`; vign.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-current", j === i ? "true" : "false")); vign.children[i].scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); };
  VUES.forEach(([id, nom], k) => { const b = document.createElement("button"); b.type = "button"; b.title = nom; b.innerHTML = `<img src="photos/${id}.jpg" alt="${nom}" loading="lazy">`; b.onclick = () => montrer(k); vign.append(b); });
  g.querySelector(".g-prec").onclick = () => montrer(i - 1); g.querySelector(".g-suiv").onclick = () => montrer(i + 1);
  g.querySelector(".g-x").onclick = () => (g.hidden = true);
  let x0 = null; const zone = g.querySelector(".g-grand");
  zone.addEventListener("pointerdown", e => (x0 = e.clientX)); zone.addEventListener("pointerup", e => { if (x0 !== null && Math.abs(e.clientX - x0) > 40) montrer(i + (e.clientX < x0 ? 1 : -1)); x0 = null; });
  document.addEventListener("keydown", e => { if (g.hidden) return; if (e.key === "ArrowRight") montrer(i + 1); if (e.key === "ArrowLeft") montrer(i - 1); if (e.key === "Escape") g.hidden = true; });
  document.getElementById("b-photos").onclick = () => { g.hidden = false; montrer(i); };
  if (new URLSearchParams(location.search).has("photos")) { g.hidden = false; montrer(0); }
}
