// Notifications de l'appli Alternance 974 : affichage + pastille sur l'icône de l'écran d'accueil.
// La page vient toujours du réseau (dernière version) ; les descriptifs et icônes du téléphone, mis à jour en arrière-plan.
// La liste des offres (liste.json) passe toujours par le réseau d'abord. Hors connexion, la copie sert.
const CACHE = 'alternance974-v5';
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
  if (url.pathname.endsWith('version.txt')) return;  // toujours le réseau, jamais mis en mémoire
  if (url.pathname.endsWith('liste.json')) {
    ev.respondWith(reseau().catch(() => caches.match(ev.request, {ignoreSearch: true})));
    return;
  }
  // la page : toujours le réseau (la dernière version) ; la copie seulement hors connexion
  if (ev.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    ev.respondWith(fetch(ev.request, {cache: 'no-cache'}).then(r => {
      if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(ev.request, copie)); }
      return r;
    }).catch(() => caches.match(ev.request, {ignoreSearch: true}).then(r => r || caches.match('./')).then(r => r || Response.error())));
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
