/* BREATH SESSIONS — versión final lista para reemplazar
   - genera ids únicos
   - limpia flags stale (data-sessionsLoaded)
   - inyección segura (createElement)
   - expone API window.lr_breathSessions & window.lr_breathSessions_inject
   - fallback hotfix UI (botón flotante)
   - sin plantillas anidadas que provoquen errores de parse
*/
(function(){
  if (window._lr_breath_sessions_loaded) return;
  window._lr_breath_sessions_loaded = true;

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

  // Utils
  function makeUid(){ return Date.now().toString(36) + Math.floor(Math.random()*1000).toString(36); }
  function formatTime(s){ s = Math.max(0, Math.floor(s)); const mm = Math.floor(s/60), ss = s%60; return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }
  function isVisible(node){ if(!node) return false; const cs = getComputedStyle(node); return cs.display !== 'none' && cs.visibility !== 'hidden' && node.offsetParent !== null; }

  function showToast(msg){
    if(typeof window.lr_showToast === 'function'){ try { window.lr_showToast(msg); return; } catch(e){} }
    // fallback: console log
    console.log('Toast:', msg);
  }

  // UI de control flotante
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
      'font-family:system-ui,Segoe UI,Roboto,Arial'
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
    pauseBtn.onclick = () => { togglePause(); updatePauseButton(); };
    controls.appendChild(pauseBtn);

    const newBtn = document.createElement('button');
    newBtn.id = 'lr_ctrl_new';
    newBtn.style.flex = '1';
    styleButton(newBtn, true);
    newBtn.textContent = 'Nueva';
    newBtn.onclick = () => { newSessionFlow(); };
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

  // Lógica de sesión
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
        sessionInterval = setInterval(()=>{
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
      sessionInterval = setInterval(()=>{
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
    setTimeout(()=>{ document.getElementById('settings_menu')?.click(); }, 200);
  }

  // Inyección en modal / card
  function clearStaleFlag(card){
    if(!card) return;
    const hasSelect = !!card.querySelector('[data-lr="session-select"]');
    const hasBtn = !!card.querySelector('[data-lr="session-start"]') || !!card.querySelector('[id^="lr_session_start_btn"]');
    if(card.dataset.sessionsLoaded === "1" && (!hasSelect || !hasBtn)){
      try { delete card.dataset.sessionsLoaded; } catch(e){ try { card.removeAttribute('data-sessions-loaded'); } catch(err){} }
    }
  }

  function buildSettingsBlock(card){
    const container = document.createElement('div');
    container.style.marginTop = '16px';

    const h3 = document.createElement('h3');
    h3.style.fontWeight = '700';
    h3.style.marginBottom = '8px';
    h3.textContent = 'Temporizador de sesión';
    container.appendChild(h3);

    const select = document.createElement('select');
    const uid = makeUid();
    const selectId = `lr_session_select_${uid}`;
    const startId = `lr_session_start_btn_${uid}`;
    const presetsId = `lr_preset_buttons_${uid}`;

    select.id = selectId;
    select.dataset.lr = 'session-select';
    select.style.cssText = 'width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.1);font-size:1rem';
    SESSION_OPTIONS.forEach(opt => {
      const o = document.createElement('option');
      o.value = String(opt.seconds);
      o.textContent = opt.label;
      select.appendChild(o);
    });
    try {
      const saved = localStorage.getItem('lr_session_seconds');
      if(saved) select.value = saved;
    } catch(e){}

    select.addEventListener('change', (e) => {
      try { localStorage.setItem('lr_session_seconds', e.target.value); } catch(e){}
    });

    container.appendChild(select);

    const startBtn = document.createElement('button');
    startBtn.id = startId;
    startBtn.dataset.lr = 'session-start';
    startBtn.type = 'button';
    startBtn.style.cssText = 'width:100%;margin-top:12px;padding:10px;border:none;border-radius:10px;font-weight:700;font-size:1rem;background:linear-gradient(90deg,#77c8ff,#a4e6c6);color:#012e3a;cursor:pointer';
    startBtn.textContent = 'Iniciar sesión';
    startBtn.addEventListener('click', (ev)=>{
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
    container.appendChild(h3p);

    const wrap = document.createElement('div');
    wrap.id = presetsId;
    wrap.dataset.lr = 'preset-wrap';
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';

    Object.keys(PRESET_LABELS).forEach(k => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = PRESET_LABELS[k];
      btn.style.cssText = 'padding:8px 12px;border-radius:10px;font-weight:600;background:white;border:1px solid rgba(0,0,0,0.08);cursor:pointer';
      btn.addEventListener('click', ()=> {
        try { window.lr_helpers?.setBreathPattern && window.lr_helpers.setBreathPattern(k); } catch(e){}
        try { window.lr_showToast && window.lr_showToast('Preset aplicado: ' + PRESET_LABELS[k]); } catch(e){}
      });
      wrap.appendChild(btn);
    });

    container.appendChild(wrap);

    return { container, selectId, startId, presetsId, uid };
  }

  function injectSettingsUIInto(target){
    try {
      const isShadow = (target && target instanceof ShadowRoot);
      const modal = target;
      let card = null;
      if(isShadow){
        card = modal.querySelector('.lr-modal-card') || modal.querySelector('div');
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
      card.dataset.sessionsLoaded = "1";
      window.__lr_last_session_ids = { selectId: built.selectId, startId: built.startId, presetsId: built.presetsId, uid: built.uid };
      return true;
    } catch(e){
      console.error('injectSettingsUIInto error', e);
      return false;
    }
  }

  // Fallback timer simple (si falta lr_helpers)
  function fallbackLocalSession(seconds){
    const rem = seconds > 0 ? seconds : Infinity;
    const id = '__lr_fallback_timer_' + makeUid();
    if(document.getElementById(id)) return;
    const box = document.createElement('div');
    box.id = id;
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#fff;border-radius:12px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12)';
    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><strong>Sesión (fallback)</strong><button id="'+id+'_close">✕</button></div><div id="'+id+'_timer" style="font-size:1.4rem;font-weight:700;text-align:center;margin:8px 0">--:--</div><div style="display:flex;gap:8px"><button id="'+id+'_stop" style="flex:1;padding:8px;border-radius:8px;background:#ff6b6b;border:none;color:white">Salir</button></div>';
    document.body.appendChild(box);
    document.getElementById(id+'_close').onclick = ()=>{ box.remove(); clearInterval(window[id+'_interval']); };
    document.getElementById(id+'_stop').onclick = ()=>{ box.remove(); clearInterval(window[id+'_interval']); };
    let remaining = rem === Infinity ? Infinity : rem;
    const timerEl = document.getElementById(id+'_timer');
    function draw(){ timerEl.textContent = remaining === Infinity ? '∞' : formatTime(remaining); }
    draw();
    if(remaining !== Infinity){
      window[id+'_interval'] = setInterval(()=> {
        remaining = Math.max(0, remaining - 1);
        draw();
        if(remaining <= 0){ clearInterval(window[id+'_interval']); box.remove(); showToast('Sesión completada (fallback)'); }
      }, 1000);
    }
  }

  // Intento de inyección automática
  async function tryInjectNow(){
    const modalIds = ['_lr_settings_modal', 'lr-user-modal', '_settings_modal', 'settings_modal'];
    for(const id of modalIds){
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
    const candidate = document.querySelector('.lr-modal-card');
    if(candidate){
      injectSettingsUIInto(candidate.parentElement || candidate);
    }
  }

  function waitForVisible(node, timeout=6000){
    return new Promise(resolve=>{
      if(!node) return resolve(false);
      if(isVisible(node)) return resolve(true);
      const mo = new MutationObserver(()=>{ if(isVisible(node)){ mo.disconnect(); clearTimeout(t); resolve(true); }});
      mo.observe(node, { attributes:true, attributeFilter:['class','style'], subtree:false });
      const t = setTimeout(()=>{ try{ mo.disconnect(); }catch(e){}; resolve(false); }, timeout);
    });
  }

  // Observadores
  const modalObserver = new MutationObserver(()=>{ tryInjectNow(); });
  modalObserver.observe(document.body, { childList:true, subtree:true });

  function attachSettingsMenuListener(){
    const btn = document.getElementById('settings_menu');
    if(btn && !btn.dataset._lr_settings_attached){
      btn.dataset._lr_settings_attached = '1';
      btn.addEventListener('click', ()=>{ setTimeout(()=>tryInjectNow(), 160); });
      return true;
    }
    return false;
  }
  if(!attachSettingsMenuListener()){
    const mo = new MutationObserver(()=>{ if(attachSettingsMenuListener()) mo.disconnect(); });
    mo.observe(document.body, { childList:true, subtree:true });
  }

  // API pública
  window.lr_breathSessions_inject = injectSettingsUIInto;
  window.lr_breathSessions = {
    startSession,
    stopSession,
    pauseSession,
    resumeSession
  };

  // Hotfix flotante para iniciar sesiones aunque la inyección falle
  function ensureFloatingHotfix(){
    if(document.getElementById('__lr_hotfix_floating')) return;
    const wrap = document.createElement('div');
    wrap.id = '__lr_hotfix_floating';
    wrap.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;pointer-events:auto';
    const btn = document.createElement('button');
    btn.textContent = 'Iniciar sesión (hotfix)';
    btn.style.cssText = 'padding:10px;border-radius:8px;border:none;background:#56c0ff;color:#00303a;font-weight:700;cursor:pointer';
    const sel = document.createElement('select');
    sel.style.marginRight = '8px';
    SESSION_OPTIONS.forEach(o=>{ const opt = document.createElement('option'); opt.value = String(o.seconds); opt.textContent = o.label; sel.appendChild(opt); });
    btn.onclick = ()=> {
      const s = parseInt(sel.value||'0',10)||0;
      if(window.lr_breathSessions && typeof window.lr_breathSessions.startSession === 'function'){
        window.lr_breathSessions.startSession(s);
      } else {
        fallbackLocalSession(s);
      }
    };
    wrap.appendChild(sel);
    wrap.appendChild(btn);

    const close = document.createElement('button');
    close.textContent = 'Cerrar';
    close.style.cssText = 'margin-left:8px;padding:6px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:white;cursor:pointer';
    close.onclick = ()=> wrap.remove();
    wrap.appendChild(close);

    document.body.appendChild(wrap);
  }

  try{ ensureFloatingHotfix(); }catch(e){}
  tryInjectNow();

})();
