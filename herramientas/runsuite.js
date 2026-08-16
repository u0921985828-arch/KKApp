#!/usr/bin/env node
'use strict';
/**
 * Ejecuta la batería diagnóstica contra el motor de PatwaLink.
 *
 *   node herramientas/runsuite.js
 *   node herramientas/runsuite.js --fenomeno=TMA
 *   node herramientas/runsuite.js --motor=otra-version.html --json=res.json
 *
 * Códigos de salida
 *   0  todos los casos exigidos pasan
 *   1  regresión: se cae por debajo del umbral
 *   2  no se pudo ejecutar (argumentos, fichero, estructura del HTML)
 *
 * El umbral es 70 sobre 70 a propósito: con la batería en verde entera,
 * cualquier caída es una regresión y no hay margen para que se normalice
 * un fallo «que ya venía de antes».
 */

const fs   = require('fs');
const path = require('path');

const {cargarMotor} = require('./motor.js');
const {ejecutarBateria} = require('./suite.js');
const {
  SALIDA, leerArgumentos, validarArgumentos,
  entero, texto, barra, ejecutar
} = require('./cli.js');

/** Casos que deben pasar para considerar el motor sano. */
const UMBRAL_POR_OMISION = 70;

const ADMITIDOS = ['motor', 'json', 'minimo', 'fenomeno', 'silencioso', 'ayuda'];

const AYUDA = `
Batería diagnóstica de PatwaLink

  node herramientas/runsuite.js [opciones]

  --motor=<fichero.html>   motor a evaluar        (por omisión patwalink.html)
  --fenomeno=<COD>         sólo un fenómeno       (TMA, COP, FOC, NEG, SN…)
  --minimo=<n>             umbral de regresión    (por omisión ${UMBRAL_POR_OMISION})
  --json=<fichero>         vuelca el resultado completo
  --silencioso             sólo el resumen final
  --ayuda                  esta pantalla
`;

/**
 * Imprime el informe de una ejecución.
 *
 * @param {object} resultado  salida de ejecutarBateria
 * @param {boolean} silencioso
 */
function informar(resultado, silencioso) {
  const {filas, porFenomeno, ok, total} = resultado;
  const pct = total ? Math.round((ok / total) * 100) : 0;

  console.log(`\nRESULTADO: ${ok}/${total}  (${pct}%)\n`);

  if (!silencioso) {
    Object.entries(porFenomeno)
      .sort((a, b) => (a[1].ok / a[1].n) - (b[1].ok / b[1].n) || a[0].localeCompare(b[0]))
      .forEach(([fen, v]) => {
        const p = v.ok / v.n;
        console.log(
          '  ' + fen.padEnd(5) +
          `${v.ok}/${v.n}`.padEnd(7) +
          `${Math.round(p * 100)}%`.padStart(5) + '  ' + barra(p, 10));
      });
  }

  const fallos = filas.filter(f => !f.pass);
  if (fallos.length) {
    console.log('\nFALLOS:');
    for (const f of fallos) {
      const esperado = Array.isArray(f.exp) ? f.exp.join('  |  ') : f.exp;
      console.log(
        `  [${f.f.split(' ')[0]}] ${f.in}` +
        `\n     esperado: ${esperado}` +
        `\n     obtenido: ${f.got}` +
        (f.error ? `\n     EXCEPCIÓN: ${f.error}` : ''));
    }
  }
}

ejecutar(() => {
  const args = leerArgumentos(process.argv.slice(2));
  validarArgumentos(args, ADMITIDOS);

  if (args.has('ayuda')) {
    console.log(AYUDA);
    return SALIDA.ok;
  }

  const rutaMotor = texto(args, 'motor', null);
  const fenomeno  = texto(args, 'fenomeno', null);
  const destino   = texto(args, 'json', null);
  const umbral    = entero(args, 'minimo', UMBRAL_POR_OMISION, {min: 0, max: 70});
  const silencioso = args.has('silencioso');

  const motor = cargarMotor(rutaMotor ? {ruta: rutaMotor} : {});
  const resultado = ejecutarBateria(motor, {fenomeno});

  informar(resultado, silencioso);

  if (destino) {
    fs.writeFileSync(path.resolve(destino), JSON.stringify({
      motor: path.basename(motor.ruta),
      huella: motor.huella,
      ok: resultado.ok,
      total: resultado.total,
      porFenomeno: resultado.porFenomeno,
      filas: resultado.filas
    }, null, 2));
    console.error(`escrito ${destino}`);
  }

  /* Con un filtro por fenómeno el umbral global no aplica: se exige que
     pase todo lo seleccionado, que es lo que el filtro significa. */
  const exigido = fenomeno ? resultado.total : umbral;

  if (resultado.ok < exigido) {
    console.error(`\nREGRESIÓN: ${resultado.ok} < ${exigido} casos.\n`);
    return SALIDA.regresion;
  }
  return SALIDA.ok;
});
