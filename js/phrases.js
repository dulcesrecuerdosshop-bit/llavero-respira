// phrases.js - frases completas + selección de fondo (gradientes + imágenes locales)
// Actualizado: mantiene todas las frases previas y añade interacciones robustas
(function(){
  // ---------- Datos (lista completa) ----------
  const frases = [
    "Cree en ti y todo será posible.",
    "Un paso hoy vale más que cien promesas mañana.",
    "La constancia vence lo que la suerte no alcanza.",
    "Lo único imposible es aquello que no intentas.",
    "Si caes, levántate con más fuerza y sabiduría.",
    "El éxito es la suma de pequeños esfuerzos repetidos.",
    "Hazlo con pasión o no lo hagas.",
    "Tu futuro lo construyes con las decisiones de hoy.",
    "No temas al error: es el comienzo del aprendizaje.",
    "Transforma los problemas en oportunidades.",
    "Avanza aunque sea despacio; avanzar es avanzar.",
    "Cada día es una nueva página: escribe algo valioso.",
    "El miedo frena, la acción impulsa.",
    "Aprende, adapta, mejora y repite.",
    "No esperes el momento perfecto; créalo.",
    "La disciplina supera al talento cuando el talento no se esfuerza.",
    "Tu actitud determina tu dirección.",
    "Enfócate en soluciones, no en excusas.",
    "La perseverancia abre puertas que parecían cerradas.",
    "Lo que hoy parece difícil será mañana rutina.",
    "Si buscas resultados distintos, prueba acciones distintas.",
    "Rodéate de quienes te inspiren a crecer.",
    "No te compares; compite con tu yo del ayer.",
    "La gratitud multiplica lo que ya tienes.",
    "Si fallas, es porque te atreviste a intentar algo grande.",
    "Cada logro comienza con la decisión de intentar.",
    "Mantén la calma y sigue hacia adelante.",
    "Tu esfuerzo es la inversión que paga en futuro.",
    "Cambia el “no puedo” por “voy a intentarlo”.",
    "Lo único que necesitas para empezar es empezar.",
    "La paciencia es la compañera de los grandes éxitos.",
    "No renuncies antes de ver los frutos de tu trabajo.",
    "Vive con intención y actúa con propósito.",
    "La creatividad nace cuando te permites equivocarte.",
    "Agradece lo pequeño: es semilla de lo grande.",
    "Si te caes siete veces, levántate ocho.",
    "La mayor barrera está entre tus oídos; derríbala.",
    "Trabaja en silencio; deja que el éxito haga ruido.",
    "Hoy planta lo que mañana te dará sombra.",
    "No dejes que la duda robe tus oportunidades.",
    "Cada día es otra chance para mejorar.",
    "El progreso es mejor que la perfección estancada.",
    "Cree en tu proceso aunque no veas el mapa completo.",
    "La acción es el puente entre tus sueños y la realidad.",
    "Sé valiente: lo grande se gana fuera de la zona de confort.",
    "Tu historia no termina con un tropiezo; continúa.",
    "Lo que haces hoy determina cómo te sentirás mañana.",
    "El esfuerzo silencioso construye el éxito visible.",
    "Acepta el cambio; en él está la oportunidad.",
    "No busques la aprobación; busca la mejora.",
    "Haz de cada obstáculo una lección aprendida.",
    "El éxito durable se forja con integridad y constancia.",
    "Vive con intención, trabaja con disciplina, celebra con humildad.",
    "El talento se pule con trabajo, no con excusas.",
    "No te detengas hasta sentirte orgulloso.",
    "Menos quejarse, más solucionar.",
    "Siembra hábitos hoy para cosechar tu mejor versión.",
    "Enfócate en el proceso; los resultados vendrán.",
    "Tu potencial es mayor de lo que piensas; aflóralo.",
    "Aprovecha el presente: es el único tiempo que controlas.",
    "La confianza se gana acciones tras acción.",
    "Lo difícil es temporal; el orgullo es permanente.",
    "Persigue progreso, no perfección.",
    "Cuando otros duden, muéstrate constante.",
    "Un logro a la vez construye grandes metas.",
    "Aprende a descansar sin renunciar a tus metas.",
    "No temas a los comienzos; son oportunidades disfrazadas.",
    "La mejor inversión es la que haces en ti mismo.",
    "Siembra esfuerzo hoy, recoge libertad mañana.",
    "Ve más allá de lo que te imaginaste posible.",
    "Rodéate de acciones, no de promesas.",
    "Cada pequeño avance suma un gran cambio.",
    "La disciplina forja el carácter y el destino.",
    "Mantén la visión cuando el camino sea oscuro.",
    "Confía en tu capacidad de adaptarte y superar.",
    "El éxito no es suerte; es trabajo bien orientado.",
    "La pasión enciende, la perseverancia mantiene.",
    "Celebra los pequeños triunfos; motivan los grandes.",
    "Enfócate en lo que puedes controlar y suelta lo demás.",
    "Las metas sin plan quedan en deseo; planifica y actúa.",
    "Si quieres resultados distintos, cambia tus hábitos.",
    "Lo que te limita hoy puede inspirarte mañana.",
    "Habla menos; muestra más con tus actos.",
    "El coraje no es ausencia de miedo, es actuar a pesar de él.",
    "Mantén la mente abierta y el compromiso firme.",
    "Sueña en grande, empieza en pequeño, crece constante.",
    "No te rindas: las historias más grandes tienen capítulos difíciles.",
    "Aprende a agradecer el proceso, no solo el resultado.",
    "La resiliencia te hace más fuerte que las circunstancias.",
    "Piensa en grande, actúa con persistencia y humildad.",
    "Lo que hoy es esfuerzo, mañana será costumbre.",
    "Construye hábitos que te acerquen a tus sueños.",
    "Siembra disciplina y cosecharás libertad.",
    "Pon intención en lo que haces y calidad en cómo lo haces.",
    "Cada día es una nueva oportunidad para reinventarte.",
    "No busques atajos; construye cimientos sólidos.",
    "El cambio empieza cuando decides dejar de esperar.",
    "Tu actitud hoy crea tus oportunidades de mañana.",
    "Sé la razón por la que alguien más no se rinda.",
    "Vive con propósito, trabaja con constancia y ama el camino."
  ];

  // ---------- Fondos (gradientes y rutas locales) ----------
  const fondos = [
    "linear-gradient(135deg, #f6d365, #fda085)",
    "linear-gradient(135deg, #a1c4fd, #c2e9fb)",
    "linear-gradient(135deg, #84fab0, #8fd3f4)",
    "linear-gradient(135deg, #fccb90, #d57eeb)",
    "linear-gradient(135deg, #f093fb, #f5576c)",
    "linear-gradient(135deg, #6a11cb, #2575fc)",
    "linear-gradient(135deg, #43cea2, #185a9d)",
    "linear-gradient(135deg, #ff9a9e, #fecfef)",
    "linear-gradient(135deg, #a18cd1, #fbc2eb)",
    "linear-gradient(135deg, #30cfd0, #330867)",
    // imágenes locales (si decides subirlas)
    "assets/bg1.webp",
    "assets/bg2.webp",
    "assets/bg3.webp",
    "assets/bg4.webp",
    "assets/bg5.webp"
  ];

  // ---------- Helpers DOM ----------
  const fraseEl = () => document.getElementById('frase-text') || document.getElementById('frase');
  const bgEl = () => document.getElementById('frase-bg');

  // evitar repetición inmediata
  let lastIndex = -1;
  let lastChangeAt = 0;

  // Preload images locales para evitar parpadeo
  function preloadImages(list){
    list.forEach(src=>{
      if (/\.(jpe?g|png|webp|avif)$/i.test(src)){
        const i = new Image();
        i.src = src;
      }
    });
  }
  preloadImages(fondos.filter(f=>/\.(jpe?g|png|webp|avif)$/i.test(f)));

  function applyBackgroundToElement(el, bgValue){
    if (!el) return;
    if (/\.(jpe?g|png|webp|avif)$/i.test(bgValue)){
      el.style.backgroundImage = `url('${bgValue}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
    } else {
      el.style.background = bgValue;
    }
  }

  // ---------- Mostrar frase (expuesta) ----------
  function mostrarFrase() {
    const now = Date.now();
    // simple debounce: no más de una cada 180ms
    if (now - lastChangeAt < 180) return;
    lastChangeAt = now;

    const fEl = fraseEl();
    const bEl = bgEl();
    if (!fEl) return;
    // elegir índice distinto al anterior cuando sea posible
    let i = Math.floor(Math.random()*frases.length);
    if (frases.length > 1) {
      let attempts = 0;
      while (i === lastIndex && attempts < 10) { i = Math.floor(Math.random()*frases.length); attempts++; }
    }
    lastIndex = i;
    const j = Math.floor(Math.random()*fondos.length);
    fEl.style.transition = 'opacity 140ms ease';
    fEl.style.opacity = 0;
    setTimeout(()=>{
      fEl.textContent = frases[i];
      // actualizar elemento legacy 'frase' para compatibilidad
      const legacy = document.getElementById('frase');
      if (legacy && legacy !== fEl) legacy.textContent = frases[i];
      const chosenBg = fondos[j];
      if (bEl) applyBackgroundToElement(bEl, chosenBg);
      fEl.style.opacity = 1;

      // Actualizar estado del botón favorito si existe
      try {
        const fav = document.getElementById('favBtn');
        if (fav) {
          if (window.lr_helpers && typeof window.lr_helpers.getFavorites === 'function') {
            const favs = window.lr_helpers.getFavorites() || [];
            const cur = frases[i];
            const isFav = favs.indexOf(cur) !== -1;
            fav.textContent = isFav ? '♥' : '♡';
            fav.setAttribute('aria-pressed', String(isFav));
          } else {
            // si no hay helpers, no hacemos más
            fav.textContent = '♡';
            fav.setAttribute('aria-pressed', 'false');
          }
        }
      } catch(e) { /* ignore */ }

      // notify optional hook
      if (typeof window.onFraseMostrada === 'function') {
        try { window.onFraseMostrada(frases[i]); } catch(e){ /* ignore */ }
      }
    }, 160);
  }

  // ---------- Interacciones (click en tarjeta, tecla Space) ----------
  function attachInteractions() {
    const card = document.getElementById('frase-card');
    if (card && !card.__phrases_listeners_attached) {
      // usar both touchstart (mobile snappy) y click
      const clickHandler = (ev) => {
        // si el click fue en un control (botón dentro de .frase-controls), no cambiar frase
        if (ev.target && ev.target.closest && ev.target.closest('.frase-controls')) return;
        mostrarFrase();
      };
      card.addEventListener('click', clickHandler);
      card.addEventListener('touchstart', clickHandler, { passive: true });
      card.__phrases_listeners_attached = true;
    }

    // Space key: evitar conflicto si el usuario está en un input/textarea
    if (!document.__phrases_space_attached) {
      document.addEventListener('keydown', (e) => {
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          mostrarFrase();
        }
      });
      document.__phrases_space_attached = true;
    }
  }

  // ---------- Control wiring con lr_helpers (seguro) ----------
  function wireControls() {
    if (document.__phrases_controls_wired) return;
    const getText = () => document.getElementById('frase-text')?.textContent || document.getElementById('frase')?.textContent || '';
    const tts = document.getElementById('ttsBtn');
    const fav = document.getElementById('favBtn');
    const dl = document.getElementById('downloadBtn');
    const share = document.getElementById('shareBtn');
    const invite = document.getElementById('inviteBtn');

    // helper to safely call lr_helpers methods when ready
    function callWhenHelpers(fn){
      if (window.lr_helpers) { try { fn(); } catch(e){ console.warn('[phrases] helper call failed', e); } return; }
      // wait up to 3s for helpers to be available
      let waited = 0;
      const iv = setInterval(()=> {
        waited += 100;
        if (window.lr_helpers) {
          clearInterval(iv);
          try{ fn(); } catch(e){ console.warn('[phrases] helper call failed after wait', e); }
        } else if (waited > 3000) clearInterval(iv);
      }, 100);
    }

    // TTS
    if (tts) {
      tts.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const text = getText();
        callWhenHelpers(()=> {
          if (window.lr_helpers.playTTS) window.lr_helpers.playTTS(text);
        });
      });
    }

    // Favorito (toggle)
    if (fav) {
      fav.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const text = getText();
        if (!text) return;
        callWhenHelpers(()=> {
          if (window.lr_helpers.toggleFavorite) {
            const added = window.lr_helpers.toggleFavorite(text);
            fav.textContent = added ? '♥' : '♡';
            fav.setAttribute('aria-pressed', String(added));
          } else {
            // fallback localStorage minimal
            try {
              const key = 'lr_favoritos_v1';
              const raw = localStorage.getItem(key) || '[]';
              const arr = JSON.parse(raw);
              const idx = arr.indexOf(text);
              if (idx === -1) { arr.unshift(text); localStorage.setItem(key, JSON.stringify(arr.slice(0,200))); fav.textContent = '♥'; fav.setAttribute('aria-pressed', 'true'); }
              else { arr.splice(idx,1); localStorage.setItem(key, JSON.stringify(arr)); fav.textContent = '♡'; fav.setAttribute('aria-pressed', 'false'); }
            } catch(e){ console.warn(e); }
          }
        });
      });
    }

    // Descargar
    if (dl) {
      dl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const el = document.querySelector('.frase-card') || document.body;
        callWhenHelpers(()=> {
          if (window.lr_helpers.downloadPhraseImage) window.lr_helpers.downloadPhraseImage(el);
        });
      });
    }

    // Compartir
    if (share) {
      share.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const text = getText();
        callWhenHelpers(()=> {
          if (window.lr_helpers.sharePhrase) window.lr_helpers.sharePhrase({ title:'Frase', text, url: location.href });
          else {
            const wa = `https://api.whatsapp.com/send?text=${encodeURIComponent(text + '\n' + location.href)}`;
            window.open(wa, '_blank');
          }
        });
      });
    }

    // Invitar
    if (invite) {
      invite.addEventListener('click', (ev) => {
        ev.stopPropagation();
        callWhenHelpers(()=> {
          if (window.lr_helpers.inviteFriend) window.lr_helpers.inviteFriend();
          else {
            const baseUrl = location.origin + location.pathname;
            const msg = `¡Tengo mi Llavero Respira de Dulces Recuerdos! Me está encantando. Échale un vistazo: ${baseUrl}`;
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
          }
        });
      });
    }

    // inicializar estado del botón favorito si helpers lo soporta
    callWhenHelpers(()=> {
      try {
        if (fav && window.lr_helpers && typeof window.lr_helpers.getFavorites === 'function') {
          const favs = window.lr_helpers.getFavorites() || [];
          const cur = document.getElementById('frase-text')?.textContent || document.getElementById('frase')?.textContent || '';
          if (cur && favs.indexOf(cur) !== -1) { fav.textContent = '♥'; fav.setAttribute('aria-pressed', 'true'); }
          else { fav.textContent = '♡'; fav.setAttribute('aria-pressed', 'false'); }
        }
      } catch(e){ /* ignore */ }
    });

    document.__phrases_controls_wired = true;
  }

  // ---------- Inicialización y exposición ----------
  window.mostrarFrase = mostrarFrase;

  document.addEventListener('DOMContentLoaded', () => {
    // mostrar frase inicial
    mostrarFrase();
    // interacciones y controles
    attachInteractions();
    wireControls();
    // also try wiring again after short delay in case helpers load later
    setTimeout(wireControls, 700);
  });

})();
