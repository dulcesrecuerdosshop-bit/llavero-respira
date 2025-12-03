// js/load-user.js - carga personalización por id y gestiona modal de bienvenida
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

  // Modal creation and accessibility-safe open/close
  function ensureModalExists() {
    const modal = document.getElementById('lr-user-modal');
    if (!modal) return;
    // If already populated, leave it
    if (modal.dataset._initialized === '1') return;

    // Basic structure
    modal.className = 'lr-user-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="lr-modal-card" role="document" aria-labelledby="lr-modal-title">
        <button class="lr-modal-close" aria-label="Cerrar">&times;</button>
        <h2 id="lr-modal-title" class="lr-modal-title">Bienvenido</h2>
        <div class="lr-modal-message" id="lr-modal-message">Mensaje</div>
        <div class="lr-modal-actions">
          <button id="lr-modal-view" class="lr-btn">Ver frase</button>
          <button id="lr-modal-go" class="lr-btn primary">Ir</button>
        </div>
      </div>
    `;

    // Event handlers
    const closeBtn = modal.querySelector('.lr-modal-close');
    const goBtn = modal.querySelector('#lr-modal-go');
    const viewBtn = modal.querySelector('#lr-modal-view');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (goBtn) goBtn.addEventListener('click', () => { closeModal(); const mainCard = document.querySelector('.panel') || document.body; try { mainCard.scrollIntoView({ behavior: 'smooth' }); } catch (e) {} });
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
    // Use the inert attribute if available (modern browsers). Otherwise fallback to aria-hidden.
    const main = document.querySelector('main') || document.getElementById('main') || document.body;
    try {
      if (enable) {
        // mark main as inert so it won't be focusable or reachable for AT
        if ('inert' in HTMLElement.prototype) {
          main.inert = true;
        } else {
          main.setAttribute('aria-hidden', 'true');
        }
      } else {
        if ('inert' in HTMLElement.prototype) {
          main.inert = false;
        } else {
          main.removeAttribute('aria-hidden');
        }
      }
    } catch (e) {
      console.warn('[load-user] setInertToMain failed', e);
    }
  }

  function openModal({ title, message }) {
    ensureModalExists();
    const modal = document.getElementById('lr-user-modal');
    if (!modal) return;

    // Store previously focused element (to restore focus on close)
    let prev = document.activeElement;
    if (prev && prev !== document.body && prev.id) {
      modal.dataset._previousFocusId = prev.id;
    } else {
      // store element reference as fallback (not persisted across navigations)
      try { modal.dataset._previousFocusTag = prev ? prev.tagName : ''; } catch (_) { modal.dataset._previousFocusTag = ''; }
    }

    // Make page inert (prevent focus on background) BEFORE making modal visible
    setInertToMain(true);

    // Make modal visible and accessible
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    // Set content
    const titleEl = modal.querySelector('#lr-modal-title');
    const msgEl = modal.querySelector('#lr-modal-message');
    if (titleEl && title) titleEl.textContent = title;
    if (msgEl && message) msgEl.textContent = message;

    // After a microtask, move focus into the modal (ensures aria-hidden=false is in effect)
    setTimeout(() => {
      const first = modal.querySelector('#lr-modal-go') || modal.querySelector('#lr-modal-view') || modal.querySelector('.lr-modal-close');
      if (first && typeof first.focus === 'function') {
        try { first.focus({ preventScroll: true }); }
        catch (e) { try { first.focus(); } catch (e2) { } }
      }
    }, 20);
  }

  function closeModal() {
    const modal = document.getElementById('lr-user-modal');
    if (!modal) return;

    // Hide modal from AT first
    modal.setAttribute('aria-hidden', 'true');

    // Hide visually
    modal.classList.add('hidden');

    // Remove inert from main so it becomes focusable again
    setInertToMain(false);

    // Restore focus to the previously focused element (if possible)
    try {
      const prevId = modal.dataset._previousFocusId;
      if (prevId) {
        const prevEl = document.getElementById(prevId);
        if (prevEl && typeof prevEl.focus === 'function') {
          prevEl.focus({ preventScroll: true });
          return;
        }
      }
      // fallback: try to focus main or body
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
    // Update greeting (visible in header)
    try {
      const greet = document.getElementById('user-greeting');
      if (greet) greet.textContent = data.mensaje || 'Un recordatorio amable';
    } catch (e) {}
    // Open modal with safe focus handling
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
    if (data) applyPersonalization(data);
    else console.log('[load-user] no personalization found for id', id);
  });
})();
