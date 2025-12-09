// breath-session-personalize-fixed-with-timer.js
// Extensión del script anterior: personalizada + reemplazo del título "Temporizador de sesión".
// - Personaliza la explicación (sin duplicados).
// - Reemplaza el título del temporizador por el texto proporcionado (idempotente).
// - Guarda backups y permite restaurar todo.
// API:
//   window.__breathPersonalFixed.runNow(name, timerText)  -> forzar nombre y texto de temporizador
//   window.__breathPersonalFixed.findName()              -> devuelve nombre detectado (si hay)
//   window.__breathPersonalFixed.restore()               -> restaura el HTML original del contenedor(s)
//   window.__breathPersonalFixed.disconnect()            -> desconecta observer y hooks

(function () {
  'use strict';

  // ===== Config =====
  var MESSAGE_TEMPLATE = '{name}, ya tenemos preparada tu sesión de respiración. Solo tienes que seleccionar el tiempo que puedes dedicarle. Tras ella, te sentirás mejor.';
  var TARGET_SNIPPET = 'Selecciona duración'; // fragmento para localizar la línea objetivo
  var MARKER_ATTR = 'data-breath-personalized';
  var ORIGINAL_ATTR = 'data-breath-original-html';
  var NAME_ATTR = 'data-breath-personalized-name';
  var TIMER_ORIG_ATTR = 'data-breath-original-timer';
  var TIMER_STORED_ATTR = 'data-breath-timer-text';
  var CANDIDATE_SELECTOR = 'div[data-sessions-loaded="1"], [role="dialog"], .breath-modal, .modal';
  var TITLE_HEURISTIC = /práctica de respiraci(o|ó)n|sesión de respiración|Comenzar sesión de respiración/i;

  // ===== Estado interno =====
  var nameCache = null;
  var observer = null;
  var hooksInstalled = false;

  // ===== Util =====
  function normalize(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function buildMessage(name) { return MESSAGE_TEMPLATE.replace(/\{name\}/gi, name || 'amiga'); }

  function findCandidates() {
    var candidates = Array.from(document.querySelectorAll(CANDIDATE_SELECTOR));
    if (candidates.length) return candidates;
    // fallback: divs that contain heading + select
    var all = Array.from(document.querySelectorAll('div'));
    for (var i = 0; i < all.length; i++) {
      try {
        var d = all[i];
        if (d.textContent && /Temporizador de sesi[oó]n/i.test(d.textContent) && d.querySelector && d.querySelector('select')) candidates.push(d);
      } catch (e) {}
    }
    return candidates;
  }

  // Encuentra el nodo de subtítulo objetivo dentro del contenedor
  function findSubtitleNode(container) {
    if (!container) return null;
    for (var i = 0; i < container.childNodes.length; i++) {
      var ch = container.childNodes[i];
      if (ch.nodeType === Node.TEXT_NODE) {
        if (normalize(ch.nodeValue).toLowerCase().indexOf(TARGET_SNIPPET.toLowerCase()) !== -1) return ch;
      } else if (ch.nodeType === Node.ELEMENT_NODE) {
        if (ch.children.length === 0) {
          if (normalize(ch.textContent || '').toLowerCase().indexOf(TARGET_SNIPPET.toLowerCase()) !== -1) return ch;
        } else {
          try {
            var walker = document.createTreeWalker(ch, NodeFilter.SHOW_TEXT, {
              acceptNode: function (node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                if (node.parentElement && node.parentElement.closest && node.parentElement.closest('h1,h2,h3,h4,h5,h6,select,button,label')) return NodeFilter.FILTER_REJECT;
                return normalize(node.nodeValue).toLowerCase().indexOf(TARGET_SNIPPET.toLowerCase()) !== -1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
              }
            }, false);
            var n;
            while ((n = walker.nextNode())) return n;
          } catch (e) {}
        }
      }
    }
    return null;
  }

  // Encuentra el elemento heading del temporizador (por texto o por <select> cercano)
  function findTimerHeading(container) {
    if (!container) return null;
    try {
      var headings = container.querySelectorAll('h1,h2,h3,h4,h5,h6');
      for (var i = 0; i < headings.length; i++) {
        var h = headings[i];
        if (/Temporizador de sesi[oó]n/i.test(normalize(h.textContent || ''))) return h;
      }
      // fallback: buscar elemento que precede al select
      var sel = container.querySelector('select');
      if (sel) {
        var prev = sel.previousElementSibling;
        if (prev && /^h\d$/i.test(prev.tagName)) return prev;
      }
    } catch (e) {}
    return null;
  }

  // Aplica la personalización y reemplaza título del temporizador si se pasa timerText.
  function personalizeContainer(container, name, timerText) {
    if (!container) return 0;
    name = (name || nameCache || '').trim();

    // Si ya personalizado con mismo nombre y mismo timerText, no hacemos nada
    var existingName = container.getAttribute && container.getAttribute(NAME_ATTR);
    var existingTimer = container.getAttribute && container.getAttribute(TIMER_STORED_ATTR);
    if (container.getAttribute && container.getAttribute(MARKER_ATTR) === '1' && existingName && name && existingName === name) {
      if ((!timerText && !existingTimer) || (timerText && existingTimer && existingTimer === timerText)) {
        return 0; // ya aplicado con mismo nombre y timerText
      }
    }

    // Backup original HTML once
    try {
      if (!container.hasAttribute(ORIGINAL_ATTR)) {
        container.setAttribute(ORIGINAL_ATTR, encodeURIComponent(container.innerHTML));
      }
    } catch (e) {}

    // Reemplazar el subtítulo original
    try {
      var subtitleNode = findSubtitleNode(container);
      if (subtitleNode) {
        var message = buildMessage(name || 'amiga');
        if (subtitleNode.nodeType === Node.TEXT_NODE) {
          subtitleNode.nodeValue = message;
        } else if (subtitleNode.nodeType === Node.ELEMENT_NODE) {
          subtitleNode.textContent = message;
        }
      }
    } catch (e) {
      console.warn('[breath-personalize-fixed] error replacing subtitle:', e);
    }

    // Reemplazar título del temporizador si timerText pasado
    if (typeof timerText === 'string') {
      try {
        var heading = findTimerHeading(container);
        if (heading) {
          // guardar original heading texto la primera vez
          if (!container.hasAttribute(TIMER_ORIG_ATTR)) {
            container.setAttribute(TIMER_ORIG_ATTR, encodeURIComponent(heading.innerHTML));
          }
          heading.textContent = timerText;
          // almacenar texto aplicado
          try { container.setAttribute(TIMER_STORED_ATTR, timerText); } catch (e) {}
        }
      } catch (e) {
        console.warn('[breath-personalize-fixed] error replacing timer heading:', e);
      }
    }

    // marcar contenedor y guardar nombre
    try { container.setAttribute(MARKER_ATTR, '1'); } catch (e) {}
    try { container.setAttribute(NAME_ATTR, name || ''); } catch (e) {}

    return 1;
  }

  // Restaurar todos los contenedores personalizados usando ORIGINAL_ATTR
  function restoreAll() {
    var restored = 0;
    try {
      var containers = Array.from(document.querySelectorAll('[' + ORIGINAL_ATTR + ']'));
      containers.forEach(function (c) {
        try {
          var orig = c.getAttribute(ORIGINAL_ATTR);
          if (orig != null) {
            c.innerHTML = decodeURIComponent(orig);
            c.removeAttribute(ORIGINAL_ATTR);
            c.removeAttribute(MARKER_ATTR);
            c.removeAttribute(NAME_ATTR);
            c.removeAttribute(TIMER_ORIG_ATTR);
            c.removeAttribute(TIMER_STORED_ATTR);
            restored++;
          } else {
            // si no hay innerHTML backup, intentar restaurar heading solo
            var timerOrig = c.getAttribute(TIMER_ORIG_ATTR);
            if (timerOrig != null) {
              var heading = findTimerHeading(c);
              if (heading) heading.innerHTML = decodeURIComponent(timerOrig);
              c.removeAttribute(TIMER_ORIG_ATTR);
              c.removeAttribute(TIMER_STORED_ATTR);
              restored++;
            }
          }
        } catch (e) {}
      });
    } catch (e) {}
    return restored;
  }

  // Scan and apply to candidates
  function scanAndApply(name, timerText) {
    var applied = 0;
    var candidates = findCandidates();
    for (var i = 0; i < candidates.length; i++) {
      try { applied += personalizeContainer(candidates[i], name, timerText); } catch (e) {}
    }
    return applied;
  }

  // Network hooks to capture name from /users/
  function installNetworkHooks() {
    if (hooksInstalled) return;
    try {
      if (window.fetch) {
        var originalFetch = window.fetch.bind(window);
        window.fetch = function () {
          var args = Array.prototype.slice.call(arguments);
          return originalFetch.apply(window, args).then(function (resp) {
            try {
              var url = (resp && resp.url) || args[0];
              if (typeof url === 'string' && /\/users\//i.test(url)) {
                resp.clone().json().then(function (data) {
                  if (data && data.nombre) {
                    nameCache = data.nombre.trim();
                    scanAndApply(nameCache);
                  }
                }).catch(function () {});
              }
            } catch (e) {}
            return resp;
          });
        };
      }
    } catch (e) {}
    try {
      if (window.XMLHttpRequest) {
        var origOpen = XMLHttpRequest.prototype.open;
        var origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
          try { this.__breath_url = url; } catch (e) {}
          return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
          this.addEventListener('readystatechange', function () {
            try {
              if (this.readyState === 4 && this.__breath_url && /\/users\//i.test(this.__breath_url)) {
                try {
                  var txt = this.responseText;
                  if (txt) {
                    var data = JSON.parse(txt);
                    if (data && data.nombre) {
                      nameCache = data.nombre.trim();
                      scanAndApply(nameCache);
                    }
                  }
                } catch (e) {}
              }
            } catch (e) {}
          });
          return origSend.apply(this, arguments);
        };
      }
    } catch (e) {}
    hooksInstalled = true;
  }

  // Find name from localStorage or window
  function findNameFromStorageOrWindow() {
    try {
      var v = localStorage.getItem('breath_user_name');
      if (v && v.trim()) return v.trim();
    } catch (e) {}
    try {
      var props = Object.getOwnPropertyNames(window);
      for (var i = 0; i < props.length; i++) {
        try {
          var val = window[props[i]];
          if (val && typeof val === 'object') {
            if (val.nombre && typeof val.nombre === 'string' && val.nombre.trim()) return val.nombre.trim();
            var keys = ['user','usuario','currentUser','me'];
            for (var k = 0; k < keys.length; k++) {
              var kk = keys[k];
              if (val[kk] && val[kk].nombre && typeof val[kk].nombre === 'string' && val[kk].nombre.trim()) return val[kk].nombre.trim();
            }
          } else if (typeof val === 'string' && props[i].toLowerCase().indexOf('name') !== -1 && val.trim()) {
            return val.trim();
          }
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  // Observer to reapply safely
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (mutations) {
      try {
        var name = nameCache || findNameFromStorageOrWindow();
        if (name) nameCache = name;
        scanAndApply(name);
      } catch (e) {}
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

    // initial pass
    setTimeout(function () {
      var name = nameCache || findNameFromStorageOrWindow();
      if (name) nameCache = name;
      scanAndApply(name);
    }, 80);

    installNetworkHooks();
  }

  // Public API
  window.__breathPersonalFixed = window.__breathPersonalFixed || {};
  window.__breathPersonalFixed.runNow = function (name, timerText) {
    if (name && typeof name === 'string') { nameCache = name.trim(); try { localStorage.setItem('breath_user_name', nameCache); } catch(e){} }
    // timerText optional, if omitted we won't change timer heading
    return scanAndApply(nameCache, typeof timerText === 'string' ? timerText : undefined);
  };
  window.__breathPersonalFixed.findName = function () { return nameCache || findNameFromStorageOrWindow(); };
  window.__breathPersonalFixed.restore = restoreAll;
  window.__breathPersonalFixed.disconnect = function () { try { observer && observer.disconnect(); observer = null; } catch(e){} };

  // auto-start
  startObserver();
  console.debug('[breath-personalize-fixed] cargado. Usa window.__breathPersonalFixed.runNow("María", "¿Cuánto tiempo quieres que dure?") para forzar nombre y texto del temporizador.');

})();
