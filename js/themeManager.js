// themeManager.js
// Applies subtle theme variables to :root based on emotional state.
// Use: window.ThemeManager.apply(state) where state.estadoEmocionalActual exists.

(function(){
  'use strict';
  window.ThemeManager = (function(){
    const MAP = {
      calma: { '--bg-tint': '#E9F7F2', '--accent': '#7EC8A6' },
      ansiedad: { '--bg-tint': '#F2F3F5', '--accent': '#A0A0A6' },
      crisis: { '--bg-tint': '#E8EEF5', '--accent': '#7F9CB0' },
      motivacion: { '--bg-tint': '#FBF6EF', '--accent': '#E6C7A8' },
      neutral: { '--bg-tint': '#FFFFFF', '--accent': '#E6EEF0' }
    };

    function apply(clientState, options) {
      options = options || { smooth:true };
      const key = clientState && clientState.estadoEmocionalActual ? clientState.estadoEmocionalActual : 'neutral';
      const vars = MAP[key] || MAP.neutral;
      const el = document.documentElement;
      if (options.smooth) el.style.transition = 'background-color 360ms ease, color 360ms ease';
      Object.keys(vars).forEach(k => el.style.setProperty(k, vars[k]));
      // store current theme in runtime client object if present
      try { if (clientState) clientState.temaVisualActual = key; } catch(e){}
      return vars;
    }

    return { apply };
  })();
})();
