/* ============================================================
   CORPUS DE USO SIMULADO
   Frases para el estudio de carga y cobertura.

   REGLA QUE DA VALIDEZ A TODO ESTO: este fichero se escribe
   SIN mirar el léxico del motor. Si las frases salieran del
   propio diccionario, la cobertura mediría 100% por
   construcción y el estudio no diría nada. El vocabulario de
   aquí es español y criollo corrientes, elegido por dominio de
   uso, y se espera que una parte no esté en el léxico: ese
   hueco es justamente lo que se quiere medir.
   ============================================================ */

/* ---------- rellenos por dominio ---------- */
const R = {
  comida: ['arroz','pollo','pescado','pan','agua','café','fruta','mango','plátano',
    'cerveza','leche','huevo','sopa','carne','queso','azúcar','sal','ñame','cabra','helado'],
  lugar: ['la playa','el mercado','la tienda','el hotel','el aeropuerto','la casa',
    'el hospital','la escuela','la iglesia','el banco','la parada','el centro',
    'la montaña','el río','la farmacia','el restaurante'],
  persona: ['mi hermano','mi madre','el chico','la chica','mi amigo','el hombre',
    'la mujer','mi hija','mi padre','el vecino','mi jefe','el conductor'],
  objeto: ['el dinero','el teléfono','la llave','el libro','la ropa','el coche',
    'la maleta','el billete','la cama','la puerta','la silla','el zapato'],
  adj: ['bueno','malo','grande','pequeño','caro','barato','bonito','cansado',
    'contento','enfermo','frío','caliente','nuevo','viejo','rápido','tranquilo'],
  verbo: ['comer','beber','ir','venir','comprar','vender','trabajar','dormir',
    'hablar','ver','dar','coger','pagar','esperar','ayudar','llevar'],
  tiempo: ['hoy','mañana','ayer','esta noche','el lunes','más tarde','ahora',
    'la semana que viene','el fin de semana','por la mañana'],
  /* criollo: escrito como lo escribe un hablante, con la ortografía
     inestable que es normal en una lengua sin norma fijada */
  pwNombre: ['food','money','pickney','yaad','bwoy','gyal','wata','car','shop',
    'work','fren','bredda','sista','road','sea','sun','rain','music','dance','phone'],
  pwVerbo: ['nyam','guh','come','tek','gi','si','know','waan','du','seh',
    'run','walk','buy','sell','wuk','sleep','chat','luk','hol','lef'],
  pwAdj: ['nice','bad','big','likkle','tiad','hungry','sick','criss','irie','hot',
    'cold','sweet','hard','soft','rich','poor']
};

/* ---------- plantillas ---------- */
/* `{x}` se sustituye por un relleno de R.x */
const PLANTILLAS = [
  /* --- saludo y cortesía (el uso más frecuente de un traductor) --- */
  {d:'saludo', dir:'es2pw', peso:9, t:['hola','buenos días','buenas noches',
    'gracias','por favor','de nada','hasta luego','¿qué tal?','¿cómo estás?',
    'perdona','lo siento','mucho gusto','adiós','sí','no','vale']},
  {d:'saludo', dir:'pw2es', peso:9, t:['wah gwaan','wagwan','yes mi bredda',
    'respect','big up','likkle more','mi deh yah','everyting criss','walk good',
    'nuh worry','one love','bless up','seen','yeah man','cool nuh man']},

  /* --- comida y mercado --- */
  {d:'comida', dir:'es2pw', peso:7, t:['quiero {comida}','¿tienes {comida}?',
    'dame {comida} por favor','no me gusta {comida}','¿cuánto cuesta {comida}?',
    'quiero comer {comida} con {comida}','está muy caro','dos de {comida}',
    'sin sal por favor','¿está fresco?','la cuenta por favor']},
  {d:'comida', dir:'pw2es', peso:5, t:['mi waan {pwNombre}','yu have {pwNombre}?',
    'gimme two {pwNombre}','how much dis cost?','di {pwNombre} {pwAdj}',
    'mi hungry bad','dat too dear','mi nuh eat dat']},

  /* --- direcciones y transporte --- */
  {d:'direcciones', dir:'es2pw', peso:7, t:['¿dónde está {lugar}?',
    'quiero ir a {lugar}','¿cómo llego a {lugar}?','¿está lejos {lugar}?',
    'llévame a {lugar}','¿cuánto cuesta ir a {lugar}?','para aquí por favor',
    'me he perdido','¿hay autobús a {lugar}?','a la izquierda','todo recto']},
  {d:'direcciones', dir:'pw2es', peso:5, t:['weh di {pwNombre} deh?',
    'mi a go a town','yu a go weh?','tek di taxi','di road long',
    'it nuh far','come dis way','turn left deh so']},

  /* --- familia y relaciones --- */
  {d:'familia', dir:'es2pw', peso:6, t:['{persona} está {adj}','este es {persona}',
    '¿cómo está {persona}?','{persona} viene {tiempo}','tengo dos hijos',
    'te quiero','te echo de menos','¿tienes familia aquí?','{persona} trabaja aquí']},
  {d:'familia', dir:'pw2es', peso:5, t:['mi {pwNombre} {pwAdj}','im a mi bredda',
    'di pickney dem deh a yaad','mi madda sick','we deh yah togedda',
    'mi love yu','im nuh come yet']},

  /* --- trabajo y dinero --- */
  {d:'trabajo', dir:'es2pw', peso:6, t:['necesito trabajo','¿cuánto pagas?',
    'trabajo {tiempo}','no tengo dinero','¿puedes pagar {tiempo}?',
    'quiero cambiar dinero','es demasiado caro','¿aceptas tarjeta?',
    'empiezo {tiempo}','estoy buscando trabajo']},
  {d:'trabajo', dir:'pw2es', peso:4, t:['mi nuh have nuh money','di wuk hard',
    'yu a go pay mi?','mi a wuk {pwNombre}','money done','mi need a wuk']},

  /* --- salud --- */
  {d:'salud', dir:'es2pw', peso:4, t:['me duele la cabeza','estoy enfermo',
    'necesito un médico','¿dónde está la farmacia?','me duele aquí',
    'soy alérgico','llama a una ambulancia','no puedo dormir','tengo fiebre']},
  {d:'salud', dir:'pw2es', peso:3, t:['mi sick','mi head a hot mi','mi belly hurt',
    'yu need doctor','tek di medicine','mi cyaan sleep']},

  /* --- música y ocio --- */
  {d:'ocio', dir:'es2pw', peso:5, t:['me gusta la música','¿dónde hay una fiesta?',
    'vamos a bailar','¿a qué hora empieza?','la playa está bonita',
    'quiero descansar','¿me haces una foto?','esto es precioso','qué calor hace']},
  {d:'ocio', dir:'pw2es', peso:5, t:['di music sweet','wi a go dance tonight',
    'di party start late','di sea criss','mi a chill','music a play',
    'come mek wi go','di vibes nice']},

  /* --- problemas y emergencias --- */
  {d:'problema', dir:'es2pw', peso:3, t:['ayuda','he perdido {objeto}',
    'me han robado','no entiendo','¿hablas español?','llama a la policía',
    'no funciona','tengo un problema','espera un momento','déjame en paz']},
  {d:'problema', dir:'pw2es', peso:3, t:['help mi','mi lose mi {pwNombre}',
    'mi nuh understand','yu speak spanish?','tief tek it','it nuh wuk',
    'hol on likkle','lef mi alone']},

  /* --- frases con estructura gramatical marcada (lo que el motor
         presume resolver: TMA, cópula, negación, foco) --- */
  {d:'gramática', dir:'pw2es', peso:6, t:['mi did a {pwVerbo}','mi a go {pwVerbo}',
    'mi done {pwVerbo}','mi wi {pwVerbo}','mi nuh {pwVerbo}','mi neva {pwVerbo}',
    'im a {pwVerbo} di {pwNombre}','a mi {pwVerbo} it','di {pwNombre} a get {pwAdj}',
    'mi waan fi {pwVerbo}','mek mi {pwVerbo}','mi know seh im deh yah',
    'di {pwNombre} weh mi si','yu a {pwVerbo}?','unu {pwVerbo} yah']},
  {d:'gramática', dir:'es2pw', peso:6, t:['quiero {verbo}','voy a {verbo}',
    'ya he comido','no quiero {verbo}','estoy {adj}','{persona} es {adj}',
    'ayer {verbo} en {lugar}','mañana voy a {lugar}','¿puedes {verbo}?',
    'no puedo {verbo}','déjame {verbo}','quiero que vengas']},

  /* --- palabra suelta: el uso de diccionario, muy frecuente --- */
  {d:'palabra', dir:'es2pw', peso:8, t:['{comida}','{adj}','{verbo}','{objeto}','{lugar}']},
  {d:'palabra', dir:'pw2es', peso:8, t:['{pwNombre}','{pwAdj}','{pwVerbo}']},

  /* --- registro largo y abstracto: lo que el estudio de cobertura
         señala como banda débil. Se incluye a propósito. --- */
  {d:'abstracto', dir:'es2pw', peso:2, t:['necesito información sobre el alojamiento',
    'la responsabilidad es del propietario','quiero presentar una reclamación',
    '¿cuál es la política de cancelación?','el desarrollo del proyecto',
    'la situación económica está difícil','necesito un certificado',
    'la reunión es importante','depende de las circunstancias']}
];

/* ---------- generación del repertorio ---------- */
function generarRepertorio(rnd){
  const fuera = [];
  for(const p of PLANTILLAS){
    for(const plantilla of p.t){
      /* cada plantilla con hueco se instancia varias veces: así el
         repertorio tiene la variedad léxica que tendría el uso real */
      const veces = /\{/.test(plantilla) ? 6 : 1;
      for(let k = 0; k < veces; k++){
        const texto = plantilla.replace(/\{(\w+)\}/g, (_, campo) => {
          const lista = R[campo];
          return lista[Math.floor(rnd() * lista.length)];
        })
          /* los rellenos llevan artículo, así que al caer tras preposición
             hay que contraer: nadie escribe «a el hospital» */
          .replace(/\ba el\b/g, 'al').replace(/\bde el\b/g, 'del');
        fuera.push({dominio:p.d, dir:p.dir, peso:p.peso, texto});
      }
    }
  }
  /* deduplicar: dos instancias pueden coincidir por azar */
  const vistas = new Set();
  return fuera.filter(f => {
    const k = f.dir + '|' + f.texto;
    if(vistas.has(k)) return false;
    vistas.add(k); return true;
  });
}

if(typeof module !== 'undefined') module.exports = {generarRepertorio, PLANTILLAS, R};
