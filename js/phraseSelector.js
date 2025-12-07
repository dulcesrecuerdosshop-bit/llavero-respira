// phraseSelector.js
// Selector inteligente que elige categoría + frase basado en el estado del usuario.
// Usa window.ClientPhrases y persiste cambios en localStorage (no toca archivos en /users/* en runtime).
// Public API: window.PhraseSelector.selectAndMark(clientObj)
//   - clientObj: objeto con campos emocionales (puede ser window.CLIENT_USER).
//   - devuelve { category, phrase, updatedClient }

(function(){
  'use strict';
  window.PhraseSelector = (function(){
    const STORAGE_KEY = 'lr_client_runtime'; // fallback persistence

    function isSameDay(isoA, isoB) {
      if (!isoA || !isoB) return false;
      try {
        const a = new Date(isoA), b = new Date(isoB);
        return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
      } catch(e){ return false; }
    }

    function chooseCategory(client) {
      // safe read
      const nivel = Number(client.nivelDeAnsiedad || 0);
      const racha = Number(client.rachaDeLectura || 0);
      const estado = client.estadoEmocionalActual || 'neutral';
      // first visit of the day -> bienvenida
      const nowISO = (new Date()).toISOString();
      if (!client.ultimaFechaMostrado || !isSameDay(client.ultimaFechaMostrado, nowISO)) {
        return 'bienvenida';
      }
      if (nivel >= 4) return 'crisis';
      if (nivel >= 2) {
        // alternate between calma and validacion
        return (Math.random() < 0.5) ? 'calma' : 'validacion';
      }
      if (racha >= 3) return 'profundo';
      if (estado === 'neutral') return 'rutina';
      return 'motivacion';
    }

    function avoidRepeat(client, category) {
      if (client.ultimaCategoriaMostrada && client.ultimaCategoriaMostrada === category) {
        const order = ['rutina','calma','validacion','motivacion','anclaje','profundo'];
        for (let i=0;i<order.length;i++){
          if (order[i] !== category) return order[i];
        }
      }
      return category;
    }

    function persistRuntime(client) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(client));
      } catch(e){}
    }

    function selectAndMark(client){
      const c = Object.assign({}, client || {});
      const nowISO = (new Date()).toISOString();
      let category = chooseCategory(c);
      category = avoidRepeat(c, category);

      // pick phrase via ClientPhrases
      const phrase = window.ClientPhrases && window.ClientPhrases.random(category) ? window.ClientPhrases.random(category) : 'Un breve recordatorio para ti.';

      // update metadata but DO NOT auto-start breathing
      c.ultimaCategoriaMostrada = category;
      c.ultimaFechaMostrado = nowISO;
      c.rachaDeLectura = (Number(c.rachaDeLectura||0) + 1);

      persistRuntime(c);

      const res = { category, phrase, updatedClient: c };

const CATEGORY_TO_PRESET = { 'crisis': '478', 'calma': 'calm', 'validacion': 'calm', 'motivacion': 'box', 'anclaje': 'box', 'bienvenida': 'box', 'rutina': 'box', 'profundo': 'slow' };

if (res && res.updatedClient) { const cat = res.category; if (cat && CATEGORY_TO_PRESET[cat]) { res.updatedClient.suggestedBreathingType = CATEGORY_TO_PRESET[cat]; res.updatedClient.ultimaCategoriaMostrada = cat; } }

      return res;
    }

    return { selectAndMark };
  })();
})();
