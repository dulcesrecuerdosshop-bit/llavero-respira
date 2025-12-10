// favorites-interceptor-final.js
// v1.0 - Finalized favorites interceptor & fixes:
// - Ensures the phrase saved is exactly the visible phrase on the card (overrides toggleFavorite).
// - Prevents duplicate modals by overriding showFavoritesModal and actively removing the original modal (_lr_fav_modal)
//   if the app creates it (MutationObserver).
// - Keeps the visual modal we designed (single instance, paging, load-more, copy/delete working).
// - Idempotent: safe to load multiple times; exposes window.FavoritesInterceptorFinal API.
// - Install: replace previous interceptor file with this one and include in index.html (defer) or paste into console.
//
// Key design decisions:
// - We override global toggleFavorite (if present) to force using the visible phrase text. This guarantees what is saved.
// - We override showFavoritesModal to open our modal. We still keep a reference to the original as _orig_showFavoritesModal,
//   but we never call it (we block original UI to avoid duplication).
// - We observe DOM additions and remove original modal elements (_lr_fav_modal) immediately if created by app code.
//
// Usage / testing:
// 1) Add this file to /js and <script src="/js/favorites-interceptor-final.js" defer></script> in index.html (before </body>).
// 2) Reload page. Save a favorite (heart). Open Favoritos (menu). Check localStorage.getItem('lr_favoritos_v1') contains the visible phrase.
// 3) Reload and verify persistence and that only one modal appears (our styled modal).
//
// NOTE: If you want me to submit this directly to the repo and open a PR, tell me the target branch and I will prepare the PR.

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
  var ORIGINAL_MODAL_ID = '_lr_fav_modal';      // id used by original helpers
  var MODAL_ID = '_fi_fav_modal_final';
  var BOX_ID = '_fi_fav_box_final';
  var STYLE_ID = '_fi_fav_style_final';
  var PAGE_SIZE = 6;
  var LOAD_MORE_TEXT = 'Cargar más';

  // --- CSS (kept compact / similar to previous design) ---
  var CSS = '\
  #' + MODAL_ID + ' { position: fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(2,8,12,0.45); z-index:19999; padding:12px; }\
  #' + BOX_ID + ' { width: min(720px,94%); max-height: 70vh; overflow:auto; background: linear-gradient(180deg,#ffffff,#fbfbfc); border-radius:12px; padding:18px; box-shadow:0 22px 68px rgba(2,10,18,0.18); border:1px solid rgba(6,20,20,0.04); color:#072b2a; }\
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

  // --- Utilities ---
  function injectStyle(){
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function safeParse(s){
    try { return JSON.parse(s); } catch(e){ return null; }
  }

  // Visible phrase extraction: prefer #frase-text or .frase-text; fallback to largest text block in .frase-card
  function getVisiblePhraseText(){
    try {
      var node = document.getElementById('frase-text') || document.querySelector('.frase-text');
      if (node && (node.textContent||'').trim().length) return node.textContent.trim();
      var card = document.querySelector('.frase-card') || document.getElementById('frase-card');
      if (!card) return '';
      var candidates = Array.from(card.querySelectorAll('p,div,span,blockquote,h1,h2,h3')).filter(function(el){
        try { if(el.closest && el.closest('.frase-controls')) return false; return (el.textContent||'').trim().length > 6; } catch(e){ return false; }
      });
      if (candidates.length){
        candidates.sort(function(a,b){
          try {
            var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            return (rb.width*rb.height) - (ra.width*ra.height);
          } catch(e){ return 0; }
        });
        return (candidates[0].textContent || '').trim();
      }
      return '';
    } catch(e){ return ''; }
  }

  // Storage helpers (same key as app)
  function readFavorites(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY_FAVS);
      if(!raw) return [];
      var arr = safeParse(raw);
      return Array.isArray(arr) ? arr.slice(0) : [];
    } catch(e){ return []; }
  }
  function writeFavorites(arr){
    try { if(!Array.isArray(arr)) return; localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(arr.slice(0,200))); } catch(e){}
  }

  // Read history map for ordering
  function readHistoryMap(){
    var map = new Map();
    try {
      var raw = localStorage.getItem(STORAGE_KEY_HISTORY);
      if(!raw) return map;
      var arr = safeParse(raw);
      if(!Array.isArray(arr)) return map;
      arr.forEach(function(it){
        try {
          var text = (it && (it.text || it.phrase || it.t)) || '';
          var at = (it && (it.at || it.time || it.timestamp)) || 0;
          if(!text) return;
          var ts = Number(at) || (at ? new Date(at).getTime() : 0) || 0;
          if(!map.has(text) || (ts && ts > map.get(text))) map.set(text, ts);
        } catch(e){}
      });
    } catch(e){}
    return map;
  }
  function sortFavoritesByRecency(favs){
    var map = readHistoryMap();
    var indexed = favs.map(function(t,i){ return { t, i, ts: map.has(t) ? map.get(t) : 0 }; });
    indexed.sort(function(a,b){ if(a.ts === b.ts) return a.i - b.i; return b.ts - a.ts; });
    return indexed.map(x=>x.t);
  }

  // --- Modal UI (single instance) ---
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
        else {
          var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
        if(typeof window.showToast === 'function') window.showToast('Copiado');
        else uiTempFeedback(copyBtn, 'Copiado');
      } catch(e){ uiTempFeedback(copyBtn, 'Copiar'); }
    });

    delBtn.addEventListener('click', function(ev){
      ev && ev.stopPropagation && ev.stopPropagation();
      var favs = readFavorites();
      var idx = favs.indexOf(text);
      if(idx === -1){
        // tolerant match (collapse whitespace)
        var target = normalize(text);
        idx = favs.findIndex(function(f){ return normalize(f) === target; });
      }
      if(idx !== -1){
        favs.splice(idx,1);
        writeFavorites(favs);
        // refresh local array and UI
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
    // clicking item also copies
    item.addEventListener('click', function(){ copyBtn.click(); }, { passive:true });

    return item;
  }

  function uiTempFeedback(btn, msg){
    try {
      var prev = btn.innerText;
      btn.innerText = msg;
      btn.disabled = true;
      setTimeout(function(){ btn.innerText = prev; btn.disabled = false; }, 900);
    } catch(e){}
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
    // load area
    var loadArea = box.querySelector('.fav-load');
    if(!loadArea){
      loadArea = document.createElement('div'); loadArea.className = 'fav-load';
      box.appendChild(loadArea);
    }
    loadArea.innerHTML = '';
    var totalPages = Math.ceil(_sortedFavs.length / PAGE_SIZE);
    if(_currentPage + 1 < totalPages){
      var btn = document.createElement('button'); btn.textContent = LOAD_MORE_TEXT;
      btn.addEventListener('click', function(){ _currentPage++; renderModalPage(_currentPage, false); });
      loadArea.appendChild(btn);
    }
    // infinite scroll attach once
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
    // remove original modal if present
    try {
      var orig = document.getElementById(ORIGINAL_MODAL_ID);
      if(orig) { orig.parentNode && orig.parentNode.removeChild(orig); }
    } catch(e){}
    // avoid duplicate
    if(document.getElementById(MODAL_ID)) return;
    // load data
    var favs = readFavorites();
    _sortedFavs = sortFavoritesByRecency(favs);
    _currentPage = 0;
    // build
    var modal = document.createElement('div'); modal.id = MODAL_ID;
    Object.assign(modal.style, { position:'fixed', left:0, right:0, top:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(2,8,12,0.45)', zIndex:19999, padding:'12px' });
    var box = document.createElement('div'); box.id = BOX_ID;
    // header
    var header = document.createElement('div'); header.className = 'fav-header';
    var title = document.createElement('div'); title.className = 'fav-title'; title.textContent = 'Favoritos';
    var closeBtn = document.createElement('button'); closeBtn.className = 'fav-close'; closeBtn.textContent = 'Cerrar';
    closeBtn.addEventListener('click', closeModal, { passive:true });
    header.appendChild(title); header.appendChild(closeBtn);
    box.appendChild(header);
    box.appendChild(document.createElement('hr'));
    modal.appendChild(box);
    document.body.appendChild(modal);
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

  // --- Prevent duplication: override showFavoritesModal and remove original modal when created ---
  function overrideShowFavoritesModal(){
    try { if(window._orig_showFavoritesModal_saved) return; } catch(e){}
    try {
      window._orig_showFavoritesModal_saved = window.showFavoritesModal;
    } catch(e){}
    try {
      window.showFavoritesModal = function(){
        // Block original: always open our modal instead
        try { openModal(); return true; } catch(e){ return false; }
      };
    } catch(e){}
  }

  // MutationObserver to remove any original modal element created by the app (race condition safety)
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

  // --- Ensure saved phrase is the visible one: override toggleFavorite if present ---
  function overrideToggleFavorite(){
    try {
      if(window._orig_toggleFavorite_saved) return;
      if(typeof window.toggleFavorite === 'function'){
        window._orig_toggleFavorite_saved = window.toggleFavorite;
        window.toggleFavorite = function(text){
          try {
            var actual = getVisiblePhraseText();
            if(!actual) return false;
            return window._orig_toggleFavorite_saved(actual);
          } catch(e){
            try { return window._orig_toggleFavorite_saved(text); } catch(ex){ return false; }
          }
        };
        console.debug('[FavoritesInterceptorFinal] toggleFavorite overridden to use visible phrase');
        return;
      }
      var tries = 0;
      var iid = setInterval(function(){
        tries++;
        if(typeof window.toggleFavorite === 'function'){
          clearInterval(iid);
          try {
            window._orig_toggleFavorite_saved = window.toggleFavorite;
            window.toggleFavorite = function(text){
              try {
                var actual = getVisiblePhraseText();
                if(!actual) return false;
                return window._orig_toggleFavorite_saved(actual);
              } catch(e){
                try { return window._orig_toggleFavorite_saved(text); } catch(ex){ return false; }
              }
            };
            console.debug('[FavoritesInterceptorFinal] toggleFavorite overridden after wait');
          } catch(e){ clearInterval(iid); }
        } else if(tries > 25){
          clearInterval(iid);
        }
      }, 120);
    } catch(e){}
  }

  // Intercept menu clicks (capture) to open our modal and stop propagation
  function menuClickInterceptor(ev){
    try {
      var btn = ev.target && ev.target.closest ? ev.target.closest('button, a, [data-action]') : null;
      if(!btn) return;
      var da = (btn.getAttribute && btn.getAttribute('data-action')) || '';
      var isShowFav = (btn.id === 'showFavs_menu') || (da && da.toLowerCase().indexOf('show-fav') !== -1) || ((btn.textContent||'').toLowerCase().indexOf('favorit') !== -1 && btn.closest && btn.closest('#menuPanel'));
      if(!isShowFav) return;
      try { if(ev.preventDefault) ev.preventDefault(); } catch(e){}
      try { if(ev.stopImmediatePropagation) ev.stopImmediatePropagation(); else if(ev.stopPropagation) ev.stopPropagation(); } catch(e){}
      openModal();
    } catch(e){}
  }

  // Attach capturing listeners and initial overrides
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

  // Public API
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
  setTimeout(function(){ injectStyle(); attachAll(); console.debug('[FavoritesInterceptorFinal] initialized'); }, 80);

})();
