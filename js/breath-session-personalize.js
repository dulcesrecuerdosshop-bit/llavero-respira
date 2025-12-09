// breath-session-personalize.js
// Personalización de modal de sesión con banco de frases por estado y por nivel.
// - Selecciona frase específica basada en estadoEmocionalActual + nivelDeAnsiedad + tensionTipo
// - Mantiene backups, restauración y observer
// - API: window.__breathPersonalFixed.runNow(name, timerText)
(function () {
    'use strict';

    // ===== Config =====
    var MESSAGE_TEMPLATE_WITH_PHRASE =
        '{name}, {phrase} Cuando estés lista, selecciona el tiempo que quieres dedicarle a tu sesión; después te sentirás mucho mejor.';

    var MESSAGE_TEMPLATE_DEFAULT =
        '{name}, cuando estés lista, selecciona el tiempo que quieres dedicarle a tu sesión; después te sentirás mucho mejor.';

    var MARKER_ATTR = 'data-breath-personalized';
    var ORIGINAL_ATTR = 'data-breath-original-html';
    var NAME_ATTR = 'data-breath-personalized-name';
    var TIMER_ORIG_ATTR = 'data-breath-original-timer';
    var TIMER_STORED_ATTR = 'data-breath-timer-text';

    var CANDIDATE_SELECTOR =
        'div[data-sessions-loaded="1"], [role="dialog"], .breath-modal, .modal';

    var SESSION_PHRASE_SNIPPET = 'ya tenemos preparada tu sesión';

    // ===== Phrase bank: por estado y nivel =====
    var PHRASE_BANK = {
        ansiedad: [
            'sé que ahora notas esa inquietud en el cuerpo, vamos a respirar suave para devolverte claridad poco a poco.',
            'entiendo esa sensación de desborde; hagamos una respiración guiada para ayudarte a bajar el ritmo interno.',
            'vamos a acompañar esa tensión con una práctica tranquila que te devuelva control sobre tu cuerpo.',
            'estás a salvo; respira conmigo para bajar el nivel de ansiedad paso a paso.',
            'lo estás haciendo muy bien; respiremos despacio para ayudarte a estabilizar este momento de intensidad.'
        ],

        tenso: {
            muscular: [
                'respiremos despacio para que tus músculos empiecen a soltar esa presión que llevas acumulando.',
                'vamos a liberar esa tensión muscular con respiraciones profundas y un ritmo tranquilo.',
                'te acompaño en un ejercicio que ayudará a cuello, mandíbula y hombros a suavizarse.',
                'tu cuerpo te está pidiendo una pausa; respiremos lento para ayudarlo.',
                'permite que cada exhalación afloje un poco más esa tensión muscular que sientes.'
            ],
            nervioso: [
                'sé que la mente está acelerada; respiremos en un ritmo estable para darte calma.',
                'tu cuerpo está en alerta, pero vamos a bajar ese nivel con respiraciones guiadas.',
                'te acompaño a encontrar un ritmo que reduzca poco a poco este nerviosismo.',
                'respiremos juntas para suavizar la tensión mental que estás sintiendo.',
                'vamos a centrar la respiración para que tu sistema pueda bajar revoluciones.'
            ],
            estres: [
                'sé que estás bajo presión; hagamos una respiración que te devuelva espacio y claridad.',
                'vamos a hacer una práctica suave para aliviar este momento de estrés.',
                'respiremos para darle un respiro a tu mente y a tu cuerpo.',
                'vamos a bajar la activación con respiraciones largas y tranquilas.',
                'respira conmigo para calmar el sistema nervioso y aflojar esta carga momentánea.'
            ],
            default: [
                'vamos a respirar para ayudarte a soltar parte de esta tensión.',
                'te acompaño en una práctica suave para que puedas aflojar un poco.',
                'respiremos juntas y deja que tu cuerpo encuentre espacio.',
                'te guío en una respiración que te ayudará a estabilizarte.',
                'empezamos una práctica lenta diseñada para ayudarte a bajar la tensión.'
            ]
        },

        crisis: [
            'estoy contigo; respiremos muy despacio para ayudarte a recuperar estabilidad.',
            'entiendo lo que sientes ahora mismo; hagamos una respiración guiada para bajar esta activación.',
            'respira cuando puedas; te acompaño sin prisa y con calma.',
            'vamos a hacer respiraciones largas para ayudarte a bajar la intensidad de este momento.',
            'no estás sola; respira conmigo suavemente y paso a paso.'
        ],

        neutral: [
            'hagamos una respiración suave para que puedas reconectar contigo.',
            'una breve práctica para darte claridad y calma.',
            'respiremos tranquilamente para mantener equilibrio y bienestar.',
            'vamos a sostener un ritmo relajante que acompañe tu momento.',
            'una pausa de respiración para centrarte y volver a ti.'
        ],

        motivacion: [
            'hagamos una respiración que te dé energía y claridad para continuar tu día.',
            'te acompaño en una respiración rítmica que aumenta motivación y enfoque.',
            'respiremos juntas para despertar tu energía interna.',
            'una serie de respiraciones para activar vitalidad y claridad mental.',
            'vamos a respirar con ritmo para que recuperes impulso y fuerza.'
        ]
    };

    // ===== Estado interno =====
    var nameCache = null;
    var observer = null;
    var hooksInstalled = false;

    // ===== Util =====
    function normalize(s) {
        return (s || '').replace(/\s+/g, ' ').trim();
    }

    function chooseFromArray(arr, level) {
        if (!Array.isArray(arr)) return null;
        var idx = Math.max(0, Math.min(arr.length - 1, (Number(level) || 1) - 1));
        return arr[idx] || arr[0];
    }
    // Selecciona frase del banco según estado, nivel y tensionTipo
    function selectPhraseForUser(data) {
        try {
            if (!data) return null;

            var estado = (data.estadoEmocionalActual || '')
                .toString()
                .toLowerCase();

            var nivel = Number(data.nivelDeAnsiedad || data.nivel || 1);

            var tension = (data.tensionTipo || '')
                .toString()
                .toLowerCase();

            // crisis primero
            if (estado.indexOf('crisis') !== -1) {
                return chooseFromArray(PHRASE_BANK.crisis, nivel);
            }

            // ansiedad / ansioso
            if (
                estado.indexOf('ansiedad') !== -1 ||
                estado.indexOf('ansioso') !== -1
            ) {
                return chooseFromArray(PHRASE_BANK.ansiedad, nivel);
            }

            // tenso + subtipo
            if (
                estado.indexOf('tenso') !== -1 ||
                estado.indexOf('tensión') !== -1
            ) {
                if (tension && PHRASE_BANK.tenso[tension]) {
                    return chooseFromArray(PHRASE_BANK.tenso[tension], nivel);
                }
                return chooseFromArray(PHRASE_BANK.tenso.default, nivel);
            }

            // motivación
            if (estado.indexOf('motiv') !== -1) {
                return chooseFromArray(PHRASE_BANK.motivacion, nivel);
            }

            // neutral
            if (estado.indexOf('neutral') !== -1) {
                return chooseFromArray(PHRASE_BANK.neutral, nivel);
            }

            // fallback neutral
            return chooseFromArray(PHRASE_BANK.neutral, nivel);
        } catch (e) {
            return null;
        }
    }

    function buildMessage(name, phrase) {
        name = name || 'amiga';

        if (phrase && phrase.trim()) {
            return MESSAGE_TEMPLATE_WITH_PHRASE
                .replace('{name}', name)
                .replace('{phrase}', phrase);
        }

        return MESSAGE_TEMPLATE_DEFAULT.replace('{name}', name);
    }

    // ===== DOM helpers =====
    function findCandidates() {
        var candidates = Array.from(
            document.querySelectorAll(CANDIDATE_SELECTOR)
        );
        if (candidates.length) return candidates;

        var all = Array.from(document.querySelectorAll('div'));
        for (var i = 0; i < all.length; i++) {
            try {
                var d = all[i];
                if (
                    d.textContent &&
                    /Temporizador de sesi[oó]n/i.test(d.textContent) &&
                    d.querySelector &&
                    d.querySelector('select')
                ) {
                    candidates.push(d);
                }
            } catch (e) {}
        }

        return candidates;
    }

    function findSubtitleNode(container) {
        if (!container) return null;

        try {
            // Buscar nodo que contenga la frase original o fragmento típico
            var el = Array.from(container.querySelectorAll('*')).find(function (
                e
            ) {
                var t = normalize(e.textContent || '').toLowerCase();
                return (
                    t.indexOf(SESSION_PHRASE_SNIPPET) !== -1 ||
                    t.indexOf('tras ella, te sentirás mejor') !== -1 ||
                    t.indexOf('solo tienes que seleccionar el tiempo') !== -1
                );
            });

            if (el) return el;

            // fallback general
            var fallback = Array.from(
                container.querySelectorAll('p,div,span')
            ).find(function (n) {
                var t = (n.textContent || '').trim();
                if (!t || t.length < 8) return false;
                if (n.querySelector && n.querySelector('button,select'))
                    return false;
                return /sesión|temporizador/i.test(t) || t.length < 300;
            });

            if (fallback) return fallback;
        } catch (e) {}

        return null;
    }

    function findTimerHeading(container) {
        if (!container) return null;

        try {
            var headings = container.querySelectorAll(
                'h1,h2,h3,h4,h5,h6'
            );

            for (var i = 0; i < headings.length; i++) {
                var h = headings[i];
                if (
                    /Temporizador de sesi[oó]n/i.test(
                        normalize(h.textContent || '')
                    )
                )
                    return h;
            }

            var sel = container.querySelector('select');
            if (sel) {
                var prev = sel.previousElementSibling;
                if (prev && /^h\d$/i.test(prev.tagName)) return prev;
            }
        } catch (e) {}

        return null;
    }
    // === Personalización del contenedor ===
    function personalizeContainer(container, name, timerText) {
        if (!container) return 0;

        name = (name || nameCache || '').trim();

        // Obtener datos del usuario desde donde estén:
        var userData = null;
        try {
            userData =
                window.CLIENT_USER ||
                JSON.parse(
                    localStorage.getItem('lr_client_runtime') ||
                        localStorage.getItem('lr_client_runtime_user') ||
                        '{}'
                );
        } catch (e) {
            userData = window.CLIENT_USER || {};
        }

        // Seleccionar frase
        var phrase = selectPhraseForUser(userData);

        // Construir mensaje final
        var message = buildMessage(
            name || (userData && userData.nombre) || 'amiga',
            phrase
        );

        // Evitar modificaciones repetidas
        var existingName =
            container.getAttribute &&
            container.getAttribute(NAME_ATTR);

        var existingStored =
            container.getAttribute &&
            container.getAttribute('data-breath-mood-phrase');

        if (
            container.getAttribute &&
            container.getAttribute(MARKER_ATTR) === '1' &&
            existingName &&
            existingName === (name || '') &&
            existingStored &&
            existingStored === phrase
        ) {
            return 0; // nada nuevo
        }

        // Guardar HTML original la primera vez
        try {
            if (!container.hasAttribute(ORIGINAL_ATTR)) {
                container.setAttribute(
                    ORIGINAL_ATTR,
                    encodeURIComponent(container.innerHTML)
                );
            }
        } catch (e) {}

        // ====== Reemplazo inteligente ======
        try {
            var target = findSubtitleNode(container);

            if (target) {
                // Cambiar texto directamente
                if (target.nodeType === Node.TEXT_NODE) {
                    target.nodeValue = message;
                } else {
                    target.textContent = message;
                }
            } else {
                // Insertar al inicio si no hay target
                var insert = document.createElement('div');
                insert.textContent = message;
                insert.style.marginBottom = '8px';
                container.insertBefore(insert, container.firstChild);

                // Eliminar frases antiguas
                Array.from(container.querySelectorAll('*')).forEach(
                    function (n) {
                        try {
                            var t = (n.textContent || '').trim();
                            if (!t) return;

                            if (
                                /Solo tienes que seleccionar el tiempo que puedes dedicarle|Tras ella, te sentirás mejor|ya tenemos preparada tu sesión/i.test(
                                    t
                                ) &&
                                n !== insert
                            ) {
                                n.remove();
                            }
                        } catch (e) {}
                    }
                );
            }
        } catch (e) {
            console.warn(
                '[breath-personalize] replace failed',
                e
            );
        }

        // ====== Personalización del título del temporizador ======
        if (typeof timerText === 'string') {
            try {
                var heading = findTimerHeading(container);

                if (heading) {
                    if (!container.hasAttribute(TIMER_ORIG_ATTR)) {
                        container.setAttribute(
                            TIMER_ORIG_ATTR,
                            encodeURIComponent(heading.innerHTML)
                        );
                    }

                    heading.textContent = timerText;
                    container.setAttribute(
                        TIMER_STORED_ATTR,
                        timerText
                    );
                }
            } catch (e) {}
        }

        // Marcar como personalizado
        try {
            container.setAttribute(MARKER_ATTR, '1');
            container.setAttribute(NAME_ATTR, name || '');
            if (phrase)
                container.setAttribute(
                    'data-breath-mood-phrase',
                    phrase
                );
        } catch (e) {}

        return 1; // aplicado
    }

    // === Aplicar personalización a todos los modales ===
    function scanAndApply(name, timerText) {
        var applied = 0;
        var candidates = findCandidates();

        for (var i = 0; i < candidates.length; i++) {
            try {
                applied += personalizeContainer(
                    candidates[i],
                    name,
                    timerText
                );
            } catch (e) {}
        }

        return applied;
    }

    // === Hooks de red para capturar el nombre del usuario ===
    function installNetworkHooks() {
        if (hooksInstalled) return;

        // ---- Hook fetch ----
        try {
            if (window.fetch) {
                var originalFetch = window.fetch.bind(window);

                window.fetch = function () {
                    var args = Array.prototype.slice.call(arguments);

                    return originalFetch
                        .apply(window, args)
                        .then(function (resp) {
                            try {
                                var url =
                                    (resp && resp.url) || args[0];

                                if (
                                    typeof url === 'string' &&
                                    /\/users\//i.test(url)
                                ) {
                                    resp.clone()
                                        .json()
                                        .then(function (data) {
                                            if (
                                                data &&
                                                data.nombre
                                            ) {
                                                nameCache =
                                                    data.nombre.trim();
                                                scanAndApply(
                                                    nameCache
                                                );
                                            }
                                        })
                                        .catch(function () {});
                                }
                            } catch (e) {}

                            return resp;
                        });
                };
            }
        } catch (e) {}

        // ---- Hook XMLHttpRequest ----
        try {
            if (window.XMLHttpRequest) {
                var origOpen = XMLHttpRequest.prototype.open;
                var origSend = XMLHttpRequest.prototype.send;

                XMLHttpRequest.prototype.open = function (
                    method,
                    url
                ) {
                    try {
                        this.__breath_url = url;
                    } catch (e) {}
                    return origOpen.apply(this, arguments);
                };

                XMLHttpRequest.prototype.send = function () {
                    this.addEventListener(
                        'readystatechange',
                        function () {
                            try {
                                if (
                                    this.readyState === 4 &&
                                    this.__breath_url &&
                                    /\/users\//i.test(
                                        this.__breath_url
                                    )
                                ) {
                                    try {
                                        var txt =
                                            this.responseText;

                                        if (txt) {
                                            var data =
                                                JSON.parse(txt);

                                            if (
                                                data &&
                                                data.nombre
                                            ) {
                                                nameCache =
                                                    data.nombre.trim();

                                                scanAndApply(
                                                    nameCache
                                                );
                                            }
                                        }
                                    } catch (e) {}
                                }
                            } catch (e) {}
                        }
                    );

                    return origSend.apply(this, arguments);
                };
            }
        } catch (e) {}

        hooksInstalled = true;
    }
    // === Buscar nombre del usuario en storage o en window ===
    function findNameFromStorageOrWindow() {
        try {
            var v = localStorage.getItem('breath_user_name');
            if (v && v.trim()) return v.trim();
        } catch (e) {}

        try {
            var props = Object.getOwnPropertyNames(window);

            for (var i = 0; i < props.length; i++) {
                try {
                    var val = window[props[i]];

                    if (val && typeof val === 'object') {
                        if (
                            val.nombre &&
                            typeof val.nombre === 'string' &&
                            val.nombre.trim()
                        )
                            return val.nombre.trim();

                        var keys = ['user', 'usuario', 'currentUser', 'me'];
                        for (var k = 0; k < keys.length; k++) {
                            var kk = keys[k];
                            if (
                                val[kk] &&
                                val[kk].nombre &&
                                typeof val[kk].nombre === 'string' &&
                                val[kk].nombre.trim()
                            )
                                return val[kk].nombre.trim();
                        }
                    } else if (
                        typeof val === 'string' &&
                        props[i].toLowerCase().indexOf('name') !== -1 &&
                        val.trim()
                    ) {
                        return val.trim();
                    }
                } catch (e) {}
            }
        } catch (e) {}

        return null;
    }

    // === MutationObserver para detectar cuando aparece el modal ===
    function startObserver() {
        if (observer) return;

        observer = new MutationObserver(function () {
            try {
                var name =
                    nameCache || findNameFromStorageOrWindow();
                if (name) nameCache = name;

                scanAndApply(name);
            } catch (e) {}
        });

        observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true
        });

        // Intento tardío inicial
        setTimeout(function () {
            var name =
                nameCache || findNameFromStorageOrWindow();
            if (name) nameCache = name;
            scanAndApply(name);
        }, 80);

        installNetworkHooks();
    }

    // === API pública ===
    window.__breathPersonalFixed =
        window.__breathPersonalFixed || {};

    // Forzar personalización manual
    window.__breathPersonalFixed.runNow = function (
        name,
        timerText
    ) {
        if (name && typeof name === 'string') {
            nameCache = name.trim();
            try {
                localStorage.setItem('breath_user_name', nameCache);
            } catch (e) {}
        }

        return scanAndApply(
            nameCache,
            typeof timerText === 'string' ? timerText : undefined
        );
    };

    // Recuperar nombre detectado
    window.__breathPersonalFixed.findName = function () {
        return nameCache || findNameFromStorageOrWindow();
    };

    // Restaurar modales a su estado original
    window.__breathPersonalFixed.restore = function () {
        try {
            var restored = 0;
            var nodes = Array.from(
                document.querySelectorAll('[' + ORIGINAL_ATTR + ']')
            );

            nodes.forEach(function (c) {
                try {
                    var orig = c.getAttribute(ORIGINAL_ATTR);
                    if (orig != null) {
                        c.innerHTML = decodeURIComponent(orig);
                        c.removeAttribute(ORIGINAL_ATTR);
                        c.removeAttribute(MARKER_ATTR);
                        c.removeAttribute(NAME_ATTR);
                        c.removeAttribute(TIMER_ORIG_ATTR);
                        c.removeAttribute(TIMER_STORED_ATTR);
                        c.removeAttribute('data-breath-mood-phrase');
                        restored++;
                    }
                } catch (e) {}
            });

            return restored;
        } catch (e) {
            return 0;
        }
    };

    // Desactivar personalización y observar cambios
    window.__breathPersonalFixed.disconnect = function () {
        try {
            observer && observer.disconnect();
            observer = null;
        } catch (e) {}
    };

    // === Arranque automático ===
    startObserver();

    console.debug(
        '[breath-personalize] cargado y listo. Usa window.__breathPersonalFixed.runNow("María") para forzar personalización.'
    );
})();
