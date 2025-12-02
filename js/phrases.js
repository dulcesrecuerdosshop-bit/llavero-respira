// phrases.js - frases completas y selección de fondo (gradientes + imágenes locales)
// Reemplaza js/phrases.js por este archivo para usar todas las frases existentes.

(function(){
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

  // Fondos: mezcla de gradientes y rutas a imágenes locales (si subes imágenes a /assets/)
  const fondos = [
    // Gradientes (siempre seguros, ligeros)
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

    // Imágenes locales (sube images a /assets/ con estos nombres o cambia las rutas)
    "assets/bg1.webp",
    "assets/bg2.webp",
    "assets/bg3.webp",
    "assets/bg4.webp",
    "assets/bg5.webp"
  ];

  // Helpers para DOM
  const fraseEl = () => document.getElementById('frase-text');
  const bgEl = () => document.getElementById('frase-bg');

  // Preload image backgrounds (optional but nice)
  function preloadImages(list){
    list.forEach(src=>{
      if (/\.(jpe?g|png|webp|avif)$/i.test(src)){
        const i = new Image();
        i.src = src;
      }
    });
  }
  // Preload local images only
  preloadImages(fondos.filter(f=>/\.(jpe?g|png|webp|avif)$/i.test(f)));

  function applyBackgroundToElement(el, bgValue){
    if (!el) return;
    // if bgValue is an image path (ends with common extension), use backgroundImage
    if (/\.(jpe?g|png|webp|avif)$/i.test(bgValue)){
      el.style.backgroundImage = `url('${bgValue}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
      // ensure overlay darkness via filter or using a pseudo overlay in CSS
    } else {
      // assume gradient or CSS background string
      el.style.background = bgValue;
    }
  }

  function mostrarFrase() {
    const fEl = fraseEl();
    const bEl = bgEl();
    if (!fEl) return;
    const i = Math.floor(Math.random()*frases.length);
    const j = Math.floor(Math.random()*fondos.length);
    fEl.style.opacity = 0;
    setTimeout(()=>{
      fEl.textContent = frases[i];
      const chosenBg = fondos[j];
      if (bEl) applyBackgroundToElement(bEl, chosenBg);
      fEl.style.opacity = 1;
      if (typeof window.onFraseMostrada === 'function') window.onFraseMostrada(frases[i]);
    }, 160);
  }

  // Exponer la función para que otros scripts la llamen
  window.mostrarFrase = mostrarFrase;

  // Mostrar una frase inicial cuando el DOM esté listo
  document.addEventListener('DOMContentLoaded', () => { if (!document.hidden) mostrarFrase(); });
})();
