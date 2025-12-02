// load-user.js — carga JSON de /users/llavero{ID}.json y personaliza la página
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
    const url = `/users/llavero${id}.json`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
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
    }
    // Puedes añadir más personalización: color, fondo, imagen, etc.
  }

  // Ejecutar al cargar
  document.addEventListener('DOMContentLoaded', async () => {
    const id = getIdFromUrl();
    if (!id) return;
    const data = await loadUserData(id);
    if (data) applyPersonalization(data);
    else {
      console.log('[load-user] no personalization found for id', id);
      // opcional: mostrar mensaje alternativo
    }
  });
})();
