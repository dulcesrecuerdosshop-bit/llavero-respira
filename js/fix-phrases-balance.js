// fix-phrases-balance.js (ajuste para evitar solapamiento con iconos a la derecha)
// - calcula ancho de columna de iconos y actualiza --icon-column-width
// - limpia soft-hyphens y aplica clase para evitar hyphenation
// - reacciona a resize y a cambios DOM

(function(){
  'use strict';
  if(window._frc_fix_phrases_loaded) return;
  window._frc_fix_phrases_loaded = true;

  var SELECTORS = ['#frase-text', '.frase-text'];
  var ICON_CANDIDATE_SELECTORS = [
    '.frase-controls',        // selector común en la app (ajusta si tienes otro)
    '.floating-controls',
    '.controls-right',
    '.floating-actions',
    '.lr-controls',
    '.frc-floating-icons'
  ];

  // busca elementos "flotantes" a la derecha que puedan ser la columna de iconos
  function findRightFloatingElements(){
    var els = [];
    try{
      // primero intenta por selectores conocidos
      ICON_CANDIDATE_SELECTORS.forEach(function(sel){
        try{
          var q = document.querySelectorAll(sel);
          if(q && q.length) Array.prototype.push.apply(els, Array.from(q));
        }catch(e){}
      });
      // si no encuentra ninguno, heurística: buscar elementos fixed/absolute con right >= 8px
      if(els.length === 0){
        var all = Array.from(document.body.querySelectorAll('*'));
        all.forEach(function(el){
          try{
            var cs = window.getComputedStyle(el);
            if(!cs) return;
            var pos = cs.position;
            var right = cs.right;
            var display = cs.display;
            if((pos === 'fixed' || pos === 'absolute') && right && right !== 'auto' && display !== 'none'){
              var rect = el.getBoundingClientRect();
              if(rect.width >= 36 && rect.height >= 36 && rect.right > (window.innerWidth/2)){
                els.push(el);
              }
            }
          }catch(e){}
        });
      }
    }catch(e){}
    return els.filter(function(x){ return x && x.getBoundingClientRect && x.offsetParent !== null; }); // sólo visible
  }

  function computeIconColumnWidth(){
    try{
      var els = findRightFloatingElements();
      if(!els || els.length === 0) return null;
      // si hay varios (stack vertical) tomamos el máximo ancho
      var maxW = 0;
      els.forEach(function(el){
        try {
          var r = el.getBoundingClientRect();
          if(r.width > maxW) maxW = r.width;
        } catch(e){}
      });
      // añado margen de seguridad
      var value = Math.max(48, Math.round(maxW)) + 8; // mínimo 48px + 8px padding
      return value + 'px';
    }catch(e){ return null; }
  }

  function applyIconColumnWidth(){
    try {
      var w = computeIconColumnWidth();
      if(!w) {
        // si no detecta nada, deja el valor por defecto
        return;
      }
      document.documentElement.style.setProperty('--icon-column-width', w);
    } catch(e){}
  }

  function cleanAndApplyClass(n){
    try{
      if(!n) return;
      var original = n.textContent || '';
      var cleaned = original.replace(/[\u00AD\u200B\u200C\u200D]/g,'').replace(/\s+$/,'');
      if(cleaned !== original) n.textContent = cleaned;
      if(n.classList && !n.classList.contains('frc-fix-no-hyphen')) n.classList.add('frc-fix-no-hyphen');
    }catch(e){}
  }

  function forEachPhrase(fn){
    SELECTORS.forEach(function(sel){
      try { Array.from(document.querySelectorAll(sel)).forEach(fn); } catch(e){}
    });
  }

  function refreshAll(){
    try {
      forEachPhrase(cleanAndApplyClass);
      applyIconColumnWidth();
    } catch(e){}
  }

  // init
  setTimeout(refreshAll, 60);

  // observe for changes (app re-render)
  var observer;
  try {
    observer = new MutationObserver(function(muts){
      var need = false;
      muts.forEach(function(m){
        if(m.addedNodes && m.addedNodes.length) need = true;
        if(m.type === 'characterData') need = true;
        if(m.attributeName && (m.attributeName === 'style' || m.attributeName === 'class')) need = true;
      });
      if(need) refreshAll();
    });
    observer.observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true });
  } catch(e){
    // fallback periodic
    setInterval(refreshAll, 1500);
  }

  // resize handler
  var t = null;
  window.addEventListener('resize', function(){ clearTimeout(t); t = setTimeout(refreshAll, 120); }, { passive:true });

  // expuesto para debugging
  window._frc_fix_phrases_refresh = refreshAll;

})();
