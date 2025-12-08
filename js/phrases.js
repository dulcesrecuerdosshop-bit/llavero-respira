// phrases.js - Delegador seguro a ClientPhrases (sin array gigante inline)
// Mantiene mostrarFrase/showDailyPhraseInto, persistencia y detector de contraste.
// Reemplaza completamente el archivo js/phrases.js por este contenido.
// Después limpia cache / service worker y recarga la web para aplicar los cambios.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // SAFE FALLBACK (pequeño) para evitar "Cargando..." si ClientPhrases falla.
  // ---------------------------------------------------------------------------
  const SAFE_FALLBACK_PHRASES = [
    "Un breve recordatorio para ti.\nRespira y mira dentro.",
    "Respira hondo.\nSuelta suavemente.",
    "Hoy puedes empezar de nuevo.\nUn paso a la vez.",
    "Pon tu mano en el pecho, respira lento y vuelve al presente."
  ];

  // ---------------------------------------------------------------------------
  // Intentar construir la lista desde window.ClientPhrases (si existe)
  // ---------------------------------------------------------------------------
  function buildPhrasesFromClientPhrases() {
    try {
      if (!window.ClientPhrases) return null;

      // 1) getAll (si existe)
      if (typeof window.ClientPhrases.getAll === 'function') {
        try {
          const all = window.ClientPhrases.getAll();
          if (Array.isArray(all) && all.length) return all.slice(0);
        } catch (e) {}
      }

      // 2) categorías conocidas mediante get()
      const commonCats = ['rutina','calma','validacion','bienvenida','crisis','amor','gratitud','autoayuda'];
      const acc = [];
      try {
        if (typeof window.ClientPhrases.get === 'function') {
          commonCats.forEach(c => {
            try {
              const arr = window.ClientPhrases.get(c);
              if (Array.isArray(arr) && arr.length) acc.push(...arr);
            } catch (e) {}
          });
        }
      } catch (e) {}

      if (acc.length) return acc;

      // 3) fallback: intentar múltiples random para rellenar
      try {
        if (typeof window.ClientPhrases.random === 'function') {
          const seen = new Set();
          const out = [];
          for (let k = 0; k < 20; k++) {
            try {
              const p = window.ClientPhrases.random('rutina') || window.ClientPhrases.random();
              if (p && !seen.has(p)) { seen.add(p); out.push(p); }
            } catch (e) {}
          }
          if (out.length) return out;
        }
      } catch (e) {}

      // 4) último recurso: explorar propiedades internas
      try {
        for (const k in window.ClientPhrases) {
          if (!Object.prototype.hasOwnProperty.call(window.ClientPhrases, k)) continue;
          const v = window.ClientPhrases[k];
          if (Array.isArray(v) && v.length && typeof v[0] === 'string') return v.slice(0);
        }
      } catch (e) {}

      return null;
    } catch (e) {
      return null;
    }
  }

  // Inicializar window._phrases_list de forma segura
  (function initPhrasesList(){
    try {
      const fromClient = buildPhrasesFromClientPhrases();
      if (Array.isArray(fromClient) && fromClient.length) {
        window._phrases_list = fromClient;
      } else {
        window._phrases_list = SAFE_FALLBACK_PHRASES.slice(0);
      }
    } catch (e) {
      window._phrases_list = SAFE_FALLBACK_PHRASES.slice(0);
    }
  })();

  // ---------------------------------------------------------------------------
  // Fondos por defecto y comprobación de imágenes
  // ---------------------------------------------------------------------------
  const gradientFondos = [
    "linear-gradient(135deg, #f6d365, #fda085)",
    "linear-gradient(135deg, #a1c4fd, #c2e9fb)",
    "linear-gradient(135deg, #84fab0, #8fd3f4)",
    "linear-gradient(135deg, #fccb90, #d57eeb)",
    "linear-gradient(135deg, #f093fb, #f5576c)"
  ];

  const candidateImages = [
    "assets/bg1.webp",
    "assets/bg2.webp",
    "assets/bg3.webp",
    "assets/bg4.webp"
  ];

  let fondosDisponibles = [...gradientFondos];

  function fraseEl() { return document.getElementById('frase-text') || document.getElementById('frase'); }
  function bgEl() { return document.getElementById('frase-bg'); }

  function checkImages(list){
    return Promise.all(list.map(src => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ src, ok: true });
      img.onerror = () => resolve({ src, ok: false });
      img.src = src;
    })));
  }

  async function initFondos(){
    try {
      const results = await checkImages(candidateImages);
      window._phrases_image_check = results;
      results.forEach(r => { if (r.ok) fondosDisponibles.push(r.src); });
      window.fondosDisponibles = fondosDisponibles;
    } catch (e) { console.warn('[phrases] initFondos', e); }
  }

  // ---------------------------------------------------------------------------
  // Helpers visuales
  // ---------------------------------------------------------------------------
  function applyBackgroundToElement(el, bgValue){
    if (!el) return;
    if (/\.(jpe?g|png|webp|avif)$/i.test(bgValue)){
      el.style.backgroundImage = `url('${bgValue}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
    } else {
      el.style.background = bgValue;
    }
  }

  async function detectContrastAndToggleDarkBg(imageUrl, containerEl) {
    try {
      containerEl = containerEl || document.querySelector('.frase-card');
      if (!containerEl) return;

      if (!imageUrl || /\.(svg)$/i.test(imageUrl) || imageUrl.indexOf('data:') === 0) {
        containerEl.classList.remove('dark-bg');
        return;
      }

      const img = new Image();
      img.crossOrigin = 'Anonymous';
      const p = new Promise((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('img load error')); });
      img.src = imageUrl + (imageUrl.indexOf('?') === -1 ? '?t=' + Date.now() : '&t=' + Date.now());
      await p;

      const w = 40, h = 40;
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let i = 0; i < data.length; i += 12) { rSum += data[i]; gSum += data[i+1]; bSum += data[i+2]; count++; }
      const r = rSum / count, g = gSum / count, b = bSum / count;
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const isDark = luminance < 0.45;

      if (isDark) containerEl.classList.remove('dark-bg'); else containerEl.classList.add('dark-bg');
      try { canvas.width = canvas.height = 0; } catch (e) {}
    } catch (e) {
      try { document.querySelector('.frase-card') && document.querySelector('.frase-card').classList.add('dark-bg'); } catch (_) {}
      console.warn('detectContrastAndToggleDarkBg failed', e);
    }
  }

  // ---------------------------------------------------------------------------
  // mostrarFrase: usa window._phrases_list (delegado) y prioriza PhraseSelector
  // ---------------------------------------------------------------------------
  let lastIndex = -1;

  function mostrarFrase() {
    const fEl = fraseEl();
    const bEl = bgEl();
    if (!fEl) return;

    const frasesLocal = Array.isArray(window._phrases_list) && window._phrases_list.length ? window._phrases_list : SAFE_FALLBACK_PHRASES.slice(0);
    if (!frasesLocal.length) return;

    let i = Math.floor(Math.random() * frasesLocal.length);
    if (i === lastIndex) i = (i + 1) % frasesLocal.length;

    lastIndex = i;
    const j = Math.floor(Math.random() * fondosDisponibles.length);
    fEl.style.opacity = 0;

    setTimeout(() => {
      try {
        var chosenPhrase = frasesLocal[i];

        var clientSnapshot = window.CLIENT_USER || (localStorage.getItem('lr_client_runtime_user') ? JSON.parse(localStorage.getItem('lr_client_runtime_user')) : {});

        if (window.PhraseSelector && typeof window.PhraseSelector.selectAndMark === 'function') {
          try {
            var res = window.PhraseSelector.selectAndMark(clientSnapshot);
            if (res && typeof res.phrase === 'string' && res.phrase.trim().length) {
              chosenPhrase = res.phrase;
            }
            if (res && res.updatedClient) {
              window.CLIENT_USER = Object.assign({}, window.CLIENT_USER || {}, res.updatedClient);
              try { window.saveClientRuntime && window.saveClientRuntime(res.updatedClient); } catch (e) { try { localStorage.setItem('lr_client_runtime_user', JSON.stringify(window.CLIENT_USER)); } catch(_){ } }
              if (res.category) { try { window.CLIENT_USER.ultimaCategoriaMostrada = res.category; window.saveClientRuntime && window.saveClientRuntime({ ultimaCategoriaMostrada: res.category }); } catch(e){} }
            }
          } catch (e) { console.warn('PhraseSelector.selectAndMark fallo', e); }
        }

        if ((!chosenPhrase || !chosenPhrase.trim()) && window.ClientPhrases && typeof window.ClientPhrases.random === 'function') {
          try {
            var estado = (clientSnapshot && clientSnapshot.estadoEmocionalActual) ? String(clientSnapshot.estadoEmocionalActual).toLowerCase() : '';
            var fallbackCategory = 'rutina';
            if (estado.indexOf('crisis') !== -1 || (clientSnapshot && Number(clientSnapshot.nivelDeAnsiedad) >= 4)) fallbackCategory = 'crisis';
            else if (estado.indexOf('ansiedad') !== -1 || estado.indexOf('tenso') !== -1) fallbackCategory = 'calma';
            var cpPhrase = window.ClientPhrases.random(fallbackCategory) || window.ClientPhrases.random('rutina');
            if (cpPhrase) chosenPhrase = cpPhrase;
          } catch (e) { /* ignore */ }
        }

        if (fEl) { try { fEl.textContent = chosenPhrase; } catch (e) { try { fEl.innerText = chosenPhrase; } catch (_) {} } }
        try { window._phrases_current = chosenPhrase; window._phrases_currentIndex = (typeof i === 'number' && chosenPhrase === frasesLocal[i]) ? i : -1; } catch (e) {}
      } catch (e) {
        try { fEl.textContent = frasesLocal[i] || SAFE_FALLBACK_PHRASES[0]; } catch (_) { }
        try { window._phrases_current = frasesLocal[i] || SAFE_FALLBACK_PHRASES[0]; window._phrases_currentIndex = 0; } catch (_) { }
      }

      const bgValue = fondosDisponibles[j] || gradientFondos[j % gradientFondos.length];
      if (bEl) {
        applyBackgroundToElement(bEl, bgValue);
        try {
          const imageUrl = (/\.(jpe?g|png|webp|avif)$/i.test(bgValue)) ? bgValue : null;
          if (typeof detectContrastAndToggleDarkBg === 'function') detectContrastAndToggleDarkBg(imageUrl, document.querySelector('.frase-card'));
        } catch (e) { console.warn('contrast toggle call failed', e); }
      } else {
        try { document.querySelector('.frase-card') && document.querySelector('.frase-card').classList.remove('dark-bg'); } catch (_) { }
      }

      try { const card = document.querySelector('.frase-card'); if (card && !card.classList.contains('fullscreen')) card.classList.add('fullscreen'); } catch (e) { }

      fEl.style.opacity = 1;

      try { const hintEl = document.querySelector('.hint'); if (hintEl) hintEl.remove(); } catch (e) { }

      if (typeof window.onFraseMostrada === 'function') try { window.onFraseMostrada(window._phrases_current); } catch (e) { }
    }, 160);
  }

  // init
  document.addEventListener('DOMContentLoaded', async () => {
    await initFondos();
    mostrarFrase();
    document.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.key === ' ') && document.activeElement && ['INPUT','TEXTAREA'].indexOf(document.activeElement.tagName) === -1) { e.preventDefault(); mostrarFrase(); }
    });
  });

  window.mostrarFrase = mostrarFrase;

  // integration helper
  (function(){
    function showDailyPhraseInto(containerSelector) {
      try {
        var client = window.CLIENT_USER || JSON.parse(localStorage.getItem('lr_client_runtime_user') || '{}');
        var res = window.PhraseSelector ? window.PhraseSelector.selectAndMark(client) : { category:'rutina', phrase: (window.ClientPhrases && typeof window.ClientPhrases.random === 'function' ? window.ClientPhrases.random('rutina') : SAFE_FALLBACK_PHRASES[0]) };
        var el = document.querySelector(containerSelector || '.frase-text');
        if (el) el.textContent = res.phrase;
        try { window.saveClientRuntime && window.saveClientRuntime(res.updatedClient); } catch(e){}
        try { window.ThemeManager && window.ThemeManager.apply(res.updatedClient || client); } catch(e){}
        try { window.CLIENT_USER = res.updatedClient || client; } catch(e){}
        if (res.updatedClient && res.updatedClient.suggestedBreathingType) {
          try {
            if (typeof window.prepareClientBreathUI === 'function') window.prepareClientBreathUI('.breathing-suggestion');
            else {
              var ps = document.querySelector('.breathing-suggestion');
              if (ps) ps.style.display = '';
            }
          } catch (e) {}
        }
      } catch (e) { console.warn('showDailyPhraseInto failed', e); }
    }
    window.showDailyPhraseInto = showDailyPhraseInto;
    window.mostrarFrase = function(){ return window.showDailyPhraseInto && window.showDailyPhraseInto('.frase-text'); };
  })();

  // ---------------------------------------------------------------------------
  // Finalizer: reintenta si algo (por timing o por otros scripts) deja vacía la lista
  // ---------------------------------------------------------------------------
  (function finalizer(){

    // ---------------------------------------------------------
    // Declaramos runInit al principio del scope finalizer para
    // evitar ReferenceError si se llama por setTimeout/guardas.
    // ---------------------------------------------------------
    function runInit(){
      try {
        const ok = rebuildIfEmpty();
        ensureFondos();
        ensureMostrarFn();
        try { typeof ensureBreathButton === 'function' && ensureBreathButton(); } catch(e) {}
        try { window.mostrarFrase && window.mostrarFrase(); } catch(e){}
        return ok;
      } catch(e){ return false; }
    }

    // ---------------------------------------------------------
    // Resto del finalizer (funciones auxiliares)
    // ---------------------------------------------------------
    function rebuildIfEmpty(){
      try {
        if (!window._phrases_list || !window._phrases_list.length) {
          const from = (function(){
            try {
              if (!window.ClientPhrases) return null;
              if (typeof window.ClientPhrases.getAll === 'function') {
                const all = window.ClientPhrases.getAll();
                if (Array.isArray(all) && all.length) return all.slice(0);
              }
              const collected = [];
              const cats = ['rutina','calma','validacion','bienvenida','crisis','amor','gratitud','autoayuda'];
              try {
                if (typeof window.ClientPhrases.get === 'function') {
                  cats.forEach(c => { try { const a = window.ClientPhrases.get(c); if (Array.isArray(a)) collected.push(...a); } catch(e){} });
                }
              } catch(e){}
              try {
                if (!collected.length && typeof window.ClientPhrases.random === 'function') {
                  const seen = new Set();
                  for (let k=0;k<10;k++){
                    try {
                      const p = window.ClientPhrases.random('rutina') || window.ClientPhrases.random();
                      if (p && !seen.has(p)) { seen.add(p); collected.push(p); }
                    } catch(e){}
                  }
                }
              } catch(e){}
              try {
                if (!collected.length) {
                  for (const k in window.ClientPhrases) {
                    if (!Object.prototype.hasOwnProperty.call(window.ClientPhrases,k)) continue;
                    const v = window.ClientPhrases[k];
                    if (Array.isArray(v) && v.length && typeof v[0] === 'string') collected.push(...v);
                  }
                }
              } catch(e){}
              return collected.length ? Array.from(new Set(collected)) : null;
            } catch(e){ return null; }
          })();
          if (Array.isArray(from) && from.length) {
            window._phrases_list = from.slice(0);
            return true;
          } else {
            window._phrases_list = SAFE_FALLBACK_PHRASES.slice(0);
            return false;
          }
        }
        return true;
      } catch(e){ console.warn('rebuildIfEmpty fail', e); return false; }
    }

    function ensureFondos(){
      try {
        if (!window.fondosDisponibles || !window.fondosDisponibles.length) window.fondosDisponibles = [...gradientFondos];
        candidateImages.forEach(i => { if (!window.fondosDisponibles.includes(i)) window.fondosDisponibles.push(i); });
      } catch(e){ /* silent */ }
    }

    function ensureMostrarFn(){
      try {
        if (typeof window.mostrarFrase !== 'function') {
          window.mostrarFrase = mostrarFrase;
        }
      } catch(e){ /* silent */ }
    }

    // === Inserta dentro de finalizer(), por ejemplo justo después de ensureMostrarFn() ===
    function ensureBreathButton(){
      try {
        // si ya existe, no hacemos nada
        if (document.getElementById('breathBtn')) return;

        const card = document.querySelector('.frase-card') || document.querySelector('.card') || document.body;
        if (!card) return;

        // encontrar contenedor de controles donde añadir el botón (intenta varios selectores)
        const possible = [
          '.frase-controls',
          '.card-controls',
          '.controls',
          '.frase-card__controls',
          '.card .controls',
          '.frase-card footer',
          '.frase-card'
        ];
        let controls = null;
        for (const sel of possible) {
          try { const el = card.querySelector(sel); if (el) { controls = el; break; } } catch(e){}
        }
        // fallback: añadir al propio card si no hay contenedor específico
        if (!controls) {
          // try to add a .frase-controls container if possible
          try {
            const content = card.querySelector('.frase-content') || card;
            controls = document.createElement('div');
            controls.className = 'frase-controls';
            content.appendChild(controls);
          } catch (e) {
            controls = card;
          }
        }

        // crear botón
        const btn = document.createElement('button');
        btn.id = 'breathBtn';
        btn.type = 'button';
        btn.className = 'lr-btn breath-btn';
        btn.textContent = 'Respirar';

        // estilos básicos (ajusta si quieres)
        btn.style.cssText = 'padding:10px 16px;border-radius:12px;border:none;background:linear-gradient(90deg,#ffc371,#ff6b6b);color:#04232a;font-weight:700;cursor:pointer;margin-left:10px;box-shadow:0 6px 18px rgba(0,0,0,0.12)';

        // handler: priorizar abrir hotfix/modal, fallback a helpers
        btn.addEventListener('click', function (e) {
          try {
            // detener supresión visual si existe
            try { if (typeof window.__stop_hotfix_suppression === 'function') window.__stop_hotfix_suppression(); } catch(e){}

            // intentar abrir hotfix flotante / modal programable
            if (typeof window.openBreathHotfix === 'function') { window.openBreathHotfix(); return; }
            if (window.lr_breathSessions && typeof window.lr_breathSessions.openHotfix === 'function') { window.lr_breathSessions.openHotfix(); return; }

            // fallback a iniciar flujo (sin UI)
            if (window.lr_helpers && typeof window.lr_helpers.startBreathFlow === 'function') { window.lr_helpers.startBreathFlow(); return; }
            if (typeof window.startBreathFlowInternal === 'function') { window.startBreathFlowInternal(); return; }

            try { showToast && typeof showToast === 'function' && showToast('Función de respiración no disponible'); } catch(e){}
          } catch (err) { console.warn('breathBtn click error', err); }
        });

        // insertarlo al principio o al final según convenga
        try { controls.insertBefore(btn, controls.firstChild); } catch(e){ try { controls.appendChild(btn); } catch(_){} }
      } catch(e) { console.warn('ensureBreathButton error', e); }
    }

    // Exponer ensureBreathButton por si otros scripts lo necesitan
    try { window.ensureBreathButton = window.ensureBreathButton || ensureBreathButton; } catch(e){}

    // Ejecutar una vez de forma inmediata (si el DOM ya está listo)
    try { ensureBreathButton(); } catch(e){}

    // run shortly after load, and again as a safety net
    if (document.readyState === 'complete') {
      setTimeout(runInit, 200);
    } else {
      window.addEventListener('load', () => setTimeout(runInit, 200));
    }
    // also try a couple of times in case other scripts run slightly later
    setTimeout(runInit, 800);
    setTimeout(runInit, 1600);
    // periodic guard: if something wipes the list later, we try to restore
    const guard = setInterval(() => {
      try {
        if (!window._phrases_list || !window._phrases_list.length) {
          runInit();
        }
      } catch(e){}
    }, 5000);
    // stop guard after 2 minutes to avoid infinite work
    setTimeout(() => clearInterval(guard), 2 * 60 * 1000);
  })();

})();
