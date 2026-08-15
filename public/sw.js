// Service Worker — PWA installability + Web Push notifications.
// Does NOT cache HTML/JS (avoid stale bundles).

const SW_VERSION = '2026.06.29.3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    await self.clients.claim();
  })());
});

// Empty passthrough fetch handler — required for installability.
self.addEventListener('fetch', () => {});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ============ Web Push ============

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Vendus', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Vendus';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
    data: {
      url: payload.url || '/',
      ...(payload.data || {}),
    },
    vibrate: payload.vibrate || [120, 60, 120],
    requireInteraction: !!payload.requireInteraction,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Try to focus an existing tab on same origin
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          client.postMessage({ type: 'PUSH_NAVIGATE', url: targetUrl });
          return;
        }
      } catch {}
    }
    // Otherwise open a new window
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

// Clean up on subscription change (browser rotated keys)
self.addEventListener('pushsubscriptionchange', (event) => {
  // Best-effort: re-subscribe handled by the app on next foreground.
});
