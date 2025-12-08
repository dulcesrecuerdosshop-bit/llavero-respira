// Breath overlay module - creates a full-screen solid overlay for breathing phases
// Exposes window.BreathOverlay with init(options), showPhase(type, seconds), hide()
// Vanilla JS, no frameworks. Uses CSS in css/breath-overlay.css (must be included).

(function () {
  'use strict';

  const DEFAULT_COLORS = { inhale: "#6BCB77", exhale: "#FF6B6B", hold: "#4D96FF" };

  let state = {
    inited: false,
    container: null,
    username: '',
    colors: DEFAULT_COLORS,
    overlay: null,
    circle: null,
    phaseEl: null,
    countdownEl: null,
    countdownTimer: null,
    remaining: 0
  };

  function createDOM(container) {
    if (state.overlay) return state.overlay;
    const o = document.createElement('div');
    o.id = 'breath-overlay';
    o.className = 'hidden';
    o.setAttribute('aria-hidden', 'true');

    const circle = document.createElement('div');
    circle.className = 'breath-circle';
    o.appendChild(circle);

    const phase = document.createElement('div');
    phase.className = 'breath-phase';
    o.appendChild(phase);

    const countdown = document.createElement('div');
    countdown.className = 'breath-countdown';
    o.appendChild(countdown);

    container.appendChild(o);

    state.overlay = o;
    state.circle = circle;
    state.phaseEl = phase;
    state.countdownEl = countdown;

    return o;
  }

  function clearCountdown() {
    try {
      if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
      }
    } catch (e) {}
  }

  function formatSeconds(s) {
    try {
      s = Math.max(0, Math.floor(s));
      return String(s);
    } catch (e) { return String(s); }
  }

  function applyPhaseVisual(type) {
    if (!state.overlay) return;
    const colors = state.colors || DEFAULT_COLORS;
    let color = colors[type] || DEFAULT_COLORS.inhale;
    try {
      state.overlay.style.background = color;
    } catch (e) {}

    try {
      state.circle.classList.remove('phase-inhale', 'phase-exhale', 'phase-hold');
      if (type === 'inhale') state.circle.classList.add('phase-inhale');
      else if (type === 'exhale') state.circle.classList.add('phase-exhale');
      else state.circle.classList.add('phase-hold');
    } catch (e) {}
  }

  function updatePhaseText(type) {
    const name = (state.username || '').trim();
    let verb = '';
    if (type === 'inhale') verb = 'inhala';
    else if (type === 'exhale') verb = 'exhala';
    else verb = 'sostén';
    const title = name ? `${name}, ${verb}` : `${verb.charAt(0).toUpperCase() + verb.slice(1)}`;
    try { state.phaseEl.textContent = title; } catch (e) {}
  }

  function startCountdown(seconds) {
    try {
      clearCountdown();
      state.remaining = Math.max(0, Math.floor(Number(seconds) || 0));
      if (!state.countdownEl) return;
      state.countdownEl.textContent = formatSeconds(state.remaining);

      state.countdownTimer = setInterval(function () {
        try {
          state.remaining = Math.max(0, state.remaining - 1);
          state.countdownEl.textContent = formatSeconds(state.remaining);
          if (state.remaining <= 0) {
            clearCountdown();
          }
        } catch (e) {}
      }, 1000);
    } catch (e) { console.warn('BreathOverlay countdown error', e); }
  }

  // Public API
  window.BreathOverlay = window.BreathOverlay || {
    init: function (options) {
      try {
        options = options || {};
        const container = options.container instanceof Element ? options.container : document.body;
        state.container = container;
        state.username = options.username || '';
        state.colors = Object.assign({}, DEFAULT_COLORS, options.colors || {});
        createDOM(container);
        state.overlay.classList.add('hidden');
        state.overlay.style.display = '';
        state.inited = true;
      } catch (e) { console.warn('BreathOverlay.init error', e); }
    },

    showPhase: function (type, seconds) {
      try {
        if (!state.inited) {
          this.init({ username: '', container: document.body, colors: DEFAULT_COLORS });
        }
        if (!state.overlay) createDOM(document.body);
        state.overlay.classList.remove('hidden');
        state.overlay.setAttribute('aria-hidden', 'false');

        applyPhaseVisual(type);
        updatePhaseText(type);
        startCountdown(seconds || 0);
      } catch (e) { console.warn('BreathOverlay.showPhase error', e); }
    },

    hide: function () {
      try {
        if (!state.overlay) return;
        state.overlay.classList.add('hidden');
        state.overlay.setAttribute('aria-hidden', 'true');
        clearCountdown();
        try { state.circle.classList.remove('phase-inhale', 'phase-exhale', 'phase-hold'); } catch (e) {}
      } catch (e) { console.warn('BreathOverlay.hide error', e); }
    }
  };

})();
