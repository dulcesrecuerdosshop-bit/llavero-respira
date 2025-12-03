// sw.js - Service Worker actualizado - CACHE_VERSION bump + assets explícitos
const CACHE_VERSION = 'v22';
const CACHE_NAME = `llavero-respira-${CACHE_VERSION}`;

// Lista de recursos críticos que queremos asegurar que se cacheen en instalación
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
  // JS principales (incluir helpers.v2 y phrases para evitar versiones antiguas)
  'js/helpers.v2.js',
  'js/phrases.js',
  'js/load-user.js',
  // biblioteca usada
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(ASSETS);
    } catch (e) {
      console.warn('[SW] install: cache.addAll failed', e);
    }
    // force SW activo
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

// Helper: para requests cross-origin no interferimos
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

  // Sólo gestionamos GET
  if (req.method !== 'GET') return;

  // Ignorar requests cross-origin (CDN externas) salvo que queramos cachearlas
  if (!isSameOrigin(req)) {
    return;
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  // Network-first for navigations (ensures index.html and updated CSS/JS served)
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

  // For static assets (css, js, images) - cache-first with background update
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      // Kick off an async update in background
      (async () => {
        try {
          const networkResponse = await fetch(req);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, networkResponse.clone());
          }
        } catch (e) { /* ignore background update errors */ }
      })();
      return cached;
    }
    try {
      const networkResponse = await fetch(req);
      if (networkResponse && networkResponse.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone()).catch(()=>{});
        } catch (e) { /* ignore cache put errors */ }
      }
      return networkResponse;
    } catch (err) {
      return Response.error();
    }
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
