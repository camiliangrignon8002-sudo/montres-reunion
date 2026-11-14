// Monalex : l'appli s'ouvre même sans réseau.
// Fichiers de l'appli : cache d'abord. Annonces (montres.json) et page : réseau d'abord, cache si hors ligne.
const V = 'monalex-v25';
const APP = ['./', 'index.html', 'app.css?v=21', 'app.js?v=20', 'watch.js?v=19', 'watch3d.js?v=23', 'daytona3d.js?v=23', 'img/daytona-face.jpg?v=23', 'vendor/three.module.min.js', 'detaillants.json', 'vendor/leaflet.js', 'vendor/leaflet.css', 'manifest.webmanifest', 'icon-192.png', 'favicon-32.png', 'img/cadran-160.png', 'img/monalex-mot.png', 'img/logo.png', 'fonts/cormorant-garamond-latin-500-normal.woff2', 'fonts/eb-garamond-latin-400-normal.woff2'];

self.addEventListener('install', ev => ev.waitUntil(caches.open(V).then(c => c.addAll(APP)).then(() => self.skipWaiting())));
self.addEventListener('activate', ev => ev.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin) return;
  const reseauDabord = url.pathname.endsWith('.json') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || ev.request.mode === 'navigate';
  if (reseauDabord) {
    const cle = url.pathname.endsWith('.json') ? new Request(url.origin + url.pathname) : ev.request;
    ev.respondWith(fetch(ev.request).then(r => {
      if (r.ok) { const copie = r.clone(); caches.open(V).then(c => c.put(cle, copie)); }
      return r;
    }).catch(() => caches.match(cle).then(r => r || caches.match('index.html'))));
  } else {
    ev.respondWith(caches.match(ev.request).then(r => r || fetch(ev.request)));
  }
});
// Toucher une notification de suivi ouvre la montre concernée
self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  const url = new URL((ev.notification.data && ev.notification.data.url) || './', self.registration.scope).href;
  ev.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    return c ? c.navigate(url).then(w => w && w.focus()) : self.clients.openWindow(url);
  }));
});
