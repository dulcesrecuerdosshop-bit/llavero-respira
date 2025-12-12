/*
nfc-storage.js
Responsable de guardar/recuperar token_secreto.
Opciones de almacenamiento:
 - plain (localStorage)
 - cifrado AES-GCM con passphrase (Web Crypto)
Public API expuesta en window.NFCStorage
*/
(function(window){
  'use strict';

  const PREFIX = 'nfc_token_';
  const ENC_PREFIX = 'nfc_enc_'; // if encrypted store value still under same localStorage key

  // util: base64 <-> ArrayBuffer
  function bufToBase64(buf){
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i=0;i<bytes.byteLength;i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function base64ToBuf(b64){
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const passKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 150000,
      hash: 'SHA-256'
    }, passKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
    return key;
  }

  async function encryptWithPassphrase(plainText, passphrase){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = location.hostname || 'nfc_bridge';
    const key = await deriveKey(passphrase, salt);
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText));
    return {
      iv: bufToBase64(iv.buffer),
      salt: btoa(salt),
      ct: bufToBase64(ct)
    };
  }

  async function decryptWithPassphrase(payload, passphrase){
    try {
      const iv = base64ToBuf(payload.iv);
      const salt = atob(payload.salt || btoa(location.hostname || 'nfc_bridge'));
      const key = await deriveKey(passphrase, salt);
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, base64ToBuf(payload.ct));
      return new TextDecoder().decode(plainBuf);
    } catch (e) {
      throw new Error('decrypt_failed');
    }
  }

  // Public functions
  const NFCStorage = {
    // setTokenForKey(key_id, token, { encrypt:false, passphrase:null })
    async setTokenForKey(key_id, token, opts){
      opts = opts || {};
      const k = PREFIX + key_id;
      if (opts.encrypt && opts.passphrase) {
        const payload = await encryptWithPassphrase(String(token), String(opts.passphrase));
        // store JSON string with marker
        localStorage.setItem(k, JSON.stringify({ __enc: true, payload }));
        return true;
      } else {
        // plain storage (use only if you accept localStorage plaintext)
        try {
          localStorage.setItem(k, JSON.stringify({ __enc: false, token: String(token) }));
          return true;
        } catch(e){
          console.warn('nfc-storage: setToken plain failed', e);
          return false;
        }
      }
    },

    // getTokenForKey(key_id, { passphrase: null })
    async getTokenForKey(key_id, opts){
      opts = opts || {};
      const k = PREFIX + key_id;
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.__enc && parsed.payload) {
          if (!opts.passphrase) {
            // No passphrase -> cannot decrypt
            return null;
          }
          try {
            const token = await decryptWithPassphrase(parsed.payload, String(opts.passphrase));
            return token;
          } catch(e){
            // decrypt failed
            console.warn('nfc-storage: decrypt failed', e);
            return null;
          }
        } else if (parsed && parsed.__enc === false && parsed.token) {
          return parsed.token;
        }
      } catch (e) {
        // not JSON? fallback
        return raw;
      }
      return null;
    },

    // remove token
    removeTokenForKey(key_id){
      try {
        localStorage.removeItem(PREFIX + key_id);
        return true;
      } catch(e){ return false; }
    },

    // list keys stored (returns array of key_id)
    listStoredKeys(){
      const out = [];
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k.substring(PREFIX.length));
      }
      return out;
    }
  };

  // export
  window.NFCStorage = window.NFCStorage || NFCStorage;
})(window);
