'use strict';
/**
 * BATERÍA DIAGNÓSTICA DE PatwaLink
 *
 * 70 casos etiquetados por el fenómeno lingüístico que ponen a prueba.
 * El objetivo nunca fue que pasaran todos, sino saber exactamente qué
 * falla y por qué: la etiqueta vale tanto como el resultado.
 *
 * Contrato de un caso:
 *   f    etiqueta «COD-NN descripción». El código antes del guion agrupa
 *        por fenómeno en el informe.
 *   dir  'pw2es' | 'es2pw'
 *   in   entrada literal, tal como la escribiría una persona
 *   exp  respuesta esperada: cadena, o lista de respuestas admitidas
 *
 * Sobre la lista de respuestas: NO es una concesión para aprobar casos
 * difíciles. Es para las entradas que tienen más de una traducción
 * correcta, donde exigir una sola convertía la prueba en un sorteo.
 * Se usa sólo con la justificación anotada junto al caso, y jamás para
 * tapar una salida sencillamente incorrecta. Ampliar `exp` para que pase
 * un caso que falla convierte la batería en decorado.
 *
 * Fuentes para la gramática del criollo jamaicano:
 *   Bailey (1966) Jamaican Creole Syntax
 *   Cassidy & Le Page (1980) Dictionary of Jamaican English
 *   Patrick (2004); Durrleman (2008) The Syntax of Jamaican Creole
 */

const CASOS = [

/* ---- A. SISTEMA TMA (tiempo-modo-aspecto) ---- */
{f:'TMA-01 aspecto por defecto: verbo dinámico desnudo = PASADO',
 dir:'pw2es', in:'mi nyam di food', exp:'comí la comida'},
{f:'TMA-02 aspecto por defecto: verbo estativo desnudo = PRESENTE',
 dir:'pw2es', in:'mi know im', exp:'lo sé'},
{f:'TMA-03 progresivo a',      dir:'pw2es', in:'mi a nyam', exp:'estoy comiendo'},
{f:'TMA-04 anterior did',      dir:'pw2es', in:'mi did nyam', exp:'había comido'},
{f:'TMA-05 pasado progresivo did a', dir:'pw2es', in:'mi did a nyam', exp:'estaba comiendo'},
{f:'TMA-06 futuro a go',       dir:'pw2es', in:'mi a go nyam', exp:'voy a comer'},
{f:'TMA-07 futuro wi',         dir:'pw2es', in:'mi wi nyam', exp:'comeré'},
{f:'TMA-08 completivo done',   dir:'pw2es', in:'mi done nyam', exp:'ya he comido'},
{f:'TMA-09 pasado completivo did done', dir:'pw2es', in:'mi did done nyam', exp:'ya había comido'},
{f:'TMA-10 habitual con adverbio', dir:'pw2es', in:'mi nyam yah every day', exp:'como aquí cada día'},

/* ---- B. CÓPULA (tres formas supletivas) ---- */
{f:'COP-01 ecuativa a',        dir:'pw2es', in:'im a teacha', exp:'es profesor'},
{f:'COP-02 locativa deh',      dir:'pw2es', in:'im deh a yaad', exp:'está en casa'},
{f:'COP-03 adjetival cero',    dir:'pw2es', in:'im tiad', exp:'está cansado'},
{f:'COP-04 adjetivo con TMA (los adjetivos son verbales)',
 dir:'pw2es', in:'im did tiad', exp:'estaba cansado'},
{f:'COP-05 adjetivo progresivo', dir:'pw2es', in:'di food a get cold', exp:'la comida se está enfriando'},

/* ---- C. FOCALIZACIÓN (a-fronting) ---- */
{f:'FOC-01 foco sobre sujeto', dir:'pw2es', in:'a mi dweet', exp:'fui yo quien lo hizo'},
{f:'FOC-02 foco sobre objeto', dir:'pw2es', in:'a di book mi buy', exp:'fue el libro lo que compré'},
{f:'FOC-03 foco sobre verbo (copia verbal)', dir:'pw2es', in:'a run im a run', exp:'lo que hace es correr'},
{f:'FOC-04 foco locativo',     dir:'pw2es', in:'a yah so mi live', exp:'es aquí donde vivo'},

/* ---- D. NEGACIÓN ---- */
{f:'NEG-01 negación simple',   dir:'pw2es', in:'mi nuh know', exp:'no lo sé'},
{f:'NEG-02 concordancia negativa doble', dir:'pw2es', in:'mi nuh have nuh money', exp:'no tengo dinero'},
{f:'NEG-03 concordancia negativa triple', dir:'pw2es', in:'nobody nuh si nutten', exp:'nadie vio nada'},
{f:'NEG-04 negación de pasado neva', dir:'pw2es', in:'mi neva si im', exp:'no lo vi'},
{f:'NEG-05 cyaan',             dir:'pw2es', in:'mi cyaan go', exp:'no puedo ir'},
{f:'NEG-06 nah (progresivo negado)', dir:'pw2es', in:'mi nah go', exp:'no voy a ir'},

/* ---- E. SINTAGMA NOMINAL ---- */
{f:'SN-01 plural con dem definido', dir:'pw2es', in:'di bwoy dem', exp:'los chicos'},
{f:'SN-02 plural indefinido sin marca', dir:'pw2es', in:'mi si bwoy', exp:'vi chicos'},
{f:'SN-03 posesivo por yuxtaposición', dir:'pw2es', in:'di man car', exp:'el coche del hombre'},
{f:'SN-04 posesivo con fi',    dir:'pw2es', in:'a fi mi book', exp:'es mi libro'},
{f:'SN-05 demostrativo pospuesto deh', dir:'pw2es', in:'dat man deh', exp:'ese hombre'},
{f:'SN-06 adjetivo antepuesto → español pospone', dir:'pw2es', in:'wan big house', exp:'una casa grande'},
/* `yaad` y `house` son ambas corrientes para 'casa'; `yaad` es la más
   marcada como criolla. Lo que la prueba mide aquí es el ORDEN del
   adjetivo, no cuál de los dos sinónimos se elige. */
{f:'SN-07 orden inverso ES→PW', dir:'es2pw', in:'una casa grande',
 exp:['wan big house','wan big yaad']},

/* ---- F. VERBOS SERIALES ---- */
{f:'SER-01 carry come',        dir:'pw2es', in:'carry it come', exp:'tráelo'},
{f:'SER-02 tek ... go',        dir:'pw2es', in:'tek di book go', exp:'llévate el libro'},
{f:'SER-03 run go',            dir:'pw2es', in:'im run go a shop', exp:'salió corriendo a la tienda'},
{f:'SER-04 come si',           dir:'pw2es', in:'come si dis', exp:'ven a ver esto'},

/* ---- G. SUBORDINACIÓN ---- */
{f:'SUB-01 complementante seh', dir:'pw2es', in:'mi know seh im deh yah', exp:'sé que está aquí'},
{f:'SUB-02 fi como infinitivo', dir:'pw2es', in:'mi waan fi go', exp:'quiero ir'},
{f:'SUB-03 fi con sujeto',     dir:'pw2es', in:'mi waan yu fi come', exp:'quiero que vengas'},
{f:'SUB-04 relativa con weh',  dir:'pw2es', in:'di man weh mi si', exp:'el hombre que vi'},
{f:'SUB-05 causativo mek',     dir:'pw2es', in:'mek mi si', exp:'déjame ver'},

/* ---- H. INTERROGACIÓN ---- */
/* La polar del criollo sólo se distingue por la entonación, que por
   escrito es el signo final: sin él, `yu a come` y la afirmativa son la
   misma cadena —«vienes» y «estás viniendo» producen las dos `yu a come`—
   y ningún sistema, ni un hablante nativo, puede elegir. El caso lleva
   ahora el signo que trae cualquier texto real. Las dos respuestas son
   correctas: el español no distingue aquí presente de progresivo. */
{f:'INT-01 polar sin inversión', dir:'pw2es', in:'yu a come?',
 exp:['¿vienes?','¿estás viniendo?']},
{f:'INT-02 wh sin inversión',  dir:'pw2es', in:'weh yu a go', exp:'¿adónde vas?'},
/* `seh` desnudo es dinámico, y la regla aspectual del propio motor —la
   que valida TMA-01— lo resuelve como pasado. La lectura habitual también
   vale, pero no se deriva de ningún rasgo de la cadena: exigirla obligaría
   a una excepción para `wah mek` que sólo existiría para este caso. */
{f:'INT-03 wh compuesto',      dir:'pw2es', in:'wah mek yu seh dat',
 exp:['¿por qué dices eso?','¿por qué dijiste eso?']},
{f:'INT-04 cuantificador',     dir:'pw2es', in:'how much it cost', exp:'¿cuánto cuesta?'},

/* ---- I. PRONOMBRES ---- */
{f:'PRO-01 unu 2ª persona plural', dir:'pw2es', in:'unu come yah', exp:'venid aquí'},
{f:'PRO-02 im sin género (contexto femenino)', dir:'pw2es', in:'im a mi sistren', exp:'es mi hermana'},
{f:'PRO-03 reflexivo yuhself', dir:'pw2es', in:'watch yuhself', exp:'ten cuidado'},
{f:'PRO-04 posesivo fi-serie', dir:'pw2es', in:'a fi yu dat', exp:'eso es tuyo'},

/* ---- J. REDUPLICACIÓN ---- */
{f:'RED-01 intensidad',        dir:'pw2es', in:'di road long long', exp:'la carretera es larguísima'},
{f:'RED-02 iteración',         dir:'pw2es', in:'im talk talk', exp:'habla y habla'},
{f:'RED-03 atenuación',        dir:'pw2es', in:'likkle likkle', exp:'poquito a poco'},

/* ---- K. LADO ESPAÑOL: naturalidad ---- */
{f:'ESP-01 pro-drop: no repetir el pronombre sujeto',
 dir:'pw2es', in:'mi have money', exp:'tengo dinero'},
{f:'ESP-02 ser vs estar (profesión → ser)', dir:'pw2es', in:'im a doctor', exp:'es médico'},
{f:'ESP-03 ser vs estar (estado → estar)', dir:'pw2es', in:'im sick', exp:'está enfermo'},
{f:'ESP-04 a personal',        dir:'pw2es', in:'mi si di man', exp:'vi al hombre'},
{f:'ESP-05 concordancia de género en adjetivo',
 dir:'pw2es', in:'di gyal tiad', exp:'la chica está cansada'},
{f:'ESP-06 concordancia de número en adjetivo',
 dir:'pw2es', in:'di gyal dem tiad', exp:'las chicas están cansadas'},
{f:'ESP-07 clítico antepuesto', dir:'pw2es', in:'mi si im', exp:'lo vi'},
{f:'ESP-08 interrogativa con signos', dir:'pw2es', in:'weh yu deh', exp:'¿dónde estás?'},

/* ---- L. ES→PW: producción ---- */
{f:'PRD-01 presente habitual', dir:'es2pw', in:'como arroz todos los días', exp:'mi nyam rice every day'},
{f:'PRD-02 pretérito',         dir:'es2pw', in:'comí arroz', exp:'mi nyam rice'},
{f:'PRD-03 pluscuamperfecto',  dir:'es2pw', in:'había comido', exp:'mi did nyam'},
{f:'PRD-04 imperativo',        dir:'es2pw', in:'ven aquí', exp:'come yah'},
{f:'PRD-05 imperativo negativo', dir:'es2pw', in:'no vengas', exp:'nuh come'},
{f:'PRD-06 subjuntivo',        dir:'es2pw', in:'quiero que vengas', exp:'mi waan yu fi come'},
{f:'PRD-07 condicional',       dir:'es2pw', in:'iría si pudiera', exp:'mi wuda go if mi cuda'},
{f:'PRD-08 impersonal',        dir:'es2pw', in:'se dice que es bueno', exp:'dem seh it good'},
{f:'PRD-09 reflexivo',         dir:'es2pw', in:'me levanto temprano', exp:'mi get up early'},
{f:'PRD-10 comparativo',       dir:'es2pw', in:'es más grande que el mío', exp:'it bigga dan fi mi'}
];

/* ---------- ejecución ---------- */

/** Fenómeno al que pertenece un caso, deducido de su etiqueta. */
const fenomenoDe = caso => String(caso.f).split('-')[0];

/**
 * Compara ignorando mayúsculas, tildes y puntuación: lo que se evalúa es
 * la gramática, no la ortografía de los signos.
 *
 * @param {(s: string) => string} normalize  normalizador del propio motor
 * @returns {(a: string, b: string) => boolean}
 */
function comparadorCon(normalize) {
  const limpiar = v => normalize(String(v ?? '')).replace(/[¿¡?!.,]/g, '');
  return (obtenido, esperado) =>
    (Array.isArray(esperado) ? esperado : [esperado])
      .some(e => limpiar(obtenido) === limpiar(e));
}

/**
 * Ejecuta la batería contra un motor ya cargado.
 *
 * @param {{traducir: Function, interno: {normalize: Function}}} motor
 * @param {object} [opciones]
 * @param {string} [opciones.fenomeno]  ejecutar sólo un fenómeno (p. ej. 'TMA')
 * @returns {{filas: object[], porFenomeno: Object<string,{ok:number,n:number}>,
 *            ok: number, total: number}}
 */
function ejecutarBateria(motor, opciones = {}) {
  const coincide = comparadorCon(motor.interno.normalize);
  const filtro = opciones.fenomeno ? String(opciones.fenomeno).toUpperCase() : null;

  const seleccion = filtro ? CASOS.filter(c => fenomenoDe(c) === filtro) : CASOS;
  if (filtro && !seleccion.length) {
    const todos = [...new Set(CASOS.map(fenomenoDe))].sort().join(', ');
    throw new Error(`Fenómeno «${filtro}» desconocido.\n  → Disponibles: ${todos}`);
  }

  const porFenomeno = {};
  const filas = seleccion.map(caso => {
    const r = motor.traducir(caso.in, caso.dir);
    const pasa = !r.error && coincide(r.text, caso.exp);
    const fen = fenomenoDe(caso);

    porFenomeno[fen] = porFenomeno[fen] || {ok: 0, n: 0};
    porFenomeno[fen].n++;
    if (pasa) porFenomeno[fen].ok++;

    return {
      f: caso.f, fenomeno: fen, dir: caso.dir, in: caso.in,
      exp: caso.exp, got: r.text, pass: pasa,
      cov: Math.round((r.coverage || 0) * 100),
      unk: r.unknown || [],
      error: r.error || null
    };
  });

  return {
    filas, porFenomeno,
    ok: filas.filter(f => f.pass).length,
    total: filas.length
  };
}

module.exports = {CASOS, ejecutarBateria, fenomenoDe};
