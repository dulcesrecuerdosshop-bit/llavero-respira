// fix-phrases-balance.js (corregido)
// - limpieza de soft-hyphens
// - evita hyphenation con clase CSS
// - detecta ancho de columna de iconos y actualiza --icon-column-width
// - detecta color representativo del fondo (gradiente o color) y aplica color de texto
// - re-evalúa en resize y ante cambios del DOM

(function(){
  'use strict';
  if (window._frc_fix_phrases_loaded) return;
  window._frc_fix_phrases_loaded = true;

  var SELECTORS = ['#frase-text', '.frase-text'];
  var ICON_CANDIDATE_SELECTORS = [
    '.frase-controls',
    '.floating-controls',
    '.controls-right',
    '.floating-actions',
    '.lr-controls',
    '.frc-floating-icons'
  ];
  var TARGET_BG_EL = '.frase-card';

  // ---------- Color helpers ----------
  function parseRgbString(s){
    if(!s || typeof s !== 'string') return null;
    var m = s.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)/i);
    if(!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: (m[4] !== undefined ? Number(m[4]) : 1) };
  }
  function parseHex(s){
    if(!s || typeof s !== 'string') return null;
    var m = s.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if(!m) return null;
    var hex = m[1];
    if(hex.length === 3){
      return { r: parseInt(hex[0]+hex[0],16), g: parseInt(hex[1]+hex[1],16), b: parseInt(hex[2]+hex[2],16), a: 1 };
    } else {
      return { r: parseInt(hex.substr(0,2),16), g: parseInt(hex.substr(2,2),16), b: parseInt(hex.substr(4,2),16), a: 1 };
    }
  }
  function luminance(rgb){
    if(!rgb) return 1;
    var srgb = [rgb.r/255, rgb.g/255, rgb.b/255].map(function(c){
      return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
    });
    return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
  }
  function chooseTextColorFromBg(rgb){
    // threshold: si el fondo es oscuro -> blanco, si no -> color oscuro
    var CONTRAST_THRESHOLD = 0.55;
    try {
      var lum = luminance(rgb);
      return lum < CONTRAST_THRESHOLD ? '#ffffff' : '#072b2a';
    } catch(e){
      return '#072b2a';
    }
  }
  function extractColorsFromGradientString(gstr){
    var colors = [];
    if(!gstr || typeof gstr !== 'string') return colors;
    try {
      var hexRe = /#([0-9a-f]{3}|[0-9a-f]{6})/ig;
      var rgbRe = /rgba?\([^\)]+\)/ig;
      var m;
      while((m = hexRe.exec(gstr)) !== null){
        var p = parseHex('#'+m[1]);
        if(p) colors.push(p);
      }
      while((m = rgbRe.exec(gstr)) !== null){
        var p2 = parseRgbString(m[0]);
        if(p2) colors.push(p2);
      }
    } catch(e){}
    return colors;
  }
  function averageColors(a,b){
    if(!a) return b;
    if(!b) return a;
    return { r: Math.round((a.r + b.r)/2), g: Math.round((a.g + b.g)/2), b: Math.round((a.b + b.b)/2), a: 1 };
  }

  function getRepresentativeBgColor(el){
    try {
      if(!el) el = document.querySelector(TARGET_BG_EL) || document.body;
      var cs = window.getComputedStyle(el);
      if(!cs) return null;
      // first try backgroundColor
      var bg = cs.backgroundColor || '';
      var parsed = parseRgbString(bg);
      if(parsed && parsed.a !== 0) return parsed;
      // try backgroundImage (gradient)
      var bi = cs.backgroundImage || '';
      if(bi && bi.indexOf('gradient') !== -1){
        var stops = extractColorsFromGradientString(bi);
        if(stops && stops.length){
          if(stops.length === 1) return stops[0];
          return averageColors(stops[0], stops[1]);
        }
      }
      // climb ancestors to find non-transparent color
      var p = el;
      while(p && p !== document.documentElement){
        try {
          var cs2 = window.getComputedStyle(p);
          if(cs2 && cs2.backgroundColor && cs2.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs2.backgroundColor !== 'transparent'){
            var q = parseRgbString(cs2.backgroundColor);
            if(q) return q;
          }
        } catch(e){}
        p = p.parentElement;
      }
      // fallback to body backgroundColor
      var bodyCs = window.getComputedStyle(document.body);
      var bodyCol = parseRgbString(bodyCs.backgroundColor || '');
      if(bodyCol) return bodyCol;
      return null;
    } catch(e){ return null; }
  }

  function applyFraseColor(cssColor){
    try {
      if(!cssColor) return;
      // set css variable
      try { document.documentElement.style.setProperty('--frase-color', cssColor); } catch(e){}
      // and apply inline color to selectors for immediate effect
      SELECTORS.forEach(function(sel){
        try {
          Array.from(document.querySelectorAll(sel)).forEach(function(n){
            try { if(n && n.style) n.style.color = cssColor; } catch(e){}
          });
        } catch(e){}
      });
    } catch(e){}
  }

  // ---------- Icon column detection ----------
  function findRightFloatingElements(){
    var els = [];
    try{
      ICON_CANDIDATE_SELECTORS.forEach(function(sel){
        try{
          var q = document.querySelectorAll(sel);
          if(q && q.length) Array.prototype.push.apply(els, Array.from(q));
        }catch(e){}
      });
      if(els.length === 0){
        // heuristic scan
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
    // return visible ones
    return els.filter(function(x){ try { return x && x.getBoundingClientRect && x.offsetParent !== null; } catch(e){ return false; } });
  }

  function computeIconColumnWidth(){
    try{
      var els = findRightFloatingElements();
      if(!els || els.length === 0) return null;
      var maxW = 0;
      els.forEach(function(el){
        try {
          var r = el.getBoundingClientRect();
          if(r.width > maxW) maxW = r.width;
        } catch(e){}
      });
      var value = Math.max(48, Math.round(maxW)) + 8;
      return value + 'px';
    }catch(e){ return null; }
  }
  function applyIconColumnWidth(){
    try {
      var w = computeIconColumnWidth();
      if(w) document.documentElement.style.setProperty('--icon-column-width', w);
    } catch(e){}
  }

  // ---------- Cleaning & apply class ----------
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

  // ---------- Main refresh ----------
  function refreshAll(){
    try {
      forEachPhrase(cleanAndApplyClass);
      applyIconColumnWidth();
      // compute bg color representative and apply text color
      var card = document.querySelector(TARGET_BG_EL) || document.body;
      var bgRgb = getRepresentativeBgColor(card);
      var cssColor = '#072b2a';
      if(bgRgb) cssColor = chooseTextColorFromBg(bgRgb);
      applyFraseColor(cssColor);
    } catch(e){ console.warn('[fix-phrases] refreshAll error', e); }
  }

  // init
  setTimeout(refreshAll, 80);

  // observe DOM changes
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
    setInterval(refreshAll, 1500);
  }

  // resize handler
  var t = null;
  window.addEventListener('resize', function(){ clearTimeout(t); t = setTimeout(refreshAll, 160); }, { passive:true });

  // expose for debugging
  window._frc_fix_phrases_refresh = refreshAll;

})();
