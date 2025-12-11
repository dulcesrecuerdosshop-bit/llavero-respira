// favorites-interceptor-ui-v4-fix-storage-protect.js
// v4.4 - Safe minimal interceptor
// - No global click handlers, no aggressive MutationObservers that remove nodes
// - Only overrides toggleFavorite (if present) to force-save the phrase visible on screen
// - Provides a non-destructive openModal for diagnostics/UI
// - Injects CSS for the modal if missing, but does not remove other modals or alter unrelated DOM

(function(){
  'use strict';
  if (window._favorites_interceptor_v4_loaded) {
    console.debug('[FavoritesInterceptorV4] already loaded');
    return;
  }
  window._favorites_interceptor_v4_loaded = true;

  const STORAGE_KEY_FAVS = 'lr_favoritos_v1';
  const STYLE_ID = '_fi_fav_style_v4';
  const MODAL_ID = '_fi_fav_modal_v4';
  const BOX_ID = '_fi_fav_box_v4';
  const PAGE_SIZE = 6;
  const LOAD_MORE_TEXT = 'Cargar más';

  // Minimal, safe CSS (will not clobber other UI). If your app provides its own styles
  // these will be small and scoped to our modal IDs/classes.
  const CSS = `
    #${MODAL_ID} { position: fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(2,8,12,0.4); z-index:15000; padding:12px; }
    #${BOX_ID} { width: min(680px,94%); max-height: 72vh; overflow:auto; background: #fff; border-radius:12px; padding:16px; box-shadow: 0 20px 60px rgba(0,0,0,0.12); border:1px solid rgba(0,0,0,0.04); color:#072b2a; }
    #${BOX_ID} .fi-header{ display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; }
    #${BOX_ID} .fi-title{ font-weight:800; font-size:1.05rem; }
    #${BOX_ID} .fi-close{ background:transparent; border:1px solid rgba(0,0,0,0.06); padding:6px 8px; border-radius:8px; cursor:pointer; }
    #${BOX_ID} .fi-list{ display:flex; flex-direction:column; gap:10px; padding:6px 0 12px; }
    #${BOX_ID} .fi-item{ background:#fff; border-radius:10px; padding:12px; box-shadow:0 8px 20px rgba(0,0,0,0.04); border:1px solid rgba(0,0,0,0.03); }
    #${BOX_ID} .fi-text{ font-weight:700; line-height:1.45; white-space:pre-wrap; color:#072b2a; font-size:1rem; }
    #${BOX_ID} .fi-meta{ display:flex; justify-content:space-between; align-items:center; margin-top:8px; gap:8px; }
    #${BOX_ID} .fi-actions{ display:flex; gap:8px; }
    #${BOX_ID} .fi-copy, #${BOX_ID} .fi-del, #${BOX_ID} .fi-loadmore{ padding:8px 12px; border-radius:8px; cursor:pointer; }
    @media(max-width:520px){ #${BOX_ID} { width:96%; padding:12px } #${BOX_ID} .fi-text{ font-size:0.98rem } }
  `;

  // simple helpers
  function safeParse(s){ try { return JSON.parse(s); } catch(e){ return null; } }
  function readFavorites(){ try { const raw = localStorage.getItem(STORAGE_KEY_FAVS); const arr = safeParse(raw); return Array.isArray(arr) ? arr : []; } catch(e){ return []; } }
  function writeFavorites(arr){ try { if(!Array.isArray(arr)) return; localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(arr.slice(0,500))); } catch(e){ console.warn('[FavoritesInterceptorV4] writeFavorites failed', e); } }

  // inject or update style (non-destructive)
  function injectStyle(){
    try {
      const existing = document.getElementById(STYLE_ID);
      if(existing){
        if(existing.textContent !== CSS) existing.textContent = CSS;
        return;
      }
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = CSS;
      (document.head || document.documentElement).appendChild(s);
    } catch(e){ console.warn('[FavoritesInterceptorV4] injectStyle error', e); }
  }

  // robust visible phrase extractor (non-invasive)
  function getVisiblePhraseTextSync(){
    try {
      const ni = document.querySelector('[data-name-injector-applied], [data-name-injector-name], [data-name-injector-original]');
      if(ni){
        const attr = ni.getAttribute && (ni.getAttribute('data-name-injector-name') || ni.getAttribute('data-name-injector-original'));
        if(attr && String(attr).trim()) return String(attr).trim();
        const tni = (ni.textContent || '').trim();
        if(tni) return tni;
      }
      const el = document.getElementById('frase-text') || document.querySelector('.frase-text') || document.querySelector('.frase');
      if(el && (el.textContent || '').trim()) return el.textContent.trim();
      if(window._phrases_current && typeof window._phrases_current === 'string' && window._phrases_current.trim()) return window._phrases_current.trim();
      // fallback largest text block in .frase-card (safe, read-only)
      const card = document.querySelector('.frase-card') || document.getElementById('frase-card');
      if(card){
        const candidates = Array.from(card.querySelectorAll('p,div,span,h1,h2,h3')).filter(function(n){
          try { if(n.closest && n.closest('.frase-controls')) return false; return (n.textContent||'').trim().length > 3; } catch(e){ return false; }
        });
        if(candidates.length){
          candidates.sort(function(a,b){
            try { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (rb.width*rb.height) - (ra.width*ra.height); } catch(e){ return 0; }
          });
          return (candidates[0].textContent || '').trim();
        }
      }
      return '';
    } catch(e){
      console.warn('[FavoritesInterceptorV4] getVisiblePhraseTextSync error', e);
      return '';
    }
  }

  // override toggleFavorite only (safe)
  function overrideToggleFavorite(){
    try {
      if(window._orig_toggleFavorite_saved) return;
      if(typeof window.toggleFavorite === 'function'){
        window._orig_toggleFavorite_saved = window.toggleFavorite;
        window.toggleFavorite = function(text){
          try {
            const actual = getVisiblePhraseTextSync();
            if(actual && actual.length){
              // call original with visible phrase if possible
              try { return window._orig_toggleFavorite_saved(actual); } catch(e){ /* fallthrough */ }
              // fallback: save locally since original may be unavailable
            }
            // fallback to original parameter or manual save
            try { return window._orig_toggleFavorite_saved(text); } catch(e){ }
          } catch(e) {}
          // last fallback: save into our storage list without touching other keys
          try {
            const v = (text && typeof text === 'string') ? text.trim() : getVisiblePhraseTextSync();
            if(v && v.length){
              const favs = readFavorites();
              if(!favs.includes(v)) { favs.unshift(v); writeFavorites(favs); }
            }
          } catch(e){ console.warn('[FavoritesInterceptorV4] fallback save failed', e); }
          return true;
        };
        console.debug('[FavoritesInterceptorV4] toggleFavorite overridden (safe)');
      } else {
        // if not present, poll for it but non-aggressively
        let tries = 0;
        const iid = setInterval(function(){
          tries++;
          if(typeof window.toggleFavorite === 'function'){ clearInterval(iid); overrideToggleFavorite(); }
          else if(tries > 30) clearInterval(iid);
        }, 200);
      }
    } catch(e){ console.warn('[FavoritesInterceptorV4] overrideToggleFavorite error', e); }
  }

  // build & open our modal (diagnostic/opt-in). Non-destructive: DOES NOT remove other modals.
  function openModal(){
    try {
      injectStyle();
      // remove only our modal if exists
      const prev = document.getElementById(MODAL_ID);
      if(prev) prev.parentNode && prev.parentNode.removeChild(prev);

      const favs = readFavorites();
      const modal = document.createElement('div');
      modal.id = MODAL_ID;
      const box = document.createElement('div'); box.id = BOX_ID;

      // header
      const header = document.createElement('div'); header.className = 'fi-header';
      const title = document.createElement('div'); title.className = 'fi-title'; title.textContent = 'Favoritos';
      const closeBtn = document.createElement('button'); closeBtn.className = 'fi-close'; closeBtn.textContent = 'Cerrar';
      closeBtn.addEventListener('click', function(){ try { modal.parentNode && modal.parentNode.removeChild(modal); } catch(e){} }, { passive:true });
      header.appendChild(title); header.appendChild(closeBtn);
      box.appendChild(header);
      box.appendChild(document.createElement('hr'));

      const list = document.createElement('div'); list.className = 'fi-list';
      if(!favs || favs.length === 0){
        const li = document.createElement('div'); li.className = 'fi-item';
        const t = document.createElement('div'); t.className = 'fi-text'; t.textContent = 'No hay favoritos';
        li.appendChild(t); list.appendChild(li);
      } else {
        // render in the order from storage (we do not alter storage order here)
        favs.forEach(function(text){
          const li = document.createElement('div'); li.className = 'fi-item';
          const t = document.createElement('div'); t.className = 'fi-text'; t.textContent = text;
          const meta = document.createElement('div'); meta.className = 'fi-meta';
          const actions = document.createElement('div'); actions.className = 'fi-actions';
          const copyBtn = document.createElement('button'); copyBtn.className = 'fi-copy'; copyBtn.textContent = 'Copiar';
          copyBtn.addEventListener('click', async function(ev){ ev && ev.stopPropagation && ev.stopPropagation(); try { if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(text); } else { const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } alert('Copiado'); } catch(e){ alert('Copiar falló'); } }, false);
          const delBtn = document.createElement('button'); delBtn.className = 'fi-del'; delBtn.textContent = 'Eliminar';
          delBtn.addEventListener('click', function(ev){ ev && ev.stopPropagation && ev.stopPropagation(); try { const current = readFavorites(); let idx = current.indexOf(text); if(idx === -1){ idx = current.findIndex(f => (String(f||'')).trim() === (String(text||'')).trim()); } if(idx !== -1){ current.splice(idx,1); writeFavorites(current); li.parentNode && li.parentNode.removeChild(li); } } catch(e){ console.warn(e); } }, false);

          actions.appendChild(copyBtn); actions.appendChild(delBtn);
          meta.appendChild(actions);
          li.appendChild(t); li.appendChild(meta);
          list.appendChild(li);
        });
      }

      box.appendChild(list);
      modal.appendChild(box);
      document.body.appendChild(modal);
    } catch(e){ console.warn('[FavoritesInterceptorV4] openModal error', e); }
  }

  // Expose API
  window.FavoritesInterceptorV4 = window.FavoritesInterceptorV4 || {};
  window.FavoritesInterceptorV4.open = openModal;
  window.FavoritesInterceptorV4.injectStyle = injectStyle;
  window.FavoritesInterceptorV4.getVisiblePhrase = getVisiblePhraseTextSync;
  window.FavoritesInterceptorV4.readFavorites = readFavorites;
  window.FavoritesInterceptorV4.writeFavorites = writeFavorites;

  // Init: inject style and override toggleFavorite
  try {
    injectStyle();
    overrideToggleFavorite();
    console.debug('[FavoritesInterceptorV4] v4.4 loaded (safe, minimal). Use FavoritesInterceptorV4.open() to view favorites modal.');
  } catch(e){ console.warn('[FavoritesInterceptorV4] init error', e); }

})();
