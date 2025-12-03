// sw.js - Service Worker final update (version bump para rotar caches)
const CACHE_VERSION = 'v24';
const CACHE_NAME = `llavero-respira-${CACHE_VERSION}`;

// Critical same-origin assets to pre-cache on install
const ASSETS = [
  './',
  'index.html',
  'favicon.ico',
  'logo.png',
  'manifest.json',
  // CSS (modular)
  'css/00-vars.css',
  'css/01-base.css',
  'css/10-card.css',
  'css/20-overlay.css',
  'css/30-modal.css',
  // JS principales
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
  if (req.method !== 'GET') return;
  if (!isSameOrigin(req)) return;

  const url = new URL(req.url);
  const pathname = url.pathname;

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

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      (async () => {
        try {
          const networkResponse = await fetch(req);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, networkResponse.clone());
          }
        } catch (e) {}
      })();
      return cached;
    }
    try {
      const networkResponse = await fetch(req);
      if (networkResponse && networkResponse.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone()).catch(()=>{});
        } catch (e) {}
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
