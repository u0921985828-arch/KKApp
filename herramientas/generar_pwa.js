#!/usr/bin/env node
'use strict';
/**
 * GENERADOR DE LA VARIANTE PWA
 *
 * `pwa/index.html` no se edita a mano: se genera desde `patwalink.html`
 * añadiéndole tres capas que la app offline no debe llevar.
 *
 *   1. Cabecera instalable   manifiesto, iconos, colores de sistema
 *   2. Capa de descubrimiento  metadatos, datos estructurados y el texto
 *      que responde a la intención de búsqueda
 *   3. Registro del service worker
 *
 * POR QUÉ SEPARADO. `patwalink.html` viaja dentro del APK y tiene que
 * funcionar sin conexión y sin nada superfluo: meterle marcado de
 * posicionamiento lo engorda sin darle nada al usuario que ya la instaló.
 * Al revés, la página web necesita texto para que la encuentren, y ese
 * texto sobra en una app ya abierta. Por eso la capa 2 se oculta cuando
 * la PWA corre instalada (`display-mode: standalone`): la ve quien llega
 * desde un buscador, no quien ya tiene la app.
 *
 *   node herramientas/generar_pwa.js
 *   node herramientas/generar_pwa.js --url=https://midominio.com/
 *
 * Códigos de salida: 0 correcto · 2 no se pudo generar.
 */

const fs   = require('fs');
const path = require('path');

const {RAIZ} = require('./motor.js');
const {SALIDA, leerArgumentos, validarArgumentos, texto, ejecutar} = require('./cli.js');

/**
 * Dirección pública. Con GitHub Pages sobre este repositorio es la de
 * abajo; con dominio propio, pasar --url=… y añadir el CNAME.
 */
const URL_POR_OMISION = 'https://u0921985828-arch.github.io/KKApp/';

const ORIGEN  = path.join(RAIZ, 'patwalink.html');
const DESTINO = path.join(RAIZ, 'pwa', 'index.html');

/* ---------- contenido de la capa de descubrimiento ----------
   Se escribe aquí, y no en el HTML de la app, porque es material de la
   página web y no del producto. Todo es texto real y comprobable: nada
   de relleno para engordar la página. */

/** Título de pestaña y de resultado. Distinto del H1, a propósito. */
const TITULO = 'Traductor de patois jamaicano ↔ español | PatwaLink';

const DESCRIPCION =
  'Traduce español a patois jamaicano y al revés, gratis y sin conexión. ' +
  'Motor de reglas con gramática real: marcadores de tiempo, cópula y ' +
  'negación. Sin cuentas, sin publicidad y sin enviar tu texto a ningún servidor.';

/**
 * Frases de ejemplo para la tabla. Salen del propio motor: son
 * traducciones que produce hoy, no ejemplos inventados para la página.
 */
const FRASES = [
  ['¿Qué tal?',                  'Wah gwaan?',            'El saludo corriente, a cualquier hora.'],
  ['Estoy comiendo',             'Mi a nyam',             '«a» marca el progresivo.'],
  ['Comí la comida',             'Mi nyam di food',       'El verbo desnudo dinámico ya es pasado.'],
  ['Había comido',               'Mi did nyam',           '«did» es anterioridad, no pasado simple.'],
  ['Voy a la tienda',            'Mi a go a di shop',     'El segundo «a» es preposición de lugar.'],
  ['No tengo dinero',            'Mi nuh have nuh money', 'La negación se marca dos veces.'],
  ['La comida se está enfriando','Di food a get cold',    '«get» + adjetivo es cambio de estado.'],
  ['¿Dónde hay una fiesta?',     'Weh wan party deh?',    '«deh» va detrás, no delante.'],
  ['Llévame al centro',          'Carry mi a di centre',  'El pronombre va suelto tras el verbo.'],
  ['Eso es tuyo',                'A fi yu dat',           'Posesivo tónico con «fi».']
];

/**
 * Preguntas frecuentes. Se usan dos veces: como texto visible y como
 * datos estructurados, generados desde la misma fuente para que no
 * puedan contradecirse — marcar un FAQ que no está en la página es
 * justo lo que penalizan los buscadores.
 */
const FAQ = [
  {
    p: '¿Qué es el patois jamaicano?',
    r: 'El patois jamaicano, o criollo jamaicano (Jamaican Creole, «patwa»), es la lengua ' +
       'materna de la mayoría de la población de Jamaica. Tiene su propia gramática, ' +
       'distinta de la inglesa: marca el tiempo y el aspecto con partículas antepuestas al ' +
       'verbo, tiene tres formas de cópula y admite doble negación. No es inglés mal hablado.'
  },
  {
    p: '¿El traductor funciona sin conexión?',
    r: 'Sí. Todo el diccionario y el motor de reglas viajan dentro de la página, así que una ' +
       'vez cargada funciona en modo avión. No hay llamadas a ninguna API y tu texto no sale ' +
       'del dispositivo.'
  },
  {
    p: '¿Cómo se escribe el patois? ¿Hay una ortografía correcta?',
    r: 'No hay ortografía oficial de uso común, y por eso la misma palabra aparece escrita de ' +
       'varias formas: «wah gwaan», «wagwan», «wa gwaan». El traductor normaliza por sonido, ' +
       'de modo que puedes escribirlo como te suene y aun así lo reconoce.'
  },
  {
    p: '¿Es fiable la traducción?',
    r: 'La gramática está probada con una batería de 70 casos por fenómeno —tiempo y aspecto, ' +
       'cópula, negación, focalización, verbos seriales— que el motor supera entera. El léxico ' +
       'es otra cosa: alrededor del 79% de las entradas son palabras inglesas asumidas como ' +
       'válidas en criollo y están pendientes de validación por hablantes nativos. Cuando una ' +
       'palabra no está, la app lo dice en vez de inventarla.'
  },
  {
    p: '¿Cuánto cuesta?',
    r: 'Nada. No tiene cuentas, ni publicidad, ni compras dentro de la aplicación, ni límite de ' +
       'uso. El motor es de reglas y se ejecuta en tu dispositivo, así que traducir no cuesta ' +
       'dinero a nadie.'
  },
  {
    p: '¿Puedo instalarlo en el móvil?',
    r: 'Sí, de dos maneras: desde el navegador con «Añadir a pantalla de inicio», que la ' +
       'instala como aplicación, o descargando el APK de Android desde el repositorio del ' +
       'proyecto.'
  },
  {
    p: '¿Qué diferencia hay con un traductor automático corriente?',
    r: 'Los traductores generales tratan el patois como inglés con faltas y devuelven inglés. ' +
       'PatwaLink implementa la gramática criolla de forma explícita: distingue «mi nyam» ' +
       '(comí) de «mi a nyam» (estoy comiendo) y de «mi did nyam» (había comido), que son tres ' +
       'tiempos distintos con el mismo verbo.'
  }
];

/** Escapa texto para incrustarlo en HTML. */
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Cabecera: instalable + descubrible.
 * @param {string} url  dirección canónica, con barra final
 */
function cabecera(url) {
  const imagen = url + 'icon-512.png';
  return `<meta name="theme-color" content="#00A99A">
<meta name="description" content="${esc(DESCRIPCION)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">

<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="PatwaLink">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-192.png">
<link rel="icon" href="icon-192.png">

<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="PatwaLink">
<meta property="og:title" content="${esc(TITULO)}">
<meta property="og:description" content="${esc(DESCRIPCION)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(imagen)}">
<meta property="og:image:alt" content="Icono de PatwaLink: la silueta de Jamaica sobre fondo turquesa">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(TITULO)}">
<meta name="twitter:description" content="${esc(DESCRIPCION)}">
<meta name="twitter:image" content="${esc(imagen)}">

<title>${esc(TITULO)}</title>`;
}

/**
 * Datos estructurados. La aplicación y las preguntas frecuentes, ambas
 * generadas desde el mismo contenido que se ve en la página.
 *
 * No se declara `LocalBusiness`: no hay negocio con dirección física, y
 * marcar uno inexistente es información falsa en el marcado.
 */
function datosEstructurados(url) {
  const grafo = [
    {
      '@type': 'WebSite',
      '@id': url + '#sitio',
      name: 'PatwaLink',
      url,
      inLanguage: 'es',
      description: DESCRIPCION
    },
    {
      '@type': 'WebApplication',
      '@id': url + '#app',
      name: 'PatwaLink',
      url,
      applicationCategory: 'EducationalApplication',
      applicationSubCategory: 'Traductor',
      operatingSystem: 'Android, iOS, Windows, macOS, Linux — cualquier navegador',
      browserRequirements: 'Requiere JavaScript. Funciona sin conexión.',
      inLanguage: 'es',
      isAccessibleForFree: true,
      offers: {'@type': 'Offer', price: '0', priceCurrency: 'EUR'},
      featureList: [
        'Traducción español → patois jamaicano',
        'Traducción patois jamaicano → español',
        'Funciona sin conexión',
        'Glosario con registro y notas de uso',
        'Análisis gramatical de cada traducción'
      ],
      description: DESCRIPCION
    },
    {
      '@type': 'FAQPage',
      '@id': url + '#faq',
      mainEntity: FAQ.map(f => ({
        '@type': 'Question',
        name: f.p,
        acceptedAnswer: {'@type': 'Answer', text: f.r}
      }))
    }
  ];

  return `<script type="application/ld+json">${
    JSON.stringify({'@context': 'https://schema.org', '@graph': grafo})
      .replace(/</g, '\\u003c')
  }</script>`;
}

/** Estilos de la capa de descubrimiento, en la lengua visual del cartel. */
const ESTILOS = `<style>
/* ---------- capa de descubrimiento ----------
   Sólo para la web: instalada como aplicación, esta parte sobra y se
   oculta. Reutiliza los tokens de la app para no abrir una segunda
   paleta. */
.vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;
  overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

.lienzo{max-width:640px;margin:0 auto;padding:8px 16px 40px}
.lienzo h2{font-family:var(--display);font-size:1.35rem;line-height:1.15;
  margin:34px 0 10px;letter-spacing:-.01em}
.lienzo h3{font-size:1rem;margin:20px 0 6px;font-weight:700}
.lienzo p{margin:0 0 12px;font-size:15px;line-height:1.62;color:var(--ink)}
.lienzo a{color:var(--sea-d);text-underline-offset:3px}

.resumen{
  background:var(--panel,#FFFDF7);border:2.5px solid var(--ink);
  box-shadow:5px 5px 0 var(--ink);border-radius:12px;
  padding:16px 18px;margin:22px 0 6px;
}
.resumen .et{font-family:var(--mono);font-size:10px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--muted);display:block;margin-bottom:8px}
.resumen ul{margin:0;padding-left:18px}
.resumen li{margin-bottom:6px;font-size:14.5px;line-height:1.5}
.resumen li:last-child{margin-bottom:0}

/* min-width para que en móvil la tabla se DESPLACE dentro de su caja en
   vez de estrujar las columnas hasta partir cada palabra en tres líneas */
.tabla-frases{width:100%;min-width:500px;border-collapse:collapse;font-size:14px;margin:6px 0 4px}
.tabla-frases th,.tabla-frases td{padding:8px 10px;text-align:left;
  border-bottom:1px solid var(--paper-2)}
.tabla-frases th{font-family:var(--mono);font-size:10px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--ink)}
.tabla-frases td:nth-child(2){font-weight:700}
.tabla-frases td:nth-child(3){color:var(--muted);font-size:13px}
.desliza{overflow-x:auto;-webkit-overflow-scrolling:touch;
  scrollbar-width:thin;margin-bottom:4px}
.desliza + .pista-desliza{font-size:12px;color:var(--muted);margin:0 0 8px}

.faq details{border-bottom:1px solid var(--paper-2);padding:2px 0}
.faq summary{cursor:pointer;padding:11px 0;font-weight:700;font-size:15px;
  list-style:none;display:flex;justify-content:space-between;gap:12px;align-items:center}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';font-family:var(--display);color:var(--sea-d);flex:none}
.faq details[open] summary::after{content:'–'}
.faq details p{margin:0 0 14px;color:var(--ink)}

.acciones{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 4px}
.compartir{
  font:inherit;font-weight:700;font-size:14px;cursor:pointer;
  background:var(--sun);color:var(--ink);
  border:2.5px solid var(--ink);border-radius:10px;
  box-shadow:4px 4px 0 var(--ink);padding:10px 16px;
  transition:transform var(--dur),box-shadow var(--dur);
}
.compartir:active{transform:translate(4px,4px);box-shadow:0 0 0 var(--ink)}

/* Vuelta al traductor: aparece sólo cuando ya has bajado del formulario,
   que es cuando deja de estar a la vista. */
.subir{
  position:fixed;right:14px;bottom:14px;z-index:40;
  font:inherit;font-weight:700;font-size:14px;cursor:pointer;
  background:var(--sea);color:#fff;
  border:2.5px solid var(--ink);border-radius:999px;
  box-shadow:4px 4px 0 var(--ink);padding:11px 18px;
  opacity:0;visibility:hidden;transform:translateY(8px);
  transition:opacity .18s,transform .18s,visibility .18s;
}
.subir.visible{opacity:1;visibility:visible;transform:none}
.subir:active{transform:translate(4px,4px);box-shadow:0 0 0 var(--ink)}

@media (prefers-reduced-motion:reduce){
  .compartir,.subir{transition:none}
}

/* Instalada como aplicación no hace falta nada de esto. */
@media (display-mode:standalone),(display-mode:fullscreen),(display-mode:minimal-ui){
  .lienzo,.subir{display:none!important}
}
</style>`;

/** Sección visible: intención, resumen, tabla, preguntas. */
function contenido(url) {
  const filas = FRASES.map(([es, pw, nota]) =>
    `      <tr><td>${esc(es)}</td><td>${esc(pw)}</td><td>${esc(nota)}</td></tr>`).join('\n');

  const preguntas = FAQ.map(f =>
    `      <details>
        <summary>${esc(f.p)}</summary>
        <p>${esc(f.r)}</p>
      </details>`).join('\n');

  return `
<section class="lienzo" aria-label="Sobre PatwaLink">

  <h2>Traductor de español a patois jamaicano</h2>

  <p>
    PatwaLink traduce en las dos direcciones entre <strong>español</strong> y
    <strong>patois jamaicano</strong> (criollo jamaicano, <em>patwa</em>), y lo hace
    entero dentro de tu navegador: el diccionario y la gramática viajan en la propia
    página. Escribe arriba y pulsa Traducir.
  </p>

  <div class="resumen">
    <span class="et">En resumen</span>
    <ul>
      <li><strong>Gratis y sin cuentas.</strong> Sin publicidad ni compras dentro.</li>
      <li><strong>Sin conexión.</strong> Una vez cargada funciona en modo avión, y tu
          texto nunca sale del dispositivo.</li>
      <li><strong>Gramática de verdad.</strong> Distingue «comí», «estoy comiendo» y
          «había comido», que en criollo son tres marcas distintas.</li>
      <li><strong>Escríbelo como suene.</strong> El patois no tiene ortografía oficial;
          el motor normaliza por sonido.</li>
      <li><strong>Dice lo que no sabe.</strong> Si una palabra no está en el diccionario
          lo avisa, en vez de inventar un criollo que nadie diría.</li>
    </ul>
  </div>

  <div class="acciones">
    <button class="compartir" type="button" data-compartir>Compartir PatwaLink</button>
  </div>

  <h2>Frases para empezar</h2>
  <div class="desliza">
    <table class="tabla-frases">
      <caption class="vh">Ejemplos de traducción entre español y patois jamaicano</caption>
      <thead>
        <tr><th scope="col">Español</th><th scope="col">Patois</th><th scope="col">Qué pasa aquí</th></tr>
      </thead>
      <tbody>
${filas}
      </tbody>
    </table>
  </div>
  <p class="pista-desliza">Desliza la tabla para ver la explicación de cada frase.</p>

  <h2>Preguntas frecuentes</h2>
  <div class="faq">
${preguntas}
  </div>

  <h2>Cómo está hecho</h2>
  <p>
    El motor es de reglas, no un modelo estadístico: implementa el sistema de tiempo,
    modo y aspecto del criollo —los marcadores antepuestos <em>a</em>, <em>did</em>,
    <em>done</em>, <em>a go</em>—, la cópula supletiva y la concordancia negativa. Se
    prueba con una batería de 70 casos etiquetados por fenómeno gramatical, y con un
    estudio de carga sobre 82.000 traducciones.
  </p>
  <p>
    El código y los estudios están publicados en
    <a href="https://github.com/u0921985828-arch/KKApp" rel="noopener">el repositorio del
    proyecto</a>, junto con la auditoría del motor y la medición de cobertura léxica.
  </p>

  <p><small>
    El glosario está pendiente de validación por hablantes nativos: alrededor del 79% de
    las entradas son palabras inglesas asumidas como válidas en criollo. Se dice aquí
    porque es la limitación real de la herramienta.
  </small></p>

</section>

<button class="subir" type="button" data-subir hidden>↑ Traducir</button>
`;
}

/** Comportamiento de la capa: compartir y volver al traductor. */
const GUION = `<script>
/* Compartir: interfaz nativa donde exista, portapapeles donde no. */
(function () {
  var boton = document.querySelector('[data-compartir]');
  if (!boton) return;

  boton.addEventListener('click', function () {
    var datos = {
      title: 'PatwaLink',
      text: 'Traductor de español a patois jamaicano que funciona sin conexión.',
      url: location.href
    };
    if (navigator.share) {
      navigator.share(datos).catch(function () { /* cancelado por el usuario */ });
      return;
    }
    var previo = boton.textContent;
    var restaurar = function (aviso) {
      boton.textContent = aviso;
      setTimeout(function () { boton.textContent = previo; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href)
        .then(function () { restaurar('Enlace copiado'); })
        .catch(function () { restaurar('No se pudo copiar'); });
    } else {
      restaurar(location.href);
    }
  });
})();

/* Vuelta al traductor cuando el formulario ya no está a la vista. */
(function () {
  var boton = document.querySelector('[data-subir]');
  var campo = document.querySelector('textarea');
  if (!boton || !campo || !('IntersectionObserver' in window)) return;

  boton.hidden = false;
  boton.addEventListener('click', function () {
    campo.scrollIntoView({behavior: 'smooth', block: 'center'});
    campo.focus({preventScroll: true});
  });

  new IntersectionObserver(function (entradas) {
    boton.classList.toggle('visible', !entradas[0].isIntersecting);
  }, {threshold: 0}).observe(campo);
})();

/* Registro del service worker: sólo en https o localhost. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
</script>`;

/**
 * Construye la PWA a partir de la app.
 *
 * @param {string} app  contenido de patwalink.html
 * @param {string} url  dirección canónica
 * @returns {string}
 */
function generar(app, url) {
  let salida = app;

  /* 1. cabecera */
  const tituloOriginal = '<title>PatwaLink</title>';
  if (!salida.includes(tituloOriginal)) {
    throw new Error('No se encuentra el <title> de la app; ¿ha cambiado patwalink.html?');
  }
  salida = salida.replace(tituloOriginal, cabecera(url) + '\n' + datosEstructurados(url));

  /* 2. estilos, justo antes de cerrar la cabecera del documento */
  salida = salida.replace('</head>', ESTILOS + '\n</head>');

  /* 3. El H1 sigue siendo el logotipo, pero lleva detrás lo que la página
        es en realidad. El texto está en el documento y lo leen tanto los
        buscadores como un lector de pantalla; sólo no ocupa sitio. Así el
        H1 dice de qué va la página y no repite el título de pestaña. */
  const h1 = '<h1 class="wordmark">Patwa<span>Link</span></h1>';
  if (!salida.includes(h1)) {
    throw new Error('No se encuentra el H1 de la app; ¿ha cambiado la cabecera?');
  }
  salida = salida.replace(h1,
    '<h1 class="wordmark">Patwa<span>Link</span>' +
    '<span class="vh"> — traductor de español a patois jamaicano</span></h1>');

  /* 4. contenido y guion, después de la aplicación */
  const cierre = salida.lastIndexOf('</body>');
  if (cierre < 0) throw new Error('El HTML no tiene </body>.');
  salida = salida.slice(0, cierre) + contenido(url) + GUION + '\n' + salida.slice(cierre);

  return salida;
}

/** Ficheros auxiliares del sitio. */
function auxiliares(url) {
  const hoy = new Date().toISOString().slice(0, 10);

  const robots = `# PatwaLink
# Todo el sitio es una sola página: no hay nada que ocultar al rastreador.
User-agent: *
Allow: /

# Modelos de lenguaje: ver también /llms.txt
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${url}sitemap.xml
`;

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url}</loc>
    <lastmod>${hoy}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

  /* llms.txt: resumen legible por máquinas de qué es esto y qué NO es.
     Las limitaciones van dentro a propósito: si un modelo va a citar la
     herramienta, más vale que cite también lo que no sabe hacer. */
  const llms = `# PatwaLink

> Traductor bidireccional entre español y patois jamaicano (criollo jamaicano,
> Jamaican Creole). Gratuito, sin cuentas y funciona sin conexión: el motor y el
> diccionario se ejecutan en el dispositivo del usuario.

PatwaLink no es un modelo estadístico. Es un motor de reglas que implementa la
gramática criolla de forma explícita: sistema de tiempo-modo-aspecto con
marcadores antepuestos (a, did, done, a go, wi), cópula supletiva en tres formas
(a ante nominal, deh ante lugar, cero ante adjetivo), concordancia negativa,
focalización con a-fronting, verbos seriales y reduplicación.

## Qué lo distingue

- Distingue tres tiempos que otros traductores colapsan: "mi nyam" (comí),
  "mi a nyam" (estoy comiendo), "mi did nyam" (había comido).
- El patois carece de ortografía fijada; el motor normaliza por sonido, así que
  reconoce "wah gwaan", "wagwan" y "wa gwaan" como la misma expresión.
- Cuando una palabra no está en el diccionario lo declara en vez de devolver la
  palabra española disfrazada de criollo.

## Limitaciones que conviene citar

- El léxico está pendiente de validación por hablantes nativos: alrededor del 79%
  de las entradas son palabras inglesas asumidas como válidas en criollo, algo
  coherente con la literatura pero no verificado entrada por entrada.
- La gramática supera una batería de 70 casos etiquetados por fenómeno, pero eso
  mide coincidencia con el criterio de quien escribió la batería, no corrección
  frente al criollo real.
- No traduce registro ni tono automáticamente: el glosario marca el registro de
  cada acepción, pero elegirlo es del usuario.

## Enlaces

- Aplicación: ${url}
- Código, auditoría del motor y estudios de cobertura: https://github.com/u0921985828-arch/KKApp
- Batería diagnóstica: https://github.com/u0921985828-arch/KKApp/blob/main/herramientas/suite.js
`;

  return {robots, sitemap, llms};
}

ejecutar(() => {
  const args = leerArgumentos(process.argv.slice(2));
  validarArgumentos(args, ['url', 'ayuda']);

  if (args.has('ayuda')) {
    console.log('\n  node herramientas/generar_pwa.js [--url=https://midominio.com/]\n');
    return SALIDA.ok;
  }

  let url = texto(args, 'url', URL_POR_OMISION);
  if (!/^https?:\/\//.test(url)) throw new Error(`--url debe empezar por http(s)://; se recibió «${url}».`);
  if (!url.endsWith('/')) url += '/';

  const app = fs.readFileSync(ORIGEN, 'utf8');
  fs.writeFileSync(DESTINO, generar(app, url));

  const aux = auxiliares(url);
  fs.writeFileSync(path.join(RAIZ, 'pwa', 'robots.txt'), aux.robots);
  fs.writeFileSync(path.join(RAIZ, 'pwa', 'sitemap.xml'), aux.sitemap);
  fs.writeFileSync(path.join(RAIZ, 'pwa', 'llms.txt'), aux.llms);

  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`
  PWA generada desde patwalink.html
    dirección   ${url}
    index.html  ${kb(fs.statSync(DESTINO).size)}
    robots.txt · sitemap.xml · llms.txt
`);
  return SALIDA.ok;
});
