'use strict';
/**
 * Utilidades compartidas por las herramientas de línea de órdenes:
 * lectura de argumentos con validación, y formato de salida.
 *
 * El motivo de que exista es que un argumento mal escrito no debe
 * degradar en silencio. `--usuarios=diez` producía antes `NaN` usuarios
 * y una pasada vacía que parecía correcta; aquí falla en el acto y dice
 * qué esperaba.
 */

/** Códigos de salida, comunes a todas las herramientas. */
const SALIDA = Object.freeze({
  ok: 0,          // todo correcto
  regresion: 1,   // el trabajo corrió pero el resultado no alcanza el umbral
  error: 2        // no se pudo ejecutar: argumentos, ficheros, estructura
});

/**
 * Lee `--clave=valor` de la línea de órdenes.
 *
 * @param {string[]} argv
 * @returns {Map<string,string>}
 */
function leerArgumentos(argv) {
  const mapa = new Map();
  for (const bruto of argv) {
    if (!bruto.startsWith('--')) continue;
    const sinGuiones = bruto.slice(2);
    const igual = sinGuiones.indexOf('=');
    if (igual < 0) mapa.set(sinGuiones, 'true');
    else mapa.set(sinGuiones.slice(0, igual), sinGuiones.slice(igual + 1));
  }
  return mapa;
}

/**
 * Rechaza argumentos no reconocidos: una errata como `--usuario=10`
 * es más fácil de encontrar si falla que si se ignora.
 *
 * @param {Map<string,string>} args
 * @param {string[]} admitidos
 * @throws {Error}
 */
function validarArgumentos(args, admitidos) {
  const sobra = [...args.keys()].filter(k => !admitidos.includes(k));
  if (sobra.length) {
    throw new Error(
      `Argumento no reconocido: ${sobra.map(s => '--' + s).join(', ')}\n` +
      `  → Admitidos: ${admitidos.map(s => '--' + s).join(', ')}`);
  }
}

/**
 * Entero con rango comprobado.
 *
 * @param {Map<string,string>} args
 * @param {string} clave
 * @param {number} porOmision
 * @param {{min?: number, max?: number}} [limites]
 * @returns {number}
 * @throws {Error}
 */
function entero(args, clave, porOmision, limites = {}) {
  if (!args.has(clave)) return porOmision;
  const bruto = args.get(clave);
  const valor = Number(bruto);

  if (!Number.isInteger(valor)) {
    throw new Error(`--${clave} debe ser un entero; se recibió «${bruto}».`);
  }
  const {min = 1, max = Number.MAX_SAFE_INTEGER} = limites;
  if (valor < min || valor > max) {
    throw new Error(`--${clave} debe estar entre ${min} y ${max}; se recibió ${valor}.`);
  }
  return valor;
}

/**
 * Cadena no vacía.
 *
 * @param {Map<string,string>} args
 * @param {string} clave
 * @param {string|null} porOmision
 * @returns {string|null}
 */
function texto(args, clave, porOmision = null) {
  if (!args.has(clave)) return porOmision;
  const valor = args.get(clave).trim();
  if (!valor || valor === 'true') {
    throw new Error(`--${clave} necesita un valor: --${clave}=<valor>.`);
  }
  return valor;
}

/**
 * Barra de bloques para histogramas en terminal.
 *
 * @param {number} proporcion  entre 0 y 1
 * @param {number} [ancho]
 * @returns {string}
 */
function barra(proporcion, ancho = 24) {
  const p = Math.max(0, Math.min(1, Number.isFinite(proporcion) ? proporcion : 0));
  const llenos = Math.round(p * ancho);
  return '#'.repeat(llenos).padEnd(ancho, '·');
}

/**
 * Miles con separador español, sin depender de que la máquina tenga
 * datos de configuración regional instalados.
 *
 * @param {number} n
 * @returns {string}
 */
function miles(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Porcentaje con un decimal.
 *
 * @param {number} proporcion  entre 0 y 1
 * @returns {string}
 */
function porcentaje(proporcion) {
  return (proporcion * 100).toFixed(1) + '%';
}

/**
 * Envuelve el cuerpo de una herramienta: convierte cualquier excepción
 * en un mensaje limpio y un código de salida coherente, sin volcar una
 * traza de pila que no ayuda a quien usa la orden.
 *
 * @param {() => number|void} cuerpo  devuelve el código de salida
 */
function ejecutar(cuerpo) {
  try {
    const codigo = cuerpo();
    process.exitCode = typeof codigo === 'number' ? codigo : SALIDA.ok;
  } catch (e) {
    console.error(`\n${e.name === 'ErrorMotor' ? '' : 'Error: '}${e.message}\n`);
    process.exitCode = e.codigoSalida || SALIDA.error;
  }
}

module.exports = {
  SALIDA, leerArgumentos, validarArgumentos,
  entero, texto, barra, miles, porcentaje, ejecutar
};
