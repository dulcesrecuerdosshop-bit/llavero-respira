// frase-controls-fix-tts.js
// Parche: mejora el comportamiento del clon "Escuchar" para disparar TTS correctamente.
// Pegar en consola para probar. No cambia archivos del repo permanentemente.

(function(){
  'use strict';

  // Helpers
  function findOriginal(id){
    var el = document.getElementById(id);
    if(el) return el;
    var action = id === 'ttsBtn' ? 'tts' : id.replace(/Btn$/,'').toLowerCase();
    return document.querySelector('.frase-controls [data-action="'+action+'"]') || document.querySelector('[data-action="'+action+'"]') || null;
  }
  function findCloneContainer(){
    return document.getElementById('frc-safe-float-final') || document.getElementById('frc-safe-float') || document.getElementById('frc-float-controls-v2') || document.getElementById('frc-float-controls') || document.getElementById('frc-safe-float-v2') || null;
  }
  function findCloneFor(id){
    var c = findCloneContainer();
    if(!c) return null;
    return c.querySelector('[data-frc-clone-for="'+id+'"]') || document.querySelector('[data-frc-clone-for="'+id+'"]') || null;
  }
  function getPhraseText(){
    var selectors = ['#frase-text', '#frase', '.frase-text', '.frase-card .frase-content', '.frase-card p', '.frase-card div', '.frase-card span'];
    for(var i=0;i<selectors.length;i++){
      try {
        var el = document.querySelector(selectors[i]);
        if(el){
          var t = (el.textContent || '').trim();
          if(t && t.length>0) return t;
        }
      } catch(e){}
    }
    // fallback: try to find the biggest text node inside .frase-card
    try {
      var card = document.querySelector('.frase-card') || document.querySelector('#frase-card');
      if(card){
        var candidates = Array.from(card.querySelectorAll('p,div,span')).map(function(n){ return {el:n, len: (n.textContent||'').trim().length}; }).sort(function(a,b){ return b.len - a.len; });
        if(candidates.length && candidates[0].len>10) return (candidates[0].el.textContent||'').trim();
      }
    } catch(e){}
    return '';
  }

  // Try to detect app-provided TTS functions (best-effort)
  function findAppTTSFunctions(){
    var candidates = [];
    var re = /(tts|speak|leer|play|voz|audio|synthesis|synth|mostrarFrase)/i;
    try {
      Object.keys(window).forEach(function(k){
        if(re.test(k) && typeof window[k] === 'function') candidates.push(k);
      });
    } catch(e){}
    // unique and return
    return Array.from(new Set(candidates));
  }

  // SpeechSynthesis fallback
  function speakFallback(text){
    if(!text) return false;
    try {
      if('speechSynthesis' in window){
        var utter = new SpeechSynthesisUtterance(text);
        // prefer Spanish if available
        utter.lang = 'es-ES';
        // small voice options (user can adjust)
        utter.rate = 1;
        utter.pitch = 1;
        window.speechSynthesis.cancel(); // avoid overlapping
        window.speechSynthesis.speak(utter);
        console.log('[frc-tts] fallback: speaking via SpeechSynthesis');
        return true;
      }
    } catch(e){ console.warn('[frc-tts] speech fallback failed', e); }
    return false;
  }

  // Main injector: attach improved handler to the clone for ttsBtn
  function attachTTSFix(){
    var id = 'ttsBtn';
    var orig = findOriginal(id);
    var clone = findCloneFor(id);
    if(!orig && !clone){
      console.warn('[frc-tts] no original nor clone found for ttsBtn');
      return { ok:false, reason: 'no-orig-no-clone' };
    }
    // if no clone, we can attach to original safely
    var target = clone || orig;
    if(!target){
      console.warn('[frc-tts] no target to attach to');
      return { ok:false, reason:'no-target' };
    }

    // avoid double attaching
    if(target._frc_tts_attached) {
      console.log('[frc-tts] handler already attached to', target);
      return { ok:true, note:'already-attached' };
    }

    // attach handler
    var handler = function(e){
      try {
        console.log('[frc-tts] clone clicked -> invoking original click and fallback logic');
        // 1) call original click if exists
        if(orig && orig !== target){
          try { orig.click(); console.log('[frc-tts] orig.click() invoked'); } catch(e){ console.warn('[frc-tts] orig.click() failed', e); }
        } else if(orig && orig === target){
          // original clicked (we are on original)
          try { /* do nothing special */ } catch(_) {}
        }
        // 2) small delay to let app start playback if it will
        setTimeout(function(){
          // if Web Speech API is currently speaking, assume app already playing or user has TTS ongoing
          var isSpeaking = (window.speechSynthesis && window.speechSynthesis.speaking);
          if(isSpeaking){
            console.log('[frc-tts] speechSynthesis reports speaking; skipping fallback');
            return;
          }
          // try to call known app TTS functions
          var funcs = findAppTTSFunctions();
          if(funcs.length){
            console.log('[frc-tts] detected possible app TTS functions:', funcs);
            var phrase = getPhraseText();
            for(var i=0;i<funcs.length;i++){
              try {
                var fn = window[funcs[i]];
                if(typeof fn === 'function'){
                  // try invoking with or without text argument
                  try { fn(phrase); console.log('[frc-tts] called', funcs[i], 'with phrase'); return; } catch(e){
                    try { fn(); console.log('[frc-tts] called', funcs[i], 'without args'); return; } catch(err){ console.warn('[frc-tts] function', funcs[i], 'failed', err); }
                  }
                }
              } catch(e){ console.warn('[frc-tts] calling', funcs[i], 'failed', e); }
            }
          }
          // 3) fallback: Web Speech API
          var phrase = getPhraseText();
          if(phrase){
            speakFallback(phrase);
            return;
          }
          console.warn('[frc-tts] no phrase found to speak and no app TTS available');
        }, 220);
      } catch(e){
        console.error('[frc-tts] handler error', e);
      }
    };

    // Attach to clone (prefer) or original if clone missing
    target.addEventListener('click', handler, { passive: true });
    target._frc_tts_attached = true;
    console.log('[frc-tts] handler attached to', target, 'orig:', orig, 'clone:', clone);

    return { ok:true };
  }

  // idempotent apply: tries a few times (handles dynamic UI)
  var tries = 0;
  function tryAttachWithRetries(){
    var res = attachTTSFix();
    if(res.ok) return res;
    tries++;
    if(tries < 8) {
      setTimeout(tryAttachWithRetries, 250);
      return { ok:false, retrying:true, attempt:tries };
    }
    return { ok:false, reason:'not-found-after-retries' };
  }

  // run
  var result = tryAttachWithRetries();
  console.log('[frc-tts] apply result:', result);

  // expose control for manual re-apply if UI re-renders
  window.FrcTTSFix = window.FrcTTSFix || {};
  window.FrcTTSFix.apply = tryAttachWithRetries;
  window.FrcTTSFix.findDebug = function(){
    return {
      orig: findOriginal('ttsBtn'),
      clone: findCloneFor('ttsBtn'),
      possibleAppTTS: findAppTTSFunctions(),
      currentPhrase: getPhraseText()
    };
  };

})();
