// sw.js (actualiza solo la versión de caché para forzar recarga de assets)
const CACHE_VERSION = 'v27';
const CACHE_NAME = `llavero-respira-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
  '/', 
  '/index.html',
  '/css/00-vars.css',
  '/css/01-base.css',
  '/css/10-card.css',
  '/css/20-overlay.css',
  '/css/30-modal.css',
  '/js/load-user.js',
  '/js/main.js',
  '/logo.png'
];

// Install & cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch strategy (Cache first)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
