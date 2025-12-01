// helpers.js - funciones: favoritos, historial, compartir, copiar, TTS, respiración, descarga
(function () {
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

  function getFavoritos(){ return JSON.parse(localStorage.getItem(KEY_FAVORITOS) || '[]'); }
  function saveFavoritos(arr){ localStorage.setItem(KEY_FAVORITOS, JSON.stringify(arr)); }

  function addHistorial(text){
    const h = JSON.parse(localStorage.getItem(KEY_HISTORIAL) || '[]');
    h.unshift({ text, at: Date.now() });
    localStorage.setItem(KEY_HISTORIAL, JSON.stringify(h.slice(0, 20)));
    renderHistorial();
  }
  function renderHistorial(){
    const h = JSON.parse(localStorage.getItem(KEY_HISTORIAL) || '[]');
    if (!historialEl) return;
    historialEl.innerHTML = h.length ? (h.map(i=> `<span style="display:inline-block;margin:6px;padding:6px 10px;background:rgba(255,255,255,0.08);border-radius:12px;">${escapeHtml(i.text)}</span>`).join('')) : '';
  }
  function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Favorito
  if (favBtn) favBtn.addEventListener('click', () => {
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

  // Compartir
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    const text = fraseEl.textContent.trim();
    const shareData = { title: 'Frase motivacional', text, url: location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (err) { console.log('share cancel', err); }
    } else {
      copyToClipboard(`${text}\n${location.href}`);
      alert('Frase copiada. Pega para compartir.');
    }
  });

  // Copiar
  if (copyBtn) copyBtn.addEventListener('click', () => {
    copyToClipboard(fraseEl.textContent.trim());
    copyBtn.textContent = '✅ Copiado';
    setTimeout(()=> copyBtn.textContent = '📋 Copiar', 1200);
  });
  function copyToClipboard(text){
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch(e){ console.warn(e); } document.body.removeChild(ta);
  }

  // Text-to-Speech
  if (ttsBtn) ttsBtn.addEventListener('click', () => {
    const text = fraseEl.textContent.trim();
    if (!('speechSynthesis' in window)) { alert('Text-to-speech no soportado en este navegador.'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    u.rate = 1;
    speechSynthesis.speak(u);
  });

  // Respiración guiada (ciclo)
  let breathing = false;
  if (breathBtn) breathBtn.addEventListener('click', () => {
    if (breathing) { stopBreath(); return; }
    startBreath();
  });
  function startBreath(){
    breathing = true;
    breathBtn.textContent = '⏸️ Parar';
    const circle = document.createElement('div');
    circle.id = 'breathCircle';
    Object.assign(circle.style, {
      position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
      width:'120px', height:'120px', borderRadius:'50%', zIndex:9999, background:'rgba(255,255,255,0.10)',
      display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'1.1em'
    });
    document.body.appendChild(circle);
    let phase = 0; // inhale, hold, exhale, hold
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
  function stopBreath(){ breathing = false; breathBtn.textContent = '🌬️ Respirar'; const c = document.getElementById('breathCircle'); if (c) c._remove(); }

  // Descargar imagen (html2canvas requerido)
  if (downloadBtn) downloadBtn.addEventListener('click', async () => {
    const text = fraseEl.textContent.trim();
    if (window.html2canvas) {
      const node = document.querySelector('body');
      try {
        const canvas = await html2canvas(node, {backgroundColor:null, scale:1});
        const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'frase.png'; a.click();
      } catch(e){ alert('Error al generar imagen'); }
    } else {
      alert('Función no disponible. Recarga la página e intenta de nuevo.');
    }
  });

  // Función pública llamada desde index.js cada vez que aparece una frase
  window.onFraseMostrada = function(text){
    addHistorial(text);
    const favs = getFavoritos();
    if (favBtn) favBtn.textContent = favs.includes(text) ? '♥ Favorita' : '♡ Favorita';
  };

  // Inicializar UI
  renderHistorial();
})();
