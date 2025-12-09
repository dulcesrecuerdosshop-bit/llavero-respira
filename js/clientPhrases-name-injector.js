// clientPhrases-name-injector-final.js
// Versión con AUTO-APPLY robusto:
// - intenta aplicar la transformación automáticamente después de carga,
// - reintenta varias veces si el DOM/ClientPhrases no están listos,
// - mantiene runNow()/forceRefreshAndTransform() y restore().
// Inclúyelo DESPUÉS de clientPhrases.js y phrases.js para mejores resultados.
(function () {
  'use strict';

  // ---- CONFIG ----
  var AUTO_APPLY = true;           // si true intentará aplicar automáticamente al cargar
  var AUTO_RETRY_COUNT = 12;       // número de reintentos
  var AUTO_RETRY_INTERVAL_MS = 250; // intervalo entre intentos

  // ---- util ----
  function tryParseJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function readRuntimeName() {
    try { if (window.CLIENT_USER && window.CLIENT_USER.nombre) return String(window.CLIENT_USER.nombre).trim(); } catch(e){}
    try { var r = tryParseJSON(localStorage.getItem('lr_client_runtime') || localStorage.getItem('lr_client_runtime_user') || null); if (r && r.nombre) return String(r.nombre).trim(); } catch(e){}
    try { var s = localStorage.getItem('breath_user_name'); if (s) return String(s).trim(); } catch(e){}
    return null;
  }

  // Lowercase first alphabetic char while preserving leading punctuation/whitespace
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

  // Personalize + lowercase main body
  function personalizeAndLowercase(phrase, explicitName) {
    try {
      if (!phrase || typeof phrase !== 'string') return phrase;
      var name = (explicitName && String(explicitName).trim()) || readRuntimeName();
      var p = String(phrase);

      // Replace tokens {name}/{nombre} if present
      var tokenRE = /\{name\}|\{nombre\}/ig;
      var hasToken = tokenRE.test(p);

      if (hasToken) {
        if (name) p = p.replace(/\{name\}/ig, name).replace(/\{nombre\}/ig, name);
        else p = p.replace(tokenRE, '').replace(/^\s+|\s+$/g, '');
      } else if (name) {
        p = name + ', ' + p.replace(/^\s+/, '');
      }

      // If we prefixed the name, lowercase first alpha after prefix
      if (name && p.toLowerCase().indexOf((name + ',').toLowerCase()) === 0) {
        var prefixRE = new RegExp('^\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*,\\s*', 'i');
        var m = p.match(prefixRE);
        if (m && m[0]) {
          var prefix = m[0];
          var rest = p.slice(prefix.length);
          rest = lowercaseFirstAlpha(rest);
          return prefix + rest;
        }
      }

      return lowercaseFirstAlpha(p);
    } catch (e) {
      return phrase;
    }
  }

  // ---- DOM target helpers ----
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
    // fallback: any element with large text inside .frase-card
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

  function transformElement(el, explicitName) {
    if (!el) return { ok: false, reason: 'no-element' };
    try {
      if (!el.hasAttribute('data-name-injector-original')) {
        try { el.setAttribute('data-name-injector-original', el.innerHTML); } catch(e){}
      }
      var originalText = (el.textContent || '').trim();
      if (!originalText) return { ok: false, reason: 'empty-text' };

      if (el.getAttribute('data-name-injector-applied') === '1') {
        var lastName = el.getAttribute('data-name-injector-name') || '';
        var runtimeName = explicitName || readRuntimeName() || '';
        if (runtimeName === lastName) return { ok: true, skipped: true };
      }

      var newText = personalizeAndLowercase(originalText, explicitName);
      el.textContent = newText;
      try { el.setAttribute('data-name-injector-applied', '1'); el.setAttribute('data-name-injector-name', (explicitName || readRuntimeName() || '')); } catch(e){}
      return { ok: true, newText: newText };
    } catch (e) {
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

  // ---- observer ----
  var observer = null;
  function startObserver() {
    if (observer) return;
    try {
      observer = new MutationObserver(function (muts) {
        try {
          var el = findPhraseElement();
          if (el) {
            transformElement(el);
          }
        } catch (e) {}
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) { observer = null; }
  }
  function stopObserver() { try { if (observer) { observer.disconnect(); observer = null; } } catch(e){} }

  // ---- public runner ----
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

  // ---- auto-apply with retries ----
  function autoApplyOnce(maxAttempts, intervalMs) {
    var attempts = 0;
    var timer = null;
    function tryApply() {
      attempts++;
      var el = findPhraseElement();
      var name = readRuntimeName();
      // If we have a target element and either a runtime name or the element already has text to transform, apply.
      if (el && (name || (el.textContent || '').trim())) {
        var res = transformElement(el);
        stopTimer();
        return res;
      }
      if (attempts >= maxAttempts) {
        stopTimer();
        return { ok: false, reason: 'max-attempts' };
      }
    }
    function stopTimer(){ try{ if(timer) { clearInterval(timer); timer = null; } }catch(e){} }
    timer = setInterval(tryApply, intervalMs);
    // also call immediately
    tryApply();
    return { ok: true, started: true };
  }

  // ---- expose API ----
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

  // ---- start observer and optionally auto-apply ----
  startObserver();
  if (AUTO_APPLY) {
    // attempt auto-apply with retries to cover timing issues
    autoApplyOnce(AUTO_RETRY_COUNT, AUTO_RETRY_INTERVAL_MS);
    // also try a final attempt on window.load
    try { window.addEventListener('load', function(){ setTimeout(function(){ autoApplyOnce(6, 300); }, 120); }); } catch(e){}
  }

  console.debug('[NameInjector] loaded: run window.NameInjector.runNow() or .forceRefreshAndTransform() to apply.');
})();
