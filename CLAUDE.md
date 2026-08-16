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
| `LÉXICO v0.3 … v0.7` | Ampliaciones sucesivas. Se añaden con `addAll`, que deduplica por lema español. |
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

**Incoativas.** `get`/`tun` + adjetivo es cambio de estado, no el verbo léxico: `get cold` es *enfriarse*, no «conseguir frío». `INCOATIVOS` indexa por el adjetivo **español**, no por el token criollo, para cubrir todas las grafías de golpe; lo que no está en la tabla cae en la perífrasis con `ponerse`, que siempre funciona. La regla se comprueba antes que el verbo suelto, y no dispara si tras el adjetivo hay un nombre (`get nice ting` sigue siendo «conseguir»).

**`conjugate()`** — el español es la parte irregular; el criollo no conjuga. Está resuelto por patrón (diptongación e→ie, o→ue, debilitación e→i) en lugar de por enumeración.

**Índices.** `PW_INDEX` y `ES_INDEX` se construyen en `rebuildIndex()`, que **se llama al final de cada ampliación de léxico**. `ES_EXACT` conserva las tildes: sin él, `compró` colisiona con `compro`.

---

## Cómo probar

La batería diagnóstica está en `patwalink_suite_diagnostica.js`: 70 casos etiquetados por fenómeno gramatical.

```bash
# extraer el motor del HTML y ejecutar la batería
node herramientas/runsuite.js
```

**Marca actual: 67/70 (96%).** Si un cambio la baja, es una regresión: revertir o arreglar antes de seguir.

Reparto por fenómeno:

```
TMA 10/10   FOC 4/4   SER 4/4   SUB 5/5   NEG 6/6
PRO  4/4    RED 3/3   ESP 8/8   PRD 10/10
COP  5/5    SN  6/7   INT 2/4
```

Los tres fallos restantes están documentados en `estudio_motor_patwalink.md`. **Ninguno es un fallo del motor**: son casos de la batería con más de una respuesta correcta. `INT-01` es el caso límite — «vienes» y «estás viniendo» producen los dos `yu a come`, así que la vuelta no puede ser determinista.

---

## Trampas conocidas

- **Homógrafos español verbo/sustantivo.** `casa` es sustantivo y forma de *casar*; `una` es determinante y subjuntivo de *unir*. La regla: tras determinante o preposición gana la lectura nominal. Si se toca el orden de las ramas del bucle, esto se rompe.
- **Pro-drop y artículos.** `normalize('él')` y `normalize('el')` dan lo mismo. El pro-drop debe comprobar `o.det` antes de borrar nada, o se come los artículos masculinos.
- **La negación es un token propio**, no va embebida en el verbo. Si se embebe, los clíticos se colocan mal (`lo no vi` en vez de `no lo vi`).
- **`addAll` deduplica por lema español.** Añadir dos entradas patois con la misma traducción descarta la segunda en silencio. Si una palabra no aparece, comprobar esto primero.
- **El orden de `SUFIJOS`** en la derivación importa: los largos deben ir antes (`-encia` antes que `-ia`).

---

## Lo que está pendiente y por qué

**Validación por hablante nativo.** Es el cuello de botella real. El 96% mide la distancia entre el motor y el criterio de quien escribió la batería, no entre el motor y el criollo real. Alrededor del 79% de las entradas del léxico son palabras inglesas asumidas como válidas en criollo: coherente con la literatura, pero **sin verificar una por una**.

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

---

## Compilar

```bash
# APK de depuración
./gradlew assembleDebug
```

El HTML no se copia a mano: la tarea `sincronizarWeb` (en `app/build.gradle`,
enganchada a `preBuild`) copia `patwalink.html` a `app/src/main/assets/index.html`
en cada compilación, tanto en local como en CI. La copia está en `.gitignore`.

Si el entorno bloquea `dl.google.com` no se puede descargar el SDK de Android:
en ese caso hay que compilar en el flujo de GitHub Actions, que sí tiene salida
a internet.

La app Android es un WebView sin permisos, sin puente JavaScript y con `WebViewAssetLoader` en lugar de `file://`.

Para la variante PWA, la carpeta `pwa/` ya tiene manifiesto, service worker e iconos. Necesita servirse por HTTPS: con GitHub Pages basta.
