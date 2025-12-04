// sw.js - ejemplo con CACHE_NAME bump y SKIP_WAITING handler
const CACHE_NAME = 'llavero-respira-v2'; // aumenta esta cadena cuando actualices assets
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/global.css',
  '/js/helpers.v2.js',
  '/js/phrases.js',
  '/js/ui-fixes.js',
  '/js/load-user.js',
  '/js/breath-sessions.js',
  // añade otros assets que quieras cachear
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
