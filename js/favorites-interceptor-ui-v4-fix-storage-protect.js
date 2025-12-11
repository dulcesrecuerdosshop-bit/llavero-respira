// favorites-interceptor-ui-v4-fix-storage-protect.js
// v4.1 - Fix: correctly read the phrase actually shown on screen (handles NameInjector / phrases transforms)
// - Improved getVisiblePhraseText(): prefers the element injected/transformed by NameInjector (data-name-injector-*),
//   falls back to #frase-text/.frase-text, then to window._phrases_current, then to largest text block in .frase-card.
// - Adds a small conservative delay when reading the DOM if a transformation might be in-flight.
// - Keeps previous behavior: overrides toggleFavorite to force using visible phrase, overrides showFavoritesModal,
//   removes original modal DOM to avoid duplicates, and preserves the designed modal UI.
// - Replace existing js/favorites-interceptor-final.js with this file (or upload and reference from index.html).
// - Test: reload, change phrase, press heart, check localStorage.getItem('lr_favoritos_v1') equals the visible phrase.

(function(){
  'use strict';

  if (window._favorites_interceptor_final_loaded) {
    console.debug('[FavoritesInterceptorFinal] already loaded');
    return;
  }
  window._favorites_interceptor_final_loaded = true;

  // CONFIG
  var STORAGE_KEY_FAVS = 'lr_favoritos_v1';
  var STORAGE_KEY_HISTORY = 'lr_historial_v1';
  var ORIGINAL_MODAL_ID = '_lr_fav_modal';
  var MODAL_ID = '_fi_fav_modal_final';
  var BOX_ID = '_fi_fav_box_final';
  var STYLE_ID = '_fi_fav_style_final';
  var PAGE_SIZE = 6;
  var LOAD_MORE_TEXT = 'Cargar más';

  // CSS (same as before)
  var CSS = '\
  #' + MODAL_ID + ' { position: fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(2,8,12,0.45); z-index:19999; padding:12px; }\
  #' + BOX_ID + ' { width: min(720px,94%); max-height: 70vh; overflow:auto; background: linear-gradient(180deg,#ffffff,#fbfbfc); border-radius:12px; padding:18px; box-shadow:0 22px 68px rgba(2,10,18,0[...]
  #' + BOX_ID + ' .fav-header{ display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; }\
  #' + BOX_ID + ' .fav-title{ font-weight:800; font-size:1.15rem; }\
  #' + BOX_ID + ' .fav-close{ background:transparent; border:1px solid rgba(2,10,12,0.06); padding:6px 10px; border-radius:8px; cursor:pointer; }\
  #' + BOX_ID + ' .fav-list{ display:flex; flex-direction:column; gap:12px; }\
  #' + BOX_ID + ' .fav-item{ background: linear-gradient(180deg, #ffffff, #fffdfd); border-radius:12px; padding:12px; box-shadow: 0 8px 22px rgba(2,10,18,0.05); border:1px solid rgba(6,20,20,0.03); }\
  #' + BOX_ID + ' .fav-text{ font-weight:700; color:#072b2a; line-height:1.45; white-space:pre-wrap; }\
  #' + BOX_ID + ' .fav-meta{ display:flex; justify-content:space-between; align-items:center; margin-top:8px; }\
  #' + BOX_ID + ' .fav-actions{ display:flex; gap:8px; }\
  #' + BOX_ID + ' .fav-btn{ padding:8px 12px; border-radius:10px; border:0; cursor:pointer; font-weight:800; color:#072b2a; background: linear-gradient(90deg,#ffb88c,#ff6b6b); }\
  #' + BOX_ID + ' .fav-del{ padding:8px 12px; border-radius:10px; border:1px solid rgba(2,10,12,0.06); background:transparent; cursor:pointer; }\
  #' + BOX_ID + ' .fav-load{ text-align:center; margin-top:10px }\
  #' + BOX_ID + ' .fav-load button{ padding:8px 12px; border-radius:10px; border:0; background:#fff; box-shadow:0 6px 18px rgba(2,10,12,0.04); cursor:pointer }\
  @media (max-width:520px){ #' + BOX_ID + '{ width:96%; padding:12px } }\
  ';

  function injectStyle(){
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function safeParse(s){ try { return JSON.parse(s); } catch(e){ return null; } }

  // ---------- Improved visible phrase extraction ----------
  // Logic:
  // 1) Prefer NameInjector-marked element: [data-name-injector-applied] or element with data-name-injector-name (use attribute if available).
  // 2) Then #frase-text or .frase-text (most common).
  // 3) Then window._phrases_current (internal phrases.js state) if present.
  // 4) Then largest text block inside .frase-card (fallback).
  // 5) Use small micro-delay to allow NameInjector or other transforms to complete (if requested).
  function getVisiblePhraseTextSync(){
    try {
      // 1) NameInjector-marked element (explicit attributes)
      var niEl = document.querySelector('[data-name-injector-applied], [data-name-injector-name], [data-name-injector-original]');
      if(niEl){
        // if NameInjector stored explicit name attribute, prefer it
        var nameAttr = niEl.getAttribute && (niEl.getAttribute('data-name-injector-name') || niEl.getAttribute('data-name-injector-original') || niEl.getAttribute('data-name-injector-applied'));
        if(nameAttr && String(nameAttr).trim().length) return String(nameAttr).trim();
        var txtNi = (niEl.textContent || '').trim();
        if(txtNi.length) return txtNi;
      }

      // 2) direct frase text element
      var el = document.getElementById('frase-text') || document.querySelector('.frase-text') || document.querySelector('.frase');
      if(el && (el.textContent||'').trim().length) return el.textContent.trim();

      // 3) phrases.js internal current phrase
      if(window._phrases_current && typeof window._phrases_current === 'string' && window._phrases_current.trim().length) return window._phrases_current.trim();
      // Some implementations keep object
      if(window._phrases_current && typeof window._phrases_current === 'object' && window._phrases_current.phrase) return String(window._phrases_current.phrase).trim();

      // 4) NameInjector possible stored runtime name in a global read (NameInjector might set runtime name)
      try {
        if(window.NameInjector && typeof window.NameInjector.getRuntimeName === 'function'){
          var n = window.NameInjector.getRuntimeName();
          if(n && String(n).trim()) return String(n).trim();
        }
      } catch(e){}

      // 5) fallback: find largest textual block inside frase-card (exclude controls)
      var card = document.querySelector('.frase-card') || document.getElementById('frase-card');
      if(card){
        var candidates = Array.from(card.querySelectorAll('p,div,span,blockquote,h1,h2,h3')).filter(function(elm){
          try { if(elm.closest && elm.closest('.frase-controls')) return false; return (elm.textContent||'').trim().length > 3; } catch(e){ return false; }
        });
        if(candidates.length){
          candidates.sort(function(a,b){
            try { var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (rb.width*rb.height) - (ra.width*ra.height); } catch(e){ return 0; }
          });
          return (candidates[0].textContent || '').trim();
        }
      }

      return '';
    } catch(e){
      console.warn('[FavoritesInterceptorFinal] getVisiblePhraseTextSync error', e);
      return '';
    }
  }

  // Async getter with tiny delay to allow NameInjector/transforms to finish in-flight
  function getVisiblePhraseText(callback, timeoutMs){
    timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 80;
    try {
      // If NameInjector or showing logic likely immediate, try sync first
      var txt = getVisiblePhraseTextSync();
      if(txt && txt.length) {
        if(callback) return callback(txt);
        return txt;
      }
      // else schedule a short defer and re-read
      setTimeout(function(){
        try {
          var t2 = getVisiblePhraseTextSync();
          if(callback) return callback(t2 || '');
        } catch(e){ if(callback) callback(''); }
      }, timeoutMs);
      // return empty if no callback provided (not ideal)
      if(!callback) return '';
    } catch(e){
      if(callback) callback('');
      return '';
    }
  }

  // Storage helpers
  function readFavorites(){ try { var raw = localStorage.getItem(STORAGE_KEY_FAVS); if(!raw) return []; var arr = safeParse(raw); return Array.isArray(arr)? arr.slice(0) : []; } catch(e){ return []; }[...]
  function writeFavorites(arr){ try { if(!Array.isArray(arr)) return; localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(arr.slice(0,200))); } catch(e){} }

  // Ordering helpers (history)
  function readHistoryMap(){ var map = new Map(); try { var raw = localStorage.getItem(STORAGE_KEY_HISTORY); if(!raw) return map; var arr = safeParse(raw); if(!Array.isArray(arr)) return map; arr.forE[...]
  function sortFavoritesByRecency(favs){ var map = readHistoryMap(); var indexed = favs.map(function(t,i){ return { t, i, ts: map.has(t) ? map.get(t) : 0 }; }); indexed.sort(function(a,b){ if(a.ts ===[...]
  // UI modal code (same as previous finalized version)
  var _sortedFavs = [];
  var _currentPage = 0;
  var _modal = null;
  var _loadBtn = null;
  var _scrollHandler = null;

  function buildItemNode(text){
    var item = document.createElement('div'); item.className = 'fav-item';
    var t = document.createElement('div'); t.className = 'fav-text'; t.textContent = text;
    var meta = document.createElement('div'); meta.className = 'fav-meta';
    var actions = document.createElement('div'); actions.className = 'fav-actions';
    var copyBtn = document.createElement('button'); copyBtn.className = 'fav-btn'; copyBtn.textContent = 'Copiar';
    var delBtn = document.createElement('button'); delBtn.className = 'fav-del'; delBtn.textContent = 'Eliminar';

    copyBtn.addEventListener('click', async function(ev){
      ev && ev.stopPropagation && ev.stopPropagation();
      try {
        if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(text); }
        else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
        if(typeof window.showToast === 'function') window.showToast('Copiado'); else uiTempFeedback(copyBtn, 'Copiado');
      } catch(e){ uiTempFeedback(copyBtn, 'Copiar'); }
    });

    delBtn.addEventListener('click', function(ev){
      ev && ev.stopPropagation && ev.stopPropagation();
      var favs = readFavorites();
      var idx = favs.indexOf(text);
      if(idx === -1){
        var target = normalize(text);
        idx = favs.findIndex(function(f){ return normalize(f) === target; });
      }
      if(idx !== -1){
        favs.splice(idx,1);
        writeFavorites(favs);
        _sortedFavs = _sortedFavs.filter(function(f){ return normalize(f) !== normalize(text); });
        var totalPages = Math.ceil(_sortedFavs.length / PAGE_SIZE);
        if(_currentPage >= totalPages) _currentPage = Math.max(0, totalPages - 1);
        renderModalPage(_currentPage, true);
        if(typeof window.showToast === 'function') window.showToast('Eliminado');
      }
    });

    actions.appendChild(copyBtn); actions.appendChild(delBtn);
    meta.appendChild(actions);
    item.appendChild(t); item.appendChild(meta);
    item.addEventListener('click', function(){ copyBtn.click(); }, { passive:true });
    return item;
  }

  function uiTempFeedback(btn, msg){
    try { var prev = btn.innerText; btn.innerText = msg; btn.disabled = true; setTimeout(function(){ btn.innerText = prev; btn.disabled = false; }, 900); } catch(e){}
  }
  function normalize(s){ try { return (s||'').toString().trim().replace(/\s+/g,' '); } catch(e){ return String(s||'').trim(); } }

  function renderModalPage(pageIndex, preserveScroll){
    if(!_modal) return;
    var box = document.getElementById(BOX_ID);
    if(!box) return;
    var list = box.querySelector('.fav-list');
    if(!list){ list = document.createElement('div'); list.className = 'fav-list'; box.appendChild(list); }
    var prevScroll = preserveScroll ? box.scrollTop : 0;
    if(pageIndex <= 0){
      list.innerHTML = '';
      _currentPage = 0;
      var slice = _sortedFavs.slice(0, PAGE_SIZE);
      slice.forEach(function(t){ list.appendChild(buildItemNode(t)); });
    } else {
      var start = pageIndex * PAGE_SIZE, end = start + PAGE_SIZE;
      var slice2 = _sortedFavs.slice(start, end);
      slice2.forEach(function(t){ list.appendChild(buildItemNode(t)); });
    }
    var loadArea = box.querySelector('.fav-load');
    if(!loadArea){ loadArea = document.createElement('div'); loadArea.className = 'fav-load'; box.appendChild(loadArea); }
    loadArea.innerHTML = '';
    var totalPages = Math.ceil(_sortedFavs.length / PAGE_SIZE);
    if(_currentPage + 1 < totalPages){
      var btn = document.createElement('button'); btn.textContent = LOAD_MORE_TEXT;
      btn.addEventListener('click', function(){ _currentPage++; renderModalPage(_currentPage, false); });
      loadArea.appendChild(btn);
    }
    if(!_scrollHandler){
      _scrollHandler = function(){
        try {
          var threshold = 120;
          if(box.scrollHeight - (box.scrollTop + box.clientHeight) < threshold){
            var total = Math.ceil(_sortedFavs.length / PAGE_SIZE);
            if(_currentPage + 1 < total){ _currentPage++; renderModalPage(_currentPage, false); }
          }
        } catch(e){}
      };
      box.addEventListener('scroll', _scrollHandler, { passive:true });
    }
    if(preserveScroll) box.scrollTop = prevScroll;
  }

  function openModal(){
    injectStyle();
    try { var orig = document.getElementById(ORIGINAL_MODAL_ID); if(orig) { orig.parentNode && orig.parentNode.removeChild(orig); } } catch(e){}
    if(document.getElementById(MODAL_ID)) return;
    var favs = readFavorites();
    // <-- Only change here: ensure UI shows newest first by reversing the sorted array
   _sortedFavs = sortFavoritesByRecency(favs).slice();
    _currentPage = 0;
    var modal = document.createElement('div'); modal.id = MODAL_ID;
    Object.assign(modal.style, { position:'fixed', left:0, right:0, top:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(2,8,12,0.45)', zIndex:19999, padding[...]
    var box = document.createElement('div'); box.id = BOX_ID;
    var header = document.createElement('div'); header.className = 'fav-header';
    var title = document.createElement('div'); title.className = 'fav-title'; title.textContent = 'Favoritos';
    var closeBtn = document.createElement('button'); closeBtn.className = 'fav-close'; closeBtn.textContent = 'Cerrar';
    closeBtn.addEventListener('click', closeModal, { passive:true });
    header.appendChild(title); header.appendChild(closeBtn);
    box.appendChild(header); box.appendChild(document.createElement('hr'));
    modal.appendChild(box); document.body.appendChild(modal);
    modal._keyHandler = function(e){ if(e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', modal._keyHandler, { passive:true });
    _modal = modal;
    renderModalPage(0, false);
  }

  function closeModal(){
    try {
      var m = document.getElementById(MODAL_ID);
      if(!m) return;
      if(m._keyHandler) document.removeEventListener('keydown', m._keyHandler);
      var box = document.getElementById(BOX_ID);
      if(box && _scrollHandler) box.removeEventListener('scroll', _scrollHandler);
      m.parentNode && m.parentNode.removeChild(m);
      _modal = null; _loadBtn = null; _scrollHandler = null;
    } catch(e){}
  }

  // Override showFavoritesModal (prevent original UI) and remove original modal if created
  function overrideShowFavoritesModal(){
    try { if(window._orig_showFavoritesModal_saved) return; } catch(e){}
    try { window._orig_showFavoritesModal_saved = window.showFavoritesModal; } catch(e){}
    try {
      window.showFavoritesModal = function(){ try { openModal(); return true; } catch(e){ return false; } };
    } catch(e){}
  }

  var _origModalObserver = null;
  function startOrigModalRemover(){
    try {
      if(_origModalObserver) return;
      _origModalObserver = new MutationObserver(function(muts){
        muts.forEach(function(m){
          if(m.addedNodes && m.addedNodes.length){
            Array.from(m.addedNodes).forEach(function(n){
              try {
                if(n && n.id === ORIGINAL_MODAL_ID){
                  console.debug('[FavoritesInterceptorFinal] removing original modal created by app');
                  n.parentNode && n.parentNode.removeChild(n);
                } else if(n && n.querySelector && n.querySelector('#' + ORIGINAL_MODAL_ID)){
                  var inner = n.querySelector('#' + ORIGINAL_MODAL_ID);
                  inner && inner.parentNode && inner.parentNode.removeChild(inner);
                }
              } catch(e){}
            });
          }
        });
      });
      _origModalObserver.observe(document.body, { childList:true, subtree:true });
    } catch(e){}
  }

  // Override toggleFavorite to use visible phrase (async safe)
  function overrideToggleFavorite(){
    try {
      if(window._orig_toggleFavorite_saved) return;
      if(typeof window.toggleFavorite === 'function'){
        window._orig_toggleFavorite_saved = window.toggleFavorite;
        window.toggleFavorite = function(text){
          try {
            // Synchronously attempt to read visible phrase; if empty, try async with short delay
            var actual = getVisiblePhraseTextSyncSafe();
            if(actual) return window._orig_toggleFavorite_saved(actual);
            // fallback: attempt async read with callback then call original
            getVisiblePhraseText(function(result){
              try {
                if(result && result.length) window._orig_toggleFavorite_saved(result);
                else window._orig_toggleFavorite_saved(text);
              } catch(e){}
            }, 120);
            return true;
          } catch(e){ try { return window._orig_toggleFavorite_saved(text); } catch(ex){ return false; } }
        };
        console.debug('[FavoritesInterceptorFinal] toggleFavorite overridden to use visible phrase');
        return;
      }
      var tries = 0;
      var iid = setInterval(function(){
        tries++;
        if(typeof window.toggleFavorite === 'function'){
          clearInterval(iid);
          overrideToggleFavorite();
        } else if(tries > 25) { clearInterval(iid); }
      }, 120);
    } catch(e){}
  }

  // Helper that tries sync then very-small fallback read to ensure NameInjector finishes
  function getVisiblePhraseTextSyncSafe(){
    var txt = getVisiblePhraseTextSync();
    if(txt && txt.length) return txt;
    // if empty, try synchronous checks for known globals
    if(window._phrases_current && typeof window._phrases_current === 'string') return window._phrases_current.trim();
    return '';
  }

  // menu click interception
  function menuClickInterceptor(ev){
    try {
      var btn = ev.target && ev.target.closest ? ev.target.closest('button, a, [data-action]') : null;
      if(!btn) return;
      var da = (btn.getAttribute && btn.getAttribute('data-action')) || '';
      var isShowFav = (btn.id === 'showFavs_menu') || (da && da.toLowerCase().indexOf('show-fav') !== -1) || ((btn.textContent||'').toLowerCase().indexOf('favorit') !== -1 && btn.closest && btn.closes[...]
      if(!isShowFav) return;
      try { if(ev.preventDefault) ev.preventDefault(); } catch(e){}
      try { if(ev.stopImmediatePropagation) ev.stopImmediatePropagation(); else if(ev.stopPropagation) ev.stopPropagation(); } catch(e){}
      openModal();
    } catch(e){}
  }

  function attachAll(){
    try {
      document.removeEventListener('click', menuClickInterceptor, true);
      document.addEventListener('click', menuClickInterceptor, true);
      try { document.removeEventListener('pointerup', menuClickInterceptor, true); } catch(e){}
      document.addEventListener('pointerup', menuClickInterceptor, true);
    } catch(e){}
    overrideShowFavoritesModal();
    startOrigModalRemover();
    overrideToggleFavorite();
  }

  // API
  window.FavoritesInterceptorFinal = window.FavoritesInterceptorFinal || {};
  window.FavoritesInterceptorFinal.open = openModal;
  window.FavoritesInterceptorFinal.close = closeModal;
  window.FavoritesInterceptorFinal.restore = function(){
    try {
      if(window._orig_showFavoritesModal_saved) window.showFavoritesModal = window._orig_showFavoritesModal_saved;
      if(window._orig_toggleFavorite_saved) window.toggleFavorite = window._orig_toggleFavorite_saved;
      try { if(_origModalObserver){ _origModalObserver.disconnect(); _origModalObserver = null; } } catch(e){}
      closeModal();
      try { document.removeEventListener('click', menuClickInterceptor, true); } catch(e){}
      try { document.removeEventListener('pointerup', menuClickInterceptor, true); } catch(e){}
      var s = document.getElementById(STYLE_ID); if(s && s.parentNode) s.parentNode.removeChild(s);
      window._favorites_interceptor_final_loaded = false;
      return true;
    } catch(e){ return false; }
  };

  // init
  setTimeout(function(){ injectStyle(); attachAll(); console.debug('[FavoritesInterceptorFinal] initialized (v1.1)'); }, 80);

})();
