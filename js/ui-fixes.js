// ui-fixes.js - Añade listeners robustos para cambiar la frase (click en tarjeta y tecla ESPACIO)
// Cargar con defer, después de js/phrases.js

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

    if (window.LR_DEBUG) console.log('[ui-fixes] listeners attached (card click, space key)');
  });
})();
