// sw.js - Service Worker básico para cachear recursos principales
const CACHE_NAME = 'llavero-respira-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/logo.png',
  '/helpers.js',
  '/manifest.json'
];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => {
      if (k !== CACHE_NAME) return caches.delete(k);
    })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', evt => {
  evt.respondWith(
    caches.match(evt.request).then(res => {
      return res || fetch(evt.request).catch(() => {
        if (evt.request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});
