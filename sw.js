// Self-Healing Service Worker for AgriTech PRO
const CACHE_NAME = 'agritech-pro-cache-v2';

// ── INSTALL ──
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Don't cache index.html here anymore to ensure freshness
      return cache.addAll(['./manifest.json', './favicon.svg']);
    })
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
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
