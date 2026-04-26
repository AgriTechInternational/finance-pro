// ============================================================
// AgriTech Finance Pro — Enhanced Service Worker
// Supports: Caching, Push Notifications, Background Sync
// ============================================================
const CACHE_NAME = 'agritech-pro-cache-v8-2-0';
const BADGE_COUNT_KEY = 'agritech_badge_count';

// ── INSTALL ──
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['./manifest.json', './favicon.svg'])
    )
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
  // Clean up old caches
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

// ── FETCH (Network-First Strategy) ──
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── PUSH NOTIFICATION HANDLER ──
// Handles push events from the Web Push API
self.addEventListener('push', (event) => {
  let data = { title: 'AgriTech Finance Pro', body: 'New update available', icon: './favicon.svg' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch { data.body = event.data.text(); }
  }

  const options = {
    body: data.body,
    icon: data.icon || './favicon.svg',
    badge: './favicon.svg',
    tag: data.tag || 'agritech-notification',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || './', timestamp: Date.now() },
    actions: [
      { action: 'view', title: '📊 View Dashboard' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ── MESSAGE HANDLER ──
// Receives messages from the main app thread to show local notifications
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, url } = payload || {};
    const options = {
      body: body || 'AgriTech Finance Pro update',
      icon: './favicon.svg',
      badge: './favicon.svg',
      tag: tag || 'agritech-update',
      renotify: true,
      data: { url: url || './', timestamp: Date.now() },
    };
    event.waitUntil(self.registration.showNotification(title || 'AgriTech Finance Pro', options));
  }

  if (type === 'PING') {
    event.source?.postMessage({ type: 'PONG' });
  }
});

// ── NOTIFICATION CLICK HANDLER ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes('finance-pro') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'agritech-data-check') {
    event.waitUntil(checkForNewData());
  }
});

async function checkForNewData() {
  // Placeholder — in production this would call a server endpoint
  // For now it's a no-op; real-time detection happens via the main app polling
  console.log('[SW] Background sync: agritech-data-check fired');
}
