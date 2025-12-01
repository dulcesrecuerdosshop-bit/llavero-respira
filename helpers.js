// helpers.js - audio helper final: Android-friendly unlock, HTMLAudio fallback, TTS loader, favorites + menu helpers
(function () {
  console.log('[helpers] cargando helpers.js (audio + TTS + UX fixes)');

  const AUDIO = {
    breathCandidates: ['Breath.mp3', 'breath.mp3'],
    inhaleCue: 'inhaleCue.mp3',
    exhaleCue: 'exhaleCue.mp3',
    ambientCandidates: ['ambient.mp3', 'Ambient.mp3']
  };

  // default offsets (puedes ajustar con window.lr_helpers.setOffsets)
  let inhaleOffsetSeconds = 0.0, inhaleDurationSeconds = 2.0;
  let exhaleOffsetSeconds = 3.0, exhaleDurationSeconds = 3.5;

  let audioCtx = null;
  let audioBuffers = { breath: null, inhaleCue: null, exhaleCue: null, ambient: null };
  let ambientSource = null, ambientGain = null;
  const htmlAudio = { breathUrl: null, inhaleEl: null, exhaleEl: null, ambientEl: null };

  // TTS
  let voicesReady = false;
  let voicesList = [];
  let ttsEnabled = false; // default disabled for automatic flows
  let preferredTTSVoice = null;

  // Favorites
  const KEY_FAVORITOS = 'lr_favoritos_v1';

  // Utility: head check existence
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

  async function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      console.log('[helpers] AudioContext creado', audioCtx.state);
      return audioCtx;
    } catch (e) {
      console.warn('[helpers] no WebAudio', e);
      audioCtx = null; return null;
    }
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

  // HTML fallback play for segments or standalone files
  function playHtmlUrl(url, offset=0, duration=2000) {
    try {
      // reuse element when possible
      let el;
      if (url === htmlAudio.inhaleEl?.src) el = htmlAudio.inhaleEl;
      else if (url === htmlAudio.exhaleEl?.src) el = htmlAudio.exhaleEl;
      else {
        el = new Audio(url);
      }
      el.volume = 0.95;
      // offset
      try { el.currentTime = offset; } catch(e){}
      el.play().catch(e => console.warn('[helpers] html play error', e));
      setTimeout(() => { try { el.pause(); el.currentTime = 0; } catch(e){} }, Math.max(400, Math.round(duration)));
      console.log('[helpers] html played', url, { offset, duration });
      return true;
    } catch (e) {
      console.warn('[helpers] playHtmlUrl failed', e);
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
      try { ambientGain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 2.0); } catch(e){}
      console.log('[helpers] ambient webaudio start');
      return;
    }
    if (url) {
      if (!htmlAudio.ambientEl) { htmlAudio.ambientEl = new Audio(url); htmlAudio.ambientEl.loop = true; htmlAudio.ambientEl.volume = 0.12; }
      htmlAudio.ambientEl.play().catch(e => console.warn('[helpers] ambient html play error', e));
      console.log('[helpers] ambient html start');
    }
  }
  function stopAmbientLoop() {
    if (ambientGain) try { ambientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6); } catch(e){}
    if (ambientSource) { try { ambientSource.stop(audioCtx.currentTime + 0.5); } catch(e){} ambientSource = null; ambientGain = null; }
    if (htmlAudio.ambientEl) try { htmlAudio.ambientEl.pause(); htmlAudio.ambientEl.currentTime = 0; } catch(e){}
    console.log('[helpers] ambient stopped');
  }

  // Preload audio (detect candidates)
  async function preloadAll() {
    await ensureAudioContext();
    // inhale/exhale cues
    if (await existsUrl(AUDIO.inhaleCue)) {
      const buf = await loadBuffer(AUDIO.inhaleCue);
      if (buf) audioBuffers.inhaleCue = buf; else htmlAudio.inhaleEl = new Audio(AUDIO.inhaleCue);
    }
    if (await existsUrl(AUDIO.exhaleCue)) {
      const buf = await loadBuffer(AUDIO.exhaleCue);
      if (buf) audioBuffers.exhaleCue = buf; else htmlAudio.exhaleEl = new Audio(AUDIO.exhaleCue);
    }
    // breath full
    let chosen = null;
    for (const c of AUDIO.breathCandidates) { if (await existsUrl(c)) { chosen = c; break; } }
    if (chosen) {
      const buf = await loadBuffer(chosen);
      if (buf) audioBuffers.breath = buf; else htmlAudio.breathUrl = chosen;
    }
    // ambient
    let amb = null;
    for (const a of AUDIO.ambientCandidates) { if (await existsUrl(a)) { amb = a; break; } }
    if (amb) {
      const buf = await loadBuffer(amb);
      if (buf) audioBuffers.ambient = buf; else { htmlAudio.ambientEl = new Audio(amb); htmlAudio.ambientEl.loop = true; htmlAudio.ambientEl.volume = 0.12; }
    }

    console.log('[helpers] preload results', {
      inhaleCue: !!audioBuffers.inhaleCue || !!htmlAudio.inhaleEl,
      exhaleCue: !!audioBuffers.exhaleCue || !!htmlAudio.exhaleEl,
      breath: !!audioBuffers.breath || !!htmlAudio.breathUrl,
      ambient: !!audioBuffers.ambient || !!htmlAudio.ambientEl
    });
  }

  // Play inhale/exhale with robust fallbacks
  async function playInhaleCue() {
    await preloadAll();
    // prefer pre-recorded cue
    if (audioBuffers.inhaleCue) { if (scheduleBufferPlay(audioBuffers.inhaleCue, 0, audioBuffers.inhaleCue.duration || inhaleDurationSeconds)) return; }
    if (htmlAudio.inhaleEl) { if (playHtmlUrl(htmlAudio.inhaleEl.src, 0, inhaleDurationSeconds)) return; }
    // full breath segment fallback
    if (audioBuffers.breath) { if (scheduleBufferPlay(audioBuffers.breath, inhaleOffsetSeconds, inhaleDurationSeconds)) return; }
    if (htmlAudio.breathUrl) { if (playHtmlUrl(htmlAudio.breathUrl, inhaleOffsetSeconds, inhaleDurationSeconds)) return; }
    console.log('[helpers] no inhale available');
  }
  async function playExhaleCue() {
    await preloadAll();
    if (audioBuffers.exhaleCue) { if (scheduleBufferPlay(audioBuffers.exhaleCue, 0, audioBuffers.exhaleCue.duration || exhaleDurationSeconds)) return; }
    if (htmlAudio.exhaleEl) { if (playHtmlUrl(htmlAudio.exhaleEl.src, 0, exhaleDurationSeconds)) return; }
    if (audioBuffers.breath) { if (scheduleBufferPlay(audioBuffers.breath, exhaleOffsetSeconds, exhaleDurationSeconds)) return; }
    if (htmlAudio.breathUrl) { if (playHtmlUrl(htmlAudio.breathUrl, exhaleOffsetSeconds, exhaleDurationSeconds)) return; }
    console.log('[helpers] no exhale available');
  }

  // TTS helpers: load voices reliably and pick a Spanish voice (manual call from UI)
  function loadVoicesOnce() {
    return new Promise((resolve) => {
      const vs = speechSynthesis.getVoices();
      if (vs && vs.length) { voicesList = vs; voicesReady = true; resolve(vs); return; }
      // voices may load asynchronously
      const onVoices = () => {
        voicesList = speechSynthesis.getVoices() || [];
        voicesReady = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        resolve(voicesList);
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      // trigger
      setTimeout(() => { voicesList = speechSynthesis.getVoices() || []; if (voicesList.length) { voicesReady = true; resolve(voicesList); } }, 700);
    });
  }
  function pickSpanishVoice() {
    if (!voicesReady) return null;
    const prefer = voicesList.find(v => /^es(-|_)/i.test(v.lang) && /Google|Microsoft|Lucia|Luc[íi]a|Sofia/i.test(v.name));
    if (prefer) return prefer;
    return voicesList.find(v => /^es/i.test(v.lang)) || voicesList[0] || null;
  }
  async function playTTS(text) {
    if (!('speechSynthesis' in window)) { alert('TTS no disponible en este navegador'); return; }
    try {
      await loadVoicesOnce();
      const voice = pickSpanishVoice();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'es-ES';
      u.rate = 1; u.pitch = 1;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      console.log('[helpers] TTS speak', text);
    } catch (e) { console.warn('[helpers] TTS error', e); }
  }

  // Guided breathing overlay (keeps ambient until user stops)
  async function startBreathFlow() {
    // ensure resume on user gesture; Android needs it
    await ensureAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); console.log('[helpers] audioCtx resumed'); } catch(e) { console.warn(e); }
    }
    await preloadAll();

    // overlay
    const overlay = document.createElement('div'); overlay.id = 'lr-breath-overlay';
    Object.assign(overlay.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:12050 });
    const container = document.createElement('div'); Object.assign(container.style, { display:'flex', flexDirection:'column', alignItems:'center', gap:'12px' });
    const circle = document.createElement('div'); Object.assign(circle.style, { width:'220px', height:'220px', borderRadius:'50%', background:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'28px', fontWeight:700, boxShadow:'0 8px 30px rgba(0,0,0,0.4)' });
    const small = document.createElement('div'); Object.assign(small.style, { color:'rgba(255,255,255,0.95)', fontSize:'18px', textAlign:'center' });
    container.appendChild(circle); container.appendChild(small); overlay.appendChild(container); document.body.appendChild(overlay);

    // start ambient (persist)
    if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient);
    else if (htmlAudio.ambientEl) startAmbientLoop(null, htmlAudio.ambientEl.src);

    const steps = [
      { label: 'Inhala', action: playInhaleCue, duration: inhaleDurationSeconds },
      { label: 'Sostén', action: null, duration: 4.0 },
      { label: 'Exhala', action: playExhaleCue, duration: exhaleDurationSeconds },
      { label: 'Sostén', action: null, duration: 1.0 }
    ];

    let idx = 0, timeoutId = null, running = true;
    async function loopStep() {
      if (!running) return;
      const s = steps[idx];
      circle.textContent = s.label;
      small.textContent = s.label + (s.duration ? ` · ${Math.round(s.duration)}s` : '');
      if (s.action) {
        try { await s.action(); } catch(e){ console.warn('[helpers] action error', e); }
      }
      try {
        const scaleFrom = s.label === 'Exhala' ? 1 : 0.6;
        const scaleTo = s.label === 'Exhala' ? 0.6 : 1.0;
        circle.animate([{ transform:`scale(${scaleFrom})`, opacity:0.75 }, { transform:`scale(${scaleTo})`, opacity:1 }], { duration: s.duration * 1000, easing:'ease-in-out', fill:'forwards' });
      } catch(e) { circle.style.transition = `transform ${s.duration}s ease-in-out`; circle.style.transform = `scale(${scaleTo})`; }
      timeoutId = setTimeout(() => { idx = (idx + 1) % steps.length; loopStep(); }, Math.round(s.duration * 1000));
    }
    loopStep();

    overlay._stop = () => { running = false; if (timeoutId) clearTimeout(timeoutId); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); console.log('[helpers] overlay stopped'); };
    overlay.addEventListener('click', (e) => { e.stopPropagation(); overlay._stop && overlay._stop(); });
    window._lastBreathOverlay = overlay;
  }

  // Favorites management and UI modal
  function getFavoritos() {
    try { return JSON.parse(localStorage.getItem(KEY_FAVORITOS) || '[]'); } catch(e){ return []; }
  }
  function saveFavoritos(arr) {
    try { localStorage.setItem(KEY_FAVORITOS, JSON.stringify(arr)); } catch(e){}
  }
  function toggleFavorite(text) {
    if (!text) return;
    const favs = getFavoritos();
    if (favs.includes(text)) {
      const next = favs.filter(f => f !== text); saveFavoritos(next);
      return false;
    } else { favs.unshift(text); saveFavoritos(favs.slice(0,200)); return true; }
  }
  function showFavoritesModal() {
    const favs = getFavoritos();
    const modal = document.getElementById('_lr_fav_modal') || document.createElement('div');
    modal.id = '_lr_fav_modal';
    Object.assign(modal.style, { position:'fixed', left:0, right:0, top:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:13000 });
    const box = document.createElement('div');
    Object.assign(box.style, { maxWidth:'720px', width:'92%', maxHeight:'70vh', overflow:'auto', background:'rgba(255,255,255,0.03)', color:'#fff', padding:'18px', borderRadius:'12px' });
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>Favoritos</strong><button id="_lr_close_fav" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.06);padding:6px;border-radius:8px">Cerrar</button></div><hr style="opacity:.08;margin:8px 0">` + (favs.length ? favs.map(f => `<div style="margin:10px 0;line-height:1.3">${escapeHtml(f)}</div>`).join('') : '<div style="color:rgba(255,255,255,0.8)">No hay favoritos</div>');
    modal.innerHTML = ''; modal.appendChild(box);
    document.body.appendChild(modal);
    document.getElementById('_lr_close_fav').addEventListener('click', () => { modal.parentNode && modal.parentNode.removeChild(modal); });
  }
  function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Small UI helpers for menu interactions (close menu after action)
  function closeMenuPanel() {
    const panel = document.getElementById('menuPanel');
    if (panel && panel.style.display === 'flex') {
      panel.style.display = 'none';
      document.getElementById('menuToggle')?.setAttribute('aria-expanded', 'false');
    }
  }

  // Public API
  window.lr_helpers = {
    preloadAll,
    resumeAudio: async () => { const ctx = await ensureAudioContext(); if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); console.log('[helpers] resumed'); } catch(e){ console.warn(e);} } return audioCtx ? audioCtx.state : 'no-audioctx'; },
    playInhale: playInhaleCue,
    playExhale: playExhaleCue,
    startBreathFlow,
    startAmbient: async () => { await preloadAll(); if (audioBuffers.ambient) startAmbientLoop(audioBuffers.ambient); else if (htmlAudio.ambientEl) htmlAudio.ambientEl.play().catch(()=>{}); },
    stopAmbient: stopAmbientLoop,
    playTTS,
    dumpState: () => ({ audioCtxState: audioCtx ? audioCtx.state : 'no-audioctx', buffers: { inhaleCue: !!audioBuffers.inhaleCue, exhaleCue: !!audioBuffers.exhaleCue, breath: !!audioBuffers.breath, ambient: !!audioBuffers.ambient }, html: { inhale: !!htmlAudio.inhaleEl, exhale: !!htmlAudio.exhaleEl, ambient: !!htmlAudio.ambientEl }, ttsEnabled }),
    setOffsets: (a,b,c,d) => { inhaleOffsetSeconds = Number(a)||inhaleOffsetSeconds; inhaleDurationSeconds = Number(b)||inhaleDurationSeconds; exhaleOffsetSeconds = Number(c)||exhaleOffsetSeconds; exhaleDurationSeconds = Number(d)||exhaleDurationSeconds; console.log('[helpers] offsets', { inhaleOffsetSeconds, inhaleDurationSeconds, exhaleOffsetSeconds, exhaleDurationSeconds }); },
    toggleFavorite: (text) => toggleFavorite(text),
    showFavorites: () => showFavoritesModal(),
    enableTTS: (v) => { ttsEnabled = !!v; console.log('[helpers] TTS allowed =', ttsEnabled); }
  };

  // Auto preload once (non-blocking)
  preloadAll().catch(e => console.warn('[helpers] preload error', e));

  // Attach a few listeners to menu to ensure close behavior & favorites
  document.addEventListener('DOMContentLoaded', () => {
    // menu delegations
    document.getElementById('menuPanel')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      // close after clicking any item (except maybe keep open for some advanced actions)
      setTimeout(closeMenuPanel, 80);
    });
    // hook favorites menu id
    const favMenu = document.getElementById('favBtn_menu') || document.getElementById('favBtn');
    favMenu?.addEventListener('click', () => {
      const current = document.getElementById('frase')?.textContent || '';
      if (!current) return;
      const added = toggleFavorite(current);
      favMenu.textContent = added ? '♥ Favorita' : '♡ Favorita';
    });
    const showFavBtn = document.getElementById('showFavoritesBtn');
    showFavBtn?.addEventListener('click', () => { showFavoritesModal(); });
    // TTS menu
    document.getElementById('ttsBtn_menu')?.addEventListener('click', () => {
      const text = document.getElementById('frase')?.textContent || '';
      if (!text) return;
      // ensure voices loaded via user gesture
      window.lr_helpers && window.lr_helpers.playTTS && window.lr_helpers.playTTS(text);
    });

    // ensure enableAudio button tries resume
    document.getElementById('enableAudioBtn')?.addEventListener('click', async () => {
      await window.lr_helpers.resumeAudio();
      alert('Intentado activar audio. Si Android sigue sin reproducir, pulsa Respirar o recarga la página.');
    });
  });
})();
