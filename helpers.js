// helpers.js - manejo de audio mejorado (resume AudioContext, fallback HTMLAudio, logs)
// Incluye funciones públicas para debug: window.lr_helpers.dumpState(), resumeAudio(), etc.
(function () {
  console.log('[helpers] cargando helpers.js (audio+tts)');

  // Rutas (ajusta si pones audio en carpeta)
  const AUDIO_PATHS = {
    inhale: 'inhale.mp3',
    exhale: 'exhale.mp3',
    ambient: 'ambient.mp3'
  };

  // Flags y volúmenes por defecto
  let voiceBreathEnabled = true;
  let soundBreathEnabled = true;
  let ambientVolume = 0.12;
  let soundVolume = 0.9;

  // Web Audio
  let audioCtx = null;
  let audioBuffers = { inhale: null, exhale: null, ambient: null };
  let ambientSource = null;
  let ambientGain = null;

  // HTMLAudio fallback elements (por si WebAudio no está disponible)
  let htmlAudio = { inhale: null, exhale: null, ambient: null };

  async function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      console.log('[helpers] AudioContext creado', audioCtx);
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

  function playBuffer(buffer, { when = 0, duration = null, gain = 1, fade = 0.05 } = {}) {
    if (!audioCtx || !buffer) return Promise.resolve();
    const ctx = audioCtx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime + when);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + when + fade);
    if (duration) {
      const endAt = ctx.currentTime + when + duration;
      g.gain.setValueAtTime(gain, endAt - fade);
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.connect(g).connect(ctx.destination);
      try { src.start(ctx.currentTime + when); src.stop(endAt + 0.05); } catch(e){ console.warn('[helpers] start/stop buffer error', e); }
    } else {
      src.connect(g).connect(ctx.destination);
      try { src.start(ctx.currentTime + when); } catch(e){ console.warn('[helpers] start buffer error', e); }
    }
    console.log('[helpers] playBuffer scheduled', { when, duration, gain });
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
    // Fade in
    try { ambientGain.gain.linearRampToValueAtTime(ambientVolume, audioCtx.currentTime + 1.5); } catch(e){}
    console.log('[helpers] ambient loop started');
  }

  function stopAmbientLoop() {
    if (ambientGain) {
      try { ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8); } catch(e){}
    }
    if (ambientSource) {
      try { ambientSource.stop(audioCtx.currentTime + 1.0); } catch(e){}
      ambientSource = null;
      ambientGain = null;
    }
    console.log('[helpers] ambient loop stopped');
  }

  function playAudioElement(url) {
    try {
      const a = new Audio(url);
      a.volume = soundVolume;
      a.play().catch(e => console.warn('[helpers] audioElement play error', e));
      return a;
    } catch(e) { console.warn('[helpers] playAudioElement error', e); return null; }
  }

  function pickSpanishVoice() {
    const voices = speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const prefer = voices.find(v => /es-/.test(v.lang) && /Google|Microsoft|X-Apple|Samantha|Lucia|Lucía/i.test(v.name));
    if (prefer) return prefer;
    const langMatch = voices.find(v => /^es/i.test(v.lang));
    if (langMatch) return langMatch;
    return voices[0];
  }

  // preload assets; safe: ignores failures
  async function preloadAudioAssets() {
    await ensureAudioContext();
    if (audioCtx) {
      audioBuffers.inhale = await loadAudioBuffer(AUDIO_PATHS.inhale).catch(()=>null);
      audioBuffers.exhale = await loadAudioBuffer(AUDIO_PATHS.exhale).catch(()=>null);
      audioBuffers.ambient = await loadAudioBuffer(AUDIO_PATHS.ambient).catch(()=>null);
    } else {
      // fallback: prepare HTMLAudio objects (lighter)
      htmlAudio.inhale = new Audio(AUDIO_PATHS.inhale);
      htmlAudio.exhale = new Audio(AUDIO_PATHS.exhale);
      htmlAudio.ambient = new Audio(AUDIO_PATHS.ambient); htmlAudio.ambient.loop = true; htmlAudio.ambient.volume = ambientVolume;
    }
    console.log('[helpers] preloadAudioAssets results', {
      inhale: !!audioBuffers.inhale || !!htmlAudio.inhale,
      exhale: !!audioBuffers.exhale || !!htmlAudio.exhale,
      ambient: !!audioBuffers.ambient || !!htmlAudio.ambient
    });
  }

  // ---------- UI / Breath logic ----------
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[helpers] DOMContentLoaded - init helpers');

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
    function renderHistorial(){
      try {
        if (!historialEl) return;
        const h = JSON.parse(localStorage.getItem(KEY_HISTORIAL) || '[]');
        historialEl.innerHTML = h.length ? (h.map(i=> `<span>${escapeHtml(i.text)}</span>`).join('')) : '';
      } catch(e){ console.warn(e); }
    }
    function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function attachSafe(el, event, fn){
      if (!el) { console.warn('[helpers] elemento no encontrado para listener:', event); return; }
      try { el.addEventListener(event, fn); console.log(`[helpers] listener ${event} agregado a`, el.id); } catch(e){ console.warn(e); }
    }

    // botones básicos
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

    attachSafe(ttsBtn, 'click', () => {
      const text = fraseEl.textContent.trim();
      if (!('speechSynthesis' in window)) { alert('TTS no disponible'); return; }
      const voice = pickSpanishVoice();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'es-ES';
      u.rate = 1;
      u.pitch = 1;
      speechSynthesis.speak(u);
    });

    // breath logic with audio fallback and resume
    const BREATH_STEPS = [
      { label: 'Inhala', duration: 4000 },
      { label: 'Sostén', duration: 4000 },
      { label: 'Exhala', duration: 4000 },
      { label: 'Sostén', duration: 1000 }
    ];

    let breathing = false;
    attachSafe(breathBtn, 'click', async () => {
      if (breathing) { stopBreath(); return; }
      // On first user gesture, resume audio context and ensure assets loaded
      await ensureAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); console.log('[helpers] audioCtx resumed'); } catch(e){ console.warn('[helpers] audioCtx resume failed', e); }
      }
      // If buffers not loaded yet, try preload now (user gesture allows decode)
      if (!audioBuffers.inhale && !htmlAudio.inhale) {
        await preloadAudioAssets();
      }
      startBreath();
    });

    function disableControls(state) {
      controls.forEach(b => { try { b.disabled = !!state; } catch(e){} });
      if (fraseEl) fraseEl.style.pointerEvents = state ? 'none' : '';
      window.breathingActive = !!state;
    }

    function speakIfEnabled(text) {
      if (!voiceBreathEnabled) return;
      if (!('speechSynthesis' in window)) return;
      const v = pickSpanishVoice();
      const u = new SpeechSynthesisUtterance(text);
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'es-ES';
      u.rate = 1;
      u.pitch = 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
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

      // start ambient
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
        smallText.textContent = step.label + (step.duration >= 1000 ? ` · ${Math.round(step.duration/1000)}s` : '');

        // Play inhale/exhale sounds or speak
        if (soundBreathEnabled) {
          if (phase === 0) {
            if (audioBuffers.inhale) { await playBuffer(audioBuffers.inhale, { gain: soundVolume, duration: step.duration, fade: 0.06 }); }
            else if (htmlAudio.inhale) { try { htmlAudio.inhale.currentTime = 0; htmlAudio.inhale.volume = soundVolume; htmlAudio.inhale.play().catch(()=>{}); } catch(e){} }
            else speakIfEnabled(step.label);
          } else if (phase === 2) {
            if (audioBuffers.exhale) { await playBuffer(audioBuffers.exhale, { gain: soundVolume, duration: step.duration, fade: 0.06 }); }
            else if (htmlAudio.exhale) { try { htmlAudio.exhale.currentTime = 0; htmlAudio.exhale.volume = soundVolume; htmlAudio.exhale.play().catch(()=>{}); } catch(e){} }
            else speakIfEnabled(step.label);
          } else {
            // hold phases: optionally speak small cue
            speakIfEnabled(step.label);
          }
        } else {
          speakIfEnabled(step.label);
        }

        // animate circle
        try {
          const scaleFrom = phase === 2 ? 1.0 : 0.6;
          const scaleTo = phase === 2 ? 0.6 : 1.0;
          circle.animate([{ transform: `scale(${scaleFrom})`, opacity: 0.75 }, { transform: `scale(${scaleTo})`, opacity: 1.0 }], { duration: step.duration, easing: 'ease-in-out', fill:'forwards' });
        } catch(e) { circle.style.transition = `transform ${step.duration}ms ease-in-out`; circle.style.transform = `scale(${scaleTo})`; }

        phaseTimeout = setTimeout(() => {
          phase = (phase + 1) % BREATH_STEPS.length;
          doPhase();
        }, step.duration);
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

    // preload now (non-blocking)
    preloadAudioAssets();

    // exported helpers & debug
    window.onFraseMostrada = function(text){ try { addHistorial(text); const favs = getFavoritos(); if (favBtn) favBtn.textContent = favs.includes(text) ? '♥ Favorita' : '♡ Favorita'; } catch(e){ console.warn(e); } };

    window.lr_helpers = {
      dumpState: () => ({ voiceBreathEnabled, soundBreathEnabled, audioCtxState: audioCtx ? audioCtx.state : 'no-audioctx', buffers: { inhale: !!audioBuffers.inhale, exhale: !!audioBuffers.exhale, ambient: !!audioBuffers.ambient }, htmlAudio: { inhale: !!htmlAudio.inhale, exhale: !!htmlAudio.exhale, ambient: !!htmlAudio.ambient } }),
      toggleVoiceBreath: (enable) => { if (typeof enable === 'boolean') voiceBreathEnabled = enable; else voiceBreathEnabled = !voiceBreathEnabled; return voiceBreathEnabled; },
      toggleSoundBreath: (enable) => { if (typeof enable === 'boolean') soundBreathEnabled = enable; else soundBreathEnabled = !soundBreathEnabled; return soundBreathEnabled; },
      resumeAudio: async () => { const ctx = await ensureAudioContext(); if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); console.log('[helpers] audioCtx resumed by resumeAudio'); } catch(e){ console.warn(e);} } return ctx ? ctx.state : null; }
    };

    // init UI hist
    renderHistorial();
    console.log('[helpers] inicialización completa');
  }); // DOMContentLoaded
})();
