# PatwaLink

Traductor bidireccional **español ↔ patois jamaicano**.
Un solo fichero HTML. Sin conexión, sin API, sin publicidad, sin cuentas.

![batería](https://img.shields.io/badge/bater%C3%ADa-70%2F70-brightgreen)
![cobertura](https://img.shields.io/badge/cobertura%20l%C3%A9xica-99%2C96%25-brightgreen)

---

## Probar ahora

Abre `patwalink.html` en cualquier navegador. Eso es todo: no hay que
instalar nada, no hace falta conexión y no se envía ni un byte a ningún
servidor.

## Estructura

```
patwalink.html                    la aplicación entera (~250 KB)
CLAUDE.md                         contexto para trabajar con Claude Code

herramientas/
  motor.js                        extrae y carga el motor desde el HTML
  cli.js                          argumentos, formato y códigos de salida
  runsuite.js                     ejecuta la batería diagnóstica
  suite.js                        70 casos por fenómeno gramatical
  estudio_uso.js                  simulador de carga y cobertura
  corpus_uso.js                   frases del simulador, ajenas al léxico
  generar_pwa.js                  construye la web desde patwalink.html
  destilar.py                     genera corpus y destila léxico con un LLM

estudios/
  estudio_motor_patwalink.md      auditoría del motor y hoja de ruta
  estudio_cobertura_lexica.md     cobertura frente al español completo
  estudio_uso_simulado.md         carga y cobertura con 10.000 usuarios

app/                              proyecto Android (WebView sin permisos)
pwa/                              variante web e instalable (generada)
patwalink_schema.sql              esquema Supabase del glosario colaborativo
```

`pwa/index.html`, `robots.txt`, `sitemap.xml` y `llms.txt` **se generan** con
`node herramientas/generar_pwa.js`. No se editan a mano: CI comprueba que
estén al día, igual que comprueba el HTML empaquetado en el APK.

---

## Pruebas

```bash
node herramientas/runsuite.js              # batería completa
node herramientas/runsuite.js --fenomeno=TMA
node herramientas/runsuite.js --motor=otra-version.html
```

Sale con código 1 si cae un solo caso. Ejecutarlo antes de cada commit.

**70/70.** Tres casos admiten dos respuestas correctas cada uno, porque
hay dos traducciones válidas y exigir una era sortear; cada uno lleva
anotado por qué. Uno (`INT-01`) es el límite del texto plano: sin signo de
interrogación, «vienes» y «estás viniendo» producen los dos `yu a come`.

Ese 100% mide coincidencia con el criterio de quien escribió la batería
sobre 70 fenómenos gramaticales. **No mide que el criollo sea correcto.**

## Estudio de uso

```bash
node herramientas/estudio_uso.js                          # 10.000 usuarios, 8 h
node herramientas/estudio_uso.js --usuarios=500
node herramientas/estudio_uso.js --motor=antes.html --json=antes.json
```

Somete el motor a la carga de N usuarios sintéticos y mide rendimiento,
cobertura léxica y qué palabras faltan. Reproducible: la semilla es fija,
así que dos ejecuciones dan lo mismo y `--motor=` compara dos versiones
contra el mismo corpus.

Mide carga y cobertura; **no** mide si la traducción es buena. La primera
pasada dejó al 53,5% de los usuarios con alguna palabra sin cubrir; tras
aplicar las reparaciones que señaló, al 1,6%. Detalle en
`estudios/estudio_uso_simulado.md`.

---

## Compilar el APK

**En local** (requiere JDK 17 y el SDK de Android):

```bash
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

El HTML se copia solo: la tarea `sincronizarWeb` lleva `patwalink.html` a
`app/src/main/assets/index.html` antes de cada compilación, de modo que no
hay dos copias que puedan divergir. Por eso esa copia está en `.gitignore`.

**En CI**: `.github/workflows/build-apk.yml` ejecuta primero la batería y
el estudio de uso, después compila, comprueba que el HTML empaquetado en el
APK es idéntico a `patwalink.html`, y publica el resultado como artefacto y
como release con etiqueta `apk` para poder descargarlo desde el móvil.

Si el entorno bloquea `dl.google.com` no se puede descargar el SDK: en ese
caso hay que compilar en el flujo de Actions, que sí tiene salida a internet.

### Firmar la variante de release

Cuatro secretos en el repositorio, y lanzar el flujo con `release: true`:

| Secreto | Contenido |
|---|---|
| `KEYSTORE_B64` | keystore en base64 (`base64 -w0 firma.jks`) |
| `KEYSTORE_PASS` | contraseña del almacén |
| `KEY_ALIAS` | alias de la clave |
| `KEY_PASS` | contraseña de la clave |

```bash
keytool -genkeypair -v -keystore firma.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias patwalink
```

Sin keystore configurado, `release` cae a la clave de depuración: el APK
queda instalable a mano pero no publicable. Es el comportamiento seguro,
no un fallo.

En local, la firma se pasa por propiedad de Gradle:

```bash
./gradlew assembleRelease \
  -PkeystoreFile=firma.jks -PkeystorePassword=… -PkeyAlias=… -PkeyPassword=…
```

## Publicar la PWA

```bash
node herramientas/generar_pwa.js          # o --url=https://midominio.com/
git subtree push --prefix pwa origin gh-pages
```

El service worker necesita HTTPS. Con Pages ya lo tienes, y desde el móvil
aparece «Añadir a pantalla de inicio».

El generador añade a la web una capa que la app offline no lleva: metadatos,
datos estructurados (`WebApplication` y `FAQPage`) y el texto que responde a
la intención de búsqueda —qué es el patois, si funciona sin conexión, cómo se
escribe—, más una tabla de frases y las preguntas frecuentes. Esa capa **se
oculta cuando la PWA corre instalada** (`display-mode: standalone`): la ve
quien llega desde un buscador, no quien ya tiene la aplicación abierta.

El H1 sigue siendo el logotipo, con el resto de la frase en texto accesible
pero no visible, para que diga de qué va la página sin repetir el título de
pestaña y sin tocar el diseño.

No se declara `LocalBusiness`: no hay negocio con dirección física y marcar
uno inexistente es información falsa en el marcado.

---

## Estado

El motor pasa los 70 casos de la batería y cubre el 99,96% de los tokens
de un corpus de uso de 82.020 traducciones, sin una sola excepción.

**El glosario sigue pendiente de validación por hablantes nativos.**
Alrededor del 79% de las entradas son palabras inglesas asumidas como
válidas en criollo: es lo que describe la literatura sobre la composición
del léxico, pero no se ha verificado entrada por entrada. Que la cobertura
sea del 99,96% significa que el motor **reconoce** las palabras, no que
acierte con ellas.

**Ése, y no la batería, es el número que falta por mover.**
