// helpers.js - Auto-detect Breath filename (breath.mp3 / Breath.mp3 / BREATH.mp3) + ambient, solo-audio
(function () {
  console.log('[helpers] cargando helpers.js (detect Breath/Breath.mp3)');

  const BREATH_CANDIDATES = ['breath.mp3', 'Breath.mp3', 'BREATH.mp3'];
  const AMBIENT_CANDIDATES = ['ambient.mp3', 'Ambient.mp3', 'AMBIENT.mp3'];

  let inhaleOffsetSeconds = 0.0;
  let inhaleDurationSeconds = 2.8;
  let exhaleOffsetSeconds = 2.8;
  let exhaleDurationSeconds = 3.5;

  let soundBreathEnabled = true;
  let ambientVolume = 0.12;
  let soundVolume = 0.9;

  let audioCtx = null;
  let audioBuffers = { breath: null, ambient: null };
  let ambientSource = null;
  let ambientGain = null;
  let htmlAudio = { breath: null, ambient: null };

  async function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      console.log('[helpers] AudioContext creado', audioCtx.state);
      return audioCtx;
    } catch (e) {
      console.warn('[helpers] Web Audio no soportado', e);
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

  async function pickExisting(candidates) {
    for (const c of candidates) {
      if (await existsUrl(c)) return c;
    }
    return null;
  }

  async function loadAudioBuffer(url) {
    const ctx = await ensureAudioContext();
    if (!ctx) return null;
    try {
      console.log('[helpers] fetch audio ->', url);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('fetch audio failed ' + resp.status);
      const ab = await resp.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      console.log('[helpers] buffer decodificado ->', url);
      return buf;
    } catch (e) {
      console.warn('[helpers] error cargando audio', url, e);
      return null;
    }
  }

  function playBuffer(buffer, { offset = 0, duration = null, gain = 1, fade = 0.06 } = {}) {
    if (!audioCtx || !buffer) return Promise.resolve();
    const ctx = audioCtx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    try {
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + fade);
      const playDuration = duration ? Math.max(0.05, duration) : buffer.duration - offset;
      const endAt = now + playDuration;
      g.gain.setValueAtTime(gain, endAt - fade);
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.connect(g).connect(ctx.destination);
      src.start(now, offset, playDuration);
      src.stop(endAt + 0.05);
      console.log('[helpers] scheduled buffer play', { offset, playDuration, gain });
    } catch (e) { console.warn('[helpers] error scheduling buffer', e); }
    return Promise.resolve();
  }

  function playHtmlSegment(el, offset, duration) {
    if (!el) return;
    try {
      el.currentTime = offset;
      el.volume = soundVolume;
      el.play().catch(e => console.warn('[helpers] html play error', e));
      setTimeout(() => { try { el.pause(); el.currentTime = 0; } catch(e){} }, Math.max(400, Math.round((duration||1000))));
      console.log('[helpers] html segment played', { offset, duration });
    } catch (e) { console.warn(e); }
  }

  function startAmbientLoop(buffer) {
    if (!audioCtx || !buffer) return;
    stopAmbientLoop();
    ambientSource = audioCtx.createBufferSource();
    ambientSource.buffer = buffer;
    ambientSource.loop = true;
    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0;
    ambientSource.connect(ambientGain).connect(audioCtx.destination);
    ambientSource.start();
    try { ambientGain.gain.linearRampToValueAtTime(ambientVolume, audioCtx.currentTime + 3.0); } catch(e){}
    console.log('[helpers] ambient loop started (webaudio)');
  }
  function stopAmbientLoop() {
    if (ambientGain) try { ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2); } catch(e){}
    if (ambientSource) { try { ambientSource.stop(audioCtx.currentTime + 1.0); } catch(e){} ambientSource = null; ambientGain = null; }
    console.log('[helpers] ambient loop stopped');
  }

  async function preloadAudio() {
    await ensureAudioContext();
    const chosenBreath = await pickExisting(BREATH_CANDIDATES);
    if (chosenBreath) {
      if (audioCtx) audioBuffers.breath = await loadAudioBuffer(chosenBreath).catch(()=>null);
      else htmlAudio.breath = new Audio(chosenBreath);
    }
    const chosenAmbient = await pickExisting(AMBIENT_CANDIDATES);
    if (chosenAmbient) {
      if (audioCtx) audioBuffers.ambient = await loadAudioBuffer(chosenAmbient).catch(()=>null);
      else { htmlAudio.ambient = new Audio(chosenAmbient); htmlAudio.ambient.loop = true; htmlAudio.ambient.volume = ambientVolume; }
    }
    console.log('[helpers] preloadAudio results', {
      breathBuf: !!audioBuffers.breath, ambientBuf: !!audioBuffers.ambient,
      breathHtml: !!htmlAudio.breath, ambientHtml: !!htmlAudio.ambient
    });
  }

  async function playInhaleSegment() {
    if (audioBuffers.breath) return playBuffer(audioBuffers.breath, { offset: inhaleOffsetSeconds, duration: inhaleDurationSeconds, gain: soundVolume });
    if (htmlAudio.breath) return playHtmlSegment(htmlAudio.breath, inhaleOffsetSeconds, inhaleDurationSeconds);
    console.log('[helpers] no inhale audio available');
  }
  async function playExhaleSegment() {
    if (audioBuffers.breath) return playBuffer(audioBuffers.breath, { offset: exhaleOffsetSeconds, duration: exhaleDurationSeconds, gain: soundVolume });
    if (htmlAudio.breath) return playHtmlSegment(htmlAudio.breath, exhaleOffsetSeconds, exhaleDurationSeconds);
    console.log('[helpers] no exhale audio available');
  }

  async function startBreathFlow() {
    await ensureAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); console.log('[helpers] audioCtx resumed'); } catch(e){} }
    if (!audioBuffers.breath && !htmlAudio.breath) await preloadAudio();

    const overlay = document.createElement('div'); overlay.id='lr-breath-overlay';
    Object.assign(overlay.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:10000 });
    const container = document.createElement('div'); Object.assign(container.style,{display:'flex',flexDirection:'column',alignItems:'center',gap:'12px'});
    const circle = document.createElement('div'); Object.assign(circle.style,{width:'220px',height:'220px',borderRadius:'50%',background:'rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 30px rgba(0,0,0,0.4)',color:'#fff',fontSize:'28px',fontWeight:700,backdropFilter:'blur(6px)'});
    const smallText = document.createElement('div'); Object.assign(smallText.style,{color:'rgba(255,255,255,0.95)',fontSize:'18px',textAlign:'center'});
    container.appendChild(circle); container.appendChild(smallText); overlay.appendChild(container); document.body.appendChild(overlay);

    if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient);
    else if (htmlAudio.ambient) try{ htmlAudio.ambient.volume = ambientVolume; htmlAudio.ambient.loop = true; htmlAudio.ambient.play().catch(()=>{});}catch(e){}

    const steps = [
      { label: 'Inhala', action: playInhaleSegment, duration: inhaleDurationSeconds },
      { label: 'Sostén', action: null, duration: 4.0 },
      { label: 'Exhala', action: playExhaleSegment, duration: exhaleDurationSeconds },
      { label: 'Sostén', action: null, duration: 1.0 }
    ];

    let idx=0, timeoutId=null, running=true;
    async function loopStep(){
      if (!running) return;
      const s = steps[idx];
      circle.textContent = s.label;
      smallText.textContent = s.label + (s.duration ? ` · ${Math.round(s.duration)}s` : '');
      if (s.action) try { await s.action(); } catch(e){ console.warn('[helpers] action error', e); }
      try { const scaleFrom = s.label === 'Exhala' ? 1.0 : 0.6; const scaleTo = s.label === 'Exhala' ? 0.6 : 1.0; circle.animate([{ transform:`scale(${scaleFrom})`, opacity:0.75 },{ transform:`scale(${scaleTo})`, opacity:1 }], { duration: s.duration * 1000, easing:'ease-in-out', fill:'forwards' }); } catch(e){ circle.style.transition = `transform ${s.duration}s ease-in-out`; circle.style.transform = `scale(${scaleTo})`; }
      timeoutId = setTimeout(()=>{ idx = (idx+1)%steps.length; loopStep(); }, Math.round(s.duration*1000));
    }
    loopStep();

    overlay._stop = () => { running=false; if (timeoutId) clearTimeout(timeoutId); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); console.log('[helpers] breath overlay stopped by user'); };
    overlay.addEventListener('click', (e)=>{ e.stopPropagation(); if (overlay._stop) overlay._stop(); });
    window._lastBreathOverlay = overlay;
  }

  // API pública
  window.lr_helpers = {
    preload: preloadAudio,
    playInhale: playInhaleSegment,
    playExhale: playExhaleSegment,
    startAmbient: async () => { await ensureAudioContext(); if (!audioBuffers.ambient && !htmlAudio.ambient) await preloadAudio(); if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambient) try{ htmlAudio.ambient.volume=ambientVolume; htmlAudio.ambient.loop=true; htmlAudio.ambient.play().catch(()=>{});}catch(e){} },
    stopAmbient: () => { if (audioBuffers.ambient) stopAmbientLoop(); if (htmlAudio.ambient) try { htmlAudio.ambient.pause(); htmlAudio.ambient.currentTime=0;}catch(e){} },
    dumpState: () => ({ audioCtxState: audioCtx ? audioCtx.state : 'no-audioctx', buffers: { breath: !!audioBuffers.breath, ambient: !!audioBuffers.ambient }, htmlAudio: { breath: !!htmlAudio.breath, ambient: !!htmlAudio.ambient }, offsets: { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds } }),
    setOffsets: (a,b,c,d) => { inhaleOffsetSeconds = Number(a)||inhaleOffsetSeconds; inhaleDurationSeconds = Number(b)||inhaleDurationSeconds; exhaleOffsetSeconds = Number(c)||exhaleOffsetSeconds; exhaleDurationSeconds = Number(d)||exhaleDurationSeconds; console.log('[helpers] offsets set', { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds }); },
    _startBreath: startBreathFlow
  };

  preloadAudio().catch(e => console.warn('[helpers] preload error', e));
})();
