// breath-session-personalize.js
// CORREGIDO — cambios clave:
// - Nunca modifica el modal de bienvenida (welcome modal) que contiene controles de estado/mood.
// - Solo aplica al modal de inicio de sesión (session modal), identificado de forma estricta:
//     * Preferencia: elemento con id="__lr_temp_session_modal"
//     * Fallback: elemento que contenga un <select> (temporizador) Y un botón con texto "Iniciar sesión" (o variante)
// - Evita escaneos masivos y evita tocar headers/branding.
// - Mantiene backups, restore(), runNow(), disconnect() y hooks de red (fetch/XHR).
// - Evita duplicados: actualiza nodo personalizado existente en lugar de insertar otro.
// - Añadido logging conservador para debugging (console.debug).
//
// Sustituye este archivo por el actual en el repo. Luego recarga la app y prueba:
//   window.__breathPersonalFixed.runNow(window.CLIENT_USER && window.CLIENT_USER.nombre)

(function () {
  'use strict';

  // ----- Config / atributos -----
  var ORIGINAL_ATTR = 'data-breath-original-html';
  var MARKER_ATTR = 'data-breath-personalized';
  var NAME_ATTR = 'data-breath-personalized-name';
  var PHRASE_ATTR = 'data-breath-mood-phrase';
  var TARGET_CLASS = 'lr-breath-personalized-target';
  var TARGET_ATTR = 'data-breath-target';

  var MESSAGE_TEMPLATE_WITH_PHRASE = '{name}, {phrase} Cuando estés lista, selecciona el tiempo que quieres dedicarle a tu sesión; después te sentirás mucho mejor.';
  var MESSAGE_TEMPLATE_DEFAULT = '{name}, cuando estés lista, selecciona el tiempo que quieres dedicarle a tu sesión; después te sentirás mucho mejor.';

  // phrase bank (unchanged content)
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

  // ----- Estado interno -----
  var nameCache = null;
  var observer = null;
  var hooksInstalled = false;

  // ----- Utilidades -----
  function chooseFromArray(arr, level) {
    if (!Array.isArray(arr)) return null;
    var idx = Math.max(0, Math.min(arr.length - 1, (Number(level) || 1) - 1));
    return arr[idx] || arr[0];
  }
  function tryParseJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  function selectPhraseForUser(data) {
    try {
      if (!data) return null;
      var estado = (data.estadoEmocionalActual || '').toString().toLowerCase();
      var nivel = Number(data.nivelDeAnsiedad || data.nivel || 1);
      var tension = (data.tensionTipo || '').toString().toLowerCase();

      if (estado.indexOf('crisis') !== -1 && PHRASE_BANK.crisis) return chooseFromArray(PHRASE_BANK.crisis, nivel);
      if ((estado.indexOf('ansiedad') !== -1 || estado.indexOf('ansioso') !== -1) && PHRASE_BANK.ansiedad) return chooseFromArray(PHRASE_BANK.ansiedad, nivel);
      if ((estado.indexOf('tenso') !== -1 || estado.indexOf('tensión') !== -1) && PHRASE_BANK.tenso) {
        if (tension && PHRASE_BANK.tenso[tension]) return chooseFromArray(PHRASE_BANK.tenso[tension], nivel);
        return chooseFromArray(PHRASE_BANK.tenso.default, nivel);
      }
      if (estado.indexOf('motiv') !== -1 && PHRASE_BANK.motivacion) return chooseFromArray(PHRASE_BANK.motivacion, nivel);
      return chooseFromArray(PHRASE_BANK.neutral, nivel);
    } catch (e) { return null; }
  }

  function buildMessage(name, phrase) {
    name = name || 'amiga';
    if (phrase && phrase.trim()) return MESSAGE_TEMPLATE_WITH_PHRASE.replace('{name}', name).replace('{phrase}', phrase);
    return MESSAGE_TEMPLATE_DEFAULT.replace('{name}', name);
  }

  // ----- Detection helpers -----
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

  // Detect if container contains mood controls (welcome modal). Conservative.
  function hasMoodControls(container) {
    if (!container) return false;
    try {
      var selects = container.querySelectorAll('select');
      for (var si = 0; si < selects.length; si++) {
        var opts = selects[si].options || [];
        for (var oi = 0; oi < opts.length; oi++) {
          var v = (opts[oi].text || opts[oi].value || '').toString().toLowerCase();
          if (/ansiedad|tenso|tensión|estres|estrés|crisis|bien|mal|nervios|motiv/i.test(v)) return true;
        }
      }
      var radios = container.querySelectorAll('input[type="radio"]');
      if (radios && radios.length) {
        for (var ri = 0; ri < radios.length; ri++) {
          var id = radios[ri].id;
          if (id) {
            var lab = container.querySelector('label[for="' + id + '"]');
            if (lab && /ansiedad|tenso|tensión|estrés|estres|crisis|bien|mal|nervios|motiv/i.test((lab.textContent || '').toLowerCase())) return true;
          }
        }
      }
      return false;
    } catch (e) { return false; }
  }

  // Detect if container is session modal:
  // Strict: id '__lr_temp_session_modal' OR contains <select> AND a "Iniciar sesión" start button.
  function hasStartSessionButton(container) {
    if (!container) return false;
    try {
      var btns = Array.from(container.querySelectorAll('button,input[type="button"],input[type="submit"],a'));
      for (var bi = 0; bi < btns.length; bi++) {
        var el = btns[bi];
        var txt = ((el.textContent || '') + ' ' + (el.value || '')).toString().toLowerCase();
        if (/iniciar sesi[oó]n|iniciar sesion|iniciar sesión|iniciar/i.test(txt)) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  function isSessionModal(container) {
    if (!container) return false;
    try {
      if (container.id === '__lr_temp_session_modal') return true;
      if (container.querySelector && container.querySelector('select') && hasStartSessionButton(container)) return true;
      // As extra safety: require title text matching
      var txt = (container.textContent || '').toString().toLowerCase();
      if ((/comenzar sesi[oó]n de respiraci[oó]n|temporizador de sesi[oó]n|selecciona duraci[oó]n/i).test(txt) && container.querySelector && container.querySelector('select')) return true;
    } catch (e) {}
    return false;
  }

  // Find the single session modal to act on
  function findSessionModal() {
    // prefer explicit id
    var byId = document.getElementById('__lr_temp_session_modal');
    if (byId && isVisible(byId) && !hasMoodControls(byId) && !looksLikeHeader(byId)) return byId;

    // search for elements that look like session modal
    var candidates = Array.from(document.querySelectorAll('.lr-modal-card, .lr-user-modal, .lr-modal, [role="dialog"], .breath-modal, .modal'));
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      try {
        if (!isVisible(c)) continue;
        if (looksLikeHeader(c)) continue;
        if (hasMoodControls(c)) continue; // skip welcome modal
        if (isSessionModal(c)) return c;
      } catch (e) {}
    }

    // fallback: any visible element containing a select and string 'temporizador' in text
    var selAll = Array.from(document.querySelectorAll('select'));
    for (i = 0; i < selAll.length; i++) {
      var s = selAll[i];
      var parent = s.closest('.lr-modal-card, .lr-user-modal, .lr-modal, [role="dialog"], .breath-modal, .modal') || s.closest('div,section');
      if (parent && isVisible(parent) && !hasMoodControls(parent) && !looksLikeHeader(parent) && isSessionModal(parent)) return parent;
    }

    return null;
  }

  // ----- DOM helpers to find title/subtitle -----
  function findTitleNode(container) {
    if (!container) return null;
    try {
      var t = container.querySelector('#lr-session-title') || container.querySelector('#lr-modal-title') || container.querySelector('.lr-modal-title');
      if (t) return t;
      t = container.querySelector('h1,h2,h3,h4,h5,h6');
      if (t) return t;
    } catch (e) {}
    return null;
  }

  function findSubtitleNode(container) {
    var title = findTitleNode(container);
    if (!title) return null;
    var cur = title.nextElementSibling;
    while (cur) {
      try {
        if (cur.querySelector && (cur.querySelector('select') || cur.querySelector('button'))) { cur = cur.nextElementSibling; continue; }
        var txt = (cur.textContent || '').trim();
        if (txt && txt.length >= 8) return cur;
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
          if (/Ya tenemos preparada tu sesión de respiraci[oó]n/i.test(t) || /Selecciona duraci[oó]n o un preset y pulsa Iniciar\.?/i.test(t)) return n;
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

  // Remove duplicate small nodes conservatively, preserving nodeToKeep
  function removeDuplicateDefaultNodes(container, firstLine, nodeToKeep) {
    try {
      var patterns = [/Ya tenemos preparada tu sesión de respiraci[oó]n/i, /Solo tienes que seleccionar el tiempo que puedes dedicarle/i, /Tras ella, te sentir[aá]s mejor/i, /Selecciona duraci[oó]n o un preset y pulsa Iniciar\.?/i];
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

  // ----- Core personalization: only target the single session modal -----
  function applyPersonalizationOnce(name) {
    var container = findSessionModal();
    if (!container) {
      console.debug('[breath-personalize] session modal not found; skipping');
      return 0;
    }

    // Safety: do not touch welcome modal
    if (hasMoodControls(container)) {
      console.debug('[breath-personalize] detected mood controls in chosen container; skipping to avoid touching welcome modal');
      return 0;
    }

    name = (name || nameCache || '').trim();
    var userData = null;
    try {
      userData = window.CLIENT_USER || tryParseJson(localStorage.getItem('lr_client_runtime') || localStorage.getItem('lr_client_runtime_user') || '{}');
    } catch (e) { userData = window.CLIENT_USER || {}; }

    var phrase = selectPhraseForUser(userData);
    var firstLine = (name || (userData && userData.nombre) || 'amiga') + (phrase ? (', ' + phrase) : '');
    var combined = buildMessage(name || (userData && userData.nombre) || 'amiga', phrase);

    // Update existing personalized node if present -> avoid duplicates
    var existing = container.querySelector('.' + TARGET_CLASS) || container.querySelector('[' + TARGET_ATTR + ']') || container.querySelector('[' + MARKER_ATTR + ']');
    if (existing) {
      try {
        var curText = (existing.textContent || '').trim();
        if (curText === combined) {
          container.setAttribute(MARKER_ATTR, '1');
          container.setAttribute(NAME_ATTR, name || '');
          if (phrase) container.setAttribute(PHRASE_ATTR, phrase);
          removeDuplicateDefaultNodes(container, firstLine, existing);
          console.debug('[breath-personalize] existing node already up-to-date');
          return 0;
        }
        existing.textContent = combined;
        try { existing.setAttribute(TARGET_ATTR, '1'); existing.classList.add(TARGET_CLASS); } catch (e) {}
        try { container.setAttribute(MARKER_ATTR, '1'); container.setAttribute(NAME_ATTR, name || ''); if (phrase) container.setAttribute(PHRASE_ATTR, phrase); } catch (e) {}
        removeDuplicateDefaultNodes(container, firstLine, existing);
        console.debug('[breath-personalize] updated existing personalized node');
        return 1;
      } catch (e) {}
    }

    // If container already marked with same data, skip
    try {
      if (container.getAttribute && container.getAttribute(MARKER_ATTR) === '1') {
        var curName = container.getAttribute(NAME_ATTR) || '';
        var curPhrase = container.getAttribute(PHRASE_ATTR) || '';
        if (curName === (name || '') && curPhrase === (phrase || '')) {
          removeDuplicateDefaultNodes(container, firstLine, null);
          console.debug('[breath-personalize] container already marked with same name+phrase; skipping');
          return 0;
        }
      }
    } catch (e) {}

    // Backup original HTML once
    try {
      if (!container.hasAttribute(ORIGINAL_ATTR)) container.setAttribute(ORIGINAL_ATTR, encodeURIComponent(container.innerHTML));
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
          try { insert.setAttribute(TARGET_ATTR, '1'); } catch (e) {}
          insert.style.marginBottom = '8px';
          if (sel && sel.parentElement) sel.parentElement.insertBefore(insert, sel);
          else container.insertBefore(insert, container.firstChild);
          nodeThatContainsFirstLine = insert;
        }
      }
    } catch (e) {
      console.warn('[breath-personalize] replace failed', e);
    }

    // Remove duplicate lines conservatively
    removeDuplicateDefaultNodes(container, firstLine, nodeThatContainsFirstLine);

    // Mark container
    try {
      container.setAttribute(MARKER_ATTR, '1');
      container.setAttribute(NAME_ATTR, name || '');
      if (phrase) container.setAttribute(PHRASE_ATTR, phrase);
    } catch (e) {}

    console.debug('[breath-personalize] personalization applied to session modal');
    return 1;
  }

  // ----- API & hooks -----
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
                    setTimeout(function () { applyPersonalizationOnce(nameCache); }, 50);
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
                      setTimeout(function () { applyPersonalizationOnce(nameCache); }, 50);
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

  function findNameFromStorageOrWindow() {
    try {
      var v = localStorage.getItem('breath_user_name');
      if (v && v.trim()) return v.trim();
    } catch (e) {}
    try {
      if (window.CLIENT_USER && window.CLIENT_USER.nombre) return window.CLIENT_USER.nombre;
      var parsed = tryParseJson(localStorage.getItem('lr_client_runtime'));
      if (parsed && parsed.nombre) return parsed.nombre;
    } catch (e) {}
    return null;
  }

  // MutationObserver: only used to trigger apply when modal appears; does NOT scan/modify arbitrary containers
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (muts) {
      try {
        var modal = findSessionModal();
        if (modal) {
          var name = nameCache || findNameFromStorageOrWindow();
          if (name) nameCache = name;
          applyPersonalizationOnce(name);
        }
      } catch (e) {}
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    // initial attempt shortly after load
    setTimeout(function () {
      try {
        var name = nameCache || findNameFromStorageOrWindow();
        if (name) nameCache = name;
        applyPersonalizationOnce(name);
      } catch (e) {}
    }, 150);
    installNetworkHooks();
  }

  // Public API
  window.__breathPersonalFixed = window.__breathPersonalFixed || {};
  window.__breathPersonalFixed.runNow = function (name) {
    try {
      if (name && typeof name === 'string') {
        nameCache = name.trim();
        try { localStorage.setItem('breath_user_name', nameCache); } catch (e) {}
      }
    } catch (e) {}
    return applyPersonalizationOnce(nameCache);
  };
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
            c.removeAttribute(PHRASE_ATTR);
            restored++;
          }
        } catch (e) {}
      });
      return restored;
    } catch (e) { return 0; }
  };
  window.__breathPersonalFixed.disconnect = function () {
    try {
      observer && observer.disconnect();
      observer = null;
    } catch (e) {}
  };

  // Init
  startObserver();
  console.debug('[breath-personalize] loaded: WILL ONLY MODIFY SESSION MODAL (strict detection).');

})();
