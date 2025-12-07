// clientPhrases.js
// Microtextos cálidos por categoría.
// Consumo: window.ClientPhrases.get(category)

(function(){
  'use strict';
  window.ClientPhrases = (function(){
    const phrases = {
      calma: [
        "Respira suave, estás haciendo lo mejor que puedes ahora.",
        "Un instante de calma: inhala y suelta con amabilidad.",
        "Permítete un respiro y notar tu pecho expandirse."
      ],
      validacion: [
        "Está bien sentirlo. Tu experiencia es válida y real.",
        "No tienes que arreglar nada ahora; estás permitido sentir.",
        "Tu emoción tiene sentido. Estoy contigo en esto."
      ],
      motivacion: [
        "Un paso pequeño hoy prepara un camino mañana.",
        "Lo que haces con constancia, suma con ternura.",
        "Confía en la suma de tus pequeños esfuerzos."
      ],
      anclaje: [
        "Siente el apoyo bajo tus pies, respira y vuelve al presente.",
        "Trae la atención a tu cuerpo: tres respiraciones conscientes.",
        "Tus sentidos te anclan. Suelta lo que ya pasó."
      ],
      bienvenida: [
        "Bienvenida/o — gracias por estar aquí un momento.",
        "Hoy puedes tomar un instante solo para ti.",
        "Encantados de acompañarte: empecemos suavemente."
      ],
      rutina: [
        "Un pequeño recuerdo: respira y vuelve a lo que importa.",
        "Hoy, un microtexto: cuida de ti con suavidad.",
        "Pequeñas pausas sostienen grandes cambios."
      ],
      profundo: [
        "Si te apetece, te acompaño en una respiración más profunda.",
        "Llega al centro de tu cuerpo con respiraciones más largas.",
        "Toma un espacio para descender y recuperar el ritmo."
      ],
      crisis: [
        "Estoy aquí contigo. No estás sola/o en esto.",
        "Vamos paso a paso: lo esencial ahora es tu seguridad y calma.",
        "Si quieres, te guío en un ejercicio corto y sostén."
      ]
    };

    function get(category) {
      if (!category || !phrases[category]) return [];
      return phrases[category].slice(0);
    }

    function random(category) {
      const arr = get(category);
      if (!arr.length) return null;
      return arr[Math.floor(Math.random()*arr.length)];
    }

    return {
      get,
      random
    };
  })();
})();
