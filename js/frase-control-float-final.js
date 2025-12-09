// frase-controls-float-final.js (v3 patched)
// Clones flotantes seguros + favorito sincronizado + TTS sincronizado con override de speechSynthesis.speak
// API: window.FloatingControlsFinal.apply() / .restore()

(function(){
  'use strict';

  var CONTAINER_ID = 'frc-safe-float-final';
  var STYLE_ID = 'frc-safe-float-final-style';
  var CLONE_ATTR = 'data-frc-clone-for';
  var HIDDEN_ATTR = 'data-frc-hidden-original';
  var IDS = ['ttsBtn','favBtn','downloadBtn','shareBtn'];
  var ICON_MAP = { ttsBtn: '🔊', favBtn: '♡', downloadBtn: '⬇️', shareBtn: '🔗' };

  // preferred voice heuristics
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

  function findOriginal(id){
    var el = document.getElementById(id);
    if(el) return el;
    var action = id === 'ttsBtn' ? 'tts' : id.replace(/Btn$/,'').toLowerCase();
    return document.querySelector('.frase-controls [data-action="'+action+'"]') || document.querySelector('[data-action="'+action+'"]') || null;
  }

  function cleanup(){
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
    // restore speak patch flag if needed
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

  // --- heurística para obtener la frase visible actual ---
  function elementVisibleScore(el){
    try {
      var r = el.getBoundingClientRect();
      if(r.width===0 || r.height===0) return -1;
      var vpCenterX = window.innerWidth/2, vpCenterY = window.innerHeight/2;
      var elCenterX = r.left + r.width/2, elCenterY = r.top + r.height/2;
      var dx = Math.abs(elCenterX - vpCenterX), dy = Math.abs(elCenterY - vpCenterY);
      var dist = Math.sqrt(dx*dx + dy*dy);
      var area = r.width * r.height;
      return area - dist*1000;
    } catch(e){ return -1; }
  }

  function getBestVisibleText(){
    var card = document.querySelector('.frase-card') || document.body;
    var candidates = Array.from(card.querySelectorAll('p,div,span')).filter(function(n){
      try {
        var t = (n.textContent||'').trim();
        var cs = window.getComputedStyle(n);
        return t.length>6 && cs.display!=='none' && cs.visibility!=='hidden' && cs.opacity !== '0';
      } catch(e){ return false; }
    });
    if(candidates.length===0){
      var txt = (card.textContent||'').trim();
      return txt.length? txt : '';
    }
    candidates.sort(function(a,b){ return elementVisibleScore(b) - elementVisibleScore(a); });
    return (candidates[0] && (candidates[0].textContent||'').trim()) || '';
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

  // --- VOICE SELECTION ---
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
      if(pickResult){
        selectedVoice = pickResult;
        return resolve(selectedVoice);
      }
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
      } catch(e){ console.warn('[FloatingControls] speakFallback error', e); return false; }
    }).catch(function(){ return false; });
  }

  // --- monkey patch speechSynthesis.speak to override utter.text when flag is active ---
  function installSpeakOverride(){
    if(!('speechSynthesis' in window)) return;
    if(window._frc_speak_patched) return;
    var originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function(utter){
      try {
        if(window._frc_force_read_visible && Date.now() < window._frc_force_read_visible){
          var visible = getBestVisibleText();
          if(visible && visible.length > 3){
            try { utter.text = visible; } catch(e){}
            // once consumed, keep flag briefly so any further speak calls won't override unrelated utterances
          }
        }
      } catch(e){ console.warn('[frc] speak override error', e); }
      return originalSpeak(utter);
    };
    window._frc_speak_patched = true;
  }

  function markForceRead(durationMs){
    window._frc_force_read_visible = Date.now() + (durationMs || 1800);
    setTimeout(function(){ if(Date.now() > window._frc_force_read_visible) window._frc_force_read_visible = 0; }, (durationMs||1800)+400);
  }

  // --- create clone and behavior (with TTS logic using markForceRead + fallback detection) ---
  function createCloneFor(orig, id, container){
    if(!orig || !container) return null;
    var clone = document.createElement('button');
    clone.type = 'button';
    clone.className = 'frc-clone';
    clone.setAttribute(CLONE_ATTR, id);
    var iconNode = pickIconFor(orig, id);
    if(typeof iconNode === 'string'){
      var s = document.createElement('span'); s.className = 'btn-icon'; s.textContent = iconNode; clone.appendChild(s);
    } else {
      var wrapper = document.createElement('span'); wrapper.className = 'btn-icon';
      try { wrapper.appendChild(iconNode); } catch(e){ wrapper.textContent = ICON_MAP[id] || ''; }
      clone.appendChild(wrapper);
    }
    var label = orig.getAttribute('aria-label') || orig.title || (orig.textContent || '').trim() || '';
    if(label) { clone.setAttribute('title', label); clone.setAttribute('aria-label', label); }

    clone.addEventListener('click', function(e){
      // mark flag so patched speak will override any utter text from orig click
      markForceRead(1800);
      try {
        if(typeof orig.click === 'function') orig.click();
        else orig.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      } catch(err){}

      // after a small delay, if no audio started, do fallback speak of visible phrase
      setTimeout(function(){
        if(isAnyAudioPlaying()) return;
        var phrase = getBestVisibleText();
        if(phrase) speakFallbackWithVoice(phrase);
      }, 300);
    });

    container.appendChild(clone);
    try { orig.style.visibility = 'hidden'; orig.setAttribute(HIDDEN_ATTR, '1'); } catch(e){}
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

  function apply(){
    cleanup();
    injCSS(defaultCSS);
    installSpeakOverride();
    var container = ensureContainer();
    if(!container) return { ok:false, reason:'no-card' };
    var created = [];
    IDS.forEach(function(id){
      var orig = findOriginal(id);
      if(!orig) return;
      var clone = createCloneFor(orig, id, container);
      if(clone) created.push({id:id, clone:clone, orig:orig});
      if(id === 'favBtn' && clone){ syncFavForId('favBtn', clone, orig); observeFavorite(orig, clone); }
      // ensure original tts button when clicked also marks flag (so original speech gets the override)
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
    var c = document.getElementById(CONTAINER_ID);
    if(c && c.parentNode) c.parentNode.removeChild(c);
    IDS.forEach(function(id){
      var orig = findOriginal(id);
      if(orig && orig.getAttribute(HIDDEN_ATTR) === '1'){ orig.style.visibility = ''; orig.removeAttribute(HIDDEN_ATTR); }
    });
    var s = document.getElementById(STYLE_ID); if(s && s.parentNode) s.parentNode.removeChild(s);
    if(favObserver){ try{ favObserver.disconnect(); } catch(e){} favObserver = null; }
    // do not undo speechSynthesis monkeypatch (safe), but clear flag
    window._frc_force_read_visible = 0;
    return { ok:true };
  }

  window.FloatingControlsFinal = window.FloatingControlsFinal || {};
  window.FloatingControlsFinal.apply = apply;
  window.FloatingControlsFinal.restore = restore;

  // auto-apply shortly after load
  setTimeout(function(){
    try { var r = apply(); console.log('[FloatingControlsFinal] applied ->', r); } catch(e){ console.warn('FloatingControlsFinal apply failed', e); }
  }, 120);

  console.debug('[FloatingControlsFinal] ready: call FloatingControlsFinal.apply() or .restore().');
})();
