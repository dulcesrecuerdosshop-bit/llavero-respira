// session-controls-enhancer.js - improved robust enhancer (v3)
// - Detects breath-sessions panel (#lr_session_controls) and makes it draggable + minimizable.
// - This revision repositions the minimize button to avoid overlapping the modal's internal close "X".
// - Non-invasive: does not modify breath-sessions.js logic or event handlers.
// - Include this script AFTER breath-sessions.js (defer) in index.html.

(function () {
  'use strict';

  const CONTROL_ID = 'lr_session_controls';
  const FAB_ID = 'lr_session_controls_fab';
  const STORAGE_KEY_POS = 'lr_session_controls_pos_v1';
  const STORAGE_KEY_MIN = 'lr_session_controls_min_v1';
  const POLL_INTERVAL = 800;
  const POLL_TIMEOUT = 30 * 1000; // stop polling after 30s

  // small util helpers
  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function on(el, ev, fn, opts) { try { el.addEventListener(ev, fn, opts || false); } catch(e){} }
  function off(el, ev, fn, opts) { try { el.removeEventListener(ev, fn, opts || false); } catch(e){} }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // create or return the FAB
  function ensureFab() {
    let fab = document.getElementById(FAB_ID);
    if (fab) return fab;
    fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.title = 'Mostrar controles';
    fab.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483650',
      'width:56px',
      'height:56px',
      'border-radius:50%',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:linear-gradient(90deg,#77c8ff,#a4e6c6)',
      'border:none',
      'box-shadow:0 8px 24px rgba(0,0,0,0.12)',
      'cursor:pointer',
      'font-weight:800',
      'font-size:20px',
      'color:#072032'
    ].join(';');
    fab.textContent = '●';
    document.body.appendChild(fab);
    on(fab, 'click', function () {
      try {
        fab.style.display = 'none';
        const panel = document.getElementById(CONTROL_ID);
        if (panel) panel.style.display = '';
        localStorage.setItem(STORAGE_KEY_MIN, '0');
      } catch(e){}
    });
    return fab;
  }

  // remove FAB if panel removed
  function removeFabIfOrphaned() {
    const panel = document.getElementById(CONTROL_ID);
    const fab = document.getElementById(FAB_ID);
    if (!panel && fab) try { fab.remove(); } catch(e){}
  }

  // persistent position load/save
  function savePosition(el) {
    try {
      const left = parseInt(el.style.left, 10);
      const top = parseInt(el.style.top, 10);
      if (!Number.isNaN(left) && !Number.isNaN(top)) {
        localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({ x: left, y: top }));
      }
    } catch(e){}
  }
  function restorePosition(el) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_POS);
      if (!raw) return false;
      const pos = JSON.parse(raw);
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        el.style.left = pos.x + 'px';
        el.style.top  = pos.y + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        return true;
      }
    } catch(e){}
    return false;
  }

  // Make a handle draggable via pointer/touch events (safe)
  function makeDraggable(handleEl, targetEl) {
    if (!handleEl || !targetEl) return;

    let dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

    function pointerDown(e) {
      try {
        if (e.button !== undefined && e.button !== 0) return;
        dragging = true;
        try { handleEl.setPointerCapture && handleEl.setPointerCapture(e.pointerId); } catch(e){}
        startX = e.clientX; startY = e.clientY;
        const r = targetEl.getBoundingClientRect();
        origLeft = r.left; origTop = r.top;
        handleEl.style.cursor = 'grabbing';
        e.preventDefault && e.preventDefault();
      } catch(e){}
    }
    function pointerMove(e) {
      try {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const nx = clamp(origLeft + dx, 6, Math.max(6, window.innerWidth - targetEl.offsetWidth - 6));
        const ny = clamp(origTop  + dy, 6, Math.max(6, window.innerHeight - targetEl.offsetHeight - 6));
        targetEl.style.left = nx + 'px';
        targetEl.style.top = ny + 'px';
        targetEl.style.right = 'auto';
        targetEl.style.bottom = 'auto';
      } catch(e){}
    }
    function pointerUp(e) {
      try {
        if (!dragging) return;
        dragging = false;
        try { handleEl.releasePointerCapture && handleEl.releasePointerCapture(e.pointerId); } catch(e){}
        handleEl.style.cursor = 'grab';
        savePosition(targetEl);
      } catch(e){}
    }

    on(handleEl, 'pointerdown', pointerDown);
    on(window, 'pointermove', pointerMove);
    on(window, 'pointerup', pointerUp);

    // touch fallback for older browsers
    on(handleEl, 'touchstart', function (t) { pointerDown(t.changedTouches ? t.changedTouches[0] : t); }, { passive:false });
    on(window, 'touchmove', function (t) { pointerMove(t.changedTouches ? t.changedTouches[0] : t); }, { passive:false });
    on(window, 'touchend', function (t) { pointerUp(t.changedTouches ? t.changedTouches[0] : t); }, { passive:false });
  }

  // Reposition minimize button to avoid overlap with modal close X
  function positionMinBtn(panel, minBtn) {
    try {
      // detect an internal close button inside panel (modal close or similar)
      const closeSelectors = ['.lr-modal-close', '[aria-label="Cerrar"]', '.modal-close', '.close'];
      let closeBtn = null;
      for (const sel of closeSelectors) {
        closeBtn = panel.querySelector(sel);
        if (closeBtn) break;
      }

      // default placement: slightly outside top-right
      minBtn.style.position = 'absolute';
      minBtn.style.top = '-12px';
      minBtn.style.zIndex = '2147483701';
      // If there's a close button, prefer placing minimize on the opposite (left) side to avoid overlap
      if (closeBtn) {
        minBtn.style.left = '-12px';
        minBtn.style.right = 'auto';
      } else {
        minBtn.style.right = '-12px';
        minBtn.style.left = 'auto';
      }

      // safety: if panel is narrow, push minBtn further out
      const pRect = panel.getBoundingClientRect();
      if (pRect.width < 220) {
        // push it further out so it doesn't overlay content
        if (minBtn.style.left !== 'auto') minBtn.style.left = '-20px';
        if (minBtn.style.right !== 'auto') minBtn.style.right = '-20px';
      }
    } catch (e) { /* non-fatal */ }
  }

  // Enhance the panel element (add handle, minimize button, etc.)
  function enhancePanel(panel) {
    if (!panel || panel.dataset?.lrEnhanced === '1') return;
    try {
      panel.dataset.lrEnhanced = '1';

      // ensure fixed positioning so moving is meaningful
      const cs = getComputedStyle(panel);
      if (cs.position === 'static' || !cs.position) {
        panel.style.position = 'fixed';
        panel.style.right = '18px';
        panel.style.bottom = '18px';
      }
      panel.style.zIndex = panel.style.zIndex || '2147483647';
      panel.style.touchAction = panel.style.touchAction || 'none';
      panel.style.minWidth = panel.style.minWidth || '220px';

      // find or create a handle (prefer an existing header)
      let handle = panel.querySelector('.lr-session-handle') || panel.querySelector('div');
      if (!handle) {
        handle = document.createElement('div');
        handle.className = 'lr-session-handle';
        panel.insertBefore(handle, panel.firstChild);
      }

      // style handle for usability
      try {
        handle.style.cursor = handle.style.cursor || 'grab';
        handle.style.userSelect = handle.style.userSelect || 'none';
        handle.style.padding = handle.style.padding || '6px';
      } catch (e){}

      // add a clearly visible minimize button (floating circular) that avoids overlapping internal close
      let minBtn = panel.querySelector('.lr-session-min-btn');
      if (!minBtn) {
        minBtn = document.createElement('button');
        minBtn.type = 'button';
        minBtn.className = 'lr-session-min-btn';
        minBtn.setAttribute('aria-label','Minimizar controles de sesión');
        // base style; exact placement adjusted by positionMinBtn()
        minBtn.style.cssText = [
          'width:36px',
          'height:36px',
          'border-radius:50%',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'background:#ffffff',
          'color:#072032',
          'border:1px solid rgba(0,0,0,0.08)',
          'box-shadow:0 6px 18px rgba(0,0,0,0.12)',
          'cursor:pointer',
          'z-index:2147483701',
          'font-size:16px',
          'padding:0'
        ].join(';');
        minBtn.innerHTML = '<span aria-hidden="true">−</span>';
        panel.appendChild(minBtn);
      }

      // create FAB
      const fab = ensureFab();

      // minimize action
      on(minBtn, 'click', function (ev) {
        try {
          ev && ev.stopPropagation && ev.stopPropagation();
          panel.style.display = 'none';
          fab.style.display = 'flex';
          localStorage.setItem(STORAGE_KEY_MIN, '1');
        } catch(e){}
      });

      // restore position if saved
      restorePosition(panel);

      // make draggable by handle
      makeDraggable(handle, panel);

      // position minimize button carefully to avoid overlap
      positionMinBtn(panel, minBtn);

      // observe panel children for presence of close button and adjust
      const innerMo = new MutationObserver(function () {
        positionMinBtn(panel, minBtn);
      });
      try { innerMo.observe(panel, { childList:true, subtree:true, attributes:false }); } catch(e){}

      // position adjust on resize
      on(window, 'resize', function(){ positionMinBtn(panel, minBtn); });

      // ensure FAB visibility respects minimized state saved earlier
      try {
        const minState = localStorage.getItem(STORAGE_KEY_MIN);
        if (minState === '1') {
          panel.style.display = 'none';
          fab.style.display = 'flex';
        } else {
          fab.style.display = 'none';
        }
      } catch(e){}

    } catch (err) {
      console.warn('[lr-enhancer] enhancePanel error', err);
    }
  }

  // Try to find and enhance the panel right away
  function tryEnhanceNow() {
    const panel = document.getElementById(CONTROL_ID);
    if (panel) enhancePanel(panel);
  }

  // MutationObserver: watch for insertion/removal of session controls
  const mo = new MutationObserver(function (mutations) {
    try {
      mutations.forEach(m => {
        (m.addedNodes || []).forEach(node => {
          try {
            if (!(node instanceof Element)) return;
            if (node.id === CONTROL_ID) { enhancePanel(node); return; }
            const nested = node.querySelector && (node.querySelector('#' + CONTROL_ID) || node.querySelector('[id="lr_session_controls"]'));
            if (nested) enhancePanel(nested);
          } catch(e){}
        });
        (m.removedNodes || []).forEach(node => {
          try {
            if (!(node instanceof Element)) return;
            if (node.id === CONTROL_ID || (node.querySelector && node.querySelector('#' + CONTROL_ID))) {
              removeFabIfOrphaned();
            }
          } catch(e){}
        });
      });
    } catch(e) {}
  });

  function startObserver() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      document.addEventListener('DOMContentLoaded', function () {
        mo.observe(document.body, { childList: true, subtree: true });
      });
    }
  }

  // Polling fallback in case panel insertion is not caught
  let pollTimer = null;
  function startPolling() {
    const start = Date.now();
    pollTimer = setInterval(function () {
      try {
        tryEnhanceNow();
        if (document.getElementById(CONTROL_ID)) {
          clearInterval(pollTimer); pollTimer = null;
        } else if (Date.now() - start > POLL_TIMEOUT) {
          clearInterval(pollTimer); pollTimer = null;
        }
      } catch(e){}
    }, POLL_INTERVAL);
  }

  // initial boot
  tryEnhanceNow();
  startObserver();
  startPolling();

  // cleanup on unload
  on(window, 'beforeunload', function () { try { mo.disconnect(); if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } } catch(e){} });

  // expose for debugging
  try { window.__lr_session_enhancer = { enhancePanel: enhancePanel, positionMinBtn: positionMinBtn }; } catch(e){}

})();
