// clientPhrases-name-injector.js
// FIX: evita prefijos repetidos del nombre (normaliza múltiples apariciones como "María, María, María")
// Mantén este archivo cargado justo después de clientPhrases.js y preferiblemente antes de phraseSelector/phrases.
(function () {
  'use strict';

  var AUTO_APPLY = true;
  var AUTO_RETRY_COUNT = 24;
  var AUTO_RETRY_INTERVAL_MS = 250;

  function tryParseJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function readRuntimeName() {
    try { if (window.CLIENT_USER && window.CLIENT_USER.nombre) return String(window.CLIENT_USER.nombre).trim(); } catch(e){}
    try { var r = tryParseJSON(localStorage.getItem('lr_client_runtime') || localStorage.getItem('lr_client_runtime_user') || null); if (r && r.nombre) return String(r.nombre).trim(); } catch(e){}
    try { var s = localStorage.getItem('breath_user_name'); if (s) return String(s).trim(); } catch(e){}
    return null;
  }

  function escapeRegExp(s){ return (s+'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  function lowercaseFirstAlpha(str) {
    if (!str || typeof str !== 'string') return str;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch.match(/[A-Za-zÀ-ÖØ-öø-ÿÁÉÍÓÚáéíóúñÑüÜ]/)) {
        return str.substring(0, i) + ch.toLowerCase() + str.substring(i + 1);
      }
    }
    return str;
  }

  // PERSONALIZA y normaliza prefijos repetidos de nombre.
  // - Si la frase contiene {name}/{nombre} reemplaza token(es).
  // - Si no contiene token y hay un nombre runtime, elimina cualquier ocurrencia repetida
  //   del nombre al principio (p. ej. "María, María, maría, ") y lo normaliza a una sola ocurrencia.
  // - Aplica lowercase a la primera letra significativa del cuerpo (después del prefijo).
  function personalizeAndLowercase(phrase, explicitName) {
    try {
      if (!phrase || typeof phrase !== 'string') return phrase;
      var name = (explicitName && String(explicitName).trim()) || readRuntimeName();
      var p = String(phrase);

      // 1) si contiene tokens {name}/{nombre} -> reemplazarlos (o eliminarlos si no hay nombre)
      var tokenRE = /\{name\}|\{nombre\}/ig;
      if (tokenRE.test(p)) {
        if (name) {
          p = p.replace(/\{name\}/ig, name).replace(/\{nombre\}/ig, name);
        } else {
          p = p.replace(tokenRE, '').replace(/^\s+|\s+$/g,'');
        }
        // después de token replacement, aplicar lowercasing al primer alpha del cuerpo (sin tocar el resto)
        // si el resultado empieza con "Name, " ya será manejado por la lógica siguiente al hacer prefix normalizado.
      }

      // 2) Si no hay nombre disponible -> sólo normalizar primera letra
      if (!name) {
        return lowercaseFirstAlpha(p);
      }

      // 3) Normalizar múltiples apariciones del nombre al principio.
      //    Crear regex que capture cualquier número de repeticiones de "name" al inicio,
      //    permitiendo comas y espacios entre ellas, case-insensitive.
      var nameEsc = escapeRegExp(name);
      var repeatedPrefixRE = new RegExp('^\\s*(?:' + nameEsc + '\\s*(?:,\\s*)?)+', 'i');
      if (repeatedPrefixRE.test(p)) {
        // quitar todas las apariciones iniciales
        p = p.replace(repeatedPrefixRE, '').replace(/^\s+/, '');
        // volver a prefixar sólo una vez más abajo
      } else {
        // Si ya empieza con el name seguido de coma/spacio pero no múltiples repeticiones,
        // detectarlo para evitar double prefix (por ejemplo "María, ...")
        var singlePrefixRE = new RegExp('^\\s*' + nameEsc + '(?:\\s*,\\s*|\\s+)', 'i');
        if (singlePrefixRE.test(p)) {
          // la frase ya comienza con el nombre (posible distinto case); no vamos a prefijar otra vez.
          // Sin embargo, necesitamos asegurarnos de que el texto siguiente tenga la primera letra en minúscula.
          // Separar el prefijo que coincide y aplicar lowercase al resto.
          var m = p.match(singlePrefixRE);
          var prefix = (m && m[0]) ? m[0] : name + ', ';
          var rest = p.slice(prefix.length);
          rest = lowercaseFirstAlpha(rest);
          return prefix + rest;
        }
      }

      // 4) Prefixar única vez el nombre y aplicar lowercasing al resto
      p = name + ', ' + p.replace(/^\s+/, '');
      // encontrar el prefijo y lowercasing del resto por seguridad (aunque la línea previa ya lo hace)
      var prefixRE = new RegExp('^\\s*' + nameEsc + '\\s*,\\s*', 'i');
      var m2 = p.match(prefixRE);
      if (m2 && m2[0]) {
        var prefix2 = m2[0];
        var rest2 = p.slice(prefix2.length);
        rest2 = lowercaseFirstAlpha(rest2);
        return prefix2 + rest2;
      }
      return lowercaseFirstAlpha(p);
    } catch (e) {
      return phrase;
    }
  }

  var TARGET_SELECTORS = [
    '#frase-text',
    '#frase',
    '.frase-text',
    '.frase-card .frase-content',
    '.frase-card'
  ];

  function findPhraseElement() {
    for (var i = 0; i < TARGET_SELECTORS.length; i++) {
      try {
        var el = document.querySelector(TARGET_SELECTORS[i]);
        if (el) return el;
      } catch (e) {}
    }
    try {
      var card = document.querySelector('.frase-card');
      if (card) {
        var candidates = Array.from(card.querySelectorAll('p,div,span'));
        for (var j = 0; j < candidates.length; j++) {
          var t = (candidates[j].textContent || '').trim();
          if (t && t.length > 20) return candidates[j];
        }
      }
    } catch (e) {}
    return null;
  }

  // guard for reentrancy
  var isApplying = false;
  var observer = null;

  function writeTextSafe(el, text) {
    try {
      if (!observer) {
        el.textContent = text;
        return;
      }
      var obs = observer;
      try { obs.disconnect(); } catch (e) {}
      try { el.textContent = text; } catch (e) {}
      try { obs.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    } catch (e) {
      try { el.textContent = text; } catch (ee) {}
    }
  }

  function transformElement(el, explicitName) {
    if (!el) return { ok: false, reason: 'no-element' };
    try {
      if (!el.hasAttribute('data-name-injector-original')) {
        try { el.setAttribute('data-name-injector-original', el.innerHTML); } catch(e){}
      }
      var currentText = (el.textContent || '').trim();
      if (!currentText) return { ok: false, reason: 'empty-text' };

      var newText = personalizeAndLowercase(currentText, explicitName);

      if (newText === currentText) {
        try {
          if (el.getAttribute('data-name-injector-applied') !== '1') {
            el.setAttribute('data-name-injector-applied', '1');
            el.setAttribute('data-name-injector-name', explicitName || readRuntimeName() || '');
          }
        } catch (e) {}
        return { ok: true, skipped: true };
      }

      if (isApplying) return { ok: false, reason: 'reentrancy-skip' };
      isApplying = true;
      try {
        writeTextSafe(el, newText);
        try {
          el.setAttribute('data-name-injector-applied', '1');
          el.setAttribute('data-name-injector-name', explicitName || readRuntimeName() || '');
        } catch (e) {}
      } finally {
        setTimeout(function(){ isApplying = false; }, 40);
      }
      return { ok: true, newText: newText };
    } catch (e) {
      isApplying = false;
      return { ok: false, reason: String(e) };
    }
  }

  function restoreElement(el) {
    if (!el) return { ok: false, reason: 'no-element' };
    try {
      if (el.hasAttribute('data-name-injector-original')) {
        var html = el.getAttribute('data-name-injector-original');
        try { el.innerHTML = html; } catch(e) { el.textContent = (el.textContent || ''); }
        el.removeAttribute('data-name-injector-original');
        el.removeAttribute('data-name-injector-applied');
        el.removeAttribute('data-name-injector-name');
        return { ok: true };
      }
      return { ok: false, reason: 'no-backup' };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }

  function startObserver() {
    if (observer) return;
    try {
      observer = new MutationObserver(function (muts) {
        if (isApplying) return;
        try {
          var el = findPhraseElement();
          if (el) transformElement(el);
        } catch (e) {}
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) { observer = null; }
  }
  function stopObserver() { try { if (observer) { observer.disconnect(); observer = null; } } catch(e){} }

  function runNow(opts) {
    opts = opts || {};
    var explicitName = typeof opts === 'string' ? opts : (opts.name || null);
    var el = findPhraseElement();
    if (!el) return { ok: false, reason: 'no-target-element' };
    return transformElement(el, explicitName);
  }

  function forceRefreshAndTransform(opts) {
    try {
      if (typeof window.mostrarFrase === 'function') {
        try { window.mostrarFrase(); } catch(e){}
      }
      if (typeof window.showDailyPhraseInto === 'function') {
        try { window.showDailyPhraseInto('.frase-text'); } catch(e){}
      }
    } catch (e) {}
    var explicitName = opts && opts.name ? opts.name : null;
    setTimeout(function () {
      var el = findPhraseElement();
      if (el) transformElement(el, explicitName);
    }, 180);
  }

  function autoApplyOnce(maxAttempts, intervalMs) {
    var attempts = 0;
    var timer = null;
    function stopTimer(){ try{ if(timer) { clearInterval(timer); timer = null; } }catch(e){} }
    function tryApply() {
      attempts++;
      var el = findPhraseElement();
      var name = readRuntimeName();
      if (el && (name || (el.textContent || '').trim())) {
        transformElement(el);
        stopTimer();
        return;
      }
      if (attempts >= maxAttempts) {
        stopTimer();
        return;
      }
    }
    timer = setInterval(tryApply, intervalMs);
    tryApply();
    return { ok: true, started: true };
  }

  window.NameInjector = window.NameInjector || {};
  window.NameInjector.runNow = function (opts) { return runNow(opts); };
  window.NameInjector.transformNow = function (opts) { return runNow(opts); };
  window.NameInjector.forceRefreshAndTransform = function (opts) { return forceRefreshAndTransform(opts || {}); };
  window.NameInjector.startObserver = function () { startObserver(); return true; };
  window.NameInjector.stopObserver = function () { stopObserver(); return true; };
  window.NameInjector.restore = function () {
    var el = findPhraseElement();
    if (!el) return { ok: false, reason: 'no-element' };
    return restoreElement(el);
  };
  window.NameInjector.debug = function () {
    var el = findPhraseElement();
    return {
      runtimeName: readRuntimeName(),
      targetSelectorCandidates: TARGET_SELECTORS.slice(0),
      foundElement: !!el,
      elementOuter: el ? (el.outerHTML || '').slice(0, 800) : null,
      lastAppliedName: el ? el.getAttribute('data-name-injector-name') : null,
      appliedFlag: el ? el.getAttribute('data-name-injector-applied') : null
    };
  };

  startObserver();
  if (AUTO_APPLY) {
    autoApplyOnce(AUTO_RETRY_COUNT, AUTO_RETRY_INTERVAL_MS);
    try { window.addEventListener('load', function(){ setTimeout(function(){ autoApplyOnce(6, 300); }, 120); }); } catch(e){}
  }

  console.debug('[NameInjector] loaded (normalized prefixes): run window.NameInjector.runNow() or .forceRefreshAndTransform() to apply.');
})();
