// favorites-interceptor-ui-v4-fix-storage-protect.js
// v4.3 emergency — verbose, robust, visual indicator
(function(){
  'use strict';
  if(window._favorites_interceptor_v4_loaded && !window.FavoritesInterceptorV4_forceReload) {
    console.debug('[FavoritesInterceptorV4] already loaded'); return;
  }
  window._favorites_interceptor_v4_loaded = true;
  window.FavoritesInterceptorV4_forceReload = true; // allow iterative testing

  const STORAGE_KEY_FAVS = 'lr_favoritos_v1';
  const STORAGE_KEY_BACKUP = '_lr_favoritos_backup_v1';
  const STORAGE_KEY_HISTORY = 'lr_historial_v1';
  const STYLE_ID = '_fi_fav_style_v4';
  const MODAL_ID = '_fi_fav_modal_v4';
  const BOX_ID = '_fi_fav_box_v4';
  const PAGE_SIZE = 6;
  const LOAD_MORE_TEXT = 'Cargar más';
  const ORIGINAL_MODAL_ID = '_lr_fav_modal';

  // Basic CSS (ensures visible UI). If overwritten, we reapply periodically.
  const CSS = `
  /* FIv4 emergency CSS */
  #${MODAL_ID}{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,8,12,0.45);z-index:2147483000;padding:14px}
  #${BOX_ID}{width:min(700px,94%);max-height:76vh;overflow:auto;background:#fff;border-radius:12px;padding:16px;box-shadow:0 22px 68px rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.04);color:#072b2a}
  #${BOX_ID} .fi-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  #${BOX_ID} .fi-title{font-weight:800;font-size:1.05rem}
  #${BOX_ID} .fi-close{padding:6px 10px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:transparent;cursor:pointer}
  #${BOX_ID} .fi-list{display:flex;flex-direction:column;gap:10px}
  #${BOX_ID} .fi-item{background:linear-gradient(180deg,#fff,#fbfbfb);padding:12px;border-radius:10px;border:1px solid rgba(0,0,0,0.04);box-shadow:0 8px 20px rgba(0,0,0,0.04)}
  #${BOX_ID} .fi-text{font-weight:700;line-height:1.4;white-space:pre-wrap;color:var(--fi-color,#072b2a)}
  #${BOX_ID} .fi-meta{display:flex;justify-content:space-between;align-items:center;margin-top:8px}
  #${BOX_ID} .fi-actions{display:flex;gap:8px}
  #${BOX_ID} .fi-copy,.fi-del{padding:8px 12px;border-radius:10px;cursor:pointer}
  .fi-debug-pill{position:fixed;right:12px;bottom:12px;background:#ffb88c;color:#072b2a;padding:8px 10px;border-radius:999px;font-weight:800;z-index:2147483100;box-shadow:0 8px 20px rgba(0,0,0,0.12)}
  `;

  // small DOM helper
  function $(sel){ try { return document.querySelector(sel); } catch(e){ return null; } }
  function $all(sel){ try { return Array.from(document.querySelectorAll(sel)); } catch(e){ return []; } }

  // inject CSS and ensure it persists
  function ensureStyle(){
    try {
      let s = document.getElementById(STYLE_ID);
      if(!s){
        s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        (document.head || document.documentElement).appendChild(s);
        console.debug('[FavoritesInterceptorV4] style injected');
      } else if(s.textContent !== CSS){
        s.textContent = CSS;
        console.debug('[FavoritesInterceptorV4] style updated');
      }
      return !!s;
    } catch(e){ console.warn('[FavoritesInterceptorV4] ensureStyle err', e); return false; }
  }

  // Visual indicator pill to confirm script loaded
  function ensurePill(){
    try {
      let p = document.getElementById('_fi_debug_pill_v4');
      if(!p){
        p = document.createElement('div');
        p.id = '_fi_debug_pill_v4';
        p.className = 'fi-debug-pill';
        p.textContent = 'FIv4 OK';
        p.title = 'FavoritesInterceptor v4 loaded';
        document.body.appendChild(p);
      }
    } catch(e){}
  }

  // Safe JSON parse
  function safeParse(s){ try { return JSON.parse(s); } catch(e){ return null; } }

  // Storage wrappers & helpers
  (function installBackupWrapper(){
    if(window._fi_storage_backup_installed) return;
    window._fi_storage_backup_installed = true;
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value){
      try {
        if(String(key) === STORAGE_KEY_FAVS){
          try { const prev = this.getItem && this.getItem(key); if(prev != null) origSet.call(this, STORAGE_KEY_BACKUP, String(prev)); } catch(e){}
        }
      } catch(e){}
      return origSet.call(this, key, value);
    };
  })();

  function readFavorites(){ try { const raw = localStorage.getItem(STORAGE_KEY_FAVS); const arr = safeParse(raw); return Array.isArray(arr) ? arr : []; } catch(e){ return []; } }
  function writeFavorites(arr){ try { if(!Array.isArray(arr)) return; localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(arr.slice(0,500))); } catch(e){ console.warn('[FavoritesInterceptorV4] writeFavorites failed', e); } }
  function readHistoryMap(){ const map = new Map(); try { const raw = localStorage.getItem(STORAGE_KEY_HISTORY); const arr = safeParse(raw); if(Array.isArray(arr)){ arr.forEach(function(it){ try { const t = it && (it.text || it.phrase || it.t) || ''; const at = it && (it.at || it.time || it.timestamp) || 0; if(t){ const ts = Number(at) || (at ? new Date(at).getTime() : 0) || 0; if(!map.has(t) || (ts && ts > map.get(t))) map.set(t, ts); } } catch(e){} }); } } catch(e){} return map; }
  function sortByRecency(favs){ try { const map = readHistoryMap(); const idx = favs.map((t,i)=>({t,i,ts: map.has(t)?map.get(t):0})); idx.sort(function(a,b){ if(a.ts===b.ts) return a.i-b.i; return b.ts-a.ts; }); return idx.map(x=>x.t); } catch(e){ return Array.isArray(favs)?favs.slice(0):[]; } }

  // visible phrase detection
  function getVisiblePhrase(){
    try {
      var el = document.getElementById('frase-text') || document.querySelector('.frase-text') || document.querySelector('.frase');
      if(el && el.textContent && el.textContent.trim()) return el.textContent.trim();
      if(window._phrases_current && typeof window._phrases_current === 'string' && window._phrases_current.trim()) return window._phrases_current.trim();
      if(window.NameInjector && typeof window.NameInjector.getRuntimeName === 'function'){ try { var n = window.NameInjector.getRuntimeName(); if(n) return String(n); } catch(e){} }
      // fallback: find biggest block
      var card = document.querySelector('.frase-card') || document.getElementById('frase-card');
      if(card){
        var cand = Array.from(card.querySelectorAll('p,div,span,h1,h2')).filter(function(n){ return n && n.textContent && n.textContent.trim().length > 3; });
        if(cand.length){ cand.sort(function(a,b){ try{ var ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect(); return (rb.width*rb.height)-(ra.width*ra.height); }catch(e){return 0;} }); return cand[0].textContent.trim(); }
      }
      return '';
    } catch(e){ return ''; }
  }

  // override toggleFavorite if exists; also intercept click on heart buttons as fallback
  function overrideToggle(){
    try {
      if(window._fi_orig_toggle_saved) return;
      if(typeof window.toggleFavorite === 'function'){
        window._fi_orig_toggle_saved = window.toggleFavorite;
        window.toggleFavorite = function(text){
          try {
            var v = getVisiblePhrase();
            if(v && v.length) return window._fi_orig_toggle_saved(v);
            return window._fi_orig_toggle_saved(text);
          } catch(e){ try{ return window._fi_orig_toggle_saved(text);}catch(ex){return false;} }
        };
        console.debug('[FavoritesInterceptorV4] toggleFavorite overridden');
      }
    } catch(e){ console.warn('[FavoritesInterceptorV4] overrideToggle err', e); }
    // fallback: intercept click on heart-like buttons (heuristic)
    try {
      const heartSelectorCandidates = ['.fav-btn','button.heart','button[data-action*=\"fav\"]','.frase-controls button','.frase-controls .heart-button','[aria-label*=\"favorit\"]'];
      heartSelectorCandidates.forEach(function(sel){
        try { document.addEventListener('click', function(ev){ var h = ev.target && ev.target.closest && ev.target.closest(sel); if(!h) return; ev.preventDefault && ev.preventDefault(); ev.stopImmediatePropagation && ev.stopImmediatePropagation(); try { var visible = getVisiblePhrase(); if(visible) { // append to storage
              var favs = readFavorites(); if(!favs.includes(visible)) { favs.unshift(visible); writeFavorites(favs); console.debug('[FavoritesInterceptorV4] saved favorite (heart click)', visible); } } } catch(e){} }, true); }catch(e){} });
    } catch(e){}
  }

  // Build modal UI (simple and guaranteed)
  function openModal(){
    try {
      ensureStyle();
      ensurePill();
      // remove original modal if present
      try { var orig = document.getElementById(ORIGINAL_MODAL_ID); if(orig) orig.parentNode && orig.parentNode.removeChild(orig); } catch(e){}
      // remove ours if exists
      try { var old = document.getElementById(MODAL_ID); if(old) old.parentNode && old.parentNode.removeChild(old); } catch(e){}
      var favs = readFavorites(); favs = sortByRecency(favs);
      const modal = document.createElement('div'); modal.id = MODAL_ID; Object.assign(modal.style,{position:'fixed',left:0,right:0,top:0,bottom:0,zIndex:2147483000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(2,8,12,0.45)'} );
      const box = document.createElement('div'); box.id = BOX_ID;
      box.innerHTML = '<div class=\"fi-header\"><div class=\"fi-title\">Favoritos</div><button class=\"fi-close\">Cerrar</button></div><hr/>';
      const list = document.createElement('div'); list.className='fi-list';
      if(!favs || favs.length===0) { const li=document.createElement('div'); li.className='fi-item'; li.innerHTML='<div class=\"fi-text\">No hay favoritos</div>'; list.appendChild(li); }
      favs.forEach(function(text){
        try {
          const item = document.createElement('div'); item.className='fi-item';
          const t = document.createElement('div'); t.className='fi-text'; t.textContent = text;
          const meta = document.createElement('div'); meta.className='fi-meta';
          const actions = document.createElement('div'); actions.className='fi-actions';
          const copy = document.createElement('button'); copy.className='fi-copy'; copy.textContent='Copiar';
          copy.addEventListener('click', async function(e){ e.stopPropagation && e.stopPropagation(); try { await navigator.clipboard.writeText(text); alert('Copiado'); }catch(e){ alert('Copiar falló'); }});
          const del = document.createElement('button'); del.className='fi-del'; del.textContent='Eliminar';
          del.addEventListener('click', function(e){ e.stopPropagation && e.stopPropagation(); try { var cur = readFavorites(); var idx = cur.indexOf(text); if(idx!==-1){ cur.splice(idx,1); writeFavorites(cur); box.querySelector('.fi-list').removeChild(item); } }catch(ex){} });
          actions.appendChild(copy); actions.appendChild(del);
          meta.appendChild(actions);
          item.appendChild(t); item.appendChild(meta);
          list.appendChild(item);
        } catch(e){}
      });
      box.appendChild(list);
      // load more button if needed
      modal.appendChild(box);
      document.body.appendChild(modal);
      box.querySelector('.fi-close').addEventListener('click', function(){ try{ modal.parentNode && modal.parentNode.removeChild(modal); }catch(e){} });
      console.debug('[FavoritesInterceptorV4] modal opened with', favs && favs.length);
    } catch(e){ console.warn('[FavoritesInterceptorV4] openModal err', e); }
  }

  // Expose small API and debug helpers
  window.FavoritesInterceptorV4 = window.FavoritesInterceptorV4 || {};
  window.FavoritesInterceptorV4.version = 'v4.3-emergency';
  window.FavoritesInterceptorV4.open = openModal;
  window.FavoritesInterceptorV4.ensureStyle = ensureStyle;
  window.FavoritesInterceptorV4.ensurePill = ensurePill;
  window.FavoritesInterceptorV4.debugRefresh = function(){ try { ensureStyle(); ensurePill(); openModal(); console.log('FIv4 debugRefresh done'); } catch(e){ console.warn(e); } };

  // init: run once, and ensure style persists
  try { ensureStyle(); ensurePill(); overrideToggle(); console.debug('[FavoritesInterceptorV4] v4.3 initialized'); } catch(e){ console.warn('[FavoritesInterceptorV4] init err', e); }

  // Defensive re-apply in case something removes our style/modals
  var reapplyTicker = setInterval(function(){
    try { ensureStyle(); } catch(e){}
  }, 2000);
  // stop after 40s to avoid permanent interval
  setTimeout(function(){ clearInterval(reapplyTicker); }, 40000);

})();
