// respirar-smart-injector.js (v1.1)
// - Combina ocultación segura del botón original y creación de un botón "Tu sesión está lista!?" propio,
//   con animación y delegación segura.
// - Nueva función: cuando la sesión se cierra (modal removido), el script bloquea la reaparición del botón
//   hasta que la usuaria vuelva a entrar (persistido en localStorage).
// - Idempotente, evita duplicados, expone API: window.RespirarSmartInjector.reposition(), .getButton(), .restore(), .resetBlock()
//
// Instrucciones: subir como /js/respirar-smart-injector.js y referenciar con <script src="/js/respirar-smart-injector.js" defer></script>
// O pegar en consola para probar inmediatamente.

(function(){
  'use strict';

  // --- Idempotencia: restore any existing instance first ---
  if (window.RespirarSmartInjector && typeof window.RespirarSmartInjector.restore === 'function') {
    try { window.RespirarSmartInjector.restore(); } catch(e){/*ignore*/ }
  }
  if (window._respirar_smart_injector_loaded) {
    console.debug('[RespirarSmartInjector] already loaded');
    return;
  }
  window._respirar_smart_injector_loaded = true;

  // --- CONFIG ---
  var CONTAINER_ID = 'respirar-smart-injector-container';
  var BUTTON_ID = 'respirar-smart-injector-btn';
  var STYLE_ID = 'respirar-smart-injector-style';
  var HIDDEN_ATTR = 'data-resp-hidden-by-smart';
  var BLOCK_KEY = 'respirar_blocked_until_reentry'; // localStorage key: '1' means blocked until next entry
  var ANIM_INTERVAL = 4200;
  var OFFSET = 14;
  var MIN_BOTTOM_GAP = 12;

  // selectors for originals created by app (phrases.js)
  var CANDIDATE_SELECTORS = [
    '#breathBtn',
    '#respirar_btn',
    '#respirarBtn',
    '.lr-btn.breath-btn',
    '.btn-breath',
    '[data-action="respirar"]',
    '[data-action="session-start"]'
  ];

  // do not hide elements inside these ancestors (menu/header)
  var EXCLUDE_ANCESTORS = ['#menuPanel','header','[role="banner"]','.site-header','.masthead','.topbar'];

  // injected CSS
  var CSS = '\
  #' + CONTAINER_ID + ' { position: absolute !important; pointer-events: none !important; z-index: 2147485000 !important; }\
  #' + CONTAINER_ID + ' button#' + BUTTON_ID + ' { pointer-events: auto !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; padding:12px 22px !important; border-radius:12px !important; border:0 !important; background: linear-gradient(90deg,#ffb88c,#ff6b6b) !important; color:#072b2a !important; font-weight:700 !important; font-size:16px !important; box-shadow: 0 8px 20px rgba(6,10,9,0.12) !important; cursor:pointer !important; transition: transform 160ms ease, box-shadow 160ms ease, opacity 200ms ease !important; }\
  #' + CONTAINER_ID + ' button#' + BUTTON_ID + '.resp-pressed { transform: translateY(-2px) !important; box-shadow: 0 12px 28px rgba(0,0,0,0.18) !important; }\
  @keyframes respirar-pulse { 0% { transform: translateY(0) scale(1); } 45% { transform: translateY(-6px) scale(1.02); } 100% { transform: translateY(0) scale(1); } }\
  #' + CONTAINER_ID + ' button#' + BUTTON_ID + '.resp-pulse { animation: respirar-pulse 760ms ease-in-out !important; }\
  @media (max-width:520px){ #' + CONTAINER_ID + ' button#' + BUTTON_ID + ' { font-size:15px !important; padding:10px 18px !important; } }\
  ';

  // internal state
  var _animTimer = null;
  var _cardObserver = null;
  var _origObserver = null;
  var _resizeHandler = null;
  var _scrollHandler = null;
  var _reposTimer = null;

  // helpers
  function qa(sel){ try { return Array.from(document.querySelectorAll(sel)); } catch(e){ return []; } }
  function q(sel){ try { return document.querySelector(sel); } catch(e){ return null; } }
  function injectCSS(){
    if(document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function isInExcludeAncestor(el){
    try {
      if(!el || !el.closest) return false;
      for(var i=0;i<EXCLUDE_ANCESTORS.length;i++){
        var sel = EXCLUDE_ANCESTORS[i];
        if(el.closest && el.closest(sel)) return true;
      }
    } catch(e){}
    return false;
  }

  // hide a candidate original (safely)
  function hideCandidate(el){
    try {
      if(!el || !(el instanceof Element)) return false;
      if(isInExcludeAncestor(el)) return false;
      // mark and hide
      el.style.visibility = 'hidden';
      el.setAttribute(HIDDEN_ATTR, '1');
      console.debug('[RespirarSmartInjector] hid original', el);
      return true;
    } catch(e){ return false; }
  }

  // scan for original buttons and hide them
  function scanAndHideOnce(){
    var found = false;
    for(var i=0;i<CANDIDATE_SELECTORS.length;i++){
      try {
        var list = qa(CANDIDATE_SELECTORS[i]);
        list.forEach(function(n){ if(hideCandidate(n)) found = true; });
      } catch(e){}
    }
    return found;
  }

  // ensure injector button exists (idempotent)
  function ensureInjectorButton(titleText){
    injectCSS();
    var container = document.getElementById(CONTAINER_ID);
    if(!container){
      var card = q('.frase-card') || document.body;
      container = document.createElement('div');
      container.id = CONTAINER_ID;
      container.style.position = 'absolute';
      container.style.pointerEvents = 'none';
      try { (card || document.body).appendChild(container); } catch(e){ document.body.appendChild(container); }
    }
    var btn = container.querySelector('#' + BUTTON_ID);
    if(!btn){
      btn = document.createElement('button');
      btn.id = BUTTON_ID;
      btn.type = 'button';
      // Use provided title (if any) or default - modified per user's request
      btn.textContent = titleText || 'Tu sesión está lista!?';
      btn.setAttribute('aria-label', btn.textContent);
      btn.style.pointerEvents = 'auto';
      container.appendChild(btn);
    } else {
      // update title if changed
      if(titleText && btn.textContent !== titleText){
        btn.textContent = titleText;
        btn.setAttribute('aria-label', titleText);
      }
    }
    return { container: container, button: btn };
  }

  // find best phrase node (used for positioning)
  function findBestPhraseNode(){
    var card = q('.frase-card') || document.body;
    if(!card) return null;
    try {
      var r = card.getBoundingClientRect();
      var cx = Math.round((r.left + r.right)/2);
      var cy = Math.round((r.top + r.bottom)/2);
      var el = document.elementFromPoint(cx, cy);
      if(el){
        var node = el;
        while(node && node !== document.body){
          if(/^(P|DIV|SPAN|BLOCKQUOTE|H1|H2|H3|H4|LI)$/i.test(node.tagName)){
            var txt = (node.textContent||'').trim();
            if(txt.length > 6 && window.getComputedStyle(node).display !== 'none') return node;
          }
          node = node.parentElement;
        }
      }
    } catch(e){}
    try {
      var cand = qa('.frase-card p, .frase-card div.frase-text, .frase-card .frase-text');
      if(cand && cand.length) return cand[0];
    } catch(e){}
    return null;
  }

  // compute position for injector button (absolute page coords)
  function computeButtonPosition(node, cardEl, btnEl){
    var cardRect = (cardEl && cardEl.getBoundingClientRect()) || { left:0, top:0, width: window.innerWidth, height: window.innerHeight };
    var btnW = btnEl ? btnEl.offsetWidth : 140;
    var btnH = btnEl ? btnEl.offsetHeight : 44;
    var left = Math.round(cardRect.left + cardRect.width/2 - btnW/2 + window.scrollX);
    var top;
    if(node){
      var nr = node.getBoundingClientRect();
      var spaceBelow = window.innerHeight - nr.bottom;
      var preferBelow = spaceBelow >= (btnH + OFFSET + MIN_BOTTOM_GAP);
      if(preferBelow){
        top = Math.round(window.scrollY + nr.bottom + OFFSET);
      } else {
        top = Math.round(window.scrollY + nr.top - OFFSET - btnH);
      }
    } else {
      top = Math.round(window.scrollY + cardRect.top + cardRect.height*0.6 - btnH/2);
    }
    var docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight);
    top = Math.max(8 + window.scrollY, Math.min(top, docH - btnH - MIN_BOTTOM_GAP));
    return { left: left, top: top };
  }

  // reposition injector container (uses card-relative coords)
  function repositionInjector(){
    try {
      var card = q('.frase-card') || document.body;
      var ref = ensureInjectorButton();
      var container = ref.container, btn = ref.button;
      if(!btn || !card) return;
      if(isModalOpen()){
        container.style.display = 'none';
        return;
      } else {
        container.style.display = '';
      }
      var node = findBestPhraseNode();
      var pos = computeButtonPosition(node, card, btn);
      var cardRect = card.getBoundingClientRect();
      container.style.left = (pos.left - cardRect.left) + 'px';
      container.style.top = (pos.top - window.scrollY - cardRect.top) + 'px';
      container.style.transform = 'none';
    } catch(e){ console.warn('[RespirarSmartInjector] reposition error', e); }
  }
  function scheduleReposition(delay){
    if(_reposTimer) clearTimeout(_reposTimer);
    _reposTimer = setTimeout(repositionInjector, delay || 120);
  }

  // detect modal open/close
  function isModalOpen(){
    try {
      var mod = qa('[role="dialog"], .modal, .lr-modal-card, .dialog, .modal-backdrop, .overlay').some(function(m){
        var cs = window.getComputedStyle(m);
        if(!cs) return false;
        if(cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        var r = m.getBoundingClientRect();
        return r.width > 10 && r.height > 10;
      });
      return !!mod;
    } catch(e){ return false; }
  }

  // safe openers detection (prefer direct functions)
  function findSafeOpeners(){
    var candidates = [];
    try {
      if(typeof window.openSessionModal === 'function') candidates.push(window.openSessionModal);
      if(window.lr_breathSessions && typeof window.lr_breathSessions.openSessionModal === 'function') candidates.push(window.lr_breathSessions.openSessionModal.bind(window.lr_breathSessions));
      ['startSession','openSession','openBreathHotfix','openBreathHotfixModal','openBreathModal'].forEach(function(n){
        try { if(typeof window[n] === 'function') candidates.push(window[n].bind(window)); } catch(e){}
      });
    } catch(e){}
    return candidates;
  }

  // attach behavior to our button (non-passive)
  function attachInjectorBehavior(){
    var ref = ensureInjectorButton();
    var btn = ref.button;
    if(!btn) return;
    if(btn._resp_attached) return;
    btn._resp_attached = true;

    var safeOpeners = findSafeOpeners();
    var orig = findOriginalElement();

    btn.addEventListener('click', function(){
      try {
        btn.classList.add('resp-pressed');
        setTimeout(function(){ btn.classList.remove('resp-pressed'); }, 200);

        // 1. try safe openers
        for(var i=0;i<safeOpeners.length;i++){
          try { safeOpeners[i](); return; } catch(e){}
        }
        // 2. fallback inline onclick on original
        if(orig){
          try {
            var inline = orig.getAttribute && orig.getAttribute('onclick');
            if(inline && typeof orig.onclick === 'function'){ orig.onclick(); return; }
            if(typeof orig.click === 'function'){ orig.click(); return; }
          } catch(e){}
        }
        // 3. last resort dispatch click
        var ev = new MouseEvent('click', { bubbles:true, cancelable:true, view:window });
        btn.dispatchEvent(ev);
      } catch(e){ console.warn('[RespirarSmartInjector] click handler error', e); }
    }, false);

    btn.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); btn.click(); } }, false);

    // animation
    if(_animTimer) clearInterval(_animTimer);
    _animTimer = setInterval(function(){
      try {
        if(document.hidden) return;
        if(isModalOpen()) return;
        btn.classList.add('resp-pulse');
        setTimeout(function(){ btn.classList.remove('resp-pulse'); }, 780);
      } catch(e){}
    }, ANIM_INTERVAL);
  }

  // find first original element from candidates
  function findOriginalElement(){
    for(var i=0;i<CANDIDATE_SELECTORS.length;i++){
      try {
        var el = q(CANDIDATE_SELECTORS[i]);
        if(el) return el;
      } catch(e){}
    }
    return null;
  }

  // scan & hide originals and return whether any hidden
  function doHideOriginals(){
    return scanAndHideOnce();
  }

  // Observe DOM to re-hide originals if recreated and to reposition injector
  function startObservers(){
    // original creator observer
    if(_origObserver) try {_origObserver.disconnect(); } catch(e){}
    _origObserver = new MutationObserver(function(muts){
      var added = muts.some(function(m){ return m.addedNodes && m.addedNodes.length > 0; });
      if(added){
        setTimeout(function(){ doHideOriginals(); scheduleReposition(90); ensureInjectorButton(); attachInjectorBehavior(); }, 60);
      }
    });
    try { _origObserver.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['id','class','data-action'] }); } catch(e){}

    // card observer
    if(_cardObserver) try {_cardObserver.disconnect(); } catch(e){}
    var card = q('.frase-card') || document.body;
    _cardObserver = new MutationObserver(function(){ scheduleReposition(50); });
    try { _cardObserver.observe(card, { childList:true, subtree:true, attributes:true, characterData:true }); } catch(e){}

    // window handlers
    if(_resizeHandler) try { window.removeEventListener('resize', _resizeHandler, { passive:true }); } catch(e){}
    if(_scrollHandler) try { window.removeEventListener('scroll', _scrollHandler, { passive:true }); } catch(e){}
    _resizeHandler = function(){ scheduleReposition(120); };
    _scrollHandler = function(){ scheduleReposition(80); };
    window.addEventListener('resize', _resizeHandler, { passive:true });
    window.addEventListener('scroll', _scrollHandler, { passive:true });

    // initial attempt
    setTimeout(function(){ doHideOriginals(); }, 40);
  }

  // stop observers and timers
  function stopObservers(){
    try { if(_origObserver){ _origObserver.disconnect(); _origObserver = null; } } catch(e){}
    try { if(_cardObserver){ _cardObserver.disconnect(); _cardObserver = null; } } catch(e){}
    try { if(_resizeHandler){ window.removeEventListener('resize', _resizeHandler, { passive:true }); _resizeHandler = null; } } catch(e){}
    try { if(_scrollHandler){ window.removeEventListener('scroll', _scrollHandler, { passive:true }); _scrollHandler = null; } } catch(e){}
    try { if(_animTimer){ clearInterval(_animTimer); _animTimer = null; } } catch(e){}
    if(_reposTimer) { clearTimeout(_reposTimer); _reposTimer = null; }
  }

  // BLOCK logic:
  // When a session modal is closed (we consider that as session end), block re-showing the button until user re-enters.
  function isBlocked(){
    try { return localStorage.getItem(BLOCK_KEY) === '1'; } catch(e){ return false; }
  }
  function setBlocked(){
    try { localStorage.setItem(BLOCK_KEY, '1'); } catch(e){}
  }
  function resetBlocked(){
    try { localStorage.removeItem(BLOCK_KEY); } catch(e){}
  }

  // Monitor session modal: wrap openSessionModal to install a modal-close observer
  function installSessionFinishWatcher(){
    try {
      // If there's already a wrapper, don't re-wrap
      if(window.__respirar_session_wrapper_installed) return;
      window.__respirar_session_wrapper_installed = true;

      // Helper to watch for modal close and then mark blocked
      function watchModalCloseOnce(){
        // modal candidates referenced in repo: '#__lr_temp_session_modal', '.lr-modal-card', '#__lr_hotfix_floating', '#lr_session_controls'
        var selectors = ['#__lr_temp_session_modal','.lr-modal-card','#__lr_hotfix_floating','#lr_session_controls','[data-lr-session-modal]'];
        var modal = null;
        for(var i=0;i<selectors.length;i++){
          try { modal = document.querySelector(selectors[i]); if(modal) break; } catch(e){}
        }
        if(!modal){
          // maybe modal not yet inserted; try again shortly
          setTimeout(watchModalCloseOnce, 200);
          return;
        }
        // observe modal removal
        var mo = new MutationObserver(function(muts){
          // if modal removed from DOM or hidden, treat as session finished
          if(!document.body.contains(modal) || (window.getComputedStyle(modal).display === 'none' || window.getComputedStyle(modal).visibility === 'hidden')){
            try { mo.disconnect(); } catch(e){}
            // set block and remove our injector button
            setBlocked();
            try { window.RespirarSmartInjector && window.RespirarSmartInjector.restore && window.RespirarSmartInjector.restore(); } catch(e){}
            console.debug('[RespirarSmartInjector] session finished -> blocked injector until re-entry');
          }
        });
        try { mo.observe(document.body, { childList:true, subtree:true }); } catch(e){}
        // also attempt a fallback poll: when modal disappears
        var poll = setInterval(function(){
          if(!document.body.contains(modal) || (window.getComputedStyle(modal).display === 'none' || window.getComputedStyle(modal).visibility === 'hidden')){
            clearInterval(poll);
            try { mo.disconnect(); } catch(e){}
            setBlocked();
            try { window.RespirarSmartInjector && window.RespirarSmartInjector.restore && window.RespirarSmartInjector.restore(); } catch(e){}
            console.debug('[RespirarSmartInjector] session finished (poll) -> blocked injector until re-entry');
          }
        }, 500);
      }

      // wrap openSessionModal
      var origOpen = window.openSessionModal;
      if(typeof origOpen === 'function'){
        window.openSessionModal = function(){
          try { var res = origOpen.apply(this, arguments); } catch(e){ try { origOpen.call(this, arguments && arguments[0]); } catch(e){} }
          // when opened, watch for modal close
          setTimeout(watchModalCloseOnce, 160);
          return res;
        };
      }

      // also wrap lr_breathSessions.openSessionModal if present
      try {
        if(window.lr_breathSessions && typeof window.lr_breathSessions.openSessionModal === 'function'){
          var orig2 = window.lr_breathSessions.openSessionModal.bind(window.lr_breathSessions);
          window.lr_breathSessions.openSessionModal = function(){
            try { var r = orig2.apply(this, arguments); } catch(e){}
            setTimeout(watchModalCloseOnce, 160);
            return r;
          };
        }
      } catch(e){}
    } catch(e){ console.warn('[RespirarSmartInjector] installSessionFinishWatcher error', e); }
  }

  // Initialize or early-exit if blocked
  function init(){
    injectCSS();

    // Always keep originals hidden (so user doesn't see original duplicate)
    scanAndHideOnce();

    // If blocked (user finished earlier) do not create injector button; only keep hiding originals
    if(isBlocked()){
      // start an observer to continue hiding originals if they reappear
      startObservers();
      installSessionFinishWatcher(); // still safe to install wrapper
      console.debug('[RespirarSmartInjector] blocked by previous session end; injector not shown.');
      return;
    }

    // normal flow: create injector, attach behavior, observers
    ensureInjectorButton();
    attachInjectorBehavior();
    scheduleReposition(180);
    startObservers();
    installSessionFinishWatcher();
  }

  // Public API
  window.RespirarSmartInjector = window.RespirarSmartInjector || {};
  window.RespirarSmartInjector.reposition = function(){ scheduleReposition(0); };
  window.RespirarSmartInjector.getButton = function(){ var ref = ensureInjectorButton(); return ref && ref.button; };
  window.RespirarSmartInjector.restore = function(){
    try {
      stopObservers();
      // reveal originals hidden by us
      var nodes = document.querySelectorAll('['+HIDDEN_ATTR+'="1"]');
      Array.from(nodes).forEach(function(n){ try { n.style.visibility = ''; n.removeAttribute(HIDDEN_ATTR); } catch(e){} });
      // remove our container and style
      var c = document.getElementById(CONTAINER_ID); if(c && c.parentNode) c.parentNode.removeChild(c);
      var s = document.getElementById(STYLE_ID); if(s && s.parentNode) s.parentNode.removeChild(s);
      window._respirar_smart_injector_loaded = false;
      return true;
    } catch(e){ console.warn('[RespirarSmartInjector] restore error', e); return false; }
  };
  // Reset the block so button will show again (useful for testing or if the user re-enters)
  window.RespirarSmartInjector.resetBlock = function(){
    try { localStorage.removeItem(BLOCK_KEY); return true; } catch(e){ return false; }
  };

  // Run init after a short delay so page scripts can initialize
  setTimeout(init, 120);

  console.debug('[RespirarSmartInjector] v1.1 loaded');

})();
