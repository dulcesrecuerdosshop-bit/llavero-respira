// phrases.js - delegador seguro a ClientPhrases (robusto, sin array gigante inline)
// Mantiene mostrarFrase/showDailyPhraseInto, persistencia y mejoras de legibilidad.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helper: intentar construir frases desde window.ClientPhrases (si existe)
  // ---------------------------------------------------------------------------
  function buildPhrasesFromClientPhrases() {
    try {
      if (!window.ClientPhrases || typeof window.ClientPhrases.get !== 'function') return null;

      // 1) getAll()
      if (typeof window.ClientPhrases.getAll === 'function') {
        try {
          const all = window.ClientPhrases.getAll();
          if (Array.isArray(all) && all.length) return all.slice(0);
        } catch(e){}
      }

      // 2) categories props
      const possibleCatProps = ['categories','_categories','_cats','catList'];
      for (const p of possibleCatProps) {
        try {
          if (Array.isArray(window.ClientPhrases[p]) && window.ClientPhrases[p].length) {
            const acc = [];
            window.ClientPhrases[p].forEach(c => {
              try { const arr = window.ClientPhrases.get(c); if (Array.isArray(arr)) acc.push(...arr); } catch(e){}
            });
            if (acc.length) return acc;
          }
        } catch(e){}
      }

      // 3) try common category names
      const commonCats = ['rutina','calma','validacion','bienvenida','crisis','amor','gratitud','autoayuda'];
      const acc = [];
      commonCats.forEach(c => {
        try { const arr = window.ClientPhrases.get(c); if (Array.isArray(arr) && arr.length) acc.push(...arr); } catch(e){}
      });
      if (acc.length) return acc;

      // 4) search for arrays inside ClientPhrases
      try {
        for (const k in window.ClientPhrases) {
          if (!Object.prototype.hasOwnProperty.call(window.ClientPhrases, k)) continue;
          const v = window.ClientPhrases[k];
          if (Array.isArray(v) && v.length && typeof v[0] === 'string') return v.slice(0);
        }
      } catch(e){}

      return null;
    } catch(e){ return null; }
  }

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
  // Construir window._phrases_list de forma segura
  // ---------------------------------------------------------------------------
  (function initPhrasesList(){
    try {
      const fromClient = buildPhrasesFromClientPhrases();
      if (Array.isArray(fromClient) && fromClient.length) {
        window._phrases_list = fromClient;
      } else {
        // como seguridad ligera, mantener un fallback corto
        window._phrases_list = SAFE_FALLBACK_PHRASES.slice(0);
      }
    } catch(e) {
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
    } catch(e){ console.warn('[phrases] initFondos', e); }
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

  // Detector de contraste (muestreo rápido) para alternar .dark-bg
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
      try { canvas.width = canvas.height = 0; } catch(e){}
    } catch (e) {
      try { document.querySelector('.frase-card') && document.querySelector('.frase-card').classList.add('dark-bg'); } catch(_) {}
      console.warn('detectContrastAndToggleDarkBg failed', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Mostrar frase: prioriza PhraseSelector → ClientPhrases → fallback local
  // ---------------------------------------------------------------------------
  let lastIndex = -1;

  function mostrarFrase() {
    const fEl = fraseEl();
    const bEl = bgEl();
    if (!fEl) return;
    const frasesLocal = window._phrases_list || [];
    let i = frasesLocal.length ? Math.floor(Math.random() * frasesLocal.length) : 0;
    if (i === lastIndex) i = (i + 1) % Math.max(1, frasesLocal.length);

    lastIndex = i;
    const j = Math.floor(Math.random() * fondosDisponibles.length);
    fEl.style.opacity = 0;
    setTimeout(() => {
      try {
        var chosenPhrase = frasesLocal.length ? frasesLocal[i] : SAFE_FALLBACK_PHRASES[0];

        // PhraseSelector preference (if available)
        var clientSnapshot = window.CLIENT_USER || (localStorage.getItem('lr_client_runtime_user') ? JSON.parse(localStorage.getItem('lr_client_runtime_user')) : {});
        if (window.PhraseSelector && typeof window.PhraseSelector.selectAndMark === 'function') {
          try {
            var res = window.PhraseSelector.selectAndMark(clientSnapshot);
            if (res && typeof res.phrase === 'string' && res.phrase.trim().length) chosenPhrase = res.phrase;
            if (res && res.updatedClient) {
              window.CLIENT_USER = Object.assign({}, window.CLIENT_USER || {}, res.updatedClient);
              try { window.saveClientRuntime && window.saveClientRuntime(res.updatedClient); } catch(e){ try { localStorage.setItem('lr_client_runtime_user', JSON.stringify(window.CLIENT_USER)); } catch(_){} }
              if (res.category) { try { window.CLIENT_USER.ultimaCategoriaMostrada = res.category; window.saveClientRuntime && window.saveClientRuntime({ ultimaCategoriaMostrada: res.category }); } catch(e){} }
            }
          } catch(e){ console.warn('PhraseSelector.selectAndMark fallo', e); }
        }

        // fallback to ClientPhrases.random if needed
        if ((!chosenPhrase || !chosenPhrase.trim()) && window.ClientPhrases && typeof window.ClientPhrases.random === 'function') {
          try {
            var estado = (clientSnapshot && clientSnapshot.estadoEmocionalActual) ? String(clientSnapshot.estadoEmocionalActual).toLowerCase() : '';
            var fallbackCategory = 'rutina';
            if (estado.indexOf('crisis') !== -1 || (clientSnapshot && Number(clientSnapshot.nivelDeAnsiedad) >= 4)) fallbackCategory = 'crisis';
            else if (estado.indexOf('ansiedad') !== -1 || estado.indexOf('tenso') !== -1) fallbackCategory = 'calma';
            var cpPhrase = window.ClientPhrases.random(fallbackCategory) || window.ClientPhrases.random('rutina');
            if (cpPhrase) chosenPhrase = cpPhrase;
          } catch(e){ /* ignore */ }
        }

        // apply to DOM and sync memory
        if (fEl) { try { fEl.textContent = chosenPhrase; } catch(e){ try { fEl.innerText = chosenPhrase; } catch(_){} } }
        try { window._phrases_current = chosenPhrase; window._phrases_currentIndex = (typeof i === 'number' && chosenPhrase === (frasesLocal[i]||'') ) ? i : -1; } catch(e){}
      } catch(e){
        try { fEl.textContent = (window._phrases_list && window._phrases_list[0]) || SAFE_FALLBACK_PHRASES[0]; } catch(_) {}
        try { window._phrases_current = window._phrases_list && window._phrases_list[0]; window._phrases_currentIndex = 0; } catch(_) {}
      }

      // apply background and run contrast detection
      const bgValue = fondosDisponibles[j] || gradientFondos[j % gradientFondos.length];
      if (bEl) {
        applyBackgroundToElement(bEl, bgValue);
        try {
          const imageUrl = (/\.(jpe?g|png|webp|avif)$/i.test(bgValue)) ? bgValue : null;
          if (typeof detectContrastAndToggleDarkBg === 'function') detectContrastAndToggleDarkBg(imageUrl, document.querySelector('.frase-card'));
        } catch(e){ console.warn('contrast toggle call failed', e); }
      } else {
        try { document.querySelector('.frase-card') && document.querySelector('.frase-card').classList.remove('dark-bg'); } catch(_) {}
      }

      fEl.style.opacity = 1;

      // remove help hint to avoid overlap
      try { const hintEl = document.querySelector('.hint'); if (hintEl) hintEl.remove(); } catch(e){}

      if (typeof window.onFraseMostrada === 'function') try{ window.onFraseMostrada(window._phrases_current); }catch(e){}
    }, 160);
  }

  // init on DOM ready
  document.addEventListener('DOMContentLoaded', async () => {
    await initFondos();
    mostrarFrase();
    document.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.key === ' ') && document.activeElement && ['INPUT','TEXTAREA'].indexOf(document.activeElement.tagName) === -1) { e.preventDefault(); mostrarFrase(); }
    });
  });

  // Show API expected by other modules
  window.mostrarFrase = mostrarFrase;

  // Integration helper: showDailyPhraseInto (exposed public)
  (function(){
    function showDailyPhraseInto(containerSelector) {
      try {
        var client = window.CLIENT_USER || JSON.parse(localStorage.getItem('lr_client_runtime_user') || '{}');
        var res = window.PhraseSelector ? window.PhraseSelector.selectAndMark(client) : { category:'rutina', phrase: (window.ClientPhrases && typeof window.ClientPhrases.random === 'function' ? window.ClientPhrases.random('rutina') : (window._phrases_list && window._phrases_list[0]) || SAFE_FALLBACK_PHRASES[0]) };
        var el = document.querySelector(containerSelector || '.frase-text');
        if (el) el.textContent = res.phrase;
        window.saveClientRuntime && window.saveClientRuntime(res.updatedClient);
        window.ThemeManager && window.ThemeManager.apply(res.updatedClient || client);
        window.CLIENT_USER = res.updatedClient || client;
        if (res.updatedClient && res.updatedClient.suggestedBreathingType) {
          try {
            if (typeof window.prepareClientBreathUI === 'function') window.prepareClientBreathUI('.breathing-suggestion');
            else {
              var ps = document.querySelector('.breathing-suggestion');
              if (ps) ps.style.display = '';
            }
          } catch(e){}
        }
      } catch(e){ console.warn('showDailyPhraseInto failed', e); }
    }
    window.showDailyPhraseInto = showDailyPhraseInto;
    // keep compatibility: map existing call sites
    window.mostrarFrase = function(){ return window.showDailyPhraseInto && window.showDailyPhraseInto('.frase-text'); };
  })();

})();
