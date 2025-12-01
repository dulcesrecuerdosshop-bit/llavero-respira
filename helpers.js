// helpers.js - versión robusta y con logs para Llavero Respira
// Inicializa en DOMContentLoaded y expone helpers de prueba en window.lr_helpers
(function () {
  console.log('[helpers] cargando helpers.js');

  // Inicializar cuando el DOM esté listo
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[helpers] DOMContentLoaded - inicializando UI helpers');

    const fraseEl = document.getElementById('frase');
    const favBtn = document.getElementById('favBtn');
    const shareBtn = document.getElementById('shareBtn');
    const copyBtn = document.getElementById('copyBtn');
    const ttsBtn = document.getElementById('ttsBtn');
    const breathBtn = document.getElementById('breathBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const historialEl = document.getElementById('historial');

    const KEY_FAVORITOS = 'lr_favoritos_v1';
    const KEY_HISTORIAL = 'lr_historial_v1';

    function getFavoritos(){ try { return JSON.parse(localStorage.getItem(KEY_FAVORITOS) || '[]'); } catch(e){ console.warn('[helpers] error leyendo favoritos', e); return []; } }
    function saveFavoritos(arr){ try { localStorage.setItem(KEY_FAVORITOS, JSON.stringify(arr)); } catch(e){ console.warn('[helpers] error guardando favoritos', e); } }

    function addHistorial(text){
      try {
        const h = JSON.parse(localStorage.getItem(KEY_HISTORIAL) || '[]');
        h.unshift({ text, at: Date.now() });
        localStorage.setItem(KEY_HISTORIAL, JSON.stringify(h.slice(0, 20)));
        renderHistorial();
      } catch(e){ console.warn('[helpers] error historial', e); }
    }
    function renderHistorial(){
      try {
        if (!historialEl) return;
        const h = JSON.parse(localStorage.getItem(KEY_HISTORIAL) || '[]');
        historialEl.innerHTML = h.length ? (h.map(i=> `<span style="display:inline-block;margin:6px;padding:6px 10px;background:rgba(255,255,255,0.08);border-radius:12px;">${escapeHtml(i.text)}</span>`).join('')) : '';
      } catch(e){ console.warn('[helpers] renderHistorial error', e); }
    }
    function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function attachSafe(el, event, fn){
      if (!el) { console.warn('[helpers] elemento no encontrado para listener:', event); return; }
      try { el.addEventListener(event, fn); console.log(`[helpers] listener ${event} agregado a`, el.id); } 
      catch(e){ console.warn('[helpers] no se pudo agregar listener', e); }
    }

    // Favorito
    attachSafe(favBtn, 'click', () => {
      try {
        const text = (fraseEl && fraseEl.textContent.trim()) || '';
        if (!text) return;
        let favs = getFavoritos();
        if (favs.includes(text)) {
          favs = favs.filter(f => f !== text);
          favBtn.textContent = '♡ Favorita';
        } else {
          favs.unshift(text);
          favBtn.textContent = '♥ Favorita';
        }
        saveFavoritos(favs.slice(0,50));
        console.log('[helpers] favoritos actualizados', favs.length);
      } catch(e){ console.warn('[helpers] error en favorito', e); }
    });

    // Compartir
    attachSafe(shareBtn, 'click', async () => {
      try {
        const text = (fraseEl && fraseEl.textContent.trim()) || '';
        const shareData = { title: 'Frase motivacional', text, url: location.href };
        if (navigator.share) {
          await navigator.share(shareData);
          console.log('[helpers] share exitoso');
        } else {
          copyToClipboard(`${text}\n${location.href}`);
          alert('Frase copiada. Pega para compartir.');
        }
      } catch(e){ console.warn('[helpers] share error', e); }
    });

    // Copiar
    attachSafe(copyBtn, 'click', () => {
      try {
        const text = (fraseEl && fraseEl.textContent.trim()) || '';
        copyToClipboard(text);
        if (copyBtn) {
          const old = copyBtn.textContent;
          copyBtn.textContent = '✅ Copiado';
          setTimeout(()=> { if (copyBtn) copyBtn.textContent = old; }, 1200);
        }
      } catch(e){ console.warn('[helpers] copy error', e); }
    });
    function copyToClipboard(text){
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(err => console.warn('[helpers] clipboard write failed', err));
      }
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.left='-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch(e){ console.warn('[helpers] execCommand copy failed', e); }
      document.body.removeChild(ta);
    }

    // Text-to-Speech
    attachSafe(ttsBtn, 'click', () => {
      try {
        const text = (fraseEl && fraseEl.textContent.trim()) || '';
        if (!('speechSynthesis' in window)) { alert('Text-to-speech no soportado en este navegador.'); return; }
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'es-ES';
        u.rate = 1;
        speechSynthesis.speak(u);
      } catch(e){ console.warn('[helpers] tts error', e); }
    });

    // Respiración guiada
    let breathing = false;
    attachSafe(breathBtn, 'click', () => {
      try {
        if (breathing) { stopBreath(); return; }
        startBreath();
      } catch(e){ console.warn('[helpers] breath click error', e); }
    });

    function startBreath(){
      breathing = true;
      if (breathBtn) breathBtn.textContent = '⏸️ Parar';
      const circle = document.createElement('div');
      circle.id = 'breathCircle';
      Object.assign(circle.style, {
        position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
        width:'120px', height:'120px', borderRadius:'50%', zIndex:9999, background:'rgba(255,255,255,0.10)',
        display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'1.1em'
      });
      document.body.appendChild(circle);
      let phase = 0;
      const steps = [4000,4000,4000,1000];
      function loop(){
        if (!breathing) return;
        const dur = steps[phase];
        circle.animate([{transform:'scale(0.6)', opacity:0.6},{transform:'scale(1)', opacity:1}], {duration:dur, fill:'forwards'});
        circle.textContent = phase===0? 'Inhala' : phase===1? 'Sostén' : phase===2? 'Exhala' : 'Sostén';
        setTimeout(()=> {
          phase = (phase+1)%4;
          loop();
        }, dur);
      }
      loop();
      circle._remove = ()=>{ circle.remove(); };
    }
    function stopBreath(){ breathing = false; if (breathBtn) breathBtn.textContent = '🌬️ Respirar'; const c = document.getElementById('breathCircle'); if (c) c._remove(); }

    // Descargar imagen (html2canvas requerido)
    attachSafe(downloadBtn, 'click', async () => {
      try {
        if (window.html2canvas) {
          const node = document.querySelector('body');
          const canvas = await html2canvas(node, {backgroundColor:null, scale:1});
          const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'frase.png'; a.click();
        } else {
          alert('Función no disponible. Recarga la página e intenta de nuevo.');
        }
      } catch(e){ console.warn('[helpers] download error', e); alert('Error al generar imagen'); }
    });

    // Función pública llamada desde index.js cada vez que aparece una frase
    window.onFraseMostrada = function(text){
      try {
        addHistorial(text);
        const favs = getFavoritos();
        if (favBtn) favBtn.textContent = favs.includes(text) ? '♥ Favorita' : '♡ Favorita';
      } catch(e){ console.warn('[helpers] onFraseMostrada error', e); }
    };

    // Funciones de test expuestas en window para debug
    window.lr_helpers = {
      testClickFav: () => favBtn && favBtn.click(),
      testShare: () => shareBtn && shareBtn.click(),
      testCopy: () => copyBtn && copyBtn.click(),
      testTTS: () => ttsBtn && ttsBtn.click(),
      dumpState: () => ({ favoritos: getFavoritos(), historial: JSON.parse(localStorage.getItem(KEY_HISTORIAL)||'[]') })
    };

    // Inicializar UI
    renderHistorial();
    console.log('[helpers] inicialización completa');
  }); // DOMContentLoaded
})();
