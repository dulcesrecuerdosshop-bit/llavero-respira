// helpers.js - versión “sin voz”: usa solo audios (breath.mp3 + ambient.mp3). Exponen funciones de test.
(function () {
  console.log('[helpers] cargando helpers.js (solo audio, TTS desactivado)');

  // Rutas (asegúrate breath.mp3 y ambient.mp3 están en la raíz)
  const AUDIO_PATHS = {
    breath: 'breath.mp3',
    ambient: 'ambient.mp3'
  };

  // Offsets por defecto (ajusta si es necesario)
  let inhaleOffsetSeconds = 0.0;
  let inhaleDurationSeconds = 2.6;
  let exhaleOffsetSeconds = 2.6;
  let exhaleDurationSeconds = 3.2;

  // Flags/volumen
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
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('fetch audio failed ' + resp.status);
      const ab = await resp.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      return buf;
    } catch (e) {
      console.warn('[helpers] error cargando audio', url, e);
      return null;
    }
  }

  function playBufferSegment(buffer, offsetSec, durationSec, { gain = 1, fade = 0.06 } = {}) {
    if (!audioCtx || !buffer) {
      console.log('[helpers] playBufferSegment skipped, no audioCtx or buffer');
      return Promise.resolve();
    }
    const ctx = audioCtx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    try {
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + fade);
      const endAt = now + durationSec;
      g.gain.setValueAtTime(gain, endAt - fade);
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.connect(g).connect(ctx.destination);
      src.start(now, offsetSec, Math.max(0.01, durationSec));
      src.stop(endAt + 0.05);
      console.log('[helpers] scheduled buffer segment', { offsetSec, durationSec, gain });
    } catch (e) {
      console.warn('[helpers] error scheduling buffer', e);
    }
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
    console.log('[helpers] ambient loop started');
  }

  function stopAmbientLoop() {
    if (ambientGain) try { ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8); } catch(e){}
    if (ambientSource) {
      try { ambientSource.stop(audioCtx.currentTime + 1.0); } catch(e){}
      ambientSource = null; ambientGain = null;
    }
    // fallback HTMLAudio handled elsewhere
    console.log('[helpers] ambient loop stopped');
  }

  function playHtmlAudioSegment(audioEl, offsetSec, durationSec) {
    if (!audioEl) { console.log('[helpers] htmlAudio segment skipped, no element'); return; }
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
    console.log('[helpers] preloadAudioAssets', {
      breathBuf: !!audioBuffers.breath, ambientBuf: !!audioBuffers.ambient,
      breathHtml: !!htmlAudio.breath, ambientHtml: !!htmlAudio.ambient
    });
  }

  // ---------- Breath UI logic ----------
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[helpers] DOMContentLoaded - init helpers (solo audio)');

    const fraseEl = document.getElementById('frase');
    const favBtn = document.getElementById('favBtn');
    const shareBtn = document.getElementById('shareBtn');
    const copyBtn = document.getElementById('copyBtn');
    const ttsBtn = document.getElementById('ttsBtn');
    const breathBtn = document.getElementById('breathBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const historialEl = document.getElementById('historial');
    const controls = Array.from(document.querySelectorAll('.controls button'));

    const KEY_FAVORITOS = 'lr_favoritos_v1';
    const KEY_HISTORIAL = 'lr_historial_v1';

    function getFavoritos(){ try { return JSON.parse(localStorage.getItem(KEY_FAVORITOS) || '[]'); } catch(e){ return []; } }
    function saveFavoritos(arr){ try { localStorage.setItem(KEY_FAVORITOS, JSON.stringify(arr)); } catch(e){} }

    function addHistorial(text){
      try {
        const h = JSON.parse(localStorage.getItem(KEY_HISTORIAL) || '[]');
        h.unshift({ text, at: Date.now() });
        localStorage.setItem(KEY_HISTORIAL, JSON.stringify(h.slice(0, 20)));
        renderHistorial();
      } catch(e){ console.warn(e); }
    }
    function renderHistorial(){ try { if (!historialEl) return; const h = JSON.parse(localStorage.getItem(KEY_HISTORIAL) || '[]'); historialEl.innerHTML = h.length ? (h.map(i=> `<span>${escapeHtml(i.text)}</span>`).join('')) : ''; } catch(e){} }
    function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function attachSafe(el, event, fn){ if (!el) { console.warn('[helpers] elemento no encontrado para listener:', event); return; } try { el.addEventListener(event, fn); console.log(`[helpers] listener ${event} agregado a`, el.id); } catch(e){ console.warn(e); } }

    // Basic controls
    attachSafe(favBtn, 'click', () => {
      const text = fraseEl.textContent.trim();
      let favs = getFavoritos();
      if (favs.includes(text)) { favs = favs.filter(f => f !== text); favBtn.textContent = '♡ Favorita'; }
      else { favs.unshift(text); favBtn.textContent = '♥ Favorita'; }
      saveFavoritos(favs.slice(0,50));
    });
    attachSafe(shareBtn, 'click', async () => {
      const text = fraseEl.textContent.trim();
      const shareData = { title: 'Frase motivacional', text, url: location.href };
      if (navigator.share) { try { await navigator.share(shareData); } catch(e){ console.warn(e);} } else { copyToClipboard(`${text}\n${location.href}`); alert('Frase copiada.'); }
    });
    attachSafe(copyBtn, 'click', () => { copyToClipboard(fraseEl.textContent.trim()); copyBtn.textContent = '✅ Copiado'; setTimeout(()=> copyBtn.textContent = '📋 Copiar', 1200); });
    function copyToClipboard(text){ if (!text) return; if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text); const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); }catch(e){} ta.remove(); }

    // TTS button will remain but does not play breath cues
    attachSafe(ttsBtn, 'click', () => {
      const text = fraseEl.textContent.trim();
      if (!('speechSynthesis' in window)) { alert('TTS no disponible'); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });

    // BREATH flow using breath.mp3 segments
    const BREATH_STEPS = [
      { label: 'Inhala', duration: inhaleDurationSeconds, offset: inhaleOffsetSeconds, type: 'inhale' },
      { label: 'Sostén', duration: 4.0, offset: 0, type: 'hold' },
      { label: 'Exhala', duration: exhaleDurationSeconds, offset: exhaleOffsetSeconds, type: 'exhale' },
      { label: 'Sostén', duration: 1.0, offset: 0, type: 'hold' }
    ];

    let breathing = false;
    attachSafe(breathBtn, 'click', async () => {
      if (breathing) { stopBreath(); return; }
      await ensureAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); console.log('[helpers] audioCtx resumed'); } catch(e){ console.warn(e); }
      }
      if (!audioBuffers.breath && !htmlAudio.breath) await preloadAudioAssets();
      startBreath();
    });

    function disableControls(state) {
      controls.forEach(b => { try { b.disabled = !!state; } catch(e){} });
      if (fraseEl) fraseEl.style.pointerEvents = state ? 'none' : '';
      window.breathingActive = !!state;
    }

    async function startBreath(){
      breathing = true; disableControls(true);
      if (breathBtn) breathBtn.textContent = '⏸️ Parar';
      const overlay = document.createElement('div');
      overlay.id = 'lr-breath-overlay';
      Object.assign(overlay.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:10000, cursor:'default' });

      const container = document.createElement('div');
      Object.assign(container.style, { display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', justifyContent:'center' });

      const circle = document.createElement('div');
      Object.assign(circle.style, { width:'220px', height:'220px', borderRadius:'50%', background:'rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 30px rgba(0,0,0,0.4)', color:'#fff', fontSize:'28px', fontWeight:'700', backdropFilter:'blur(6px)' });

      const smallText = document.createElement('div');
      Object.assign(smallText.style, { color:'rgba(255,255,255,0.95)', fontSize:'18px', textAlign:'center' });

      container.appendChild(circle); container.appendChild(smallText); overlay.appendChild(container); document.body.appendChild(overlay);

      // ambient start
      if (soundBreathEnabled) {
        if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient);
        else if (htmlAudio.ambient) { try { htmlAudio.ambient.volume = ambientVolume; htmlAudio.ambient.loop = true; htmlAudio.ambient.play().catch(()=>{}); } catch(e){} }
      }

      let phase = 0;
      let phaseTimeout = null;

      async function doPhase() {
        if (!breathing) return;
        const step = BREATH_STEPS[phase];
        circle.textContent = step.label;
        smallText.textContent = step.label + (step.duration >= 1 ? ` · ${Math.round(step.duration)}s` : '');

        // play audio segments (no TTS cues)
        if (soundBreathEnabled && (step.type === 'inhale' || step.type === 'exhale')) {
          if (audioBuffers.breath) {
            await playBufferSegment(audioBuffers.breath, step.offset, step.duration, { gain: soundVolume, fade: 0.06 });
          } else if (htmlAudio.breath) {
            playHtmlAudioSegment(htmlAudio.breath, step.offset, step.duration);
          } else {
            console.log('[helpers] No audio buffers found; nothing to play for breath step');
          }
        }

        // animate circle
        try {
          const scaleFrom = step.type === 'exhale' ? 1.0 : 0.6;
          const scaleTo = step.type === 'exhale' ? 0.6 : 1.0;
          circle.animate([{ transform: `scale(${scaleFrom})`, opacity: 0.75 }, { transform: `scale(${scaleTo})`, opacity: 1.0 }], { duration: step.duration * 1000, easing: 'ease-in-out', fill:'forwards' });
        } catch(e) {
          circle.style.transition = `transform ${step.duration}s ease-in-out`;
          circle.style.transform = `scale(${scaleTo})`;
        }

        phaseTimeout = setTimeout(() => {
          phase = (phase + 1) % BREATH_STEPS.length;
          doPhase();
        }, Math.round(step.duration * 1000));
      }

      doPhase();

      overlay._stop = () => {
        breathing = false; window.breathingActive = false;
        if (phaseTimeout) { clearTimeout(phaseTimeout); phaseTimeout = null; }
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (soundBreathEnabled) {
          if (audioBuffers.ambient) stopAmbientLoop();
          else if (htmlAudio.ambient) { try { htmlAudio.ambient.pause(); htmlAudio.ambient.currentTime = 0; } catch(e){} }
        }
        disableControls(false);
        if (breathBtn) breathBtn.textContent = '🌬️ Respirar';
      };

      overlay.addEventListener('click', (e) => { e.stopPropagation(); if (overlay._stop) overlay._stop(); });
    }

    function stopBreath(){
      const overlay = document.getElementById('lr-breath-overlay');
      if (overlay && overlay._stop) overlay._stop();
    }

    // preload now
    preloadAudioAssets();

    // public API for debug & control
    window.lr_helpers = {
      dumpState: () => ({
        soundBreathEnabled,
        audioCtxState: audioCtx ? audioCtx.state : 'no-audioctx',
        buffers: { breath: !!audioBuffers.breath, ambient: !!audioBuffers.ambient },
        htmlAudio: { breath: !!htmlAudio.breath, ambient: !!htmlAudio.ambient },
        offsets: { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds }
      }),
      toggleSoundBreath: (enable) => { if (typeof enable === 'boolean') soundBreathEnabled = enable; else soundBreathEnabled = !soundBreathEnabled; return soundBreathEnabled; },
      resumeAudio: async () => { const ctx = await ensureAudioContext(); if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); console.log('[helpers] audioCtx resumed by resumeAudio'); } catch(e){ console.warn(e);} } return ctx ? ctx.state : null; },
      // test helpers
      playInhale: async () => {
        await ensureAudioContext();
        if (!audioBuffers.breath && !htmlAudio.breath) await preloadAudioAssets();
        if (audioBuffers.breath) return playBufferSegment(audioBuffers.breath, inhaleOffsetSeconds, inhaleDurationSeconds, { gain: soundVolume });
        if (htmlAudio.breath) return playHtmlAudioSegment(htmlAudio.breath, inhaleOffsetSeconds, inhaleDurationSeconds);
        console.log('[helpers] No breath audio available');
      },
      playExhale: async () => {
        await ensureAudioContext();
        if (!audioBuffers.breath && !htmlAudio.breath) await preloadAudioAssets();
        if (audioBuffers.breath) return playBufferSegment(audioBuffers.breath, exhaleOffsetSeconds, exhaleDurationSeconds, { gain: soundVolume });
        if (htmlAudio.breath) return playHtmlAudioSegment(htmlAudio.breath, exhaleOffsetSeconds, exhaleDurationSeconds);
        console.log('[helpers] No breath audio available');
      },
      startAmbient: async () => {
        await ensureAudioContext();
        if (!audioBuffers.ambient && !htmlAudio.ambient) await preloadAudioAssets();
        if (audioBuffers.ambient) return startAmbientLoop(audioBuffers.ambient);
        if (htmlAudio.ambient) try { htmlAudio.ambient.volume = ambientVolume; htmlAudio.ambient.loop = true; htmlAudio.ambient.play().catch(()=>{}); } catch(e){}
        console.log('[helpers] ambient start attempted');
      },
      stopAmbient: () => {
        if (audioBuffers.ambient) stopAmbientLoop();
        if (htmlAudio.ambient) try { htmlAudio.ambient.pause(); htmlAudio.ambient.currentTime = 0; } catch(e){}
        console.log('[helpers] ambient stop attempted');
      },
      setOffsets: (inhStart, inhDur, exhStart, exhDur) => {
        inhaleOffsetSeconds = Number(inhStart) || inhaleOffsetSeconds;
        inhaleDurationSeconds = Number(inhDur) || inhaleDurationSeconds;
        exhaleOffsetSeconds = Number(exhStart) || exhaleOffsetSeconds;
        exhaleDurationSeconds = Number(exhDur) || exhaleDurationSeconds;
        console.log('[helpers] offsets set', { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds });
      }
    };

    renderHistorial();
    console.log('[helpers] inicialización completa (solo audio)');
  }); // DOMContentLoaded
})();
