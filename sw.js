// Minimal sw.js: no precache; al activarse intenta desregistrarse para eliminar versiones rotas previas
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      // Intenta desregistrarse para que clientes dejen de estar controlados
      await self.registration.unregister();
      // Opcional: intentar forzar recarga de clientes controlados
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
      for (const c of clientsList) {
        try { c.navigate(c.url); } catch(e){ /* ignore */ }
      }
    } catch(e) {
      // fallback: claim clients
      try { await self.clients.claim(); } catch(_) {}
    }
  })());
});
