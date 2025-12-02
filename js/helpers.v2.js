// helpers.v2.js - Complete, corrected helpers (audio, breath flow, favorites, TTS, share, download, delegation)
// - Ensures downloadPhraseImage is defined and exposed before any fallback callers
// - Keeps lrlog/lrwarn wrappers (activate with window.LR_DEBUG = true)
// - Safe calls to window.lr_helpers with retries when necessary
(function () {
  'use strict';

  // logging control
  window.LR_DEBUG = window.LR_DEBUG === true;
  function lrlog(...a) { if (window.LR_DEBUG) console.log(...a); }
  function lrwarn(...a) { if (window.LR_DEBUG) console.warn(...a); }

  lrlog('[helpers] loading helpers.v2.js');

  const AUDIO = {
    breathCandidates: ['Breath.mp3', 'breath.mp3', 'BREATH.mp3'],
    inhaleCue: 'inhaleCue.mp3',
    exhaleCue: 'exhaleCue.mp3',
    ambientCandidates: ['ambient.mp3', 'Ambient.mp3', 'AMBIENT.mp3']
  };

  // breathing timing defaults (can be changed via API)
  let inhaleOffsetSeconds = 0.0;
  let inhaleDurationSeconds = 2.8;
  let exhaleOffsetSeconds = 2.8;
  let exhaleDurationSeconds = 3.5;
  let hold1DurationSeconds = 4.0;
  let hold2DurationSeconds = 1.0;

  // audio contexts / buffers
  let audioCtx = null;
  const audioBuffers = { breath: null, inhaleCue: null, exhaleCue: null, ambient: null };
  let ambientSource = null, ambientGain = null;
  const htmlAudio = { inhaleEl: null, exhaleEl: null, ambientEl: null, breathUrl: null };

  const KEY_FAVORITOS = 'lr_favoritos_v1';

  /* ---------- Utilities ---------- */
  async function existsUrl(url) {
    if (!url) return false;
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r && r.ok) return true;
    } catch (e) { /* ignore HEAD fail */ }
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
      lrlog('[helpers] AudioContext created', audioCtx.state);
      return audioCtx;
    } catch (e) {
      lrwarn('[helpers] WebAudio not available', e);
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
      const buf = await ctx.decodeAudioData(ab);
      lrlog('[helpers] buffer decoded ->', url);
      return buf;
    } catch (e) {
      lrwarn('[helpers] error loading audio', url, e);
      return null;
    }
  }

  function scheduleBufferPlay(buffer, offset, duration, opts) {
    opts = opts || {};
    const gain = typeof opts.gain === 'number' ? opts.gain : 0.9;
    const fade = typeof opts.fade === 'number' ? opts.fade : 0.06;
    if (!audioCtx || !buffer) return false;
    try {
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      const g = audioCtx.createGain();
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + fade);
      const playDuration = Math.max(0.05, duration);
      const endAt = now + playDuration;
      g.gain.setValueAtTime(gain, endAt - fade);
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.connect(g).connect(audioCtx.destination);
      src.start(now, offset, playDuration);
      src.stop(endAt + 0.05);
      lrlog('[helpers] scheduled play', { offset, playDuration });
      return true;
    } catch (e) {
      lrwarn('[helpers] schedule error', e);
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
      el.play().catch(e => lrwarn('[helpers] html play error', e));
      setTimeout(() => { try { el.pause(); el.currentTime = 0; } catch (e) {} }, Math.max(400, Math.round(duration)));
      lrlog('[helpers] html played', url, { offset, duration });
      return true;
    } catch (e) {
      lrwarn('[helpers] playHtml failed', e);
      return false;
    }
  }

  /* ---------- Ambient / Breath players ---------- */
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
      lrlog('[helpers] ambient webaudio start');
      return;
    }
    if (url) {
      if (!htmlAudio.ambientEl) { htmlAudio.ambientEl = new Audio(url); htmlAudio.ambientEl.loop = true; htmlAudio.ambientEl.volume = 0.12; }
      htmlAudio.ambientEl.play().catch(()=>{});
      lrlog('[helpers] ambient html start');
    }
  }
  function stopAmbientLoop() {
    try { if (ambientGain && audioCtx) ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6); } catch (e) {}
    try { if (ambientSource && audioCtx) ambientSource.stop(audioCtx.currentTime + 0.5); } catch (e) {}
    ambientSource = null; ambientGain = null;
    try { if (htmlAudio.ambientEl) { htmlAudio.ambientEl.pause(); htmlAudio.ambientEl.currentTime = 0; } } catch (e) {}
    lrlog('[helpers] ambient stopped');
  }

  /* ---------- Preload assets (audio) ---------- */
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
      let chosen = null;
      for (let i = 0; i < AUDIO.breathCandidates.length; i++) {
        const c = AUDIO.breathCandidates[i];
        if (await existsUrl(c)) { chosen = c; break; }
      }
      if (chosen) {
        const b3 = await loadAudioBuffer(chosen);
        if (b3) audioBuffers.breath = b3; else htmlAudio.breathUrl = chosen;
      }
      let amb = null;
      for (let j = 0; j < AUDIO.ambientCandidates.length; j++) {
        const a = AUDIO.ambientCandidates[j];
        if (await existsUrl(a)) { amb = a; break; }
      }
      if (amb) {
        const b4 = await loadAudioBuffer(amb);
        if (b4) audioBuffers.ambient = b4; else { htmlAudio.ambientEl = new Audio(amb); htmlAudio.ambientEl.loop = true; htmlAudio.ambientEl.volume = 0.12; }
      }
    } catch (e) {
      lrwarn('[helpers] preloadAssets error', e);
    }

    lrlog('[helpers] preload results', {
      inhaleCue: !!audioBuffers.inhaleCue || !!htmlAudio.inhaleEl,
      exhaleCue: !!audioBuffers.exhaleCue || !!htmlAudio.exhaleEl,
      breath: !!audioBuffers.breath || !!htmlAudio.breathUrl,
      ambient: !!audioBuffers.ambient || !!htmlAudio.ambientEl
    });
  }

  /* ---------- Breath flow (UI + scheduling) ---------- */
  async function playInhale() {
    await preloadAssets();
    if (audioBuffers.inhaleCue) { if (scheduleBufferPlay(audioBuffers.inhaleCue, 0, audioBuffers.inhaleCue.duration || inhaleDurationSeconds)) return; }
    if (htmlAudio.inhaleEl) { if (playHtml(htmlAudio.inhaleEl.src, 0, inhaleDurationSeconds)) return; }
    if (audioBuffers.breath) { if (scheduleBufferPlay(audioBuffers.breath, inhaleOffsetSeconds, inhaleDurationSeconds)) return; }
    if (htmlAudio.breathUrl) { if (playHtml(htmlAudio.breathUrl, inhaleOffsetSeconds, inhaleDurationSeconds)) return; }
    lrlog('[helpers] no inhale audio available');
  }
  async function playExhale() {
    await preloadAssets();
    if (audioBuffers.exhaleCue) { if (scheduleBufferPlay(audioBuffers.exhaleCue, 0, audioBuffers.exhaleCue.duration || exhaleDurationSeconds)) return; }
    if (htmlAudio.exhaleEl) { if (playHtml(htmlAudio.exhaleEl.src, 0, exhaleDurationSeconds)) return; }
    if (audioBuffers.breath) { if (scheduleBufferPlay(audioBuffers.breath, exhaleOffsetSeconds, exhaleDurationSeconds)) return; }
    if (htmlAudio.breathUrl) { if (playHtml(htmlAudio.breathUrl, exhaleOffsetSeconds, exhaleDurationSeconds)) return; }
    lrlog('[helpers] no exhale audio available');
  }

  async function startBreathFlowInternal() {
    await resumeAudio();
    await preloadAssets();

    // avoid creating multiple overlays
    if (document.getElementById('lr-breath-overlay')) {
      lrlog('[helpers] breath overlay already active');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'lr-breath-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', zIndex: 17000
    });

    const container = document.createElement('div');
    Object.assign(container.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' });

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

    // start ambient if available and setting enabled
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
    async function loopStep() {
      if (!running) return;
      const s = steps[idx];
      try {
        circle.textContent = s.label;
        small.textContent = s.label + (s.duration ? ' · ' + Math.round(s.duration) + 's' : '');
      } catch (e) {}
      if (s.action) {
        try { await s.action(); } catch (e) { lrwarn('[helpers] action error', e); }
      }
      try {
        const scaleFrom = s.label === 'Exhala' ? 1 : 0.6;
        const scaleTo = s.label === 'Exhala' ? 0.6 : 1.0;
        if (circle.animate) {
          circle.animate([{ transform: 'scale(' + scaleFrom + ')', opacity: 0.75 }, { transform: 'scale(' + scaleTo + ')', opacity: 1 }],
            { duration: s.duration * 1000, easing: 'ease-in-out', fill: 'forwards' });
        } else {
          circle.style.transition = 'transform ' + s.duration + 's ease-in-out';
          circle.style.transform = 'scale(' + scaleTo + ')';
        }
      } catch (e) {}
      timeoutId = setTimeout(function () {
        idx = (idx + 1) % steps.length;
        loopStep();
      }, Math.round(s.duration * 1000));
    }
    loopStep();

    overlay._stop = function () {
      running = false;
      if (timeoutId) clearTimeout(timeoutId);
      try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {}
      lrlog('[helpers] overlay stopped');
    };
    overlay.addEventListener('click', function () { if (overlay._stop) overlay._stop(); });
    window._lastBreathOverlay = overlay;
  }

  /* ---------- TTS ---------- */
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
    if (!text) return;
    if (!('speechSynthesis' in window)) {
      showToast('La síntesis de voz no está disponible en este navegador.');
      return false;
    }
    if (window._lr_tts_enabled === false) {
      showToast('TTS desactivado en ajustes');
      return false;
    }
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
      lrlog('[helpers] TTS speak', text);
      return true;
    } catch (e) {
      lrwarn('[helpers] playTTS failed', e);
      showAudioEnablePrompt();
      return false;
    }
  }

  /* ---------- Resume audio (unlock tricks) ---------- */
  async function resumeAudio() {
    await ensureAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); lrlog('[helpers] audioCtx resumed'); } catch (e) { lrwarn(e); }
    }
    try {
      if (audioCtx) {
        const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.start(0);
        src.stop(0.05);
        lrlog('[helpers] silent buffer played to unlock audio');
      }
    } catch (e) { lrwarn('[helpers] resume fallback failed', e); }
    return audioCtx ? audioCtx.state : 'no-audioctx';
  }

  /* ---------- copy & download helpers ---------- */
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
      lrwarn('download error', e);
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
      lrwarn('[helpers] downloadPhraseImage error', e);
      showToast('Error en descarga');
      return false;
    }
  }

  // expose globally (in case other scripts call it directly)
  window.downloadPhraseImage = downloadPhraseImage;

  async function sharePhrase({ title, text, url }) {
    const shareText = `${text || ''}\n${url || location.href}`;
    if (navigator.share) {
      try { await navigator.share({ title: title || 'Llavero Respira', text: shareText, url: url || location.href }); showToast('Compartiendo...'); return true; } catch (e) { lrwarn('[helpers] navigator.share failed', e); }
    }
    const wa = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    try { window.open(wa, '_blank'); return true; } catch (e) { copyToClipboard(shareText); return false; }
  }

  function inviteFriend(custom) {
    const baseUrl = location.origin + location.pathname;
    const msg = custom || `¡Tengo mi Llavero Respira de Dulces Recuerdos! Me está encantando. Échale un vistazo: ${baseUrl}`;
    const wa = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(wa, '_blank');
  }

  /* ---------- Favorites ---------- */
  function getFavoritos() { try { return JSON.parse(localStorage.getItem(KEY_FAVORITOS) || '[]'); } catch (e) { return []; } }
  function saveFavoritos(arr) { try { localStorage.setItem(KEY_FAVORITOS, JSON.stringify(arr)); } catch (e) {} }
  function toggleFavorite(text) { if (!text) return false; const favs = getFavoritos(); if (favs.indexOf(text) !== -1) { const next = favs.filter(x => x !== text); saveFavoritos(next); return false; } favs.unshift(text); saveFavoritos(favs.slice(0,200)); return true; }

  function showFavoritesModal() {
    const favs = getFavoritos();
    const modal = document.getElementById('_lr_fav_modal') || document.createElement('div'); modal.id = '_lr_fav_modal';
    Object.assign(modal.style, { position:'fixed', left:0, right:0, top:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:19000 });
    const box = document.createElement('div'); Object.assign(box.style, { maxWidth:'720px', width:'92%', maxHeight:'70vh', overflow:'auto', background:'rgba(255,255,255,0.98)', color:'#042231', padding:'18px', borderRadius:'12px' });
    let inner = '<div style="display:flex;justify-content:space-between;align-items:center"><strong>Favoritos</strong><button id="_lr_close_fav" style="background:transparent;color:#042231;border:1px solid rgba(0,0,0,0.06);padding:6px;border-radius:8px">Cerrar</button></div><hr style="opacity:.08;margin:8px 0">';
    if (favs && favs.length) inner += favs.map(f => '<div style="margin:10px 0;line-height:1.3;color:#022">'+ escapeHtml(f) + '</div>').join('');
    else inner += '<div style="color:rgba(7,16,28,0.8)">No hay favoritos</div>';
    box.innerHTML = inner; modal.innerHTML = ''; modal.appendChild(box); document.body.appendChild(modal);
    const closeBtn = document.getElementById('_lr_close_fav'); if (closeBtn) closeBtn.addEventListener('click', () => modal && modal.parentNode && modal.parentNode.removeChild(modal));
  }

  function escapeHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ---------- Settings modal ---------- */
  function showSettingsModal() {
    if (document.getElementById('_lr_settings_modal')) return;
    const modal = document.createElement('div'); modal.id = '_lr_settings_modal';
    Object.assign(modal.style, { position:'fixed', left:0, right:0, top:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.5)', zIndex:19000 });
    const box = document.createElement('div');
    Object.assign(box.style, { width:'min(720px,94%)', background:'#fff', color:'#042231', padding:'18px', borderRadius:'12px', boxShadow:'0 20px 60px rgba(3,10,18,0.12)' });
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
          <div style="font-weight:700;margin-bottom:6px">Presets de respiración</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button data-preset="box" class="_lr_preset_btn" style="padding:8px 10px;border-radius:8px">Box (4-4-4-4)</button>
            <button data-preset="calm" class="_lr_preset_btn" style="padding:8px 10px;border-radius:8px">Calm</button>
            <button data-preset="slow" class="_lr_preset_btn" style="padding:8px 10px;border-radius:8px">Slow</button>
            <button data-preset="478" class="_lr_preset_btn" style="padding:8px 10px;border-radius:8px">4-7-8</button>
          </div>
        </div>
      </div>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);
    document.getElementById('_lr_close_settings').addEventListener('click', () => modal.remove());

    const ttsCheckbox = document.getElementById('_lr_toggle_tts');
    const ambientCheckbox = document.getElementById('_lr_toggle_ambient');
    ttsCheckbox.checked = (window._lr_tts_enabled !== false);
    ambientCheckbox.checked = !!(htmlAudio.ambientEl || audioBuffers.ambient);

    ttsCheckbox.addEventListener('change', () => {
      showToast('TTS ' + (ttsCheckbox.checked ? 'activado' : 'desactivado'));
      window._lr_tts_enabled = ttsCheckbox.checked;
    });
    ambientCheckbox.addEventListener('change', () => {
      showToast('Ambient ' + (ambientCheckbox.checked ? 'activado' : 'desactivado'));
      window._lr_ambient_enabled = ambientCheckbox.checked;
    });

    box.querySelectorAll('._lr_preset_btn').forEach(b => {
      b.addEventListener('click', () => {
        const p = b.getAttribute('data-preset');
        if (p && window.lr_helpers && typeof window.lr_helpers.setBreathPattern === 'function') {
          window.lr_helpers.setBreathPattern(p);
          showToast('Preset aplicado: ' + p);
        }
      });
    });
  }

  /* ---------- Menu helpers (annotation + delegation) ---------- */
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
      if (changed) lrlog('[helpers] annotateMenuButtonsOnce -> data-action added:', changed);
      return changed;
    } catch (e) { lrwarn('[helpers] annotate error', e); return 0; }
  }

  function handleMenuAction(action, btn) {
    const phraseEl = document.getElementById('frase-text') || document.getElementById('frase');
    const phrase = phraseEl ? (phraseEl.textContent || '') : '';
    switch (action) {
      case 'breath': startBreathFlowInternal(); break;
      case 'favorite': if (phrase) { const added = toggleFavorite(phrase); if (btn) btn.textContent = added ? '♥ Favorita' : '♡ Favorita'; } break;
      case 'copy': if (phrase) copyToClipboard(phrase); break;
      case 'share': if (navigator.share && phrase) navigator.share({ title: 'Frase', text: phrase }).catch(e => lrwarn(e)); else if (phrase) { copyToClipboard(phrase); showToast('Compartir no soportado, frase copiada'); } break;
      case 'tts': if (phrase && window._lr_tts_enabled !== false) playTTS(phrase); break;
      case 'ambient-start': preloadAssets().then(() => { if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambientEl) htmlAudio.ambientEl.play().catch(() => {}); }); break;
      case 'ambient-stop': stopAmbientLoop(); break;
      case 'download': downloadImageFallback(); break;
      case 'enable-audio': resumeAudio().then(() => showToast('Intentado activar audio')); break;
      case 'show-favorites': showFavoritesModal(); break;
      case 'share-app': sharePhrase({ title:'Llavero Respira', text:'Echa un vistazo', url: location.href }); break;
      case 'invite': inviteFriend(); break;
      case 'settings': showSettingsModal(); break;
      default: lrlog('[helpers] action not mapped:', action); break;
    }
  }

  /* ---------- Fallback attach helpers ---------- */
  function attachTouchClick(ids, fn) {
    if (!Array.isArray(ids)) ids = [ids];
    for (let i = 0; i < ids.length; i++) {
      const el = document.getElementById(ids[i]);
      if (!el) continue;
      try {
        el.addEventListener('click', fn);
        el.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); fn.call(this, e); }, { passive: false });
      } catch (e) { lrwarn('[helpers] attach error', ids[i], e); }
    }
  }

  /* ---------- Menu delegation ---------- */
  function initMenuDelegation() {
    const panel = document.getElementById('menuPanel');
    if (!panel) {
      lrlog('[helpers] menuPanel not found — fallback attach');
      return false;
    }
    function onPointer(e) {
      try {
        const target = (e.target && e.target.closest && e.target.closest('button, [role="menuitem"], [data-action]')) || e.target;
        if (!target || !panel.contains(target)) return;
        if (e.type === 'touchend') { e.preventDefault(); }
        e.stopPropagation();
        const action = detectActionFromButton(target);
        if (action) handleMenuAction(action, target);
        setTimeout(() => { panel.style.display = 'none'; const tgl = document.getElementById('menuToggle'); if (tgl) tgl.setAttribute('aria-expanded', 'false'); }, 80);
      } catch (err) { lrwarn('[helpers] delegation onPointer error', err); }
    }
    panel.addEventListener('click', onPointer);
    panel.addEventListener('touchend', onPointer, { passive: false });
    lrlog('[helpers] menu delegation activated');
    return true;
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    annotateMenuButtonsOnce();
    const delegated = initMenuDelegation();
    if (!delegated) {
      // fallback bindings
      attachTouchClick(['breathBtn_menu','breathBtn'], function () { startBreathFlowInternal(); });
      attachTouchClick(['enableAudioBtn','enableAudio'], function () { resumeAudio().then(function () { showToast('Intentado activar audio'); }); });
      attachTouchClick(['ttsBtn_menu','ttsBtn'], function () { const t = (document.getElementById('frase-text') && document.getElementById('frase-text').textContent) || (document.getElementById('frase') && document.getElementById('frase').textContent) || ''; if (t) playTTS(t); });
      attachTouchClick(['startAmbientBtn'], function () { preloadAssets().then(function () { if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambientEl) htmlAudio.ambientEl.play().catch(()=>{}); }); });
      attachTouchClick(['stopAmbientBtn'], function () { stopAmbientLoop(); });
      attachTouchClick(['favBtn_menu','favBtn'], function () { const t = (document.getElementById('frase-text') && document.getElementById('frase-text').textContent) || (document.getElementById('frase') && document.getElementById('frase').textContent) || ''; if (t) { const added = toggleFavorite(t); const el = document.getElementById('favBtn_menu') || document.getElementById('favBtn'); if (el) el.textContent = added ? '♥ Favorita' : '♡ Favorita'; } });
      attachTouchClick(['downloadBtn','downloadBtn_menu'], function () { const el = document.querySelector('.frase-card') || document.querySelector('.card') || document.body; downloadPhraseImage(el); });
      attachTouchClick(['shareBtn','shareBtn_menu'], function () { const t = (document.getElementById('frase-text') && document.getElementById('frase-text').textContent) || (document.getElementById('frase') && document.getElementById('frase').textContent) || ''; sharePhrase({ title: 'Frase', text: t, url: location.href }); });
      attachTouchClick(['inviteBtn'], function () { inviteFriend(); });
    }
  });

  /* ---------- Public API ---------- */
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
    inviteFriend: inviteFriend,
    copyToClipboard: copyToClipboard,
    startAmbient: async () => { await preloadAssets(); if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambientEl) htmlAudio.ambientEl.play().catch(()=>{}); },
    stopAmbient: stopAmbientLoop,
    setBreathPattern: (name) => {
      const PRE = { box:{inh:4,h1:4,exh:4,h2:4}, calm:{inh:4,h1:4,exh:6,h2:1}, slow:{inh:5,h1:5,exh:7,h2:1}, '478':{inh:4,h1:7,exh:8,h2:1} };
      const p = PRE[name];
      if (!p) { lrwarn('preset not found', name); return; }
      inhaleDurationSeconds = p.inh; hold1DurationSeconds = p.h1; exhaleDurationSeconds = p.exh; hold2DurationSeconds = p.h2;
      lrlog('[helpers] preset applied', name);
    },
    setCustomBreath: (inh,h1,exh,h2) => {
      inhaleDurationSeconds = Number(inh)||inhaleDurationSeconds;
      hold1DurationSeconds = Number(h1)||hold1DurationSeconds;
      exhaleDurationSeconds = Number(exh)||exhaleDurationSeconds;
      hold2DurationSeconds = Number(h2)||hold2DurationSeconds;
      lrlog('[helpers] custom breath set', { inhaleDurationSeconds, hold1DurationSeconds, exhaleDurationSeconds, hold2DurationSeconds });
    },
    dumpState: () => ({
      audioCtxState: audioCtx ? audioCtx.state : 'no-audioctx',
      buffers: { inhaleCue: !!audioBuffers.inhaleCue, exhaleCue: !!audioBuffers.exhaleCue, breath: !!audioBuffers.breath, ambient: !!audioBuffers.ambient },
      htmlAudio: { inhale: !!htmlAudio.inhaleEl, exhale: !!htmlAudio.exhaleEl, ambient: !!htmlAudio.ambientEl },
      offsets: { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds, hold1DurationSeconds, hold2DurationSeconds }
    })
  });

  // autopreload
  preloadAssets().catch(e => lrwarn('[helpers] preload error', e));

  // ensure global shortcuts exist
  if (!window.downloadPhraseImage) window.downloadPhraseImage = downloadPhraseImage;
  window.lr_helpers = window.lr_helpers || {};
  window.lr_helpers.downloadPhraseImage = downloadPhraseImage;
  window.lr_helpers.downloadImageFallback = downloadImageFallback;

})();
