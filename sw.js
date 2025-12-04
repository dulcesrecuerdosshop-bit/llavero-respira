// Minimal sw.js: intenta instalar/activar y desregistrarse para evitar caching persistente
self.addEventListener('install', event => {
  // no precache; no op
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      // Intenta desregistrarse para eliminar versiones rotas previas
      await self.registration.unregister();
      // claim clients so they reload without this SW controlling them further
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for(const c of clients) {
        try { await c.navigate(c.url); } catch(e){ /* ignore */ }
      }
    } catch(e) {
      // fallback: claim clients (if unregister fails)
      try { await self.clients.claim(); } catch(_) {}
    }
  })());
});
