// sw.js - Service Worker final update
// - Removed cross-origin CDN from install cache list to avoid install failures.
// - Use network-first for navigation / CSS / JS to ensure latest styles/scripts are served.
// - Use cache-first for images and other static assets with background update.
// - Bump cache version.
const CACHE_VERSION = 'v23';
const CACHE_NAME = `llavero-respira-${CACHE_VERSION}`;

// Critical same-origin assets to pre-cache on install
const ASSETS = [
  './',
  'index.html',
  'favicon.ico',
  'logo.png',
  'manifest.json',
  // CSS principales
  'css/global.css',
  'css/frase-card.css',
  'css/overlay-custom.css',
  'css/modal-user.css',
  // JS principales (helpers y phrases)
  'js/helpers.v2.js',
  'js/phrases.js',
  'js/load-user.js',
  'js/ui-fixes.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(ASSETS);
    } catch (e) {
      console.warn('[SW] install: cache.addAll failed (non-fatal)', e);
      // proceed even if some items failed to cache
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== CACHE_NAME) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

// helper to detect same-origin
function isSameOrigin(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // If cross-origin, do not intercept (let browser handle CDN & external resources)
  if (!isSameOrigin(req)) return;

  const url = new URL(req.url);
  const pathname = url.pathname;

  // NAVIGATION: network-first to ensure newest index.html and linked CSS/JS are used
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone()).catch(()=>{});
        }
        return networkResponse;
      } catch (err) {
        const cached = await caches.match('index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // For CSS and JS: use network-first with cache-fallback (ensures style updates propagate quickly)
  if (pathname.endsWith('.css') || pathname.endsWith('.js')) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone()).catch(()=>{});
        }
        return networkResponse;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // For images and other static assets: cache-first with background update
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      // update cache in background
      (async () => {
        try {
          const networkResponse = await fetch(req);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, networkResponse.clone());
          }
        } catch (e) { /* ignore */ }
      })();
      return cached;
    }
    try {
      const networkResponse = await fetch(req);
      if (networkResponse && networkResponse.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone()).catch(()=>{});
        } catch (e) { /* ignore */ }
      }
      return networkResponse;
    } catch (err) {
      return Response.error();
    }
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
