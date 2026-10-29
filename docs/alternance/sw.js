// Notifications de l'appli Alternance 974 : affichage + pastille sur l'icône de l'écran d'accueil.
// Hors connexion : la page et les offres déjà chargées restent disponibles (réseau d'abord, copie sinon).
const CACHE = 'alternance974-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin) return;
  ev.respondWith(fetch(ev.request).then(r => {
    if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(ev.request, copie)); }
    return r;
  }).catch(() => caches.match(ev.request, {ignoreSearch: true}).then(r => r || caches.match('./'))));
});
self.addEventListener('activate', ev => ev.waitUntil(self.clients.claim()));

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
