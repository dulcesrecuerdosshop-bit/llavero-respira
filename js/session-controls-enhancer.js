// session-controls-enhancer.js
// Enhances the existing session controls created by breath-sessions.js
// - Makes the session controls draggable (pointer/touch friendly)
// - Adds a "minimize" behaviour that collapses the panel to a small FAB
// - Remembers position in localStorage so user placement persists
// - Safe and non-invasive: does not modify breath-sessions.js; works by observing DOM
//
// Install: add this file to the project and include it after breath-sessions.js
// Example: <script src="js/breath-sessions.js"></script>
//          <script src="js/session-controls-enhancer.js"></script>
//
// Notes:
// - Looks for panel with id "lr_session_controls" (created by breath-sessions.js).
// - If the panel structure changes, the enhancer attempts a best-effort enhancement
//   without removing existing functionality or event listeners.
//

(function () {
  'use strict';

  const STORAGE_KEY_POS = 'lr_session_controls_pos_v1';
  const STORAGE_KEY_MIN = 'lr_session_controls_min_v1';
  const CONTROL_ID = 'lr_session_controls';
  const FAB_ID = 'lr_session_controls_fab';
  const ENHANCED_FLAG = 'data-lr-enhanced';

  // Utils
  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function on(el, ev, fn, opts) { try { el.addEventListener(ev, fn, opts || false); } catch(e){} }
  function off(el, ev, fn, opts) { try { el.removeEventListener(ev, fn, opts || false); } catch(e){} }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Enhance a given session controls element
  function enhanceControls(panel) {
    try {
      if (!panel || panel.dataset && panel.dataset.lrEnhanced === '1') return;
      // mark enhanced
      try { panel.dataset.lrEnhanced = '1'; } catch(e) {}

      // Ensure panel is positioned so we can move it
      try {
        const cs = getComputedStyle(panel);
        if (cs.position === 'static' || !cs.position) {
          panel.style.position = 'fixed';
          panel.style.right = '18px';
          panel.style.bottom = '18px';
        }
        panel.style.zIndex = panel.style.zIndex || '2147483647';
        panel.style.touchAction = panel.style.touchAction || 'none';
      } catch (e) {}

      // Create or reuse a handle inside panel (try to find existing header)
      let handle = qs('.lr-session-handle', panel) || qs('div', panel); // fallback to first div
      let createdHandle = false;

      if (!handle) {
        handle = document.createElement('div');
        createdHandle = true;
      }

      // If we found a header-like element that seems to be first child and contains title,
      // use it as handle, otherwise create overlay handle
      const seemsGoodHandle = !!qs('strong', handle) || (handle === panel.firstElementChild);

      if (!seemsGoodHandle && !createdHandle) {
        // create a small overlay handle
        const overlay = document.createElement('div');
        overlay.className = 'lr-session-handle';
        overlay.style.cssText = 'position:absolute;left:8px;top:8px;padding:6px 8px;border-radius:8px;cursor:grab;z-index:9999;background:transparent;color:inherit';
        overlay.setAttribute('aria-hidden','true');
        panel.style.position = panel.style.position || 'fixed';
        panel.appendChild(overlay);
        handle = overlay;
        createdHandle = true;
      }

      // Ensure the handle has some styles for accessibility
      try {
        handle.classList.add('lr-session-handle');
        handle.style.cursor = handle.style.cursor || 'grab';
        handle.style.userSelect = handle.style.userSelect || 'none';
      } catch (e) {}

      // Create minimize button (small) if not present
      let minBtn = qs('.lr-session-min-btn', panel);
      if (!minBtn) {
        minBtn = document.createElement('button');
        minBtn.type = 'button';
        minBtn.className = 'lr-session-min-btn';
        minBtn.title = 'Minimizar controles';
        minBtn.innerHTML = '&#x23F5;'; // small icon
        minBtn.style.cssText = 'position:absolute;right:8px;top:8px;background:transparent;border:none;padding:6px;border-radius:6px;cursor:pointer;font-weight:700;';
        panel.appendChild(minBtn);
      }

      // Create FAB (if not exists globally)
      let fab = document.getElementById(FAB_ID);
      if (!fab) {
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
          'font-weight:800'
        ].join(';');
        fab.textContent = '●';
        document.body.appendChild(fab);
        on(fab, 'click', function () {
          try {
            fab.style.display = 'none';
            panel.style.display = '';
            localStorage.setItem(STORAGE_KEY_MIN, '0');
          } catch (e) {}
        });
      }

      // When panel removed externally, remove fab as well (handled by observer removal)
      // Minimize handler
      on(minBtn, 'click', function (ev) {
        try {
          ev && ev.stopPropagation && ev.stopPropagation();
          panel.style.display = 'none';
          fab.style.display = 'flex';
          localStorage.setItem(STORAGE_KEY_MIN, '1');
        } catch (e) {}
      });

      // Restore position if any saved
      try {
        const raw = localStorage.getItem(STORAGE_KEY_POS) || localStorage.getItem(STORAGE_KEY_POS.toLowerCase()) || null;
        if (raw) {
          const pos = JSON.parse(raw);
          if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
            panel.style.left = pos.x + 'px';
            panel.style.top = pos.y + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
          }
        }
        const minState = localStorage.getItem(STORAGE_KEY_MIN);
        if (minState === '1') {
          panel.style.display = 'none';
          fab.style.display = 'flex';
        }
      } catch (e) {}

      // Draggable implementation (pointer events)
      (function makeDraggable(handleEl, targetEl) {
        let dragging = false;
        let startX = 0, startY = 0, origLeft = 0, origTop = 0;

        function pointerDown(e) {
          try {
            // only primary button
            if (e.button !== undefined && e.button !== 0) return;
            dragging = true;
            // capture
            try { handleEl.setPointerCapture && handleEl.setPointerCapture(e.pointerId); } catch (e) {}
            startX = e.clientX; startY = e.clientY;
            const rect = targetEl.getBoundingClientRect();
            origLeft = rect.left; origTop = rect.top;
            handleEl.style.cursor = 'grabbing';
            e.preventDefault && e.preventDefault();
          } catch (err) {}
        }
        function pointerMove(e) {
          try {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const newLeft = clamp(origLeft + dx, 8, Math.max(8, window.innerWidth - targetEl.offsetWidth - 8));
            const newTop  = clamp(origTop  + dy, 8, Math.max(8, window.innerHeight - targetEl.offsetHeight - 8));
            targetEl.style.left = newLeft + 'px';
            targetEl.style.top = newTop + 'px';
            targetEl.style.right = 'auto';
            targetEl.style.bottom = 'auto';
          } catch (err) {}
        }
        function pointerUp(e) {
          try {
            if (!dragging) return;
            dragging = false;
            try { handleEl.releasePointerCapture && handleEl.releasePointerCapture(e.pointerId); } catch(e){}
            handleEl.style.cursor = 'grab';
            // persist position
            try {
              const left = parseInt(targetEl.style.left, 10) || targetEl.getBoundingClientRect().left;
              const top  = parseInt(targetEl.style.top, 10)  || targetEl.getBoundingClientRect().top;
              localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({ x: left, y: top }));
            } catch (err) {}
          } catch (err) {}
        }

        on(handleEl, 'pointerdown', pointerDown);
        on(window, 'pointermove', pointerMove);
        on(window, 'pointerup', pointerUp);

        // fallback for touch-only older browsers
        on(handleEl, 'touchstart', function (t) { pointerDown(t.changedTouches ? t.changedTouches[0] : t); }, { passive: false });
        on(window, 'touchmove', function (t) { pointerMove(t.changedTouches ? t.changedTouches[0] : t); }, { passive: false });
        on(window, 'touchend', function (t) { pointerUp(t.changedTouches ? t.changedTouches[0] : t); }, { passive: false });
      })(handle, panel);

      // expose a small api on the panel for introspection
      try { panel.__lr_enhanced = true; } catch (e) {}

    } catch (err) {
      console.warn('[lr-enhancer] enhanceControls failed', err);
    }
  }

  // Observer to detect insertion/removal of session controls
  const mo = new MutationObserver(function (mutations) {
    try {
      mutations.forEach(m => {
        // additions
        m.addedNodes && m.addedNodes.forEach(node => {
          try {
            if (!(node instanceof Element)) return;
            // direct match by id
            if (node.id === CONTROL_ID || node.querySelector && node.querySelector('#lr_ctrl_timer')) {
              enhanceControls(node.id === CONTROL_ID ? node : qs('#' + CONTROL_ID) || node);
            } else {
              // maybe the panel is nested somewhere deeper
              const panel = node.querySelector && (node.querySelector('#' + CONTROL_ID) || node.querySelector('[id="lr_session_controls"]'));
              if (panel) enhanceControls(panel);
            }
          } catch (e) {}
        });

        // removals: if removed node is panel, cleanup FAB
        m.removedNodes && m.removedNodes.forEach(node => {
          try {
            if (!(node instanceof Element)) return;
            if (node.id === CONTROL_ID || node.querySelector && node.querySelector('#' + CONTROL_ID)) {
              const f = document.getElementById(FAB_ID);
              if (f) try { f.remove(); } catch(e) {}
            }
          } catch (e) {}
        });
      });
    } catch (e) {
      console.warn('[lr-enhancer] observer error', e);
    }
  });

  // Start observing body
  try {
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {
    // If body not present yet, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
      mo.observe(document.body, { childList: true, subtree: true });
      // also try to enhance existing panel if already present
      const existing = document.getElementById(CONTROL_ID) || qs('#' + CONTROL_ID) || qs('#lr_ctrl_timer') && qs('#lr_ctrl_timer').closest('div');
      if (existing) enhanceControls(existing);
    });
  }

  // Also attempt immediate enhancement if already present
  try {
    const panelNow = document.getElementById(CONTROL_ID);
    if (panelNow) enhanceControls(panelNow);
  } catch (e) {}

  // When page unload, disconnect observer (cleanup)
  on(window, 'beforeunload', function () {
    try { mo.disconnect(); } catch (e) {}
  });

  // Expose for debugging if needed
  try { window.__lr_session_enhancer = { enhanceControls: enhanceControls }; } catch (e) {}

})();
