// helpers.v2.js - Helpers completos (TTS, respiración, favoritos, compartir, descarga).
// Versión modificada: se han movido los presets al hotfix reabrible, se ha eliminado el bloque de presets del modal Ajustes,
// se asegura que el hotfix pueda reabrirse y se mantiene tracking y parada segura de WebAudio/HTMLAudio/timers.

(function () {
  'use strict';

  // ---------- Logging ----------
  window.LR_DEBUG = window.LR_DEBUG === true;
  function lrlog(...args) { if (window.LR_DEBUG) console.log('[helpers]', ...args); }
  function lrwarn(...args) { if (window.LR_DEBUG) console.warn('[helpers]', ...args); }

  lrlog('init');

  // ---------- Small UI toast ----------
  function showToast(msg, timeout = 3500) {
    try {
      let t = document.getElementById('_lr_toast');
      if (!t) {
        t = document.createElement('div');
        t.id = '_lr_toast';
        Object.assign(t.style, {
          position: 'fixed',
          top: '18px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(8,12,20,0.9)',
          color: '#fff',
          padding: '8px 14px',
          borderRadius: '8px',
          zIndex: 16000,
          fontSize: '0.95rem',
          boxShadow: '0 6px 22px rgba(0,0,0,0.3)',
          transition: 'opacity 260ms ease',
          opacity: '0'
        });
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(t._t);
      t._t = setTimeout(() => { t.style.opacity = '0'; }, timeout);
    } catch (e) {
      try { console.log('TOAST:', msg); } catch (_) {}
    }
  }
  if (!window.showToast) window.showToast = showToast;

  // ---------- Audio config (NO breath fallback candidates) ----------
  const AUDIO = {
    breathCandidates: [], // intentionally empty to avoid generic "breath" fallback
    inhaleCue: 'inhaleCue.mp3',
    exhaleCue: 'exhaleCue.mp3',
    ambientCandidates: ['ambient.mp3', 'Ambient.mp3', 'AMBIENT.mp3']
  };

  // breathing timing defaults (seconds)
  let inhaleOffsetSeconds = 0.0;
  let inhaleDurationSeconds = 2.8;
  let exhaleOffsetSeconds = 2.8;
  let exhaleDurationSeconds = 3.5;
  let hold1DurationSeconds = 4.0;
  let hold2DurationSeconds = 1.0;

  // audio holders
  let audioCtx = null;
  const audioBuffers = { breath: null, inhaleCue: null, exhaleCue: null, ambient: null };
  let ambientSource = null, ambientGain = null;
  const htmlAudio = { inhaleEl: null, exhaleEl: null, ambientEl: null, breathUrl: null };

  // track active WebAudio sources so we can stop them cleanly
  const activeSources = [];
  // track active timer IDs so we can clear them
  const activeTimers = [];

  const KEY_FAVORITOS = 'lr_favoritos_v1';

  // Hotfix session options (used in floating UI)
  const HOTFIX_SESSION_OPTIONS = [
    { id: "0", label: "Sin temporizador", seconds: 0 },
    { id: "60", label: "1 minuto", seconds: 60 },
    { id: "180", label: "3 minutos", seconds: 180 },
    { id: "300", label: "5 minutos", seconds: 300 }
  ];

  const PRESET_MAP = { box: 'Caja (4-4-4-4)', calm: 'Calma suave', slow: 'Lento', '478': '4-7-8' };

  // ---------- Utilities ----------
  async function existsUrl(url) {
    if (!url) return false;
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r && r.ok) return true;
    } catch (e) { /* ignore */ }
    try {
      const r2 = await fetch(url, { method: 'GET' });
      return !!(r2 && r2.ok);
    } catch (e) { return false; }
  }

  async function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      lrlog('AudioContext created', audioCtx.state);
      return audioCtx;
    } catch (e) {
      lrwarn('WebAudio not available', e);
      audioCtx = null;
      return null;
    }
  }

  async function loadAudioBuffer(url) {
    const ctx = await ensureAudioContext();
    if (!ctx) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('fetch ' + r.status);
      const ab = await r.arrayBuffer();
      // decodeAudioData compatibility: callback or promise
      const buf = await new Promise((resolve, reject) => {
        try {
          ctx.decodeAudioData(ab, resolve, reject);
        } catch (err) {
          ctx.decodeAudioData(ab).then(resolve).catch(reject);
        }
      });
      lrlog('decoded buffer', url);
      return buf;
    } catch (e) {
      lrwarn('loadAudioBuffer error', url, e);
      return null;
    }
  }

  // scheduleBufferPlay: create buffer source, track it in activeSources, remove onended
  function scheduleBufferPlay(buffer, offset, duration, opts) {
    opts = opts || {};
    const gainVal = typeof opts.gain === 'number' ? opts.gain : 0.9;
    const fade = typeof opts.fade === 'number' ? opts.fade : 0.06;
    if (!audioCtx || !buffer) return false;
    try {
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      const g = audioCtx.createGain();
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gainVal, now + fade);
      const playDuration = Math.max(0.05, duration);
      const endAt = now + playDuration;
      g.gain.setValueAtTime(gainVal, endAt - fade);
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.connect(g).connect(audioCtx.destination);

      // Track active source so we can stop it externally
      try { activeSources.push(src); } catch (e) {}

      // Ensure we remove from activeSources when finished
      src.onended = function () {
        try {
          const idx = activeSources.indexOf(src);
          if (idx !== -1) activeSources.splice(idx, 1);
        } catch (e) {}
        try { src.disconnect(); } catch (e) {}
        try { g.disconnect(); } catch (e) {}
      };

      src.start(now, offset, playDuration);
      src.stop(endAt + 0.05);
      lrlog('scheduledBufferPlay', { offset, playDuration });
      return true;
    } catch (e) {
      lrwarn('scheduleBufferPlay failed', e);
      return false;
    }
  }

  function playHtml(url, offset = 0, duration = 2000) {
    try {
      let el = null;
      if (htmlAudio.inhaleEl && htmlAudio.inhaleEl.src && htmlAudio.inhaleEl.src.includes(url)) el = htmlAudio.inhaleEl;
      else if (htmlAudio.exhaleEl && htmlAudio.exhaleEl.src && htmlAudio.exhaleEl.src.includes(url)) el = htmlAudio.exhaleEl;
      else if (htmlAudio.ambientEl && htmlAudio.ambientEl.src && htmlAudio.ambientEl.src.includes(url)) el = htmlAudio.ambientEl;
      else el = new Audio(url);
      try { el.currentTime = offset; } catch (e) {}
      el.volume = 0.95;
      const p = el.play();
      if (p && p.catch) p.catch(e => lrwarn('playHtml play error', e));
      // record timer to pause/reset later
      const t = setTimeout(() => { try { el.pause(); el.currentTime = 0; } catch (e) {} }, Math.max(400, Math.round(duration)));
      try { activeTimers.push(t); } catch (e) {}
      lrlog('playHtml', url);
      return true;
    } catch (e) {
      lrwarn('playHtml top error', e);
      return false;
    }
  }

  // ---------- Ambient helpers ----------
  function startAmbientLoop(buffer, url) {
    if (audioCtx && buffer) {
      stopAmbientLoop();
      ambientSource = audioCtx.createBufferSource();
      ambientSource.buffer = buffer;
      ambientSource.loop = true;
      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0;
      ambientSource.connect(ambientGain).connect(audioCtx.destination);
      ambientSource.start();
      try { ambientGain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 2.0); } catch (e) {}
      lrlog('startAmbientLoop (webaudio)');
      return;
    }
    if (url) {
      if (!htmlAudio.ambientEl) { htmlAudio.ambientEl = new Audio(url); htmlAudio.ambientEl.loop = true; htmlAudio.ambientEl.volume = 0.12; }
      const p = htmlAudio.ambientEl.play();
      if (p && p.catch) p.catch(()=>{});
      lrlog('startAmbientLoop (html audio)');
    }
  }

  function stopAmbientLoop() {
    try { if (ambientGain && audioCtx) ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6); } catch (e) {}
    try { if (ambientSource && audioCtx) ambientSource.stop(audioCtx.currentTime + 0.5); } catch (e) {}
    ambientSource = null; ambientGain = null;
    try { if (htmlAudio.ambientEl) { htmlAudio.ambientEl.pause(); htmlAudio.ambientEl.currentTime = 0; } } catch (e) {}
    lrlog('stopAmbientLoop');
  }

  // ---------- Preload assets (no generic "breath" fallback) ----------
  async function preloadAssets() {
    await ensureAudioContext();
    try {
      if (await existsUrl(AUDIO.inhaleCue)) {
        const b = await loadAudioBuffer(AUDIO.inhaleCue);
        if (b) audioBuffers.inhaleCue = b; else htmlAudio.inhaleEl = new Audio(AUDIO.inhaleCue);
      }
      if (await existsUrl(AUDIO.exhaleCue)) {
        const b2 = await loadAudioBuffer(AUDIO.exhaleCue);
        if (b2) audioBuffers.exhaleCue = b2; else htmlAudio.exhaleEl = new Audio(AUDIO.exhaleCue);
      }

      // deliberately do NOT check or assign breathCandidates here (we want inhale/exhale cues only)

      // ambient
      let amb = null;
      for (let j = 0; j < AUDIO.ambientCandidates.length; j++) {
        const a = AUDIO.ambientCandidates[j];
        if (await existsUrl(a)) { amb = a; break; }
      }
      if (amb) {
        const b4 = await loadAudioBuffer(amb);
        if (b4) audioBuffers.ambient = b4;
        else { htmlAudio.ambientEl = new Audio(amb); htmlAudio.ambientEl.loop = true; htmlAudio.ambientEl.volume = 0.12; }
      }
    } catch (e) {
      lrwarn('preloadAssets error', e);
    }
    // Defensive: ensure no "breath" fallback remains in memory
    try { audioBuffers.breath = null; htmlAudio.breathUrl = null; } catch (e) {}
    lrlog('preload results', {
      inhaleCue: !!audioBuffers.inhaleCue || !!htmlAudio.inhaleEl,
      exhaleCue: !!audioBuffers.exhaleCue || !!htmlAudio.exhaleEl,
      breath: !!audioBuffers.breath || !!htmlAudio.breathUrl,
      ambient: !!audioBuffers.ambient || !!htmlAudio.ambientEl
    });
  }

  // ---------- Breath flow players (strict mapping, schedules by session durations) ----------
  async function playInhale() {
    await preloadAssets();
    if (audioBuffers.inhaleCue) {
      if (scheduleBufferPlay(audioBuffers.inhaleCue, 0, inhaleDurationSeconds)) return;
    }
    if (htmlAudio.inhaleEl) {
      if (playHtml(htmlAudio.inhaleEl.src, 0, inhaleDurationSeconds)) return;
    }
    lrlog('playInhale fallback: no inhaleCue available');
  }

  async function playExhale() {
    await preloadAssets();
    if (audioBuffers.exhaleCue) {
      if (scheduleBufferPlay(audioBuffers.exhaleCue, 0, exhaleDurationSeconds)) return;
    }
    if (htmlAudio.exhaleEl) {
      if (playHtml(htmlAudio.exhaleEl.src, 0, exhaleDurationSeconds)) return;
    }
    lrlog('playExhale fallback: no exhaleCue available');
  }

  // ---------- Breath overlay ----------
  async function startBreathFlowInternal() {
    await resumeAudio();
    await preloadAssets();

    if (document.getElementById('lr-breath-overlay')) { lrlog('breath overlay already present'); return; }

    const overlay = document.createElement('div');
    overlay.id = 'lr-breath-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)',
      zIndex: 2147483647,
      WebkitTapHighlightColor: 'transparent',
      touchAction: 'none'
    });

    const container = document.createElement('div');
    Object.assign(container.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '8px' });

    const circle = document.createElement('div');
    Object.assign(circle.style, {
      width: '220px', height: '220px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '28px', fontWeight: 700
    });

    const small = document.createElement('div');
    Object.assign(small.style, { color: 'rgba(255,255,255,0.95)', fontSize: '18px', textAlign: 'center' });

    container.appendChild(circle);
    container.appendChild(small);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // On mobile ensure first-touch resume if needed
    if (('ontouchstart' in window) && audioCtx && audioCtx.state === 'suspended') {
      const resumeOnTouch = async function () {
        try { await resumeAudio(); } catch (e) {}
        overlay.removeEventListener('touchstart', resumeOnTouch);
      };
      overlay.addEventListener('touchstart', resumeOnTouch, { passive: true });
    }

    if (window._lr_ambient_enabled !== false) {
      if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient);
      else if (htmlAudio.ambientEl) startAmbientLoop(null, htmlAudio.ambientEl.src);
    }

    const steps = [
      { label: 'Inhala', action: playInhale, duration: inhaleDurationSeconds },
      { label: 'Sostén', action: null, duration: hold1DurationSeconds },
      { label: 'Exhala', action: playExhale, duration: exhaleDurationSeconds },
      { label: 'Sostén', action: null, duration: hold2DurationSeconds }
    ];

    let idx = 0, timeoutId = null, running = true;

    // helper to push timeout ids to activeTimers for global clear
    function setActiveTimeout(fn, ms) {
      const id = setTimeout(fn, ms);
      try { activeTimers.push(id); } catch (e) {}
      return id;
    }

    async function loopStep() {
      if (!running) return;
      const s = steps[idx];
      try {
        circle.textContent = s.label;
        small.textContent = s.label + (s.duration ? ' · ' + Math.round(s.duration) + 's' : '');
      } catch (e) {}
      if (s.action) { try { await s.action(); } catch (e) { lrwarn('breath action error', e); } }
      try {
        const scaleFrom = s.label === 'Exhala' ? 1 : 0.6;
        const scaleTo = s.label === 'Exhala' ? 0.6 : 1.0;
        if (circle.animate) {
          circle.animate([{ transform: 'scale(' + scaleFrom + ')', opacity: 0.75 }, { transform: 'scale(' + scaleTo + ')', opacity: 1 }], { duration: s.duration * 1000, easing: 'ease-in-out', fill: 'forwards' });
        } else {
          circle.style.transition = 'transform ' + s.duration + 's ease-in-out';
          circle.style.transform = 'scale(' + scaleTo + ')';
        }
      } catch (e) {}
      timeoutId = setActiveTimeout(function () { idx = (idx + 1) % steps.length; loopStep(); }, Math.round(s.duration * 1000));
    }
    loopStep();

    // Extend overlay._stop to also stop active WebAudio sources, HTML audio, ambient and clear globals/timers
    overlay._stop = function () {
      running = false;
      try { if (timeoutId) clearTimeout(timeoutId); } catch (e) {}
      try {
        while (activeTimers.length) {
          const tid = activeTimers.shift();
          try { clearTimeout(tid); } catch (e) {}
        }
      } catch (e) {}

      // Stop active WebAudio buffer sources
      try {
        for (let i = 0; i < activeSources.length; i++) {
          try { activeSources[i].stop(); } catch (e) {}
        }
        activeSources.length = 0;
      } catch (e) {}

      // Pause/reset HTML audio elements if present
      try { if (htmlAudio.inhaleEl) { htmlAudio.inhaleEl.pause(); try { htmlAudio.inhaleEl.currentTime = 0; } catch(e){} } } catch (e) {}
      try { if (htmlAudio.exhaleEl) { htmlAudio.exhaleEl.pause(); try { htmlAudio.exhaleEl.currentTime = 0; } catch(e){} } } catch (e) {}
      try { if (htmlAudio.ambientEl) { htmlAudio.ambientEl.pause(); try { htmlAudio.ambientEl.currentTime = 0; } catch(e){} } } catch (e) {}

      // Stop ambient loop (webaudio or html)
      try { stopAmbientLoop(); } catch (e) {}

      // Remove overlay dom
      try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {}

      // Clear global ref
      try { window._lastBreathOverlay = null; } catch (e) {}
      lrlog('breath overlay removed');
    };

    function stopHandler(e) {
      try { if (overlay._stop) overlay._stop(); } catch (err) {}
      e && e.preventDefault && e.preventDefault();
      e && e.stopPropagation && e.stopPropagation();
    }
    overlay.addEventListener('click', stopHandler, { passive: false });
    overlay.addEventListener('touchend', stopHandler, { passive: false });

    window._lastBreathOverlay = overlay;
  }

  // ---------- hotfix floating UI (create / open / close) ----------
  function openBreathHotfix() {
    try {
      // If a hotfix already exists, unhide and return it
      let wrap = document.getElementById('__lr_hotfix_floating');
      if (wrap) {
        wrap.style.display = '';
        wrap.removeAttribute('aria-hidden');
        const start = wrap.querySelector('#__lr_hotfix_start');
        if (start) try { start.focus(); } catch (_) {}
        return wrap;
      }

      // Build hotfix container (always allowed to create; presets removed from settings so no duplication)
      wrap = document.createElement('div');
      wrap.id = '__lr_hotfix_floating';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Control rápido respiración');
      wrap.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:2147483646;pointer-events:auto;display:flex;align-items:center;gap:8px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);border-radius:12px;background:rgba(255,255,255,0.98);max-width:calc(100% - 24px);flex-wrap:wrap';

      // duration selector
      const sel = document.createElement('select');
      sel.id = '__lr_hotfix_select';
      sel.setAttribute('aria-label', 'Temporizador de sesión');
      HOTFIX_SESSION_OPTIONS.forEach(o => {
        const opt = document.createElement('option');
        opt.value = String(o.seconds);
        opt.textContent = o.label;
        sel.appendChild(opt);
      });
      sel.style.cssText = 'padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.08);background:white';
      try { const saved = localStorage.getItem('lr_session_seconds'); if (saved) sel.value = saved; } catch (e) {}
      sel.addEventListener('change', (e) => { try { localStorage.setItem('lr_session_seconds', e.target.value); } catch (e) {} });

      // presets container
      const presetsWrap = document.createElement('div');
      presetsWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
      presetsWrap.setAttribute('role', 'toolbar');
      presetsWrap.setAttribute('aria-label', 'Presets de respiración');

      Object.keys(PRESET_MAP).forEach(k => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = '__lr_hot_preset';
  b.dataset.preset = k;
  b.textContent = PRESET_MAP[k];
  b.style.cssText = 'padding:8px 10px;border-radius:8px;border:1px solid rgba(0,0,0,0.08);background:white;cursor:pointer;font-weight:600';

  b.addEventListener('click', () => {
    try {
      // Prefer the canonical helper if available
      if (window.lr_helpers && typeof window.lr_helpers.setBreathPattern === 'function') {
        window.lr_helpers.setBreathPattern(k);
      } else {
        // Fallback: apply pattern directly to internal timing vars so preset works immediately
        const PRE = {
          box: { inh: 4, h1: 4, exh: 4, h2: 4 },
          calm: { inh: 4, h1: 4, exh: 6, h2: 1 },
          slow: { inh: 5, h1: 5, exh: 7, h2: 1 },
          '478': { inh: 4, h1: 7, exh: 8, h2: 1 }
        };
        const p = PRE[k];
        if (p) {
          inhaleDurationSeconds = p.inh;
          hold1DurationSeconds = p.h1;
          exhaleDurationSeconds = p.exh;
          hold2DurationSeconds = p.h2;
          lrlog('preset applied (fallback)', k);
        }
      }
    } catch (e) { lrwarn('hotfix preset click error', e); }

    // Visual feedback (same as original)
    try { Array.from(presetsWrap.querySelectorAll('button')).forEach(x => x.style.boxShadow = 'none'); } catch (e) {}
    try { b.style.boxShadow = 'inset 0 0 0 2px rgba(34,197,94,0.12)'; } catch (e) {}
    try { showToast('Preset: ' + PRESET_MAP[k]); } catch (e) {}
  }, { passive: true });

  presetsWrap.appendChild(b);
});
      // start button
      const startBtn = document.createElement('button');
      startBtn.id = '__lr_hotfix_start';
      startBtn.type = 'button';
      startBtn.textContent = 'Iniciar sesión (hotfix)';
      startBtn.style.cssText = 'padding:10px 14px;border-radius:8px;border:none;background:linear-gradient(90deg,#56c0ff,#8ee7c8);font-weight:700;cursor:pointer';
      startBtn.addEventListener('click', () => {
        const seconds = parseInt(document.getElementById('__lr_hotfix_select')?.value || '0', 10) || 0;
        try {
          if (window.lr_breathSessions && typeof window.lr_breathSessions.startSession === 'function') {
            window.lr_breathSessions.startSession(seconds);
          } else if (window.lr_helpers && typeof window.lr_helpers.startBreathFlow === 'function') {
            window.lr_helpers.startBreathFlow();
          } else {
            showToast('Función de inicio no disponible');
          }
        } catch (e) { console.warn('hotfix start error', e); }
      }, { passive: true });

      // hide/close button
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.id = '__lr_hotfix_close';
      closeBtn.textContent = 'Cerrar';
      closeBtn.setAttribute('aria-label', 'Cerrar control rápido');
      closeBtn.style.cssText = 'padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:white;cursor:pointer';
      closeBtn.addEventListener('click', () => { closeBreathHotfix(); });

      // layout assemble
      const left = document.createElement('div');
      left.style.display = 'flex'; left.style.flexDirection = 'column'; left.style.gap = '6px'; left.appendChild(presetsWrap);

      const right = document.createElement('div');
      right.style.display = 'flex'; right.style.alignItems = 'center'; right.style.gap = '8px';
      right.appendChild(sel); right.appendChild(startBtn); right.appendChild(closeBtn);

      wrap.appendChild(left);
      wrap.appendChild(right);

      document.body.appendChild(wrap);

      // keyboard accessibility
      try {
        wrap.querySelectorAll('button,select').forEach((el, i) => { el.tabIndex = 0; });
      } catch (e) { }

      return wrap;
    } catch (e) {
      lrwarn('openBreathHotfix error', e);
      return null;
    }
  }

  function closeBreathHotfix() {
    try {
      const wrap = document.getElementById('__lr_hotfix_floating');
      if (!wrap) return;
      wrap.style.display = 'none';
      wrap.setAttribute('aria-hidden', 'true');
    } catch (e) { lrwarn('closeBreathHotfix error', e); }
  }

  function ensureFloatingHotfix() {
    if (!document.getElementById('__lr_hotfix_floating')) openBreathHotfix();
  }

  // ---------- NEW: stopBreathFlowInternal ----------
  function stopBreathFlowInternal() {
    try {
      if (window._lastBreathOverlay && typeof window._lastBreathOverlay._stop === 'function') {
        try { window._lastBreathOverlay._stop(); } catch (e) { lrwarn('overlay._stop threw', e); }
      }

      // Stop remaining active WebAudio sources
      try {
        for (let i = 0; i < activeSources.length; i++) {
          try { activeSources[i].stop(); } catch (e) {}
        }
        activeSources.length = 0;
      } catch (e) { lrwarn('stop activeSources error', e); }

      // Pause and reset HTML audio safely
      try { if (htmlAudio.inhaleEl) { htmlAudio.inhaleEl.pause(); try { htmlAudio.inhaleEl.currentTime = 0; } catch(e){} } } catch (e) {}
      try { if (htmlAudio.exhaleEl) { htmlAudio.exhaleEl.pause(); try { htmlAudio.exhaleEl.currentTime = 0; } catch(e){} } } catch (e) {}
      try { if (htmlAudio.ambientEl) { htmlAudio.ambientEl.pause(); try { htmlAudio.ambientEl.currentTime = 0; } catch(e){} } } catch (e) {}

      try { stopAmbientLoop(); } catch (e) {}

      // Clear any timers registered
      try {
        while (activeTimers.length) {
          const tid = activeTimers.shift();
          try { clearTimeout(tid); } catch (e) {}
        }
      } catch (e) {}

      try { window._lastBreathOverlay = null; } catch (e) {}

      lrlog('stopBreathFlowInternal completed');
    } catch (e) {
      lrwarn('stopBreathFlowInternal error', e);
    }
  }

  // ---------- TTS ----------
  function loadVoicesOnce() {
    return new Promise((resolve) => {
      const vs = speechSynthesis.getVoices();
      if (vs && vs.length) { resolve(vs); return; }
      const onVoices = () => { window.speechSynthesis.removeEventListener('voiceschanged', onVoices); resolve(speechSynthesis.getVoices() || []); };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      setTimeout(() => resolve(speechSynthesis.getVoices() || []), 900);
    });
  }

  async function playTTS(text) {
    if (!text) { showToast('No hay texto para leer'); return false; }
    if (!('speechSynthesis' in window)) { showToast('La síntesis de voz no está disponible en este navegador.'); return false; }
    if (window._lr_tts_enabled === false) { showToast('TTS desactivado en ajustes'); return false; }
    try {
      await resumeAudio();
      const vs = await loadVoicesOnce();
      const voice = (vs.find(v => /^es/i.test(v.lang)) || vs[0]) || null;
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'es-ES';
      u.rate = 1; u.pitch = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      lrlog('TTS speak invoked');
      return true;
    } catch (e) {
      lrwarn('playTTS failed', e);
      showAudioEnablePrompt();
      return false;
    }
  }

  // ---------- Resume audio (unlock) ----------
  async function resumeAudio() {
    await ensureAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); lrlog('audioCtx resumed'); } catch (e) { lrwarn(e); }
    }
    try {
      if (audioCtx) {
        const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.start(0);
        src.stop(0.05);
        lrlog('resumeAudio silent buffer played');
      }
    } catch (e) { lrwarn('resumeAudio fallback failed', e); }
    return audioCtx ? audioCtx.state : 'no-audioctx';
  }

  // ---------- Audio enable prompt ----------
  function showAudioEnablePrompt() {
    try {
      if (document.getElementById('_lr_enable_audio_modal')) return;
      const modal = document.createElement('div'); modal.id = '_lr_enable_audio_modal';
      Object.assign(modal.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.45)', zIndex:17000 });
      const box = document.createElement('div');
      Object.assign(box.style, { background:'#fff', color:'#061226', padding:'18px', borderRadius:'12px', maxWidth:'420px', width:'92%', textAlign:'center', boxShadow:'0 20px 60px rgba(3,10,18,0.12)' });
      box.innerHTML = `<div style="font-weight:700;margin-bottom:8px">Activar audio</div>
                       <div style="color:#374151;margin-bottom:14px">Pulsa el botón para activar el audio (permiso local del navegador).</div>
                       <div style="display:flex;gap:8px;justify-content:center">
                         <button id="_lr_enable_audio_btn" style="padding:10px 14px;border-radius:8px;border:none;background:linear-gradient(90deg,#7bd389,#5ec1ff);color:#04232a;font-weight:700">Activar audio</button>
                         <button id="_lr_enable_audio_cancel" style="padding:10px 14px;border-radius:8px;border:1px solid #cbd5e1;background:transparent;color:#04232a">Cancelar</button>
                       </div>`;
      modal.appendChild(box); document.body.appendChild(modal);
      document.getElementById('_lr_enable_audio_btn').addEventListener('click', async () => {
        await resumeAudio();
        modal.remove();
        showToast('Intentando activar audio — prueba el botón 🔊');
      });
      document.getElementById('_lr_enable_audio_cancel').addEventListener('click', () => modal.remove());
    } catch (e) { lrwarn('showAudioEnablePrompt failed', e); }
  }

  // ---------- Copy & download helpers ----------
  function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => showToast('Frase copiada'));
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast('Frase copiada'); } catch (e) { showToast('No se pudo copiar'); }
    ta.remove();
  }

  async function downloadImageFallback() {
    try {
      const el = document.querySelector('.frase-card') || document.body;
      const canvas = await html2canvas(el, { scale: window.devicePixelRatio || 2 });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url; a.download = 'llavero-respira-frase.png'; document.body.appendChild(a); a.click(); a.remove();
      showToast('Descarga iniciada');
    } catch (e) {
      lrwarn('downloadImageFallback error', e);
      showToast('No se pudo descargar la imagen.');
    }
  }

  async function downloadPhraseImage(el, fileName = 'llavero-frase.png') {
    if (!el) el = document.querySelector('.frase-card') || document.querySelector('.card') || document.body;
    try {
      const canvas = await html2canvas(el, { scale: window.devicePixelRatio || 2 });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      showToast('Descarga iniciada');
      return true;
    } catch (e) {
      lrwarn('downloadPhraseImage error', e);
      showToast('Error en descarga');
      return false;
    }
  }

  // expose download helpers (global)
  window.downloadPhraseImage = downloadPhraseImage;
  window.downloadImageFallback = downloadImageFallback;

  // ---------- Share ----------
  async function sharePhrase({ title, text, url }) {
    const shareText = `${text || ''}\n${url || location.href}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Llavero Respira', text: shareText, url: url || location.href });
        showToast('Compartiendo...');
        return true;
      } catch (e) {
        lrwarn('navigator.share failed', e);
      }
    }
    const wa = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    try { window.open(wa, '_blank'); return true; } catch (e) { copyToClipboard(shareText); return false; }
  }

  // ---------- Favorites ----------
  function getFavoritos() { try { return JSON.parse(localStorage.getItem(KEY_FAVORITOS) || '[]'); } catch (e) { return []; } }
  function saveFavoritos(arr) { try { localStorage.setItem(KEY_FAVORITOS, JSON.stringify(arr)); } catch (e) {} }
  function toggleFavorite(text) {
    if (!text) return false;
    const favs = getFavoritos();
    if (favs.indexOf(text) !== -1) { const next = favs.filter(x => x !== text); saveFavoritos(next); return false; }
    favs.unshift(text); saveFavoritos(favs.slice(0, 200));
    return true;
  }

  function showFavoritesModal() {
    const favs = getFavoritos();
    const modal = document.getElementById('_lr_fav_modal') || document.createElement('div'); modal.id = '_lr_fav_modal';
    Object.assign(modal.style, { position:'fixed', left:0, right:0, top:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:19000 });
    const box = document.createElement('div');
    Object.assign(box.style, { maxWidth:'720px', width:'92%', maxHeight:'70vh', overflow:'auto', background:'#fff', color:'#042231', padding:'18px', borderRadius:'12px', boxShadow:'0 20px 60px rgba(3,10,18,0.12)' });
    let inner = '<div style="display:flex;justify-content:space-between;align-items:center"><strong>Favoritos</strong><button id="_lr_close_fav" style="background:transparent;border:1px solid rgba(0,0,0,0.06);padding:6px;border-radius:8px">Cerrar</button></div><hr style="margin:10px 0;opacity:0.06" />';
    if (favs && favs.length) inner += favs.map(f => `<div style="margin:10px 0;line-height:1.3;color:#022">${escapeHtml(f)}</div>`).join('');
    else inner += '<div style="color:rgba(7,16,28,0.8)">No hay favoritos</div>';
    box.innerHTML = inner;
    modal.innerHTML = '';
    modal.appendChild(box);
    document.body.appendChild(modal);
    const closeBtn = document.getElementById('_lr_close_fav'); if (closeBtn) closeBtn.addEventListener('click', () => modal && modal.parentNode && modal.parentNode.removeChild(modal));
  }

  function escapeHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ---------- Settings modal ----------
  function showSettingsModal() {
    if (document.getElementById('_lr_settings_modal')) return;
    const modal = document.createElement('div'); modal.id = '_lr_settings_modal';
    Object.assign(modal.style, { position:'fixed', left:0, right:0, top:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.5)', zIndex:19000 });
    const box = document.createElement('div');
    Object.assign(box.style, { width:'min(720px,94%)', background:'#fff', color:'#042231', padding:'18px', borderRadius:'12px', boxShadow:'0 20px 60px rgba(3,10,18,0.12)' });

    // NOTE: Presets moved to the hotfix quick control to avoid duplicate UI and to improve accessibility.
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>Ajustes</strong>
        <button id="_lr_close_settings" style="background:transparent;border:1px solid rgba(0,0,0,0.06);padding:6px;border-radius:8px">Cerrar</button>
      </div>
      <hr style="margin:10px 0;opacity:0.06" />
      <div style="display:flex;flex-direction:column;gap:12px">
        <label><input type="checkbox" id="_lr_toggle_tts" /> Activar TTS (lectura de frases)</label>
        <label><input type="checkbox" id="_lr_toggle_ambient" /> Activar sonido ambiental al iniciar respirar</label>
        <div>
          <div style="font-weight:700;margin-bottom:6px">Presets integrados</div>
          <div style="color:rgba(0,0,0,0.55);font-size:0.95rem">Los presets de respiración están disponibles en el control rápido situado en la parte inferior de la pantalla.</div>
        </div>
      </div>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);
    document.getElementById('_lr_close_settings').addEventListener('click', () => modal.remove());

    const ttsCheckbox = document.getElementById('_lr_toggle_tts');
    const ambientCheckbox = document.getElementById('_lr_toggle_ambient');
    if (ttsCheckbox) ttsCheckbox.checked = (window._lr_tts_enabled !== false);
    if (ambientCheckbox) ambientCheckbox.checked = !!(htmlAudio.ambientEl || audioBuffers.ambient);

    if (ttsCheckbox) ttsCheckbox.addEventListener('change', () => {
      showToast('TTS ' + (ttsCheckbox.checked ? 'activado' : 'desactivado'));
      window._lr_tts_enabled = ttsCheckbox.checked;
    });
    if (ambientCheckbox) ambientCheckbox.addEventListener('change', () => {
      showToast('Ambient ' + (ambientCheckbox.checked ? 'activado' : 'desactivado'));
      window._lr_ambient_enabled = ambientCheckbox.checked;
    });
  }

  // ---------- Menu annotation & delegation ----------
  function normalizeText(s) { return (s||'').trim().toLowerCase().replace(/\s+/g,' '); }
  function detectActionFromButton(btn) {
    if (!btn) return null;
    if (btn.dataset && btn.dataset.action) return btn.dataset.action;
    if (btn.id) {
      const id = btn.id.toLowerCase();
      if (id.indexOf('breath') !== -1 || id.indexOf('respira') !== -1) return 'breath';
      if (id.indexOf('fav') !== -1) return 'favorite';
      if (id.indexOf('tts') !== -1) return 'tts';
      if (id.indexOf('copy') !== -1) return 'copy';
      if (id.indexOf('download') !== -1) return 'download';
      if (id.indexOf('ambient') !== -1) return id.indexOf('stop') !== -1 ? 'ambient-stop' : 'ambient-start';
      if (id.indexOf('audio') !== -1) return 'enable-audio';
    }
    const txt = normalizeText(btn.textContent || btn.innerText || '');
    if (!txt) return null;
    if (txt.includes('respira') || txt.includes('respirar') || txt.includes('breath') || txt.includes('🌬')) return 'breath';
    if (txt.includes('favorit') || txt.includes('favorito') || txt.includes('favorita') || txt.includes('⭐')) return 'favorite';
    if (txt.includes('escuchar') || txt.includes('tts') || txt.includes('🔊')) return 'tts';
    if (txt.includes('copiar') || txt.includes('copi') || txt.includes('📋')) return 'copy';
    if (txt.includes('descargar') || txt.includes('download') || txt.includes('⬇')) return 'download';
    if (txt.includes('ambient') || txt.includes('ambiental')) return txt.includes('parar')||txt.includes('stop') ? 'ambient-stop' : 'ambient-start';
    if (txt.includes('activar audio') || txt.includes('activar sonido') || txt.includes('🔈')) return 'enable-audio';
    if (txt.includes('favoritos') && txt.includes('mostrar')) return 'show-favorites';
    if (txt.includes('compart') || txt.includes('share') || txt.includes('🔗')) return 'share';
    if (txt.includes('ajust') || txt.includes('ajuste') || txt.includes('settings') || txt.includes('⚙')) return 'settings';
    return null;
  }

  function annotateMenuButtonsOnce() {
    try {
      const panel = document.getElementById('menuPanel');
      if (!panel) return 0;
      const btns = Array.from(panel.querySelectorAll('button, [role="menuitem"], [data-action]'));
      let changed = 0;
      btns.forEach(b => {
        if (b.dataset && b.dataset.action) return;
        const txt = (b.textContent || b.innerText || '').trim().toLowerCase();
        const id = (b.id || '').toLowerCase();
        let action = null;
        if (id.includes('breath') || txt.includes('respira') || txt.includes('respirar') || txt.includes('🌬')) action = 'breath';
        else if (id.includes('fav') || txt.includes('favorit') || txt.includes('favorito') || txt.includes('favorita') || txt.includes('⭐')) action = 'favorite';
        else if (txt.includes('escuchar') || txt.includes('tts') || txt.includes('🔊')) action = 'tts';
        else if (txt.includes('copiar') || txt.includes('copi') || txt.includes('📋')) action = 'copy';
        else if (txt.includes('descargar') || txt.includes('download') || txt.includes('⬇')) action = 'download';
        else if (id.includes('ambient') || txt.includes('ambient')) action = txt.includes('parar')||txt.includes('stop') ? 'ambient-stop' : 'ambient-start';
        else if (txt.includes('activar audio') || txt.includes('activar sonido') || txt.includes('🔈')) action = 'enable-audio';
        else if (txt.includes('favoritos') && txt.includes('mostrar')) action = 'show-favorites';
        else if (txt.includes('compart') || txt.includes('share') || txt.includes('🔗')) action = 'share';
        else if (txt.includes('ajust') || txt.includes('ajuste') || txt.includes('settings') || txt.includes('⚙')) action = 'settings';
        if (action) { b.dataset.action = action; changed++; }
      });
      if (changed) lrlog('annotateMenuButtonsOnce -> data-action added:', changed);
      return changed;
    } catch (e) { lrwarn('annotate error', e); return 0; }
  }

  // ---------- Core action handler ----------
  function handleMenuAction(action, btn) {
    let phrase = '';
    try {
      if (window._phrases_current) phrase = window._phrases_current;
      else if (typeof window._phrases_currentIndex === 'number' && Array.isArray(window._phrases_list)) phrase = window._phrases_list[window._phrases_currentIndex] || '';
    } catch (e) { phrase = ''; }
    if (!phrase) {
      const pEl = document.getElementById('frase-text') || document.getElementById('frase');
      phrase = pEl ? (pEl.textContent || '') : '';
    }

    switch (action) {
      case 'breath':
        try { openBreathHotfix(); } catch (e) { startBreathFlowInternal(); }
        break;
      case 'favorite': if (phrase) { const added = toggleFavorite(phrase); if (btn) btn.textContent = added ? '♥ Favorita' : '♡ Favorita'; showToast(added ? 'Añadido a favoritos' : 'Eliminado de favoritos'); } break;
      case 'copy': if (phrase) { copyToClipboard(phrase); } break;
      case 'share': if (phrase) sharePhrase({ title: 'Frase', text: phrase, url: location.href }); break;
      case 'tts': if (phrase && window._lr_tts_enabled !== false) { playTTS(phrase); } else showToast('No hay texto para leer'); break;
      case 'ambient-start': preloadAssets().then(() => { if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambientEl) { try { htmlAudio.ambientEl.play().catch(()=>{}); } catch(e){} } }); break;
      case 'ambient-stop': stopAmbientLoop(); break;
      case 'download': {
        const el = document.querySelector('.frase-card') || document.body;
        let backup;
        try {
          const fEl = document.getElementById('frase-text');
          if (fEl) { backup = fEl.textContent; if (phrase) fEl.textContent = phrase; }
        } catch (e) {}
        downloadPhraseImage(el);
        try { const fEl = document.getElementById('frase-text'); if (fEl && typeof backup === 'string') fEl.textContent = backup; } catch (e) {}
      } break;
      case 'enable-audio': resumeAudio().then(() => showToast('Intentando activar audio')); break;
      case 'show-favorites': showFavoritesModal(); break;
      case 'share-app': sharePhrase({ title:'Llavero Respira', text:'Echa un vistazo', url: location.href }); break;
      case 'settings': showSettingsModal(); break;
      default: lrlog('action not mapped:', action); break;
    }
  }

  // ---------- Fallback attach helper ----------
  function attachTouchClick(ids, fn) {
    if (!Array.isArray(ids)) ids = [ids];
    for (let i = 0; i < ids.length; i++) {
      const el = document.getElementById(ids[i]);
      if (!el) continue;
      try {
        el.addEventListener('click', fn);
        el.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); fn.call(this, e); }, { passive: false });
      } catch (e) { lrwarn('attach error', ids[i], e); }
    }
  }

  // ---------- Delegation ----------
  function initMenuDelegation() {
    const panel = document.getElementById('menuPanel');
    if (!panel) {
      lrlog('menuPanel not found — skip delegation');
      return false;
    }
    function onPointer(e) {
      try {
        const target = (e.target && e.target.closest && e.target.closest('button, [role="menuitem"], [data-action]')) || e.target;
        if (!target || !panel.contains(target)) return;
        if (e.type === 'touchend') e.preventDefault();
        e.stopPropagation();
        const action = detectActionFromButton(target);
        if (action) handleMenuAction(action, target);
        setTimeout(() => { panel.style.display = 'none'; const tgl = document.getElementById('menuToggle'); if (tgl) tgl.setAttribute('aria-expanded', 'false'); }, 80);
      } catch (err) { lrwarn('delegation onPointer error', err); }
    }
    panel.addEventListener('click', onPointer);
    panel.addEventListener('touchend', onPointer, { passive: false });
    lrlog('menu delegation activated');
    return true;
  }

  // ---------- Init bindings ----------
  document.addEventListener('DOMContentLoaded', function () {
    annotateMenuButtonsOnce();
    initMenuDelegation();

    // Ensure hotfix exists (create if missing) but keep it visible for quick access
    try { ensureFloatingHotfix(); } catch (e) { lrwarn('ensureFloatingHotfix failed', e); }

    // Also ensure menu contains entry to open hotfix if not present
    try {
      (function ensureMenuBreathEntry(){
        const panel = document.getElementById('menuPanel');
        if (!panel) return;
        let el = Array.from(panel.querySelectorAll('button, [role="menuitem"], [data-action]')).find(x=>{
          const a = x.dataset && x.dataset.action;
          const txt = (x.textContent||'').toLowerCase();
          return (a === 'breath') || txt.includes('respira') || txt.includes('comenzar sesión');
        });
        if (!el) {
          el = document.createElement('button');
          el.type = 'button';
          el.dataset.action = 'breath';
          el.textContent = 'Comenzar sesión de respiración';
          el.style.cssText = 'display:block;padding:10px;border:none;background:transparent;text-align:left;width:100%';
          panel.insertBefore(el, panel.firstChild);
        }
        el.addEventListener('click', (e)=>{
          e.preventDefault(); e.stopPropagation();
          openBreathHotfix();
          const wrap = document.getElementById('__lr_hotfix_floating');
          if (wrap) { wrap.style.display = ''; wrap.removeAttribute('aria-hidden'); }
        }, { passive: true });
      })();
    } catch(e){ lrwarn('ensureMenuBreathEntry failed', e); }

    // Remove invite button from card (hidden / removed) as requested
    try {
      const inviteBtn = document.getElementById('inviteBtn');
      if (inviteBtn && inviteBtn.parentNode) inviteBtn.parentNode.removeChild(inviteBtn);
      const inviteMenu = document.getElementById('invite_menu');
      if (inviteMenu && inviteMenu.parentNode) { /* keep menu invite if present */ }
    } catch (e) { lrwarn('could not remove inviteBtn', e); }

    // Always attach direct handlers to main card controls so they respond
    attachTouchClick(['ttsBtn_menu','ttsBtn'], function () {
      let t = '';
      try { if (window._phrases_current) t = window._phrases_current; else if (typeof window._phrases_currentIndex === 'number' && Array.isArray(window._phrases_list)) t = window._phrases_list[window._phrases_currentIndex] || ''; } catch (e) { t = ''; }
      if (!t) t = (document.getElementById('frase-text') && document.getElementById('frase-text').textContent) || '';
      if (t) { lrlog('tts requested'); playTTS(t); } else showToast('No hay texto para leer');
    });

    attachTouchClick(['favBtn_menu','favBtn'], function () {
      let t = '';
      try { if (window._phrases_current) t = window._phrases_current; else if (typeof window._phrases_currentIndex === 'number' && Array.isArray(window._phrases_list)) t = window._phrases_list[window._phrases_currentIndex] || ''; } catch (e) { t = ''; }
      if (!t) t = (document.getElementById('frase-text') && document.getElementById('frase-text').textContent) || '';
      if (t) { const added = toggleFavorite(t); const el = document.getElementById('favBtn_menu') || document.getElementById('favBtn'); if (el) el.textContent = added ? '♥ Favorita' : '♡ Favorita'; showToast(added ? 'Añadido a favoritos' : 'Eliminado de favoritos'); }
    });

    attachTouchClick(['downloadBtn','downloadBtn_menu'], function () {
      const el = document.querySelector('.frase-card') || document.querySelector('.card') || document.body;
      let t = '';
      try { if (window._phrases_current) t = window._phrases_current; } catch (e) { t = ''; }
      // temporarily ensure DOM contains full phrase for capture
      let backup;
      try {
        const fEl = document.getElementById('frase-text');
        if (fEl) { backup = fEl.textContent; if (t) fEl.textContent = t; }
      } catch (e) {}
      downloadPhraseImage(el);
      try { const fEl = document.getElementById('frase-text'); if (fEl && typeof backup === 'string') fEl.textContent = backup; } catch (e) {}
    });

    attachTouchClick(['shareBtn','shareBtn_menu'], function () {
      let t = '';
      try { if (window._phrases_current) t = window._phrases_current; else if (typeof window._phrases_currentIndex === 'number' && Array.isArray(window._phrases_list)) t = window._phrases_list[window._phrases_currentIndex] || ''; } catch (e) { t = ''; }
      if (!t) t = (document.getElementById('frase-text') && document.getElementById('frase-text').textContent) || '';
      if (t) { sharePhrase({ title: 'Frase', text: t, url: location.href }); }
      else showToast('No hay texto para compartir');
    });

    // breath + ambient controls: breath button opens hotfix quick control
    attachTouchClick(['breathBtn_menu','breathBtn'], function () { openBreathHotfix(); });
    attachTouchClick(['enableAudioBtn','enableAudio'], function () { resumeAudio().then(function () { showToast('Intentando activar audio'); }); });
    attachTouchClick(['startAmbientBtn'], function () { preloadAssets().then(function () { if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambientEl) try { htmlAudio.ambientEl.play().catch(()=>{}); } catch(e){} }); });
    attachTouchClick(['stopAmbientBtn'], function () { stopAmbientLoop(); });

    lrlog('card controls attached (tts,fav,download,share,breath,ambient)');
  });

  // ---------- Public API ----------
  window.lr_helpers = window.lr_helpers || {};
  Object.assign(window.lr_helpers, {
    preload: preloadAssets,
    resumeAudio: resumeAudio,
    startBreathFlow: startBreathFlowInternal,
    playTTS: playTTS,
    getFavorites: getFavoritos,
    toggleFavorite: toggleFavorite,
    showFavorites: showFavoritesModal,
    downloadPhraseImage: downloadPhraseImage,
    downloadImageFallback: downloadImageFallback,
    sharePhrase: sharePhrase,
    copyToClipboard: copyToClipboard,
    startAmbient: async () => { await preloadAssets(); if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambientEl) try { htmlAudio.ambientEl.play().catch(()=>{}); } catch(e){} },
    stopAmbient: stopAmbientLoop,
    setBreathPattern: (name) => {
      const PRE = { box:{inh:4,h1:4,exh:4,h2:4}, calm:{inh:4,h1:4,exh:6,h2:1}, slow:{inh:5,h1:5,exh:7,h2:1}, '478':{inh:4,h1:7,exh:8,h2:1} };
      const p = PRE[name];
      if (!p) { lrwarn('preset not found', name); return; }
      inhaleDurationSeconds = p.inh; hold1DurationSeconds = p.h1; exhaleDurationSeconds = p.exh; hold2DurationSeconds = p.h2;
      lrlog('preset applied', name);
    },
    setCustomBreath: (inh,h1,exh,h2) => {
      inhaleDurationSeconds = Number(inh)||inhaleDurationSeconds;
      hold1DurationSeconds = Number(h1)||hold1DurationSeconds;
      exhaleDurationSeconds = Number(exh)||exhaleDurationSeconds;
      hold2DurationSeconds = Number(h2)||hold2DurationSeconds;
      lrlog('custom breath set', { inhaleDurationSeconds, hold1DurationSeconds, exhaleDurationSeconds, hold2DurationSeconds });
    },
    dumpState: () => ({
      audioCtxState: audioCtx ? audioCtx.state : 'no-audioctx',
      buffers: { inhaleCue: !!audioBuffers.inhaleCue, exhaleCue: !!audioBuffers.exhaleCue, breath: !!audioBuffers.breath, ambient: !!audioBuffers.ambient },
      htmlAudio: { inhale: !!htmlAudio.inhaleEl, exhale: !!htmlAudio.exhaleEl, ambient: !!htmlAudio.ambientEl },
      offsets: { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds, hold1DurationSeconds, hold2DurationSeconds }
    }),
    stopBreathFlow: stopBreathFlowInternal
  });

  // autopreload (no blocking)
  preloadAssets().catch(e => lrwarn('preload error', e));

  lrlog('ready');
})();
// ===== Hotfix UI suppression (append) =====
// By default suppress visual rendering of Hotfix in the client UI.
// To explicitly allow Hotfix visual UI in admin/technical pages, set window.ALLOW_HOTFIX_UI = true before helpers.v2 runs.
(function(){
  try {
    if (typeof window.ALLOW_HOTFIX_UI === 'undefined') window.ALLOW_HOTFIX_UI = false;

    if (!window.ALLOW_HOTFIX_UI) {
      // Observe DOM for hotfix insertion and remove/hide it immediately
      var mo = new MutationObserver(function(muts){
        muts.forEach(function(m){
          Array.prototype.forEach.call(m.addedNodes || [], function(node){
            try {
              if (!node) return;
              // check by id or class used by hotfix
              if (node.id === '__lr_hotfix_floating' || (node.classList && node.classList.contains('__lr_hotfix_floating'))) {
                // remove visual element but keep logic intact (internal functions remain available)
                try { node.style.display = 'none'; node.remove(); console.log('[hotfix] visual suppressed'); } catch(e){}
              }
              // also check within subtree
              if (node.querySelector) {
                var found = node.querySelector('#__lr_hotfix_floating');
                if (found) { try { found.style.display='none'; found.remove(); console.log('[hotfix] visual suppressed (subtree)'); } catch(e){} }
              }
            } catch(e){}
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
      // initial cleanup if already present
      var existing = document.getElementById('__lr_hotfix_floating');
      if (existing) { try { existing.style.display = 'none'; existing.remove(); console.log('[hotfix] existing visual removed'); } catch(e){} }
      // expose function to stop the observer if needed
      window.__stop_hotfix_suppression = function(){ try { mo.disconnect(); delete window.__stop_hotfix_suppression; console.log('hotfix suppression stopped'); } catch(e){} };
    }
  } catch(e){ console.warn('hotfix suppression init failed', e); }
})();
