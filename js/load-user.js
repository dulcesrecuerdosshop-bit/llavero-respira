// js/load-user.js - carga personalización por id y gestiona modal de bienvenida (gestión segura del foco)
// Versión corregida: asigna window.CLIENT_USER al cargar el usuario y normaliza campos emocionales,
// además deja los helpers runtime ya incluidos al final (saveClientRuntime etc).

(function () {
  'use strict';

  function getIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id && /^[A-Za-z0-9_-]{1,32}$/.test(id)) return id;
    return null;
  }

  async function loadUserData(id) {
    if (!id) return null;
    const url = new URL(`users/llavero${id}.json`, document.baseURI).toString();
    console.log('[load-user] fetching', url);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      console.log('[load-user] fetch status', res.status);
      if (!res.ok) return null;
      const data = await res.json();
      console.log('[load-user] got data', data);
      return data;
    } catch (e) {
      console.warn('[load-user] fetch error', e);
      return null;
    }
  }

  // Utility: ensure no focused element remains inside node; move focus to body
  function ensureNoFocusInside(node) {
    try {
      const active = document.activeElement;
      if (!active) return;
      if (node.contains(active)) {
        try { active.blur(); } catch (e) { /* ignore */ }
        try { document.body.focus && document.body.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  }

  // Modal creation and accessibility-safe open/close
  function ensureModalExists() {
    let modal = document.getElementById('lr-user-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'lr-user-modal';
      document.body.appendChild(modal);
    }
    // If already populated, leave it
    if (modal.dataset._initialized === '1') return;

    // Create modal hidden and non-focusable
    modal.className = 'lr-user-modal hidden';
    // Ensure we don't accidentally hide an already-focused descendant
    ensureNoFocusInside(modal);
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="lr-modal-card" role="document" aria-labelledby="lr-modal-title">
        <button class="lr-modal-close" aria-label="Cerrar" tabindex="-1">&times;</button>
        <h2 id="lr-modal-title" class="lr-modal-title">Bienvenido</h2>
        <div class="lr-modal-message" id="lr-modal-message">Mensaje</div>
        <div class="lr-modal-actions">
          <button id="lr-modal-view" class="lr-btn" tabindex="-1">Ver frase</button>
          <button id="lr-modal-go" class="lr-btn primary" tabindex="-1">Ir</button>
        </div>
      </div>
    `;

    // Event handlers
    const closeBtn = modal.querySelector('.lr-modal-close');
    const goBtn = modal.querySelector('#lr-modal-go');
    const viewBtn = modal.querySelector('#lr-modal-view');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (goBtn) goBtn.addEventListener('click', () => { closeModal(); const mainCard = document.querySelector('.panel') || document.body; try { mainCard.scrollIntoView({ behavior: 'smooth' }); } catch (e) { /* ignore */ } });
    if (viewBtn) viewBtn.addEventListener('click', () => { closeModal(); if (typeof window.mostrarFrase === 'function') try { window.mostrarFrase(); } catch (e) { console.warn(e); } });

    // Close when clicking outside the dialog card
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) closeModal();
    });

    // Close on Escape when modal open (delegated listener)
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' || ev.key === 'Esc') {
        const m = document.getElementById('lr-user-modal');
        if (m && !m.classList.contains('hidden')) {
          ev.preventDefault();
          closeModal();
        }
      }
    });

    modal.dataset._initialized = '1';
  }

  function setInertToMain(enable) {
    const main = document.querySelector('main') || document.getElementById('main') || document.body;
    try {
      if (enable) {
        if ('inert' in HTMLElement.prototype) main.inert = true;
        else main.setAttribute('aria-hidden', 'true');
      } else {
        if ('inert' in HTMLElement.prototype) main.inert = false;
        else main.removeAttribute('aria-hidden');
      }
    } catch (e) {
      console.warn('[load-user] setInertToMain failed', e);
    }
  }

  function enableModalInteractive(modal, enable) {
    const controls = modal.querySelectorAll('button, [href], input, textarea, select, [tabindex]');
    controls.forEach(c => {
      if (enable) {
        if (c.dataset._origTab === undefined) c.dataset._origTab = c.getAttribute('tabindex') === null ? '' : c.getAttribute('tabindex');
        c.setAttribute('tabindex', '0');
      } else {
        if (c.dataset._origTab !== undefined) {
          if (c.dataset._origTab === '') c.removeAttribute('tabindex');
          else c.setAttribute('tabindex', c.dataset._origTab);
        } else {
          c.setAttribute('tabindex', '-1');
        }
      }
    });
  }

  function openModal({ title, message }) {
    ensureModalExists();
    const modal = document.getElementById('lr-user-modal');
    if (!modal) return;

    // Save previous focus element id (if possible)
    const prev = document.activeElement;
    try {
      if (prev && prev !== document.body && prev.id) modal.dataset._previousFocusId = prev.id;
      else modal.dataset._previousFocusTag = prev ? prev.tagName : '';
    } catch (_) { modal.dataset._previousFocusTag = ''; }

    // Make main inert BEFORE showing modal
    setInertToMain(true);

    // Ensure no focus remains inside modal before transition
    ensureNoFocusInside(modal);

    // Show modal and make it available to AT
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    // Ensure controls become focusable only after modal visible
    enableModalInteractive(modal, true);

    // Focus first interactive control in modal after microtask
    setTimeout(() => {
      const first = modal.querySelector('#lr-modal-go') || modal.querySelector('#lr-modal-view') || modal.querySelector('.lr-modal-close');
      if (first && typeof first.focus === 'function') {
        try { first.focus({ preventScroll: true }); } catch (e) { try { first.focus(); } catch (_) {} }
      }
    }, 10);

    // Set title/message
    const titleEl = modal.querySelector('#lr-modal-title');
    const msgEl = modal.querySelector('#lr-modal-message');
    if (titleEl && title) titleEl.textContent = title;
    if (msgEl && message) msgEl.textContent = message;
  }

  function closeModal() {
    const modal = document.getElementById('lr-user-modal');
    if (!modal) return;

    // Ensure we remove focus from any descendant BEFORE hiding from AT
    ensureNoFocusInside(modal);

    // Mark hidden for AT first
    modal.setAttribute('aria-hidden', 'true');

    // Remove visual display
    modal.classList.add('hidden');

    // Make controls unfocusable
    enableModalInteractive(modal, false);

    // Remove inert from main
    setInertToMain(false);

    // Restore focus
    try {
      const prevId = modal.dataset._previousFocusId;
      if (prevId) {
        const prevEl = document.getElementById(prevId);
        if (prevEl && typeof prevEl.focus === 'function') { prevEl.focus({ preventScroll: true }); return; }
      }
      const main = document.querySelector('main') || document.getElementById('main') || document.body;
      if (main && typeof main.focus === 'function') main.focus({ preventScroll: true });
    } catch (e) {
      console.warn('[load-user] restore focus failed', e);
    }
  }

  function applyPersonalization(data) {
    if (!data) return;
    const title = data.nombre ? `Hola ${data.nombre}` : 'Bienvenido';
    const message = data.mensaje || `Hola ${data.nombre || ''}, respira conmigo`;
    try {
      const greet = document.getElementById('user-greeting');
      if (greet) greet.textContent = data.mensaje || 'Un recordatorio amable';
    } catch (e) {}
    openModal({ title, message });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    ensureModalExists();

    const welcomeKey = 'lr_seen_welcome_v1';
    const id = getIdFromUrl();

    // first-run welcome
    if (!localStorage.getItem(welcomeKey)) {
      const w = document.getElementById('welcome');
      const m = document.getElementById('main');
      if (w && m) {
        w.classList.remove('hidden');
        m.classList.add('hidden');
        const cont = document.getElementById('welcome-continue');
        if (cont) cont.addEventListener('click', () => {
          localStorage.setItem(welcomeKey, '1');
          w.classList.add('hidden');
          m.classList.remove('hidden');
          if (typeof window.mostrarFrase === 'function') window.mostrarFrase();
        });
      }
    } else {
      const w = document.getElementById('welcome');
      const m = document.getElementById('main');
      if (w && m) { w.classList.add('hidden'); m.classList.remove('hidden'); }
    }

    if (!id) return;
    const data = await loadUserData(id);
    if (data) {
      // normalize new emotional fields (in case the user file lacks them)
      data.estadoEmocionalActual = typeof data.estadoEmocionalActual !== 'undefined' ? data.estadoEmocionalActual : 'neutral';
      data.nivelDeAnsiedad = typeof data.nivelDeAnsiedad !== 'undefined' ? Number(data.nivelDeAnsiedad) : 0;
      data.ultimaCategoriaMostrada = typeof data.ultimaCategoriaMostrada !== 'undefined' ? data.ultimaCategoriaMostrada : null;
      data.ultimaFechaMostrado = typeof data.ultimaFechaMostrado !== 'undefined' ? data.ultimaFechaMostrado : null;
      data.rachaDeLectura = typeof data.rachaDeLectura !== 'undefined' ? Number(data.rachaDeLectura) : 0;
      data.temaVisualActual = typeof data.temaVisualActual !== 'undefined' ? data.temaVisualActual : 'neutral';
      data.suggestedBreathingType = typeof data.suggestedBreathingType !== 'undefined' ? data.suggestedBreathingType : null;

      // set runtime global and persist in localStorage for UI runtime
      try {
        window.CLIENT_USER = data;
        localStorage.setItem('lr_client_runtime_user', JSON.stringify(data));
      } catch (e) { console.warn('[load-user] saving runtime user failed', e); }

      // Apply theme if ThemeManager loaded
      if (window.ThemeManager && typeof window.ThemeManager.apply === 'function') {
        try { window.ThemeManager.apply(data); } catch (e) { /* ignore theme apply error */ }
      }

      applyPersonalization(data);
    } else console.log('[load-user] no personalization found for id', id);
  });
})();

// ===== UX: client runtime helpers (append) =====
// Provide a runtime CLIENT_USER object and save helper using localStorage.
// This avoids writing server files in runtime and keeps UI state.
(function(){
  if (window.CLIENT_USER) return;
  try {
    // try to load ambient user object created by existing load logic
    var user = window.CLIENT_USER || null;
    if (!user) {
      // try to read from localStorage (set earlier by loadUserData)
      var stored = localStorage.getItem('lr_client_runtime_user');
      if (stored) {
        user = JSON.parse(stored);
      } else {
        user = window.CLIENT_USER || {}; // empty placeholder
      }
    }
    window.CLIENT_USER = user;

    window.saveClientRuntime = function(updated){
      try {
        window.CLIENT_USER = Object.assign({}, window.CLIENT_USER, updated);
        localStorage.setItem('lr_client_runtime_user', JSON.stringify(window.CLIENT_USER));
      } catch(e){ console.warn('saveClientRuntime failed', e); }
    };
  } catch(e){
    console.warn('client runtime helper init failed', e);
  }
})();
