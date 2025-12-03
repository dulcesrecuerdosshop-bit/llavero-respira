// ui-fixes.js - Añade listeners robustos para cambiar la frase (click en tarjeta y tecla ESPACIO)
// Además: parche runtime que inyecta reglas fullscreen solo si la hoja CSS no está aplicando position:fixed correctamente.

(function () {
  'use strict';

  // --- INYECCION CONDICIONAL: estilo fallback para fullscreen si la CSS no aplica correctamente ---
  (function ensureRuntimeFullscreenStyles() {
    try {
      const fc = document.getElementById('frase-card') || document.querySelector('.frase-card');
      // si no hay elemento, no hacemos nada ahora; volveremos al DOMContentLoaded
      if (!fc) return;
      // función que comprueba si la regla fullscreen está aplicando (posición calculada)
      function needsFallback() {
        const computed = getComputedStyle(fc);
        // si la clase está y position !== fixed, necesitamos fallback
        if (fc.classList.contains('fullscreen') && computed.position !== 'fixed') return true;
        // si no tiene la clase pero el ancho es móvil y CSS no fuerza fullscreen, fallback true
        if (window.innerWidth <= 640 && computed.position !== 'fixed') return true;
        return false;
      }
      function injectStyle() {
        const ID = 'auto-fullscreen-style';
        if (document.getElementById(ID)) return;
        const s = document.createElement('style'); s.id = ID;
        s.textContent = `
          .frase-card.fullscreen { position: fixed !important; left: 0 !important; right: 0 !important; top: var(--header-height,72px) !important; bottom: 0 !important; height: calc(100vh - var(--header-height,72px)) !important; width: 100vw !important; max-width: none !important; margin: 0 !important; border-radius: 0 !important; padding: 0 !important; display: flex !important; align-items:center !important; justify-content:center !important; z-index: 1100 !important; box-shadow:none !important; background: transparent !important; }
          .frase-card.fullscreen .frase-content { width:100% !important; max-width: 920px !important; max-height: none !important; overflow: auto !important; display:flex !important; align-items:center !important; justify-content:center !important; text-align:center !important; padding: clamp(18px,5vw,36px) !important; }
          .frase-card.fullscreen .frase-controls { position: fixed !important; left: 50% !important; transform: translateX(-50%) !important; bottom: 18px !important; z-index: 1200 !important; }
        `;
        (document.head || document.documentElement).appendChild(s);
      }

      // apply early if needed
      if (needsFallback()) injectStyle();

      // re-check on load / resize to handle late-applied CSS or SW cache updates
      window.addEventListener('resize', function () {
        try {
          if (needsFallback()) injectStyle();
        } catch (e) {}
      });

      // Also re-check after a small delay on DOMContentLoaded
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(()=>{ try { if (needsFallback()) injectStyle(); } catch(e){} }, 120);
      });
    } catch (e) {
      console.warn('[ui-fixes] ensureRuntimeFullscreenStyles failed', e);
    }
  })();

  // ---------- Resto de funciones (mostrarFrase, listeners) ----------
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

  function ensureFullscreenOnMobile() {
    try {
      const fc = document.getElementById('frase-card') || document.querySelector('.frase-card');
      if (!fc) return;
      const isMobile = window.innerWidth <= 640;
      if (isMobile) fc.classList.add('fullscreen');
      else fc.classList.remove('fullscreen');
    } catch (e) { /* ignore */ }
  }

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
        if (ev.target.closest && ev.target.closest('.frase-controls')) return;
        safeMostrarFrase();
      }, { passive: true });
    }

    // Tecla ESPACIO para avanzar
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

    if (window.LR_DEBUG) console.log('[ui-fixes] listeners attached and fullscreen logic initialized');
  });
})();
