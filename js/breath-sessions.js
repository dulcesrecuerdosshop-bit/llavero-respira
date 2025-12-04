// BREATH SESSIONS v4 — Versión final adaptada a tu app real (corrección de inyección de UI)
// Ahora la inyección busca tanto _lr_settings_modal (creado por helpers.v2.js) como lr-user-modal.
// Si el modal real es _lr_settings_modal se incrusta ahí; sino usa #lr-user-modal como fallback.

(function() {
    if (window._breath_sessions_v4_loaded) return;
    window._breath_sessions_v4_loaded = true;

    const SESSION_OPTIONS = [
        { id: "0", label: "Sin temporizador", seconds: 0 },
        { id: "60", label: "1 minuto", seconds: 60 },
        { id: "180", label: "3 minutos", seconds: 180 },
        { id: "300", label: "5 minutos", seconds: 300 }
    ];

    const PRESET_LABELS = {
        box: "Caja (4-4-4-4)",
        calm: "Calma suave",
        slow: "Lento",
        "478": "4-7-8"
    };

    let sessionActive = false;
    let sessionPaused = false;
    let sessionEndsAt = 0;
    let sessionInterval = null;
    let remainingSeconds = 0;

    function formatTime(s) {
        s = Math.max(0, Math.floor(s));
        const mm = Math.floor(s / 60);
        const ss = s % 60;
        return `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
    }

    // ---------- Inserción robusta de UI en Ajustes ----------
    function injectSettingsUI() {
        // - Preferimos el modal real creado por helpers.v2.js: _lr_settings_modal
        // - Si no existe, usamos el #lr-user-modal (antiguo fallback)
        let modal = document.getElementById("_lr_settings_modal");
        let usedModalId = '_lr_settings_modal';
        if (!modal) {
            modal = document.getElementById("lr-user-modal");
            usedModalId = 'lr-user-modal';
        }
        if (!modal) return;

        // Determinar el "card" o contenedor donde insertar:
        // - En _lr_settings_modal el contenido útil suele ser el primer <div> (el box creado por helpers).
        // - En lr-user-modal intentamos buscar .lr-modal-card.
        let card = modal.querySelector(".lr-modal-card") || modal.querySelector("div");
        if (!card) {
            // Como último recurso, insertamos al final del modal
            card = modal;
        }

        // Evitar duplicado
        if (card.dataset.sessionsLoaded === "1") return;

        const box = document.createElement("div");
        box.style.marginTop = "20px";
        box.innerHTML = `
            <h3 style="font-weight:700;margin-bottom:8px">Temporizador de sesión</h3>

            <select id="lr_session_select" style="
                width:100%;padding:10px;border-radius:10px;
                border:1px solid rgba(0,0,0,0.1);font-size:1rem;">
                ${SESSION_OPTIONS.map(s => `<option value="${s.seconds}">${s.label}</option>`).join("")}
            </select>

            <button id="lr_session_start_btn" style="
                width:100%;margin-top:12px;padding:10px;border:none;
                border-radius:10px;font-weight:700;font-size:1rem;
                background:linear-gradient(90deg,#77c8ff,#a4e6c6);color:#012e3a">
                Iniciar sesión
            </button>

            <hr style="margin:24px 0;opacity:0.1" />

            <h3 style="font-weight:700;margin-bottom:8px">Presets de respiración</h3>
            <div id="lr_preset_buttons" style="display:flex;flex-wrap:wrap;gap:10px"></div>
        `;

        card.appendChild(box);
        card.dataset.sessionsLoaded = "1";

        // Restaurar valor
        const select = document.getElementById("lr_session_select");
        const saved = localStorage.getItem("lr_session_seconds");
        if (saved && select) select.value = saved;

        select?.addEventListener("change", e => {
            localStorage.setItem("lr_session_seconds", e.target.value);
        });

        document.getElementById("lr_session_start_btn")?.addEventListener("click", () => {
            const seconds = parseInt(select.value, 10) || 0;
            startSession(seconds);
            closeSettings();
        });

        // Presets
        const wrap = document.getElementById("lr_preset_buttons");
        Object.keys(PRESET_LABELS).forEach(k => {
            const btn = document.createElement("button");
            btn.textContent = PRESET_LABELS[k];
            btn.style.cssText = `
                padding:8px 12px;border-radius:10px;font-weight:600;
                background:white;border:1px solid rgba(0,0,0,0.1);
            `;
            btn.addEventListener("click", () => {
                window.lr_helpers?.setBreathPattern(k);
                showToast("Preset aplicado: " + PRESET_LABELS[k]);
            });
            wrap.appendChild(btn);
        });
    }

    // Si el botón settings_menu existe lo escuchamos (funciona con tu UI actual)
    document.getElementById("settings_menu")?.addEventListener("click", () => {
        // Pequeño timeout para dejar que helpers abra su modal primero
        setTimeout(() => injectSettingsUI(), 120);
    });

    function closeSettings() {
        // Intentamos cerrar el modal de helpers si existe
        document.querySelector(".lr-modal-close")?.click();
        // y también el viejo if present
        const m = document.getElementById("_lr_settings_modal");
        if (m && m.parentNode) { try { m.remove(); } catch(e){} }
    }

    // Panel flotante de sesión
    function showSessionControls() {
        removeSessionControls();

        const box = document.createElement("div");
        box.id = "lr_session_controls";
        box.style.cssText = `
            position:fixed;right:20px;bottom:20px;z-index:99999;
            background:rgba(255,255,255,0.95);border-radius:14px;
            box-shadow:0 8px 24px rgba(0,0,0,0.15);
            padding:14px;min-width:200px;display:flex;flex-direction:column;gap:12px;
        `;

        box.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center">
                <strong style="font-size:1rem">Sesión activa</strong>
                <button id="lr_ctrl_close" style="background:none;border:none;font-size:1.2rem">✕</button>
            </div>

            <div id="lr_ctrl_timer" style="font-size:1.4rem;font-weight:700;text-align:center">--:--</div>

            <div style="display:flex;gap:10px">
                <button id="lr_ctrl_pause" style="
                    flex:1;padding:8px;border-radius:8px;background:white;
                    border:1px solid rgba(0,0,0,0.1);font-weight:700">
                    Pausar
                </button>

                <button id="lr_ctrl_new" style="
                    flex:1;padding:8px;border-radius:8px;
                    background:linear-gradient(90deg,#ffe7a8,#ffc37d);
                    border:none;color:#4a2d00;font-weight:700">
                    Nueva
                </button>
            </div>

            <button id="lr_ctrl_stop" style="
                padding:10px;border-radius:10px;font-weight:700;color:white;
                background:linear-gradient(90deg,#ff8a8a,#ff5d5d);border:none">
                Salir
            </button>
        `;
        document.body.appendChild(box);

        document.getElementById("lr_ctrl_close").onclick = removeSessionControls;
        document.getElementById("lr_ctrl_stop").onclick = stopSession;
        document.getElementById("lr_ctrl_new").onclick = newSessionFlow;
        document.getElementById("lr_ctrl_pause").onclick = togglePauseButton;

        updatePauseButton();
    }

    function removeSessionControls(){ document.getElementById("lr_session_controls")?.remove(); }
    function updatePauseButton(){ const btn = document.getElementById("lr_ctrl_pause"); if (btn) btn.textContent = sessionPaused ? "Continuar" : "Pausar"; }

    // Sesión
    function startSession(seconds) {
        sessionActive = true;
        sessionPaused = false;

        if (!window.lr_helpers?.startBreathFlow) { showToast("Respiración no disponible"); return; }

        window.lr_helpers.startBreathFlow();
        showSessionControls();

        if (seconds > 0) {
            remainingSeconds = seconds;
            sessionEndsAt = Date.now() + seconds * 1000;

            clearInterval(sessionInterval);
            sessionInterval = setInterval(() => {
                if (!sessionActive) return;
                remainingSeconds = Math.max(0, Math.ceil((sessionEndsAt - Date.now()) / 1000));
                updateTimerDisplay();
                if (remainingSeconds <= 0) { stopSession(); showToast("Sesión completada"); }
            }, 1000);
        } else {
            remainingSeconds = Infinity;
            updateTimerDisplay();
        }
    }

    function updateTimerDisplay(){
        const el = document.getElementById("lr_ctrl_timer");
        if (el) el.textContent = remainingSeconds === Infinity ? "∞" : formatTime(remainingSeconds);
    }

    function pauseSession(){
        sessionPaused = true;
        clearInterval(sessionInterval);
        if (window.lr_helpers?.stopBreathFlow) window.lr_helpers.stopBreathFlow();
        if (window.lr_helpers?.stopAmbient) window.lr_helpers.stopAmbient();
        showToast("Sesión pausada");
    }

    function resumeSession(){
        sessionPaused = false;
        if (remainingSeconds !== Infinity){
            sessionEndsAt = Date.now() + remainingSeconds * 1000;
            clearInterval(sessionInterval);
            sessionInterval = setInterval(()=>{
                remainingSeconds = Math.max(0, Math.ceil((sessionEndsAt - Date.now()) / 1000));
                updateTimerDisplay();
                if (remainingSeconds <= 0) stopSession();
            },1000);
        }
        if (window.lr_helpers?.startBreathFlow) window.lr_helpers.startBreathFlow();
        if (window.lr_helpers?.resumeAudio) window.lr_helpers.resumeAudio();
        showToast("Sesión reanudada");
    }

    function togglePauseButton(){ if (!sessionActive) return; if (sessionPaused) resumeSession(); else pauseSession(); updatePauseButton(); }
    function newSessionFlow(){ stopSession(); setTimeout(()=>{ document.getElementById("settings_menu")?.click(); },200); }
    function stopSession(){
        sessionActive = false;
        sessionPaused = false;
        clearInterval(sessionInterval);
        if (window.lr_helpers?.stopBreathFlow) window.lr_helpers.stopBreathFlow();
        if (window.lr_helpers?.stopAmbient) window.lr_helpers.stopAmbient();
        removeSessionControls();
        showToast("Sesión detenida");
    }

    function showToast(msg){ if (window.lr_showToast) window.lr_showToast(msg); else console.log("Toast:", msg); }

    window.lr_breathSessions = { startSession, stopSession };
})();
