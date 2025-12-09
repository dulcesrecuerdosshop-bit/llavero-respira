// breath-session-personalize.js
// Corrección crítica: NO modificar el modal de bienvenida (welcome modal).
// - Detecta y EXCLUYE contenedores que contengan controles de "mood"/bien/tenso/etc.
// - Solo aplica sobre modales que claramente sean el "session modal" (contengan temporizador, título "Comenzar sesión de respiración" o botón "Iniciar sesión").
// - Evita duplicados: actualiza nodo existente en vez de insertar duplicados.
// - Mantiene backup/restore, hooks y API (runNow, restore, disconnect).
//
// Reemplaza el archivo en el repo por este contenido y prueba:
//   window.__breathPersonalFixed.runNow(window.CLIENT_USER && window.CLIENT_USER.nombre)

(function () {
  'use strict';

  // ---- Config & templates ----
  var MESSAGE_TEMPLATE_WITH_PHRASE =
    '{name}, {phrase} Cuando estés lista, selecciona el tiempo que quieres dedicarle a tu sesión; después te sentirás mucho mejor.';
  var MESSAGE_TEMPLATE_DEFAULT =
    '{name}, cuando estés lista, selecciona el tiempo que quieres dedicarle a tu sesión; después te sentirás mucho mejor.';

  var MARKER_ATTR = 'data-breath-personalized';
  var ORIGINAL_ATTR = 'data-breath-original-html';
  var NAME_ATTR = 'data-breath-personalized-name';
  var TIMER_ORIG_ATTR = 'data-breath-original-timer';
  var TIMER_STORED_ATTR = 'data-breath-timer-text';
  var TARGET_CLASS = 'lr-breath-personalized-target';
  var TARGET_ATTR = 'data-breath-target';

  // Candidate selector (prioritized)
  var CANDIDATE_SELECTOR =
    '#__lr_temp_session_modal, .lr-modal-card, .lr-user-modal, .lr-modal, [role="dialog"], .breath-modal, .modal';

  // ---- Phrase bank ----
  var PHRASE_BANK = {
    ansiedad: [
      'sé que ahora notas esa inquietud en el cuerpo, vamos a respirar suave para devolverte claridad poco a poco.',
      'entiendo esa sensación de desborde; hagamos una respiración guiada para ayudarte a bajar el ritmo interno.',
      'vamos a acompañar esa tensión con una práctica tranquila que te devuelva control sobre tu cuerpo.',
      'estás a salvo; respira conmigo para bajar el nivel de ansiedad paso a paso.',
      'lo estás haciendo muy bien; respiremos despacio para ayudarte a estabilizar este momento de intensidad.'
    ],
    tenso: {
      muscular: [
        'respiremos despacio para que tus músculos empiecen a soltar esa presión que llevas acumulando.',
        'vamos a liberar esa tensión muscular con respiraciones profundas y un ritmo tranquilo.',
        'te acompaño en un ejercicio que ayudará a cuello, mandíbula y hombros a suavizarse.',
        'tu cuerpo te está pidiendo una pausa; respiremos lento para ayudarlo.',
        'permite que cada exhalación afloje un poco más esa tensión muscular que sientes.'
      ],
      nervioso: [
        'sé que la mente está acelerada; respiremos en un ritmo estable para darte calma.',
        'tu cuerpo está en alerta, pero vamos a bajar ese nivel con respiraciones guiadas.',
        'te acompaño a encontrar un ritmo que reduzca poco a poco este nerviosismo.',
        'respiremos juntas para suavizar la tensión mental que estás sintiendo.',
        'vamos a centrar la respiración para que tu sistema pueda bajar revoluciones.'
      ],
      estres: [
        'sé que estás bajo presión; hagamos una respiración que te devuelva espacio y claridad.',
        'vamos a hacer una práctica suave para aliviar este momento de estrés.',
        'respiremos para darle un respiro a tu mente y a tu cuerpo.',
        'vamos a bajar la activación con respiraciones largas y tranquilas.',
        'respira conmigo para calmar el sistema nervioso y aflojar esta carga momentánea.'
      ],
      default: [
        'vamos a respirar para ayudarte a soltar parte de esta tensión.',
        'te acompaño en una práctica suave para que puedas aflojar un poco.',
        'respiremos juntas y deja que tu cuerpo encuentre espacio.',
        'te guío en una respiración que te ayudará a estabilizarte.',
        'empezamos una práctica lenta diseñada para ayudarte a bajar la tensión.'
      ]
    },
    crisis: [
      'estoy contigo; respiremos muy despacio para ayudarte a recuperar estabilidad.',
      'entiendo lo que sientes ahora mismo; hagamos una respiración guiada para bajar esta activación.',
      'respira cuando puedas; te acompaño sin prisa y con calma.',
      'vamos a hacer respiraciones largas para ayudarte a bajar la intensidad de este momento.',
      'no estás sola; respira conmigo suavemente y paso a paso.'
    ],
    neutral: [
      'hagamos una respiración suave para que puedas reconectar contigo.',
      'una breve práctica para darte claridad y calma.',
      'respiremos tranquilamente para mantener equilibrio y bienestar.',
      'vamos a sostener un ritmo relajante que acompañe tu momento.',
      'una pausa de respiración para centrarte y volver a ti.'
    ],
    motivacion: [
      'hagamos una respiración que te dé energía y claridad para continuar tu día.',
      'te acompaño en una respiración rítmica que aumenta motivación y enfoque.',
      'respiremos juntas para despertar tu energía interna.',
      'una serie de respiraciones para activar vitalidad y claridad mental.',
      'vamos a respirar con ritmo para que recuperes impulso y fuerza.'
    ]
  };

  // ---- State ----
  var nameCache = null;
  var observer = null;
  var hooksInstalled = false;

  // ---- Utilities ----
  function normalize(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }
  function chooseFromArray(arr, level) {
    if (!Array.isArray(arr)) return null;
    var idx = Math.max(0, Math.min(arr.length - 1, (Number(level) || 1) - 1));
    return arr[idx] || arr[0];
  }
  function tryParseJson(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function selectPhraseForUser(data) {
    try {
      if (!data) return null;
      var estado = (data.estadoEmocionalActual || '').toString().toLowerCase();
      var nivel = Number(data.nivelDeAnsiedad || data.nivel || 1);
      var tension = (data.tensionTipo || '').toString().toLowerCase();

      if (estado.indexOf('crisis') !== -1) return chooseFromArray(PHRASE_BANK.crisis, nivel);
      if (estado.indexOf('ansiedad') !== -1 || estado.indexOf('ansioso') !== -1) return chooseFromArray(PHRASE_BANK.ansiedad, nivel);
      if (estado.indexOf('tenso') !== -1 || estado.indexOf('tensión') !== -1) {
        if (tension && PHRASE_BANK.tenso[tension]) return chooseFromArray(PHRASE_BANK.tenso[tension], nivel);
        return chooseFromArray(PHRASE_BANK.tenso.default, nivel);
      }
      if (estado.indexOf('motiv') !== -1) return chooseFromArray(PHRASE_BANK.motivacion, nivel);
      if (estado.indexOf('neutral') !== -1) return chooseFromArray(PHRASE_BANK.neutral, nivel);
      return chooseFromArray(PHRASE_BANK.neutral, nivel);
    } catch (e) {
      return null;
    }
  }

  function buildMessage(name, phrase) {
    name = name || 'amiga';
    if (phrase && phrase.trim()) {
      return MESSAGE_TEMPLATE_WITH_PHRASE.replace('{name}', name).replace('{phrase}', phrase);
    }
    return MESSAGE_TEMPLATE_DEFAULT.replace('{name}', name);
  }

  // ---- Modal detection helpers ----
  function isVisible(el) {
    try {
      if (!el || !el.getBoundingClientRect) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
    } catch (e) { return false; }
  }

  function looksLikeHeader(el) {
    if (!el) return false;
    try {
      var cls = (el.className || '').toString().toLowerCase();
      if (/header|site-header|app-header|navbar|logo|branding/.test(cls)) return true;
      if (el.tagName && el.tagName.toLowerCase() === 'header') return true;
    } catch (e) {}
    return false;
  }

  // Detect mood controls (welcome modal) - if present, DO NOT TOUCH this container
  function hasMoodControls(container) {
    if (!container) return false;
    try {
      // select/options containing mood keywords
      var sel = container.querySelectorAll('select');
      for (var i = 0; i < sel.length; i++) {
        var opts = sel[i].options || [];
        for (var j = 0; j < opts.length; j++) {
          var v = (opts[j].text || opts[j].value || '').toString().toLowerCase();
          if (/ansiedad|tenso|tensión|estrés|estres|crisis|bien|triste|nervios|motiv/i.test(v)) return true;
        }
      }
      // radio groups with labels containing mood keywords
      var radios = container.querySelectorAll('input[type="radio"]');
      if (radios && radios.length) {
        for (i = 0; i < radios.length; i++) {
          var r = radios[i];
          var id = r.id;
          if (id) {
            var lab = container.querySelector('label[for="' + id + '"]');
            if (lab) {
              var lt = (lab.textContent || '').toLowerCase();
              if (/ansiedad|tenso|tensión|estrés|estres|crisis|bien|mal|nervios|motiv/i.test(lt)) return true;
            }
          }
        }
      }
      // buttons with welcome-like labels
      var buttons = container.querySelectorAll('button,input[type="button"],input[type="submit"]');
      for (i = 0; i < buttons.length; i++) {
        var bt = (buttons[i].textContent || buttons[i].value || '').toString().toLowerCase();
        if (/ver frase|ir|mostrar|guardar|continuar/i.test(bt)) {
          // these labels alone are not conclusive, only if combined with other mood markers
          // but we'll keep conservative: if both buttons and radios exist -> welcome modal
          if (radios && radios.length) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Determine if container is the session modal (where we should apply)
  function isSessionModal(container) {
    if (!container) return false;
    try {
      // must be visible and not header-like
      if (!isVisible(container) || looksLikeHeader(container)) return false;
      // prefer explicit id
      if (container.id === '__lr_temp_session_modal') return true;
      // contains timer <select> -> session modal
      if (container.querySelector && container.querySelector('select')) return true;
      // contains expected session title text
      var txt = (container.textContent || '').toString().toLowerCase();
      if (/comenzar sesi[oó]n de respiraci[oó]n|temporizador de sesi[oó]n|iniciar sesi[oó]n|temporizador de sesi[oó]n/i.test(txt)) return true;
      // contains "Iniciar sesión" button text
      if (/iniciar sesi[oó]n/.test(txt)) return true;
    } catch (e) {}
    return false;
  }

  function findCandidates() {
    var nodes = Array.from(document.querySelectorAll(CANDIDATE_SELECTOR));
    var filtered = nodes.filter(function (n) {
      try {
        if (!isVisible(n)) return false;
        if (looksLikeHeader(n)) return false;
        // Exclude welcome-like containers that include mood controls
        if (hasMoodControls(n)) return false;
        // Must be session modal by heuristics
        return isSessionModal(n);
      } catch (e) { return false; }
    });
    // deduplicate
    return filtered.filter(function (n, i, arr) { return arr.indexOf(n) === i; });
  }

  function findTitleNode(container) {
    if (!container) return null;
    try {
      var t = container.querySelector('#lr-session-title') || container.querySelector('#lr-modal-title') || container.querySelector('.lr-modal-title');
      if (t) return t;
      t = container.querySelector('h1,h2,h3,h4,h5,h6');
      if (t) return t;
      var cand = Array.from(container.querySelectorAll('div,span,p')).find(function (el) {
        var tx = (el.textContent || '').trim();
        return tx && tx.length < 120 && /comenzar sesi[oó]n|temporizador de sesi[oó]n|iniciar sesi[oó]n|comenzar sesi[oó]n de respiraci[oó]n/i.test(tx.toLowerCase());
      });
      return cand || null;
    } catch (e) { return null; }
  }

  function findSubtitleNode(container) {
    var title = findTitleNode(container);
    if (!title) return null;
    var cur = title.nextElementSibling;
    while (cur) {
      try {
        if (cur.querySelector && (cur.querySelector('select') || cur.querySelector('button'))) { cur = cur.nextElementSibling; continue; }
        var t = (cur.textContent || '').trim();
        if (t && t.length >= 8) return cur;
      } catch (e) {}
      cur = cur.nextElementSibling;
    }
    return null;
  }

  function findNodeWithDefaultSentence(container) {
    try {
      var nodes = Array.from(container.querySelectorAll('p,div,span'));
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        try {
          if (isControlNode(n)) continue;
          var t = (n.textContent || '').trim();
          if (!t) continue;
          if (/Ya tenemos preparada tu sesión de respiraci[oó]n/i.test(t)) return n;
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  function findTimerHeading(container) {
    if (!container) return null;
    try {
      var headings = container.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span');
      for (var i = 0; i < headings.length; i++) {
        try {
          var txt = (headings[i].textContent || '').trim();
          if (/Temporizador de sesi[oó]n/i.test(txt)) return headings[i];
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  function isControlNode(node) {
    if (!node) return false;
    try {
      if (node.querySelector && (node.querySelector('select') || node.querySelector('button'))) return true;
      var tag = (node.tagName || '').toLowerCase();
      return tag === 'select' || tag === 'button' || tag === 'input' || tag === 'textarea';
    } catch (e) { return false; }
  }

  // Remove duplicates conservatively
  function removeDuplicateDefaultNodes(container, firstLine, nodeToKeep) {
    try {
      var patterns = [/Ya tenemos preparada tu sesión de respiraci[oó]n/i, /Solo tienes que seleccionar el tiempo que puedes dedicarle/i, /Tras ella, te sentir[aá]s mejor/i];
      Array.from(container.querySelectorAll('p,div,span')).forEach(function (n) {
        try {
          if (!n || n === nodeToKeep) return;
          if (n.querySelector && (n.querySelector('select') || n.querySelector('button'))) return;
          var t = (n.textContent || '').trim();
          if (!t) return;
          if (firstLine && t.indexOf(firstLine) !== -1) return;
          for (var i = 0; i < patterns.length; i++) {
            if (patterns[i].test(t) && t.length < 800) { n.remove(); break; }
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  // ---- Core personalize ----
  function personalizeContainer(container, name, timerText) {
    if (!container) return 0;
    if (looksLikeHeader(container)) return 0;
    if (hasMoodControls(container)) {
      // critical: do NOT touch welcome modal; bail out
      console.debug('[breath-personalize] skipped container because it appears to be welcome/mood modal');
      return 0;
    }
    name = (name || nameCache || '').trim();

    var userData = null;
    try {
      userData =
        window.CLIENT_USER ||
        tryParseJson(localStorage.getItem('lr_client_runtime') || localStorage.getItem('lr_client_runtime_user') || '{}');
    } catch (e) {
      userData = window.CLIENT_USER || {};
    }

    var phrase = selectPhraseForUser(userData);
    var firstLine = (name || (userData && userData.nombre) || 'amiga') + (phrase ? (', ' + phrase) : '');
    var combined = buildMessage(name || (userData && userData.nombre) || 'amiga', phrase);

    // Update existing personalized node if present -> avoid duplicates
    var existing = container.querySelector('.' + TARGET_CLASS) || container.querySelector('[' + TARGET_ATTR + ']') || container.querySelector('[' + MARKER_ATTR + ']');
    if (existing) {
      try {
        var curText = (existing.textContent || '').trim();
        if (curText === combined) {
          // ensure attributes set
          try { container.setAttribute(MARKER_ATTR, '1'); container.setAttribute(NAME_ATTR, name || ''); if (phrase) container.setAttribute('data-breath-mood-phrase', phrase); } catch (e) {}
          removeDuplicateDefaultNodes(container, firstLine, existing);
          return 0;
        }
        existing.textContent = combined;
        try { existing.setAttribute(TARGET_ATTR, '1'); existing.classList.add(TARGET_CLASS); } catch (e) {}
        try { container.setAttribute(MARKER_ATTR, '1'); container.setAttribute(NAME_ATTR, name || ''); if (phrase) container.setAttribute('data-breath-mood-phrase', phrase); } catch (e) {}
        removeDuplicateDefaultNodes(container, firstLine, existing);
        return 1;
      } catch (e) {}
    }

    // Idempotence: if container marked with same values, skip
    try {
      if (container.getAttribute && container.getAttribute(MARKER_ATTR) === '1') {
        var curName = container.getAttribute(NAME_ATTR) || '';
        var curPhrase = container.getAttribute('data-breath-mood-phrase') || '';
        if (curName === (name || '') && curPhrase === (phrase || '')) {
          removeDuplicateDefaultNodes(container, firstLine, null);
          return 0;
        }
      }
    } catch (e) {}

    // Backup original once
    try {
      if (!container.hasAttribute(ORIGINAL_ATTR)) {
        container.setAttribute(ORIGINAL_ATTR, encodeURIComponent(container.innerHTML));
      }
    } catch (e) {}

    // Deterministic replace: subtitle under title preferred
    var nodeThatContainsFirstLine = null;
    try {
      var target = findSubtitleNode(container);
      if (target) {
        var existingText = (target.textContent || '').trim();
        if (existingText.indexOf(firstLine) === -1) {
          target.textContent = combined;
          try { target.classList.add(TARGET_CLASS); target.setAttribute(TARGET_ATTR, '1'); } catch (e) {}
          nodeThatContainsFirstLine = target;
        } else {
          nodeThatContainsFirstLine = target;
        }
      } else {
        var fallback = findNodeWithDefaultSentence(container);
        if (fallback) {
          var ftxt = (fallback.textContent || '').trim();
          if (ftxt.indexOf(firstLine) === -1) {
            fallback.textContent = combined;
            try { fallback.classList.add(TARGET_CLASS); fallback.setAttribute(TARGET_ATTR, '1'); } catch (e) {}
            nodeThatContainsFirstLine = fallback;
          } else {
            nodeThatContainsFirstLine = fallback;
          }
        } else {
          var sel = container.querySelector('select');
          var insert = document.createElement('div');
          insert.textContent = combined;
          insert.className = TARGET_CLASS;
          insert.setAttribute(TARGET_ATTR, '1');
          insert.style.marginBottom = '8px';
          if (sel && sel.parentElement) sel.parentElement.insertBefore(insert, sel);
          else container.insertBefore(insert, container.firstChild);
          nodeThatContainsFirstLine = insert;
        }
      }
    } catch (e) {
      console.warn('[breath-personalize] replace failed', e);
    }

    // remove duplicates conservatively
    removeDuplicateDefaultNodes(container, firstLine, nodeThatContainsFirstLine);

    // Optional timer heading change
    if (typeof timerText === 'string') {
      try {
        var heading = findTimerHeading(container);
        if (heading) {
          if (!container.hasAttribute(TIMER_ORIG_ATTR)) {
            container.setAttribute(TIMER_ORIG_ATTR, encodeURIComponent(heading.innerHTML));
          }
          heading.textContent = timerText;
          container.setAttribute(TIMER_STORED_ATTR, timerText);
        }
      } catch (e) {}
    }

    // Mark container
    try {
      container.setAttribute(MARKER_ATTR, '1');
      container.setAttribute(NAME_ATTR, name || '');
      if (phrase) container.setAttribute('data-breath-mood-phrase', phrase);
    } catch (e) {}

    return 1;
  }

  function scanAndApply(name, timerText) {
    var applied = 0;
    var candidates = findCandidates();
    for (var i = 0; i < candidates.length; i++) {
      try {
        applied += personalizeContainer(candidates[i], name, timerText);
      } catch (e) {}
    }
    return applied;
  }

  // ---- Network hooks ----
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

  // ---- Name discovery ----
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
            var keys = ['user', 'usuario', 'currentUser', 'me'];
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

  // ---- Observer ----
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function () {
      try {
        var name = nameCache || findNameFromStorageOrWindow();
        if (name) nameCache = name;
        scanAndApply(name);
      } catch (e) {}
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    setTimeout(function () {
      var name = nameCache || findNameFromStorageOrWindow();
      if (name) nameCache = name;
      scanAndApply(name);
    }, 120);
    installNetworkHooks();
  }

  // ---- Public API ----
  window.__breathPersonalFixed = window.__breathPersonalFixed || {};
  window.__breathPersonalFixed.runNow = function (name, timerText) {
    if (name && typeof name === 'string') {
      nameCache = name.trim();
      try { localStorage.setItem('breath_user_name', nameCache); } catch (e) {}
    }
    return scanAndApply(nameCache, typeof timerText === 'string' ? timerText : undefined);
  };
  window.__breathPersonalFixed.findName = function () { return nameCache || findNameFromStorageOrWindow(); };
  window.__breathPersonalFixed.restore = function () {
    try {
      var restored = 0;
      var nodes = Array.from(document.querySelectorAll('[' + ORIGINAL_ATTR + ']'));
      nodes.forEach(function (c) {
        try {
          var orig = c.getAttribute(ORIGINAL_ATTR);
          if (orig != null) {
            c.innerHTML = decodeURIComponent(orig);
            c.removeAttribute(ORIGINAL_ATTR);
            c.removeAttribute(MARKER_ATTR);
            c.removeAttribute(NAME_ATTR);
            c.removeAttribute(TIMER_ORIG_ATTR);
            c.removeAttribute(TIMER_STORED_ATTR);
            c.removeAttribute('data-breath-mood-phrase');
            restored++;
          }
        } catch (e) {}
      });
      return restored;
    } catch (e) { return 0; }
  };
  window.__breathPersonalFixed.disconnect = function () { try { observer && observer.disconnect(); observer = null; } catch (e) {} };

  // ---- Init ----
  startObserver();
  console.debug('[breath-personalize] cargado y listo — ahora SKIP the welcome modal (mood controls) and only modify session modal.');
})();
