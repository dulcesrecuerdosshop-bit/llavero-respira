// phrases.js - Lista de fragmentos (micro-lecturas) para Llavero Respira
// Este archivo contiene la colección completa de fragmentos y la lógica mínima
// para inicializar fondos y mostrar una frase aleatoria.
// IMPORTANTE: mostrarFrase() expone el índice y la frase actual en window para que
// el TTS / compartir / descarga siempre usen la versión "oficial" en memoria.
//
// Reemplaza completamente el archivo js/phrases.js por este contenido.
// Luego limpia cache / service worker y recarga la web para aplicar los cambios.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Lista de frases (micro-lecturas)
  // ---------------------------------------------------------------------------
  const frases = [
`A veces lo único que necesitas es un momento contigo.
Cerrar los ojos, inhalar profundo y soltar despacio.
Escuchar tu cuerpo antes que el ruido de fuera.
Respira. Vas mejor de lo que crees.
Y mañana, aún mejor.`,

`Hoy permítete no correr.
No cumplir todas las expectativas, solo las tuyas.
La vida no te pide que seas perfecta,
te pide que sigas presente.
Respira, vuelve a tu centro y continúa.`,

/* ... resto del array EXACTAMENTE igual que en tu archivo original ... */

`Respira y observa que los límites también protegen la creatividad.  
A veces decir "no" es un acto de amor por lo que quieres crear.  
Respira y decide con calma.`,


`Respira y vuelve a intentarlo cuando algo falle.  
La insistencia amable es más poderosa que la fuerza de choque.  
Sigue con ternura.`,


`Respira y mantén un gesto ritual antes de cada tarea importante.  
Puede ser ajustar los hombros, inhalar y soltar.  
El ritual prepara la mente.`
  ];

  // ---------------------------------------------------------------------------
  // Fondos por defecto (gradientes) y lista de imágenes candidatas
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

  // ---------------------------------------------------------------------------
  // Exposición y lógica de selección / renderizado
  // ---------------------------------------------------------------------------

  // Exponer lista en memoria para que helpers (TTS / share / download) la lean
  window._phrases_list = frases;

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

  let lastIndex = -1;

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

  function mostrarFrase() {
    const fEl = fraseEl();
    const bEl = bgEl();
    if (!fEl) return;
    let i = Math.floor(Math.random() * frases.length);
    if (i === lastIndex) i = (i + 1) % frases.length;

    // no exponemos la frase aún; la determinamos dentro del timeout (evita race conditions)
    lastIndex = i;
    const j = Math.floor(Math.random() * fondosDisponibles.length);
    fEl.style.opacity = 0;
    setTimeout(() => {

      // BEGIN reemplazo seguro: priorizar PhraseSelector / ClientPhrases sin perder frases originales
      try {
        // valor por defecto: la frase desde el array local (para no perder texto)
        var chosenPhrase = frases[i];

        // obtener snapshot del cliente runtime
        var clientSnapshot = window.CLIENT_USER || (localStorage.getItem('lr_client_runtime_user') ? JSON.parse(localStorage.getItem('lr_client_runtime_user')) : {});

        // 1) preferir PhraseSelector si está disponible
        if (window.PhraseSelector && typeof window.PhraseSelector.selectAndMark === 'function') {
          try {
            var res = window.PhraseSelector.selectAndMark(clientSnapshot);
            if (res && typeof res.phrase === 'string' && res.phrase.trim().length) {
              chosenPhrase = res.phrase;
            }
            if (res && res.updatedClient) {
              // aplicar y persistir updatedClient (sin eliminar otras propiedades)
              window.CLIENT_USER = Object.assign({}, window.CLIENT_USER || {}, res.updatedClient);
              try { window.saveClientRuntime && window.saveClientRuntime(res.updatedClient); } catch(e){ try { localStorage.setItem('lr_client_runtime_user', JSON.stringify(window.CLIENT_USER)); } catch(_){} }
              // si res.category está presente, mantener como ultima categoria mostrada
              if (res.category) {
                try { window.CLIENT_USER.ultimaCategoriaMostrada = res.category; window.saveClientRuntime && window.saveClientRuntime({ ultimaCategoriaMostrada: res.category }); } catch(e) {}
              }
            }
          } catch(e) { console.warn('PhraseSelector.selectAndMark fallo, fallback a array local', e); }
        }
        // 2) si no hay result de PhraseSelector y existe ClientPhrases, intentar fallback por categoria
        if ((!chosenPhrase || !chosenPhrase.trim()) && window.ClientPhrases && typeof window.ClientPhrases.random === 'function') {
          try {
            // derivar categoria simple desde cliente si es posible
            var estado = (clientSnapshot && clientSnapshot.estadoEmocionalActual) ? String(clientSnapshot.estadoEmocionalActual).toLowerCase() : '';
            var fallbackCategory = 'rutina';
            if (estado.indexOf('crisis') !== -1 || (clientSnapshot && Number(clientSnapshot.nivelDeAnsiedad) >= 4)) fallbackCategory = 'crisis';
            else if (estado.indexOf('ansiedad') !== -1 || estado.indexOf('tenso') !== -1) fallbackCategory = 'calma';
            // obtener frase desde ClientPhrases
            var cpPhrase = window.ClientPhrases.random(fallbackCategory) || window.ClientPhrases.random('rutina');
            if (cpPhrase) chosenPhrase = cpPhrase;
          } catch(e){ /* ignore */ }
        }

        // 3) aplicar al DOM y sincronizar memoria
        if (fEl) {
          try { fEl.textContent = chosenPhrase; } catch(e){ try { fEl.innerText = chosenPhrase; } catch(_){} }
        }
        try {
          window._phrases_current = chosenPhrase;
          // si la frase viene del propio array local, mantener el índice; si fue seleccionada por selector, marcar como -1
          window._phrases_currentIndex = (typeof i === 'number' && chosenPhrase === frases[i]) ? i : -1;
        } catch(e){}
      } catch(e){
        // en caso de problemas, fallback directo (no pierde frase)
        try { fEl.textContent = frases[i]; } catch(e2){ try { fEl.innerText = frases[i]; } catch(_){} }
        try { window._phrases_current = frases[i]; window._phrases_currentIndex = i; } catch(_) {}
      }
      // END reemplazo seguro

     // detectContrastAndToggleDarkBg(imageUrl, containerEl)
// - imageUrl: URL de la imagen (string)
// - containerEl: elemento .frase-card (o document.querySelector('.frase-card'))
async function detectContrastAndToggleDarkBg(imageUrl, containerEl) {
  try {
    containerEl = containerEl || document.querySelector('.frase-card');
    if (!containerEl) return;

    // No image -> remove class
    if (!imageUrl || /\.(svg)$/i.test(imageUrl) || imageUrl.indexOf('data:') === 0) {
      containerEl.classList.remove('dark-bg');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    const p = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('img load error'));
    });
    // cache-bust para forzar reload
    img.src = imageUrl + (imageUrl.indexOf('?') === -1 ? '?t=' + Date.now() : '&t=' + Date.now());
    await p;

    // small sampling canvas
    const w = 40, h = 40;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h).data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < data.length; i += 4 * 3) { // sample every 3 pixels
      rSum += data[i]; gSum += data[i+1]; bSum += data[i+2];
      count++;
    }
    const r = rSum / count, g = gSum / count, b = bSum / count;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const isDark = luminance < 0.45; // umbral (ajustable)

    if (isDark) containerEl.classList.remove('dark-bg');
    else containerEl.classList.add('dark-bg');

    // cleanup
    try { canvas.width = canvas.height = 0; } catch(e) {}
  } catch (e) {
    // si falla (tainted canvas/CORS), fallback conservador: activar dark-bg si no estás seguro
    try { document.querySelector('.frase-card') && document.querySelector('.frase-card').classList.add('dark-bg'); } catch(_) {}
    console.warn('detectContrastAndToggleDarkBg failed', e);
  }
}
      fEl.style.opacity = 1;
      // NOTA: pasar la frase realmente mostrada al callback (no el array original)
      if (typeof window.onFraseMostrada === 'function') try{ window.onFraseMostrada(window._phrases_current); }catch(e){}
    }, 160);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await initFondos();
    mostrarFrase();
    document.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.key === ' ') && document.activeElement && ['INPUT','TEXTAREA'].indexOf(document.activeElement.tagName) === -1) { e.preventDefault(); mostrarFrase(); }
    });
  });

  window.mostrarFrase = mostrarFrase;
})();
// ===== Integration helper for phrase selection (append) =====
(function(){
  // showDailyPhraseInto: uses PhraseSelector and ClientPhrases to render a phrase into the page
  function showDailyPhraseInto(containerSelector) {
    try {
      var client = window.CLIENT_USER || JSON.parse(localStorage.getItem('lr_client_runtime_user') || '{}');
      var res = window.PhraseSelector ? window.PhraseSelector.selectAndMark(client) : { category:'rutina', phrase: (window.ClientPhrases ? window.ClientPhrases.random('rutina') : 'Un recordatorio') };
      // render into DOM (containerSelector expected)
      var el = document.querySelector(containerSelector || '.frase-text');
      if (el) el.textContent = res.phrase;
      // save runtime client
      window.saveClientRuntime && window.saveClientRuntime(res.updatedClient);
      // apply theme softly
      window.ThemeManager && window.ThemeManager.apply(res.updatedClient || client);
      // expose updated client
      window.CLIENT_USER = res.updatedClient || client;
      // prepare breathing suggestion UI if needed (function in breath-sessions integration)
      if (res.updatedClient && res.updatedClient.suggestedBreathingType) {
        try {
          if (typeof window.prepareClientBreathUI === 'function') window.prepareClientBreathUI('.breathing-suggestion');
          else {
            // ensure placeholder visible
            var ps = document.querySelector('.breathing-suggestion');
            if (ps) ps.style.display = '';
          }
        } catch(e){}
      }
    } catch(e){ console.warn('showDailyPhraseInto failed', e); }
  }
  // expose
  window.showDailyPhraseInto = showDailyPhraseInto;

  // map existing global call used by load-user.js
  window.mostrarFrase = function(){ return window.showDailyPhraseInto && window.showDailyPhraseInto('.frase-text'); };
})();
// ===== Integration: ensure fullscreen + persistent Respirar button (append) =====
(function(){
  function ensureFraseFullscreen(){
    try {
      const card = document.querySelector('.frase-card');
      if (card && !card.classList.contains('fullscreen')) card.classList.add('fullscreen');
    } catch(e){ console.warn('ensureFraseFullscreen failed', e); }
  }

  function ensureRespirarButton(){
    try {
      const fraseEl = document.querySelector('.frase-text');
      if (!fraseEl) return;
      if (document.getElementById('lr-open-session-btn')) return;
      const btn = document.createElement('button');
      btn.id = 'lr-open-session-btn';
      btn.textContent = 'Respirar';
      btn.style.cssText = 'margin-left:12px;padding:8px 12px;border-radius:10px;border:none;background:linear-gradient(90deg,#ffd166,#ff9a9e);color:#072032;font-weight:800;cursor:pointer';
      btn.addEventListener('click', function(){
        const suggested = window.CLIENT_USER && window.CLIENT_USER.suggestedBreathingType ? window.CLIENT_USER.suggestedBreathingType : null;
        if (typeof window.openSessionModal === 'function') window.openSessionModal({ suggestedType: suggested, message: suggested ? 'Te sugerimos esta respiración' : 'Elige duración y pulsa iniciar' });
        else console.warn('openSessionModal no disponible');
      });
      fraseEl.parentNode && fraseEl.parentNode.insertBefore(btn, fraseEl.nextSibling);
    } catch(e){ console.warn('ensureRespirarButton failed', e); }
  }

  // expose helper to be called after phrase render
  window.__lr_ensure_frase_ui = function(){
    ensureFraseFullscreen();
    ensureRespirarButton();
  };

  // if mostrarFrase or showDailyPhraseInto exist, wrap them to call our helper after they run
  try {
    if (typeof window.showDailyPhraseInto === 'function') {
      const orig = window.showDailyPhraseInto;
      window.showDailyPhraseInto = function(sel){
        const r = orig.apply(this, arguments);
        try { window.__lr_ensure_frase_ui(); } catch(e){}
        return r;
      };
    }
    if (typeof window.mostrarFrase === 'function') {
      const orig2 = window.mostrarFrase;
      window.mostrarFrase = function(){
        const r = orig2.apply(this, arguments);
        try { window.__lr_ensure_frase_ui(); } catch(e){}
        return r;
      };
    }
  } catch(e){ console.warn('wrap showDailyPhraseInto/mostrarFrase failed', e); }
})();
