// Bump cache name to force clients to re-cache and use skipWaiting/claim
const CACHE_NAME = 'llavero-respira-v2'; // bump if current is v1
const ASSETS = [
  '/', '/index.html', '/js/main.js', '/js/breath-sessions.js', '/css/global.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
});
