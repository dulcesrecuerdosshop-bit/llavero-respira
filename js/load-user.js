(function(){'use strict';
  function getIdFromUrl(){ const params = new URLSearchParams(window.location.search); const id = params.get('id'); if (id && /^[A-Za-z0-9_-]{1,32}$/.test(id)) return id; return null }
  async function loadUserData(id){ if(!id) return null; const url = new URL(`users/llavero${id}.json`, document.baseURI).toString(); console.log('[load-user] fetching', url); try{ const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' }); console.log('[load-user] fetch status', res.status); if(!res.ok) return null; const data = await res.json(); console.log('[load-user] got data', data); return data }catch(e){ console.warn('[load-user] fetch error', e); return null } }
  function ensureModalExists(){ if(document.getElementById('lr-user-modal') && document.getElementById('lr-user-modal').innerHTML.trim()) return;
    const modal = document.getElementById('lr-user-modal');
    modal.className = 'lr-user-modal hidden';
    modal.innerHTML = `<div class="lr-modal-card" role="dialog" aria-modal="true" aria-labelledby="lr-modal-title"><button class="lr-modal-close" aria-label="Cerrar">&times;</button><div class="lr-modal-body"><h2 id="lr-modal-title" class="lr-modal-title"></h2><p id="lr-modal-message" class="lr-modal-message"></p><div class="lr-modal-actions"><button id="lr-modal-go" class="lr-btn primary">Entrar al panel</button><button id="lr-modal-view" class="lr-btn">Ver frases</button></div></div></div>`;
    modal.querySelector('.lr-modal-close').addEventListener('click', closeModal);
    modal.querySelector('#lr-modal-go').addEventListener('click', ()=>{ closeModal(); const mainCard = document.querySelector('.panel') || document.body; mainCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); if(typeof window.mostrarFrase === 'function') try{ window.mostrarFrase() }catch(e){console.warn(e)} });
    modal.querySelector('#lr-modal-view').addEventListener('click', ()=>{ closeModal(); if(typeof window.mostrarFrase === 'function') try{ window.mostrarFrase() }catch(e){console.warn(e)} });
    modal.addEventListener('click', (ev)=>{ if(ev.target === modal) closeModal() });
  }
  function openModal({ title, message }){ ensureModalExists(); const modal = document.getElementById('lr-user-modal'); modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); const titleEl = modal.querySelector('#lr-modal-title'); const msgEl = modal.querySelector('#lr-modal-message'); if(titleEl) titleEl.textContent = title || 'Bienvenido'; if(msgEl) msgEl.textContent = message || ''; const btn = modal.querySelector('#lr-modal-go') || modal.querySelector('.lr-modal-close'); btn && btn.focus(); document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden'; }
  function closeModal(){ const modal = document.getElementById('lr-user-modal'); if(!modal) return; modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); document.documentElement.style.overflow = ''; document.body.style.overflow = ''; }
  function applyPersonalization(data){ if(!data) return; const title = data.nombre ? `Hola ${data.nombre}` : 'Bienvenido'; const message = data.mensaje || `Hola ${data.nombre || ''}, respira conmigo 🌱`; openModal({ title, message }); const greetingEl = document.getElementById('user-greeting'); if(greetingEl) greetingEl.textContent = data.nombre ? `${data.nombre}, bienvenido` : 'Un recordatorio amable'; }
  document.addEventListener('DOMContentLoaded', async ()=>{ const welcomeKey = 'lr_seen_welcome_v1'; const id = getIdFromUrl();
    // first-run welcome
    if(!localStorage.getItem(welcomeKey)){
      const w = document.getElementById('welcome');
      const m = document.getElementById('main');
      if(w && m){
        w.classList.remove('hidden');
        m.classList.add('hidden');
        document.getElementById('welcome-continue').addEventListener('click', ()=>{
          localStorage.setItem(welcomeKey, '1');
          w.classList.add('hidden');
          m.classList.remove('hidden');
          if(typeof window.mostrarFrase === 'function') window.mostrarFrase();
        });
      }
    } else {
      const w = document.getElementById('welcome');
      const m = document.getElementById('main');
      if(w && m){ w.classList.add('hidden'); m.classList.remove('hidden'); }
    }

    if(!id) return;
    const data = await loadUserData(id);
    if(data) applyPersonalization(data);
    else console.log('[load-user] no personalization found for id', id);
  });
})();
