#!/usr/bin/env node
/* ============================================================
   ESTUDIO DE USO SIMULADO
   Somete el motor real a la carga de 10.000 usuarios durante
   8 horas y mide lo que es objetivamente medible.

   QUÉ MIDE           rendimiento, cobertura léxica, huecos del
                      diccionario, reglas que disparan, fallos
   QUÉ NO MIDE        si la traducción es buena. No hay verdad
                      de referencia: eso exige hablantes nativos
                      y ninguna simulación lo sustituye.

   Reproducible: el generador aleatorio va con semilla fija, así
   que dos ejecuciones dan el mismo resultado. Cambiar la semilla
   (--semilla=N) sirve para comprobar que las conclusiones no
   dependen de un sorteo concreto.

   uso:  node herramientas/estudio_uso.js [--usuarios=10000]
                                          [--horas=8] [--semilla=20260816]
                                          [--json=salida.json]
   ============================================================ */
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const RAIZ = path.resolve(__dirname, '..');

/* ---------- argumentos ---------- */
const arg = (n, def) => {
  const m = process.argv.find(a => a.startsWith('--' + n + '='));
  return m ? m.split('=')[1] : def;
};
const USUARIOS = parseInt(arg('usuarios', 10000), 10);
const HORAS    = parseInt(arg('horas', 8), 10);
const SEMILLA  = parseInt(arg('semilla', 20260816), 10);
const JSON_OUT = arg('json', null);
/* --motor apunta a otro HTML: sirve para comparar dos versiones del
   motor contra exactamente el mismo corpus y la misma semilla */
const MOTOR    = arg('motor', path.resolve(__dirname, '..', 'patwalink.html'));

/* ---------- generador con semilla (mulberry32) ---------- */
function prng(semilla){
  let a = semilla >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- carga del motor real desde el HTML ---------- */
function cargarMotor(){
  const s  = fs.readFileSync(MOTOR, 'utf8');
  const js = s.split('<script>')[1].split('</script>')[0];
  const corte = '/* ---------- referencias del panel ---------- */';
  const iDir = js.indexOf('/* ============================================================\n   DIRECCIÓN DE TRADUCCIÓN');
  const iMot = js.indexOf('/* ============================================================\n   MOTOR DE REGLAS');
  const fin  = js.indexOf(corte);
  if(iMot < 0 || fin < 0){
    console.error('No se localizan los bloques del motor. ¿Ha cambiado la estructura del HTML?');
    process.exit(2);
  }
  const nucleo = 'var dir="pw2es";\n' + js.slice(0, iDir) + js.slice(iMot, fin);
  const tmp = path.join(os.tmpdir(),
    'patwalink_estudio_' + path.basename(MOTOR).replace(/\W/g,'_') + '.js');
  fs.writeFileSync(tmp, nucleo + '\nmodule.exports={ruleTranslate,fijarDir:d=>{dir=d}};\n');
  return require(tmp);
}

/* ---------- muestreo ---------- */
/* Zipf: en uso real unas pocas frases se repiten muchísimo y la cola
   es larguísima. Muestrear uniforme daría una cobertura optimista,
   porque diluiría el peso de las frases corrientes. */
function indiceZipf(n, rnd, s = 1.1){
  const u = rnd();
  return Math.min(n - 1, Math.floor(n * Math.pow(u, s)));
}

/* curva diurna: la carga no es plana en 8 horas */
const CURVA = [0.6, 0.9, 1.25, 1.4, 1.3, 1.1, 0.85, 0.6];

function main(){
  const rnd   = prng(SEMILLA);
  const motor = cargarMotor();
  const {generarRepertorio} = require('./corpus_uso.js');

  const repertorio = generarRepertorio(rnd);
  /* ordenar por peso decreciente + azar: la cabeza de la Zipf son las
     frases de dominios frecuentes (saludos, comida, palabra suelta) */
  repertorio.sort((a, b) => (b.peso - a.peso) || (rnd() - 0.5));

  console.error(`repertorio: ${repertorio.length} frases distintas`);
  console.error(`simulando ${USUARIOS} usuarios · ${HORAS} h · semilla ${SEMILLA}`);
  console.error(`motor: ${MOTOR}`);

  /* ----- acumuladores ----- */
  const lat        = [];                 // latencia de cada traducción, ms
  const porHora    = new Array(HORAS).fill(0);
  const porDominio = {};
  const porDir     = {es2pw:{n:0, cob:0}, pw2es:{n:0, cob:0}};
  const desconocidas = new Map();        // token -> {n, usuarios:Set}
  const reglas     = new Map();          // etiqueta -> veces
  const frasesFallo = new Map();         // frase -> {n, cob, salida}
  let total = 0, errores = 0, cobSuma = 0;
  let plenas = 0, medias = 0, pobres = 0;
  let sesiones = 0, sesionesConHueco = 0, usuariosConHueco = 0;
  const erroresEjemplo = [];

  const pesoTotal = CURVA.slice(0, HORAS).reduce((a, b) => a + b, 0);

  for(let u = 0; u < USUARIOS; u++){
    /* sesiones por usuario: la mayoría abre la app una vez */
    const nSes = rnd() < 0.68 ? 1 : (rnd() < 0.8 ? 2 : 3);
    let usuarioTocado = false;

    for(let s = 0; s < nSes; s++){
      sesiones++;
      /* hora de la sesión según la curva diurna */
      let x = rnd() * pesoTotal, hora = 0;
      while(hora < HORAS - 1 && x > CURVA[hora]){ x -= CURVA[hora]; hora++; }

      /* traducciones por sesión: cola geométrica, media ~6 */
      const nTrad = 1 + Math.floor(-Math.log(1 - rnd()) * 5.5);
      let sesionTocada = false;

      for(let t = 0; t < nTrad && t < 60; t++){
        const f = repertorio[indiceZipf(repertorio.length, rnd)];
        motor.fijarDir(f.dir);

        const t0 = process.hrtime.bigint();
        let r;
        try {
          r = motor.ruleTranslate(f.texto);
        } catch(e){
          errores++;
          if(erroresEjemplo.length < 10)
            erroresEjemplo.push({dir:f.dir, texto:f.texto, error:e.message});
          continue;
        }
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;

        total++;
        lat.push(ms);
        porHora[hora]++;
        cobSuma += r.coverage;

        porDominio[f.dominio] = porDominio[f.dominio] || {n:0, cob:0, desc:0};
        porDominio[f.dominio].n++;
        porDominio[f.dominio].cob += r.coverage;

        porDir[f.dir].n++;
        porDir[f.dir].cob += r.coverage;

        if(r.coverage >= 0.999) plenas++;
        else if(r.coverage >= 0.8) medias++;
        else pobres++;

        if(r.unknown && r.unknown.length){
          porDominio[f.dominio].desc += r.unknown.length;
          sesionTocada = true;
          for(const tok of r.unknown){
            const k = String(tok).toLowerCase();
            let e = desconocidas.get(k);
            if(!e){ e = {n:0, usuarios:new Set(), dir:f.dir}; desconocidas.set(k, e); }
            e.n++;
            if(e.usuarios.size < 100000) e.usuarios.add(u);
          }
          /* frase con hueco: se guarda para el listado de reparación */
          const fk = f.dir + '|' + f.texto;
          let ff = frasesFallo.get(fk);
          if(!ff){ ff = {n:0, cob:r.coverage, salida:r.text, dir:f.dir, texto:f.texto}; frasesFallo.set(fk, ff); }
          ff.n++;
        }

        for(const a of (r.applied || [])){
          const etq = String(a).split(' ')[0];
          reglas.set(etq, (reglas.get(etq) || 0) + 1);
        }
      }

      if(sesionTocada){ sesionesConHueco++; usuarioTocado = true; }
    }
    if(usuarioTocado) usuariosConHueco++;

    if(u && u % 2000 === 0) console.error(`  ${u} usuarios…`);
  }

  /* ----- informe ----- */
  lat.sort((a, b) => a - b);
  const pct = p => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : 0;
  const sum = lat.reduce((a, b) => a + b, 0);

  const top = [...desconocidas.entries()]
    .map(([tok, e]) => ({tok, n:e.n, usuarios:e.usuarios.size, dir:e.dir}))
    .sort((a, b) => b.usuarios - a.usuarios || b.n - a.n);

  const peores = [...frasesFallo.values()].sort((a, b) => b.n - a.n);

  const res = {
    parametros:{usuarios:USUARIOS, horas:HORAS, semilla:SEMILLA,
                repertorio:repertorio.length, motor:path.basename(MOTOR)},
    volumen:{traducciones:total, sesiones, errores,
             tradPorSesion:+(total / sesiones).toFixed(2),
             porHora},
    rendimiento:{
      totalMs:+sum.toFixed(1),
      media:+(sum / total).toFixed(3),
      p50:+pct(0.50).toFixed(3), p90:+pct(0.90).toFixed(3),
      p95:+pct(0.95).toFixed(3), p99:+pct(0.99).toFixed(3),
      max:+lat[lat.length - 1].toFixed(3),
      /* la app es de un solo hilo en el móvil: el pico se calcula
         sobre la hora más cargada como si un solo núcleo lo sirviera */
      picoTradPorHora: Math.max(...porHora),
      segundosCpuHoraPico: +(Math.max(...porHora) * (sum / total) / 1000).toFixed(1)
    },
    cobertura:{
      media:+(cobSuma / total).toFixed(4),
      plenas, medias, pobres,
      pctPlenas:+(plenas / total * 100).toFixed(1),
      pctPobres:+(pobres / total * 100).toFixed(1),
      sesionesConHueco, pctSesionesConHueco:+(sesionesConHueco / sesiones * 100).toFixed(1),
      usuariosConHueco, pctUsuariosConHueco:+(usuariosConHueco / USUARIOS * 100).toFixed(1),
      tokensDesconocidosDistintos: desconocidas.size
    },
    porDominio: Object.fromEntries(Object.entries(porDominio).map(([k, v]) =>
      [k, {n:v.n, cobertura:+(v.cob / v.n).toFixed(4), descPorTrad:+(v.desc / v.n).toFixed(3)}])),
    porDireccion: Object.fromEntries(Object.entries(porDir).map(([k, v]) =>
      [k, {n:v.n, cobertura:+(v.cob / v.n).toFixed(4)}])),
    topDesconocidas: top.slice(0, 40),
    peoresFrases: peores.slice(0, 25),
    reglas: [...reglas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
      .map(([etq, n]) => ({etq, n})),
    erroresEjemplo
  };

  if(JSON_OUT){
    fs.writeFileSync(JSON_OUT, JSON.stringify(res, null, 2));
    console.error('escrito ' + JSON_OUT);
  }
  imprimir(res);
  return res;
}

function barra(p, ancho = 24){
  return '#'.repeat(Math.round(p * ancho)).padEnd(ancho, '·');
}

function imprimir(r){
  const L = console.log;
  L('');
  L('══════════════════════════════════════════════════════════════');
  L('  ESTUDIO DE USO SIMULADO — PatwaLink');
  L('══════════════════════════════════════════════════════════════');
  L('');
  L(`  ${r.parametros.usuarios.toLocaleString('es')} usuarios · ${r.parametros.horas} h · ` +
    `${r.parametros.repertorio} frases distintas · semilla ${r.parametros.semilla}`);
  L('');
  L('── VOLUMEN ───────────────────────────────────────────────────');
  L(`  traducciones            ${r.volumen.traducciones.toLocaleString('es')}`);
  L(`  sesiones                ${r.volumen.sesiones.toLocaleString('es')}  (${r.volumen.tradPorSesion} traducciones cada una)`);
  L(`  fallos del motor        ${r.volumen.errores}`);
  L('');
  L('  reparto por hora');
  const maxH = Math.max(...r.volumen.porHora);
  r.volumen.porHora.forEach((n, i) =>
    L(`    h${i + 1}  ${String(n).padStart(7)}  ${barra(n / maxH, 30)}`));
  L('');
  L('── RENDIMIENTO (por traducción) ──────────────────────────────');
  L(`  media                   ${r.rendimiento.media} ms`);
  L(`  mediana (p50)           ${r.rendimiento.p50} ms`);
  L(`  p90                     ${r.rendimiento.p90} ms`);
  L(`  p95                     ${r.rendimiento.p95} ms`);
  L(`  p99                     ${r.rendimiento.p99} ms`);
  L(`  máximo                  ${r.rendimiento.max} ms`);
  L(`  hora pico               ${r.rendimiento.picoTradPorHora.toLocaleString('es')} traducciones`);
  L(`  CPU en la hora pico     ${r.rendimiento.segundosCpuHoraPico} s`);
  L('');
  L('── COBERTURA LÉXICA ──────────────────────────────────────────');
  L(`  cobertura media         ${(r.cobertura.media * 100).toFixed(1)}%`);
  L(`  traducciones completas  ${r.cobertura.pctPlenas}%  ${barra(r.cobertura.plenas / r.volumen.traducciones)}`);
  L(`  con algún hueco         ${(100 - r.cobertura.pctPlenas).toFixed(1)}%`);
  L(`  por debajo del 80%      ${r.cobertura.pctPobres}%`);
  L('');
  L(`  sesiones con hueco      ${r.cobertura.pctSesionesConHueco}%`);
  L(`  USUARIOS con hueco      ${r.cobertura.pctUsuariosConHueco}%   ← el número que importa`);
  L(`  palabras sin cubrir     ${r.cobertura.tokensDesconocidosDistintos} distintas`);
  L('');
  L('── POR DOMINIO ───────────────────────────────────────────────');
  Object.entries(r.porDominio).sort((a, b) => a[1].cobertura - b[1].cobertura)
    .forEach(([k, v]) => L(`  ${k.padEnd(12)} ${String(v.n).padStart(7)} trad   ` +
      `cobertura ${(v.cobertura * 100).toFixed(1).padStart(5)}%  ${barra(v.cobertura, 18)}`));
  L('');
  L('── POR DIRECCIÓN ─────────────────────────────────────────────');
  Object.entries(r.porDireccion).forEach(([k, v]) =>
    L(`  ${k}   ${String(v.n).padStart(7)} trad   cobertura ${(v.cobertura * 100).toFixed(1)}%`));
  L('');
  L('── PALABRAS QUE MÁS USUARIOS ECHAN EN FALTA ──────────────────');
  L('  (ordenadas por usuarios afectados: es la cola de reparación)');
  r.topDesconocidas.slice(0, 20).forEach((d, i) =>
    L(`  ${String(i + 1).padStart(2)}. ${d.tok.padEnd(20)} ${String(d.usuarios).padStart(6)} usuarios  ` +
      `${String(d.n).padStart(7)} veces  [${d.dir}]`));
  L('');
  L('── REGLAS GRAMATICALES QUE DISPARAN ──────────────────────────');
  r.reglas.slice(0, 15).forEach(x =>
    L(`  ${x.etq.padEnd(8)} ${String(x.n).padStart(8)}`));
  L('');
  L('══════════════════════════════════════════════════════════════');
  L('  ESTE ESTUDIO NO MIDE SI LAS TRADUCCIONES SON BUENAS.');
  L('  Mide carga, cobertura y huecos. La corrección del criollo');
  L('  sigue necesitando hablantes nativos: ninguna simulación');
  L('  puede sustituirlos, porque no hay verdad de referencia.');
  L('══════════════════════════════════════════════════════════════');
  L('');
}

main();
