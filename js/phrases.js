// phrases.js - Lista de fragmentos (micro-lecturas) para Llavero Respira
// Este archivo contiene la colección completa de fragmentos y la lógica mínima
// para inicializar fondos y mostrar una frase aleatoria.
// IMPORTANTE: mostrarFrase() expone el índice y la frase actual en window para que
// el TTS / compartir / descarga siempre usen la versión "oficial" en memoria.
//
// Reemplaza completamente el archivo js/phrases.js por este contenido.
// Luego limpia cache / service worker y recarga la web para aplicar los cambios.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Lista de frases (micro-lecturas)
  // ---------------------------------------------------------------------------
  const frases = [
`A veces lo único que necesitas es un momento contigo.
Cerrar los ojos, inhalar profundo y soltar despacio.
Escuchar tu cuerpo antes que el ruido de fuera.
Respira. Vas mejor de lo que crees.
Y mañana, aún mejor.`,

`Hoy permítete no correr.
No cumplir todas las expectativas, solo las tuyas.
La vida no te pide que seas perfecta,
te pide que sigas presente.
Respira, vuelve a tu centro y continúa.`,

`Tú también mereces lugares suaves.
Pensamientos que no duelan, palabras que abracen.
Hoy regálate calma sin sentir culpa.
Respira despacio y recuerda:
ser amable contigo también cuenta como avanzar.`,

`No estás llegando tarde a nada.
Estás justo en el punto donde tu alma aprende.
Lo que no entiendes aún, mañana será claridad.
Respira profundo y suelta la prisa.
El camino también te está eligiendo a ti.`,

`No importa cuántas veces te hayas desordenado.
Puedes volver a acomodarte todas las que necesites.
Respira, repara, recomienza.
Tú tienes permiso para empezar lento.
Y para empezar de nuevo.`,

`Hoy intenta esto:
pon tu mano en el pecho, siente tu ritmo.
Ese latido eres tú recordándote que sigues aquí.
Respira lento, agradece tu historia,
y sigue con la cabeza alta.`,

`Hay días en los que simplemente sostenerte ya es un logro.
No hace falta demostrar nada a nadie.
Solo respirar, poner un pie delante del otro
y no soltar tu propia mano.
Eso también es valentía.`,

`Respira hondo.
Imagina que el aire limpia lo que pesa
y abre un espacio nuevo dentro de ti.
Esta calma es tuya, no es prestada.
Vuelve a ella cada vez que lo necesites.`,

`No estás rota; estás aprendiendo.
Cada emoción difícil es un mensaje, no un enemigo.
Respira y pregúntate qué necesitas, no qué hiciste mal.
Cuidarte también es escuchar tu dolor.
Y abrazarte con paciencia.`,

`Deja que llegue la calma, aunque sea en pequeñas olas.
Una pausa en medio del caos también es sagrada.
Respira, suelta los hombros y vuelve a ti.
Tu hogar está dentro, no fuera.
Y allí siempre hay sitio para descansar.`,

`Haz una pausa.
Respira contando hasta cuatro, suelta contando hasta seis.
Siente cómo tu cuerpo vuelve a su sitio.
Tú puedes con esto y con más.
Solo no te olvides de ti en el proceso.`,

`Un día a la vez.
Esa es la forma en que se reconstruyen las cosas verdaderas.
Respira cuando duela, avanza cuando puedas.
Tu historia no termina aquí:
hoy es solo un capítulo más, no el final.`,

`Respira y observa tu día como si fueras su visitante.
Nada es tan inmenso como parece.
Tú puedes elegir tu ritmo, tu tono y tu voz.
Hoy elige suavidad, para ti.
Y mira cómo cambia todo.`,

`Si te sientes perdida, vuelve al aire.
Respira profundo, vuelve al presente.
Desde aquí puedes volver a comenzar.
Paso a paso, pensamiento a pensamiento.
Tu calma es un camino, no un destino.`,

`Eres capaz incluso cuando dudas.
La duda no es señal de debilidad, es señal de que estás creciendo.
Respira, acomoda tus emociones,
y recuerda que cada pequeña acción suma.
Estás construyendo algo hermoso.`,

`A veces lo más valiente es dejar de exigirte.
Respirar, sentarte contigo, sentir lo que hay.
No taparlo, no huir, solo estar.
Tu historia merece esta pausa.
Date esta tregua.`,

`Respira y vuelve a tu corazón.
Allí aún vive la versión de ti que soñaba grande.
No la olvides en medio de la rutina.
Hoy dale un poco de espacio,
aunque sea durante un minuto.`,

`Si hoy pesas, sé ligera contigo.
Habla con ternura, muévete despacio.
Respira como quien vuelve a casa.
Porque eso eres tú:
una casa a la que siempre puedes regresar.`,

`Cierra los ojos un momento.
Imagina que te sostienes la mano a ti misma.
Respira, di tu nombre con cariño.
Estás aquí, estás a salvo, estás aprendiendo.
Eso es suficiente por hoy.`,

`Respira hasta que el pecho se afloje.
Hasta que el ruido deje de dirigir tus pasos.
Hay un lugar dentro de ti donde siempre hay paz.
Hoy acércate a él.
Quédate el tiempo que necesites.`,

`Hoy practica decir "basta" con cariño.
Basta para lo que te agota, basta para lo que no suma.
Respira y marca un borde amable.
Protegerte no es egoísta; es necesario.
Cuídate como cuidarías a un amigo querido.`,

`No necesitas resolverlo todo.
Algunas cosas se ordenan solas con el tiempo.
Respira, abre las manos y confía en el proceso.
Tu labor hoy puede ser simplemente sostenerte.
Eso ya es bastante.`,

`Cuando la tormenta llegue, busca tu centro.
Respira como ancla, siente cómo algo en ti no se mueve.
Poco a poco el ruido bajará.
Respira, espera y actúa desde la calma.`,

`Permítete pequeñas celebraciones.
Respira y recuerda tres cosas que hiciste hoy bien.
Aunque sean pequeñas, son tuyas.
La gratitud cambia la perspectiva; úsala hoy.`,

`La compasión es una práctica diaria.
Respira y obsérvate sin juicio.
Si te tratas con ternura, enseñas al mundo a tratarte igual.
Un gesto amable contigo es semilla de muchos días mejores.`,

`Tu valor no se mide por la productividad.
Respira y recuerda que descansar también produce fruto.
Aceptar límites es una forma de sabiduría.
Cuida tu energía como cuidas lo que quieres mantener.`,

`Hoy elige ser menos perfecto y más presente.
Respira y conecta con lo que estás sintiendo ahora.
No hace falta esforzarse tanto por ser adecuado.
Tu presencia, tal cual, es suficiente.`,

`Respira y escucha el silencio entre tus pensamientos.
Ese intervalo es el hogar de la calma.
Cuando vuelves a él, todo parece más claro.
Vuelve tantas veces como haga falta.`,

`Cuando te compares, vuelve al aire.
Respira y mira desde tu propia trayectoria.
Cada vida tiene su tiempo y su ritmo.
Respira para recordar tu propio compás.`,

`No subestimes el poder de una pausa breve.
Respira cinco segundos ahora; siente la diferencia.
Las pequeñas respiraciones suman días más suaves.
Hazlo otra vez cuando lo necesites.`,

`Respira y piensa en una palabra que te calme.
Repite esa palabra en la exhalación.
Hazlo tres veces seguidas.
Verás cómo tu cuerpo se relaja poco a poco.`,

`Acepta tu ritmo hoy; puede ser más lento y está bien.
Respira, camina despacio, mira el cielo.
La prisa no mejora la honestidad de tu camino.
Tú mereces este paso tranquilo.`,

`Respira y confía en tus decisiones aprendidas.
No todas serán perfectas, pero te enseñarán.
La experiencia te hace más sabio, no más culpable.
Respira y sigue con la confianza de quien aprende.`,

`Respira y repite: "estoy en este momento".
Esa frase te ancla a lo real.
Suelta fantasmas del pasado y preocupaciones por el futuro.
Hoy hay una única tarea: estar aquí.`,

`Si sientes que el miedo gana terreno, respira y nombra tu miedo.
Verlo lo hace menor.
Respira con intención, y acto seguido da un paso pequeño.
La valentía aparece en los pasos diminutos.`,

`Respira, observa tu hombros y suéltalos.
Concéntrate en lo que puedes controlar.
Deja ir lo demás con la exhalación.
Repite hasta sentir cierta ligereza.`,

`Hoy no necesitas tener respuesta para cada pregunta.
Respira y acepta la incertidumbre como maestra.
Con el tiempo la claridad aparece; por ahora, apóyate en tu aliento.`,

`Respira y piensa en alguien que te quiere.
Siente ese calor en el pecho y sosténlo un minuto.
Esa sensación te acompaña cuando estés lejos de quienes amas.`,

`Respira y agradece a tu cuerpo por todo lo que hace.
A veces damos por sentado que sigue funcionando.
Un pequeño acto de gratitud te conecta con la vida.`,

`Respira y observa una emoción sin etiquetarla.
Déjala pasar como una nube.
No necesitas entenderla para soltarla; solo sentirla hasta que disminuya.`,

`Respira y olvida por un momento lo que "deberías" hacer.
Haz en su lugar lo que nutre tu energía.
Tu bienestar sostiene todo lo demás.`,

`Respira y siéntate con la idea de que mereces reposo.
No siempre hay que acelerar; a veces hay que detenerse.
Tu cuerpo te lo agradecerá.`,

`Respira y pregúntate: "¿qué haría hoy una versión más suave de mí?".
Sigue esa respuesta, aunque sea pequeña.
Actuar con ternura refuerza el hábito.`,

`Respira y comienza a soltar los "ya debería".
Cambia "debería" por "podría".
La posibilidad abre puertas; la culpa las cierra.`,

`Respira y siéntete completo por un momento.
No necesitas añadir nada para ser digno.
Estar es suficiente; florecer vendrá en su tiempo.`,

`Respira y recuerda un logro reciente, por pequeño que sea.
Reconócelo y siente la satisfacción.
Estos reconocimientos construyen confianza.`,

`Si el día pesa, respira y divide la tarea en pequeños trozos.
Completa uno, respira, celebra la pequeña victoria.
Es la estrategia de los que construyen grandes cosas sin quemarse.`,

`Respira y observa tus pensamientos sin pelear con ellos.
Ellos no te definen; son invitados que pasan.
Mantente como anfitrión amable y no te enganches.`,

`Respira y permítete reír aunque sea suave.
La risa baja la tensión y abre perspectiva.
Busca una pequeña gracia en el día y déjala entrar.`,

`Respira y recuérdate que pedir ayuda es fortaleza.
No tienes que cargarlo todo solo.
Compartir lo que pesa parte la carga en dos.`,

`Respira y mira una planta, una taza, una pared.
Encuentra belleza en lo cotidiano.
Esa elección transforma la mirada y alivia el ánimo.`,

`Respira y siéntete merecedor de descansos creativos.
A veces la mente pide pausa para volver con nuevas ideas.
Dale ese regalo.`,

`Respira y observa la respiración de un niño o una mascota.
Esa naturalidad nos recuerda cómo volver a ser simples.
Imítala un minuto y siente el alivio.`,

`Respira y acepta que no todo se puede controlar.
La serenidad nace al soltar esa ilusión de poder absoluto.
Desde la aceptación, actúas con más claridad.`,

`Respira y pon atención a tus límites afectivos.
Decir no a tiempo es un acto de amor propio.
Tu energía tiene un límite saludable; protégelo.`,

`Respira y crea un ritual breve: una canción, una palabra, una postura.
Los rituales marcan intención y sostienen el cambio.
Empieza hoy con uno pequeño.`,

`Respira y no minimices tus emociones; obsérvalas con curiosidad.
Pregúntate qué te enseñan.
Cada emoción trae una lección escondida.`,

`Respira y piensa en una cosa que te gustaría dejar atrás.
Escribe su nombre en un papel y quémalo (metafóricamente).
Respira y suelta ese peso.`,

`Respira y mira al cielo aunque sea por un instante.
Ese gesto expande la sensación de posibilidad.
Respirar y alzar la vista cambia el ánimo.`,

`Respira y celebra los tiempos de silencio.
Ellos contienen respuestas que la prisa no escucha.
Haz silencio dentro y fuera.`,

`Respira y siéntete acompañado por generaciones que también han vivido incertidumbres.
No estás solo en la experiencia humana.
Respira y toma consuelo en esa compañía.`,

`Respira y abrázate con ternura por lo que has superado.
Tu historia es prueba de resistencia.
Respira y reconoce tu fuerza.`,

`Respira y si te parece mucho, reduce la lista de "por hacer" a solo tres prioridades.
Respira entre cada una y avanza sin prisa.`,

`Respira y permite que un recuerdo agradable te visite.
Siente su textura en el pecho y mantén esa sensación algunos segundos.
Lleva esa calma contigo al siguiente paso.`,

`Respira y observa cuándo tu mente se acelera por expectativas.
Vuelve al presente para encontrar más control y menos angustia.`,

`Respira y piensa en alguien a quien quieres perdonar.
No para justificar, sino para liberarte.
Respira y deja que la carga se afloje.`,

`Respira y reconoce que el cambio real es lento pero sólido.
No busques atajos que te desgasten.
Construye con constancia.`,

`Respira y escribe una frase amable para ti mismo.
Lée-la lentamente y déjala resonar.
Repite cuando lo necesites.`,

`Respira y recuerda que la vulnerabilidad es puente, no debilidad.
Compartir lo que sientes genera conexiones reales.
Empieza con algo pequeño.`,

`Respira y observa tus hábitos nocturnos.
Un descanso reparador transforma el día siguiente.
Respira y regálate una rutina que sostenga tu descanso.`,

`Respira y si te fallas, no te condenes.
Evalúa con suavidad, aprende y sigue.
El perdón hacia ti mismo es medicina diaria.`,

`Respira y mira tus límites como señales, no fracasos.
Ellos te indican dónde poner cuidado y dónde crecer.`,

`Respira y reconoce la belleza en tus imperfecciones.
Ellas te hacen auténtico y cercano.
Respira y celébrate tal cual.`,

`Respira y escucha una canción que te calme.
Deja que su ritmo regular haga eco en tu respiración.
Permítete disolver la tensión.`,

`Respira y da un paso simbólico hacia lo que te importa.
No tiene que ser perfecto; solo tiene que ser real.
Respira y actúa.`,

`Respira y elige una acción compasiva hoy:
una palabra amable, un mensaje breve, una ayuda pequeña.
Esos actos enriquecen tu mundo y el de otros.`,

`Respira y recuerda que puedes pedir un descanso sin explicaciones largas.
A veces un "necesito parar" basta.`,

`Respira y cultiva la paciencia contigo y con los demás.
Las prisas infectan el juicio y empobrecen la experiencia.`,

`Respira y si la tristeza aparece, acaríciala con ternura.
Déjala ser huésped sin darle la casa.
Con el tiempo se irá.`,

`Respira y pregúntate qué te da energía hoy.
Haz un poco de eso aunque sean cinco minutos.
La energía se renueva con pequeños cuidados.`,

`Respira y acepta que algunas metas cambian de forma.
Revisarlas no es rendirse; es aprender a navegar con sabiduría.`,

`Respira y si te sientes abrumado, vuelve a lo básico:
agua, movimiento suave, y aire profundo.
Estos elementos te reponen.`,

`Respira y regala una sonrisa a alguien hoy.
Ese gesto tiene más poder del que imaginas.
Comienza por sonreírte a ti mismo.`,

`Respira y crea un mantra corto: "Estoy aquí, puedo con esto".
Repite en momentos de tensión y siente la estabilización.`,

`Respira y permite que el amor propio sea una práctica diaria,
no una búsqueda lejana.
Pequeños actos de cuidado suman una vida más amable.`,

`Respira y observa el progreso silencioso en ti.
No siempre es espectacular, pero es real y constante.
Valóralo.`,

`Respira y cuando el ruido mental sea fuerte, baja el volumen con la exhalación.
Hazlo varias veces hasta que el silencio sea más audible.`,

`Respira y reconoce lo que ya has dejado atrás.
Esa distancia te muestra que puedes moverte otra vez.`,

`Respira y abre las manos: suelta lo que no te sirve.
Verás que se crea espacio para nuevas posibilidades.`,

`Respira y escribe una carta breve a tu futuro yo agradeciéndote por no rendirte.
Guárdala y léela cuando necesites ánimo.`,

`Respira y marca hoy un pequeño descanso sin culpa.
Ese gesto enseña a tu cuerpo que el ritmo no es una carrera.`,

`Respira y recuerda: los pasos más pequeños crean caminos inmensos.
Confía en la acumulación de tus acciones suaves.`,

`Cada mañana es un borrón limpio.  
No tienes que cargar con las decisiones de ayer.  
Respira y permite que la luz entre en tus pensamientos.  
Hoy es una página en blanco; escribe algo amable.`,


  `Cuando sientas que el mundo te empuja, baja la velocidad.  
  Una respiración larga disminuye la prisa y aclara el juicio.  
  Respira con intención y elige tu próximo movimiento.`,


  `La serenidad no llega por accidente; se construye en las pausas.  
  Respira tres veces con atención y deja que tu cuerpo hable.  
  Lo que sigue será más claro y más tuyo.`,


  `Respira como quien regresa a un lugar seguro.  
  Siembra una palabra amable en tu pecho y riega ese jardín.  
  Con tiempo, florecerá.`,


  `No necesitas arreglar todo ahora.  
  Respira y prioriza lo que importa: tu bienestar.  
  Lo demás encontrará su orden.`,


  `Respira y observa una parte de ti con ternura.  
  No critiques lo que late, acompáñalo.  
  El cambio se hace mejor con cariño que con empuje.`,


  `Si la ansiedad llama, abre la puerta con curiosidad.  
  Respira y pregúntate: ¿qué necesita este miedo?  
  A veces escucharlo lo transforma.`,


  `Respira despacio hasta que notes el suelo.  
  Siente la conexión entre tus pies y el mundo.  
  Desde ahí, cualquier paso no parecerá tan grande.`,


  `Cuando todo parezca demasiado, fragmenta el día.  
  Respira entre cada fragmento; esa pausa es una victoria.  
  Haz menos, pero hazlo con presencia.`,


  `Respira y recuerda un gesto que te alivie: una canción, una taza, una llamada.  
  Arma un pequeño ritual y vuelve a él cuando haga falta.  
  La repetición crea alivio.`,


  `Respira y regresa a lo esencial: tu cuerpo, tu aliento, tu ahora.  
  Deja que las expectativas se disuelvan por un momento.  
  Ese silencio te hará fuerte.`,


  `Respira para recordar quién eres, más allá de las tareas.  
  Eres el mismo ser que soñó y que late con deseos simples.  
  Cuida esa conexión.`,


  `Respira y suelta el mapa de lo perfecto.  
  El progreso real se mide en pasos serenos, no en velocidad.  
  Hoy avanza con compasión.`,


  `Respira y celebra un pequeño logro hoy.  
  Puede ser mínimo, pero el reconocimiento suma.  
  Mañana tu impulso será más amable.`,


  `Respira y practica la paciencia contigo.  
  La prisa suele nublar el tacto con lo que importa.  
  Vuelve a hacer las cosas despacio; verás detalles nuevos.`,


  `Respira y perdona un tropiezo no como fracaso sino como lección.  
  Lo que duele tiene una enseñanza.  
  Permítete aprender sin culpas.`,


  `Respira y coloca una intención: hoy seré amable con mi tiempo.  
  Protege tu espacio mental como proteges tu agenda.  
  Eso te hará sostenible.`,


  `Respira y observa tus pensamientos como si fuesen nubes.  
  No tienes que aferrarte a ninguno.  
  Deja que pasen y vuelve a tu centro.`,


  `Respira y ancla un recuerdo de gratitud.  
  Puede ser un gesto pequeño, una palabra dicha, un café.  
  Ese anclaje te sostendrá el día.`,


  `Respira y date permiso para descansar sin condiciones.  
  El descanso no es pereza, es renovación.  
  Regálatelo con cariño.`,


  `Respira y comparte menos juicios, más preguntas.  
  Las preguntas abren puertas; los juicios las cierran.  
  Practica la curiosidad amablemente.`,


  `Respira y confía en la trama de tu vida.  
  No siempre verás el patrón desde dentro, pero existe.  
  Confía en las piezas que estás colocando.`,


  `Respira y recuerda que la valentía no es ausencia de miedo.  
  Es hacer lo que importa aunque tiemble.  
  Hoy un paso, aunque pequeño, ya es valer.`,


  `Respira y reconoce la fuerza en tu historia.  
  Cada capítulo te ha moldeado, no te ha derrotado.  
  Eres más resistente de lo que crees.`,


  `Respira y haz silencio para escuchar tu intuición.  
  La corazonada suele llegar cuando el ruido baja.  
  Confía en su pequeña voz.`,


  `Respira e imagina una luz suave dentro de ti.  
  Deja que se extienda, primero al pecho, luego a las manos, luego al resto.  
  Esa luz te calma y te guía.`,


  `Respira y decreta una sola prioridad hoy: estar presente.  
  Si te pierdes en el trajín, vuelve al aliento.  
  La presencia es la brújula más fiel.`,


  `Respira y observa el lenguaje que usas contigo.  
  Si suena duro, cámbialo por uno que sume.  
  Tu voz interna merece respeto.`,


  `Respira y toma decisiones desde la calma, no desde la urgencia.  
  Las decisiones aquietadas suelen ser más sabias.  
  Respira y luego actúa.`,


  `Respira y siembra una intención de cariño para alguien (incluyéndote).  
  Ese gesto no cuesta, y da mucho.  
  La ternura es revolucionaria.`,


  `Respira y recorta expectativas innecesarias.  
  El alivio llega cuando aceptas lo esencial.  
  Suelta lo accesorio.`,


  `Respira y recicla tus pensamientos negativos en preguntas útiles.  
  En vez de “¿por qué me pasa esto?”, prueba “¿qué puedo aprender?”  
  La reescritura abre vías.`,


  `Respira y mira tu día como un par de manos que sostienen una taza:  
  con cuidado y atención.  
  Ese cuidado transforma lo rutinario en sagrado.`,


  `Respira y siéntate a sentir una emoción sin etiqueta.  
  No todo necesita nombre; algunos sentimientos piden tiempo.  
  Dáselo, sin prisa.`,


  `Respira y recuerda una promesa que te hiciste a ti mismo.  
  No tiene que ser grande; basta con ser verdadera.  
  Retómala con conciencia.`,


  `Respira y haz un inventario de pequeñas alegrías.  
  Una canción, un color, un gesto amable.  
  Acumula estos tesoros para días grises.`,


  `Respira y regula el ritmo: alterna esfuerzo con pausa.  
  Eso es eficiencia humana, no fallo.  
  Respira y equilibra.`,


  `Respira y observa que la perfección es una ilusión que fatiga.  
  Mejor la coherencia amable que el brillo puntual.  
  Aplica ternura en tu constancia.`,


  `Respira y recuerda que pedir ayuda no te disminuye; te permite continuar.  
  Sostenerte solo no es requisito.  
  Pedir es también valentía.`,


  `Respira y elige un gesto de autocuidado ahora mismo.  
  Puede ser lavarte las manos con atención o beber agua despacio.  
  Esos gestos te devuelven al cuerpo.`,


  `Respira y visualiza una versión tuya con paz en el rostro.  
  Ese modelo existe y se construye desde hoy.  
  Actúa con la intención de acercarte a él.`,


  `Respira y acepta que algunas respuestas llegan con tiempo.  
  La paciencia te ahorra dolor y te da perspectiva.  
  Respira y confía en el proceso.`,


  `Respira y celebra una mejora mínima de esta semana.  
  Lo pequeño acumulado es lo que mueve la vida.  
  Reconócelo y sigue.`,


  `Respira y suelta la culpa ligada a lo que “debiste”.  
  Lo que hiciste fue lo que supiste hacer entonces.  
  Perdónate y avanza.`,


  `Respira y construye un gesto simbólico para cuando necesites anclar la calma.  
  Puede ser apretar un botón, tocar una tela o decir una palabra.  
  Repite y se volverá efectivo.`,


  `Respira y guarda un minuto para imaginar un futuro amable.  
  No para huir, sino para orientar.  
  Ese mapa mental te ayuda a elegir el paso siguiente.`,


  `Respira y recuerda: tus límites no son fracasos, son señales.  
  Señalan dónde cuidar y dónde afirmar tu territorio.  
  Respira y respétalos.`,


  `Respira y siéntete digna de descanso.  
  No por méritos, sino por ser humana.  
  Date ese permiso sin condiciones.`,


  `Respira y elige una palabra que te sostenga hoy: calma, fuerte, suave.  
  Repite en la pausa y deja que dirija tu ritmo.  
  Esa palabra será faro.`,


  `Respira y mira la belleza simple: la luz en una taza, una silueta en la ventana.  
  Estas pequeñas imágenes te sostienen más de lo que crees.  
  Aliméntalas.`,


  `Respira y observa tus límites con curiosidad en vez de juicio.  
  ¿Qué te piden? ¿Qué necesitan?  
  La escucha consciente transforma.`,


  `Respira y acepta los días de poca energía como parte del ciclo.  
  No todo tiene que ser productivo.  
  A veces recibir es suficiente.`,


  `Respira y recuerda que no estás sola en tus emociones.  
  Compartir un poco aligera mucho.  
  Busca un oído amable cuando lo necesites.`,


  `Respira y conviértete en tu propio testigo compasivo.  
  Observa sin atacar, registra sin juzgar.  
  Eso te libera.`,


  `Respira y practica la gratitud concreta hoy: nombra tres cosas reales.  
  La gratitud atada a lo cotidiano cambia la mirada.  
  Hazlo con pausa.`,


  `Respira y cultiva el hábito de pequeñas celebraciones.  
  Una medalla invisible por cada acto de valentía.  
  Acumúlalas con ternura.`,


  `Respira y suaviza las comparaciones: cada vida tiene su ritmo.  
  La comparación borra la singularidad de tu camino.  
  Vuelve a tu propio pulso.`,


  `Respira y cuida tu diálogo interno como un amigo querido.  
  Si suena duro, corrígelo con cariño.  
  Ese trato cambia el día.`,


  `Respira y observa que los límites también protegen la creatividad.  
  A veces decir "no" es un acto de amor por lo que quieres crear.  
  Respira y decide con calma.`,


  `Respira y vuelve a intentarlo cuando algo falle.  
  La insistencia amable es más poderosa que la fuerza de choque.  
  Sigue con ternura.`,


  `Respira y mantén un gesto ritual antes de cada tarea importante.  
  Puede ser ajustar los hombros, inhalar y soltar.  
  El ritual prepara la mente.`,


  `Respira y respeta tus tiempos emocionales.  
  No todos los procesos se ven desde fuera; algunos suceden lento por dentro.  
  Dales el espacio que piden.`,


  `Respira y recuerda que la compasión externa nace de la interna.  
  Si no te cuidas, tienes menos para dar.  
  Llena la taza primero.`,


  `Respira y crea una lista corta de enemigos de tu calma (ruido, pantalla, prisa).  
  Identifica y reduce uno hoy.  
  El efecto acumulado te sorprenderá.`,


  `Respira y acoge los cambios pequeños como pistas de evolución.  
  No todo gran salto se anuncia; muchos vienen de pasos diminutos.  
  Celebra lo sutil.`,


  `Respira y acepta que la seguridad total no existe; existe la capacidad de adaptarte.  
  Esa capacidad es tu músculo vital.  
  Entrénalo con paciencia.`,


  `Respira y usa la imaginación para desactivar miedo: visualiza un resultado tolerable.  
  Si lo puedes imaginar, puedes planear pasos reales.  
  Respira y actúa.`,


  `Respira y recuerda que no estás obligado a resolver todo ahora.  
  Hay temporadas de sembrar y otras de cosechar.  
  Sintoniza con tu temporada.`,


  `Respira y recorta pensamientos que no te pertenecen.  
  A veces llevamos expectativas ajenas como si fueran nuestras.  
  Devuélvelas con calma.`,


  `Respira y haz del final del día un pequeño rito: ordenar, agradecer, soltar.  
  Ese gesto marca la diferencia para descansar bien.  
  Hazlo con intención.`,


  `Respira y reparte ternura a tu cuerpo: estírate, mira, respira.  
  El cuerpo también memoriza cuidados.  
  Aliméntalo con presencia.`,


  `Respira y mira qué te presenta resistencia hoy.  
  La resistencia señala crecimiento posible.  
  Respira y acércate con curiosidad.`,


  `Respira y enmarca tu día con dos preguntas: ¿qué me da energía? ¿qué la quita?  
  Haz más de lo primero, reduce lo segundo.  
  Ese balance mejora todo.`,


  `Respira y reconoce que algunas heridas sanan mejor con tiempo y cuidado.  
  No fuerces el proceso; acompáñalo.  
  La lentitud cura.`,


  `Respira y permite que la alegría te encuentre en pequeñas cosas.  
  No la busques lejos; a veces está en un gesto mínimo.  
  Recíbela con gratitud.`,


  `Respira y recuerda: cada elección con conciencia construye dignidad.  
  Aunque parezca insignificante, tu orden interno se fortalece.  
  Sigue con ternura.`,


  `Respira y mira la vida como un taller, no como un examen.  
  Hay herramientas, ensayo y ajuste.  
  Equivocarse es parte del oficio.`,


  `Respira y vístete de amabilidad ante el espejo.  
  Las palabras que te dices forman la escena del día.  
  Elige una que te sostenga.`,


  `Respira y conviértete en arquitecta de tu tiempo.  
  Diseña descansos, acota interrupciones, protege trabajo profundo.  
  Tu paz depende de esas decisiones.`,


  `Respira y exhala expectativas irreales.  
  La vida real es imperfecta y preciosa.  
  Acomódala con amor.`,


  `Respira y toma hoy una acción diminuta hacia un sueño.  
  Un gesto pequeño sostenido es más que inspiración pasajera.  
  Hazlo por ti.`,


  `Respira y recuerda que la memoria feliz se construye con repetición.  
  Repite un gesto amable hoy y mañana y verás cómo cambia tu memoria afectiva.  
  Eso te sostiene.`,


  `Respira y reconoce la belleza en la rutina: la repetición crea refugio.  
  Encuentra lo bello en lo cotidiano y abrázalo.`
  ];

  // ---------------------------------------------------------------------------
  // Fondos por defecto (gradientes) y lista de imágenes candidatas
  // ---------------------------------------------------------------------------
  const gradientFondos = [
    "linear-gradient(135deg, #f6d365, #fda085)",
    "linear-gradient(135deg, #a1c4fd, #c2e9fb)",
    "linear-gradient(135deg, #84fab0, #8fd3f4)",
    "linear-gradient(135deg, #fccb90, #d57eeb)",
    "linear-gradient(135deg, #f093fb, #f5576c)"
  ];

  const candidateImages = [
    "assets/bg1.webp",
    "assets/bg2.webp",
    "assets/bg3.webp",
    "assets/bg4.webp"
  ];

  // ---------------------------------------------------------------------------
  // Exposición y lógica de selección / renderizado
  // ---------------------------------------------------------------------------

  // Exponer lista en memoria para que helpers (TTS / share / download) la lean
  window._phrases_list = frases;

  let fondosDisponibles = [...gradientFondos];

  function fraseEl() { return document.getElementById('frase-text') || document.getElementById('frase'); }
  function bgEl() { return document.getElementById('frase-bg'); }

  function checkImages(list){
    return Promise.all(list.map(src => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ src, ok: true });
      img.onerror = () => resolve({ src, ok: false });
      img.src = src;
    })));
  }

  async function initFondos(){
    try {
      const results = await checkImages(candidateImages);
      window._phrases_image_check = results;
      results.forEach(r => { if (r.ok) fondosDisponibles.push(r.src); });
      window.fondosDisponibles = fondosDisponibles;
    } catch(e){ console.warn('[phrases] initFondos', e); }
  }

  let lastIndex = -1;

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

  function mostrarFrase() {
    const fEl = fraseEl();
    const bEl = bgEl();
    if (!fEl) return;
    let i = Math.floor(Math.random() * frases.length);
    if (i === lastIndex) i = (i + 1) % frases.length;

    // Exponer índice y texto actual en window para que otros módulos usen la fuente "oficial"
    window._phrases_currentIndex = i;
    window._phrases_current = frases[i];

    lastIndex = i;
    const j = Math.floor(Math.random() * fondosDisponibles.length);
    fEl.style.opacity = 0;
    setTimeout(() => {
      fEl.textContent = frases[i];
      if (bEl) applyBackgroundToElement(bEl, fondosDisponibles[j] || gradientFondos[j % gradientFondos.length]);
      fEl.style.opacity = 1;
      if (typeof window.onFraseMostrada === 'function') try{ window.onFraseMostrada(frases[i]); }catch(e){}
    }, 160);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await initFondos();
    mostrarFrase();
    document.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.key === ' ') && document.activeElement && ['INPUT','TEXTAREA'].indexOf(document.activeElement.tagName) === -1) { e.preventDefault(); mostrarFrase(); }
    });
  });

  window.mostrarFrase = mostrarFrase;
})();
