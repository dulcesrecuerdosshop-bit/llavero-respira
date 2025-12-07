// respiracionInteligente.js
// Respiration engine (vanilla JS). No UI. Mapping internal presets, playback control, animation callback.
// Public API: window.RespiracionInteligente.createSession({ suggestedType, duration, onTick, onFinish, onRender })

(function(){
  'use strict';
  window.RespiracionInteligente = (function(){
    // internal presets mapping (private)
    const PRESET_MAP = {
      suave: { name: 'suave', pattern: 'box', inhale:4, hold:4, exhale:4 },
      profunda: { name: 'profunda', pattern: '4-7-8', inhale:4, hold:7, exhale:8 },
      hotfix: { name: 'hotfix', pattern: 'box-extended', inhale:4, hold:4, exhale:4, hold2:4 },
      rutina: { name: 'rutina', pattern: 'box', inhale:4, hold:4, exhale:4 }
    };

    function choosePreset(type) {
      if (!type) return PRESET_MAP.rutina;
      return PRESET_MAP[type] || PRESET_MAP.rutina;
    }

    function createSession(opts) {
      opts = opts || {};
      const suggestedType = opts.suggestedType || null;
      let duration = Number(opts.duration) || 1;
      if (![1,3,5].includes(duration)) duration = 1;
      const onTick = typeof opts.onTick === 'function' ? opts.onTick : function(){};
      const onFinish = typeof opts.onFinish === 'function' ? opts.onFinish : function(){};
      const onRender = typeof opts.onRender === 'function' ? opts.onRender : function(){};

      const preset = choosePreset(suggestedType);

      let running = false;
      let secondsLeft = duration * 60;
      let intervalId = null;
      let audioCtx = null;
      let toneOsc = null;

      function tick() {
        secondsLeft--;
        onTick(Math.max(0, secondsLeft));
        if (secondsLeft <= 0) {
          stop(true);
        }
      }

      function start() {
        if (running) return;
        running = true;
        secondsLeft = duration * 60;
        onRender({ preset, duration }); // UI can render animation based on preset
        // start audio simple beep or ambient (best-effort; audio assets optional)
        try {
          if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          }
          // optional gentle bass tone as placeholder
          toneOsc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          toneOsc.type = 'sine';
          toneOsc.frequency.setValueAtTime(220, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
          gain.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + 0.2);
          toneOsc.connect(gain);
          gain.connect(audioCtx.destination);
          toneOsc.start();
        } catch(e){}
        intervalId = setInterval(tick, 1000);
      }

      function stop(finishFlag){
        if (!running) return;
        running = false;
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        try {
          if (toneOsc) { toneOsc.stop(); toneOsc.disconnect(); toneOsc = null; }
          if (audioCtx) { /* keep for reuse */ }
        } catch(e){}
        onFinish(!!finishFlag);
      }

      function getPreview(){ return { preset, duration, secondsLeft, running }; }

      return { start, stop, getPreview, preset };
    }

    return { createSession };
  })();
})();
