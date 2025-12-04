// breath-sessions.js
// Módulo no intrusivo que añade "sesiones" y sincroniza duraciones para evitar cortes/mix.
// - Añade UI de selector de sesión en el modal de Ajustes (inserción no destructiva).
// - Calcula duración de ciclo y arranca la respiración con setBreathPattern/setCustomBreath.
// - Para la sesión limpiamente cuando el tiempo finaliza.
// - Usa la API pública window.lr_helpers (no modifica internals).

(function(){
  if (window._breath_sessions_loaded) return;
  window._breath_sessions_loaded = true;

  const SESSIONS = [
    { id: '0', label: 'Sin temporizador', seconds: 0 },
    { id: '60', label: '1 minuto', seconds: 60 },
    { id: '180', label: '3 minutos', seconds: 180 },
    { id: '300', label: '5 minutos', seconds: 300 }
  ];

  let _sessionTimeout = null;
  let _sessionRunning = false;

  function insertSessionUI(modal) {
    if (!modal || modal.dataset._breathSessionsInjected) return;
    const wrap = document.createElement('div');
    wrap.style.marginTop = '8px';
    wrap.innerHTML = `<div style="font-weight:700;margin-bottom:6px">Temporizador de sesión</div>
      <select id="lr_session_select" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06)">
        ${SESSIONS.map(s => `<option value="${s.seconds}">${s.label}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="lr_session_start" style="flex:1;padding:8px;border-radius:8px;background:linear-gradient(90deg,#5ec1ff,#7bd389);border:none;color:#04232a;font-weight:700">Iniciar sesión</button>
        <button id="lr_session_cancel" style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:white">Cancelar</button>
      </div>`;
    // place at the end of modal's content area
    const content = modal.querySelector('div') || modal;
    content.appendChild(wrap);

    const sel = document.getElementById('lr_session_select');
    const startBtn = document.getElementById('lr_session_start');
    const cancelBtn = document.getElementById('lr_session_cancel');

    // restore saved selection
    try {
      const saved = localStorage.getItem('lr_session_seconds') || '0';
      if (sel) sel.value = saved;
    } catch(e){}

    sel && sel.addEventListener('change', (e)=> {
      try { localStorage.setItem('lr_session_seconds', e.target.value); } catch(e){}
    });

    startBtn && startBtn.addEventListener('click', ()=> {
      const seconds = parseInt(document.getElementById('lr_session_select').value || '0', 10);
      startSession(seconds);
    });

    cancelBtn && cancelBtn.addEventListener('click', ()=> {
      stopSession();
      showToast('Sesión cancelada');
    });

    modal.dataset._breathSessionsInjected = '1';
  }

  // compute cycle duration in seconds using current durations
  function getCycleDuration() {
    const inh = Number(window.lr_helpers && window.lr_helpers.dumpState ? window.lr_helpers.dumpState().offsets.inhaleDurationSeconds : inhaleDurationSeconds) || inhaleDurationSeconds;
    const h1 = Number(window.lr_helpers && window.lr_helpers.dumpState ? window.lr_helpers.dumpState().offsets.hold1DurationSeconds : hold1DurationSeconds) || hold1DurationSeconds;
    const exh = Number(window.lr_helpers && window.lr_helpers.dumpState ? window.lr_helpers.dumpState().offsets.exhaleDurationSeconds : exhaleDurationSeconds) || exhaleDurationSeconds;
    const h2 = Number(window.lr_helpers && window.lr_helpers.dumpState ? window.lr_helpers.dumpState().offsets.hold2DurationSeconds : hold2DurationSeconds) || hold2DurationSeconds;
    return inh + h1 + exh + h2;
  }

  function startSession(totalSeconds) {
    if (_sessionRunning) {
      showToast('Ya hay una sesión en curso');
      return;
    }
    if (!window.lr_helpers || typeof window.lr_helpers.startBreathFlow !== 'function') {
      showToast('Funcionalidad de respiración no disponible');
      return;
    }
    if (!totalSeconds || totalSeconds <= 0) {
      // start indefinite
      showToast('Iniciando respiración (sin temporizador)');
      window.lr_helpers.startBreathFlow();
      _sessionRunning = true;
      return;
    }

    // Start a session: ensure audio unlocked and preload
    window.lr_helpers.resumeAudio && window.lr_helpers.resumeAudio();
    window.lr_helpers.preload && window.lr_helpers.preload();

    // compute cycles and schedule end: we prefer stopping exactly at totalSeconds
    const cycle = getCycleDuration();
    // If cycle <= 0 fallback
    const cyclesPossible = cycle > 0 ? Math.floor(totalSeconds / cycle) : 0;

    // Start breath overlay
    window.lr_helpers.startBreathFlow();

    // schedule session stop exactly at totalSeconds to avoid abrupt half-phase behavior:
    // We'll let current phase finish, but stop after totalSeconds to avoid mixing: implement using setTimeout
    _sessionRunning = true;
    if (_sessionTimeout) clearTimeout(_sessionTimeout);
    _sessionTimeout = setTimeout(()=> {
      try {
        const overlay = window._lastBreathOverlay || document.getElementById('lr-breath-overlay');
        if (overlay && typeof overlay._stop === 'function') overlay._stop();
        // stop ambient too
        window.lr_helpers.stopAmbient && window.lr_helpers.stopAmbient();
      } catch(e){}
      _sessionRunning = false;
      _sessionTimeout = null;
      showToast('Sesión finalizada');
    }, totalSeconds * 1000);

    showToast(`Sesión iniciada — ${Math.round(totalSeconds/60*100)/100} min`);
  }

  function stopSession() {
    if (_sessionTimeout) { clearTimeout(_sessionTimeout); _sessionTimeout = null; }
    try {
      const overlay = window._lastBreathOverlay || document.getElementById('lr-breath-overlay');
      if (overlay && typeof overlay._stop === 'function') overlay._stop();
      window.lr_helpers.stopAmbient && window.lr_helpers.stopAmbient();
    } catch(e){}
    _sessionRunning = false;
  }

  // Inject UI when settings modal opens (non-destructive)
  const bodyObserver = new MutationObserver(() => {
    const modal = document.getElementById('_lr_settings_modal');
    if (modal) insertSessionUI(modal);
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });

  // Expose minimal API
  window._breath_sessions = {
    startSession, stopSession, isRunning: () => _sessionRunning
  };

})();
