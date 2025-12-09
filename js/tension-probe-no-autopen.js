// tension-probe-no-autopen.js
// Variant that PREPARES the session on "Tenso/a" selection but DOES NOT open/start it.
// Only opens the session modal when the user clicks the "Respirar" / open-session button.
//
// Usage: paste in console (or save & load after load-user.js). Undo with window.__tensionProbe_stop()

(function(){
  if (window.__tensionProbeNoAuto) { console.log('tensionProbeNoAuto already installed'); return; }
  window.__tensionProbeNoAuto = true;

  // config
  window.__tensionProbeConfig = Object.assign({
    debug: true
  }, window.__tensionProbeConfig || {});

  function dbg(){ if (window.__tensionProbeConfig.debug) console.log.apply(console, ['[tensionProbeNoAuto]'].concat(Array.from(arguments))); }

  const MAP = {
    'nervioso':     { preset: 'box',  categoryHint: 'motivacion', defaultSeconds: 60 },
    'estres':       { preset: 'calm', categoryHint: 'calma',      defaultSeconds: 180 },
    'anticipacion': { preset: 'calm', categoryHint: 'validacion', defaultSeconds: 180 },
    'muscular':     { preset: 'slow', categoryHint: 'anclaje',    defaultSeconds: 300 },
    'otro':         { preset: 'box',  categoryHint: 'rutina',     defaultSeconds: 60 }
  };

  // Overlay UI (same as before)
  function makeOverlayHtml(){
    return `
      <div style="background:#fff;border-radius:12px;padding:14px;max-width:360px;width:92%;font-family:system-ui;text-align:left">
        <h3 style="margin:0 0 8px;font-size:1.1rem">¿Qué tipo de tensión sientes?</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button data-t="nervioso" style="padding:8px;border-radius:8px">Nervioso / Irritable</button>
          <button data-t="estres" style="padding:8px;border-radius:8px">Estresado por trabajo / presión</button>
          <button data-t="anticipacion" style="padding:8px;border-radius:8px">Preocupación anticipatoria</button>
          <button data-t="muscular" style="padding:8px;border-radius:8px">Tensión muscular (cuello, mandíbula)</button>
          <button data-t="otro" style="padding:8px;border-radius:8px">Otro / No sé</button>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button id="__tens_cancel" style="padding:8px;border-radius:8px">Cancelar</button>
          </div>
        </div>
      </div>`;
  }

  function openTensionOverlay(onChoose){
    const id = '__tension_overlay';
    let ov = document.getElementById(id);
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = id;
    ov.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:2147484100';
    ov.innerHTML = makeOverlayHtml();
    document.body.appendChild(ov);
    ov.querySelectorAll('button[data-t]').forEach(b => {
      b.addEventListener('click', () => {
        const key = b.getAttribute('data-t');
        try { onChoose && onChoose(key); } catch(e){ console.warn(e); }
        ov.remove();
      });
    });
    const cancel = ov.querySelector('#__tens_cancel');
    if (cancel) cancel.addEventListener('click', ()=>ov.remove());
  }

  function persistClient(user){
    try { localStorage.setItem('lr_client_runtime', JSON.stringify(user)); } catch(e){}
    try { if (typeof window.saveClientRuntime === 'function') window.saveClientRuntime(user); } catch(e){}
  }

  function safeApplyPreset(preset){
    try {
      if (window.lr_helpers && typeof window.lr_helpers.setBreathPattern === 'function') {
        window.lr_helpers.setBreathPattern(preset);
        dbg('applied preset via lr_helpers.setBreathPattern ->', preset);
        return true;
      }
    } catch(e){ console.warn('[tensionProbeNoAuto] setBreathPattern error', e); }
    return false;
  }

  // APPLY selection: prepare client and set PREPARED FLAG, but DO NOT open/start session
  function applyTensionUpdate(tensionKey){
    const entry = MAP[tensionKey] || MAP['otro'];
    const updates = {
      tensionTipo: tensionKey,
      suggestedBreathingType: entry.preset,
      estadoEmocionalActual: 'tenso',
      nivelDeAnsiedad: (window.CLIENT_USER && Number(window.CLIENT_USER.nivelDeAnsiedad)) || 1
    };

    try {
      // update runtime & persist
      window.CLIENT_USER = Object.assign({}, window.CLIENT_USER || {}, updates);
      persistClient(window.CLIENT_USER);
      window.dispatchEvent(new CustomEvent('lr:clientUpdated', { detail: window.CLIENT_USER }));
      dbg('updated CLIENT_USER (prepared):', window.CLIENT_USER);

      // recompute phrase & updatedClient for preview (informative)
      try {
        if (window.PhraseSelector && typeof window.PhraseSelector.selectAndMark === 'function') {
          const res = window.PhraseSelector.selectAndMark(window.CLIENT_USER);
          if (res && res.updatedClient) {
            window.CLIENT_USER = res.updatedClient;
            persistClient(window.CLIENT_USER);
            dbg('PhraseSelector chose (preview):', res.category, 'phrase:', res.phrase);
          }
        }
      } catch(e){ console.warn('[tensionProbeNoAuto] PhraseSelector error', e); }

      // apply preset to helpers (so UI/guide is prepared visually/audibly)
      safeApplyPreset(window.CLIENT_USER.suggestedBreathingType);

      // set prepared flag, but DO NOT open the session UI now
      window.__tensionProbePrepared = {
        suggestedType: window.CLIENT_USER.suggestedBreathingType,
        seconds: entry.defaultSeconds || 180,
        preparedAt: Date.now()
      };
      dbg('session PREPARED (no-open). To open modal, user must click "Respirar". prepared=', window.__tensionProbePrepared);
      console.log('[tensionProbeNoAuto] sesión PREPARADA (no abierta) ->', { preset: window.CLIENT_USER.suggestedBreathingType, seconds: window.__tensionProbePrepared.seconds });

    } catch(e){ console.warn('[tensionProbeNoAuto] applyTensionUpdate error', e); }
  }

  // Helper: decide if clicked element is a "open session / Respirar" control (outside modal)
  function isOpenSessionTrigger(el){
    if (!el || !(el instanceof Element)) return false;
    // do not trigger if inside a modal (we don't want to intercept modal internal buttons)
    if (el.closest && (el.closest('#__lr_temp_session_modal') || el.closest('.lr-modal-card') || el.closest('#__lr_hotfix_floating') || el.closest('#lr_session_controls'))) return false;
    const selList = ['.lr-open-session', '[data-lr-open-session]', '#respirar_btn', '.btn-breath', '[data-lr="session-start"]'];
    for (const sel of selList){
      try { if (el.matches(sel)) return true; } catch(e){}
    }
    // fallback: text match "respirar" in button content (case-insensitive)
    const txt = (el.textContent || '').toString().trim().toLowerCase();
    if (txt && txt.indexOf('respirar') !== -1) return true;
    return false;
  }

  // Intercept click on "Respirar" (capture phase) ONLY if we have a prepared session
  function openOnUserClickHandler(ev){
    try {
      const btn = ev.target && ev.target.closest ? ev.target.closest('button, a, div, span') : null;
      if (!btn) return;
      if (!window.__tensionProbePrepared) return; // nothing prepared -> do nothing
      if (!isOpenSessionTrigger(btn)) return;
      // If we reach here: user clicked a control that opens session AND we had prepared session -> open modal with prepared data
      ev.preventDefault && ev.preventDefault();
      ev.stopImmediatePropagation && ev.stopImmediatePropagation();
      const prepared = window.__tensionProbePrepared;
      try {
        dbg('User clicked Respirar while prepared -> opening modal with prepared values', prepared);
        if (typeof window.openSessionModal === 'function') {
          window.openSessionModal({ suggestedType: prepared.suggestedType, seconds: prepared.seconds });
          console.log('[tensionProbeNoAuto] opened session modal with prepared preset ->', prepared);
        } else if (typeof window.openBreathHotfix === 'function') {
          window.openBreathHotfix();
          console.log('[tensionProbeNoAuto] showed hotfix UI (prepared preset may need manual selection)');
        } else {
          // no UI available: just log; do NOT auto-start
          console.log('[tensionProbeNoAuto] prepared but no session UI available. User must start session manually.');
        }
      } catch(e){ console.warn('[tensionProbeNoAuto] open-on-click failed', e); }
      // clear the prepared flag after opening modal so next click needs a new preparation
      try { delete window.__tensionProbePrepared; } catch(e){}
    } catch(e){ console.warn('[tensionProbeNoAuto] openOnUserClickHandler error', e); }
  }

  // start delegated listener for "Tenso/a"
  function handler(ev){
    try {
      const btn = ev.target && ev.target.closest ? ev.target.closest('button,div,span') : null;
      if (!btn) return;
      const label = (btn.id || btn.textContent || '').toString().toLowerCase();
      if (/tenso|tenso\/a|tension/i.test(label)) {
        setTimeout(()=> openTensionOverlay(applyTensionUpdate), 50);
      }
    } catch(e){ console.warn('[tensionProbeNoAuto] handler error', e); }
  }

  // attach listeners: capture true for open-on-click so we can intercept before other handlers open modal
  document.addEventListener('click', handler, true);
  document.addEventListener('click', openOnUserClickHandler, true);

  // expose controls
  window.__tensionProbeNoAuto_stop = function(){
    try {
      document.removeEventListener('click', handler, true);
      document.removeEventListener('click', openOnUserClickHandler, true);
      document.getElementById('__tension_overlay')?.remove();
      delete window.__tensionProbeNoAuto;
      delete window.__tensionProbeNoAuto_stop;
      console.log('tensionProbeNoAuto stopped');
    } catch(e){}
  };
  window.__tensionProbeNoAuto_status = function(){ console.log('CLIENT_USER:', window.CLIENT_USER, 'prepared:', window.__tensionProbePrepared); };

  dbg('installed — will PREPARE session on "Tenso/a" and only OPEN modal when user clicks "Respirar".');
})();
