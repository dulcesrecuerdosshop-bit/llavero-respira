// helpers.js - ÚNICO breath.mp3 + ambient.mp3 (sin TTS en la pausa), logs y debug helpers
(function () {
  console.log('[helpers] cargando helpers.js (breath único - definitivo)');

  const AUDIO_PATHS = { breath: 'breath.mp3', ambient: 'ambient.mp3' };

  // Offsets por defecto (ajusta con setOffsets si hace falta)
  let inhaleOffsetSeconds = 0.0;
  let inhaleDurationSeconds = 2.8;
  let exhaleOffsetSeconds = 2.8;
  let exhaleDurationSeconds = 3.5;

  let soundBreathEnabled = true;
  let ambientVolume = 0.12;
  let soundVolume = 0.9;

  // WebAudio
  let audioCtx = null;
  let audioBuffers = { breath: null, ambient: null };
  let ambientSource = null;
  let ambientGain = null;

  // HTMLAudio fallback
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

  function playBufferSegment(buffer, offsetSec, durationSec, { gain = 1, fade = 0.06 } = {}) {
    if (!audioCtx || !buffer) { console.log('[helpers] playBufferSegment skipped'); return Promise.resolve(); }
    const ctx = audioCtx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    try {
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + fade);
      const endAt = now + Math.max(0.05, durationSec);
      g.gain.setValueAtTime(gain, endAt - fade);
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.connect(g).connect(ctx.destination);
      src.start(now, offsetSec, Math.max(0.01, durationSec));
      src.stop(endAt + 0.05);
      console.log('[helpers] scheduled segment', { offsetSec, durationSec, gain });
    } catch (e) { console.warn('[helpers] error scheduling buffer', e); }
    return Promise.resolve();
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
    try { ambientGain.gain.linearRampToValueAtTime(ambientVolume, audioCtx.currentTime + 1.5); } catch(e){}
    console.log('[helpers] ambient loop started (webaudio)');
  }
  function stopAmbientLoop() {
    if (ambientGain) try { ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8); } catch(e){}
    if (ambientSource) { try { ambientSource.stop(audioCtx.currentTime + 1.0); } catch(e){} ambientSource = null; ambientGain = null; }
    console.log('[helpers] ambient loop stopped (webaudio)');
  }

  function playHtmlAudioSegment(audioEl, offsetSec, durationSec) {
    if (!audioEl) { console.log('[helpers] no html audio element'); return; }
    try {
      audioEl.currentTime = offsetSec;
      audioEl.volume = soundVolume;
      audioEl.play().catch(e => console.warn('[helpers] htmlAudio play error', e));
      setTimeout(() => { try { audioEl.pause(); audioEl.currentTime = 0; } catch(e){} }, Math.max(400, Math.round(durationSec * 1000)));
      console.log('[helpers] htmlAudio segment played', { offsetSec, durationSec });
    } catch (e) { console.warn('[helpers] playHtmlAudioSegment error', e); }
  }

  async function preloadAudioAssets() {
    await ensureAudioContext();
    if (audioCtx) {
      audioBuffers.breath = await loadAudioBuffer(AUDIO_PATHS.breath).catch(()=>null);
      audioBuffers.ambient = await loadAudioBuffer(AUDIO_PATHS.ambient).catch(()=>null);
    } else {
      htmlAudio.breath = new Audio(AUDIO_PATHS.breath);
      htmlAudio.ambient = new Audio(AUDIO_PATHS.ambient); if (htmlAudio.ambient) { htmlAudio.ambient.loop = true; htmlAudio.ambient.volume = ambientVolume; }
    }
    console.log('[helpers] preloadAudioAssets results', {
      breathBuf: !!audioBuffers.breath, ambientBuf: !!audioBuffers.ambient,
      breathHtml: !!htmlAudio.breath, ambientHtml: !!htmlAudio.ambient
    });
  }

  // UI / breath flow
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[helpers] DOMContentLoaded - init');

    const breathBtn = document.getElementById('breathBtn');
    const startAmbientBtn = document.getElementById('startAmbientBtn');
    const stopAmbientBtn = document.getElementById('stopAmbientBtn');

    function attachSafe(el, ev, fn){
      if (!el) return;
      try { el.addEventListener(ev, fn); console.log('[helpers] listener', ev, 'agregado a', el.id); } catch(e){ console.warn(e); }
    }

    // Breath button: resume audio context, preload if necessary, start flow
    attachSafe(breathBtn, 'click', async () => {
      await ensureAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); console.log('[helpers] audioCtx resumed'); } catch(e){ console.warn(e); }
      }
      if (!audioBuffers.breath && !htmlAudio.breath) await preloadAudioAssets();
      startBreathFlow();
    });

    // Ambient controls
    attachSafe(startAmbientBtn, 'click', async () => {
      await ensureAudioContext();
      if (!audioBuffers.ambient && !htmlAudio.ambient) await preloadAudioAssets();
      if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient);
      else if (htmlAudio.ambient) try { htmlAudio.ambient.volume = ambientVolume; htmlAudio.ambient.loop = true; htmlAudio.ambient.play().catch(()=>{}); } catch(e){}
    });
    attachSafe(stopAmbientBtn, 'click', () => {
      if (audioBuffers.ambient) stopAmbientLoop();
      if (htmlAudio.ambient) try { htmlAudio.ambient.pause(); htmlAudio.ambient.currentTime = 0; } catch(e){}
    });

    // Breath flow implementation (overlay + segments). Ambient NOT auto-stopped.
    const BREATH_STEPS = [
      { label: 'Inhala', duration: inhaleDurationSeconds, offset: inhaleOffsetSeconds, type: 'inhale' },
      { label: 'Sostén', duration: 4.0, offset: 0, type: 'hold' },
      { label: 'Exhala', duration: exhaleDurationSeconds, offset: exhaleOffsetSeconds, type: 'exhale' },
      { label: 'Sostén', duration: 1.0, offset: 0, type: 'hold' }
    ];

    let breathing = false;
    async function startBreathFlow(){
      if (breathing) return;
      breathing = true;
      try { await ensureAudioContext(); if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume(); } catch(e){ console.warn(e); }
      if (!audioBuffers.breath && !htmlAudio.breath) await preloadAudioAssets();

      const overlay = document.createElement('div'); overlay.id='lr-breath-overlay';
      Object.assign(overlay.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:10000 });
      const container = document.createElement('div'); Object.assign(container.style,{display:'flex',flexDirection:'column',alignItems:'center',gap:'12px'});
      const circle = document.createElement('div'); Object.assign(circle.style,{width:'220px',height:'220px',borderRadius:'50%',background:'rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 30px rgba(0,0,0,0.4)',color:'#fff',fontSize:'28px',fontWeight:700,backdropFilter:'blur(6px)'});
      const smallText = document.createElement('div'); Object.assign(smallText.style,{color:'rgba(255,255,255,0.95)',fontSize:'18px',textAlign:'center'});
      container.appendChild(circle); container.appendChild(smallText); overlay.appendChild(container); document.body.appendChild(overlay);

      // Start ambient optionally (do NOT auto-stop it when flow ends)
      if (soundBreathEnabled) {
        if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient);
        else if (htmlAudio.ambient) { try { htmlAudio.ambient.volume = ambientVolume; htmlAudio.ambient.loop = true; htmlAudio.ambient.play().catch(()=>{}); } catch(e){} }
      }

      let phase = 0, phaseTimeout = null;
      async function doPhase(){
        if (!breathing) return;
        const step = BREATH_STEPS[phase];
        circle.textContent = step.label;
        smallText.textContent = step.label + (step.duration >= 1 ? ` · ${Math.round(step.duration)}s` : '');
        if (soundBreathEnabled && (step.type === 'inhale' || step.type === 'exhale')) {
          if (audioBuffers.breath) {
            await playBufferSegment(audioBuffers.breath, step.offset, step.duration, { gain: soundVolume, fade: 0.06 });
          } else if (htmlAudio.breath) {
            playHtmlAudioSegment(htmlAudio.breath, step.offset, step.duration);
          } else {
            console.log('[helpers] no breath audio to play');
          }
        }
        try {
          const scaleFrom = step.type === 'exhale' ? 1.0 : 0.6;
          const scaleTo = step.type === 'exhale' ? 0.6 : 1.0;
          circle.animate([{ transform:`scale(${scaleFrom})`, opacity:0.75 },{ transform:`scale(${scaleTo})`, opacity:1 }],{ duration: step.duration*1000, easing:'ease-in-out', fill:'forwards' });
        } catch(e){ circle.style.transition = `transform ${step.duration}s ease-in-out`; circle.style.transform = `scale(${scaleTo})`; }
        phaseTimeout = setTimeout(()=>{ phase=(phase+1)%BREATH_STEPS.length; doPhase(); }, Math.round(step.duration*1000));
      }
      doPhase();

      overlay._stop = () => {
        breathing = false;
        if (phaseTimeout) { clearTimeout(phaseTimeout); phaseTimeout = null; }
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        // Ambient intentionally remains until user stops it
      };
      overlay.addEventListener('click', (e) => { e.stopPropagation(); if (overlay._stop) overlay._stop(); });
      // save reference
      window._lastBreathOverlay = overlay;
    }
    function stopBreathFlow(){
      const ov = window._lastBreathOverlay;
      if (ov && ov._stop) ov._stop();
    }

    // Public API & debug helpers
    window.lr_helpers = {
      dumpState: () => ({
        soundBreathEnabled,
        audioCtxState: audioCtx ? audioCtx.state : 'no-audioctx',
        buffers: { breath: !!audioBuffers.breath, ambient: !!audioBuffers.ambient },
        htmlAudio: { breath: !!htmlAudio.breath, ambient: !!htmlAudio.ambient },
        offsets: { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds }
      }),
      resumeAudio: async () => { const ctx = await ensureAudioContext(); if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); console.log('[helpers] audioCtx resumed'); } catch(e){ console.warn(e);} } return ctx ? ctx.state : null; },
      playInhale: async () => { await ensureAudioContext(); if (!audioBuffers.breath && !htmlAudio.breath) await preloadAudioAssets(); if (audioBuffers.breath) return playBufferSegment(audioBuffers.breath, inhaleOffsetSeconds, inhaleDurationSeconds, { gain: soundVolume }); if (htmlAudio.breath) return playHtmlAudioSegment(htmlAudio.breath, inhaleOffsetSeconds, inhaleDurationSeconds); console.log('[helpers] No breath audio'); },
      playExhale: async () => { await ensureAudioContext(); if (!audioBuffers.breath && !htmlAudio.breath) await preloadAudioAssets(); if (audioBuffers.breath) return playBufferSegment(audioBuffers.breath, exhaleOffsetSeconds, exhaleDurationSeconds, { gain: soundVolume }); if (htmlAudio.breath) return playHtmlAudioSegment(htmlAudio.breath, exhaleOffsetSeconds, exhaleDurationSeconds); console.log('[helpers] No breath audio'); },
      startAmbient: async () => { await ensureAudioContext(); if (!audioBuffers.ambient && !htmlAudio.ambient) await preloadAudioAssets(); if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambient) try { htmlAudio.ambient.volume = ambientVolume; htmlAudio.ambient.loop = true; htmlAudio.ambient.play().catch(()=>{}); } catch(e){} },
      stopAmbient: () => { if (audioBuffers.ambient) stopAmbientLoop(); if (htmlAudio.ambient) try { htmlAudio.ambient.pause(); htmlAudio.ambient.currentTime = 0; } catch(e){} },
      setOffsets: (inhStart, inhDur, exhStart, exhDur) => {
        inhaleOffsetSeconds = Number(inhStart) || inhaleOffsetSeconds;
        inhaleDurationSeconds = Number(inhDur) || inhaleDurationSeconds;
        exhaleOffsetSeconds = Number(exhStart) || exhaleOffsetSeconds;
        exhaleDurationSeconds = Number(exhDur) || exhaleDurationSeconds;
        console.log('[helpers] offsets set', { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds });
      },
      toggleSoundBreath: (enable) => { if (typeof enable === 'boolean') soundBreathEnabled = enable; else soundBreathEnabled = !soundBreathEnabled; return soundBreathEnabled; },
      _startBreathFlow: startBreathFlow,
      _stopBreathFlow: stopBreathFlow
    };

    // preload
    preloadAudioAssets();
    console.log('[helpers] inicialización completa (final)');
  }); // DOMContentLoaded
})();
