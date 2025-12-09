// frase-controls-float-final-v7.js
// v7: robust positioning (container appended to document.body), retries until .frase-card exists,
// updates container position on scroll/resize, ensures clones are visible, keeps TTS/fav/download logic.
// Replace your current js/frase-controls-float-final.js with this file or paste into console to test.
//
// Changes vs v6:
// - Waits for .frase-card (with retries) before creating controls
// - Appends floating container to document.body and positions it so it visually aligns to the card center
// - Updates position on scroll/resize and when the card's bounding rect changes
// - Stronger CSS to avoid being clipped by parent overflow / z-index
// - More defensive clone creation and logging to diagnose why buttons could be missing
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

  // internal state
  var container = null;
  var cardEl = null;
  var resizeObserver = null;
  var scrollHandler = null;
  var lastCardRect = null;
  var favObserver = null;

  // simple logger
  function log(){ try { console.debug.apply(console, ['[FloatingControlsV7]'].concat(Array.from(arguments))); } catch(e){} }

  // CSS (stronger: fixed z-index, pointer-events safe, box-sizing)
  var defaultCSS = '\
  #' + CONTAINER_ID + ' { position: absolute !important; z-index:2147483000 !important; pointer-events:auto !important; box-sizing: border-box !important; }\
  #' + CONTAINER_ID + ' .frc-clone { width:40px !important; height:40px !important; min-width:40px !important; min-height:40px !important; border-radius:50% !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; background: rgba(255,255,255,0.96) !important; box-shadow: 0 6px 20px rgba(6,10,9,0.14) !important; cursor:pointer !important; font-size:18px !important; color:#072b2a !important; border:0 !important; margin:8px 0 !important; }\
  #' + CONTAINER_ID + ' .frc-clone .btn-icon{ pointer-events:none !important; z-index:2 !important; }\
  #' + CONTAINER_ID + ' .frc-clone.frc-pressed{ background: linear-gradient(90deg,#ff9a76,#ff6b6b) !important; color:#fff !important; transform: translateY(-2px) !important; box-shadow:0 10px 26px rgba(255,107,107,0.18) !important; }\
  @media (max-width:520px){ #' + CONTAINER_ID + ' { right: 8px !important; } #' + CONTAINER_ID + ' .frc-clone { width:36px !important; height:36px !important; } }\
  ';

  // ---- utilities ----
  function q(sel){ return document.querySelector(sel); }
  function qa(sel){ return Array.from(document.querySelectorAll(sel)); }

  function injCSS(css){
    try {
      if(document.getElementById(STYLE_ID)) return;
      var s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = css;
      (document.head||document.documentElement).appendChild(s);
    } catch(e){ console.warn('[FloatingControlsV7] injCSS failed', e); }
  }

  // find original button by id or data-action fallback
  function findOriginal(id){
    try {
      var el = document.getElementById(id);
      if(el) return el;
      var action = id === 'ttsBtn' ? 'tts' : id.replace(/Btn$/,'').toLowerCase();
      return document.querySelector('.frase-controls [data-action="'+action+'"]') || document.querySelector('[data-action="'+action+'"]') || null;
    } catch(e){ return null; }
  }

  // pick icon helper
  function pickIconFor(orig, id){
    if(!orig) return ICON_MAP[id] || id.slice(0,1);
    var svg = orig.querySelector && orig.querySelector('svg, img, i');
    if(svg) {
      try { return svg.cloneNode(true); } catch(e){/*fallthrough*/ }
    }
    var txt = (orig.textContent || '').trim();
    var tok = txt.split(/\s+/)[0] || '';
    if(/[^A-Za-z0-9\s]/.test(tok) || tok.length <= 2) return tok;
    return ICON_MAP[id] || txt.slice(0,1) || '';
  }

  // text extraction helpers (same cleaning as v6 but defensive)
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

  // VOICE selection (same as before)
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
      } catch(e){ console.warn('[FloatingControlsV7] speak error', e); return false; }
    }).catch(function(){ return false; });
  }

  // speak override (same technique)
  function markForceRead(durationMs){
    window._frc_force_read_visible = Date.now() + (durationMs || 1800);
    setTimeout(function(){ if(Date.now() > window._frc_force_read_visible) window._frc_force_read_visible = 0; }, (durationMs||1800)+400);
  }
  function installSpeakOverride(){
    if(!('speechSynthesis' in window)) return;
    if(window._frc_speak_patched_v7) return;
    var originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function(utter){
      try {
        if(window._frc_force_read_visible && Date.now() < window._frc_force_read_visible){
          var visible = getBestVisibleText();
          if(visible && visible.length > 6 && visible.length < 1000){
            try { utter.text = visible; } catch(e){}
          }
        }
      } catch(e){ console.warn('[FloatingControlsV7] speak override error', e); }
      return originalSpeak(utter);
    };
    window._frc_speak_patched_v7 = true;
  }

  // download helper (same)
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
    } catch(e){ console.warn('[FloatingControlsV7] download failed', e); return false; }
  }

  // create clone (robust)
  function createCloneFor(orig, id){
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

    // behavior
    if(id === 'downloadBtn'){
      clone.addEventListener('click', function(){
        var phrase = getBestVisibleText();
        if(!phrase && orig && typeof orig.click === 'function'){
          try { orig.click(); } catch(e){}
          setTimeout(function(){ var p2 = getBestVisibleText(); if(p2) downloadTextAsFile(p2); }, 220);
          return;
        }
        if(phrase) downloadTextAsFile(phrase);
      }, { passive:true });
    } else {
      clone.addEventListener('click', function(){
        if(id === 'ttsBtn') markForceRead(1800);
        try {
          if(orig && typeof orig.click === 'function') orig.click();
          else if(orig) orig.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
        } catch(e){ log('orig click error', e); }
        if(id === 'ttsBtn'){
          setTimeout(function(){
            if(isAnyAudioPlaying()) return;
            var p = getBestVisibleText();
            if(p) speakFallbackWithVoice(p);
          }, 300);
        }
      }, { passive:true });
    }

    container.appendChild(clone);
    if(orig){
      try { orig.style.visibility = 'hidden'; orig.setAttribute(HIDDEN_ATTR, '1'); } catch(e){}
    }
    return clone;
  }

  // position container relative to card center on the right side of viewport
  function updateContainerPosition(){
    if(!container) return;
    cardEl = cardEl || document.querySelector('.frase-card') || document.getElementById('frase-card');
    if(!cardEl) return;
    try {
      var r = cardEl.getBoundingClientRect();
      lastCardRect = r;
      var centerY = window.scrollY + r.top + (r.height/2);
      // position container such that its center aligns with card center, anchored to right viewport
      container.style.top = Math.round(centerY - (container.offsetHeight/2)) + 'px';
      container.style.right = '14px';
      container.style.left = 'auto';
    } catch(e){ log('position update error', e); }
  }

  function addScrollAndResizeHandlers(){
    scrollHandler = function(){ updateContainerPosition(); };
    window.addEventListener('scroll', scrollHandler, { passive:true });
    window.addEventListener('resize', scrollHandler, { passive:true });
    // observe card resize (if supported)
    try {
      if(window.ResizeObserver){
        resizeObserver = new ResizeObserver(function(){ updateContainerPosition(); });
        cardEl && resizeObserver.observe(cardEl);
      }
    } catch(e){}
  }

  function removeScrollAndResizeHandlers(){
    try { window.removeEventListener('scroll', scrollHandler); window.removeEventListener('resize', scrollHandler); } catch(e){}
    try { if(resizeObserver){ resizeObserver.disconnect(); resizeObserver = null; } } catch(e){}
  }

  // apply/restore
  function applyOnce(){
    try {
      injCSS(defaultCSS);
      installSpeakOverride();
      // ensure container appended to body
      if(document.getElementById(CONTAINER_ID)){
        container = document.getElementById(CONTAINER_ID);
        container.innerHTML = '';
      } else {
        container = document.createElement('div');
        container.id = CONTAINER_ID;
        // basic layout: column flex
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        container.style.gap = '10px';
        document.body.appendChild(container);
      }

      // ensure card exists
      cardEl = document.querySelector('.frase-card') || document.getElementById('frase-card');
      if(!cardEl){
        log('no .frase-card found at apply time — will retry');
        return { ok:false, reason:'no-card' };
      }

      // create clones
      var created = [];
      IDS.forEach(function(id){
        var orig = findOriginal(id);
        // allow download clone even if orig missing
        if(!orig && id !== 'downloadBtn') {
          log('original missing for', id, ' — skipping clone');
          return;
        }
        var clone = createCloneFor(orig, id);
        if(clone) created.push({ id:id, clone:clone, orig:orig });
        if(id === 'favBtn' && clone){
          syncFavForId('favBtn', clone, orig);
          observeFavorite(orig, clone);
        }
        if(id === 'ttsBtn' && orig){
          try {
            if(!orig._frc_marker_attached){
              orig.addEventListener('click', function(){ markForceRead(1800); }, { passive:true });
              orig._frc_marker_attached = true;
            }
          } catch(e){}
        }
      });

      // position and handlers
      updateContainerPosition();
      addScrollAndResizeHandlers();

      log('applied; created clones:', created.map(c=>c.id));
      return { ok:true, created: created.map(c=>c.id) };
    } catch(e){
      console.error('[FloatingControlsV7] apply error', e);
      return { ok:false, error: String(e) };
    }
  }

  // favorite sync functions (same)
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

  function cleanupAll(){
    try {
      removeScrollAndResizeHandlers();
      if(container && container.parentNode) container.parentNode.removeChild(container);
      container = null;
      if(favObserver){ try{ favObserver.disconnect(); } catch(e){} favObserver = null; }
      // unhide originals
      IDS.forEach(function(id){
        var orig = findOriginal(id);
        if(orig && orig.getAttribute(HIDDEN_ATTR) === '1'){
          try { orig.style.visibility = ''; orig.removeAttribute(HIDDEN_ATTR); } catch(e){}
        }
      });
      window._frc_force_read_visible = 0;
      log('cleanupAll done');
    } catch(e){ console.warn('[FloatingControlsV7] cleanupAll error', e); }
  }

  // retry helper: wait for .frase-card and then apply
  function waitForAndApply(retries, interval){
    retries = typeof retries === 'number' ? retries : 10;
    interval = typeof interval === 'number' ? interval : 300;
    var attempts = 0;
    return new Promise(function(resolve){
      function attempt(){
        attempts++;
        var card = document.querySelector('.frase-card') || document.getElementById('frase-card');
        if(card){
          cardEl = card;
          var res = applyOnce();
          resolve(res);
          return;
        }
        if(attempts >= retries){
          resolve({ ok:false, reason:'no-card-after-retries' });
          return;
        }
        setTimeout(attempt, interval);
      }
      attempt();
    });
  }

  // Public API
  window.FloatingControlsFinal = window.FloatingControlsFinal || {};
  window.FloatingControlsFinal.apply = function(){ return waitForAndApply(12, 300); };
  window.FloatingControlsFinal.restore = function(){ cleanupAll(); return { ok:true }; };

  // auto-run
  setTimeout(function(){
    waitForAndApply(12,300).then(function(r){ console.log('[FloatingControlsV7] auto apply ->', r); });
  }, 120);

  // expose some debug helpers
  window.FloatingControlsFinal.__debug = {
    getContainer: function(){ return document.getElementById(CONTAINER_ID); },
    getBestVisibleText: getBestVisibleText,
    lastCardRect: function(){ return lastCardRect; }
  };

  console.debug('[FloatingControlsV7] loaded - call FloatingControlsFinal.apply() / .restore()');
})();
