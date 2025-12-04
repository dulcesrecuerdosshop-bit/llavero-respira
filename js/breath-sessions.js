// breath-sessions.js (v2)
// Añade sesiones con UI avanzada: temporizador (countdown), pausar/continuar, salir (stop) y editar configuración (abrir ajustes).
// - Inserta UI de sesión en Modal Ajustes (no destructivo).
// - Inserta panel de control de sesión cuando se inicia (countdown, pausa, editar, salir).
// - Respeta y usa la API pública window.lr_helpers (startBreathFlow, stopAmbient, resumeAudio, setBreathPattern).
// - Traduce/clarifica presets a Español en la sección de ajustes.
// - No modifica helpers.v2.js; funciona como módulo no intrusivo.

(function(){
  if (window._breath_sessions_v2_loaded) return;
  window._breath_sessions_v2_loaded = true;

  const SESSIONS = [
    { id: '0', label: 'Sin temporizador', seconds: 0 },
    { id: '60', label: '1 minuto', seconds: 60 },
    { id: '180', label: '3 minutos', seconds: 180 },
    { id: '300', label: '5 minutos', seconds: 300 }
  ];

  // Spanish labels for presets (maps to lr_helpers.setBreathPattern keys)
  const PRESET_LABELS_ES = {
    box: 'Caja (4-4-4-4)',
    calm: 'Calma',
    slow: 'Lento',
    '478': '4-7-8'
  };

  let _sessionTimeout = null;
  let _sessionInterval = null;
  let _sessionRunning = false;
  let _sessionRemainingSeconds = 0;
  let _sessionEndAt = 0;
  let _sessionStartedAt = 0;
  let _sessionPaused = false;

  // Utility to format seconds to mm:ss
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    const mm = Math.floor(s/60);
    const ss = s % 60;
    return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }

  // Insert session UI into settings modal (select + start/cancel) and add presets area with Spanish labels
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
      </div>
      <hr style="margin:12px 0;opacity:0.06" />
      <div style="font-weight:700;margin-bottom:6px">Presets de respiración</div>
      <div id="lr_presets_spanish" style="display:flex;gap:8px;flex-wrap:wrap"></div>
    `;
    // append near the end of modal's content
    const content = modal.querySelector('div') || modal;
    content.appendChild(wrap);

    // Build presets area with Spanish labels and hook to lr_helpers.setBreathPattern
    const presetContainer = document.getElementById('lr_presets_spanish');
    const mapping = [{k:'box', label: PRESET_LABELS_ES.box}, {k:'calm', label: PRESET_LABELS_ES.calm}, {k:'slow', label: PRESET_LABELS_ES.slow}, {k:'478', label: PRESET_LABELS_ES['478']}];
    mapping.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = '_lr_preset_btn_es';
      btn.style.padding = '8px 10px';
      btn.style.borderRadius = '8px';
      btn.style.border = '1px solid rgba(0,0,0,0.06)';
      btn.style.background = 'transparent';
      btn.style.fontWeight = '700';
      btn.textContent = p.label;
      btn.dataset.preset = p.k;
      btn.addEventListener('click', () => {
        if (window.lr_helpers && typeof window.lr_helpers.setBreathPattern === 'function') {
          window.lr_helpers.setBreathPattern(p.k);
          showToast('Preset aplicado: ' + p.label);
        }
      });
      presetContainer.appendChild(btn);
    });

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
      // close settings modal if present
      try { const m = document.getElementById('_lr_settings_modal'); if (m && m.parentNode) m.parentNode.removeChild(m); } catch(e){}
    });

    cancelBtn && cancelBtn.addEventListener('click', ()=> {
      stopSession();
      showToast('Sesión cancelada');
    });

    modal.dataset._breathSessionsInjected = '1';
  }

  // Add floating session controls UI when a session is started
  function createSessionControls() {
    removeSessionControls();
    const ctrl = document.createElement('div');
    ctrl.id = '_lr_session_controls';
    Object.assign(ctrl.style, {
      position: 'fixed',
      right: '18px',
      bottom: '22px',
      zIndex: 20000,
      background: 'rgba(255,255,255,0.98)',
      color: '#082032',
      padding: '10px 12px',
      borderRadius: '12px',
      boxShadow: '0 8px 30px rgba(6,14,25,0.15)',
      minWidth: '180px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'stretch'
    });

    ctrl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong style="font-size:0.95rem">Sesión</strong>
        <button id="_lr_session_close_panel" aria-label="Cerrar" style="background:transparent;border:none;font-size:1rem">✕</button>
      </div>
      <div style="font-size:1.05rem;text-align:center;font-weight:700" id="_lr_session_timer">--:--</div>
      <div style="display:flex;gap:8px">
        <button id="_lr_session_pause" style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:white">Pausar</button>
        <button id="_lr_session_edit" style="flex:1;padding:8px;border-radius:8px;background:linear-gradient(90deg,#ffd27a,#ffb86b);border:none;color:#082032;font-weight:700">Editar</button>
      </div>
      <button id="_lr_session_stop" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:linear-gradient(90deg,#ff7a7a,#ffb0b0);color:#fff;font-weight:700">Salir</button>
    `;
    document.body.appendChild(ctrl);

    document.getElementById('_lr_session_close_panel').addEventListener('click', () => { removeSessionControls(); });
    document.getElementById('_lr_session_edit').addEventListener('click', () => { openSettingsModal(); });
    document.getElementById('_lr_session_stop').addEventListener('click', () => { stopSession(); showToast('Sesión terminada'); });
    document.getElementById('_lr_session_pause').addEventListener('click', (e) => {
      if (!_sessionRunning) return;
      if (!_sessionPaused) pauseSession();
      else resumeSession();
      updatePauseButton();
    });

    updatePauseButton();
  }

  function updatePauseButton() {
    const btn = document.getElementById('_lr_session_pause');
    if (!btn) return;
    btn.textContent = _sessionPaused ? 'Continuar' : 'Pausar';
  }

  function removeSessionControls() {
    const el = document.getElementById('_lr_session_controls');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function updateTimerDisplay() {
    const el = document.getElementById('_lr_session_timer');
    if (!el) return;
    const remaining = Math.max(0, Math.ceil((_sessionEndAt - Date.now())/1000));
    el.textContent = fmtTime(remaining);
  }

  // Start a session of totalSeconds; if 0 then start indefinite breathing (no timer)
  function startSession(totalSeconds) {
    if (_sessionRunning) {
      showToast('Ya hay una sesión en curso');
      return;
    }
    if (!window.lr_helpers || typeof window.lr_helpers.startBreathFlow !== 'function') {
      showToast('Funcionalidad de respiración no disponible');
      return;
    }

  los controles han dejado de abrir, no veo la programación. What happened? The user says after replacing file, controls stopped opening; they included code but then wrote "los controles han dejado de abrir..." so maybe they pasted truncated code; their posted code seems cut mid-function. We must respond: explain that the file appears truncated or contains syntax errors; show how to check console for syntax errors; steps to fetch raw file to verify; provide corrected full file (we already gave earlier full code). But user already pasted code with "los controles..." inserted in middle breaking syntax. So instruct to remove stray text and ensure file ends with closing })(); Provide commands to check via console: fetch('./js/breath-sessions.js') to see content snippet; check console for syntax error messages; check if window._breath_sessions_v2_loaded true; check document.scripts include; hotload corrected file; give corrected file again (full). Provide minimal step list for fix: fix file content, commit, push, ensure script tag. Offer to prepare PR. Keep concise.

Let's produce Spanish reply pointing out likely cause: file truncated/syntax error due to inserted message; show how to detect (open console errors), show fetch command to inspect file, and give corrected file block (again) and steps to replace and test by hotloading script. Provide commands to check. Finish.
Gracias — ya veo el problema: el código que pegaste está roto/truncado (tiene texto extra dentro del script: "los controles han dejado de abrir, no veo la programación."), por eso el navegador no ejecuta el módulo y por eso no aparece la UI. En resumen: hay un error de sintaxis en el fichero y eso impide que el script se cargue.

Qué hacer ahora (rápido y seguro)

1) Comprobar si hay error de sintaxis en la consola
Abre DevTools → Consola y busca errores en rojo. Puedes ejecutar este comando para ver los últimos errores asociados al origen:
```javascript
console.clear();
console.log('Últimos errores (si los hay):');
