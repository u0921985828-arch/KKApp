'use strict';
/**
 * Cargador del motor de PatwaLink.
 *
 * La aplicación es un único fichero HTML por diseño, así que las
 * herramientas de línea de órdenes tienen que extraer el motor de dentro
 * para poder ejecutarlo en Node. Ese recorte estaba duplicado en cada
 * herramienta y con él la fragilidad: cualquier cambio en la estructura
 * del HTML obligaba a tocar varios ficheros. Aquí vive una sola vez.
 *
 * El recorte va del glosario hasta las referencias del DOM, y salta el
 * bloque de dirección de traducción porque toca el documento. Lo que
 * queda es lógica pura: léxico, conjugador, autómata TMA, derivación y
 * las dos direcciones.
 *
 * @example
 *   const {cargarMotor} = require('./motor.js');
 *   const motor = cargarMotor();
 *   motor.traducir('mi a nyam', 'pw2es').text;   // 'Estoy comiendo'
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const crypto = require('crypto');

/** Raíz del repositorio, deducida desde este fichero. */
const RAIZ = path.resolve(__dirname, '..');

/** Motor por omisión: la aplicación publicada. */
const MOTOR_POR_OMISION = path.join(RAIZ, 'patwalink.html');

/** Marcas que delimitan el recorte dentro del HTML. */
const MARCA = {
  direccion: '/* ============================================================\n   DIRECCIÓN DE TRADUCCIÓN',
  motor:     '/* ============================================================\n   MOTOR DE REGLAS',
  interfaz:  '/* ---------- referencias del panel ---------- */'
};

/** Direcciones de traducción admitidas. */
const DIRECCIONES = Object.freeze(['pw2es', 'es2pw']);

/**
 * Error con causa legible para el usuario de la línea de órdenes.
 * Lleva un código de salida propio para que quien invoque no tenga que
 * interpretar el mensaje.
 */
class ErrorMotor extends Error {
  /**
   * @param {string} mensaje  qué ha pasado, en una línea
   * @param {string} remedio  qué puede hacer quien lo lee
   */
  constructor(mensaje, remedio) {
    super(remedio ? `${mensaje}\n  → ${remedio}` : mensaje);
    this.name = 'ErrorMotor';
    this.codigoSalida = 2;
  }
}

/**
 * Extrae el código del motor de un HTML de PatwaLink.
 *
 * @param {string} html  contenido completo del fichero
 * @returns {string} JavaScript autónomo, sin nada que toque el DOM
 * @throws {ErrorMotor} si la estructura esperada no aparece
 */
function extraerMotor(html) {
  const partes = html.split('<script>');
  if (partes.length < 2) {
    throw new ErrorMotor(
      'El HTML no contiene ningún bloque <script> plano.',
      'El motor debe ir en un <script> sin atributos; revisa patwalink.html.');
  }

  const js = partes[1].split('</script>')[0];
  const iDireccion = js.indexOf(MARCA.direccion);
  const iMotor     = js.indexOf(MARCA.motor);
  const iInterfaz  = js.indexOf(MARCA.interfaz);

  if (iMotor < 0 || iInterfaz < 0) {
    throw new ErrorMotor(
      'No se localizan los bloques del motor dentro del HTML.',
      'Han cambiado las marcas de sección; actualiza MARCA en herramientas/motor.js.');
  }

  /* El bloque de dirección de traducción manipula el documento: se salta.
     Si no estuviera, se toma todo lo anterior al motor igualmente. */
  const cabecera = js.slice(0, iDireccion < 0 ? iMotor : iDireccion);
  const cuerpo   = js.slice(iMotor, iInterfaz);

  return `'use strict';\nvar dir = 'pw2es';\n${cabecera}${cuerpo}`;
}

/** Nombres del motor que las herramientas necesitan ver desde fuera. */
const EXPUESTOS = [
  'ruleTranslate', 'pwToEs', 'esToPw',
  'normalize', 'phoneticKey',
  'lookupPw', 'lookupEs',
  'resolverDesconocida', 'detectarIdioma'
];

/**
 * Añade al bundle la exportación de su superficie pública.
 * Cada nombre se exporta sólo si existe, para que la ausencia de una
 * función opcional no impida cargar el motor entero.
 *
 * @param {string} fuente
 * @returns {string}
 */
function conExportaciones(fuente) {
  const pares = EXPUESTOS
    .map(n => `  ${n}: (typeof ${n} === 'function' ? ${n} : undefined)`)
    .join(',\n');

  return `${fuente}
module.exports = {
  fijarDireccion: function (d) { dir = d; },
  direccionActual: function () { return dir; },
${pares}
};
`;
}

/**
 * Carga el motor de un HTML y devuelve una fachada estable.
 *
 * El bundle se escribe en un fichero temporal cuyo nombre incluye el
 * hash del contenido: dos versiones distintas del motor conviven en el
 * mismo proceso sin pisarse, y editar el HTML nunca sirve una copia
 * cacheada por `require`.
 *
 * @param {object} [opciones]
 * @param {string} [opciones.ruta]  HTML del que extraer el motor
 * @returns {{
 *   ruta: string,
 *   huella: string,
 *   traducir: (texto: string, direccion?: string) => object,
 *   interno: object
 * }}
 * @throws {ErrorMotor}
 */
function cargarMotor(opciones = {}) {
  const ruta = path.resolve(opciones.ruta || MOTOR_POR_OMISION);

  let html;
  try {
    html = fs.readFileSync(ruta, 'utf8');
  } catch (e) {
    throw new ErrorMotor(
      `No se puede leer el motor en «${ruta}».`,
      e.code === 'ENOENT' ? 'Comprueba la ruta o usa --motor=<fichero.html>.' : e.message);
  }

  const fuente = conExportaciones(extraerMotor(html));
  const huella = crypto.createHash('sha1').update(fuente).digest('hex').slice(0, 12);
  const temporal = path.join(os.tmpdir(), `patwalink-motor-${huella}.js`);

  if (!fs.existsSync(temporal)) fs.writeFileSync(temporal, fuente);

  let interno;
  try {
    interno = require(temporal);
  } catch (e) {
    throw new ErrorMotor(
      'El motor extraído no se puede ejecutar.',
      `${e.message}\n  Bundle conservado en ${temporal} para inspección.`);
  }

  if (typeof interno.ruleTranslate !== 'function') {
    throw new ErrorMotor(
      'El motor cargó pero no expone ruleTranslate.',
      'Revisa la lista EXPUESTOS en herramientas/motor.js.');
  }

  return {
    ruta,
    huella,
    interno,

    /**
     * Traduce un texto y devuelve el resultado completo del motor.
     * Nunca lanza: un fallo interno se devuelve como resultado con
     * `error`, para que una pasada de 80.000 traducciones no se caiga
     * entera por una entrada rara.
     *
     * @param {string} texto
     * @param {'pw2es'|'es2pw'} [direccion]
     * @returns {{text: string, coverage: number, unknown: string[],
     *            applied: string[], error?: string}}
     */
    traducir(texto, direccion) {
      if (direccion !== undefined) {
        if (!DIRECCIONES.includes(direccion)) {
          throw new ErrorMotor(
            `Dirección de traducción desconocida: «${direccion}».`,
            `Admitidas: ${DIRECCIONES.join(', ')}.`);
        }
        interno.fijarDireccion(direccion);
      }
      try {
        return interno.ruleTranslate(String(texto ?? ''));
      } catch (e) {
        return {
          text: `‹ERROR: ${e.message}›`,
          coverage: 0, unknown: [], applied: [], error: e.message
        };
      }
    }
  };
}

module.exports = {
  cargarMotor, extraerMotor, ErrorMotor,
  RAIZ, MOTOR_POR_OMISION, DIRECCIONES
};
