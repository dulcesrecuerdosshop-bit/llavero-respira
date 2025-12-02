// helpers.js - Consolidado: expone startBreathFlow, resumeAudio, binds touch+click en menu IDs
(function () {
  console.log('[helpers] cargando helpers.js (consolidado, startBreathFlow + binds)');

  const AUDIO = {
    breathCandidates: ['Breath.mp3', 'breath.mp3', 'BREATH.mp3'],
    inhaleCue: 'inhaleCue.mp3',
    exhaleCue: 'exhaleCue.mp3',
    ambientCandidates: ['ambient.mp3', 'Ambient.mp3', 'AMBIENT.mp3']
  };

  // Tiempos por defecto (ajustables con API)
  let inhaleOffsetSeconds = 0.0, inhaleDurationSeconds = 2.8;
  let exhaleOffsetSeconds = 2.8, exhaleDurationSeconds = 3.5;
  let hold1DurationSeconds = 4.0, hold2DurationSeconds = 1.0;

  let audioCtx = null;
  const audioBuffers = { breath: null, inhaleCue: null, exhaleCue: null, ambient: null };
  let ambientSource = null, ambientGain = null;
  const htmlAudio = { inhaleEl: null, exhaleEl: null, ambientEl: null, breathUrl: null };

  const KEY_FAVORITOS = 'lr_favoritos_v1';

  // --- Utils ---
  async function existsUrl(url) {
    try { const r = await fetch(url, { method: 'HEAD' }); if (r && r.ok) return true; } catch (e) { /* ignore */ }
    try { const r2 = await fetch(url, { method: 'GET' }); return !!(r2 && r2.ok); } catch (e) { return false; }
  }

  async function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      console.log('[helpers] AudioContext creado', audioCtx.state);
      return audioCtx;
    } catch (e) {
      console.warn('[helpers] WebAudio no disponible', e);
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
      console.log('[helpers] buffer decodificado ->', url);
      return buf;
    } catch (e) {
      console.warn('[helpers] error cargando audio', url, e);
      return null;
    }
  }

  function scheduleBufferPlay(buffer, offset, duration, { gain = 0.9, fade = 0.06 } = {}) {
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
      console.log('[helpers] scheduled play', { offset, playDuration });
      return true;
    } catch (e) {
      console.warn('[helpers] schedule error', e);
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
      el.play().catch(e => console.warn('[helpers] html play error', e));
      setTimeout(() => { try { el.pause(); el.currentTime = 0; } catch (e) {} }, Math.max(400, Math.round(duration)));
      console.log('[helpers] html played', url, { offset, duration });
      return true;
    } catch (e) {
      console.warn('[helpers] playHtml failed', e);
      return false;
    }
  }

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
      console.log('[helpers] ambient webaudio start');
      return;
    }
    if (url) {
      if (!htmlAudio.ambientEl) { htmlAudio.ambientEl = new Audio(url); htmlAudio.ambientEl.loop = true; htmlAudio.ambientEl.volume = 0.12; }
      htmlAudio.ambientEl.play().catch(() => {});
      console.log('[helpers] ambient html start');
    }
  }
  function stopAmbientLoop() {
    if (ambientGain) try { ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6); } catch (e) {}
    if (ambientSource) { try { ambientSource.stop(audioCtx.currentTime + 0.5); } catch (e) {} ambientSource = null; ambientGain = null; }
    if (htmlAudio.ambientEl) try { htmlAudio.ambientEl.pause(); htmlAudio.ambientEl.currentTime = 0; } catch (e) {}
    console.log('[helpers] ambient stopped');
  }

  // --- Preload assets (detecta variantes) ---
  async function preloadAssets() {
    await ensureAudioContext();
    if (await existsUrl(AUDIO.inhaleCue)) {
      const b = await loadAudioBuffer(AUDIO.inhaleCue);
      if (b) audioBuffers.inhaleCue = b; else htmlAudio.inhaleEl = new Audio(AUDIO.inhaleCue);
    }
    if (await existsUrl(AUDIO.exhaleCue)) {
      const b = await loadAudioBuffer(AUDIO.exhaleCue);
      if (b) audioBuffers.exhaleCue = b; else htmlAudio.exhaleEl = new Audio(AUDIO.exhaleCue);
    }
    let chosen = null;
    for (const c of AUDIO.breathCandidates) { if (await existsUrl(c)) { chosen = c; break; } }
    if (chosen) { const b = await loadAudioBuffer(chosen); if (b) audioBuffers.breath = b; else htmlAudio.breathUrl = chosen; }
    let amb = null;
    for (const a of AUDIO.ambientCandidates) { if (await existsUrl(a)) { amb = a; break; } }
    if (amb) { const b = await loadAudioBuffer(amb); if (b) audioBuffers.ambient = b; else { htmlAudio.ambientEl = new Audio(amb); htmlAudio.ambientEl.loop = true; htmlAudio.ambientEl.volume = 0.12; } }

    console.log('[helpers] preload results', {
      inhaleCue: !!audioBuffers.inhaleCue || !!htmlAudio.inhaleEl,
      exhaleCue: !!audioBuffers.exhaleCue || !!htmlAudio.exhaleEl,
      breath: !!audioBuffers.breath || !!htmlAudio.breathUrl,
      ambient: !!audioBuffers.ambient || !!htmlAudio.ambientEl
    });
  }

  // --- Players ---
  async function playInhale() {
    await preloadAssets();
    if (audioBuffers.inhaleCue) { if (scheduleBufferPlay(audioBuffers.inhaleCue, 0, audioBuffers.inhaleCue.duration || inhaleDurationSeconds)) return; }
    if (htmlAudio.inhaleEl) { if (playHtml(htmlAudio.inhaleEl.src, 0, inhaleDurationSeconds)) return; }
    if (audioBuffers.breath) { if (scheduleBufferPlay(audioBuffers.breath, inhaleOffsetSeconds, inhaleDurationSeconds)) return; }
    if (htmlAudio.breathUrl) { if (playHtml(htmlAudio.breathUrl, inhaleOffsetSeconds, inhaleDurationSeconds)) return; }
    console.log('[helpers] no inhale audio available');
  }
  async function playExhale() {
    await preloadAssets();
    if (audioBuffers.exhaleCue) { if (scheduleBufferPlay(audioBuffers.exhaleCue, 0, audioBuffers.exhaleCue.duration || exhaleDurationSeconds)) return; }
    if (htmlAudio.exhaleEl) { if (playHtml(htmlAudio.exhaleEl.src, 0, exhaleDurationSeconds)) return; }
    if (audioBuffers.breath) { if (scheduleBufferPlay(audioBuffers.breath, exhaleOffsetSeconds, exhaleDurationSeconds)) return; }
    if (htmlAudio.breathUrl) { if (playHtml(htmlAudio.breathUrl, exhaleOffsetSeconds, exhaleDurationSeconds)) return; }
    console.log('[helpers] no exhale audio available');
  }

  // --- TTS (manual) ---
  async function loadVoicesOnce() {
    return new Promise((resolve) => {
      const vs = speechSynthesis.getVoices();
      if (vs && vs.length) { resolve(vs); return; }
      const onVoices = () => { window.speechSynthesis.removeEventListener('voiceschanged', onVoices); resolve(speechSynthesis.getVoices()||[]); };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      setTimeout(()=> resolve(speechSynthesis.getVoices()||[]), 800);
    });
  }
  async function playTTS(text) {
    if (!('speechSynthesis' in window)) { alert('TTS no disponible'); return; }
    const vs = await loadVoicesOnce();
    const voice = (vs.find(v => /^es/i.test(v.lang)) || vs[0]) || null;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : 'es-ES';
    u.rate = 1; u.pitch = 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    console.log('[helpers] TTS speak', text);
  }

  // --- Resume audio (Android) ---
  async function resumeAudio() {
    await ensureAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); console.log('[helpers] audioCtx resumed'); } catch (e) { console.warn(e); }
    }
    try {
      if (audioCtx) {
        const buf = audioCtx.createBuffer(1,1,audioCtx.sampleRate);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.start(0);
        src.stop(0.05);
        console.log('[helpers] silent buffer played to unlock audio');
      }
    } catch (e) { console.warn('[helpers] resume fallback failed', e); }
    return audioCtx ? audioCtx.state : 'no-audioctx';
  }

  // --- Breath overlay (uso interno) ---
  async function startBreathFlowInternal() {
    await resumeAudio();
    await preloadAssets();

    const overlay = document.createElement('div'); overlay.id = 'lr-breath-overlay';
    Object.assign(overlay.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:16000 });
    const container = document.createElement('div'); Object.assign(container.style, { display:'flex', flexDirection:'channel', alignItems:'center', gap:'12px' });
    const circle = document.createElement('div'); Object.assign(circle.style, { width:'220px', height:'220px', borderRadius:'50%', background:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'28px', fontWeight:700 });
    const small = document.createElement('div'); Object.assign(small.style, { color:'rgba(255,255,255,0.95)', fontSize:'18px', textAlign:'center' });
    container.appendChild(circle); container.appendChild(small); overlay.appendChild(container); document.body.appendChild(overlay);

    if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient);
    else if (htmlAudio.ambientEl) startAmbientLoop(null, htmlAudio.ambientEl.src);

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
    circle.textContent = s.label;
    small.textContent = s.label + (s.duration ? ` · ${Math.round(s.duration)}s` : '');
    if (s.action) { try { await s.action(); } catch (e) { console.warn('[helpers] action error', e); } }
    try {
      const scaleFrom = s.label === 'Exhala' ? 1 : 0.6;
      const scaleTo = s.label === 'Exhala' ? 0.6 : 1.0;
      circle.animate([{ transform: `scale(${scaleFrom})`, opacity: 0.75 }, { transform: `scale(${scaleTo})`, opacity: 1 }], { duration: s.duration * 1000, easing: 'ease-in-out', fill: 'forwards' });
    } catch (e) { circle.style.transition = `transform ${s.duration}s ease-in-out`; circle.style.transform = `scale(${scaleTo})`; }
    timeoutId = setTimeout(() => { idx = (idx + 1) % steps.length; loopStep(); }, Math.round(s.duration * 1000));
  }
    loopStep();

    overlay._stop = () => { running = false; if (timeoutId) clearTimeout(timeoutId); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); console.log('[helpers] overlay stopped'); };
    overlay.addEventListener('click', () => overlay._stop && overlay._stop());
    window._lastBreathOverlay = overlay;
  }

  // --- Favorites ---
  function getFavoritos() { try { return JSON.parse(localStorage.getItem(KEY_FAVO…
contents truncated for brevity... (rest of file continues)
