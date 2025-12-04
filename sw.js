// Ejemplo: bump cache name y forzar activación (ajusta al contenido actual de tu sw.js)
const CACHE_NAME = 'llavero-respira-v2'; // incrementar versión
const ASSETS = [
  '/', '/index.html', '/js/main.js', '/js/breath-sessions.js', '/css/global.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Limpiar caches antiguas
      const keys = await caches.keys();
      await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  // strategy simple: try cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});
