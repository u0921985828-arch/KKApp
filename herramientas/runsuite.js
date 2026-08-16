#!/usr/bin/env node
/* Extrae el motor de patwalink.html y ejecuta la batería diagnóstica.
   No carga la interfaz: sólo la lógica, para poder correr en CI. */
const fs = require('fs');
const path = require('path');

const RAIZ  = path.resolve(__dirname, '..');
const HTML  = path.join(RAIZ, 'patwalink.html');
const SUITE = path.join(__dirname, 'suite.js');

const s  = fs.readFileSync(HTML, 'utf8');
const js = s.split('<script>')[1].split('</script>')[0];

/* el motor va desde el glosario hasta las referencias del DOM */
const corte = '/* ---------- referencias del panel ---------- */';
const inicioDir = js.indexOf('/* ============================================================\n   DIRECCIÓN DE TRADUCCIÓN');
const inicioMotor = js.indexOf('/* ============================================================\n   MOTOR DE REGLAS');
const fin = js.indexOf(corte);

if (inicioMotor < 0 || fin < 0) {
  console.error('No se localizan los bloques del motor. ¿Ha cambiado la estructura del HTML?');
  process.exit(2);
}

const nucleo = 'var dir="pw2es";\n'
             + js.slice(0, inicioDir)      // glosario y normalización
             + js.slice(inicioMotor, fin); // motor, léxico, derivación, detección

const tmp = path.join(require('os').tmpdir(), 'patwalink_suite.js');
fs.writeFileSync(tmp, nucleo + fs.readFileSync(SUITE, 'utf8') + `
const {rows, byCat} = runSuite();
const ok = rows.filter(r=>r.pass).length;
const pct = Math.round(ok/rows.length*100);
console.log('\\nRESULTADO: ' + ok + '/' + rows.length + '  (' + pct + '%)\\n');
Object.entries(byCat)
  .sort((a,b)=> a[1].ok/a[1].n - b[1].ok/b[1].n)
  .forEach(([k,v])=>{
    const p = Math.round(v.ok/v.n*100);
    console.log('  ' + k.padEnd(5) + String(v.ok+'/'+v.n).padEnd(7) +
                String(p+'%').padStart(5) + '  ' + '#'.repeat(Math.round(p/10)));
  });
const fallos = rows.filter(r=>!r.pass);
if(fallos.length){
  console.log('\\nFALLOS:');
  fallos.forEach(r=>console.log(
    '  [' + r.f.split(' ')[0] + '] ' + r.in +
    '\\n     esperado: ' + r.exp +
    '\\n     obtenido: ' + r.got));
}
/* umbral de regresión */
const MINIMO = 66;
if(ok < MINIMO){
  console.error('\\nREGRESIÓN: ' + ok + ' < ' + MINIMO + ' casos.');
  process.exit(1);
}
`);

require(tmp);
