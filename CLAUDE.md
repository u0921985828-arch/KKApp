# PatwaLink — contexto del proyecto

Traductor bidireccional **español ↔ patois jamaicano** (Jamaican Creole).
Un solo fichero HTML, sin dependencias, sin red, sin API, sin coste por uso.

---

## Restricciones que no se negocian

1. **Un único fichero.** Todo —CSS, JS, léxico, motor— va dentro de `patwalink.html`. Sin `import`, sin CDN, sin `fetch` a nada externo.
2. **Funciona sin conexión.** Si algo necesita red para funcionar, no entra.
3. **Nada de `localStorage` ni `sessionStorage`** en el HTML principal. Estado en memoria.
4. **Coste cero por traducción.** El motor es de reglas. Si se añade un camino con LLM, es opcional y con clave del propio usuario.
5. **No inventar.** Si una palabra no está y no hay derivación fiable, se declara desconocida. Nunca se devuelve la palabra española disfrazada de criollo.

---

## Arquitectura del fichero

`patwalink.html` está organizado en bloques, en este orden. **Respetar el orden importa**: hay dependencias hacia adelante.

| Bloque | Contenido |
|---|---|
| `<style>` | Hoja completa. La máscara `--isle-mask` es la silueta de Jamaica en data-URI. |
| `GLOSSARY` | Entradas ricas con acepciones, registro, aviso y entonación. |
| `normalize` / `phoneticKey` | Normalización ortográfica y clave fonética. |
| `DIRECCIÓN DE TRADUCCIÓN` | Estado `dir`, botones, contexto del glosario. |
| `MOTOR DE REGLAS` | Léxico base, conjugador, autómata TMA, ambas direcciones. |
| `LÉXICO v0.3 … v0.8` | Ampliaciones sucesivas. Se añaden con `addAll`, que deduplica por lema español. |
| `CONJUGADOR v2` | Cambios de raíz, verbos en -zc, -uir, -ducir. Sobrescribe `conjugate`. |
| `DERIVACIÓN` | Cascada para palabras desconocidas. |
| `DETECCIÓN DE IDIOMA` | Clasificador español/patois. |
| Referencias del panel y render | Interfaz. |

### Piezas clave

**`parseTMA(toks, i)`** — el corazón del motor. El criollo antepone marcadores en orden fijo:

```
[NEG] [did] [a go|wi] [a|done] VERBO
```

Los marcadores **se apilan**: `did a` es pasado progresivo, `did done` es pasado completivo. `realizarTMA()` compone la forma española resultante.

**Clase aspectual.** En criollo, el verbo desnudo es **pasado si es dinámico** y **presente si es estativo**. El conjunto `ESTATIVOS` decide. Sin esto el tiempo verbal es incorrecto en la mayoría de oraciones reales.

**Cópula supletiva.** Tres formas: `a` ante nominal (ser), `deh` ante lugar (estar), cero ante adjetivo.

**Colocación del clítico.** La proclisis es la regla general (`lo vi`), pero el imperativo **afirmativo** exige enclisis y arrastra la tilde: `da`+`me` es `dame`, `lleva`+`me` es `llévame`. El negativo vuelve a la proclisis, y trae el «no» soldado dentro del propio token verbal en vez de como marca aparte — hay que mirar el texto además de la marca, o sale «no dígasme».

**Enclíticos y existencial.** El español suelda el pronombre al verbo (`llévame`) y el criollo lo deja suelto detrás (`carry mi`); `separarEnclitico` los separa después del léxico y antes de la derivación, que si no inventa un cognado de la forma soldada. El objeto NO se marca con `objPron`: esa marca la usa `moveClitics` para anteponerlo al estilo español. Para `haber` impersonal hay dos salidas: `deh` pospuesto en la pregunta locativa, `it have` en el resto.

**Incoativas.** `get`/`tun` + adjetivo es cambio de estado, no el verbo léxico: `get cold` es *enfriarse*, no «conseguir frío». `INCOATIVOS` indexa por el adjetivo **español**, no por el token criollo, para cubrir todas las grafías de golpe; lo que no está en la tabla cae en la perífrasis con `ponerse`, que siempre funciona. La regla se comprueba antes que el verbo suelto, y no dispara si tras el adjetivo hay un nombre (`get nice ting` sigue siendo «conseguir»).

**`conjugate()`** — el español es la parte irregular; el criollo no conjuga. Está resuelto por patrón (diptongación e→ie, o→ue, debilitación e→i) en lugar de por enumeración.

**Índices.** `PW_INDEX` y `ES_INDEX` se construyen en `rebuildIndex()`, que **se llama al final de cada ampliación de léxico**. `ES_EXACT` conserva las tildes: sin él, `compró` colisiona con `compro`.

---

## Cómo probar

La batería diagnóstica está en `herramientas/suite.js`: 70 casos etiquetados por fenómeno gramatical.

```bash
node herramientas/runsuite.js                  # batería completa
node herramientas/runsuite.js --fenomeno=TMA   # sólo un fenómeno
node herramientas/runsuite.js --motor=otra.html
```

Las herramientas comparten `herramientas/motor.js`, que extrae el motor del HTML y lo carga en Node. Ese recorte estaba duplicado en cada herramienta y con él la fragilidad: si cambia la estructura del HTML, ahora sólo hay un sitio que tocar. El bundle temporal se nombra por el hash de su contenido, así que dos versiones del motor conviven en el mismo proceso —eso es lo que hace posible `--motor=`— y editar el HTML nunca sirve una copia cacheada por `require`.

**Marca actual: 70/70.** Cualquier fallo es una regresión: el umbral de `runsuite.js` está en 70, así que la batería sale con código 1 si cae uno solo.

Reparto por fenómeno:

```
TMA 10/10   FOC 4/4   SER 4/4   SUB 5/5   NEG 6/6
PRO  4/4    RED 3/3   ESP 8/8   PRD 10/10
COP  5/5    SN  7/7   INT 4/4
```

**Qué significa ese 100%, y qué no.** Tres casos (`INT-01`, `INT-03`, `SN-07`) admiten dos respuestas correctas cada uno, porque hay dos traducciones válidas y exigir una era sortear. `exp` acepta una lista, y cada caso lleva anotado por qué. `INT-01` es el límite duro del formato: sin signo de interrogación, «vienes» y «estás viniendo» producen los dos `yu a come`, así que la vuelta no puede ser determinista — el caso lleva ahora el signo que trae cualquier texto real.

La lista de respuestas es para entradas genuinamente ambiguas, **no** para tapar salidas incorrectas. Si un caso empieza a fallar, se arregla el motor: ampliar `exp` para que pase es convertir la batería en decorado.

El 100% mide coincidencia con el criterio de quien escribió la batería sobre 70 fenómenos. No mide que el criollo esté bien: eso sigue pendiente de validación por hablantes nativos.

---

## Rendimiento

`normalize` y `phoneticKey` están **memorizadas**. No es un adorno: salían juntas
en el 74% del perfil de CPU porque la derivación de una palabra desconocida las
llama cientos de veces sobre las mismas formas. Sin caché, el p95 era 33 veces
peor y el salto entre «la palabra está» y «hay que derivarla» era de 226×, justo
en el momento en que el usuario escribe algo que el motor no conoce.

Si se toca `_phoneticKey`, la caché no se entera: son funciones puras y la clave
es la cadena de entrada, así que cualquier cambio en la lógica exige vaciar
`_memoFon` o reiniciar. En la app no importa —se carga entera cada vez— pero al
probar en Node sí.

`SUFIJOS_ORDENADOS` se calcula una vez al cargar. Antes se reordenaba dentro
de `cognadoIngles`, que se invoca por cada candidato de cada palabra
desconocida: trabajo repetido en la ruta más caliente del motor.

`node herramientas/estudio_uso.js` mide todo esto; `--motor=otro.html` compara
dos versiones contra el mismo corpus y la misma semilla. Marca actual sobre
82.020 traducciones: cobertura 99,96%, media 0,026 ms, p95 0,079 ms, cero
excepciones.

---

## Trampas conocidas

- **Homógrafos español verbo/sustantivo.** `casa` es sustantivo y forma de *casar*; `una` es determinante y subjuntivo de *unir*. La regla: tras determinante o preposición gana la lectura nominal. Si se toca el orden de las ramas del bucle, esto se rompe.
- **Pro-drop y artículos.** `normalize('él')` y `normalize('el')` dan lo mismo. El pro-drop debe comprobar `o.det` antes de borrar nada, o se come los artículos masculinos.
- **La negación es un token propio**, no va embebida en el verbo. Si se embebe, los clíticos se colocan mal (`lo no vi` en vez de `no lo vi`).
- **`addAll` deduplica por lema español.** Añadir dos entradas patois con la misma traducción descarta la segunda en silencio. Si una palabra no aparece, comprobar esto primero.
- **El orden de `SUFIJOS`** en la derivación importa: los largos deben ir antes (`-encia` antes que `-ia`).
- **El orden de las ramas del bucle es semántico, no cosmético.** La cópula dispara con `a`, así que cualquier regla que compita por ese token —preposición de lugar tras verbo de movimiento, futuro sin verbo— tiene que ir **antes**. Puesta después queda inalcanzable, y el síntoma es sutil: no falla, traduce otra cosa (`guh a shop` → «ve es tiendas»).
- **`matchPhrase` sólo busca desde dos tokens.** Una fórmula de una palabra necesita la comprobación aparte que hay tras el léxico. Si no, la entrada está en la tabla sin poder casar nunca.
- **`había`/`habrá` son existenciales y auxiliares.** Con un participio detrás son pluscuamperfecto: sin esa comprobación, «había comido» sale «it have nyam».

---

## Lo que está pendiente y por qué

**Validación por hablante nativo.** Es el cuello de botella real. El 100% mide la distancia entre el motor y el criterio de quien escribió la batería, no entre el motor y el criollo real. Alrededor del 79% de las entradas del léxico son palabras inglesas asumidas como válidas en criollo: coherente con la literatura, pero **sin verificar una por una**.

**Cobertura léxica por bandas** (ver `estudio_cobertura_lexica.md`):

```
núcleo      90%     frecuente   60%
específico  28%     abstracto    1% directo, 66% con derivación
```

El objetivo razonable son unos 8.000 lemas, que cubren el 95% de un texto corriente. Perseguir los 93.000 del DLE es perseguir palabras que ningún hablante de patois usaría, y además el DLE es base de datos protegida: **no se puede volcar**.

**`destilar.py`** genera corpus paralelo con un LLM, extrae léxico y construye una tabla de desambiguación por contexto. Se ejecuta una vez, fuera de la app; lo que se embarca es el resultado, no el modelo.

---

## Estilo visual

Cartel serigrafiado jamaicano con acabado de principios de los 2000. No es decoración arbitraria: la referencia es el rótulo pintado a mano y el flyer de sound system, no el folleto turístico.

- Contorno negro grueso y **sombra dura desplazada sin desenfoque** (desajuste de registro de serigrafía)
- Brillo especular en todo lo pulsable, plástico caramelo
- Las tarjetas salen ligeramente giradas, alternando lado
- Los botones se hunden al pulsarse: la sombra colapsa
- **La silueta de Jamaica es la firma**, trazada desde coordenadas reales de 29 puntos de costa. Aparece en cabecera, marca de agua, glifos e indicador de carga. Una sola definición en `--isle-mask`.
- Todo respeta `prefers-reduced-motion`

**No usar el tricolor rojo-oro-verde.** Es el recurso obvio y convierte cualquier cosa en souvenir.

**El aviso pesa lo que pesa el hueco.** `.alerta` tiene una variante `--leve`: un solo término sin traducir con el resto de la frase cubierta es una nota al margen —filete de tinta y nada más—, y el relleno rosa con contorno entero se reserva para cuando falta una parte apreciable. Se escribe con la clase doblada (`.alerta.alerta--leve`) para ganarle al degradado sin depender del orden en la hoja.

**Los tokens de la hoja de análisis vienen de una paleta anterior.** `--line`, `--abyss`, `--land`, `--coral`, `--cyan`, `--shelf` y `--hills` son nombres de carta náutica que sobrevivieron al repintado; estuvieron sin definir y ese panel se dibujaba sin color, porque un `var()` sin definir no aplica la declaración y el elemento hereda. Ahora están enganchados a la paleta viva en `:root`. Si se añade un color, engancharlo ahí y no meter un hexadecimal suelto.

**No hay modo oscuro, y es una decisión.** La hoja de estilo no declara `prefers-color-scheme` en ninguna parte: el diseño se compromete con un solo mundo visual, como el cartel que imita. Por eso el contenedor Android desactiva explícitamente el oscurecimiento algorítmico del WebView y usa un tema `Light`, no `DayNight`. Dejar que el sistema invierta estos colores no da un modo oscuro: da el mismo cartel pasado por un filtro que apaga el turquesa, ensucia el crema y deja las sombras duras sin sentido. Si algún día se quiere modo oscuro de verdad, se diseña —repintando la paleta a mano—, no se delega en el inversor del navegador.

---

## Compilar

```bash
./gradlew assembleDebug          # APK de depuración
./gradlew lintDebug              # análisis estático
./gradlew limpiar                # borra artefactos y la copia de assets
```

El HTML no se copia a mano: la tarea `sincronizarWeb` (en `app/build.gradle`,
enganchada a `preBuild`) copia `patwalink.html` a `app/src/main/assets/index.html`
en cada compilación, tanto en local como en CI. La copia está en `.gitignore`.

Si el entorno bloquea `dl.google.com` no se puede descargar el SDK de Android:
en ese caso hay que compilar en el flujo de GitHub Actions, que sí tiene salida
a internet.

La app Android es un WebView sin permisos, sin puente JavaScript y con `WebViewAssetLoader` en lugar de `file://` — este último obligaría a habilitar el acceso a ficheros locales, que es justo lo que conviene evitar. `MainActivity` sobrevive a un dispositivo sin WebView utilizable, desmonta la vista antes de destruirla para no filtrar la Activity, y se hace cargo de la caída del renderizador en vez de dejar que el sistema mate el proceso.

CI comprueba que el HTML empaquetado dentro del APK es idéntico a `patwalink.html`: si la copia a assets fallara, el APK publicado no sería el que se ha probado.

Para la variante PWA, la carpeta `pwa/` ya tiene manifiesto, service worker e iconos. Necesita servirse por HTTPS: con GitHub Pages basta.
