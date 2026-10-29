// Notifications de l'appli Alternance 974 : affichage + pastille sur l'icône de l'écran d'accueil.
// Ouverture instantanée : la page et les descriptifs viennent du téléphone, puis sont mis à jour en arrière-plan.
// La liste des offres (liste.json) passe toujours par le réseau d'abord. Hors connexion, la copie sert.
const CACHE = 'alternance974-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', ev => ev.waitUntil(
  caches.keys().then(l => Promise.all(l.filter(k => k.startsWith('alternance974') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin) return;
  const reseau = () => fetch(ev.request).then(r => {
    if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(ev.request, copie)); }
    return r;
  });
  if (url.pathname.endsWith('liste.json')) {
    ev.respondWith(reseau().catch(() => caches.match(ev.request, {ignoreSearch: true})));
    return;
  }
  // la page : le réseau d'abord (toujours la dernière version), la copie si le réseau tarde plus de 3 s ou manque
  if (ev.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    ev.respondWith(new Promise(resolve => {
      let fini = false;
      const copie = () => caches.match(ev.request, {ignoreSearch: true}).then(r => r || caches.match('./'));
      const minuterie = setTimeout(() => copie().then(r => { if (r && !fini) { fini = true; resolve(r); } }), 3000);
      reseau().then(r => { if (!fini) { fini = true; clearTimeout(minuterie); resolve(r); } })
        .catch(() => copie().then(r => { if (!fini) { fini = true; clearTimeout(minuterie); resolve(r || Response.error()); } }));
    }));
    return;
  }
  // le reste (descriptifs versionnés, icônes) : la copie d'abord, mise à jour en arrière-plan
  ev.respondWith(caches.match(ev.request).then(enCache => {
    const frais = reseau().catch(() => enCache);
    if (enCache) { ev.waitUntil(frais.catch(() => {})); return enCache; }
    return frais;
  }));
});

self.addEventListener('push', ev => {
  let m = {};
  try { m = ev.data.json(); } catch (e) { m = { title: 'Alternance 974', body: ev.data ? ev.data.text() : '' }; }
  const taches = [self.registration.showNotification(m.title || 'Alternance 974', {
    body: m.body || '', icon: 'icon-192.png', badge: 'icon-192.png',
    tag: m.tag, data: { url: m.url || './' },
  })];
  if (m.badge != null && self.navigator.setAppBadge) taches.push(self.navigator.setAppBadge(m.badge).catch(() => {}));
  ev.waitUntil(Promise.all(taches));
});

self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  ev.waitUntil(self.clients.openWindow(ev.notification.data.url));
});
