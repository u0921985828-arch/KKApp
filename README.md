# PatwaLink

Traductor bidireccional **español ↔ patois jamaicano**.
Un solo fichero HTML. Sin conexión, sin API, sin publicidad, sin cuentas.

![motor](https://img.shields.io/badge/bater%C3%ADa-70%2F70-brightgreen)

---

## Probar ahora

Abre `patwalink.html` en cualquier navegador. Eso es todo.

## Estructura

```
patwalink.html              la aplicación entera (~230 KB)
CLAUDE.md                   contexto para trabajar con Claude Code
herramientas/
  runsuite.js               ejecuta la batería diagnóstica
  suite.js                  70 casos por fenómeno gramatical
  estudio_uso.js            simulador de carga y cobertura
  corpus_uso.js             frases del simulador, ajenas al léxico
  destilar.py               genera corpus y destila léxico con un LLM
estudios/
  estudio_motor_patwalink.md      auditoría del motor y hoja de ruta
  estudio_cobertura_lexica.md     cobertura frente al español completo
  estudio_uso_simulado.md         carga y cobertura con 10.000 usuarios
pwa/                        variante instalable desde el navegador
app/                        proyecto Android (WebView sin permisos)
patwalink_schema.sql        esquema Supabase para el glosario colaborativo
```

## Pruebas

```bash
node herramientas/runsuite.js
```

Sale con código 1 si cae un solo caso. Ejecutarlo antes de cada commit.

## Estudio de uso

```bash
node herramientas/estudio_uso.js --usuarios=10000 --horas=8
```

Somete el motor a la carga de 10.000 usuarios sintéticos y mide rendimiento,
cobertura léxica y qué palabras faltan. Reproducible: la semilla es fija.
`--motor=otro.html` compara dos versiones contra el mismo corpus.

Mide carga y cobertura; **no** mide si la traducción es buena. Resultados en
`estudios/estudio_uso_simulado.md`: la primera pasada dejó el 53,5% de los
usuarios con alguna palabra sin cubrir, y tras aplicar las reparaciones que
señaló, el 1,6%.

## Compilar el APK

**En local** (requiere JDK 17 y SDK de Android):

```bash
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

El HTML se copia solo: la tarea `sincronizarWeb` de `app/build.gradle` lleva
`patwalink.html` a `app/src/main/assets/index.html` antes de cada compilación,
de modo que no hay dos copias que puedan divergir. Por eso esa copia está en
`.gitignore`.

**En CI**: el flujo `.github/workflows/build-apk.yml` compila en cada push a
`main`, publica el APK como artefacto (`patwalink-apk`) y lo adjunta además a
la release con etiqueta `apk`, para poder descargarlo directamente desde el
móvil. También puede lanzarse a mano desde **Actions ▸ Compilar APK ▸ Run
workflow**. Para firmar la variante de release hay que
configurar cuatro secretos en el repositorio:

| Secreto | Contenido |
|---|---|
| `KEYSTORE_B64` | keystore en base64 (`base64 -w0 firma.jks`) |
| `KEYSTORE_PASS` | contraseña del almacén |
| `KEY_ALIAS` | alias de la clave |
| `KEY_PASS` | contraseña de la clave |

Generar el keystore:

```bash
keytool -genkeypair -v -keystore firma.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias patwalink
```

## Publicar la PWA

```bash
# GitHub Pages sobre la carpeta pwa/
git subtree push --prefix pwa origin gh-pages
```

El service worker necesita HTTPS. Con Pages ya lo tienes, y desde el móvil
aparece «Añadir a pantalla de inicio».

## Estado

El motor supera los 70 casos de la batería. Tres de ellos admiten dos
respuestas correctas, porque hay dos traducciones válidas: exigir una sola
era sortear, no medir. Uno (`INT-01`) es el límite del texto plano — sin
signo de interrogación, «vienes» y «estás viniendo» dan los dos `yu a come`.

Ese 100% mide coincidencia con el criterio de quien escribió la batería
sobre 70 fenómenos gramaticales. No mide que el criollo sea correcto.

**El glosario está pendiente de validación por hablantes nativos.** Alrededor
del 79% de las entradas son palabras inglesas asumidas como válidas en criollo:
es lo que describe la literatura sobre la composición del léxico, pero no se ha
verificado entrada por entrada. **Ése, y no la batería, es el número que
falta por mover.**
