// load-user.js — carga JSON de ./users/llavero{ID}.json y personaliza la página
(function(){
  'use strict';

  function getIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id && /^[A-Za-z0-9_-]{1,32}$/.test(id)) return id; // validación simple
    return null;
  }

  async function loadUserData(id) {
    if (!id) return null;
    // usar URL relativa basada en la página actual para soportar GitHub Pages en subpath
    const url = new URL(`./users/llavero${id}.json`, location.href).toString();
    console.log('[load-user] fetching', url);
    try {
      const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      console.log('[load-user] fetch status', res.status);
      if (!res.ok) return null;
      const data = await res.json();
      console.log('[load-user] got data', data);
      return data;
    } catch (e) {
      console.warn('[load-user] fetch error', e);
      return null;
    }
  }

  function applyPersonalization(data) {
    if (!data) return;
    // Elementos que se personalizan — adapta estos IDs a tu HTML
    const saludoEl = document.getElementById('saludo') || document.getElementById('frase');
    if (saludoEl) {
      const texto = data.mensaje || (`Hola ${data.nombre || ''}, respira conmigo 🌱`);
      saludoEl.textContent = texto;
      // Si quieres añadir más personalización (fondo, color...), aquí puedes:
      if (data.fondo) {
        document.body.style.background = data.fondo;
      }
      if (data.colorTexto) {
        saludoEl.style.color = data.colorTexto;
      }
    }
    // Notificar a helpers si es necesario
    if (window.lr_index_helpers && typeof window.lr_index_helpers.onUserLoaded === 'function') {
      try { window.lr_index_helpers.onUserLoaded(data); } catch(e){ console.warn(e); }
    }
  }

  // Ejecutar al cargar
  document.addEventListener('DOMContentLoaded', async () => {
    const id = getIdFromUrl();
    console.log('[load-user] id from url', id);
    if (!id) return;
    const data = await loadUserData(id);
    if (data) applyPersonalization(data);
    else {
      console.log('[load-user] no personalization found for id', id);
      // opcional: mostrar mensaje alternativo o usar último_added.txt
    }
  });
})();
