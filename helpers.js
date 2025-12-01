// helpers.js - Sin TTS automático: prioridad a audios pregrabados (inhaleCue/exhaleCue o Breath.mp3).
// Mantiene ambient persistente, menú limpio y API de pruebas.
// Si quieres activar TTS manulamente desde consola: window.lr_helpers.enableTTS(true)
(function () {
  console.log('[helpers] cargando helpers.js (sin TTS automático)');

  const AUDIO = {
    breathCandidates: ['Breath.mp3', 'breath.mp3', 'BREATH.mp3'],
    inhaleCue: 'inhaleCue.mp3', // subiste esto
    exhaleCue: 'exhaleCue.mp3', // subiste esto
    ambientCandidates: ['ambient.mp3', 'Ambient.mp3', 'AMBIENT.mp3']
  };

  // Offsets si se usa Breath.mp3 con segmentos
  let inhaleOffsetSeconds = 0.0;
  let inhaleDurationSeconds = 2.0;
  let exhaleOffsetSeconds = 3.0;
  let exhaleDurationSeconds = 3.5;

  let ambientVolume = 0.12;
  let soundVolume = 0.95;

  // Internals
  let audioCtx = null;
  let audioBuffers = { breath: null, inhaleCue: null, exhaleCue: null, ambient: null };
  let ambientSource = null;
  let ambientGain = null;
  let htmlAudio = { inhaleEl: null, exhaleEl: null, ambientEl: null, breathUrl: null };

  // TTS DESACTIVADA por defecto; puede activarse manual desde consola
  let ttsEnabled = false;

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

  async function existsUrl(url) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r && r.ok) return true;
    } catch (e) {}
    try {
      const r2 = await fetch(url, { method: 'GET' });
      return !!(r2 && r2.ok);
    } catch (e) { return false; }
  }

  async function pickExisting(cands) {
    for (const c of cands) {
      if (await existsUrl(c)) return c;
    }
    return null;
  }

  async function loadBuffer(url) {
    const ctx = await ensureAudioContext();
    if (!ctx) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('fetch failed ' + r.status);
      const ab = await r.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      console.log('[helpers] buffer decodificado ->', url);
      return buf;
    } catch (e) {
      console.warn('[helpers] loadBuffer error', url, e);
      return null;
    }
  }

  function scheduleBufferPlay(buffer, offset, duration, { gain = 1, fade = 0.06 } = {}) {
    if (!audioCtx || !buffer) return Promise.resolve(false);
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
      console.log('[helpers] scheduled play', { offset, playDuration: playDuration });
      return Promise.resolve(true);
    } catch (e) {
      console.warn('[helpers] schedule error', e);
      return Promise.resolve(false);
    }
  }

  // HTML fallback play (reutiliza elementos)
  function playHtmlUrl(url, offset = 0, duration = 2000) {
    try {
      let el = null;
      if (url === htmlAudio.inhaleEl?.src) el = htmlAudio.inhaleEl;
      if (url === htmlAudio.exhaleEl?.src) el = htmlAudio.exhaleEl;
      if (!el) el = new Audio(url);
      el.volume = soundVolume;
      if (offset) el.currentTime = offset;
      el.play().catch(e => console.warn('[helpers] html play error', e));
      setTimeout(() => { try{ el.pause(); el.currentTime = 0; } catch(e){} }, Math.max(400, Math.round(duration)));
      console.log('[helpers] html played', url);
      return Promise.resolve(true);
    } catch (e) {
      console.warn('[helpers] html play failed', e);
      return Promise.resolve(false);
    }
  }

  // Ambient loop (webaudio or html)
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
      try { ambientGain.gain.linearRampToValueAtTime(ambientVolume, audioCtx.currentTime + 2.0); } catch(e){}
      console.log('[helpers] ambient webaudio start');
      return;
    }
    if (url) {
      if (!htmlAudio.ambientEl) { htmlAudio.ambientEl = new Audio(url); htmlAudio.ambientEl.loop = true; htmlAudio.ambientEl.volume = ambientVolume; }
      htmlAudio.ambientEl.play().catch(()=>{});
      console.log('[helpers] ambient html start');
    }
  }
  function stopAmbientLoop() {
    if (ambientGain) try { ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 1.0); } catch(e){}
    if (ambientSource) { try { ambientSource.stop(audioCtx.currentTime + 0.8); } catch(e){} ambientSource = null; ambientGain = null; }
    if (htmlAudio.ambientEl) try { htmlAudio.ambientEl.pause(); htmlAudio.ambientEl.currentTime = 0; } catch(e){}
    console.log('[helpers] ambient stopped');
  }

  // Precarga inteligente: cues pregrabados tienen prioridad; luego Breath.mp3; ambient también
  async function preloadAll() {
    await ensureAudioContext();
    // inhale cue
    if (await existsUrl(AUDIO.inhaleCue)) {
      if (audioCtx) audioBuffers.inhaleCue = await loadBuffer(AUDIO.inhaleCue).catch(()=>null);
      else htmlAudio.inhaleEl = new Audio(AUDIO.inhaleCue);
    }
    // exhale cue
    if (await existsUrl(AUDIO.exhaleCue)) {
      if (audioCtx) audioBuffers.exhaleCue = await loadBuffer(AUDIO.exhaleCue).catch(()=>null);
      else htmlAudio.exhaleEl = new Audio(AUDIO.exhaleCue);
    }
    // Breath (full) fallback
    const b = await pickExisting(AUDIO.breathCandidates);
    if (b) {
      if (audioCtx) audioBuffers.breath = await loadBuffer(b).catch(()=>null);
      else htmlAudio.breathUrl = b;
    }
    // ambient
    const a = await pickExisting(AUDIO.ambientCandidates);
    if (a) {
      if (audioCtx) audioBuffers.ambient = await loadBuffer(a).catch(()=>null);
      else htmlAudio.ambientEl = new Audio(a);
      if (htmlAudio.ambientEl) htmlAudio.ambientEl.loop = true, htmlAudio.ambientEl.volume = ambientVolume;
    }

    console.log('[helpers] preload results', {
      inhaleCue: !!audioBuffers.inhaleCue || !!htmlAudio.inhaleEl,
      exhaleCue: !!audioBuffers.exhaleCue || !!htmlAudio.exhaleEl,
      breath: !!audioBuffers.breath || !!htmlAudio.breathUrl,
      ambient: !!audioBuffers.ambient || !!htmlAudio.ambientEl
    });
  }

  // Reproducir inhale cue (prioridad: inhaleCue -> Breath segment -> html breath)
  async function playInhaleCue() {
    await ensureAudioContext();
    if (audioBuffers.inhaleCue) return scheduleBufferPlay(audioBuffers.inhaleCue, 0, audioBuffers.inhaleCue.duration || inhaleDurationSeconds, { gain: soundVolume });
    if (htmlAudio.inhaleEl) return playHtmlUrl(htmlAudio.inhaleEl.src, 0, inhaleDurationSeconds);
    if (audioBuffers.breath) return scheduleBufferPlay(audioBuffers.breath, inhaleOffsetSeconds, inhaleDurationSeconds, { gain: soundVolume });
    if (htmlAudio.breathUrl) return playHtmlUrl(htmlAudio.breathUrl, inhaleOffsetSeconds, inhaleDurationSeconds);
    if (ttsEnabled && 'speechSynthesis' in window) { const u=new SpeechSynthesisUtterance('Inhala'); speechSynthesis.speak(u); return; }
    console.log('[helpers] no inhale available');
  }

  async function playExhaleCue() {
    await ensureAudioContext();
    if (audioBuffers.exhaleCue) return scheduleBufferPlay(audioBuffers.exhaleCue, 0, audioBuffers.exhaleCue.duration || exhaleDurationSeconds, { gain: soundVolume });
    if (htmlAudio.exhaleEl) return playHtmlUrl(htmlAudio.exhaleEl.src, 0, exhaleDurationSeconds);
    if (audioBuffers.breath) return scheduleBufferPlay(audioBuffers.breath, exhaleOffsetSeconds, exhaleDurationSeconds, { gain: soundVolume });
    if (htmlAudio.breathUrl) return playHtmlUrl(htmlAudio.breathUrl, exhaleOffsetSeconds, exhaleDurationSeconds);
    if (ttsEnabled && 'speechSynthesis' in window) { const u=new SpeechSynthesisUtterance('Exhala'); speechSynthesis.speak(u); return; }
    console.log('[helpers] no exhale available');
  }

  // Flujo guiado (overlay). Ambient PERSISTE hasta que el usuario lo pare manualmente.
  async function startBreathFlow() {
    await preloadAll();
    if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch(e){} }
    const overlay = document.createElement('div'); overlay.id='lr-breath-overlay';
    Object.assign(overlay.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:10000 });
    const container=document.createElement('div'); Object.assign(container.style,{display:'flex',flexDirection:'column',alignItems:'center',gap:'12px'});
    const circle=document.createElement('div'); Object.assign(circle.style,{width:'220px',height:'220px',borderRadius:'50%',background:'rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'28px',fontWeight:700,backdropFilter:'blur(6px)'});
    const small=document.createElement('div'); Object.assign(small.style,{color:'rgba(255,255,255,0.95)',fontSize:'18px',textAlign:'center'});
    container.appendChild(circle); container.appendChild(small); overlay.appendChild(container); document.body.appendChild(overlay);

    if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient);
    else if (htmlAudio.ambientEl) try{ htmlAudio.ambientEl.play().catch(()=>{}); } catch(e){}

    const steps = [
      { label:'Inhala', action: playInhaleCue, duration: inhaleDurationSeconds },
      { label:'Sostén', action: null, duration: 4.0 },
      { label:'Exhala', action: playExhaleCue, duration: exhaleDurationSeconds },
      { label:'Sostén', action: null, duration: 1.0 }
    ];

    let idx = 0, timeoutId = null, running = true;
    async function loopStep() {
      if (!running) return;
      const s = steps[idx];
      circle.textContent = s.label;
      small.textContent = s.label + (s.duration ? ` · ${Math.round(s.duration)}s` : '');
      if (s.action) try { await s.action(); } catch(e){ console.warn('[helpers] action error', e); }
      try { circle.animate([{ transform:`scale(${s.label==='Exhala'?1:0.6})`, opacity:0.75 },{ transform:`scale(${s.label==='Exhala'?0.6:1})`, opacity:1 }], { duration: s.duration*1000, easing:'ease-in-out', fill:'forwards' }); } catch(e){ circle.style.transition=`transform ${s.duration}s ease-in-out`; circle.style.transform=`scale(${s.label==='Exhala'?0.6:1})`; }
      timeoutId = setTimeout(()=>{ idx=(idx+1)%steps.length; loopStep(); }, Math.round(s.duration*1000));
    }
    loopStep();

    overlay._stop = () => { running=false; if (timeoutId) clearTimeout(timeoutId); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); console.log('[helpers] overlay stopped'); };
    overlay.addEventListener('click', e => { e.stopPropagation(); overlay._stop && overlay._stop(); });
    window._lastBreathOverlay = overlay;
  }

  // API pública
  window.lr_helpers = {
    preloadAll,
    dumpState: () => ({ audioCtxState: audioCtx ? audioCtx.state : 'no-audioctx', buffers: { inhaleCue: !!audioBuffers.inhaleCue, exhaleCue: !!audioBuffers.exhaleCue, breath: !!audioBuffers.breath, ambient: !!audioBuffers.ambient }, html: { inhale: !!htmlAudio.inhaleEl, exhale: !!htmlAudio.exhaleEl, ambient: !!htmlAudio.ambientEl }, offsets: { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds }, ttsEnabled }),
    playInhaleCue,
    playExhaleCue,
    startBreathFlow,
    startAmbient: async () => { await preloadAll(); if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambientEl) try{ htmlAudio.ambientEl.play().catch(()=>{}); } catch(e){} },
    stopAmbient: stopAmbientLoop,
    setOffsets: (a,b,c,d) => { inhaleOffsetSeconds = Number(a) || inhaleOffsetSeconds; inhaleDurationSeconds = Number(b) || inhaleDurationSeconds; exhaleOffsetSeconds = Number(c) || exhaleOffsetSeconds; exhaleDurationSeconds = Number(d) || exhaleDurationSeconds; console.log('[helpers] offsets', { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds }); },
    enableTTS: (v) => { ttsEnabled = !!v; console.log('[helpers] TTS enabled =', ttsEnabled); }
  };

  // Auto-preload
  preloadAll().catch(e => console.warn('[helpers] preload error', e));
})();
