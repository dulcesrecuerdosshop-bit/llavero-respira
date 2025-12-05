// ============================================================
// BREATH SESSIONS — final (persistente, reinyectable, robusto)
// Basado en la implementación original (corrige desapariciones y race conditions).
// ============================================================

(function(){
  if (window._lr_breath_sessions_final_loaded) {
    console.log('[breath-sessions] already loaded (final)');
    return;
  }
  window._lr_breath_sessions_final_loaded = true;

  /* ---------------- CONFIG ---------------- */
  const SESSION_OPTIONS = [
    { id: "0", label: "Sin temporizador", seconds: 0 },
    { id: "60", label: "1 minuto", seconds: 60 },
    { id: "180", label: "3 minutos", seconds: 180 },
    { id: "300", label: "5 minutos", seconds: 300 }
  ];
  const PRESET_LABELS = { box:"Caja (4-4-4-4)", calm:"Calma suave", slow:"Lento", "478":"4-7-8" };

  /* ---------------- ESTADO ---------------- */
  let sessionActive = false;
  let sessionPaused = false;
  let sessionEndsAt = 0;
  let sessionInterval = null;
  let remainingSeconds = Infinity;

  /* ---------------- UTIL ---------------- */
  function makeUid(){ return Date.now().toString(36) + Math.floor(Math.random()*1000).toString(36); }
  function formatTime(s){ s = Math.max(0, Math.floor(s)); const mm = Math.floor(s/60), ss = s%60; return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }
  function safeLog(){ try { console.log.apply(console, ['[breath-sessions]', ...arguments]); } catch(e){} }
  function isVisible(node){ if(!node) return false; try{ const cs = getComputedStyle(node); return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && node.offsetParent !== null; } catch(e){ return false; } }
  function showToast(msg){ if(typeof window.lr_showToast === 'function'){ try{ window.lr_showToast(msg); return; }catch(e){} } console.log('[breath-sessions toast]', msg); }

  /* ---------------- SESSION CONTROLS (floating) ---------------- */
  function styleButton(btn, highlight){
    btn.style.padding = '8px';
    btn.style.borderRadius = '8px';
    btn.style.border = highlight ? 'none' : '1px solid rgba(0,0,0,0.08)';
    btn.style.background = highlight ? 'linear-gradient(90deg,#ffe7a8,#ffc37d)' : 'white';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';
    if(highlight) btn.style.color = '#4a2d00';
  }

  function showSessionControls(){
    removeSessionControls();
    const box = document.createElement('div');
    box.id = 'lr_session_controls';
    box.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:2147483647',
      'background:rgba(255,255,255,0.98)',
      'border-radius:12px',
      'box-shadow:0 10px 30px rgba(0,0,0,0.18)',
      'padding:12px',
      'min-width:220px',
      'font-family:system-ui,Segoe UI,Roboto,Arial',
      'pointer-events:auto'
    ].join(';');

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const title = document.createElement('strong');
    title.textContent = 'Sesión activa';
    title.style.fontSize = '1rem';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = removeSessionControls;
    header.appendChild(closeBtn);
    box.appendChild(header);

    const timerEl = document.createElement('div');
    timerEl.id = 'lr_ctrl_timer';
    timerEl.style.fontSize = '1.4rem';
    timerEl.style.fontWeight = '700';
    timerEl.style.textAlign = 'center';
    timerEl.style.margin = '8px 0';
    timerEl.textContent = remainingSeconds === Infinity ? '∞' : formatTime(remainingSeconds);
    box.appendChild(timerEl);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.marginTop = '6px';

    const pauseBtn = document.createElement('button');
    pauseBtn.id = 'lr_ctrl_pause';
    pauseBtn.style.flex = '1';
    styleButton(pauseBtn, false);
    pauseBtn.onclick = function(){ togglePause(); updatePauseButton(); };
    controls.appendChild(pauseBtn);

    const newBtn = document.createElement('button');
    newBtn.id = 'lr_ctrl_new';
    newBtn.style.flex = '1';
    styleButton(newBtn, true);
    newBtn.textContent = 'Nueva';
    newBtn.onclick = function(){ newSessionFlow(); };
    controls.appendChild(newBtn);

    box.appendChild(controls);

    const stopBtn = document.createElement('button');
    stopBtn.id = 'lr_ctrl_stop';
    stopBtn.textContent = 'Salir';
    stopBtn.style.marginTop = '8px';
    stopBtn.style.width = '100%';
    stopBtn.style.padding = '10px';
    stopBtn.style.borderRadius = '8px';
    stopBtn.style.border = 'none';
    stopBtn.style.fontWeight = '700';
    stopBtn.style.background = 'linear-gradient(90deg,#ff8a8a,#ff5d5d)';
    stopBtn.style.color = 'white';
    stopBtn.onclick = stopSession;
    box.appendChild(stopBtn);

    document.body.appendChild(box);
    updatePauseButton();
    updateTimerDisplay();
  }

  function removeSessionControls(){ const el = document.getElementById('lr_session_controls'); if(el) el.remove(); }
  function updatePauseButton(){ const btn = document.getElementById('lr_ctrl_pause'); if(!btn) return; btn.textContent = sessionPaused ? 'Continuar' : 'Pausar'; }
  function updateTimerDisplay(){ const el = document.getElementById('lr_ctrl_timer'); if(el) el.textContent = remainingSeconds === Infinity ? '∞' : formatTime(remainingSeconds); }

  /* ---------------- SESSION LOGIC ---------------- */
  function startSession(seconds){
    try {
      sessionActive = true;
      sessionPaused = false;
      if(window.lr_helpers && typeof window.lr_helpers.startBreathFlow === 'function'){
        try { window.lr_helpers.startBreathFlow(); } catch(e){ console.warn('lr_helpers.startBreathFlow error', e); }
      } else {
        showToast('Iniciando sesión (sin audio/guía)');
      }

      remainingSeconds = seconds > 0 ? seconds : Infinity;
      if(remainingSeconds !== Infinity){
        sessionEndsAt = Date.now() + remainingSeconds * 1000;
        clearInterval(sessionInterval);
        sessionInterval = setInterval(function(){
          if(!sessionActive || sessionPaused) return;
          remainingSeconds = Math.max(0, Math.ceil((sessionEndsAt - Date.now())/1000));
          updateTimerDisplay();
          if(remainingSeconds <= 0){
            stopSession();
            showToast('Sesión completada');
          }
        }, 1000);
      } else {
        updateTimerDisplay();
      }
      showSessionControls();
    } catch(e){
      console.error('[breath-sessions] startSession error', e);
    }
  }

  function pauseSession(){ if(!sessionActive) return; sessionPaused = true; clearInterval(sessionInterval); try{ window.lr_helpers?.stopBreathFlow?.(); window.lr_helpers?.stopAmbient?.(); }catch(e){} showToast('Sesión pausada'); updatePauseButton(); }
  function resumeSession(){ if(!sessionActive) return; sessionPaused = false; if(remainingSeconds !== Infinity){ sessionEndsAt = Date.now() + remainingSeconds * 1000; clearInterval(sessionInterval); sessionInterval = setInterval(function(){ if(!sessionActive || sessionPaused) return; remainingSeconds = Math.max(0, Math.ceil((sessionEndsAt - Date.now())/1000)); updateTimerDisplay(); if(remainingSeconds <= 0){ stopSession(); showToast('Sesión completada'); } }, 1000); } try{ window.lr_helpers?.startBreathFlow?.(); window.lr_helpers?.resumeAudio?.(); }catch(e){} showToast('Sesión reanudada'); updatePauseButton(); }
  function togglePause(){ if(sessionPaused) resumeSession(); else pauseSession(); }
  function stopSession(){ sessionActive = false; sessionPaused = false; clearInterval(sessionInterval); sessionInterval = null; remainingSeconds = Infinity; try{ window.lr_helpers?.stopBreathFlow?.(); window.lr_helpers?.stopAmbient?.(); }catch(e){} removeSessionControls(); showToast('Sesión detenida'); }
  function newSessionFlow(){ stopSession(); setTimeout(function(){ document.getElementById('settings_menu')?.click(); }, 200); }

  /* ---------------- BUILD SETTINGS BLOCK ---------------- */
  function buildSettingsBlock(){
    const container = document.createElement('div');
    container.style.marginTop = '12px';
    const uid = makeUid();

    const h3 = document.createElement('h3'); h3.style.fontWeight='700'; h3.style.marginBottom='8px'; h3.textContent = 'Temporizador de sesión';
    container.appendChild(h3);

    const select = document.createElement('select'); select.dataset.lr = 'session-select';
    select.style.cssText = 'width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.1);font-size:1rem';
    SESSION_OPTIONS.forEach(opt => { const o = document.createElement('option'); o.value = String(opt.seconds); o.textContent = opt.label; select.appendChild(o); });

    try { const saved = localStorage.getItem('lr_session_seconds'); if(saved) select.value = saved; } catch(e){}
    select.addEventListener('change', function(e){ try{ localStorage.setItem('lr_session_seconds', e.target.value); }catch(err){} });

    container.appendChild(select);

    const startBtn = document.createElement('button');
    startBtn.dataset.lr = 'session-start';
    startBtn.type = 'button';
    startBtn.style.cssText = 'width:100%;margin-top:12px;padding:10px;border:none;border-radius:10px;font-weight:700;font-size:1rem;background:linear-gradient(90deg,#77c8ff,#a4e6c6);color:#012e3a;cursor:pointer';
    startBtn.textContent = 'Iniciar sesión';
    startBtn.addEventListener('click', function(ev){
      try { if(ev && ev.preventDefault) ev.preventDefault(); if(ev && ev.stopPropagation) ev.stopPropagation(); } catch(e){}
      // focus to avoid accidental modal-close handlers triggered by blur
      startBtn.focus();
      const seconds = parseInt(select.value || '0', 10) || 0;
      // ensure API call use existing helpers
      if(window.lr_breathSessions && typeof window.lr_breathSessions.startSession === 'function'){
        window.lr_breathSessions.startSession(seconds);
      } else if(window.lr_helpers && typeof window.lr_helpers.startBreathFlow === 'function'){
        window.lr_helpers.startBreathFlow();
      } else {
        // fallback
        fallbackLocalSession(seconds);
      }
    }, { capture:false });
    container.appendChild(startBtn);

    const hr = document.createElement('hr'); hr.style.margin = '14px 0'; hr.style.opacity='0.08'; container.appendChild(hr);

    const h3p = document.createElement('h3'); h3p.style.fontWeight='700'; h3p.style.marginBottom='8px'; h3p.textContent='Presets de respiración'; container.appendChild(h3p);

    const wrap = document.createElement('div'); wrap.dataset.lr = 'preset-wrap'; wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';
    Object.keys(PRESET_LABELS).forEach(k => {
      const btn = document.createElement('button');
      btn.type='button'; btn.textContent = PRESET_LABELS[k];
      btn.style.cssText = 'padding:8px 12px;border-radius:10px;font-weight:600;background:white;border:1px solid rgba(0,0,0,0.08);cursor:pointer';
      btn.addEventListener('click', function(ev){ try{ window.lr_helpers?.setBreathPattern?.(k); showToast('Preset aplicado: ' + PRESET_LABELS[k]); }catch(e){} });
      wrap.appendChild(btn);
    });
    container.appendChild(wrap);

    return container;
  }

  /* ---------------- INJECTION (resiliente) ---------------- */
  function injectIntoCard(card){
    try {
      if(!card || !(card instanceof Element)) return false;
      // prevent duplicates: if container already there, keep it
      if(card.querySelector('[data-lr="session-select"]')) return false;
      const block = buildSettingsBlock();
      // append at the end but before actions if possible
      const actions = card.querySelector('.lr-modal-actions') || card.querySelector('div');
      if(actions && actions.parentElement === card){
        card.insertBefore(block, actions);
      } else {
        card.appendChild(block);
      }
      // attach an observer on this card so if it gets replaced we re-inject
      observeCardForReplacement(card);
      safeLog('Injected session UI into card');
      return true;
    } catch(e){
      console.error('[breath-sessions] injectIntoCard error', e);
      return false;
    }
  }

  // observe specific card to re-inject if it is emptied/replaced
  const cardObservers = new WeakMap();
  function observeCardForReplacement(card){
    try {
      if(cardObservers.has(card)) return;
      const mo = new MutationObserver(function(muts){
        // if the select disappears, re-inject (some SPA frameworks replace innerHTML)
        if(!card.querySelector('[data-lr="session-select"]')){
          // small delay to let framework finish its render
          setTimeout(function(){ injectIntoCard(card); }, 80);
        }
      });
      mo.observe(card, { childList:true, subtree:true, attributes:true });
      cardObservers.set(card, mo);
    } catch(e){
      safeLog('observeCardForReplacement failed', e);
    }
  }

  // fallback hotfix (persistent unless user closes it)
  function ensureHotfixFloating(){
    if(document.querySelector('[data-lr="session-select"]')) return;
    if(document.getElementById('__lr_hotfix_floating')) return;
    const wrap = document.createElement('div');
    wrap.id = '__lr_hotfix_floating';
    wrap.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;pointer-events:auto;display:flex;gap:8px;align-items:center;background:transparent';
    const sel = document.createElement('select'); sel.style.cssText='padding:6px;border-radius:8px;border:1px solid rgba(0,0,0,0.08);background:white';
    SESSION_OPTIONS.forEach(o => { const opt = document.createElement('option'); opt.value = String(o.seconds); opt.textContent = o.label; sel.appendChild(opt); });
    const btn = document.createElement('button'); btn.textContent='Iniciar sesión (hotfix)'; btn.style.cssText='padding:10px;border-radius:8px;border:none;background:#56c0ff;color:#00303a;font-weight:700;cursor:pointer';
    btn.onclick = function(){ const s = parseInt(sel.value||'0',10) || 0; if(window.lr_breathSessions && typeof window.lr_breathSessions.startSession==='function'){ window.lr_breathSessions.startSession(s); } else { fallbackLocalSession(s); } };
    const close = document.createElement('button'); close.textContent='Cerrar'; close.style.cssText='padding:6px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:white;cursor:pointer';
    close.onclick = function(){ wrap.remove(); };
    wrap.appendChild(sel); wrap.appendChild(btn); wrap.appendChild(close);
    document.body.appendChild(wrap);
  }

  /* ---------------- TRY INJECT NOW ---------------- */
  async function tryInjectNow(){
    // prefer specific modal #lr-user-modal
    const modal = document.getElementById('lr-user-modal');
    if(modal){
      const card = modal.querySelector('.lr-modal-card');
      if(card){
        // if modal hidden, wait a bit until visible
        if(!isVisible(modal)){
          await waitForVisible(modal, 4000);
        }
        injectIntoCard(card);
        return;
      }
    }
    // fallback search for any .lr-modal-card in DOM
    const candidate = document.querySelector('.lr-modal-card');
    if(candidate){
      injectIntoCard(candidate);
      return;
    }
    // If nothing found, ensure hotfix
    ensureHotfixFloating();
  }

  function waitForVisible(node, timeout){
    timeout = timeout || 6000;
    return new Promise(function(resolve){
      if(!node) return resolve(false);
      if(isVisible(node)) return resolve(true);
      const mo = new MutationObserver(function(){
        if(isVisible(node)){ try{ mo.disconnect(); }catch(e){}; resolve(true); }
      });
      mo.observe(node, { attributes:true, attributeFilter:['class','style'], subtree:false });
      setTimeout(function(){ try{ mo.disconnect(); }catch(e){}; resolve(false); }, timeout);
    });
  }

  /* ---------------- GLOBAL MUTATION WATCHER ---------------- */
  const globalObserver = new MutationObserver(function(muts){
    // if a modal node is added, try inject
    for(const m of muts){
      for(const n of m.addedNodes){
        if(!(n instanceof HTMLElement)) continue;
        if(n.id === 'lr-user-modal' || n.classList.contains('lr-modal-card') || n.classList.contains('lr-modal')) {
          setTimeout(tryInjectNow, 60);
          return;
        }
      }
    }
  });
  try { globalObserver.observe(document.body, { childList:true, subtree:true }); } catch(e){ safeLog('globalObserver failed', e); }

  /* ---------------- ATTACH SETTINGS MENU LISTENER (robust) ---------------- */
  function attachSettingsListener(){
    const btn = document.getElementById('settings_menu');
    if(btn && !btn.dataset._lr_attached){
      btn.dataset._lr_attached = '1';
      btn.addEventListener('click', function(){ setTimeout(tryInjectNow, 120); }, { capture:false, passive:true });
      return true;
    }
    return false;
  }
  if(!attachSettingsListener()){
    const moBtn = new MutationObserver(function(){
      if(attachSettingsListener()) moBtn.disconnect();
    });
    try { moBtn.observe(document.body, { childList:true, subtree:true }); } catch(e){}
  }

  /* ---------------- FALLBACK LOCAL SESSION ---------------- */
  function fallbackLocalSession(seconds){
    const rem = seconds > 0 ? seconds : Infinity;
    const id = '__lr_fallback_timer_' + makeUid();
    if(document.getElementById(id)) return;
    const box = document.createElement('div');
    box.id = id;
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#fff;border-radius:12px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12)';
    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><strong>Sesión (fallback)</strong><button id="'+id+'_close">✕</button></div><div id="'+id+'_timer" style="font-size:1.4rem;font-weight:700;text-align:center;margin:8px 0">--:--</div><div style="display:flex;gap:8px"><button id="'+id+'_stop" style="flex:1;padding:8px;border-radius:8px;background:#ff6b6b;border:none;color:white">Salir</button></div>';
    document.body.appendChild(box);
    document.getElementById(id+'_close').onclick = function(){ box.remove(); clearInterval(window[id+'_interval']); };
    document.getElementById(id+'_stop').onclick = function(){ box.remove(); clearInterval(window[id+'_interval']); };
    let remaining = rem === Infinity ? Infinity : rem;
    const timerEl = document.getElementById(id+'_timer');
    function draw(){ timerEl.textContent = remaining === Infinity ? '∞' : formatTime(remaining); }
    draw();
    if(remaining !== Infinity){
      window[id+'_interval'] = setInterval(function(){
        remaining = Math.max(0, remaining - 1);
        draw();
        if(remaining <= 0){
          clearInterval(window[id+'_interval']);
          box.remove();
          showToast('Sesión completada (fallback)');
        }
      }, 1000);
    }
  }

  /* ---------------- PUBLIC API ---------------- */
  window.lr_breathSessions = {
    startSession: startSession,
    stopSession: stopSession,
    pauseSession: pauseSession,
    resumeSession: resumeSession,
    tryInjectNow: tryInjectNow
  };

  /* ---------------- INITIALIZE ---------------- */
  try { ensureInit(); } catch(e){ /* no-op */ }

  // small helper to initialize: try immediate injection and ensure hotfix exists
  function ensureInit(){
    tryInjectNow();
    ensureHotfixFloating();
    safeLog('breath-sessions final initialized');
  }

})();
