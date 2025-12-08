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

    // Ensure full-screen fixed positioning and that CSS rules are applied even if stylesheet is missing
    // pointer-events none so it doesn't block controls; change if you need it interactive
    o.style.position = 'fixed';
    o.style.top = '0';
    o.style.left = '0';
    o.style.right = '0';
    o.style.bottom = '0';
    o.style.width = '100%';
    o.style.height = '100%';
    o.style.display = 'none';
    o.style.alignItems = 'center';
    o.style.justifyContent = 'center';
    o.style.flexDirection = 'column';
    o.style.zIndex = '2147483700'; // ensure above most UI elements
    o.style.pointerEvents = 'none';
    o.style.transition = 'background 400ms ease';
    o.style.boxSizing = 'border-box';

    const circle = document.createElement('div');
    circle.className = 'breath-circle';
    // Circle should not block pointer events (so underlying buttons still clickable)
    circle.style.pointerEvents = 'none';
    o.appendChild(circle);

    const phase = document.createElement('div');
    phase.className = 'breath-phase';
    o.appendChild(phase);

    const countdown = document.createElement('div');
    countdown.className = 'breath-countdown';
    o.appendChild(countdown);

    // Append to container (usually document.body)
    try {
      (container || document.body).appendChild(o);
    } catch (e) {
      try { document.body.appendChild(o); } catch (err) { /* ignore */ }
    }

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
      // solid background as requested (no transparency)
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

  // Defensive helper to stop known suppression mechanisms in the app (if present)
  function stopSuppressionIfAny() {
    try {
      if (typeof window.__stop_hotfix_suppression === 'function') {
        try { window.__stop_hotfix_suppression(); console.debug('[BreathOverlay] __stop_hotfix_suppression called'); } catch(e){ console.debug('[BreathOverlay] stop suppression failed', e); }
      }
    } catch (e) {}
  }

  // JS animation fallback state
  let jsAnimationState = {
    active: false,
    rafId: null,
    startTime: 0,
    phase: '',
    targetScale: 1
  };

  // JS-driven animation fallback for when CSS animations are suppressed
  function startJSAnimationFallback(type) {
    try {
      // Stop any existing animation
      if (jsAnimationState.rafId) {
        cancelAnimationFrame(jsAnimationState.rafId);
        jsAnimationState.rafId = null;
      }

      if (!state.circle) return;

      // Check if CSS animations are working
      const computed = getComputedStyle(state.circle);
      const hasTransform = computed.transform && computed.transform !== 'none';
      const hasAnimation = computed.animationName && computed.animationName !== 'none';

      // If CSS is working for inhale/exhale (transform applied) or hold (animation applied), skip JS fallback
      if (type !== 'hold' && hasTransform) return;
      if (type === 'hold' && hasAnimation) return;

      // CSS animations appear suppressed, use JS fallback
      console.debug('[BreathOverlay] Using JS animation fallback for', type);

      jsAnimationState.phase = type;
      jsAnimationState.startTime = performance.now();
      jsAnimationState.active = true;

      // Set target scale based on phase
      if (type === 'inhale') {
        jsAnimationState.targetScale = 1.18;
        animateToScale(jsAnimationState.targetScale, 500);
      } else if (type === 'exhale') {
        jsAnimationState.targetScale = 0.88;
        animateToScale(jsAnimationState.targetScale, 500);
      } else if (type === 'hold') {
        jsAnimationState.targetScale = 1.02;
        animatePulse();
      }
    } catch (e) {
      console.debug('[BreathOverlay] startJSAnimationFallback error', e);
    }
  }

  // Animate circle to a target scale
  function animateToScale(targetScale, duration) {
    const startTime = performance.now();
    const startScale = getCurrentScale();

    function animate(currentTime) {
      try {
        if (!jsAnimationState.active || !state.circle) return;

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentScale = startScale + (targetScale - startScale) * eased;

        state.circle.style.transform = `scale(${currentScale})`;
        
        // Update box-shadow based on scale
        if (targetScale > 1) {
          state.circle.style.boxShadow = '0 18px 40px rgba(0,0,0,0.18)';
        } else {
          state.circle.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
        }

        if (progress < 1) {
          jsAnimationState.rafId = requestAnimationFrame(animate);
        }
      } catch (e) {}
    }

    jsAnimationState.rafId = requestAnimationFrame(animate);
  }

  // Animate pulsing for hold phase
  function animatePulse() {
    const startTime = performance.now();

    function pulse(currentTime) {
      try {
        if (!jsAnimationState.active || !state.circle || jsAnimationState.phase !== 'hold') return;

        const elapsed = currentTime - startTime;
        const cycleTime = 1200; // ms per cycle
        const progress = (elapsed % cycleTime) / cycleTime;
        
        // Sine wave for smooth pulsing: 1.02 to 1.06 and back
        const scale = 1.02 + 0.04 * Math.sin(progress * Math.PI * 2);
        state.circle.style.transform = `scale(${scale})`;
        state.circle.style.boxShadow = '0 10px 24px rgba(0,0,0,0.15)';

        jsAnimationState.rafId = requestAnimationFrame(pulse);
      } catch (e) {}
    }

    jsAnimationState.rafId = requestAnimationFrame(pulse);
  }

  // Get current scale from transform
  function getCurrentScale() {
    try {
      if (!state.circle) return 1;
      const computed = getComputedStyle(state.circle);
      const transform = computed.transform;
      if (!transform || transform === 'none') return 1;
      
      // Parse matrix(a, b, c, d, e, f) - scale is the 'a' value for uniform scaling
      const match = transform.match(/matrix\(([^,]+)/);
      if (match && match[1]) {
        return parseFloat(match[1]) || 1;
      }
      return 1;
    } catch (e) {
      return 1;
    }
  }

  // Stop JS animation
  function stopJSAnimation() {
    jsAnimationState.active = false;
    if (jsAnimationState.rafId) {
      cancelAnimationFrame(jsAnimationState.rafId);
      jsAnimationState.rafId = null;
    }
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
        // ensure hidden but ready
        try {
          state.overlay.classList.add('hidden');
          state.overlay.style.display = 'none';
          state.overlay.setAttribute('aria-hidden', 'true');
        } catch (e) {}
        state.inited = true;
      } catch (e) { console.warn('BreathOverlay.init error', e); }
    },

    showPhase: function (type, seconds) {
      try {
        // defensive: stop suppression and ensure DOM present
        stopSuppressionIfAny();

        if (!state.inited) {
          this.init({ username: '', container: document.body, colors: DEFAULT_COLORS });
        }
        if (!state.overlay) createDOM(document.body);

        // re-append if removed by observers
        try {
          if (!document.body.contains(state.overlay)) {
            document.body.appendChild(state.overlay);
            console.debug('[BreathOverlay] overlay re-appended to body');
          }
        } catch (e) {}

        // Guarantee positioning & stacking above UI - HARDENED with very high z-index
        try {
          state.overlay.style.position = 'fixed';
          state.overlay.style.top = '0';
          state.overlay.style.left = '0';
          state.overlay.style.right = '0';
          state.overlay.style.bottom = '0';
          state.overlay.style.zIndex = '2147483850';
          // Show flex so CSS rules for children apply
          state.overlay.style.display = 'flex';
          state.overlay.style.pointerEvents = 'none';
          state.overlay.classList.remove('hidden');
          state.overlay.setAttribute('aria-hidden', 'false');
        } catch (e) {}

        applyPhaseVisual(type);
        
        // Force background color inline and reapply with timeouts to resist overrides
        try {
          const colors = state.colors || DEFAULT_COLORS;
          const color = colors[type] || DEFAULT_COLORS.inhale;
          state.overlay.style.background = color;
          // Reapply after short delays to resist rapid CSS overrides
          setTimeout(function(){ try{ state.overlay.style.background = color; }catch(e){} }, 60);
          setTimeout(function(){ try{ state.overlay.style.background = color; }catch(e){} }, 300);
        } catch (e) {}
        
        updatePhaseText(type);
        startCountdown(seconds || 0);
        
        // JS animation fallback - detect if CSS animations are suppressed
        try {
          startJSAnimationFallback(type);
        } catch (e) { console.debug('[BreathOverlay] JS animation fallback error', e); }
      } catch (e) { console.warn('BreathOverlay.showPhase error', e); }
    },

    hide: function () {
      try {
        if (!state.overlay) return;
        // Stop JS animation if running
        stopJSAnimation();
        // hide visually but keep in DOM
        try {
          state.overlay.classList.add('hidden');
          state.overlay.style.display = 'none';
          state.overlay.setAttribute('aria-hidden', 'true');
        } catch (e) {}
        clearCountdown();
        try { state.circle.classList.remove('phase-inhale', 'phase-exhale', 'phase-hold'); } catch (e) {}
      } catch (e) { console.warn('BreathOverlay.hide error', e); }
    }
  };

})();
