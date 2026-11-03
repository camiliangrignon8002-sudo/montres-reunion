// Mes appareils : garde l'appli disponible hors connexion (réseau d'abord, cache en secours).
const CACHE = 'appareils-v1';
const FICHIERS = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png', 'favicon-32.png'];
self.addEventListener('install', ev => { ev.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS))); self.skipWaiting(); });
self.addEventListener('activate', ev => ev.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin) return; // ntfy et ipsw.me : toujours en direct
  ev.respondWith(fetch(ev.request).then(r => {
    const copie = r.clone(); caches.open(CACHE).then(c => c.put(ev.request, copie)); return r;
  }).catch(() => caches.match(ev.request)));
});
