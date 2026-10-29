// Notifications de l'appli Alternance 974 : affichage + pastille sur l'icône de l'écran d'accueil.
self.addEventListener('install', () => self.skipWaiting());
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
