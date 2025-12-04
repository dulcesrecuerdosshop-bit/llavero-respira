// BREATH SESSIONS — inyección robusta, binding seguro y captura con debounce
(function(){
  if (window._breath_sessions_loaded_permanent) return;
  window._breath_sessions_loaded_permanent = true;

  const SESSION_OPTIONS = [{ id:"0", label:"Sin temporizador", seconds:0 },{ id:"60", label:"1 minuto", seconds:60 },{ id:"180", label:"3 minutos", seconds:180 },{ id:"300", label:"5 minutos", seconds:300 }];
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

    const hasSelect = !!card.querySelector('#lr_session_select');
    const hasBtn = !!card.querySelector('#lr_session_start_btn');
    if(card.dataset.sessionsLoaded === "1" && (!hasSelect || !hasBtn)){
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
      <button id="lr_session_start_btn" type="button" style="width:100%;margin-top:12px;padding:10px;border:none;border-radius:10px;font-weight:700;font-size:1rem;background:linear-gradient(90deg,#77c8ff,#a4e6c6);color:#012e3a">Iniciar sesión</button>
      <hr style="margin:18px 0;opacity:0.08" />
      <h3 style="font-weight:700;margin-bottom:8px">Presets de respiración</h3>
      <div id="lr_preset_buttons" style="display:flex;flex-wrap:wrap;gap:10px"></div>
    `;
    card.appendChild(box);
    card.dataset.sessionsLoaded = "1";

    const select = document.getElementById('lr_session_select');
    try{ const saved = localStorage.getItem('lr_session_seconds'); if(saved && select) select.value = saved;}catch(e){}

    select?.addEventListener('change', e=>{ try{ localStorage.setItem('lr_session_seconds', e.target.value); }catch(e){} });

    // attach handlers lightly; main handler will be document-level capture (see below)
    const startBtn = document.getElementById('lr_session_start_btn');
    if(startBtn && !startBtn.dataset.lr_bound){
      try{ startBtn.type='button'; startBtn.onclick = null; }catch(e){}
      startBtn.dataset.lr_bound='1';
      startBtn.addEventListener('click', (ev)=>{ ev && ev.stopPropagation && ev.stopPropagation(); const seconds = parseInt(select?.value||'0',10)||0; if(window.lr_breathSessions?.startSession) window.lr_breathSessions.startSession(seconds); }, { capture:true });
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
    if(m1){ const ok = await waitForVisible(m1,4000); if(ok) injectSettingsUIInto(m1); return; }
    if(m2){ const ok = await waitForVisible(m2,4000); if(ok) injectSettingsUIInto(m2); return; }
  }

  const modalObserver = new MutationObserver(()=>{ tryInjectNow(); });
  modalObserver.observe(document.body, { childList:true, subtree:true });

  // Document-level capture listener (runs before bubble handlers)
  // Debounced: ignore repeated hits within 600ms to prevent spamming startSession
  (function installCapture(){
    if(window.__lr_capture_installed_permanent) return;
    let lastTs = 0;
    const MIN_DELAY = 600;
    function onClickCapture(e){
      const el = e.target && e.target.closest ? e.target.closest('#lr_session_start_btn') : null;
      if(!el) return;
      const now = Date.now();
      if(now - lastTs < MIN_DELAY) return;
      lastTs = now;
      try{ e.stopPropagation(); e.preventDefault(); }catch(_){}
      const seconds = parseInt(document.getElementById('lr_session_select')?.value||'0',10)||0;
      if(window.lr_breathSessions && typeof window.lr_breathSessions.startSession === 'function'){
        window.lr_breathSessions.startSession(seconds);
      } else {
        try { window.lr_helpers?.startBreathFlow?.(); } catch(e){ console.warn('startBreathFlow missing/failed', e); }
      }
    }
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('pointerdown', onClickCapture, true);
    window.__lr_capture_installed_permanent = true;
  })();

  // session UI & logic (retain/implement actual functions used above)
  function showSessionControls(){ /* same implementation as earlier */ }
  function removeSessionControls(){ document.getElementById('lr_session_controls')?.remove(); }
  function updatePauseButton(){ const btn=document.getElementById('lr_ctrl_pause'); if(btn) btn.textContent = sessionPaused ? 'Continuar' : 'Pausar'; }
  function startSession(seconds){ /* use original start logic: call lr_helpers.startBreathFlow if exists, showSessionControls(), timer... */ }
  function stopSession(){ /* stop logic */ }
  function pauseSession(){ /* pause logic */ }
  function resumeSession(){ /* resume logic */ }

  window.lr_breathSessions = { startSession, stopSession, pauseSession, resumeSession };

  tryInjectNow();
})();
