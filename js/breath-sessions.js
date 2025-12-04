// BREATH SESSIONS — versión robusta: maneja flags previos, espera visibilidad y asegura binding del botón
(function(){
  if (window._breath_sessions_loaded_permanent) return;
  window._breath_sessions_loaded_permanent = true;

  const SESSION_OPTIONS = [
    { id: "0", label: "Sin temporizador", seconds: 0 },
    { id: "60", label: "1 minuto", seconds: 60 },
    { id: "180", label: "3 minutos", seconds: 180 },
    { id: "300", label: "5 minutos", seconds: 300 }
  ];
  const PRESET_LABELS = { box:"Caja (4-4-4-4)", calm:"Calma suave", slow:"Lento", "478":"4-7-8" };

  let sessionActive=false, sessionPaused=false, sessionEndsAt=0, sessionInterval=null, remainingSeconds=0;

  function formatTime(s){ s=Math.max(0,Math.floor(s)); const mm=Math.floor(s/60), ss=s%60; return `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`; }

  function isVisible(node){ if(!node) return false; const cs=getComputedStyle(node); return cs.display!=='none' && cs.visibility!=='hidden' && node.offsetParent!==null; }
  function waitForVisible(node, timeout=6000){
    return new Promise(resolve=>{
      if(!node) return resolve(false);
      if(isVisible(node)) return resolve(true);
      const mo=new MutationObserver(()=>{ if(isVisible(node)){ mo.disconnect(); clearTimeout(t); resolve(true); }});
      mo.observe(node,{attributes:true,attributeFilter:['class','style'],subtree:false});
      const t=setTimeout(()=>{ try{ mo.disconnect(); }catch(e){}; resolve(false); }, timeout);
    });
  }

  function injectSettingsUIInto(modal){
    if(!modal) return;
    let card = modal.querySelector('.lr-modal-card') || modal.querySelector('div') || modal;
    if(!card) card = modal;

    // Si el card está marcado como sessionsLoaded pero NO contiene nuestros elementos,
    // limpiar la marca y permitir reinyección
    const hasSelect = !!card.querySelector('#lr_session_select');
    const hasBtn = !!card.querySelector('#lr_session_start_btn');
    if(card.dataset.sessionsLoaded === "1" && (!hasSelect || !hasBtn)){
      console.warn('Detected sessionsLoaded flag but missing elements — removing flag to re-inject');
      delete card.dataset.sessionsLoaded;
    }
    if(card.dataset.sessionsLoaded === "1") return;

    const box = document.createElement('div');
    box.style.marginTop='16px';
    box.innerHTML = `
      <h3 style="font-weight:700;margin-bottom:8px">Temporizador de sesión</h3>
      <select id="lr_session_select" style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.1);font-size:1rem">
        ${SESSION_OPTIONS.map(s=>`<option value="${s.seconds}">${s.label}</option>`).join('')}
      </select>
      <button id="lr_session_start_btn" style="width:100%;margin-top:12px;padding:10px;border:none;border-radius:10px;font-weight:700;font-size:1rem;background:linear-gradient(90deg,#77c8ff,#a4e6c6);color:#012e3a">Iniciar sesión</button>
      <hr style="margin:18px 0;opacity:0.08" />
      <h3 style="font-weight:700;margin-bottom:8px">Presets de respiración</h3>
      <div id="lr_preset_buttons" style="display:flex;flex-wrap:wrap;gap:10px"></div>
    `;
    card.appendChild(box);
    card.dataset.sessionsLoaded = "1";

    const select = document.getElementById('lr_session_select');
    try{ const saved = localStorage.getItem('lr_session_seconds'); if(saved && select) select.value = saved;}catch(e){}

    select?.addEventListener('change', e => { try{ localStorage.setItem('lr_session_seconds', e.target.value); }catch(e){} });

    const startBtn = document.getElementById('lr_session_start_btn');
    if(startBtn && !startBtn.dataset.lr_bound){
      try{ startBtn.onclick = null; }catch(e){}
      startBtn.dataset.lr_bound = '1';
      startBtn.addEventListener('click', (ev) => {
        try{ ev && ev.stopPropagation && ev.stopPropagation(); }catch(e){}
        const seconds = parseInt(document.getElementById('lr_session_select')?.value || '0',10) || 0;
        if(window.lr_breathSessions && typeof window.lr_breathSessions.startSession === 'function') {
          window.lr_breathSessions.startSession(seconds);
        } else if(window.lr_helpers && typeof window.lr_helpers.startBreathFlow === 'function'){
          window.lr_helpers.startBreathFlow();
        } else console.warn('No start session function available');
      }, { capture:true });
    }

    const wrap = document.getElementById('lr_preset_buttons');
    Object.keys(PRESET_LABELS).forEach(k=>{
      const btn = document.createElement('button');
      btn.textContent = PRESET_LABELS[k];
      btn.style.cssText='padding:8px 12px;border-radius:10px;font-weight:600;background:white;border:1px solid rgba(0,0,0,0.08)';
      btn.addEventListener('click', ()=>{ window.lr_helpers?.setBreathPattern && window.lr_helpers.setBreathPattern(k); if(window.lr_showToast) window.lr_showToast('Preset aplicado: '+PRESET_LABELS[k]); });
      wrap.appendChild(btn);
    });
  }

  window.lr_breathSessions_inject = injectSettingsUIInto;

  async function tryInjectNow(){
    const m1 = document.getElementById('_lr_settings_modal');
    const m2 = document.getElementById('lr-user-modal');
    const target = m1 || m2;
    if(!target) return;
    const ok = await waitForVisible(target, 4000);
    if(ok) injectSettingsUIInto(target);
  }

  const modalObserver = new MutationObserver(()=>{ tryInjectNow(); });
  modalObserver.observe(document.body, { childList:true, subtree:true });

  function attachSettingsMenuListener(){
    const btn = document.getElementById('settings_menu');
    if(btn && !btn.dataset._lr_settings_attached){
      btn.dataset._lr_settings_attached='1';
      btn.addEventListener('click', ()=>{ setTimeout(()=>tryInjectNow(), 160); });
      return true;
    }
    return false;
  }
  if(!attachSettingsMenuListener()){
    const mo = new MutationObserver(()=>{ if(attachSettingsMenuListener()) mo.disconnect(); });
    mo.observe(document.body, { childList:true, subtree:true });
  }

  // Sesión - UI y lógica (completa)
  function showSessionControls(){
    removeSessionControls();
    const box = document.createElement('div');
    box.id = 'lr_session_controls';
    box.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:99999;background:rgba(255,255,255,0.95);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:14px;min-width:200px;display:flex;flex-direction:column;gap:12px;';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong style="font-size:1rem">Sesión activa</strong>
        <button id="lr_ctrl_close" style="background:none;border:none;font-size:1.2rem">✕</button>
      </div>
      <div id="lr_ctrl_timer" style="font-size:1.4rem;font-weight:700;text-align:center">--:--</div>
      <div style="display:flex;gap:10px">
        <button id="lr_ctrl_pause" style="flex:1;padding:8px;border-radius:8px;background:white;border:1px solid rgba(0,0,0,0.1);font-weight:700">Pausar</button>
        <button id="lr_ctrl_new" style="flex:1;padding:8px;border-radius:8px;background:linear-gradient(90deg,#ffe7a8,#ffc37d);border:none;color:#4a2d00;font-weight:700">Nueva</button>
      </div>
      <button id="lr_ctrl_stop" style="padding:10px;border-radius:10px;font-weight:700;color:white;background:linear-gradient(90deg,#ff8a8a,#ff5d5d);border:none">Salir</button>
    `;
    document.body.appendChild(box);
    document.getElementById('lr_ctrl_close').onclick = removeSessionControls;
    document.getElementById('lr_ctrl_stop').onclick = stopSession;
    document.getElementById('lr_ctrl_new').onclick = newSessionFlow;
    document.getElementById('lr_ctrl_pause').onclick = togglePauseButton;
    updatePauseButton();
  }
  function removeSessionControls(){ document.getElementById('lr_session_controls')?.remove(); }
  function updatePauseButton(){ const btn=document.getElementById('lr_ctrl_pause'); if(btn) btn.textContent = sessionPaused ? 'Continuar' : 'Pausar'; }

  function startSession(seconds){
    sessionActive=true; sessionPaused=false;
    if (!window.lr_helpers?.startBreathFlow) { showToast('Respiración no disponible'); return; }
    window.lr_helpers.startBreathFlow();
    showSessionControls();
    if (seconds>0){
      remainingSeconds = seconds;
      sessionEndsAt = Date.now() + seconds*1000;
      clearInterval(sessionInterval);
      sessionInterval = setInterval(()=>{
        if(!sessionActive) return;
        remainingSeconds = Math.max(0, Math.ceil((sessionEndsAt - Date.now())/1000));
        updateTimerDisplay();
        if(remainingSeconds<=0){ stopSession(); showToast('Sesión completada'); }
      },1000);
    } else {
      remainingSeconds = Infinity;
      updateTimerDisplay();
    }
  }
  function updateTimerDisplay(){ const el=document.getElementById('lr_ctrl_timer'); if(el) el.textContent = remainingSeconds===Infinity ? '∞' : formatTime(remainingSeconds); }
  function pauseSession(){ sessionPaused=true; clearInterval(sessionInterval); window.lr_helpers?.stopBreathFlow?.(); window.lr_helpers?.stopAmbient?.(); showToast('Sesión pausada'); }
  function resumeSession(){ sessionPaused=false; if(remainingSeconds!==Infinity){ sessionEndsAt=Date.now()+remainingSeconds*1000; clearInterval(sessionInterval); sessionInterval=setInterval(()=>{ remainingSeconds=Math.max(0,Math.ceil((sessionEndsAt-Date.now())/1000)); updateTimerDisplay(); if(remainingSeconds<=0) stopSession(); },1000);} window.lr_helpers?.startBreathFlow?.(); window.lr_helpers?.resumeAudio?.(); showToast('Sesión reanudada'); }
  function togglePauseButton(){ if(!sessionActive) return; if(sessionPaused) resumeSession(); else pauseSession(); updatePauseButton(); }
  function newSessionFlow(){ stopSession(); setTimeout(()=>{ document.getElementById('settings_menu')?.click(); },200); }
  function stopSession(){ sessionActive=false; sessionPaused=false; clearInterval(sessionInterval); window.lr_helpers?.stopBreathFlow?.(); window.lr_helpers?.stopAmbient?.(); removeSessionControls(); showToast('Sesión detenida'); }
  function showToast(msg){ if(window.lr_showToast) window.lr_showToast(msg); else console.log('Toast:', msg); }

  window.lr_breathSessions = { startSession, stopSession, pauseSession, resumeSession };
  tryInjectNow();
})();
