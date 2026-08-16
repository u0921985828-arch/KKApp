'use strict';
/**
 * CORPUS DE USO SIMULADO
 *
 * Frases para el estudio de carga y cobertura.
 *
 * LA REGLA QUE DA VALIDEZ A TODO ESTO: este fichero se escribe SIN mirar
 * el léxico del motor. Si las frases salieran del propio diccionario, la
 * cobertura mediría 100% por construcción y el estudio no diría nada. El
 * vocabulario de aquí es español y criollo corrientes, elegido por dominio
 * de uso, y se espera que una parte no esté cubierta: ese hueco es
 * justamente lo que se quiere medir.
 *
 * Corolario práctico: cuando el estudio señale una palabra que falta, la
 * reparación va al léxico del motor — nunca a este fichero. Quitar de aquí
 * lo que falla es ajustar la prueba al resultado.
 */

/**
 * Rellenos por campo semántico. Los sustantivos llevan artículo porque
 * es como aparecen en las plantillas; la contracción con preposición se
 * resuelve al instanciar.
 * @type {Object<string, string[]>}
 */
const RELLENOS = Object.freeze({
  comida: ['arroz', 'pollo', 'pescado', 'pan', 'agua', 'café', 'fruta', 'mango',
    'plátano', 'cerveza', 'leche', 'huevo', 'sopa', 'carne', 'queso', 'azúcar',
    'sal', 'ñame', 'cabra', 'helado'],

  lugar: ['la playa', 'el mercado', 'la tienda', 'el hotel', 'el aeropuerto',
    'la casa', 'el hospital', 'la escuela', 'la iglesia', 'el banco', 'la parada',
    'el centro', 'la montaña', 'el río', 'la farmacia', 'el restaurante'],

  persona: ['mi hermano', 'mi madre', 'el chico', 'la chica', 'mi amigo',
    'el hombre', 'la mujer', 'mi hija', 'mi padre', 'el vecino', 'mi jefe',
    'el conductor'],

  objeto: ['el dinero', 'el teléfono', 'la llave', 'el libro', 'la ropa',
    'el coche', 'la maleta', 'el billete', 'la cama', 'la puerta', 'la silla',
    'el zapato'],

  adj: ['bueno', 'malo', 'grande', 'pequeño', 'caro', 'barato', 'bonito',
    'cansado', 'contento', 'enfermo', 'frío', 'caliente', 'nuevo', 'viejo',
    'rápido', 'tranquilo'],

  verbo: ['comer', 'beber', 'ir', 'venir', 'comprar', 'vender', 'trabajar',
    'dormir', 'hablar', 'ver', 'dar', 'coger', 'pagar', 'esperar', 'ayudar',
    'llevar'],

  tiempo: ['hoy', 'mañana', 'ayer', 'esta noche', 'el lunes', 'más tarde',
    'ahora', 'la semana que viene', 'el fin de semana', 'por la mañana'],

  /* Criollo escrito como lo escribe un hablante: con la ortografía
     inestable que es normal en una lengua sin norma fijada. */
  pwNombre: ['food', 'money', 'pickney', 'yaad', 'bwoy', 'gyal', 'wata', 'car',
    'shop', 'work', 'fren', 'bredda', 'sista', 'road', 'sea', 'sun', 'rain',
    'music', 'dance', 'phone'],

  pwVerbo: ['nyam', 'guh', 'come', 'tek', 'gi', 'si', 'know', 'waan', 'du',
    'seh', 'run', 'walk', 'buy', 'sell', 'wuk', 'sleep', 'chat', 'luk', 'hol',
    'lef'],

  pwAdj: ['nice', 'bad', 'big', 'likkle', 'tiad', 'hungry', 'sick', 'criss',
    'irie', 'hot', 'cold', 'sweet', 'hard', 'soft', 'rich', 'poor']
});

/**
 * Plantillas por dominio. `{campo}` se sustituye por un relleno.
 *
 * `peso` ordena la cola de Zipf: los dominios de peso alto acaban en la
 * cabeza y por tanto se repiten mucho más, como en uso real. Los valores
 * son ordinales relativos, no frecuencias medidas.
 *
 * @type {ReadonlyArray<{dominio: string, dir: string, peso: number, frases: string[]}>}
 */
const PLANTILLAS = Object.freeze([
  /* --- saludo y cortesía: el uso más frecuente de un traductor --- */
  {dominio: 'saludo', dir: 'es2pw', peso: 9, frases: [
    'hola', 'buenos días', 'buenas noches', 'gracias', 'por favor', 'de nada',
    'hasta luego', '¿qué tal?', '¿cómo estás?', 'perdona', 'lo siento',
    'mucho gusto', 'adiós', 'sí', 'no', 'vale']},

  {dominio: 'saludo', dir: 'pw2es', peso: 9, frases: [
    'wah gwaan', 'wagwan', 'yes mi bredda', 'respect', 'big up', 'likkle more',
    'mi deh yah', 'everyting criss', 'walk good', 'nuh worry', 'one love',
    'bless up', 'seen', 'yeah man', 'cool nuh man']},

  /* --- comida y mercado --- */
  {dominio: 'comida', dir: 'es2pw', peso: 7, frases: [
    'quiero {comida}', '¿tienes {comida}?', 'dame {comida} por favor',
    'no me gusta {comida}', '¿cuánto cuesta {comida}?',
    'quiero comer {comida} con {comida}', 'está muy caro', 'dos de {comida}',
    'sin sal por favor', '¿está fresco?', 'la cuenta por favor']},

  {dominio: 'comida', dir: 'pw2es', peso: 5, frases: [
    'mi waan {pwNombre}', 'yu have {pwNombre}?', 'gimme two {pwNombre}',
    'how much dis cost?', 'di {pwNombre} {pwAdj}', 'mi hungry bad',
    'dat too dear', 'mi nuh eat dat']},

  /* --- direcciones y transporte --- */
  {dominio: 'direcciones', dir: 'es2pw', peso: 7, frases: [
    '¿dónde está {lugar}?', 'quiero ir a {lugar}', '¿cómo llego a {lugar}?',
    '¿está lejos {lugar}?', 'llévame a {lugar}', '¿cuánto cuesta ir a {lugar}?',
    'para aquí por favor', 'me he perdido', '¿hay autobús a {lugar}?',
    'a la izquierda', 'todo recto']},

  {dominio: 'direcciones', dir: 'pw2es', peso: 5, frases: [
    'weh di {pwNombre} deh?', 'mi a go a town', 'yu a go weh?', 'tek di taxi',
    'di road long', 'it nuh far', 'come dis way', 'turn left deh so']},

  /* --- familia y relaciones --- */
  {dominio: 'familia', dir: 'es2pw', peso: 6, frases: [
    '{persona} está {adj}', 'este es {persona}', '¿cómo está {persona}?',
    '{persona} viene {tiempo}', 'tengo dos hijos', 'te quiero',
    'te echo de menos', '¿tienes familia aquí?', '{persona} trabaja aquí']},

  {dominio: 'familia', dir: 'pw2es', peso: 5, frases: [
    'mi {pwNombre} {pwAdj}', 'im a mi bredda', 'di pickney dem deh a yaad',
    'mi madda sick', 'we deh yah togedda', 'mi love yu', 'im nuh come yet']},

  /* --- trabajo y dinero --- */
  {dominio: 'trabajo', dir: 'es2pw', peso: 6, frases: [
    'necesito trabajo', '¿cuánto pagas?', 'trabajo {tiempo}', 'no tengo dinero',
    '¿puedes pagar {tiempo}?', 'quiero cambiar dinero', 'es demasiado caro',
    '¿aceptas tarjeta?', 'empiezo {tiempo}', 'estoy buscando trabajo']},

  {dominio: 'trabajo', dir: 'pw2es', peso: 4, frases: [
    'mi nuh have nuh money', 'di wuk hard', 'yu a go pay mi?',
    'mi a wuk {pwNombre}', 'money done', 'mi need a wuk']},

  /* --- salud --- */
  {dominio: 'salud', dir: 'es2pw', peso: 4, frases: [
    'me duele la cabeza', 'estoy enfermo', 'necesito un médico',
    '¿dónde está la farmacia?', 'me duele aquí', 'soy alérgico',
    'llama a una ambulancia', 'no puedo dormir', 'tengo fiebre']},

  {dominio: 'salud', dir: 'pw2es', peso: 3, frases: [
    'mi sick', 'mi head a hot mi', 'mi belly hurt', 'yu need doctor',
    'tek di medicine', 'mi cyaan sleep']},

  /* --- música y ocio --- */
  {dominio: 'ocio', dir: 'es2pw', peso: 5, frases: [
    'me gusta la música', '¿dónde hay una fiesta?', 'vamos a bailar',
    '¿a qué hora empieza?', 'la playa está bonita', 'quiero descansar',
    '¿me haces una foto?', 'esto es precioso', 'qué calor hace']},

  {dominio: 'ocio', dir: 'pw2es', peso: 5, frases: [
    'di music sweet', 'wi a go dance tonight', 'di party start late',
    'di sea criss', 'mi a chill', 'music a play', 'come mek wi go',
    'di vibes nice']},

  /* --- problemas y emergencias --- */
  {dominio: 'problema', dir: 'es2pw', peso: 3, frases: [
    'ayuda', 'he perdido {objeto}', 'me han robado', 'no entiendo',
    '¿hablas español?', 'llama a la policía', 'no funciona',
    'tengo un problema', 'espera un momento', 'déjame en paz']},

  {dominio: 'problema', dir: 'pw2es', peso: 3, frases: [
    'help mi', 'mi lose mi {pwNombre}', 'mi nuh understand', 'yu speak spanish?',
    'tief tek it', 'it nuh wuk', 'hol on likkle', 'lef mi alone']},

  /* --- estructura gramatical marcada: lo que el motor presume resolver --- */
  {dominio: 'gramática', dir: 'pw2es', peso: 6, frases: [
    'mi did a {pwVerbo}', 'mi a go {pwVerbo}', 'mi done {pwVerbo}',
    'mi wi {pwVerbo}', 'mi nuh {pwVerbo}', 'mi neva {pwVerbo}',
    'im a {pwVerbo} di {pwNombre}', 'a mi {pwVerbo} it',
    'di {pwNombre} a get {pwAdj}', 'mi waan fi {pwVerbo}', 'mek mi {pwVerbo}',
    'mi know seh im deh yah', 'di {pwNombre} weh mi si', 'yu a {pwVerbo}?',
    'unu {pwVerbo} yah']},

  {dominio: 'gramática', dir: 'es2pw', peso: 6, frases: [
    'quiero {verbo}', 'voy a {verbo}', 'ya he comido', 'no quiero {verbo}',
    'estoy {adj}', '{persona} es {adj}', 'ayer {verbo} en {lugar}',
    'mañana voy a {lugar}', '¿puedes {verbo}?', 'no puedo {verbo}',
    'déjame {verbo}', 'quiero que vengas']},

  /* --- palabra suelta: el uso de diccionario, muy frecuente --- */
  {dominio: 'palabra', dir: 'es2pw', peso: 8, frases: [
    '{comida}', '{adj}', '{verbo}', '{objeto}', '{lugar}']},

  {dominio: 'palabra', dir: 'pw2es', peso: 8, frases: [
    '{pwNombre}', '{pwAdj}', '{pwVerbo}']},

  /* --- registro abstracto: banda débil conocida, incluida a propósito --- */
  {dominio: 'abstracto', dir: 'es2pw', peso: 2, frases: [
    'necesito información sobre el alojamiento',
    'la responsabilidad es del propietario', 'quiero presentar una reclamación',
    '¿cuál es la política de cancelación?', 'el desarrollo del proyecto',
    'la situación económica está difícil', 'necesito un certificado',
    'la reunión es importante', 'depende de las circunstancias']}
]);

/** Instancias generadas por plantilla con hueco. Más da más variedad léxica. */
const INSTANCIAS_POR_PLANTILLA = 6;

/**
 * Contrae preposición y artículo: los rellenos llevan artículo y al caer
 * tras preposición hay que decir «al hospital», no «a el hospital». Sin
 * esto el corpus mide sobre español que nadie escribe.
 *
 * @param {string} frase
 * @returns {string}
 */
function contraer(frase) {
  return frase.replace(/\ba el\b/g, 'al').replace(/\bde el\b/g, 'del');
}

/**
 * Genera el repertorio completo de frases distintas.
 *
 * @param {() => number} aleatorio  generador con semilla; se consume de
 *   forma determinista, así que el repertorio es reproducible
 * @returns {Array<{dominio: string, dir: string, peso: number, texto: string}>}
 */
function generarRepertorio(aleatorio) {
  if (typeof aleatorio !== 'function') {
    throw new TypeError('generarRepertorio necesita un generador aleatorio con semilla.');
  }

  const elegir = lista => lista[Math.floor(aleatorio() * lista.length)];
  const vistas = new Set();
  const repertorio = [];

  for (const grupo of PLANTILLAS) {
    for (const plantilla of grupo.frases) {
      const tieneHuecos = plantilla.includes('{');
      const veces = tieneHuecos ? INSTANCIAS_POR_PLANTILLA : 1;

      for (let k = 0; k < veces; k++) {
        const texto = contraer(plantilla.replace(/\{(\w+)\}/g, (_, campo) => {
          const lista = RELLENOS[campo];
          if (!lista) throw new Error(`Campo «${campo}» sin rellenos definidos.`);
          return elegir(lista);
        }));

        const clave = `${grupo.dir}|${texto}`;
        if (vistas.has(clave)) continue;   // dos instancias pueden coincidir
        vistas.add(clave);

        repertorio.push({
          dominio: grupo.dominio, dir: grupo.dir, peso: grupo.peso, texto
        });
      }
    }
  }

  return repertorio;
}

module.exports = {generarRepertorio, PLANTILLAS, RELLENOS};
