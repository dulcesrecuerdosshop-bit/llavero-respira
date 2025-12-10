// frase-controls-float-final.js (v13 - FAVORITES FIXED: sync only real favorites sources)
// Basado en v12; mejora la lógica que parchea favoritos para NO tocar arrays de phrases (*.js).
// - Detecta y parchea únicamente fuentes de *favoritos* (window vars, localStorage keys y listas DOM)
//   cuyo nombre/selector sugiere que son favoritos (contienen 'fav','favorite','favorit', 'favor')
// - Reemplaza sólo las entradas NUEVAS agregadas tras pulsar el botón favorito
// - Si no detecta estructuras, intenta parchear el modal/listado visible.
// - Mantiene controles verticales y ocultación de shareBtn, TTS y descarga PNG.
// API: window.FloatingControlsFinal.apply()/restore()/safeApply()

(function(){
  'use strict';

  if (window._frc_v13_loaded) {
    console.debug('[FloatingControlsV13] already loaded — skipping.');
    return;
  }
  window._frc_v13_loaded = true;

  // CONFIG
  var CONTAINER_ID = 'frc-safe-float-final';
  var STYLE_ID = 'frc-safe-float-final-style';
  var CLONE_ATTR = 'data-frc-clone-for';
  var HIDDEN_ATTR = 'data-frc-hidden-original';
  var MANAGED_FLAG = 'data-frc-managed-v13';
  var IDS = ['ttsBtn','favBtn','downloadBtn']; // shareBtn intentionally excluded
  var ICON_MAP = { ttsBtn: '🔊', favBtn: '♡', downloadBtn: '⬇️' };
  var KNOWN_CONTAINER_IDS = ['frc-safe-float-final','frc-card-float','frc-float-controls-v2','frc-float-controls','frc-safe-float'];

  // CSS
  var defaultCSS = '\
  #' + CONTAINER_ID + ' { position: absolute !important; right: 12px !important; top: 50% !important; transform: translateY(-50%) !important; display:flex !important; flex-direction:column !important; gap:12px !important; align-items:center !important; z-index:2147483000 !important; pointer-events:auto !important; }\
  #' + CONTAINER_ID + ' .frc-clone { display:block !important; width:44px !important; height:44px !important; border-radius:50% !important; align-items:center !important; justify-content:center !important; background: rgba(255,255,255,0.98) !important; box-shadow:0 6px 18px rgba(0,0,0,0.12) !important; cursor:pointer !important; border:0 !important; padding:0 !important; }\
  #' + CONTAINER_ID + ' .frc-clone .btn-icon{ pointer-events:none !important; font-size:18px !important; line-height:1 !important; }\
  #' + CONTAINER_ID + ' .frc-clone.frc-pressed{ background: linear-gradient(90deg,#ff9a76,#ff6b6b) !important; color:#fff !important; transform: translateY(-2px) !important; box-shadow:0 10px 26px rgba(255,107,107,0.18) !important; }\
  @media (max-width:520px){ #' + CONTAINER_ID + ' { right:8px !important; } #' + CONTAINER_ID + ' .frc-clone { width:38px !important; height:38px !important; } }\
  ';

  function q(sel){ return document.querySelector(sel); }
  function qa(sel){ return Array.from(document.querySelectorAll(sel)); }
  function log(){ try{ console.debug.apply(console, ['[FloatingControlsV13]'].concat(Array.from(arguments))); }catch(e){} }

  function injCSS(){
    if(document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = defaultCSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function findOriginal(id){
    try {
      var el = document.getElementById(id);
      if(el) return el;
      var action = id === 'ttsBtn' ? 'tts' : id.replace(/Btn$/,'').toLowerCase();
      return document.querySelector('.frase-controls [data-action="'+action+'"]') || document.querySelector('[data-action="'+action+'"]') || null;
    } catch(e){ return null; }
  }

  function removeLegacyContainers(){
    try {
      KNOWN_CONTAINER_IDS.forEach(function(id){
        var els = document.querySelectorAll('#' + id);
        Array.from(els).forEach(function(el){
          try {
            if ((el.querySelector && el.querySelector('[data-frc-clone-for]')) || el.hasAttribute(MANAGED_FLAG) || id === CONTAINER_ID) {
              el.parentNode && el.parentNode.removeChild(el);
              log('Removed legacy container', id);
            }
          } catch(e){}
        });
      });
      qa('[data-frc-clone-for]').forEach(function(node){
        try {
          var key = node.getAttribute('data-frc-clone-for') || '__unknown';
          var all = qa('[data-frc-clone-for="'+key+'"]');
          if(all.length > 1){
            var keep = all.find(n => n.hasAttribute(MANAGED_FLAG)) || all[0];
            all.forEach(function(n){ if(n !== keep){ try{ n.parentNode && n.parentNode.removeChild(n); }catch(e){} } });
            log('Deduped clones for', key);
          }
        } catch(e){}
      });
    } catch(e){ console.warn('[FloatingControlsV13] removeLegacyContainers error', e); }
  }

  // phrase extraction helpers
  function isInteractiveAncestor(n){
    while(n && n !== document.body){
      try { if(n.matches && n.matches('button,a,[role="button"],input,textarea,select')) return true; } catch(e){}
      n = n.parentElement;
    }
    return false;
  }
  function cleanTextFromNode(el){
    if(!el || isInteractiveAncestor(el)) return '';
    try {
      var clone = el.cloneNode(true);
      Array.from(clone.querySelectorAll('button,a,[role="button"],svg,img,input,textarea,select')).forEach(function(x){ x.parentNode && x.parentNode.removeChild(x); });
      var txt = (clone.textContent||'').replace(/\s+/g,' ').trim();
      return (txt && txt.length >= 6) ? txt : '';
    } catch(e){ return ''; }
  }
  function getBestVisibleText(){
    var card = document.querySelector('.frase-card') || document.body;
    try {
      var r = card.getBoundingClientRect();
      var cx = Math.round((r.left + r.right)/2);
      var cy = Math.round((r.top + r.bottom)/2);
      var el = document.elementFromPoint(cx, cy);
      if(el){
        var node = el;
        while(node && node !== document.body){
          if(/^(P|DIV|SPAN|H1|H2|H3|BLOCKQUOTE|LI)$/.test(node.tagName)){
            var t = cleanTextFromNode(node);
            if(t) return t;
          }
          node = node.parentElement;
        }
      }
    } catch(e){}
    var candidates = Array.from(card.querySelectorAll('p,div,span,blockquote')).filter(function(n){ return !isInteractiveAncestor(n) && (n.textContent||'').trim().length>8; });
    if(candidates.length){
      candidates.sort(function(a,b){ var ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect(); return (rb.width*rb.height)-(ra.width*ra.height); });
      for(var i=0;i<candidates.length;i++){ var s = cleanTextFromNode(candidates[i]); if(s) return s; }
    }
    return '';
  }

  // TTS override
  function markForceRead(durationMs){
    window._frc_force_read_visible = Date.now() + (durationMs || 1600);
    setTimeout(function(){ if(Date.now() > window._frc_force_read_visible) window._frc_force_read_visible = 0; }, (durationMs||1600)+400);
  }
  function installSpeakOverride(){
    if(!('speechSynthesis' in window)) return;
    if(window._frc_speak_patched_v13) return;
    var originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function(utter){
      try {
        if(window._frc_force_read_visible && Date.now() < window._frc_force_read_visible){
          var visible = getBestVisibleText();
          if(visible && visible.length > 4) utter.text = visible;
        }
      } catch(e){}
      return originalSpeak(utter);
    };
    window._frc_speak_patched_v13 = true;
  }

  function pickIconFor(orig, id){
    if(!orig) return ICON_MAP[id] || id.slice(0,1);
    var svg = orig.querySelector && orig.querySelector('svg, img, i');
    if(svg){ try{ return svg.cloneNode(true); } catch(e){} }
    var txt = (orig.textContent||'').trim(), tok = txt.split(/\s+/)[0]||'';
    if(/[^A-Za-z0-9\s]/.test(tok) || tok.length<=2) return tok;
    return ICON_MAP[id] || txt.slice(0,1) || '';
  }

  // download PNG helper
  function sanitizeFilename(s){ return (s||'frase').replace(/[^\w\- ]+/g,'').trim().slice(0,40).replace(/\s+/g,'-').toLowerCase() || 'frase'; }
  function downloadCardPNG(phrase){
    var card = document.querySelector('.frase-card');
    var r = card && card.getBoundingClientRect() || { width:800, height:800 };
    var w = Math.max(600, Math.round(r.width||800)), h = Math.max(600, Math.round(r.height||800));
    var canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h;
    var ctx = canvas.getContext('2d');
    var bgUrl = null;
    try { var cs = card && window.getComputedStyle(card); var m = cs && cs.backgroundImage && cs.backgroundImage.match(/url\(["']?(.*?)["']?\)/); bgUrl = m && m[1]; } catch(e){ bgUrl=null; }

    function drawTextAndFinish(){
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0,0,w,h);
      var fontSize = Math.round(w * 0.055);
      ctx.font = '700 ' + fontSize + 'px "Montserrat", Arial, sans-serif';
      ctx.fillStyle = '#072b2a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var maxWidth = Math.round(w * 0.72);
      var words = phrase.split(/\s+/), lines = [], line = '';
      for(var i=0;i<words.length;i++){ var test = (line?line+' ':'') + words[i]; if(ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = words[i]; } else line = test; }
      if(line) lines.push(line);
      var blockHeight = lines.length * (fontSize + 8);
      var startY = h/2 - blockHeight/2 + fontSize/2;
      for(var li=0; li<lines.length; li++){
        var y = startY + li * (fontSize + 8);
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(lines[li], w/2, y+2);
        ctx.fillStyle = '#072b2a'; ctx.fillText(lines[li], w/2, y);
      }
      canvas.toBlob(function(blob){
        if(!blob) return;
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = sanitizeFilename(phrase) + '.png';
        document.body.appendChild(a); a.click();
        setTimeout(function(){ a.remove(); URL.revokeObjectURL(a.href); }, 700);
      }, 'image/png');
    }

    if(bgUrl){
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function(){
        try {
          var scale = Math.max(w/img.width, h/img.height);
          var dw = img.width * scale, dh = img.height * scale;
          var dx = (w - dw)/2, dy = (h - dh)/2;
          ctx.drawImage(img, dx, dy, dw, dh);
        } catch(e){
          ctx.fillStyle = '#f6c4d3'; ctx.fillRect(0,0,w,h);
        }
        drawTextAndFinish();
      };
      img.onerror = function(){
        ctx.fillStyle = '#f6c4d3'; ctx.fillRect(0,0,w,h);
        drawTextAndFinish();
      };
      img.src = bgUrl;
    } else {
      ctx.fillStyle = '#f6c4d3'; ctx.fillRect(0,0,w,h);
      drawTextAndFinish();
    }
  }

  // ensure container inside card and inline styles
  function ensureContainer(){
    try {
      removeLegacyContainers();
      injCSS();
      var card = document.querySelector('.frase-card');
      if(!card) return null;
      var c = document.getElementById(CONTAINER_ID);
      if(!c){
        c = document.createElement('div'); c.id = CONTAINER_ID;
        c.setAttribute(MANAGED_FLAG, '1');
        c.style.position = 'absolute';
        c.style.right = '12px';
        c.style.top = '50%';
        c.style.transform = 'translateY(-50%)';
        c.style.display = 'flex';
        c.style.flexDirection = 'column';
        c.style.gap = '12px';
        c.style.alignItems = 'center';
        c.style.justifyContent = 'center';
        c.style.zIndex = '2147483000';
        try { var cs = window.getComputedStyle(card); if(cs.position === 'static') card.style.position = 'relative'; } catch(e){}
        card.appendChild(c);
      } else {
        c.setAttribute(MANAGED_FLAG, '1');
        c.style.position = 'absolute';
        c.style.right = '12px';
        c.style.top = '50%';
        c.style.transform = 'translateY(-50%)';
        c.style.display = 'flex';
        c.style.flexDirection = 'column';
        c.style.gap = '12px';
        c.style.alignItems = 'center';
        c.style.justifyContent = 'center';
        c.style.zIndex = '2147483000';
        if(c.parentElement !== card){ c.parentNode && c.parentNode.removeChild(c); card.appendChild(c); }
      }
      return c;
    } catch(e){ console.warn('[FloatingControlsV13] ensureContainer error', e); return null; }
  }

  // --- FAVORITES: only target likely favorite sources (NEW improved) ---
  var FAVOR_KEY_RE = /(fav|favorite|favorit|favor)/i;

  function snapshotFavoriteCandidates(){
    var winArrays = {}; // name -> length
    try {
      Object.keys(window).forEach(function(k){
        try {
          if(!FAVOR_KEY_RE.test(k)) return; // only names that look like favs
          var v = window[k];
          if(Array.isArray(v) && v.length >= 0 && v.every(it => typeof it === 'string' || typeof it === 'object')) {
            winArrays[k] = v.length;
          }
        } catch(e){}
      });
    } catch(e){}
    var localKeys = {}; // key -> length
    try {
      for(var i=0;i<localStorage.length;i++){
        var key = localStorage.key(i);
        if(!FAVOR_KEY_RE.test(key)) continue;
        try {
          var parsed = JSON.parse(localStorage.getItem(key));
          if(Array.isArray(parsed)) localKeys[key] = parsed.length;
        } catch(e){}
      }
    } catch(e){}
    // DOM lists that look like favorites (class/attr contains fav/favorite)
    var domLists = {};
    try {
      var candidates = qa('.favorites-list, .favorite-list, .favoritos, .fav-list, .favorites, [data-fav-list], [data-favorites]');
      candidates.forEach(function(n, idx){
        try { domLists['dom_'+idx] = n.childElementCount; } catch(e){}
      });
    } catch(e){}
    return { winArrays: winArrays, localKeys: localKeys, domLists: domLists };
  }

  function patchNewFavoritesWithVisible(snapBefore, visible){
    // patch window arrays that grew
    try {
      Object.keys(snapBefore.winArrays || {}).forEach(function(name){
        try {
          var arr = window[name];
          if(!Array.isArray(arr)) return;
          var beforeLen = snapBefore.winArrays[name] || 0;
          if(arr.length > beforeLen){
            // replace only the newly added items
            for(var i=beforeLen;i<arr.length;i++){
              arr[i] = visible;
            }
            log('Patched window favorites array', name, 'replaced indexes', beforeLen, '->', arr.length-1);
          }
        } catch(e){}
      });
    } catch(e){}

    // patch localStorage arrays that grew
    try {
      Object.keys(snapBefore.localKeys || {}).forEach(function(key){
        try {
          var parsed = JSON.parse(localStorage.getItem(key) || '[]');
          if(!Array.isArray(parsed)) return;
          var beforeLen = snapBefore.localKeys[key] || 0;
          if(parsed.length > beforeLen){
            for(var j=beforeLen;j<parsed.length;j++) parsed[j] = visible;
            localStorage.setItem(key, JSON.stringify(parsed));
            log('Patched localStorage favorites key', key, 'updated last entries');
          }
        } catch(e){}
      });
    } catch(e){}

    // patch DOM lists that grew
    try {
      var domCandidates = qa('.favorites-list, .favorite-list, .favoritos, .fav-list, .favorites, [data-fav-list], [data-favorites]');
      domCandidates.forEach(function(n, idx){
        try {
          var id = 'dom_'+idx;
          var before = snapBefore.domLists && snapBefore.domLists[id] || 0;
          var after = n.childElementCount;
          if(after > before){
            // update new children text to visible
            for(var c = before; c < after; c++){
              var child = n.children[c];
              if(child) {
                // find textual node inside
                var textTarget = child.querySelector && (child.querySelector('p') || child.querySelector('div') || child);
                if(textTarget) textTarget.textContent = visible;
              }
            }
            log('Patched DOM favorites list', n);
          }
        } catch(e){}
      });
    } catch(e){}
  }

  function patchFavoritesModalIfPresent(visible){
    try {
      var dialogs = qa('[role="dialog"], .modal, .dialog, .favoritos, .favorite-modal, .favorites-modal');
      for(var i=0;i<dialogs.length;i++){
        var d = dialogs[i];
        try {
          var header = d.querySelector && (d.querySelector('h1,h2,h3,h4,.modal-title,.title') || null);
          if(header && /favorit/i.test(header.textContent || '')){
            var body = d.querySelector && (d.querySelector('.modal-body') || d.querySelector('.body') || d.querySelector('p') || d.querySelector('div') || d);
            if(body){
              body.textContent = visible;
              log('Patched favorites modal content to visible phrase');
              return true;
            }
          }
        } catch(e){}
      }
    } catch(e){}
    return false;
  }

  // create clones idempotent with improved fav handler
  function createCloneFor(orig, id, container){
    if(!container) return null;
    var existing = container.querySelector('[data-frc-clone-for="'+id+'"]');
    if(existing) return existing;
    var clone = document.createElement('button');
    clone.type = 'button'; clone.className = 'frc-clone';
    clone.setAttribute(CLONE_ATTR, id); clone.setAttribute(MANAGED_FLAG, '1');
    var iconNode = orig ? pickIconFor(orig, id) : ICON_MAP[id] || id.slice(0,1);
    if(typeof iconNode === 'string'){ var s = document.createElement('span'); s.className='btn-icon'; s.textContent = iconNode; clone.appendChild(s); }
    else { var wrap = document.createElement('span'); wrap.className='btn-icon'; try{ wrap.appendChild(iconNode); } catch(e){ wrap.textContent = ICON_MAP[id] || ''; } clone.appendChild(wrap); }
    var label = (orig && (orig.getAttribute('aria-label') || orig.title)) || '';
    if(label){ clone.setAttribute('title', label); clone.setAttribute('aria-label', label); }

    if(id === 'downloadBtn'){
      clone.addEventListener('click', function(){ var phrase = getBestVisibleText(); if(!phrase && orig && typeof orig.click === 'function'){ try{ orig.click(); }catch(e){} setTimeout(function(){ var p2=getBestVisibleText(); if(p2) downloadCardPNG(p2); },220); return; } if(phrase) downloadCardPNG(phrase); }, { passive:true });
    } else if(id === 'favBtn'){
      clone.addEventListener('click', function(){
        var visible = getBestVisibleText() || '';
        // snapshot only likely favorites containers (by name/key/selector)
        var snap = snapshotFavoriteCandidates();
        // call original favorite logic
        try { if(orig && typeof orig.click === 'function') orig.click(); } catch(e){ log('orig.click() for fav failed', e); }
        // poll for changes limited times and patch only new entries
        var attempts = 0, maxAttempts = 14;
        var poll = setInterval(function(){
          attempts++;
          try {
            // attempt to patch arrays/localStorage/dom that show growth
            patchNewFavoritesWithVisible(snap, visible);
            // try modal patching too
            var modalPatched = patchFavoritesModalIfPresent(visible);
            // detect if any candidate grew — if yes, stop early
            var newSnap = snapshotFavoriteCandidates();
            var changed = false;
            Object.keys(snap.winArrays || {}).forEach(function(k){ if((newSnap.winArrays[k]||0) > (snap.winArrays[k]||0)) changed = true; });
            Object.keys(snap.localKeys || {}).forEach(function(k){ if((newSnap.localKeys[k]||0) > (snap.localKeys[k]||0)) changed = true; });
            Object.keys(snap.domLists || {}).forEach(function(k){ if((newSnap.domLists[k]||0) > (snap.domLists[k]||0)) changed = true; });
            if(modalPatched || changed || attempts >= maxAttempts){
              clearInterval(poll);
              // final attempt: if favorites UI contains list items, replace last textual item to visible
              try {
                var favItems = qa('.favorites-list li, .favorite-item, .fav-item, .favorito li, .favorite-list li');
                if(favItems && favItems.length){
                  var last = favItems[favItems.length-1];
                  if(last && (last.textContent||'').trim().length>0){
                    last.textContent = visible || last.textContent;
                  }
                }
              } catch(e){}
            }
          } catch(e){
            if(attempts >= maxAttempts) clearInterval(poll);
          }
        }, 180);
      }, { passive:true });
      setTimeout(function(){ try { if(orig) syncFav(container.querySelector('[data-frc-clone-for="favBtn"]'), orig); } catch(e){} }, 60);
    } else if(id === 'ttsBtn'){
      clone.addEventListener('click', function(){ markForceRead(1800); try { if(orig && typeof orig.click === 'function') orig.click(); } catch(e){} setTimeout(function(){ if(isAnyAudioPlaying()) return; var p=getBestVisibleText(); if(p){ try{ var u=new SpeechSynthesisUtterance(p); u.lang='es-ES'; u.rate=0.95; u.pitch=1.02; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);}catch(e){} } }, 300); }, { passive:true });
    } else {
      clone.addEventListener('click', function(){ if(orig && typeof orig.click === 'function') orig.click(); }, { passive:true });
    }

    container.appendChild(clone);
    if(orig){
      try { orig.style.visibility = 'hidden'; orig.setAttribute(HIDDEN_ATTR, '1'); } catch(e){}
    }
    return clone;
  }

  // fav sync
  var favObserver = null;
  function syncFav(clone, orig){
    if(!clone || !orig) return;
    var pressed = orig.getAttribute && orig.getAttribute('aria-pressed') === 'true';
    var span = clone.querySelector('.btn-icon');
    if(span) span.textContent = pressed ? '♥' : '♡';
    if(pressed) clone.classList.add('frc-pressed'); else clone.classList.remove('frc-pressed');
  }
  function observeFav(orig, clone){
    if(!orig || !clone) return;
    if(favObserver){ try{ favObserver.disconnect(); } catch(e){} favObserver = null; }
    favObserver = new MutationObserver(function(){ syncFav(clone, orig); });
    try { favObserver.observe(orig, { attributes:true, attributeFilter:['aria-pressed','class'] }); } catch(e) {}
  }

  // create clone wrapper (idempotent)
  function createCloneForWrapper(orig, id, container){
    try { return createCloneFor(orig, id, container); } catch(e){ console.warn('[FloatingControlsV13] createCloneFor error', e); return null; }
  }

  // ensure container
  function ensureContainer(){
    try {
      removeLegacyContainers();
      injCSS();
      var card = document.querySelector('.frase-card');
      if(!card) return null;
      var c = document.getElementById(CONTAINER_ID);
      if(!c){
        c = document.createElement('div'); c.id = CONTAINER_ID;
        c.setAttribute(MANAGED_FLAG, '1');
        c.style.position = 'absolute';
        c.style.right = '12px';
        c.style.top = '50%';
        c.style.transform = 'translateY(-50%)';
        c.style.display = 'flex';
        c.style.flexDirection = 'column';
        c.style.gap = '12px';
        c.style.alignItems = 'center';
        c.style.justifyContent = 'center';
        c.style.zIndex = '2147483000';
        try { var cs = window.getComputedStyle(card); if(cs.position === 'static') card.style.position = 'relative'; } catch(e){}
        card.appendChild(c);
      } else {
        c.setAttribute(MANAGED_FLAG, '1');
        c.style.position = 'absolute';
        c.style.right = '12px';
        c.style.top = '50%';
        c.style.transform = 'translateY(-50%)';
        c.style.display = 'flex';
        c.style.flexDirection = 'column';
        c.style.gap = '12px';
        c.style.alignItems = 'center';
        c.style.justifyContent = 'center';
        c.style.zIndex = '2147483000';
        if(c.parentElement !== card){ c.parentNode && c.parentNode.removeChild(c); card.appendChild(c); }
      }
      return c;
    } catch(e){ console.warn('[FloatingControlsV13] ensureContainer error', e); return null; }
  }

  // apply / restore / safeApply
  function apply(){
    try {
      var container = ensureContainer();
      if(!container) return { ok:false, reason:'no-card' };
      injCSS();
      installSpeakOverride();
      var created = [];
      IDS.forEach(function(id){
        var orig = findOriginal(id);
        if(!orig && id !== 'downloadBtn'){ log('original missing for', id, '- skipping'); return; }
        try {
          var clone = createCloneForWrapper(orig, id, container);
          if(clone) created.push(id);
          if(id === 'favBtn' && clone && orig){ syncFav(clone, orig); observeFav(orig, clone); }
          if(id === 'ttsBtn' && orig && !orig._frc_marker_attached){ try{ orig.addEventListener('click', function(){ markForceRead(1800); }, { passive:true }); orig._frc_marker_attached = true; } catch(e){} }
        } catch(e){ console.warn('[FloatingControlsV13] create clone error', id, e); }
      });
      log('apply created', created);
      return { ok:true, created: created };
    } catch(e){ console.error('[FloatingControlsV13] apply error', e); return { ok:false, error: String(e) }; }
  }

  function restore(){
    try {
      var c = document.getElementById(CONTAINER_ID);
      if(c && c.parentNode) c.parentNode.removeChild(c);
      ['ttsBtn','favBtn','downloadBtn','shareBtn'].forEach(function(id){
        var o = findOriginal(id);
        if(o && o.getAttribute(HIDDEN_ATTR) === '1'){ try{ o.style.visibility = ''; o.removeAttribute(HIDDEN_ATTR); } catch(e){} }
      });
      window._frc_force_read_visible = 0;
      log('restore done');
      return { ok:true };
    } catch(e){ return { ok:false, error: String(e) }; }
  }

  function safeApply(){
    try { removeLegacyContainers(); return apply(); } catch(e){ return { ok:false, error: String(e) }; }
  }

  // expose API
  window.FloatingControlsFinal = window.FloatingControlsFinal || {};
  window.FloatingControlsFinal.apply = apply;
  window.FloatingControlsFinal.restore = restore;
  window.FloatingControlsFinal.safeApply = safeApply;
  window.FloatingControlsFinal.__debug = { getBestVisibleText: getBestVisibleText, removeLegacyContainers: removeLegacyContainers, snapshotFavoriteCandidates: snapshotFavoriteCandidates };

  // auto apply short delay
  setTimeout(function(){ try { var r = safeApply(); console.log('[FloatingControlsV13] auto safeApply ->', r); } catch(e){ console.warn('[FloatingControlsV13] auto apply failed', e); } }, 120);

  log('FloatingControlsV13 loaded');
})();
