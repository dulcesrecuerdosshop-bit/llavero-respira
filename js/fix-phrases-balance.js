// fix-phrases-balance.js (updated)
// - limpia soft-hyphens y caracteres invisibles
// - aplica clase que controla tamaño y ancho
// - detecta colores del fondo (si es color o gradiente con stops) y ajusta el color del texto para buen contraste
// - re-aplica automáticamente si la app re-renderiza la frase
(function(){
  'use strict';
  if (window._frc_fix_phrases_loaded) return;
  window._frc_fix_phrases_loaded = true;

  var SELECTORS = ['#frase-text', '.frase-text'];
  var TARGET_BG_EL = '.frase-card' /* fallback to body if not found */;
  var CONTRAST_THRESHOLD = 0.55; // luminance threshold (0..1), smaller => prefer white text

  // util: clamp
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  // util: parse rgb(a) string "rgb(12,34,56)" or "rgba(12,34,56,0.5)"
  function parseRgbString(s){
    var m = s.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)/i);
    if(!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4]!==undefined ? Number(m[4]) : 1 };
  }
  // util: parse hex "#rrggbb" or "#rgb"
  function parseHex(s){
    var m = s.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if(!m) return null;
    var hex = m[1];
    if(hex.length === 3){
      var r = parseInt(hex[0]+hex[0],16);
      var g = parseInt(hex[1]+hex[1],16);
      var b = parseInt(hex[2]+hex[2],16);
      return { r: r, g: g, b: b, a: 1 };
    } else {
      return { r: parseInt(hex.substr(0,2),16), g: parseInt(hex.substr(2,2),16), b: parseInt(hex.substr(4,2),16), a: 1 };
    }
  }
  // calc relative luminance (0..1)
  function luminance(rgb){
    if(!rgb) return 1;
    var srgb = [rgb.r/255, rgb.g/255, rgb.b/255].map(function(c){
      return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
    });
    return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
  }
  // color -> css string
  function rgbToCss(c){ return 'rgb('+Math.round(c.r)+','+Math.round(c.g)+','+Math.round(c.b)+')'; }
  // choose contrasting text color (#fff or #072b2a) based on luminance
  function chooseTextColorFromBg(rgb){
    var lum = luminance(rgb);
    // if background is dark (lum small) -> white text
    return lum < CONTRAST_THRESHOLD ? '#ffffff' : '#072b2a';
  }

  // try to extract color stops from gradient string (linear-gradient(...))
  function extractColorsFromGradientString(gstr){
    try {
      // find hex colors or rgb(...) occurrences
      var colors = [];
      var hexRe = /#([0-9a-f]{3}|[0-9a-f]{6})/ig;
      var rgbRe = /rgba?\([^\)]+\)/ig;
      var m;
      while((m = hexRe.exec(gstr)) !== null){ var p = parseHex('#'+m[1]); if(p) colors.push(p); }
      while((m = rgbRe.exec(gstr)) !== null){ var p = parseRgbString(m[0]); if(p) colors.push(p); }
      return colors;
    } catch(e){ return []; }
  }

  // get a representative background color RGB object for element: prefer computed backgroundColor if present,
  // otherwise try to parse gradient stops and average first two stops
  function getRepresentativeBgColor(el){
    try {
      if(!el) el = document.body;
      var cs = window.getComputedStyle(el);
      if(!cs) return null;
      var bg = cs.backgroundColor || '';
      if(bg && bg.indexOf('rgba') === 0 || bg.indexOf('rgb') === 0){
        var p = parseRgbString(bg);
        if(p && p.a !== 0) return p;
      }
      // try background-image (gradient)
      var bi = cs.backgroundImage || '';
      if(bi && bi.indexOf('gradient') !== -1){
        var stops = extractColorsFromGradientString(bi);
        if(stops && stops.length){
          // pick first two stops and average
          var a = stops[0];
          if(stops.length === 1) return a;
          var b = stops[1];
          return { r: Math.round((a.r + b.r)/2), g: Math.round((a.g + b.g)/2), b: Math.round((a.b + b.b)/2), a: 1 };
        }
      }
      // fallback: climb parents to find non-transparent bg
      var p = el;
      while(p && p !== document.documentElement){
        var cs2 = window.getComputedStyle(p);
        if(cs2 && cs2.backgroundColor && cs2.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs2.backgroundColor !== 'transparent'){
          var q = parseRgbString(cs2.backgroundColor);
          if(q) return q;
        }
        p = p.parentElement;
      }
      // last resort: use body backgroundColor if available
      var bodyCs = window.getComputedStyle(document.body);
      var bcol = parseRgbString(bodyCs.backgroundColor || '');
      if(bcol) return bcol;
      return null;
    } catch(e){ return null; }
  }

  // apply color variable to phrase element(s)
  function applyFraseColor(cssColor){
    try {
      // set variable on root so CSS uses it
      document.documentElement.style.setProperty('--frase-color', cssColor);
      // and apply directly to elements for immediate effect
      SELECTORS.forEach(function(sel){
        try {
          Array.from(document.querySelectorAll(sel)).forEach(function(n){
            if(n && n.style) n.style.color = cssColor;
          });
        } catch(e){}
      });
    } catch(e){}
  }

  // clean node text and apply class
  function cleanNode(n){
    try {
      if(!n) return;
      var original = n.textContent || '';
      var cleaned = original.replace(/[\u00AD\u200B\u200C\u200D]/g,'').replace(/\s+$/,'');
      if(cleaned !== original) n.textContent = cleaned;
      if(n.classList && !n.classList.contains('frc-fix-no-hyphen')) n.classList.add('frc-fix-no-hyphen');
    } catch(e){
      // ignore
    }
  }

  function forEachPhrase(fn){
    SELECTORS.forEach(function(sel){
      try { Array.from(document.querySelectorAll(sel)).forEach(fn); } catch(e){}
    });
  }

  // main function: clean phrases and compute/apply color based on bg
  function refreshAll(){
    try {
      forEachPhrase(cleanNode);
      // find representative background element (prefer frase-card)
      var card = document.querySelector('.frase-card') || document.querySelector(TARGET_BG_EL) || document.body;
      var bgRgb = getRepresentativeBgColor(card);
      var cssColor;
      if(bgRgb){
        cssColor = chooseTextColorFromBg(bgRgb);
      } else {
        cssColor = '#072b2a';
      }
      applyFraseColor(cssColor);
    } catch(e){ console.warn('[fix-phrases] refreshAll error', e); }
  }

  // initial run
  setTimeout(refreshAll, 80);

  // observer to re-run if app changes DOM
  var observer;
  try {
    observer = new MutationObserver(function(muts){
      var need = false;
      muts.forEach(function(m){
        if(m.addedNodes && m.addedNodes.length) need = true;
        if(m.type === 'characterData') need = true;
      });
      if(need) refreshAll();
    });
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
  } catch(e){
    // fallback: periodic refresh
    setInterval(refreshAll, 1500);
  }

  // re-run on resize
  var t = null;
  window.addEventListener('resize', function(){ clearTimeout(t); t = setTimeout(refreshAll, 120); }, { passive:true });

  // expose for debugging
  window._frc_fix_phrases_refresh = refreshAll;

})();
