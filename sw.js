// sw.js - Service Worker corregido (manejo seguro de cache.put, rutas relativas)
const CACHE_VERSION = 'v2';
const CACHE_NAME = `llavero-respira-${CACHE_VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'logo.png',
  'helpers.js',
  'manifest.json'
];

self.addEventListener('install', event => {
  console.log('[SW] install -', CACHE_NAME);
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(ASSETS);
      console.log('[SW] Recursos esenciales cacheados');
    } catch (err) {
      console.error('[SW] Error cacheando assets durante install:', err);
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  console.log('[SW] activate - limpiar caches antiguos');
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== CACHE_NAME) {
        console.log('[SW] Eliminando cache antigua:', k);
        return caches.delete(k);
      }
    }));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Navigation requests: network-first, fallback cache
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(req);
        // cache only successful responses
        if (networkResponse && networkResponse.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, networkResponse.clone());
          } catch (e) {
            console.warn('[SW] cache put failed for navigation:', e);
          }
        }
        return networkResponse;
      } catch (err) {
        console.warn('[SW] Network failed, trying cache for navigation', err);
        const cached = await caches.match('index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Other requests: cache-first, then network and cache if success
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(req).then(async networkResponse => {
        try {
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            // store a copy for next time
            cache.put(req, networkResponse.clone()).catch(() => {});
          }
        } catch (e) {
          console.warn('[SW] cache put failed for asset:', e);
        }
        return networkResponse;
      }).catch(err => {
        console.warn('[SW] Fetch failed for', req.url, err);
        return Response.error();
      });
    })
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
