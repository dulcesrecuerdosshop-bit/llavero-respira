/*
nfc-auth.js
- Extrae key_id desde la URL
- Usa window.NFCStorage para obtener token_secreto
- Genera token_firma = HMAC-SHA256(key_id, token_secreto) (hex lowercase)
- Llama a los endpoints del plugin:
    POST https://dulces-recuerdos.com/index.php/wp-json/nfc/v1/auth
    POST https://dulces-recuerdos.com/index.php/wp-json/nfc/v1/update
- Guarda respuesta en window.NFC_USER y localStorage 'nfc_user_<key_id>'
Public API en window.NFCAuth
*/
(function(window){
  'use strict';

  // Configurable: base URL del WP donde está instalado el plugin
  const DEFAULT_PLUGIN_BASE = 'https://dulces-recuerdos.com/index.php/wp-json/nfc/v1';
  const STORAGE_PREFIX = 'nfc_user_';

  function hexFromBuffer(buf){
    const bytes = new Uint8Array(buf);
    return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function hmacSha256Hex(secret, message) {
    const enc = new TextEncoder();
    const keyData = enc.encode(secret);
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return hexFromBuffer(sig);
  }

  function extractKeyIdFromUrl() {
    try {
      // pattern: https://llavero-respira.dulces-recuerdos.com/{key_id}
      const path = (location.pathname || '/').replace(/\/+$/, '');
      if (!path || path === '/') return null;
      const segments = path.split('/').filter(Boolean);
      // If the app is served on subpath, the key_id should be the last segment
      return segments.length ? segments[segments.length - 1] : null;
    } catch(e) { return null; }
  }

  async function fetchJson(url, body){
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(()=>null);
    return { status: res.status, ok: res.ok, body: json };
  }

  const NFCAuth = {
    // config: { pluginBaseUrl: string }
    config: {
      pluginBaseUrl: DEFAULT_PLUGIN_BASE
    },

    // Save token_secreto into NFCStorage (helper wrapper)
    // opts: { encrypt: boolean, passphrase: string }
    async saveToken(key_id, token_secreto, opts){
      if (!window.NFCStorage) throw new Error('NFCStorage not available');
      return await window.NFCStorage.setTokenForKey(key_id, token_secreto, opts || {});
    },

    // Attempt to authenticate using token stored in device (NFCStorage)
    // opts: { passphrase: null } -> passphrase used if encrypted
    async callAuthWithStoredToken(key_id, opts){
      opts = opts || {};
      if (!key_id) key_id = extractKeyIdFromUrl();
      if (!key_id) return { error: 'no_key' };
      if (!window.NFCStorage) return { error: 'no_storage' };
      const token = await window.NFCStorage.getTokenForKey(key_id, { passphrase: opts.passphrase });
      if (!token) return { error: 'missing_token' };
      return await NFCAuth.callAuthWithToken(key_id, token);
    },

    // Direct call with token provided (useful for first-time provisioning)
    async callAuthWithToken(key_id, token_secreto){
      if (!key_id) return { error: 'no_key' };
      if (!token_secreto) return { error: 'no_token' };
      const token_firma = await hmacSha256Hex(token_secreto, key_id);
      const url = (NFCAuth.config.pluginBaseUrl.replace(/\/+$/,'') || DEFAULT_PLUGIN_BASE) + '/auth';
      const res = await fetchJson(url, { key_id, token_firma });
      // Save response to window and localStorage for later bridge use
      if (res && typeof res === 'object') {
        window.NFC_USER = res.body || null;
        try { localStorage.setItem(STORAGE_PREFIX + key_id, JSON.stringify({ ts: Date.now(), response: res.body })); } catch(e){}
      }
      return res;
    },

    // Call update (session push)
    async callUpdateSession(key_id, token_secreto, sessionObj){
      if (!key_id) return { error: 'no_key' };
      if (!token_secreto) return { error: 'no_token' };
      if (!sessionObj) return { error: 'no_session' };
      const token_firma = await hmacSha256Hex(token_secreto, key_id);
      const url = (NFCAuth.config.pluginBaseUrl.replace(/\/+$/,'') || DEFAULT_PLUGIN_BASE) + '/update';
      const res = await fetchJson(url, { key_id, token_firma, session: sessionObj });
      // If success, update local NFC_USER copy (append session locally)
      if (res && res.ok && window.NFC_USER) {
        try {
          const ss = window.NFC_USER.sesiones || [];
          ss.push(sessionObj);
          window.NFC_USER.sesiones = ss;
          localStorage.setItem(STORAGE_PREFIX + key_id, JSON.stringify({ ts: Date.now(), response: window.NFC_USER }));
        } catch(e){}
      }
      return res;
    },

    // Initialize: detect key in URL, try auth if token exists in storage.
    // returns { found: bool, auth: result }
    async init({ autoAuth = true, passphrase = null } = {}){
      const key_id = extractKeyIdFromUrl();
      if (!key_id) return { found: false };
      if (!autoAuth) return { found: true, key_id };
      const res = await NFCAuth.callAuthWithStoredToken(key_id, { passphrase });
      return Object.assign({ found: true, key_id }, res);
    },

    // helper to get last saved NFC_USER from localStorage
    getCachedUser(key_id){
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key_id);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed.response || null;
      } catch(e){ return null; }
    }
  };

  // Export
  window.NFCAuth = window.NFCAuth || NFCAuth;
})(window);
