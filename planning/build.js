// Assemble l'application.
//   PLANNING_CODE=xxxx-xxxx-xxxx node planning/build.js
// - dist/planning.html   : artifact claude.ai privé (données de l'équipe en clair, non versionné)
// - dist/standalone.html : même page en document complet, pour les tests (non versionné)
// - ../docs/planning/    : appli pour téléphone (GitHub Pages, public) ; les données de l'équipe y sont
//                          chiffrées (AES-GCM, clé dérivée du code d'accès) et déchiffrées sur l'appareil.
// src/reference.js (en clair) n'est pas versionné ; seul src/reference.enc.json l'est. Sans le fichier en clair,
// le script le reconstitue avec PLANNING_CODE.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { webcrypto: crypto } = require("crypto");
const S = (f) => path.join(__dirname, "src", f);
const src = (f) => fs.readFileSync(S(f), "utf8");
const ITER = 250000;
const b64 = (u) => Buffer.from(u).toString("base64");

async function key(code, salt, usage) {
  const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(code.trim().toLowerCase()), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, raw, { name: "AES-GCM", length: 256 }, false, [usage]);
}
async function main() {
  const code = process.env.PLANNING_CODE || "";
  let refJs;
  if (fs.existsSync(S("reference.js"))) refJs = src("reference.js");
  else {
    if (!code) throw new Error("src/reference.js absent : définissez PLANNING_CODE pour le reconstituer.");
    const L = JSON.parse(src("reference.enc.json"));
    const k = await key(code, Buffer.from(L.salt, "base64"), "decrypt");
    const plain = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(L.iv, "base64") }, k, Buffer.from(L.data, "base64"))));
    refJs = plain.source;
  }
  const ctx = {}; vm.runInNewContext(refJs, { globalThis: ctx });
  const reference = ctx.PlanningReference;

  // Version chiffrée (publique)
  let locked;
  if (code) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const k = await key(code, salt, "encrypt");
    const payload = { reference, source: refJs };
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(JSON.stringify(payload))));
    locked = { v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) };
    fs.writeFileSync(S("reference.enc.json"), JSON.stringify(locked) + "\n");
  }

  const tag = (code) => `<script>\n${code.replace(/<\/script/gi, "<\\/script")}\n</script>`;
  const appScripts = ["core.js", "store.js", "exports.js", "ai.js", "app.js"].map((f) => tag(src(f))).join("\n");
  const body = (refScript) => `<title>Planning équipe</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Plannings de l'équipe : zones de travail, alternants, absences, génération et assistant IA.">
<style>
${src("styles.css")}
</style>
<div id="app-root"></div>
<noscript>Cette application a besoin de JavaScript.</noscript>
${refScript}
${appScripts}
`;
  const plainTag = tag(refJs);
  const reset = `<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>`;

  fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "dist", "planning.html"), body(plainTag));
  fs.writeFileSync(path.join(__dirname, "dist", "standalone.html"), `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${reset}</head><body>\n${body(plainTag)}</body></html>\n`);

  const out = path.join(__dirname, "..", "docs", "planning");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "index.html"), `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Planning">
<meta name="robots" content="noindex">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
${reset}
</head><body>
${body(plainTag)}<script>if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});</script>
</body></html>
`);
  fs.writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify({
    name: "Planning équipe", short_name: "Planning", description: "Plannings de l'équipe : zones, alternants, absences.",
    start_url: "./", scope: "./", display: "standalone", background_color: "#f5f5f7", theme_color: "#f5f5f7", lang: "fr",
    icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
  }, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "sw.js"), `// Appli Planning : fonctionne hors connexion (réseau d'abord, copie locale si pas de réseau).
const CACHE = "planning-v${Date.now().toString(36)}";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./manifest.webmanifest", "./icon-192.png", "./apple-touch-icon.png"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match("./"))));
});
`);
  console.log("dist/planning.html", (fs.statSync(path.join(__dirname, "dist", "planning.html")).size / 1024).toFixed(0), "Ko ; docs/planning/ prêt");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
