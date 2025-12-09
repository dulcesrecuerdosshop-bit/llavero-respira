// frase-controls-float-final.js (v6)
// Corrección: el botón "Descargar" ahora descarga la frase VISIBLE actual (texto limpio),
// en lugar de depender de phrases.js. Mantiene:
// - clones flotantes (no mueve los originales)
// - favorito sincronizado (♡/♥ y estilo pressed)
// - TTS sincronizado y override seguro que fuerza la lectura de la frase visible
// - selección preferente de voz en español más natural disponible
//
// Nota importante sobre "Descargar":
// - Para asegurar que se descarga exactamente la frase que el usuario ve, el clon de descarga
//   NO llama a orig.click() (porque orig puede leer desde phrases.js).
// - En su lugar el clon crea y descarga un archivo .txt con la frase visible.
// - Si prefieres recuperar la descarga original (por ejemplo, descarga de imagen), házmelo saber
//   y lo adaptamos para intentar conservar ambos comportamientos (pero puede provocar duplicados).
//
// API: window.FloatingControlsFinal.apply() / .restore()

(function(){
  'use strict';

  var CONTAINER_ID = 'frc-safe-float-final';
  var STYLE_ID = 'frc-safe-float-final-style';
  var CLONE_ATTR = 'data-frc-clone-for';
  var HIDDEN_ATTR = 'data-frc-hidden-original';
  var IDS = ['ttsBtn','favBtn','downloadBtn','shareBtn'];
  var ICON_MAP = { ttsBtn: '🔊', favBtn: '♡', downloadBtn: '⬇️', shareBtn: '🔗' };

  var VOICE_PREFERENCES = ['Google', 'Microsoft', 'Castilian', 'Spanish', 'Español', 'es-ES', 'es-419', 'es'];

  function q(sel){ return document.querySelector(sel); }
  function qa(sel){ return Array.from(document.querySelectorAll(sel)); }

  function injCSS(css){
    if(document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head||document.documentElement).appendChild(s);
  }

  var defaultCSS = '\
  #' + CONTAINER_ID + ' { position: absolute !important; right: 14px !important; top: 50% !important; transform: translateY(-50%) !important; display:flex !important; flex-direction:column !important; gap:12px !important; z-index:9999 !important; align-items:center !important; pointer-events:auto !important; }\
  #' + CONTAINER_ID + ' .frc-clone { width:36px !important; height:36px !important; min-width:36px !important; min-height:36px !important; border-radius:50% !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; position:relative !important; background: rgba(255,255,255,0.95) !important; box-shadow:0 6px 16px rgba(6,10,9,0.12) !important; cursor:pointer !important; font-size:18px !important; color:#072b2a !important; border:0 !important; }\
  #' + CONTAINER_ID + ' .frc-clone .btn-icon{ pointer-events:none !important; z-index:2 !important; }\
  #' + CONTAINER_ID + ' .frc-clone.frc-pressed{ background: linear-gradient(90deg,#ff9a76,#ff6b6b) !important; color:#fff !important; transform: translateY(-2px) !important; box-shadow:0 8px 22px rgba(255,107,107,0.18) !important; }\
  #' + CONTAINER_ID + ' .frc-clone.frc-pressed .btn-icon{ color:#fff !important; font-weight:700 !important; }\
  ';

  // ------------------ Utilities for selecting a clean visible phrase ------------------

  function isInsideControlsOrInteractive(node){
    if(!node) return false;
    try {
      if(node.closest && node.closest('.frase-controls, .frc-clone, .frc-clone *')) return true;
      var anc = node;
      while(anc && anc !== document.body){
        if(anc.tagName && /^(BUTTON|A|INPUT|TEXTAREA|SELECT|LABEL)$/.test(anc.tagName)) return true;
        if(anc.getAttribute && (anc.getAttribute('role') === 'button' || anc.getAttribute('role') === 'menuitem')) return true;
        anc = anc.parentElement;
      }
    } catch(e){}
    return false;
  }

  function getCleanTextFromElement(el){
    if(!el) return '';
    try {
      if(isInsideControlsOrInteractive(el)) return '';
      var clone = el.cloneNode(true);
      var selectorsToRemove = ['.frase-controls','button','a','[role="button"]','[data-frc-clone-for]','svg','img','input','textarea','select','[aria-hidden="true"]'];
      selectorsToRemove.forEach(function(sel){
        Array.from(clone.querySelectorAll(sel)).forEach(function(n){ if(n && n.parentNode) n.parentNode.removeChild(n); });
      });
      Array.from(clone.querySelectorAll('span')).forEach(function(s){
        try {
          var cs = window.getComputedStyle(s);
          if(cs && (parseFloat(cs.fontSize) < 12 || cs.display === 'none' || cs.opacity === '0')) {
            if(s.parentNode) s.parentNode.removeChild(s);
          }
        } catch(e){}
      });
      var text = (clone.textContent || '').replace(/\s+/g,' ').trim();
      var forbiddenWords = ['Escuchar','Respirar','Descargar','Compartir','Favorito','Favoritos','♡','♥','🔊','⬇️','🔗'];
      for(var i=0;i<forbiddenWords.length;i++){
        if(text.indexOf(forbiddenWords[i]) !== -1 && text.length < 30 && /^\W*\w*\W*$/.test(text)) return '';
      }
      if(text.length < 6) return '';
      return text;
    } catch(e){ return ''; }
  }

  function getBestCenterText(){
    var card = document.querySelector('.frase-card');
    var cx, cy;
    if(card) {
      var r = card.getBoundingClientRect();
      cx = Math.round((r.left + r.right)/2);
      cy = Math.round((r.top + r.bottom)/2);
    } else {
      cx = Math.round(window.innerWidth/2);
      cy = Math.round(window.innerHeight/2);
    }
    var el = null;
    try { el = document.elementFromPoint(cx, cy); } catch(e){ el = null; }
    if(!el) return '';
    var preferTags = ['P','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','LI','DIV','SPAN'];
    var node = el;
    while(node && node !== document.body){
      if(isInsideControlsOrInteractive(node)) return '';
      var tag = node.tagName;
      if(preferTags.indexOf(tag) !== -1){
        var text = getCleanTextFromElement(node);
        if(text) return text;
      }
      node = node.parentElement;
    }
    var cardRoot = card || document.body;
    var candidates = Array.from(cardRoot.querySelectorAll('p, h1, h2, h3, div, span, blockquote')).filter(function(n){
      if(isInsideControlsOrInteractive(n)) return false;
      var cs = window.getComputedStyle(n);
      if(!cs || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      return (n.textContent || '').trim().length > 8;
    });
    if(candidates.length === 0) return '';
    var cardRect = (cardRoot.getBoundingClientRect && cardRoot.getBoundingClientRect()) || {left:0, top:0, width: window.innerWidth, height: window.innerHeight};
    var cx2 = Math.round((cardRect.left + (cardRect.left + cardRect.width))/2);
    var cy2 = Math.round((cardRect.top + (cardRect.top + cardRect.height))/2);
    candidates.sort(function(a,b){
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var areaA = ra.width * ra.height, areaB = rb.width * rb.height;
      var distA = Math.hypot((ra.left+ra.width/2)-cx2, (ra.top+ra.height/2)-cy2);
      var distB = Math.hypot((rb.left+rb.width/2)-cx2, (rb.top+rb.height/2)-cy2);
      return (areaB - areaA) || (distA - distB);
    });
    for(var i=0;i<candidates.length;i++){
      var t = getCleanTextFromElement(candidates[i]);
      if(t) return t;
    }
    return '';
  }

  function getBestVisibleText(){
    var t = getBestCenterText();
    if(t) return t;
    var card = document.querySelector('.frase-card') || document.body;
    var nodes = Array.from(card.querySelectorAll('p, h1, h2, h3, div, span, blockquote')).filter(function(n){
      return !isInsideControlsOrInteractive(n) && (n.textContent||'').trim().length > 8;
    });
    if(nodes.length === 0) return '';
    nodes.sort(function(a,b){
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (rb.width*rb.height) - (ra.width*ra.height);
    });
    for(var i=0;i<nodes.length;i++){
      var s = getCleanTextFromElement(nodes[i]);
      if(s) return s;
    }
    return '';
  }

  function isAnyAudioPlaying(){
    try {
      if(window.speechSynthesis && window.speechSynthesis.speaking) return true;
      var medias = Array.from(document.querySelectorAll('audio,video'));
      for(var i=0;i<medias.length;i++){
        if(!medias[i].paused && !medias[i].ended) return true;
      }
    } catch(e){}
    return false;
  }

  // ------------------ Voice selection and speaking ------------------

  var selectedVoice = null;
  function loadVoicesAndPick(){
    return new Promise(function(resolve){
      function pick(voices){
        if(!voices || voices.length===0) return null;
        var esVoices = voices.filter(v => v.lang && v.lang.toLowerCase().indexOf('es') === 0);
        for(var i=0;i<VOICE_PREFERENCES.length;i++){
          var pref = VOICE_PREFERENCES[i].toLowerCase();
          var found = voices.find(function(v){ return ((v.name || '').toLowerCase().indexOf(pref) !== -1) && (v.lang || '').toLowerCase().indexOf('es') !== -1; });
          if(found) return found;
        }
        if(esVoices.length) return esVoices[0];
        var any = voices.find(v => /(spanish|espa)/i.test(v.name || ''));
        return any || voices[0];
      }
      var voices = window.speechSynthesis && window.speechSynthesis.getVoices && window.speechSynthesis.getVoices();
      var pickResult = pick(voices || []);
      if(pickResult){ selectedVoice = pickResult; return resolve(selectedVoice); }
      var onVoices = function(){
        try {
          var vs = window.speechSynthesis.getVoices();
          var p = pick(vs || []);
          if(p) selectedVoice = p;
          window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
          resolve(selectedVoice);
        } catch(e){ window.speechSynthesis.removeEventListener('voiceschanged', onVoices); resolve(null); }
      };
      if(window.speechSynthesis && window.speechSynthesis.addEventListener){
        window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      }
      setTimeout(function(){ try { var vs2 = window.speechSynthesis.getVoices(); selectedVoice = pick(vs2 || []); } catch(e){} resolve(selectedVoice); }, 1200);
    });
  }

  function speakFallbackWithVoice(text){
    if(!text) return Promise.resolve(false);
    if(!('speechSynthesis' in window)) return Promise.resolve(false);
    return loadVoicesAndPick().then(function(){
      try {
        window.speechSynthesis.cancel();
        var utter = new SpeechSynthesisUtterance(text);
        if(selectedVoice) utter.voice = selectedVoice;
        utter.rate = 0.95;
        utter.pitch = 1.02;
        utter.lang = (selectedVoice && selectedVoice.lang) ? selectedVoice.lang : 'es-ES';
        window.speechSynthesis.speak(utter);
        return true;
      } catch(e){ console.warn('[FloatingControls] speak error', e); return false; }
    }).catch(function(){ return false; });
  }

  // ------------------ Controlled speak override (monkey-patch) ------------------

  function markForceRead(durationMs){
    window._frc_force_read_visible = Date.now() + (durationMs || 1800);
    setTimeout(function(){ if(Date.now() > window._frc_force_read_visible) window._frc_force_read_visible = 0; }, (durationMs||1800)+400);
  }

  function installSpeakOverride(){
    if(!('speechSynthesis' in window)) return;
    if(window._frc_speak_patched_v6) return;
    var originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function(utter){
      try {
        if(window._frc_force_read_visible && Date.now() < window._frc_force_read_visible){
          var visible = getBestVisibleText();
          if(visible && visible.length > 6 && visible.length < 1000){
            try { utter.text = visible; } catch(e){}
          }
        }
      } catch(e){ console.warn('[FloatingControls] speak override error', e); }
      return originalSpeak(utter);
    };
    window._frc_speak_patched_v6 = true;
  }

  // ------------------ Icon helper ------------------
  function pickIconFor(orig, id){
    if(!orig) return ICON_MAP[id] || id.slice(0,1);
    var svg = orig.querySelector('svg, img, i');
    if(svg) {
      try { return svg.cloneNode(true); } catch(e) {}
    }
    var txt = (orig.textContent || '').trim();
    var tok = txt.split(/\s+/)[0] || '';
    if(/[^A-Za-z0-9\s]/.test(tok) || tok.length <= 2) return tok;
    return ICON_MAP[id] || txt.slice(0,1) || '';
  }

  // ------------------ Download helper (creates .txt with visible phrase) ------------------
  function sanitizeFilename(s){
    return (s || 'frase').replace(/[^\w\- ]+/g,'').trim().slice(0,40).replace(/\s+/g,'-').toLowerCase() || 'frase';
  }
  function downloadTextAsFile(text){
    try {
      var filename = sanitizeFilename(text.split(/\s+/).slice(0,6).join('-')) + '-' + (new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-') + '.txt';
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function(){ try { a.parentNode && a.parentNode.removeChild(a); URL.revokeObjectURL(url); } catch(e){} }, 500);
      return true;
    } catch(e){ console.warn('[FloatingControls] download failed', e); return false; }
  }

  // ------------------ clones creation and behavior ------------------

  function findOriginal(id){
    var el = document.getElementById(id);
    if(el) return el;
    var action = id === 'ttsBtn' ? 'tts' : id.replace(/Btn$/,'').toLowerCase();
    return document.querySelector('.frase-controls [data-action="'+action+'"]') || document.querySelector('[data-action="'+action+'"]') || null;
  }

  function createCloneFor(orig, id, container){
    if(!container) return null;
    var clone = document.createElement('button');
    clone.type = 'button';
    clone.className = 'frc-clone';
    clone.setAttribute(CLONE_ATTR, id);

    // icon
    var iconNode = orig ? pickIconFor(orig, id) : ICON_MAP[id] || id.slice(0,1);
    if(typeof iconNode === 'string'){
      var s = document.createElement('span'); s.className = 'btn-icon'; s.textContent = iconNode; clone.appendChild(s);
    } else {
      var wrapper = document.createElement('span'); wrapper.className = 'btn-icon';
      try { wrapper.appendChild(iconNode); } catch(e){ wrapper.textContent = ICON_MAP[id] || ''; }
      clone.appendChild(wrapper);
    }

    // label/title
    var label = (orig && (orig.getAttribute('aria-label') || orig.title)) || '';
    if(label) { clone.setAttribute('title', label); clone.setAttribute('aria-label', label); }

    // behavior per id
    if(id === 'downloadBtn'){
      // For download we DO NOT rely on orig.click() because orig may source phrases from phrases.js.
      // Instead we generate a TXT with the visible phrase (cleaned).
      clone.addEventListener('click', function(e){
        var phrase = getBestVisibleText();
        if(!phrase){
          // fallback: try original click if present (best-effort)
          if(orig && typeof orig.click === 'function'){
            try { orig.click(); } catch(e){}
            // still try to extract text after short delay
            setTimeout(function(){
              var p2 = getBestVisibleText();
              if(p2) downloadTextAsFile(p2);
            }, 220);
            return;
          }
          return;
        }
        downloadTextAsFile(phrase);
      }, { passive:true });
    } else {
      // default behavior for other clones (tts, fav, share): trigger original and apply fallback logic
      clone.addEventListener('click', function(e){
        if(id === 'ttsBtn') markForceRead(1800);
        try {
          if(orig && typeof orig.click === 'function') orig.click();
          else if(orig) orig.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
        } catch(err){}
        // fallback behavior: for tts, speak visible phrase if no audio started
        if(id === 'ttsBtn'){
          setTimeout(function(){
            if(isAnyAudioPlaying()) return;
            var p = getBestVisibleText();
            if(p) speakFallbackWithVoice(p);
          }, 300);
        }
      }, { passive:true });
    }

    // append and hide original visually (preserve layout)
    container.appendChild(clone);
    if(orig){
      try { orig.style.visibility = 'hidden'; orig.setAttribute(HIDDEN_ATTR, '1'); } catch(e){}
    }
    return clone;
  }

  var favObserver = null;
  function syncFavForId(id, clone, orig){
    if(id !== 'favBtn' || !clone || !orig) return;
    var pressed = orig.getAttribute('aria-pressed') === 'true';
    var span = clone.querySelector('.btn-icon');
    if(span){ if(span.children.length === 0) span.textContent = pressed ? '♥' : '♡'; }
    if(pressed) clone.classList.add('frc-pressed'); else clone.classList.remove('frc-pressed');
  }
  function observeFavorite(orig, clone){
    if(!orig || !clone) return;
    if(favObserver){ try{ favObserver.disconnect(); } catch(e){} favObserver = null; }
    favObserver = new MutationObserver(function(){ syncFavForId('favBtn', clone, orig); });
    try { favObserver.observe(orig, { attributes: true, attributeFilter: ['aria-pressed','class'] }); } catch(e){}
  }

  // ------------------ apply / restore ------------------

  function cleanupAll(){
    var c = document.getElementById(CONTAINER_ID);
    if(c && c.parentNode) c.parentNode.removeChild(c);
    var s = document.getElementById(STYLE_ID);
    if(s && s.parentNode) s.parentNode.removeChild(s);
    IDS.forEach(function(id){
      var orig = findOriginal(id);
      if(orig && orig.getAttribute(HIDDEN_ATTR) === '1'){
        orig.style.visibility = '';
        orig.removeAttribute(HIDDEN_ATTR);
      }
    });
    if(favObserver){ try{ favObserver.disconnect(); }catch(e){} favObserver = null; }
    window._frc_force_read_visible = 0;
  }

  function ensureContainer(){
    var card = document.querySelector('.frase-card') || document.getElementById('frase-card') || document.body;
    var c = document.getElementById(CONTAINER_ID);
    if(c) return c;
    c = document.createElement('div');
    c.id = CONTAINER_ID;
    card.appendChild(c);
    return c;
  }

  function apply(){
    cleanupAll();
    injCSS(defaultCSS);
    installSpeakOverride();
    var container = ensureContainer();
    if(!container) return { ok:false, reason:'no-card' };
    var created = [];
    IDS.forEach(function(id){
      var orig = findOriginal(id);
      if(!orig && id !== 'downloadBtn' /* allow download clone even if orig missing */) return;
      var clone = createCloneFor(orig, id, container);
      if(clone) created.push({id:id, clone:clone, orig:orig});
      if(id === 'favBtn' && clone){ syncFavForId('favBtn', clone, orig); observeFavorite(orig, clone); }
      if(id === 'ttsBtn' && orig){
        try {
          if(!orig._frc_marker_attached){
            orig.addEventListener('click', function(){ markForceRead(1800); }, { passive:true });
            orig._frc_marker_attached = true;
          }
        } catch(e){}
      }
    });
    return { ok:true, created: created.map(c=>c.id) };
  }

  function restore(){
    cleanupAll();
    return { ok:true };
  }

  window.FloatingControlsFinal = window.FloatingControlsFinal || {};
  window.FloatingControlsFinal.apply = apply;
  window.FloatingControlsFinal.restore = restore;

  setTimeout(function(){
    try { var r = apply(); console.log('[FloatingControlsFinal v6] applied ->', r); } catch(e){ console.warn('FloatingControlsFinal v6 apply failed', e); }
  }, 120);

  console.debug('[FloatingControlsFinal v6] ready: call FloatingControlsFinal.apply() or .restore().');
})();
})();
