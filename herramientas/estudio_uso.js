#!/usr/bin/env node
'use strict';
/**
 * ESTUDIO DE USO SIMULADO
 *
 * Somete el motor real a la carga de N usuarios durante H horas y mide
 * lo que es objetivamente medible.
 *
 *   QUÉ MIDE    rendimiento y su cola, cobertura léxica, huecos del
 *               diccionario, reglas que disparan, fallos bajo carga
 *   QUÉ NO MIDE si la traducción es buena. No hay verdad de referencia:
 *               eso exige hablantes nativos y ninguna simulación los
 *               sustituye. Simular ese juicio sería inventarlo.
 *
 * Reproducible: el generador aleatorio va con semilla, así que dos
 * ejecuciones dan el mismo resultado. Cambiar la semilla sirve para
 * comprobar que las conclusiones no dependen de un sorteo concreto.
 *
 *   node herramientas/estudio_uso.js
 *   node herramientas/estudio_uso.js --usuarios=1000 --semilla=7
 *   node herramientas/estudio_uso.js --motor=antes.html --json=antes.json
 *
 * Códigos de salida: 0 correcto · 2 no se pudo ejecutar.
 */

const fs   = require('fs');
const path = require('path');

const {cargarMotor} = require('./motor.js');
const {generarRepertorio} = require('./corpus_uso.js');
const {
  SALIDA, leerArgumentos, validarArgumentos,
  entero, texto, barra, miles, porcentaje, ejecutar
} = require('./cli.js');

/* ---------- parámetros del modelo de uso ----------
   Son supuestos declarados, no medidas: quedan aquí arriba y con nombre
   para que se puedan discutir y cambiar sin bucear en el código. */

const MODELO = Object.freeze({
  /** Probabilidad de que un usuario abra la app una sola vez. */
  sesionUnica: 0.68,
  /** De los que repiten, probabilidad de quedarse en dos sesiones. */
  segundaSesion: 0.80,
  /** Media de traducciones por sesión (cola geométrica). */
  mediaPorSesion: 5.5,
  /** Tope por sesión: corta la cola larga sin distorsionar la media. */
  topePorSesion: 60,
  /** Exponente de la Zipf sobre el repertorio. */
  zipf: 1.1,
  /** Curva diurna de carga, una entrada por hora. */
  curva: [0.6, 0.9, 1.25, 1.4, 1.3, 1.1, 0.85, 0.6]
});

const POR_OMISION = Object.freeze({
  usuarios: 10000,
  horas: 8,
  semilla: 20260816,
  top: 40
});

const ADMITIDOS = ['usuarios', 'horas', 'semilla', 'json', 'motor', 'top', 'ayuda'];

const AYUDA = `
Estudio de uso simulado de PatwaLink

  node herramientas/estudio_uso.js [opciones]

  --usuarios=<n>          usuarios sintéticos   (por omisión ${POR_OMISION.usuarios})
  --horas=<n>             duración, 1 a 8       (por omisión ${POR_OMISION.horas})
  --semilla=<n>           semilla del generador (por omisión ${POR_OMISION.semilla})
  --motor=<fichero.html>  motor a medir         (por omisión patwalink.html)
  --json=<fichero>        vuelca el resultado completo
  --top=<n>               palabras sin cubrir a listar (por omisión ${POR_OMISION.top})
  --ayuda                 esta pantalla

Mide carga y cobertura. NO mide si la traducción es buena.
`;

/**
 * Generador con semilla (mulberry32). Determinista y suficiente para
 * muestrear: no se usa para nada criptográfico.
 *
 * @param {number} semilla
 * @returns {() => number} números en [0, 1)
 */
function generadorConSemilla(semilla) {
  let a = semilla >>> 0;
  return function siguiente() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Índice muestreado con sesgo de Zipf.
 *
 * En uso real unas pocas frases se repiten muchísimo y la cola es
 * larguísima. Muestrear uniforme daría una cobertura optimista, porque
 * diluye el peso de las frases corrientes — y son las corrientes las que
 * hacen daño cuando fallan.
 *
 * @param {number} n  tamaño del repertorio
 * @param {() => number} aleatorio
 * @param {number} [exponente]
 * @returns {number}
 */
function indiceZipf(n, aleatorio, exponente = MODELO.zipf) {
  return Math.min(n - 1, Math.floor(n * Math.pow(aleatorio(), exponente)));
}

/**
 * Acumulador de estadística de una pasada. Encapsula el estado para que
 * el bucle de simulación quede legible y para poder probar el informe
 * sin ejecutar 80.000 traducciones.
 */
class Estadistica {
  /** @param {number} horas */
  constructor(horas) {
    this.latencias = [];
    this.porHora = new Array(horas).fill(0);
    this.porDominio = new Map();
    this.porDireccion = new Map([['es2pw', {n: 0, cob: 0}], ['pw2es', {n: 0, cob: 0}]]);
    this.desconocidas = new Map();
    this.reglas = new Map();
    this.frasesConHueco = new Map();

    this.total = 0;
    this.errores = 0;
    this.erroresEjemplo = [];
    this.sumaCobertura = 0;
    this.plenas = 0;
    this.parciales = 0;
    this.pobres = 0;
    this.sesiones = 0;
    this.sesionesConHueco = 0;
    this.usuariosConHueco = 0;
  }

  /**
   * Registra una traducción.
   *
   * @param {object} frase      entrada del repertorio
   * @param {object} resultado  salida del motor
   * @param {number} ms         latencia medida
   * @param {number} hora       franja horaria
   * @param {number} usuario    identificador del usuario sintético
   * @returns {boolean} si la traducción dejó algún hueco
   */
  registrar(frase, resultado, ms, hora, usuario) {
    if (resultado.error) {
      this.errores++;
      if (this.erroresEjemplo.length < 10) {
        this.erroresEjemplo.push({dir: frase.dir, texto: frase.texto, error: resultado.error});
      }
      return false;
    }

    this.total++;
    this.latencias.push(ms);
    this.porHora[hora]++;

    const cobertura = resultado.coverage || 0;
    this.sumaCobertura += cobertura;

    if (cobertura >= 0.999) this.plenas++;
    else if (cobertura >= 0.8) this.parciales++;
    else this.pobres++;

    const dom = this.porDominio.get(frase.dominio) ||
      {n: 0, cob: 0, huecos: 0};
    dom.n++; dom.cob += cobertura;
    this.porDominio.set(frase.dominio, dom);

    const dir = this.porDireccion.get(frase.dir);
    dir.n++; dir.cob += cobertura;

    for (const etiqueta of resultado.applied || []) {
      const codigo = String(etiqueta).split(' ')[0];
      this.reglas.set(codigo, (this.reglas.get(codigo) || 0) + 1);
    }

    const huecos = resultado.unknown || [];
    if (!huecos.length) return false;

    dom.huecos += huecos.length;
    for (const bruto of huecos) {
      const token = String(bruto).toLowerCase();
      const e = this.desconocidas.get(token) ||
        {n: 0, usuarios: new Set(), dir: frase.dir};
      e.n++;
      e.usuarios.add(usuario);
      this.desconocidas.set(token, e);
    }

    const clave = `${frase.dir}|${frase.texto}`;
    const f = this.frasesConHueco.get(clave) ||
      {n: 0, cob: cobertura, salida: resultado.text, dir: frase.dir, texto: frase.texto};
    f.n++;
    this.frasesConHueco.set(clave, f);

    return true;
  }

  /**
   * Compone el resultado final.
   *
   * @param {object} parametros
   * @param {number} top
   * @returns {object}
   */
  resumir(parametros, top) {
    const lat = this.latencias.slice().sort((a, b) => a - b);
    const percentil = p => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : 0;
    const suma = lat.reduce((a, b) => a + b, 0);
    const media = this.total ? suma / this.total : 0;
    const pico = this.porHora.length ? Math.max(...this.porHora) : 0;
    const dec = n => Number(n.toFixed(3));

    return {
      parametros,

      volumen: {
        traducciones: this.total,
        sesiones: this.sesiones,
        errores: this.errores,
        tradPorSesion: this.sesiones ? Number((this.total / this.sesiones).toFixed(2)) : 0,
        porHora: this.porHora
      },

      rendimiento: {
        totalMs: Number(suma.toFixed(1)),
        media: dec(media),
        p50: dec(percentil(0.50)), p90: dec(percentil(0.90)),
        p95: dec(percentil(0.95)), p99: dec(percentil(0.99)),
        max: dec(lat.length ? lat[lat.length - 1] : 0),
        picoTradPorHora: pico,
        segundosCpuHoraPico: Number((pico * media / 1000).toFixed(1))
      },

      cobertura: {
        media: this.total ? Number((this.sumaCobertura / this.total).toFixed(4)) : 0,
        plenas: this.plenas, parciales: this.parciales, pobres: this.pobres,
        pctPlenas: this.total ? Number((this.plenas / this.total * 100).toFixed(1)) : 0,
        pctPobres: this.total ? Number((this.pobres / this.total * 100).toFixed(1)) : 0,
        sesionesConHueco: this.sesionesConHueco,
        pctSesionesConHueco: this.sesiones
          ? Number((this.sesionesConHueco / this.sesiones * 100).toFixed(1)) : 0,
        usuariosConHueco: this.usuariosConHueco,
        pctUsuariosConHueco: parametros.usuarios
          ? Number((this.usuariosConHueco / parametros.usuarios * 100).toFixed(1)) : 0,
        tokensDesconocidosDistintos: this.desconocidas.size
      },

      porDominio: Object.fromEntries([...this.porDominio].map(([k, v]) => [k, {
        n: v.n,
        cobertura: Number((v.cob / v.n).toFixed(4)),
        huecosPorTrad: Number((v.huecos / v.n).toFixed(3))
      }])),

      porDireccion: Object.fromEntries([...this.porDireccion].map(([k, v]) => [k, {
        n: v.n,
        cobertura: v.n ? Number((v.cob / v.n).toFixed(4)) : 0
      }])),

      /* Ordenado por USUARIOS afectados y no por frecuencia: lo que
         decide la prioridad es a cuánta gente le pasa. */
      topDesconocidas: [...this.desconocidas]
        .map(([token, e]) => ({token, n: e.n, usuarios: e.usuarios.size, dir: e.dir}))
        .sort((a, b) => b.usuarios - a.usuarios || b.n - a.n)
        .slice(0, top),

      peoresFrases: [...this.frasesConHueco.values()]
        .sort((a, b) => b.n - a.n)
        .slice(0, 25),

      reglas: [...this.reglas]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([codigo, n]) => ({codigo, n})),

      erroresEjemplo: this.erroresEjemplo
    };
  }
}

/**
 * Ejecuta la simulación completa.
 *
 * @param {object} opciones
 * @returns {object} resultado listo para informar o serializar
 */
function simular({usuarios, horas, semilla, motor, top}) {
  const aleatorio = generadorConSemilla(semilla);
  const repertorio = generarRepertorio(aleatorio);

  /* Los dominios de peso alto quedan en la cabeza de la Zipf: son los
     que se repiten. El desempate aleatorio evita que dentro de un mismo
     peso el orden dependa de cómo esté escrito el corpus. */
  repertorio.sort((a, b) => (b.peso - a.peso) || (aleatorio() - 0.5));

  const curva = MODELO.curva.slice(0, horas);
  const pesoTotal = curva.reduce((a, b) => a + b, 0);
  const est = new Estadistica(horas);

  console.error(`repertorio: ${repertorio.length} frases distintas`);
  console.error(`motor: ${motor.ruta} (${motor.huella})`);
  console.error(`simulando ${miles(usuarios)} usuarios · ${horas} h · semilla ${semilla}`);

  for (let u = 0; u < usuarios; u++) {
    const nSesiones = aleatorio() < MODELO.sesionUnica ? 1
      : (aleatorio() < MODELO.segundaSesion ? 2 : 3);
    let usuarioTocado = false;

    for (let s = 0; s < nSesiones; s++) {
      est.sesiones++;

      /* Franja horaria según la curva diurna. */
      let x = aleatorio() * pesoTotal;
      let hora = 0;
      while (hora < horas - 1 && x > curva[hora]) { x -= curva[hora]; hora++; }

      const nTrad = Math.min(
        MODELO.topePorSesion,
        1 + Math.floor(-Math.log(1 - aleatorio()) * MODELO.mediaPorSesion));

      let sesionTocada = false;

      for (let t = 0; t < nTrad; t++) {
        const frase = repertorio[indiceZipf(repertorio.length, aleatorio)];

        const inicio = process.hrtime.bigint();
        const resultado = motor.traducir(frase.texto, frase.dir);
        const ms = Number(process.hrtime.bigint() - inicio) / 1e6;

        if (est.registrar(frase, resultado, ms, hora, u)) sesionTocada = true;
      }

      if (sesionTocada) { est.sesionesConHueco++; usuarioTocado = true; }
    }

    if (usuarioTocado) est.usuariosConHueco++;
    if (u && u % 2000 === 0) console.error(`  ${miles(u)} usuarios…`);
  }

  return est.resumir({
    usuarios, horas, semilla,
    repertorio: repertorio.length,
    motor: path.basename(motor.ruta),
    huella: motor.huella
  }, top);
}

/**
 * Imprime el informe en terminal.
 * @param {object} r
 */
function informar(r) {
  const L = console.log;
  const linea = c => c.repeat(62);

  L('');
  L(linea('═'));
  L('  ESTUDIO DE USO SIMULADO — PatwaLink');
  L(linea('═'));
  L('');
  L(`  ${miles(r.parametros.usuarios)} usuarios · ${r.parametros.horas} h · ` +
    `${r.parametros.repertorio} frases distintas · semilla ${r.parametros.semilla}`);
  L(`  motor ${r.parametros.motor} (${r.parametros.huella})`);
  L('');

  L('── VOLUMEN ' + linea('─').slice(11));
  L(`  traducciones            ${miles(r.volumen.traducciones)}`);
  L(`  sesiones                ${miles(r.volumen.sesiones)}  ` +
    `(${r.volumen.tradPorSesion} traducciones cada una)`);
  L(`  fallos del motor        ${r.volumen.errores}`);
  L('');
  L('  reparto por hora');
  const maxHora = Math.max(...r.volumen.porHora, 1);
  r.volumen.porHora.forEach((n, i) =>
    L(`    h${i + 1}  ${miles(n).padStart(7)}  ${barra(n / maxHora, 30)}`));
  L('');

  L('── RENDIMIENTO (por traducción) ' + linea('─').slice(31));
  for (const [etiqueta, clave] of [
    ['media', 'media'], ['mediana (p50)', 'p50'], ['p90', 'p90'],
    ['p95', 'p95'], ['p99', 'p99'], ['máximo', 'max']
  ]) {
    L(`  ${etiqueta.padEnd(22)}${r.rendimiento[clave]} ms`);
  }
  L(`  hora pico             ${miles(r.rendimiento.picoTradPorHora)} traducciones`);
  L(`  CPU en la hora pico   ${r.rendimiento.segundosCpuHoraPico} s`);
  L('');

  L('── COBERTURA LÉXICA ' + linea('─').slice(20));
  L(`  cobertura media         ${porcentaje(r.cobertura.media)}`);
  L(`  traducciones completas  ${r.cobertura.pctPlenas}%  ` +
    `${barra(r.cobertura.pctPlenas / 100)}`);
  L(`  con algún hueco         ${(100 - r.cobertura.pctPlenas).toFixed(1)}%`);
  L(`  por debajo del 80%      ${r.cobertura.pctPobres}%`);
  L('');
  L(`  sesiones con hueco      ${r.cobertura.pctSesionesConHueco}%`);
  L(`  USUARIOS con hueco      ${r.cobertura.pctUsuariosConHueco}%   ← el número que importa`);
  L(`  palabras sin cubrir     ${r.cobertura.tokensDesconocidosDistintos} distintas`);
  L('');

  L('── POR DOMINIO ' + linea('─').slice(15));
  Object.entries(r.porDominio)
    .sort((a, b) => a[1].cobertura - b[1].cobertura)
    .forEach(([dom, v]) => L(
      `  ${dom.padEnd(12)} ${miles(v.n).padStart(7)} trad   ` +
      `cobertura ${porcentaje(v.cobertura).padStart(6)}  ${barra(v.cobertura, 18)}`));
  L('');

  L('── POR DIRECCIÓN ' + linea('─').slice(17));
  Object.entries(r.porDireccion).forEach(([d, v]) =>
    L(`  ${d}   ${miles(v.n).padStart(7)} trad   cobertura ${porcentaje(v.cobertura)}`));
  L('');

  L('── PALABRAS QUE MÁS USUARIOS ECHAN EN FALTA ' + linea('─').slice(43));
  if (!r.topDesconocidas.length) {
    L('  ninguna: el repertorio queda cubierto por completo');
  } else {
    L('  (ordenadas por usuarios afectados: es la cola de reparación)');
    r.topDesconocidas.slice(0, 20).forEach((d, i) => L(
      `  ${String(i + 1).padStart(2)}. ${d.token.padEnd(20)} ` +
      `${miles(d.usuarios).padStart(7)} usuarios  ${miles(d.n).padStart(8)} veces  [${d.dir}]`));
  }
  L('');

  L('── REGLAS GRAMATICALES QUE DISPARAN ' + linea('─').slice(35));
  r.reglas.slice(0, 15).forEach(x =>
    L(`  ${x.codigo.padEnd(8)} ${miles(x.n).padStart(9)}`));
  L('');

  L(linea('═'));
  L('  ESTE ESTUDIO NO MIDE SI LAS TRADUCCIONES SON BUENAS.');
  L('  Mide carga, cobertura y huecos. La corrección del criollo sigue');
  L('  necesitando hablantes nativos: ninguna simulación puede');
  L('  sustituirlos, porque no hay verdad de referencia.');
  L(linea('═'));
  L('');
}

ejecutar(() => {
  const args = leerArgumentos(process.argv.slice(2));
  validarArgumentos(args, ADMITIDOS);

  if (args.has('ayuda')) {
    console.log(AYUDA);
    return SALIDA.ok;
  }

  const usuarios = entero(args, 'usuarios', POR_OMISION.usuarios, {min: 1, max: 10_000_000});
  const horas    = entero(args, 'horas', POR_OMISION.horas, {min: 1, max: MODELO.curva.length});
  const semilla  = entero(args, 'semilla', POR_OMISION.semilla, {min: 0});
  const top      = entero(args, 'top', POR_OMISION.top, {min: 1, max: 500});
  const destino  = texto(args, 'json', null);
  const rutaMotor = texto(args, 'motor', null);

  const motor = cargarMotor(rutaMotor ? {ruta: rutaMotor} : {});
  const resultado = simular({usuarios, horas, semilla, motor, top});

  if (destino) {
    fs.writeFileSync(path.resolve(destino), JSON.stringify(resultado, null, 2));
    console.error(`escrito ${destino}`);
  }

  informar(resultado);
  return SALIDA.ok;
});
