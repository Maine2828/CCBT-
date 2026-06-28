// ── CCBT Service Worker ──────────────────────────────────────────────────────
const CACHE_NAME = 'ccbt-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Handle notification clicks — open the app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Handle scheduled notification messages from the app
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_NOTIFICATIONS') {
    scheduleNotifications(e.data.notifications);
  }
  if (e.data?.type === 'CLEAR_NOTIFICATIONS') {
    // Clear any pending timeouts (handled by app)
  }
});

function scheduleNotifications(notifications) {
  notifications.forEach(n => {
    const delay = n.fireAt - Date.now();
    if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) { // only within 7 days
      setTimeout(() => {
        self.registration.showNotification(n.title, {
          body: n.body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: n.tag,
          data: { url: '/' },
          requireInteraction: false,
          silent: false
        });
      }, delay);
    }
  });
}
