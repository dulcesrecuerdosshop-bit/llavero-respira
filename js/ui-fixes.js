// ui-fixes.js - Añade listeners robustos para cambiar la frase (click en tarjeta y tecla ESPACIO)
// Además: asegura que en pantallas móviles la tarjeta gane la clase .fullscreen automáticamente

(function () {
  'use strict';

  function safeMostrarFrase() {
    if (typeof window.mostrarFrase === 'function') {
      try {
        window.mostrarFrase();
        if (window.LR_DEBUG) console.log('[ui-fixes] mostrarFrase called');
      } catch (e) {
        console.warn('[ui-fixes] mostrarFrase failed', e);
      }
    } else {
      if (window.LR_DEBUG) console.warn('[ui-fixes] mostrarFrase not defined yet');
    }
  }

  // Toggle .fullscreen in small screens
  function ensureFullscreenOnMobile() {
    try {
      const fc = document.getElementById('frase-card') || document.querySelector('.frase-card');
      if (!fc) return;
      const isMobile = window.innerWidth <= 640;
      if (isMobile) fc.classList.add('fullscreen');
      else fc.classList.remove('fullscreen');
    } catch (e) { /* ignore */ }
  }

  // Debounced resize handler
  function setupResizeHandler() {
    let t = null;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(ensureFullscreenOnMobile, 160);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Click en la tarjeta (excluyendo la zona de controles)
    const card = document.getElementById('frase-card');
    if (card) {
      card.addEventListener('click', (ev) => {
        // Ignorar clicks sobre controles dentro de la tarjeta
        if (ev.target.closest && ev.target.closest('.frase-controls')) return;
        safeMostrarFrase();
      }, { passive: true });
    }

    // Tecla ESPACIO para avanzar (evitar que haga scroll cuando input esté enfocado)
    document.addEventListener('keydown', (ev) => {
      if (ev.code === 'Space' && !ev.repeat) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
        ev.preventDefault();
        safeMostrarFrase();
      }
    });

    // init fullscreen toggle and resize handler
    ensureFullscreenOnMobile();
    setupResizeHandler();

    if (window.LR_DEBUG) console.log('[ui-fixes] listeners attached (card click, space key) and fullscreen-on-mobile initialized');
  });
})();
