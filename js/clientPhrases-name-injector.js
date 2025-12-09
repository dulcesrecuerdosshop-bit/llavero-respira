// clientPhrases-name-injector.js (FIX: evita reentrancia que provocaba bloqueo)
// - Añade guard isApplying para que las mutaciones provocadas por la propia escritura no reentren.
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

  function personalizeAndLowercase(phrase, explicitName) {
    try {
      if (!phrase || typeof phrase !== 'string') return phrase;
      var name = (explicitName && String(explicitName).trim()) || readRuntimeName();
      var p = String(phrase);

      var tokenRE = /\{name\}|\{nombre\}/ig;
      var hasToken = tokenRE.test(p);

      if (hasToken) {
        if (name) p = p.replace(/\{name\}/ig, name).replace(/\{nombre\}/ig, name);
        else p = p.replace(tokenRE, '').replace(/^\s+|\s+$/g, '');
      } else if (name) {
        p = name + ', ' + p.replace(/^\s+/, '');
      }

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

  // Guard para evitar reentrancia del observer (mutaciones provocadas por nosotros mismos)
  var isApplying = false;
  var observer = null;

  // safe write: disconnect observer while writing, or use isApplying guard
  function writeTextSafe(el, text) {
    try {
      if (!observer) {
        el.textContent = text;
        return;
      }
      // Temporarily stop observing to prevent reentrancy
      var obs = observer;
      try { obs.disconnect(); } catch (e) {}
      try { el.textContent = text; } catch (e) {}
      try { obs.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    } catch (e) {
      try { el.textContent = text; } catch (ee) {}
    }
  }

  // ---------- transformElement con protección ----------
  function transformElement(el, explicitName) {
    if (!el) return { ok: false, reason: 'no-element' };
    try {
      // backup original HTML once
      if (!el.hasAttribute('data-name-injector-original')) {
        try { el.setAttribute('data-name-injector-original', el.innerHTML); } catch(e){}
      }

      // read the current text in DOM (we must operate on the current visible text)
      var currentText = (el.textContent || '').trim();
      if (!currentText) return { ok: false, reason: 'empty-text' };

      // compute personalized text for the current DOM text
      var newText = personalizeAndLowercase(currentText, explicitName);

      // If already identical, nothing to do (but ensure flags)
      if (newText === currentText) {
        try {
          if (el.getAttribute('data-name-injector-applied') !== '1') {
            el.setAttribute('data-name-injector-applied', '1');
            el.setAttribute('data-name-injector-name', explicitName || readRuntimeName() || '');
          }
        } catch (e) {}
        return { ok: true, skipped: true };
      }

      // Avoid reentrancy: mark and write safely
      if (isApplying) {
        // if currently applying elsewhere, skip this attempt
        return { ok: false, reason: 'reentrancy-skip' };
      }
      isApplying = true;
      try {
        writeTextSafe(el, newText);
        try {
          el.setAttribute('data-name-injector-applied', '1');
          el.setAttribute('data-name-injector-name', explicitName || readRuntimeName() || '');
        } catch (e) {}
      } finally {
        // small delay to avoid immediate observer re-trigger processing race
        setTimeout(function(){ isApplying = false; }, 40);
      }
      return { ok: true, newText: newText };
    } catch (e) {
      isApplying = false;
      return { ok: false, reason: String(e) };
    }
  }
  // --------------------------------------------

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
        if (isApplying) return; // skip while we are applying changes
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

  console.debug('[NameInjector] loaded (safe): run window.NameInjector.runNow() or .forceRefreshAndTransform() to apply.');
})();
