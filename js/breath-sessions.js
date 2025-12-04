// ============================================================
// BREATH SESSIONS v3 — Versión final bonita + funcional
// ============================================================
//
// • No rompe nada existente
// • Añade UI clara y moderna para seleccionar sesiones
// • Añade panel de control durante la sesión
// • Controles: Pausar / Continuar / Editar (nueva sesión) / Salir
// • Temporizador real: 1, 3, 5 minutos + Sin límite
// • Respeta completamente window.lr_helpers (APIs oficiales)
// • Código ordenado, comentado y mantenible
//
// ============================================================

(function() {
    if (window._breath_sessions_v3_loaded) return;
    window._breath_sessions_v3_loaded = true;

    // ------------------------------
    // CONFIGURACIÓN
    // ------------------------------
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

    // ------------------------------
    // ESTADO DE SESIÓN
    // ------------------------------
    let sessionActive = false;
    let sessionPaused = false;
    let sessionEndsAt = 0;
    let sessionInterval = null;
    let remainingSeconds = 0;

    // ------------------------------
    // UTIL: FORMATO DE TIEMPO
    // ------------------------------
    function formatTime(s) {
        s = Math.max(0, Math.floor(s));
        const mm = Math.floor(s / 60);
        const ss = s % 60;
        return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }

    // ============================================================
    // 1. UI EN AJUSTES — Selección de sesiones
    // ============================================================
    function injectSessionSelector(modal) {
        if (!modal || modal.dataset.sessionsLoaded) return;

        const content = modal.querySelector(".lr-settings-content") || modal;
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

            <h3 style="font-weight:700;margin-bottom:8px">Presets respiración</h3>
            <div id="lr_preset_buttons" style="display:flex;flex-wrap:wrap;gap:10px"></div>
        `;
        content.appendChild(box);

        modal.dataset.sessionsLoaded = "1";

        // Restaurar valor guardado
        const saved = localStorage.getItem("lr_session_seconds");
        const select = document.getElementById("lr_session_select");
        if (saved && select) select.value = saved;

        select?.addEventListener("change", e => {
            localStorage.setItem("lr_session_seconds", e.target.value);
        });

        document.getElementById("lr_session_start_btn")?.addEventListener("click", () => {
            const seconds = parseInt(select.value, 10);
            startSession(seconds);
            closeSettingsModal();
        });

        // Presets
        const presetWrap = document.getElementById("lr_preset_buttons");
        Object.keys(PRESET_LABELS).forEach(key => {
            const b = document.createElement("button");
            b.textContent = PRESET_LABELS[key];
            b.style.cssText = `
                padding:8px 12px;border-radius:10px;font-weight:600;
                background:white;border:1px solid rgba(0,0,0,0.1);
            `;
            b.addEventListener("click", () => {
                if (window.lr_helpers?.setBreathPattern) {
                    window.lr_helpers.setBreathPattern(key);
                    showToast("Preset aplicado: " + PRESET_LABELS[key]);
                }
            });
            presetWrap.appendChild(b);
        });
    }

    // Abrir ajustes
    function openSettingsModal() {
        if (window.lr_openSettingsModal) {
            const modal = window.lr_openSettingsModal();
            setTimeout(() => injectSessionSelector(modal), 50);
        } else {
            alert("Modal de ajustes no disponible.");
        }
    }

    function closeSettingsModal() {
        const m = document.getElementById("_lr_settings_modal");
        if (m) m.remove();
    }

    // ============================================================
    // 2. PANEL DE CONTROL DURANTE SESIÓN
    // ============================================================
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

        // Eventos
        document.getElementById("lr_ctrl_close").onclick = removeSessionControls;
        document.getElementById("lr_ctrl_stop").onclick = stopSession;
        document.getElementById("lr_ctrl_new").onclick = newSessionFlow;
        document.getElementById("lr_ctrl_pause").onclick = togglePauseButton;

        updatePauseButton();
    }

    function removeSessionControls() {
        const el = document.getElementById("lr_session_controls");
        el?.remove();
    }

    function updatePauseButton() {
        const btn = document.getElementById("lr_ctrl_pause");
        if (!btn) return;
        btn.textContent = sessionPaused ? "Continuar" : "Pausar";
    }

    function togglePauseButton() {
        if (!sessionActive) return;
        if (sessionPaused) {
            resumeSession();
        } else {
            pauseSession();
        }
        updatePauseButton();
    }

    // ============================================================
    // 3. LÓGICA DE SESIONES
    // ============================================================
    function startSession(seconds) {
        if (!window.lr_helpers?.startBreathFlow) {
            showToast("Respiración no disponible");
            return;
        }

        sessionActive = true;
        sessionPaused = false;
        removeSessionControls();
        showSessionControls();

        // Arrancar respiración normal
        window.lr_helpers.startBreathFlow();

        if (seconds > 0) {
            remainingSeconds = seconds;
            sessionEndsAt = Date.now() + seconds * 1000;

            sessionInterval = setInterval(() => {
                if (!sessionActive) return;

                remainingSeconds = Math.max(0, Math.ceil((sessionEndsAt - Date.now()) / 1000));
                updateTimer();

                if (remainingSeconds <= 0) {
                    stopSession();
                    showToast("Sesión completada");
                }
            }, 1000);
        } else {
            remainingSeconds = Infinity;
            updateTimer();
        }

        showToast("Sesión iniciada");
    }

    function updateTimer() {
        const el = document.getElementById("lr_ctrl_timer");
        if (!el) return;
        el.textContent =
            remainingSeconds === Infinity ? "∞" : formatTime(remainingSeconds);
    }

    function pauseSession() {
        sessionPaused = true;
        if (sessionInterval) clearInterval(sessionInterval);
        window.lr_helpers.stopBreathFlow();
        window.lr_helpers.stopAmbient?.();
        showToast("Sesión pausada");
    }

    function resumeSession() {
        sessionPaused = false;
        if (remainingSeconds !== Infinity) {
            sessionEndsAt = Date.now() + remainingSeconds * 1000;
            sessionInterval = setInterval(() => {
                remainingSeconds = Math.max(0, Math.ceil((sessionEndsAt - Date.now()) / 1000));
                updateTimer();
                if (remainingSeconds <= 0) stopSession();
            }, 1000);
        }
        window.lr_helpers.startBreathFlow();
        window.lr_helpers.resumeAudio?.();
        showToast("Sesión reanudada");
    }

    function newSessionFlow() {
        stopSession();
        setTimeout(openSettingsModal, 200);
    }

    function stopSession() {
        sessionActive = false;
        sessionPaused = false;

        if (sessionInterval) clearInterval(sessionInterval);

        window.lr_helpers.stopBreathFlow?.();
        window.lr_helpers.stopAmbient?.();

        removeSessionControls();
        showToast("Sesión detenida");
    }

    // ============================================================
    // 4. Toast simple
    // ============================================================
    function showToast(msg) {
        if (!window.lr_showToast) {
            console.log("Toast:", msg);
            return;
        }
        window.lr_showToast(msg);
    }

    // ============================================================
    // 5. EXPONER API
    // ============================================================
    window.lr_breathSessions = {
        openSettingsModal,
        startSession,
        stopSession
    };
})();
