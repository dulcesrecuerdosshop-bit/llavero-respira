// sw.js — versión corregida para GitHub Pages en subpath (rutas relativas) y manejo tolerante de caché
const CACHE_VERSION = 'v29';
const CACHE_NAME = `llavero-respira-${CACHE_VERSION}`;

// Assets relativos (importante usar rutas relativas ./ para GitHub Pages en /<repo>/)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './logo.png',
  // CSS
  './css/00-vars.css',
  './css/01-base.css',
  './css/10-card.css',
  './css/20-overlay.css',
  './css/30-modal.css',
  './css/frase-card.css',
  './css/global.css',
  // JS
  './js/helpers.v2.js',
  './js/phrases.js',
  './js/ui-fixes.js',
  './js/load-user.js',
  // Users / data
  './users/index.json',
  './users/llavero023.json',
  // Optional assets (if present)
  './assets/bg1.webp',
  './assets/bg2.webp',
  './assets/bg3.webp',
  './assets/bg4.webp',
  './inhaleCue.mp3'
];

// Install: cache assets (tolerant: don't fail install on single missing asset)
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      // Use Promise.allSettled to avoid install rejection if a single asset fails
      await Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url).catch(()=>{/* ignore individual errors */})));
    } catch (e) {
      // swallow - we don't want an unrecoverable install failure
      console.warn('[sw] install caching failed', e);
    }
    self.skipWaiting();
  })());
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    } catch (e) {
      console.warn('[sw] activate cleanup failed', e);
    }
    self.clients.claim();
  })());
});

// Fetch: cache-first, fallback to network, and update cache in background when network succeeds
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const req = event.request;

  event.respondWith((async () => {
    try {
      // 1) Try cache
      const cached = await caches.match(req);
      if (cached) {
        // In parallel, try to update cache from network for next time
        event.waitUntil((async () => {
          try {
            const response = await fetch(req);
            if (response && response.ok) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(req, response.clone()).catch(()=>{});
            }
          } catch (e) { /* ignore network update errors */ }
        })());
        return cached;
      }

      // 2) No cache, try network
      const networkResponse = await fetch(req);
      // Optionally cache same-origin successful responses
      try {
        const url = new URL(req.url);
        if (url.origin === location.origin && networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone()).catch(()=>{});
        }
      } catch(e){}
      return networkResponse;
    } catch (e) {
      // 3) As a last resort, try any cached response (even if above failed)
      const fallback = await caches.match(req);
      if (fallback) return fallback;
      // nothing to return
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});
