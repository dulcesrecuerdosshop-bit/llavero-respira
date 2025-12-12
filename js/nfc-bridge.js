/*
nfc-bridge.js
- Traduce la respuesta del plugin al formato que usa la App (/js/load-user.js)
- Expone API compatible para load-user.js sin modificarlo
  Public: window.NFCBridge.init(), window.NFCBridge.getClient(), window.NFCBridge.sendSession(session)
- Si llavero inactivo/reemplazado -> muestra overlay con mensaje y CTA
- Al autenticar correctamente:
    - mapea campos a window.CLIENT_USER (nombre, mensaje, suggestedBreathingType, estadoEmocionalActual, nivelDeAnsiedad, etc.)
    - persiste con window.saveClientRuntime() si disponible
    - guarda sesiones en localStorage en key 'lr_breath_sessions' (compatibility)
*/
(function(window){
  'use strict';

  const PLUGIN_DENY_MESSAGE = "Este espacio es exclusivo para clientes con Llavero Respira. Si aún no lo tienes, consíguelo aquí";
  const CTA_URL = "https://dulces-recuerdos.com";

  function mapEmotionalLevel(estado){
    if (!estado) return { estadoEmocionalActual: 'neutral', nivelDeAnsiedad: 0, suggestedBreathingType: null };
    const s = String(estado).toLowerCase();
    if (s.includes('crisis') || s.includes('malo') || s.includes('deprim')) return { estadoEmocionalActual: 'crisis', nivelDeAnsiedad: 5, suggestedBreathingType: 'hotfix' };
    if (s.includes('ans') || s.includes('ansiedad')) return { estadoEmocionalActual: 'ansiedad', nivelDeAnsiedad: 3, suggestedBreathingType: 'profunda' };
    if (s.includes('tens') || s.includes('tenso')) return { estadoEmocionalActual: 'ansiedad', nivelDeAnsiedad: 2, suggestedBreathingType: 'suave' };
    if (s.includes('relaj') || s.includes('calma') || s.includes('tranq')) return { estadoEmocionalActual: 'relajado', nivelDeAnsiedad: 1, suggestedBreathingType: 'calm' };
    return { estadoEmocionalActual: s, nivelDeAnsiedad: 1, suggestedBreathingType: null };
  }

  function showBlockedOverlay(message){
    // Do not duplicate overlay
    if (document.getElementById('nfc-block-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'nfc-block-overlay';
    Object.assign(ov.style, {
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', color: '#fff', zIndex: 20000, padding: '20px', textAlign: 'center'
    });
    ov.innerHTML = `<div style="max-width:520px">
      <h2 style="margin:0 0 12px 0">Este espacio es exclusivo</h2>
      <p style="margin:0 0 18px 0;line-height:1.4">${message || PLUGIN_DENY_MESSAGE}</p>
      <a id="nfc-block-cta" href="${CTA_URL}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 18px;background:#fff;color:#060; border-radius:10px;text-decoration:none;font-weight:700">Consíguelo aquí</a>
      <div style="margin-top:14px"><button id="nfc-block-close" style="background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;padding:8px 12px;border-radius:8px">Cerrar</button></div>
    </div>`;
    document.body.appendChild(ov);
    const close = document.getElementById('nfc-block-close');
    if (close) close.addEventListener('click', () => ov.remove());
  }

  function persistSessionsArray(key_id, sesiones){
    try {
      // Save under lr_breath_sessions_<key_id>
      localStorage.setItem('lr_breath_sessions_' + key_id, JSON.stringify(sesiones || []));
      // Also a simple generic key (some older modules may read lr_breath_sessions)
      localStorage.setItem('lr_breath_sessions', JSON.stringify(sesiones || []));
    } catch(e){ console.warn('NFCBridge: persistSessions failed', e); }
  }

  const NFCBridge = {
    // init: tries to authenticate using NFCAuth (if present)
    // opts: { autoInit:true, passphrase: null }
    async init(opts){
      opts = opts || {};
      const auto = typeof opts.autoInit === 'undefined' ? true : !!opts.autoInit;
      if (!window.NFCAuth) return { ok: false, reason: 'no_nfc_auth' };
      // config pluginBase if provided
      if (opts.pluginBaseUrl) window.NFCAuth.config.pluginBaseUrl = opts.pluginBaseUrl;
      const result = await window.NFCAuth.init({ autoAuth: auto, passphrase: opts.passphrase });
      if (!result || !result.found) return { ok: false, found: false };
      // if auth returned error codes, propagate
      if (result.error) return { ok: false, error: result.error };
      // If callAuthWithStoredToken returned http response, check status/body
      if (result.status === 403 || (result.body && result.body.access === false)) {
        // show overlay with plugin message if available
        const msg = (result.body && (result.body.message || result.body.msg)) ? (result.body.message || result.body.msg) : PLUGIN_DENY_MESSAGE;
        showBlockedOverlay(msg);
        return { ok: false, blocked: true, body: result.body || null };
      }
      if (!result.ok || !result.body) {
        // not ok but perhaps cached - try to use cached copy
        const cached = window.NFCAuth.getCachedUser(result.key_id);
        if (cached) {
          window.NFC_USER = cached;
          NFCBridge._applyPluginUser(result.key_id, cached);
          return { ok: true, cached: true, body: cached };
        }
        return { ok: false, status: result.status, body: result.body };
      }
      // success: transform and apply
      window.NFC_USER = result.body;
      NFCBridge._applyPluginUser(result.key_id, result.body);
      return { ok: true, body: result.body };
    },

    // internal: builds CLIENT_USER compatible object and persists
    _applyPluginUser(key_id, pluginBody){
      if (!pluginBody) return;
      // Build mapping
      const mapped = {};
      mapped.nombre = pluginBody.customer_name || pluginBody.customer_name || pluginBody.customer || '';
      mapped.mensaje = pluginBody.custom_message || (mapped.nombre ? `Hola ${mapped.nombre}` : 'Un recordatorio amable');
      // emotional mapping
      const emo = mapEmotionalLevel(pluginBody.estado_emocional || pluginBody.estadoEmocional || '');
      mapped.estadoEmocionalActual = emo.estadoEmocionalActual;
      mapped.nivelDeAnsiedad = emo.nivelDeAnsiedad;
      mapped.suggestedBreathingType = emo.suggestedBreathingType;
      // other UI fields expected by load-user.js
      mapped.ultimaCategoriaMostrada = pluginBody.ultimaCategoriaMostrada || null;
      mapped.ultimaFechaMostrado = pluginBody.ultimaFechaMostrado || null;
      mapped.rachaDeLectura = Number(pluginBody.rachaDeLectura || 0);
      mapped.temaVisualActual = pluginBody.temaVisualActual || 'neutral';
      // copy purchase/activation dates (optional)
      mapped.fecha_compra = pluginBody.fecha_compra || pluginBody.fechaCompra || '';
      mapped.fecha_activacion = pluginBody.fecha_activacion || pluginBody.fechaActivacion || '';

      // sessions / evolucion
      const sesiones = Array.isArray(pluginBody.sesiones) ? pluginBody.sesiones : (pluginBody.sessions || []);
      mapped.sesiones = sesiones;
      mapped.evolucion = Array.isArray(pluginBody.evolucion) ? pluginBody.evolucion : [];

      // Expose on window CLIENT_USER and persist via saveClientRuntime (load-user.js)
      try {
        window.CLIENT_USER = Object.assign({}, window.CLIENT_USER || {}, mapped);
        if (typeof window.saveClientRuntime === 'function') {
          window.saveClientRuntime(mapped);
        } else {
          // fallback persist
          try { localStorage.setItem('lr_client_runtime_user', JSON.stringify(window.CLIENT_USER)); } catch(e){}
        }
      } catch(e){ console.warn('NFCBridge: apply error', e); }

      // Persist sessions to keys that breath-sessions.js may use
      persistSessionsArray(key_id, sesiones);
      // Also expose NFC-specific global
      try {
        window.NFC_USER = Object.assign({}, pluginBody);
      } catch(e){}
    },

    // get client mapped (returns window.CLIENT_USER)
    getClient(){
      return window.CLIENT_USER || null;
    },

    // send session through NFCAuth (requires NFCAuth and that storage has token)
    // sessionObj: { fecha, duracion, estado_emocional, notas }
    async sendSession(sessionObj, opts){
      opts = opts || {};
      const key_id = opts.key_id || (window.location && (function(){
        const p = (location.pathname||'/').replace(/\/+$/,'').split('/').filter(Boolean);
        return p.length ? p[p.length - 1] : null;
      })());
      if (!key_id) return { error: 'no_key' };
      // obtain token
      if (!window.NFCStorage) return { error: 'no_storage' };
      const token = await window.NFCStorage.getTokenForKey(key_id, { passphrase: opts.passphrase });
      if (!token) return { error: 'missing_token' };
      if (!window.NFCAuth) return { error: 'no_nfc_auth' };
      const res = await window.NFCAuth.callUpdateSession(key_id, token, sessionObj);
      // if ok update local mapping
      if (res && res.ok) {
        // append local sessions and persist
        try {
          const cur = window.CLIENT_USER || {};
          cur.sesiones = cur.sesiones || [];
          cur.sesiones.push(sessionObj);
          if (typeof window.saveClientRuntime === 'function') window.saveClientRuntime({ sesiones: cur.sesiones });
          persistSessionsArray(key_id, cur.sesiones);
        } catch(e){}
      }
      return res;
    }
  };

  // Export
  window.NFCBridge = window.NFCBridge || NFCBridge;

})(window);
