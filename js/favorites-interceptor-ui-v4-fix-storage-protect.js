// favorites-interceptor-ui-v4-fix-storage-protect.js
// v4.2 - Fix: restore styling injection, ensure sort by recency (desc), robust override + debug helpers
// - Ensures style injection updates existing style (avoids truncated CSS staying active)
// - Moves history/sort helpers before use; enforces descending order by timestamp
// - Adds optional debug logging (window.FavoritesInterceptorV4.debug = true)
// - Defensive to re-renders and tolerant to other scripts
(function(){
  'use strict';

  if (window._favorites_interceptor_v4_loaded) {
    console.debug('[FavoritesInterceptorV4] already loaded');
    return;
  }
  window._favorites_interceptor_v4_loaded = true;

  const STORAGE_KEY_FAVS = 'lr_favoritos_v1';
  const STORAGE_KEY_BACKUP = '_lr_favoritos_backup_v1';
  const STORAGE_KEY_HISTORY = 'lr_historial_v1';
  const MODAL_ID = '_fi_fav_modal_v4';
  const BOX_ID = '_fi_fav_box_v4';
  const STYLE_ID = '_fi_fav_style_v4';
  const PAGE_SIZE = 6;
  const LOAD_MORE_TEXT = 'Cargar más';
  const ORIGINAL_MODAL_ID = '_lr_fav_modal';

  // CSS (complete)
  const CSS = `
  /* Favorites Interceptor v4 styles (unique id: ${STYLE_ID}) */
  #${MODAL_ID} { position: fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(2,8,12,0.45); z-index:19999; padding:12px; }
  #${BOX_ID} { width: min(680px,94%); max-height: 70vh; overflow:auto; background: linear-gradient(180deg,#ffffff,#fbfbfc); border-radius:12px; padding:16px; box-shadow:0 20px 60px rgba(2,10,18,0.16); border:1px solid rgba(6,20,20,0.04); color:#072b2a; }
  #${BOX_ID} .fi-header{ display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; }
  #${BOX_ID} .fi-title{ font-weight:800; font-size:1.05rem; }
  #${BOX_ID} .fi-close{ background:transparent; border:1px solid rgba(2,10,12,0.06); padding:6px 8px; border-radius:8px; cursor:pointer; }
  #${BOX_ID} hr{ border:0; border-top:1px solid rgba(2,10,12,0.06); margin:8px 0; }
  #${BOX_ID} .fi-list{ display:flex; flex-direction:column; gap:12px; padding:6px 0 12px 0; }
  #${BOX_ID} .fi-item{ background:#fff; border-radius:10px; padding:12px; box-shadow:0 8px 20px rgba(2,10,18,0.04); border:1px solid rgba(6,20,20,0.03); }
  #${BOX_ID} .fi-text{ font-weight:700; line-height:1.45; white-space:pre-wrap; word-break:break-word; color:#072b2a; font-size:1rem; }
  #${BOX_ID} .fi-meta{ display:flex; justify-content:space-between; align-items:center; margin-top:8px; gap:8px; }
  #${BOX_ID} .fi-actions{ display:flex; gap:8px; }
  #${BOX_ID} .fi-copy{ padding:8px 12px; border-radius:10px; border:0; cursor:pointer; font-weight:800; color:#072b2a; background: linear-gradient(90deg,#ffb88c,#ff6b6b); box-shadow:0 10px 26px rgba(2,10,18,0.06); }
  #${BOX_ID} .fi-del{ padding:8px 12px; border-radius:10px; border:1px solid rgba(2,10,12,0.06); background:transparent; cursor:pointer; }
  #${BOX_ID} .fi-load-area{ text-align:center; margin-top:10px; }
  #${BOX_ID} .fi-loadmore{ margin:8px auto 0 auto; display:inline-block; padding:8px 14px; border-radius:10px; border:0; background:#fff; color:#072b2a; cursor:pointer; box-shadow:0 6px 18px rgba(2,10,18,0.04); }
  @media(max-width:520px){ #${BOX_ID} { width:96%; padding:12px } #${BOX_ID} .fi-text{ font-size:0.98rem } }
  `;

  // state
  let _sortedFavs = [];
  let _currentPage = 0;
  let _modal = null;
  let _loadBtn = null;
  let _modalScrollHandler = null;
  let _origModalObserver = null;

  // debug flag
  window.FavoritesInterceptorV4 = window.FavoritesInterceptorV4 || {};
  window.FavoritesInterceptorV4.debug = window.FavoritesInterceptorV4.debug || false;

  // util
  function logDebug(...args){ if(window.FavoritesInterceptorV4 && window.FavoritesInterceptorV4.debug) console.debug('[FavoritesInterceptorV4]', ...args); }
  function injectStyle(){
    try {
      const existing = document.getElementById(STYLE_ID);
      if(existing){
        // update content if changed (avoids stale/truncated CSS)
        if(existing.textContent !== CSS) existing.textContent = CSS;
        return;
      }
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = CSS;
      (document.head || document.documentElement).appendChild(s);
    } catch(e){ console.warn('[FavoritesInterceptorV4] injectStyle failed', e); }
  }
  function safeParse(s){ try { return JSON.parse(s); } catch(e){ return null; } }

  // STORAGE HANDLERS
  function readFavorites(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY_FAVS);
      if(!raw) return [];
      const arr = safeParse(raw);
      if(!Array.isArray(arr)) return [];
      return arr.map(x => typeof x === 'string' ? x.trim() : (x && x.text ? String(x.text).trim() : String(x).trim()));
    } catch(e){ return []; }
  }
  function writeFavorites(arr){
    try {
      if(!Array.isArray(arr)) return;
      localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(arr.slice(0,200)));
    } catch(e){ console.warn('[FavoritesInterceptorV4] writeFavorites failed', e); }
  }
  function readBackup(){ try { const raw = localStorage.getItem(STORAGE_KEY_BACKUP); return safeParse(raw); } catch(e){ return null; } }

  // Install backup wrapper for setItem (lightweight and safe)
  (function installBackupWrapper(){
    if(window._lr_storage_backup_installed) return;
    window._lr_storage_backup_installed = true;
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value){
      try {
        if(String(key) === STORAGE_KEY_FAVS){
          try {
            const prev = this.getItem && this.getItem(key);
            if(prev !== null && prev !== undefined){
              // write backup using original method to avoid recursion issues
              origSet.call(this, STORAGE_KEY_BACKUP, String(prev));
            }
          } catch(e){ /* ignore backup errors */ }
        }
      } catch(e){}
      return origSet.call(this, key, value);
    };
  })();

  // HISTORY MAP + SORT (moved earlier to ensure availability)
  function readHistoryMap(){
    const map = new Map();
    try {
      const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
      if(!raw) return map;
      const arr = safeParse(raw);
      if(!Array.isArray(arr)) return map;
      arr.forEach(item => {
        try {
          const text = (item && (item.text || item.t || item.phrase)) || '';
          const at = (item && (item.at || item.time || item.timestamp)) || item && item.at || 0;
          if(!text) return;
          const ts = Number(at) || (at ? new Date(at).getTime() : 0) || 0;
          if(!map.has(text) || (ts && ts > map.get(text))) map.set(text, ts);
        } catch(e){}
      });
    } catch(e){}
    return map;
  }

  function sortFavoritesByRecency(favs){
    try {
      if(!Array.isArray(favs)) return [];
      const map = readHistoryMap();
      // Build indexed list with ts (default 0)
      const indexed = favs.map((t,i) => ({ t, i, ts: map.has(t) ? map.get(t) : 0 }));
      // Sort: descending by ts, then original index
      indexed.sort((a,b) => {
        if(a.ts === b.ts) return a.i - b.i; // stable by original order
        return b.ts - a.ts; // most recent first
      });
      return indexed.map(x => x.t);
    } catch(e){
      return Array.isArray(favs) ? favs.slice(0) : [];
    }
  }

  // clipboard
  async function copyToClipboard(text){
    try {
      if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(text); return true; }
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select();
      let ok = false;
      try{ ok = document.execCommand('copy'); }catch(e){ ok = false; }
      document.body.removeChild(ta);
      return !!ok;
    } catch(e){ return false; }
  }
  function uiFeedback(btn, msg){
    try {
      if(typeof window.showToast === 'function'){ window.showToast(msg); return; }
      if(!btn){ try{ alert(msg); }catch(e){} return; }
      const prev = btn.innerText; btn.innerText = msg; btn.disabled = true;
      setTimeout(()=>{ try{ btn.innerText = prev; btn.disabled = false; }catch(e){} }, 900);
    } catch(e){}
  }
  function normalizeForMatch(s){
    try { return (s||'').toString().trim().replace(/\s+/g,' '); } catch(e){ return String(s||'').trim(); }
  }

  // build fragment for page
  function buildPageFragment(page){
    const start = page * PAGE_SIZE, end = start + PAGE_SIZE;
    const slice = _sortedFavs.slice(start, end);
    const frag = document.createDocumentFragment();
    slice.forEach(text => {
      const item = document.createElement('div'); item.className = 'fi-item';
      const t = document.createElement('div'); t.className = 'fi-text'; t.textContent = text;
      const meta = document.createElement('div'); meta.className = 'fi-meta';
      const time = document.createElement('div'); time.className = 'fi-time';
      const hist = readHistoryMap(); const ts = hist.has(text) ? hist.get(text) : null;
      if(ts) try{ time.textContent = new Date(Number(ts)).toLocaleString(); } catch(e){}
      const actions = document.createElement('div'); actions.className = 'fi-actions';
      const copyBtn = document.createElement('button'); copyBtn.className = 'fi-copy'; copyBtn.textContent = 'Copiar';
      const delBtn = document.createElement('button'); delBtn.className = 'fi-del'; delBtn.textContent = 'Eliminar';

      copyBtn.addEventListener('click', async ev => {
        ev && ev.stopPropagation && ev.stopPropagation();
        const ok = await copyToClipboard(text);
        uiFeedback(copyBtn, ok? 'Copiado' : 'Copiar');
      }, false);

      delBtn.addEventListener('click', ev => {
        ev && ev.stopPropagation && ev.stopPropagation();
        const favsCurrent = readFavorites();
        let idx = favsCurrent.indexOf(text);
        if(idx === -1){
          const normTarget = normalizeForMatch(text);
          idx = favsCurrent.findIndex(f => normalizeForMatch(f) === normTarget);
        }
        if(idx !== -1){
          favsCurrent.splice(idx,1);
          writeFavorites(favsCurrent); // explicit write on delete
          _sortedFavs = _sortedFavs.filter(f => normalizeForMatch(f) !== normalizeForMatch(text));
          const totalPages = Math.ceil(_sortedFavs.length / PAGE_SIZE);
          if(_currentPage >= totalPages) _currentPage = Math.max(0, totalPages - 1);
          renderModalPage(_currentPage, true);
        } else {
          console.warn('[FavoritesInterceptorV4] delete: item not found in storage', text);
        }
      }, false);

      actions.appendChild(copyBtn); actions.appendChild(delBtn);
      meta.appendChild(time); meta.appendChild(actions);
      item.appendChild(t); item.appendChild(meta);
      item.addEventListener('click', async () => {
        const ok = await copyToClipboard(text);
        uiFeedback(null, ok? 'Copiado' : 'Copiar');
      }, { passive:true });

      frag.appendChild(item);
    });
    return frag;
  }

  function renderModalPage(pageIndex, preserveScroll){
    const modal = document.getElementById(MODAL_ID); if(!modal) return;
    const box = modal.querySelector('#' + BOX_ID); if(!box) return;
    let list = box.querySelector('.fi-list'); if(!list){ list = document.createElement('div'); list.className = 'fi-list'; box.appendChild(list); }
    const prevScroll = preserveScroll ? box.scrollTop : 0;

    if(pageIndex <= 0){
      list.innerHTML = '';
      _currentPage = 0;
      const frag = buildPageFragment(0);
      list.appendChild(frag);
    } else {
      const frag = buildPageFragment(pageIndex);
      if(frag && frag.childNodes && frag.childNodes.length) list.appendChild(frag);
    }

    let loadArea = box.querySelector('.fi-load-area'); if(!loadArea){ loadArea = document.createElement('div'); loadArea.className = 'fi-load-area'; loadArea.style.textAlign='center'; loadArea.style.marginTop='8px'; box.appendChild(loadArea); }
    if(!_loadBtn){
      _loadBtn = document.createElement('button'); _loadBtn.className = 'fi-loadmore'; _loadBtn.textContent = LOAD_MORE_TEXT;
      _loadBtn.addEventListener('click', () => {
        const totalPagesNow = Math.ceil(_sortedFavs.length / PAGE_SIZE);
        if(_currentPage + 1 < totalPagesNow){
          _currentPage++;
          renderModalPage(_currentPage, false);
        }
      }, false);
    }
    loadArea.innerHTML = '';
    const totalPages = Math.ceil(_sortedFavs.length / PAGE_SIZE);
    if(_currentPage + 1 < totalPages) loadArea.appendChild(_loadBtn);

    if(!_modalScrollHandler){
      _modalScrollHandler = function(){
        try {
          if(!box) return;
          const threshold = 120;
          if(box.scrollHeight - (box.scrollTop + box.clientHeight) < threshold){
            const totalPagesNow = Math.ceil(_sortedFavs.length / PAGE_SIZE);
            if(_currentPage + 1 < totalPagesNow){
              _currentPage++;
              renderModalPage(_currentPage, false);
            }
          }
        } catch(e){}
      };
      box.addEventListener('scroll', _modalScrollHandler, { passive:true });
    }

    if(preserveScroll) box.scrollTop = prevScroll;
  }

  // restore from backup if favorites empty
  function restoreFromBackupIfNeeded(){
    try {
      const favs = readFavorites();
      if(!favs || favs.length === 0){
        const backup = readBackup();
        if(Array.isArray(backup) && backup.length){
          try { localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(backup)); console.debug('[FavoritesInterceptorV4] restored favorites from backup'); return true; } catch(e){ console.warn('[FavoritesInterceptorV4] restore error', e); }
        }
      }
    } catch(e){}
    return false;
  }

  // open / close modal
  function openModal(){
    try {
      injectStyle();
      restoreFromBackupIfNeeded();
    } catch(e){}

    // remove original modal if exists
    try { const orig = document.getElementById(ORIGINAL_MODAL_ID); if(orig) orig.parentNode && orig.parentNode.removeChild(orig); } catch(e){}

    closeModal();

    const favs = readFavorites();
    _sortedFavs = sortFavoritesByRecency(favs); // ensure descending by recency
    _currentPage = 0;

    logDebug('opening modal: favs count', _sortedFavs.length, 'sample:', _sortedFavs.slice(0,6));

    const modal = document.createElement('div'); modal.id = MODAL_ID; Object.assign(modal.style,{ position:'fixed', left:0, right:0, top:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(2,8,12,0.45)', zIndex:19999, padding:'12px' });
    const box = document.createElement('div'); box.id = BOX_ID;
    const header = document.createElement('div'); header.className = 'fi-header';
    const title = document.createElement('div'); title.className = 'fi-title'; title.textContent = 'Favoritos';
    const closeBtn = document.createElement('button'); closeBtn.className = 'fi-close'; closeBtn.textContent = 'Cerrar';
    closeBtn.addEventListener('click', closeModal, { passive:true });
    header.appendChild(title); header.appendChild(closeBtn);
    const hr = document.createElement('hr'); hr.style.margin='8px 0';
    box.appendChild(header); box.appendChild(hr);
    modal.appendChild(box);
    document.body.appendChild(modal);

    modal._fi_key = function(e){ if(e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', modal._fi_key, { passive:true });

    _modal = modal;
    renderModalPage(0, false);
  }

  function closeModal(){
    try {
      const modal = document.getElementById(MODAL_ID); if(!modal) return;
      if(modal._fi_key) try{ document.removeEventListener('keydown', modal._fi_key); } catch(e){}
      const box = modal.querySelector('#' + BOX_ID); if(box && _modalScrollHandler) try{ box.removeEventListener('scroll', _modalScrollHandler); } catch(e){}
      modal.parentNode && modal.parentNode.removeChild(modal);
      _modal = null; _loadBtn = null; _modalScrollHandler = null;
    } catch(e){}
  }

  // visible phrase extraction (robust)
  function getVisiblePhraseTextSync(){
    try {
      var ni = document.querySelector('[data-name-injector-applied], [data-name-injector-name]');
      if(ni){
        var attr = ni.getAttribute && (ni.getAttribute('data-name-injector-name') || ni.getAttribute('data-name-injector-original') || ni.getAttribute('data-name-injector-applied'));
        if(attr && String(attr).trim()) return String(attr).trim();
        var txt = (ni.textContent || '').trim();
        if(txt) return txt;
      }
      var el = document.getElementById('frase-text') || document.querySelector('.frase-text') || document.querySelector('.frase');
      if(el && (el.textContent||'').trim()) return el.textContent.trim();
      if(window._phrases_current && typeof window._phrases_current === 'string' && window._phrases_current.trim()) return window._phrases_current.trim();
      if(window._phrases_current && typeof window._phrases_current === 'object' && window._phrases_current.phrase) return String(window._phrases_current.phrase).trim();
      // fallback largest block
      var card = document.querySelector('.frase-card') || document.getElementById('frase-card');
      if(card){
        var cand = Array.from(card.querySelectorAll('p,div,span,h1,h2,h3')).filter(function(n){ try { if(n.closest && n.closest('.frase-controls')) return false; return (n.textContent||'').trim().length>3; } catch(e){ return false; } });
        if(cand.length){
          cand.sort(function(a,b){ try { var ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect(); return (rb.width*rb.height)-(ra.width*ra.height);}catch(e){return 0;} });
          return (cand[0].textContent||'').trim();
        }
      }
      return '';
    } catch(e){ return ''; }
  }

  // override toggleFavorite to force saving visible phrase
  function overrideToggleFavorite(){
    try {
      if(window._orig_toggleFavorite_saved) return;
      if(typeof window.toggleFavorite === 'function'){
        window._orig_toggleFavorite_saved = window.toggleFavorite;
        window.toggleFavorite = function(text){
          try {
            var actual = getVisiblePhraseTextSync();
            if(actual && actual.length) return window._orig_toggleFavorite_saved(actual);
            // fallback: call original with provided text
            return window._orig_toggleFavorite_saved(text);
          } catch(e){ try { return window._orig_toggleFavorite_saved(text); } catch(ex){ return false; } }
        };
        logDebug('toggleFavorite overridden');
        return;
      }
      // poll if not present yet
      var tries = 0;
      var iid = setInterval(function(){
        tries++;
        if(typeof window.toggleFavorite === 'function'){
          clearInterval(iid);
          overrideToggleFavorite();
        } else if(tries > 25) clearInterval(iid);
      }, 120);
    } catch(e){ console.warn('[FavoritesInterceptorV4] overrideToggleFavorite error', e); }
  }

  // menuInterceptor
  function menuInterceptor(ev){
    try {
      const btn = ev.target && ev.target.closest ? ev.target.closest('button, a, [data-action]') : null;
      if(!btn) return;
      let isShowFav = false;
      try {
        if(btn.id && btn.id === 'showFavs_menu') isShowFav = true;
        const da = (btn.getAttribute && btn.getAttribute('data-action')) || '';
        if(da && da.toLowerCase().indexOf('show-fav') !== -1) isShowFav = true;
        if((btn.textContent || '').toLowerCase().indexOf('favorit') !== -1 && btn.closest && btn.closest('#menuPanel')) isShowFav = true;
      } catch(e){}
      if(!isShowFav) return;
      try { if(ev.preventDefault) ev.preventDefault(); } catch(e){}
      try { if(ev.stopImmediatePropagation) ev.stopImmediatePropagation(); else if(ev.stopPropagation) ev.stopPropagation(); } catch(e){}
      openModal();
    } catch(e){ console.warn('[FavoritesInterceptorV4] menu handler error', e); }
  }

  function overrideShowFavoritesModal(){
    try {
      if(window._orig_showFavoritesModal_saved) return;
      try { window._orig_showFavoritesModal_saved = window.showFavoritesModal; } catch(e){}
      window.showFavoritesModal = function(){ try { openModal(); return true; } catch(e){ return false; } };
      logDebug('showFavoritesModal overridden');
    } catch(e){ console.warn('[FavoritesInterceptorV4] overrideShowFavoritesModal error', e); }
  }

  // MutationObserver to remove original modal if created
  function startOrigModalRemover(){
    try {
      if(_origModalObserver) return;
      _origModalObserver = new MutationObserver(function(muts){
        muts.forEach(function(m){
          if(m.addedNodes && m.addedNodes.length){
            Array.from(m.addedNodes).forEach(function(n){
              try {
                if(n && n.id === ORIGINAL_MODAL_ID){
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
      logDebug('orig modal remover started');
    } catch(e){ console.warn('[FavoritesInterceptorV4] startOrigModalRemover error', e); }
  }

  function attachInterceptors(){
    try { document.removeEventListener('click', menuInterceptor, true); } catch(e){}
    document.addEventListener('click', menuInterceptor, true);
    try { document.removeEventListener('pointerup', menuInterceptor, true); } catch(e){}
    document.addEventListener('pointerup', menuInterceptor, true);
  }

  // public API
  window.FavoritesInterceptorV4.open = openModal;
  window.FavoritesInterceptorV4.close = closeModal;
  window.FavoritesInterceptorV4.restore = function(){
    try {
      closeModal();
      try{ document.removeEventListener('click', menuInterceptor, true); }catch(e){}
      try{ document.removeEventListener('pointerup', menuInterceptor, true); }catch(e){}
      if(_origModalObserver){ _origModalObserver.disconnect(); _origModalObserver = null; }
      if(window._orig_showFavoritesModal_saved) try { window.showFavoritesModal = window._orig_showFavoritesModal_saved; } catch(e){}
      if(window._orig_toggleFavorite_saved) try { window.toggleFavorite = window._orig_toggleFavorite_saved; } catch(e){}
      const s = document.getElementById(STYLE_ID); if(s && s.parentNode) s.parentNode.removeChild(s);
      window._favorites_interceptor_v4_loaded = false;
      return true;
    } catch(e){ return false; }
  };
  window.FavoritesInterceptorV4.restoreFromBackup = function(){
    try {
      const b = readBackup();
      if(Array.isArray(b) && b.length){
        writeFavorites(b);
        return true;
      }
      return false;
    } catch(e){ return false; }
  };

  // init
  try {
    injectStyle();
    attachInterceptors();
    overrideShowFavoritesModal();
    overrideToggleFavorite();
    startOrigModalRemover();
    console.debug('[FavoritesInterceptorV4] v4.2 loaded');
    logDebug('debug enabled:', !!window.FavoritesInterceptorV4.debug);
  } catch(e){ console.warn('[FavoritesInterceptorV4] init error', e); }

})();
