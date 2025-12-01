// sw.js - Service Worker mejorado para Llavero Respira
const CACHE_VERSION = 'v2';
const CACHE_NAME = `llavero-respira-${CACHE_VERSION}`;
const ASSETS = [
  '/',
  '/index.html',
  '/logo.png',
  '/helpers.js',
  '/manifest.json'
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

  // Ignorar peticiones a otros orígenes
  if (url.origin !== location.origin) {
    return;
  }

  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, networkResponse.clone().catch(()=>{}));
        return networkResponse;
      } catch (err) {
        console.warn('[SW] Network failed, trying cache for navigation', err);
        const cached = await caches.match('/index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(networkResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(req, networkResponse.clone().catch(()=>{}));
          return networkResponse;
        });
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
