// sw.js - Service Worker corrected - CACHE v3
const CACHE_VERSION = 'v10';
const CACHE_NAME = `llavero-respira-${CACHE_VERSION}`;
const ASSETS = ['./','index.html','logo.png','helpers.js','manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    try { await cache.addAll(ASSETS); } catch(e){ console.warn('sw install cache error', e); }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); }));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event=>{
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const usersRegex = /\/users\/llavero[A-Za-z0-9_-]+\.json$/;
  if (usersRegex.test(url.pathname)) {
    event.respondWith((async ()=>{
      try {
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, networkResponse.clone());
          } catch (e) { console.warn('[SW] cache put failed for user json:', e); }
        }
        return networkResponse;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith((async ()=>{
      try {
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, networkResponse.clone());
          } catch (e) { console.warn('[SW] cache put failed for navigation:', e); }
        }
        return networkResponse;
      } catch (err) {
        const cached = await caches.match('index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith(caches.match(req).then(cached=>{
    if (cached) return cached;
    return fetch(req).then(async networkResponse=>{
      try {
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone()).catch(()=>{});
        }
      } catch (e) { console.warn('[SW] cache put failed for asset:', e); }
      return networkResponse;
    }).catch(err=>{
      console.warn('[SW] Fetch failed for', req.url, err);
      return Response.error();
    });
  }));
});

self.addEventListener('message', event=>{
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
