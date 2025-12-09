(function(){
  if (window.__moodLevelInjector) { console.log('mood level injector already installed'); return; }
  window.__moodLevelInjector = { };

  // Mapping por nivel -> preset (ajústalo si prefieres otros presets)
  const LEVEL_TO_PRESET = {
    1: 'box',   // leve
    2: 'calm',  // moderado bajo
    3: 'calm',  // moderado alto
    4: '478',   // alto
    5: '478'    // muy alto / crisis
  };

  function createOverlay() {
    const ov = document.createElement('div');
    ov.id = '__mood_level_overlay';
    ov.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);z-index:2147484000';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:18px;max-width:320px;width:90%;text-align:center;font-family:system-ui">
        <h3 style="margin:0 0 8px">¿Qué nivel de ansiedad tienes?</h3>
        <div style="margin-bottom:12px">
          <input id="__mood_level_range" type="range" min="1" max="5" value="3" style="width:100%">
          <div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-top:6px">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
          </div>
          <div id="__mood_level_preview" style="margin-top:8px;font-weight:700">Nivel 3</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button id="__mood_level_cancel" style="padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:white;cursor:pointer">Cancelar</button>
          <button id="__mood_level_ok" style="padding:8px 12px;border-radius:8px;border:none;background:linear-gradient(90deg,#56c0ff,#8ee7c8);color:#002;font-weight:700;cursor:pointer">Aplicar</button>
        </div>
      </div>`;
    return ov;
  }

  function openLevelOverlay(defaultLevel, callback) {
    let ov = document.getElementById('__mood_level_overlay');
    if (ov) ov.remove();
    ov = createOverlay();
    document.body.appendChild(ov);
    const range = ov.querySelector('#__mood_level_range');
    const preview = ov.querySelector('#__mood_level_preview');
    const cancel = ov.querySelector('#__mood_level_cancel');
    const ok = ov.querySelector('#__mood_level_ok');
    range.value = defaultLevel || 3;
    preview.textContent = 'Nivel ' + range.value;
    range.addEventListener('input', () => preview.textContent = 'Nivel ' + range.value);
    cancel.addEventListener('click', () => { ov.remove(); });
    ok.addEventListener('click', () => {
      const lvl = Number(range.value || 3);
      try { callback && callback(lvl); } catch(e){ console.warn(e); }
      ov.remove();
    });
  }

  // Merge, persist y broadcast helper
  function applyLevelUpdate(updates) {
    try {
      window.CLIENT_USER = Object.assign({}, window.CLIENT_USER || {}, updates);
      try { localStorage.setItem('lr_client_runtime', JSON.stringify(window.CLIENT_USER)); } catch(e){}
      try { if (typeof window.saveClientRuntime === 'function') window.saveClientRuntime(updates); } catch(e){}
      // dispatch event
      window.dispatchEvent(new CustomEvent('lr:clientUpdated', { detail: window.CLIENT_USER }));
      // force recalc phrase
      try { if (typeof window.PhraseSelector === 'object' && typeof window.PhraseSelector.selectAndMark === 'function') {
        const r = window.PhraseSelector.selectAndMark(window.CLIENT_USER);
        // update in-memory client again if changed
        if (r && r.updatedClient) window.CLIENT_USER = r.updatedClient;
      }} catch(e){}
      // apply preset to helpers if available
      try { 
        const preset = window.CLIENT_USER && window.CLIENT_USER.suggestedBreathingType;
        if (preset && window.lr_helpers && typeof window.lr_helpers.setBreathPattern === 'function') {
          window.lr_helpers.setBreathPattern(preset);
        }
      } catch(e){}
      console.log('[mood-level] applied updates', updates, 'CLIENT_USER now', window.CLIENT_USER);
    } catch(e){ console.warn('[mood-level] apply error', e); }
  }

  // Delegated click handler: intercept mood buttons and show level selector when needed
  function delegatedHandler(ev) {
    try {
      const t = ev.target;
      const btn = t.closest && t.closest('button,div,span') ? t.closest('button,div,span') : null;
      if (!btn) return;
      const txt = ((btn.id || btn.textContent) || '').toString().toLowerCase();
      // detect anxiety-like moods (ansiedad, crisis, pasando mal)
      if (/(mood-ansiedad|ansiedad|con ansiedad|lo estoy pasando mal|crisis)/i.test(txt)) {
        ev.stopPropagation && ev.stopPropagation(); // allow modal logic to proceed but we show overlay after
        // default level from existing client or 3
        const defaultLevel = (window.CLIENT_USER && Number(window.CLIENT_USER.nivelDeAnsiedad)) || 3;
        setTimeout(function(){ // show overlay after original modal handlers run
          openLevelOverlay(defaultLevel, function(level){
            // map level to suggested breathing type
            const suggested = LEVEL_TO_PRESET[level] || LEVEL_TO_PRESET[3];
            // Build updates: set estadoEmocionalActual and nivelDeAnsiedad
            const updates = { estadoEmocionalActual: 'ansiedad', nivelDeAnsiedad: Number(level), suggestedBreathingType: suggested };
            applyLevelUpdate(updates);
          });
        }, 40);
      }
      // for "Lo estoy pasando mal" we can default to crisis-level suggestion but still ask user
      if (/(mood-crisis|lo estoy pasando mal|crisis)/i.test(txt)) {
        const defaultLevel = Math.max((window.CLIENT_USER && Number(window.CLIENT_USER.nivelDeAnsiedad)) || 4, 4);
        setTimeout(function(){
          openLevelOverlay(defaultLevel, function(level){
            const suggested = LEVEL_TO_PRESET[level] || LEVEL_TO_PRESET[5];
            const updates = { estadoEmocionalActual: 'crisis', nivelDeAnsiedad: Number(level), suggestedBreathingType: suggested };
            applyLevelUpdate(updates);
          });
        }, 40);
      }
    } catch(e){ console.warn('[mood-level] delegated error', e); }
  }

  // Start listening (non-destructive)
  document.addEventListener('click', delegatedHandler, true);
  window.__moodLevelInjector.stop = function(){ try { document.removeEventListener('click', delegatedHandler, true); document.getElementById('__mood_level_overlay')?.remove(); delete window.__moodLevelInjector; console.log('mood-level injector stopped'); } catch(e){} };
  console.log('mood-level injector installed (console). Will prompt for level on anxiety/crisis buttons.');
})();
