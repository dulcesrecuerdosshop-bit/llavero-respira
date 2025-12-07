// BREATH SESSIONS — implementación completa con guardas para NO inyectar en lr-user-modal
// Cambios principales:
// - tryInjectNow: no incluye 'lr-user-modal' en modalIds
// - injectSettingsUIInto: comprueba y evita inyectar en nodos .welcome / lr-user-modal
// - buildSettingsBlock: presets se crean solo si window.ALLOW_HOTFIX_UI === true
// - Añadido: modal persistente #lr-session-modal y window.openSessionModal
// - Añadido: binder para botón del menú '#breathBtn_menu' y '#breathBtn' si existe

(function(){
  if (window._lr_breath_sessions_loaded_permanent) return;
  window._lr_breath_sessions_loaded_permanent = true;

  // Config / opciones
  const SESSION_OPTIONS = [
    { id: "0", label: "Sin temporizador", seconds: 0 },
    { id: "60", label: "1 minuto", seconds: 60 },
    { id: "180", label: "3 minutos", seconds: 180 },
    { id: "300", label: "5 minutos", seconds: 300 }
  ];
  const PRESET_LABELS = { box:"Caja (4-4-4-4)", calm:"Calma suave", slow:"Lento", "478":"4-7-8" };

  // Estado de sesión
  let sessionActive = false;
  let sessionPaused = false;
  let sessionEndsAt = 0;
  let sessionInterval = null;
  let remainingSeconds = Infinity;

  // Utilidades
  function makeUid(){
    return Date.now().toString(36) + Math.floor(Math.random()*1000).toString(36);
  }
  function formatTime(s){
    s = Math.max(0, Math.floor(s));
    const mm = Math.floor(s/60), ss = s%60;
    return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }
  function isVisible(node){
    if(!node) return false;
    try {
      const cs = getComputedStyle(node);
      return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && node.offsetParent !== null;
    } catch(e) { return false; }
  }

  function showToast(msg){
    if(typeof window.lr_showToast === 'function'){
      try { window.lr_showToast(msg); return; } catch(e){}
    }
    // fallback simple
    console.log('Toast:', msg);
  }

  // --- CONTROLES DE SESIÓN (UI flotante) ---
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

  function styleButton(btn, highlight){
    btn.style.padding = '8px';
    btn.style.borderRadius = '8px';
    btn.style.border = highlight ? 'none' : '1px solid rgba(0,0,0,0.08)';
    btn.style.background = highlight ? 'linear-gradient(90deg,#ffe7a8,#ffc37d)' : 'white';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';
    if(highlight) btn.style.color = '#4a2d00';
  }

  function removeSessionControls(){
    const el = document.getElementById('lr_session_controls');
    if(el) el.remove();
  }
  function updatePauseButton(){
    const btn = document.getElementById('lr_ctrl_pause');
    if(!btn) return;
    btn.textContent = sessionPaused ? 'Continuar' : 'Pausar';
  }
  function updateTimerDisplay(){
    const el = document.getElementById('lr_ctrl_timer');
    if(el) el.textContent = remainingSeconds === Infinity ? '∞' : formatTime(remainingSeconds);
  }

  // --- LÓGICA DE SESIÓN ---
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
      console.error('startSession error', e);
    }
  }

  function pauseSession(){
    if(!sessionActive) return;
    sessionPaused = true;
    clearInterval(sessionInterval);
    try { window.lr_helpers?.stopBreathFlow?.(); window.lr_helpers?.stopAmbient?.(); } catch(e){}
    showToast('Sesión pausada');
    updatePauseButton();
  }

  function resumeSession(){
    if(!sessionActive) return;
    sessionPaused = false;
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
    }
    try { window.lr_helpers?.startBreathFlow?.(); window.lr_helpers?.resumeAudio?.(); } catch(e){}
    showToast('Sesión reanudada');
    updatePauseButton();
  }

  function togglePause(){ if(sessionPaused) resumeSession(); else pauseSession(); }

  function stopSession(){
    sessionActive = false;
    sessionPaused = false;
    clearInterval(sessionInterval);
    try { window.lr_helpers?.stopBreathFlow?.(); window.lr_helpers?.stopAmbient?.(); } catch(e){}
    removeSessionControls();
    showToast('Sesión detenida');
  }

  function newSessionFlow(){
    stopSession();
    setTimeout(function(){ document.getElementById('settings_menu')?.click(); }, 200);
  }

  // --- INYECCIÓN EN MODAL / CARD ---
  function clearStaleFlag(card){
    if(!card) return;
    const hasSelect = !!card.querySelector('[data-lr="session-select"]');
    const hasBtn = !!card.querySelector('[data-lr="session-start"]') || !!card.querySelector('[id^="lr_session_start_btn_"]');
    if(card.dataset.sessionsLoaded === "1" && (!hasSelect || !hasBtn)){
      try { delete card.dataset.sessionsLoaded; } catch(e){ try { card.removeAttribute('data-sessions-loaded'); } catch(err){} }
    }
  }

  function buildSettingsBlock(card){
    // Construcción segura del DOM (sin plantillas complejas)
    const container = document.createElement('div');
    container.style.marginTop = '16px';

    const h3 = document.createElement('h3');
    h3.style.fontWeight = '700';
    h3.style.marginBottom = '8px';
    h3.textContent = 'Temporizador de sesión';
    container.appendChild(h3);

    const select = document.createElement('select');
    const uid = makeUid();
    const selectId = 'lr_session_select_' + uid;
    const startId = 'lr_session_start_btn_' + uid;
    const presetsId = 'lr_preset_buttons_' + uid;

    select.id = selectId;
    select.dataset.lr = 'session-select';
    select.style.cssText = 'width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.1);font-size:1rem';
    SESSION_OPTIONS.forEach(function(opt){
      const o = document.createElement('option');
      o.value = String(opt.seconds);
      o.textContent = opt.label;
      select.appendChild(o);
    });
    try {
      const saved = localStorage.getItem('lr_session_seconds');
      if(saved) select.value = saved;
    } catch(e){}

    select.addEventListener('change', function(e){
      try { localStorage.setItem('lr_session_seconds', e.target.value); } catch(e){}
    });

    container.appendChild(select);

    const startBtn = document.createElement('button');
    startBtn.id = startId;
    startBtn.dataset.lr = 'session-start';
    startBtn.type = 'button';
    startBtn.style.cssText = 'width:100%;margin-top:12px;padding:10px;border:none;border-radius:10px;font-weight:700;font-size:1rem;background:linear-gradient(90deg,#77c8ff,#a4e6c6);color:#012e3a';
    startBtn.textContent = 'Iniciar sesión';
    startBtn.addEventListener('click', function(ev){
      try { ev.stopPropagation && ev.stopPropagation(); } catch(e){}
      const seconds = parseInt(select.value || '0', 10) || 0;
      if(window.lr_breathSessions && typeof window.lr_breathSessions.startSession === 'function'){
        window.lr_breathSessions.startSession(seconds);
      } else if(window.lr_helpers && typeof window.lr_helpers.startBreathFlow === 'function'){
        window.lr_helpers.startBreathFlow();
      } else {
        fallbackLocalSession(seconds);
      }
    }, { capture:true });
    container.appendChild(startBtn);

    const hr = document.createElement('hr');
    hr.style.margin = '18px 0';
    hr.style.opacity = '0.08';
    container.appendChild(hr);

    const h3p = document.createElement('h3');
    h3p.style.fontWeight = '700';
    h3p.style.marginBottom = '8px';
    h3p.textContent = 'Presets de respiración';
    // Append header first (can be removed later if presets suppressed)
    container.appendChild(h3p);

    // --- ONLY ADD PRESETS WHEN ALLOW_HOTFIX_UI IS TRUE ---
    if (window.ALLOW_HOTFIX_UI === true) {
      const wrap = document.createElement('div');
      wrap.id = presetsId;
      wrap.dataset.lr = 'preset-wrap';
      wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';

      Object.keys(PRESET_LABELS).forEach(function(k){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = PRESET_LABELS[k];
        btn.style.cssText = 'padding:8px 12px;border-radius:10px;font-weight:600;background:white;border:1px solid rgba(0,0,0,0.08);cursor:pointer';
        btn.addEventListener('click', function(){
          try { window.lr_helpers?.setBreathPattern && window.lr_helpers.setBreathPattern(k); } catch(e){}
          try { window.lr_showToast && window.lr_showToast('Preset aplicado: ' + PRESET_LABELS[k]); } catch(e){}
        });
        wrap.appendChild(btn);
      });

      container.appendChild(wrap);
    } else {
      // If presets suppressed, remove the header we added
      try { h3p.remove(); } catch(e){}
    }

    return {
      container: container,
      selectId: selectId,
      startId: startId,
      presetsId: presetsId,
      uid: uid
    };
  }

  function injectSettingsUIInto(target){
    // target puede ser modal Element, card Element o ShadowRoot
    try {
      // Prevención global: si ya existe un control en la página evitamos crear otro
      const alreadyGlobal = document.querySelector('[data-lr="session-select"]');
      if(alreadyGlobal){
        if(target && (target instanceof Element) && target.contains(alreadyGlobal)) return false;
        return false;
      }

      // SECURITY: do not inject into welcome/modal of welcome flow
      if (target && target instanceof Element) {
        // if it's the lr-user-modal or a node inside .welcome do not inject
        if (target.id === 'lr-user-modal' || target.closest && target.closest('.welcome')) {
          // skip injection in welcome modal intentionally
          return false;
        }
      }

      let card = null;
      if(target instanceof ShadowRoot){
        card = target.querySelector('.lr-modal-card') || target.querySelector('div');
      } else if(target instanceof Element){
        card = target.querySelector('.lr-modal-card') || target.querySelector('div');
      } else {
        return false;
      }
      if(!card) card = target;

      clearStaleFlag(card);

      if(card.querySelector('[data-lr="session-select"]') || card.dataset.sessionsLoaded === "1") return false;

      const built = buildSettingsBlock(card);
      card.appendChild(built.container);
      try { card.dataset.sessionsLoaded = "1"; } catch(e){ card.setAttribute('data-sessions-loaded','1'); }
      // remove floating hotfix if present
      const hf = document.getElementById('__lr_hotfix_floating'); if(hf) hf.remove();
      window.__lr_last_session_ids = { selectId: built.selectId, startId: built.startId, presetsId: built.presetsId, uid: built.uid };
      return true;
    } catch(e){
      console.error('injectSettingsUIInto error', e);
      return false;
    }
  }

  // --- FALLBACK SIMPLE (si faltan helpers) ---
  function fallbackLocalSession(seconds){
    const rem = seconds > 0 ? seconds : Infinity;
    const id = '__lr_fallback_timer_' + makeUid();
    if(document.getElementById(id)) return;
    const box = document.createElement('div');
    box.id = id;
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#fff;border-radius:12px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12)';
    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><strong>Sesión (fallback)</strong><button id="'+id+'_close">✕</button></div><div id="'+id+'_time">00:00</div><div style="margin-top:8px"><button id="'+id+'_stop">Detener</button></div>';
    document.body.appendChild(box);
    document.getElementById(id+'_close').onclick = function(){ box.remove(); clearInterval(window[id+'_interval']); };
    document.getElementById(id+'_stop').onclick = function(){ box.remove(); clearInterval(window[id+'_interval']); };
    let remaining = rem === Infinity ? Infinity : rem;
    const timerEl = document.getElementById(id+'_time');
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

  // --- INTENTO AUTOMÁTICO DE INYECCIÓN ---
  async function tryInjectNow(){
    // NOTE: intentionally exclude 'lr-user-modal' (welcome); we don't inject session UI there.
    const modalIds = ['_lr_settings_modal', '_settings_modal', 'settings_modal'];
    for(let i=0;i<modalIds.length;i++){
      const id = modalIds[i];
      const m = document.getElementById(id);
      if(m){
        if(isVisible(m)){
          injectSettingsUIInto(m);
        } else {
          await waitForVisible(m, 3000);
          injectSettingsUIInto(m);
        }
        return;
      }
    }
    // fallback: intentar .lr-modal-card global (but skip welcome)
    const candidate = document.querySelector('.lr-modal-card');
    if(candidate){
      if (!candidate.closest || !candidate.closest('#lr-user-modal') ) {
        injectSettingsUIInto(candidate.parentElement || candidate);
      }
    }
  }

  function waitForVisible(node, timeout){
    timeout = timeout || 6000;
    return new Promise(function(resolve){
      if(!node) return resolve(false);
      if(isVisible(node)) return resolve(true);
      const mo = new MutationObserver(function(){
        if(isVisible(node)){ mo.disconnect(); clearTimeout(t); resolve(true); }
      });
      mo.observe(node, { attributes:true, attributeFilter:['class','style'], subtree:false });
      const t = setTimeout(function(){ try{ mo.disconnect(); }catch(e){}; resolve(false); }, timeout);
    });
  }

  // Observador global para detectar inserción de modales
  const modalObserver = new MutationObserver(function(){ tryInjectNow(); });
  modalObserver.observe(document.body, { childList:true, subtree:true });

  function attachSettingsMenuListener(){
    const btn = document.getElementById('settings_menu');
    if(btn && !btn.dataset._lr_settings_attached){
      btn.dataset._lr_settings_attached = '1';
      btn.addEventListener('click', function(){ setTimeout(function(){ tryInjectNow(); }, 160); });
      return true;
    }
    return false;
  }
  if(!attachSettingsMenuListener()){
    const mo = new MutationObserver(function(){
      if(attachSettingsMenuListener()) mo.disconnect();
    });
    mo.observe(document.body, { childList:true, subtree:true });
  }

  // --- HOTFIX FLOTANTE (solo si NO hay un control de sesión ya) ---
  function ensureFloatingHotfix(){
    // Respect allow flag: only create floating hotfix if explicit opt-in
    if (window.ALLOW_HOTFIX_UI !== true) return;

    if(document.querySelector('[data-lr="session-select"]')) return;
    if(document.getElementById('__lr_hotfix_floating')) return;

    const wrap = document.createElement('div');
    wrap.id = '__lr_hotfix_floating';
    wrap.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;pointer-events:auto;display:flex;gap:8px;align-items:center;background:transparent';

    const sel = document.createElement('select');
    SESSION_OPTIONS.forEach(function(o){
      const opt = document.createElement('option');
      opt.value = String(o.seconds);
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
    sel.style.cssText = 'padding:6px;border-radius:8px;border:1px solid rgba(0,0,0,0.08);background:white';

    const btn = document.createElement('button');
    btn.textContent = 'Iniciar sesión (hotfix)';
    btn.style.cssText = 'padding:10px;border-radius:8px;border:none;background:#56c0ff;color:#00303a;font-weight:700;cursor:pointer';
    btn.onclick = function(){
      const s = parseInt(sel.value||'0',10) || 0;
      if(window.lr_breathSessions && typeof window.lr_breathSessions.startSession === 'function'){
        window.lr_breathSessions.startSession(s);
      } else {
        fallbackLocalSession(s);
      }
    };

    const close = document.createElement('button');
    close.textContent = 'Cerrar';
    close.style.cssText = 'padding:6px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:white;cursor:pointer';
    close.onclick = function(){ wrap.remove(); };

    wrap.appendChild(sel);
    wrap.appendChild(btn);
    wrap.appendChild(close);

    document.body.appendChild(wrap);
  }

  // create persistent session modal (so we always have a consistent place for sessions)
  (function createPersistentSessionModal(){
    if (document.getElementById('lr-session-modal')) return;
    try {
      const modal = document.createElement('div');
      modal.id = 'lr-session-modal';
      modal.className = 'lr-user-modal hidden';
      modal.style.zIndex = 14001;
      modal.innerHTML = `
        <div class="lr-modal-card" role="document" aria-labelledby="lr-session-title" style="max-width:520px;">
          <button class="lr-modal-close" aria-label="Cerrar" id="lr-session-close">&times;</button>
          <h2 id="lr-session-title" class="lr-modal-title">Sesión de respiración</h2>
          <div class="lr-modal-message" id="lr-session-message">Elige duración y pulsa Iniciar cuando estés listo/a.</div>
          <div style="margin-top:12px;">
            <label style="display:block;margin-bottom:8px;font-weight:700;color:var(--muted)">Duración</label>
            <select id="lr-session-duration" style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.08);font-size:1rem">
              <option value="60">1 minuto</option>
              <option value="180">3 minutos</option>
              <option value="300">5 minutos</option>
            </select>
            <button id="lr-session-start" style="width:100%;margin-top:12px;padding:12px;border-radius:10px;border:none;background:linear-gradient(90deg,#77c8ff,#a4e6c6);color:#012e3a;font-weight:800;cursor:pointer">Iniciar sesión</button>
            <div id="lr-session-preview" style="margin-top:10px;color:var(--muted);display:none"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#lr-session-close').addEventListener('click', ()=>{ modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); });

      // start handler (uses RespiracionInteligente if available)
      modal.querySelector('#lr-session-start').addEventListener('click', function(){
        try {
          const dur = parseInt(document.getElementById('lr-session-duration').value,10) || 60;
          const suggested = modal.dataset && modal.dataset.suggestedType ? modal.dataset.suggestedType : null;
          if (window.RespiracionInteligente && typeof window.RespiracionInteligente.createSession === 'function') {
            const minutes = Math.max(1, Math.round(dur/60));
            const ses = window.RespiracionInteligente.createSession({
              suggestedType: suggested,
              duration: minutes,
              onTick: function(sec){ var p=document.getElementById('lr-session-preview'); if(p){ p.style.display='block'; p.textContent = 'Tiempo restante: ' + sec + 's'; } },
              onFinish: function(){ var p=document.getElementById('lr-session-preview'); if(p){ p.textContent='Sesión finalizada'; setTimeout(()=>p.style.display='none',2000); } }
            });
            ses.start();
            modal.classList.add('hidden');
            return;
          }
          if (window.lr_breathSessions && typeof window.lr_breathSessions.startSession === 'function') {
            window.lr_breathSessions.startSession(dur);
            modal.classList.add('hidden');
            return;
          }
          fallbackLocalSession && typeof fallbackLocalSession === 'function' ? fallbackLocalSession(dur) : showToast('No hay motor de respiración disponible');
        } catch(e){ console.error('session modal start handler failed', e); }
      });

      window.openSessionModal = function(opts){ opts = opts || {}; modal.dataset.suggestedType = opts.suggestedType || ''; document.getElementById('lr-session-message').textContent = opts.message || 'Elige duración y pulsa iniciar'; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); };
      // bind menu button if present
      function bindMenuBtn(){
        const b = document.getElementById('breathBtn_menu') || document.getElementById('breathBtn') || document.querySelector('[data-action="breath"]');
        if(b && !b.dataset._lr_breath_bound){
          b.dataset._lr_breath_bound = '1';
          b.addEventListener('click', function(e){ try { e.preventDefault && e.preventDefault(); window.openSessionModal({ suggestedType: (window.CLIENT_USER && window.CLIENT_USER.suggestedBreathingType) || null, message: '¿Quieres empezar una breve sesión?' }); } catch(err){ console.warn(err); } });
        }
      }
      bindMenuBtn();
      // observe for dynamic menu
      const mo = new MutationObserver(function(){ bindMenuBtn(); });
      mo.observe(document.body, { childList:true, subtree:true });
    } catch(e){ console.warn('createPersistentSessionModal failed', e); }
  })();

  // Exponer API global
  window.lr_breathSessions_inject = injectSettingsUIInto;
  window.lr_breathSessions = {
    startSession: startSession,
    stopSession: stopSession,
    pauseSession: pauseSession,
    resumeSession: resumeSession
  };

  // Intentos iniciales
  try{
    ensureFloatingHotfix();
  }catch(e){}
  try{
    tryInjectNow();
  }catch(e){}

})();
