// helpers.js - respiración avanzada: WebAudio (inhale/exhale) + TTS selectable + ambient loop
(function () {
  console.log('[helpers] cargando helpers.js (audio+tts)');

  // Configuración de audio
  const AUDIO_PATHS = {
    inhale: 'inhale.mp3',    // coloca en la raíz o ajusta la ruta
    exhale: 'exhale.mp3',
    ambient: 'ambient.mp3'
  };

  // Flags de comportamiento (puedes cambiar como prefieras)
  let voiceBreathEnabled = true;   // TTS (dice "Inhala", "Exhala")
  let soundBreathEnabled = true;   // usa audios inhale/exhale y ambient
  let ambientVolume = 0.12;        // volumen del ambient (0..1)
  let soundVolume = 0.95;          // volumen para inhale/exhale (0..1)

  // Web Audio variables
  let audioCtx = null;
  let audioBuffers = { inhale: null, exhale: null, ambient: null };
  let ambientSource = null;
  let ambientGain = null;

  // Funciones utilitarias para WebAudio
  async function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      return audioCtx;
    } catch (e) {
      console.warn('[helpers] Web Audio no soportado', e);
      audioCtx = null;
      return null;
    }
  }

  async function loadAudioBuffer(url) {
    // Si WebAudio no disponible, no hacemos nada (fallback más abajo)
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
      // programar fade out
      const endAt = ctx.currentTime + when + duration;
      g.gain.setValueAtTime(gain, endAt - fade);
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.connect(g).connect(ctx.destination);
      src.start(ctx.currentTime + when);
      src.stop(endAt + 0.05);
    } else {
      src.connect(g).connect(ctx.destination);
      src.start(ctx.currentTime + when);
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
    // Fade in suave
    ambientGain.gain.linearRampToValueAtTime(ambientVolume, audioCtx.currentTime + 1.5);
  }

  function stopAmbientLoop() {
    if (ambientGain) {
      try {
        ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8);
      } catch(e) {}
    }
    if (ambientSource) {
      try {
        ambientSource.stop(audioCtx.currentTime + 1.0);
      } catch(e) {}
      ambientSource = null;
      ambientGain = null;
    }
  }

  // Fallback con HTMLAudioElement si WebAudio no disponible
  function playAudioElement(url) {
    try {
      const a = new Audio(url);
      a.volume = soundVolume;
      a.play().catch(e => console.warn('[helpers] audioElement play error', e));
    } catch(e) { console.warn('[helpers] playAudioElement error', e); }
  }

  // Selección de voz TTS (buscar la mejor voz en Español)
  function pickSpanishVoice() {
    const voices = speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    // Preferencias: es-ES, es-AR, es-MX; preferir voces que contengan 'Google' o 'Microsoft' por calidad
    const prefer = voices.find(v => /es-/.test(v.lang) && /Google|Microsoft|X-Apple|Samantha|Lucia|Lucía/i.test(v.name));
    if (prefer) return prefer;
    const langMatch = voices.find(v => /^es/i.test(v.lang));
    if (langMatch) return langMatch;
    return voices[0];
  }

  // Preload assets (audio) - intentamos con WebAudio; si no, fallback HTMLAudio si queremos
  async function preloadAudioAssets() {
    // intenta cargar con WebAudio
    const ctx = await ensureAudioContext();
    if (!ctx) return;
    audioBuffers.inhale = await loadAudioBuffer(AUDIO_PATHS.inhale).catch(()=>null);
    audioBuffers.exhale = await loadAudioBuffer(AUDIO_PATHS.exhale).catch(()=>null);
    audioBuffers.ambient = await loadAudioBuffer(AUDIO_PATHS.ambient).catch(()=>null);
    console.log('[helpers] audio buffers preload', {
      inhale: !!audioBuffers.inhale, exhale: !!audioBuffers.exhale, ambient: !!audioBuffers.ambient
    });
  }

  // ---------- lógica de UI y respiración ----------
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[helpers] DOMContentLoaded - inicializando UI helpers con audio');

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

    function getFavoritos(){ try { return JSON.parse(localStorage.getItem(KEY_FAVORITOS) || '[]'); } catch(e){ console.warn(e); return []; } }
    function saveFavoritos(arr){ try { localStorage.setItem(KEY_FAVORITOS, JSON.stringify(arr)); } catch(e){ console.warn(e); } }

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
        historialEl.innerHTML = h.length ? (h.map(i=> `<span style="display:inline-block;margin:6px;padding:6px 10px;background:rgba(255,255,255,0.08);border-radius:12px;">${escapeHtml(i.text)}</span>`).join('')) : '';
      } catch(e){ console.warn(e); }
    }
    function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function attachSafe(el, event, fn){
      if (!el) { console.warn('[helpers] elemento no encontrado para listener:', event); return; }
      try { el.addEventListener(event, fn); console.log(`[helpers] listener ${event} agregado a`, el.id); } catch(e){ console.warn(e); }
    }

    // listeners básicos (favorito/compartir/copiar/tts/download) - reuse funcionalidad anterior
    attachSafe(favBtn, 'click', () => {
      const text = fraseEl.textContent.trim();
      let favs = getFavoritos();
      if (favs.includes(text)) {
        favs = favs.filter(f => f !== text);
        favBtn.textContent = '♡ Favorita';
      } else {
        favs.unshift(text);
        favBtn.textContent = '♥ Favorita';
      }
      saveFavoritos(favs.slice(0,50));
    });

    attachSafe(shareBtn, 'click', async () => {
      const text = fraseEl.textContent.trim();
      const shareData = { title: 'Frase motivacional', text, url: location.href };
      if (navigator.share) {
        try { await navigator.share(shareData); } catch(e){ console.warn(e); }
      } else {
        copyToClipboard(`${text}\n${location.href}`);
        alert('Frase copiada. Pega para compartir.');
      }
    });

    attachSafe(copyBtn, 'click', () => {
      copyToClipboard(fraseEl.textContent.trim());
      copyBtn.textContent = '✅ Copiado';
      setTimeout(()=> copyBtn.textContent = '📋 Copiar', 1200);
    });
    function copyToClipboard(text){
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch(e){ console.warn(e); } document.body.removeChild(ta);
    }

    attachSafe(ttsBtn, 'click', () => {
      const text = fraseEl.textContent.trim();
      if (!('speechSynthesis' in window)) { alert('Text-to-speech no disponible'); return; }
      const voice = pickSpanishVoice();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'es-ES';
      u.rate = 1;
      u.pitch = 1;
      speechSynthesis.speak(u);
    });

    // breathe flow using audio buffers or fallback to TTS cues
    const BREATH_STEPS = [
      { label: 'Inhala', duration: 4000 },
      { label: 'Sostén', duration: 4000 },
      { label: 'Exhala', duration: 4000 },
      { label: 'Sostén', duration: 1000 }
    ];

    let breathing = false;
    attachSafe(breathBtn, 'click', () => {
      if (breathing) { stopBreath(); return; }
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
      breathing = true;
      disableControls(true);
      if (breathBtn) breathBtn.textContent = '⏸️ Parar';

      // overlay
      const overlay = document.createElement('div');
      overlay.id = 'lr-breath-overlay';
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', zIndex: 10000, cursor: 'default'
      });

      const container = document.createElement('div');
      Object.assign(container.style, { display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', justifyContent:'center' });

      const circle = document.createElement('div');
      Object.assign(circle.style, {
        width: '220px', height: '220px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
        display: 'flex', alignItems:'center', justifyContent:'center', boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        color:'#fff', fontSize:'28px', fontWeight:'700', backdropFilter:'blur(6px)'
      });
      const smallText = document.createElement('div');
      Object.assign(smallText.style, { color:'rgba(255,255,255,0.95)', fontSize:'18px', textAlign:'center' });

      container.appendChild(circle);
      container.appendChild(smallText);
      overlay.appendChild(container);
      document.body.appendChild(overlay);

      // Start ambient if enabled and buffer loaded
      if (soundBreathEnabled && audioBuffers.ambient) {
        startAmbientLoop(audioBuffers.ambient);
      }

      let phase = 0;
      let phaseTimeout = null;

      function doPhase() {
        if (!breathing) return;
        const step = BREATH_STEPS[phase];
        circle.textContent = step.label;
        smallText.textContent = step.label + (step.duration >= 1000 ? ` · ${Math.round(step.duration/1000)}s` : '');
        // play audio or speak
        if (soundBreathEnabled && ((phase === 0 && audioBuffers.inhale) || (phase === 2 && audioBuffers.exhale))) {
          const buf = phase === 0 ? audioBuffers.inhale : (phase === 2 ? audioBuffers.exhale : null);
          if (buf) {
            playBuffer(buf, { gain: soundVolume, duration: step.duration, fade: 0.06 }).catch(()=>{});
          } else {
            // fallback tts cue
            speakIfEnabled(step.label);
          }
        } else {
          // fallback tts cue
          speakIfEnabled(step.label);
          // if soundMode enabled but WebAudio not available, try playing HTMLAudio
          if (soundBreathEnabled && !audioCtx) {
            if (phase === 0) playAudioElement(AUDIO_PATHS.inhale);
            if (phase === 2) playAudioElement(AUDIO_PATHS.exhale);
          }
        }

        // animate circle (scale)
        try {
          const scaleFrom = phase === 2 ? 1.0 : 0.6;
          const scaleTo = phase === 2 ? 0.6 : 1.0;
          circle.animate([{ transform: `scale(${scaleFrom})`, opacity: 0.75 }, { transform: `scale(${scaleTo})`, opacity: 1.0 }], { duration: step.duration, easing: 'ease-in-out', fill:'forwards' });
        } catch(e) {
          // fallback CSS transition
          circle.style.transition = `transform ${step.duration}ms ease-in-out`;
          circle.style.transform = `scale(${scaleTo})`;
        }

        phaseTimeout = setTimeout(() => {
          phase = (phase + 1) % BREATH_STEPS.length;
          doPhase();
        }, step.duration);
      }

      // comenzar
      doPhase();

      overlay._stop = () => {
        breathing = false;
        window.breathingActive = false;
        if (phaseTimeout) { clearTimeout(phaseTimeout); phaseTimeout = null; }
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (soundBreathEnabled) stopAmbientLoop();
        disableControls(false);
        if (breathBtn) breathBtn.textContent = '🌬️ Respirar';
      };

      // click overlay para parar
      overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        if (overlay._stop) overlay._stop();
      });
    }

    function stopBreath(){
      const overlay = document.getElementById('lr-breath-overlay');
      if (overlay && overlay._stop) overlay._stop();
    }

    // preload audio assets (try)
    preloadAudioAssets();

    // exposición publica
    window.onFraseMostrada = function(text){
      try {
        addHistorial(text);
        const favs = getFavoritos();
        if (favBtn) favBtn.textContent = favs.includes(text) ? '♥ Favorita' : '♡ Favorita';
      } catch(e){ console.warn(e); }
    };

    window.lr_helpers = {
      toggleVoiceBreath: (enable) => { voiceBreathEnabled = !!enable; return voiceBreathEnabled; },
      toggleSoundBreath: (enable) => { soundBreathEnabled = !!enable; return soundBreathEnabled; },
      isBreathing: () => !!window.breathingActive,
      dumpState: () => ({ voiceBreathEnabled, soundBreathEnabled, audioCtx: !!audioCtx, buffers: { inhale: !!audioBuffers.inhale, exhale: !!audioBuffers.exhale, ambient: !!audioBuffers.ambient } })
    };

    renderHistorial();
    console.log('[helpers] inicialización completa (audio ready)');
  }); // DOMContentLoaded
})();
