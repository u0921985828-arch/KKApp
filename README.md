# PatwaLink

Traductor bidireccional **español ↔ patois jamaicano**.
Un solo fichero HTML. Sin conexión, sin API, sin publicidad, sin cuentas.

![motor](https://img.shields.io/badge/bater%C3%ADa-67%2F70-brightgreen)

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
  destilar.py               genera corpus y destila léxico con un LLM
estudios/
  estudio_motor_patwalink.md      auditoría del motor y hoja de ruta
  estudio_cobertura_lexica.md     cobertura frente al español completo
pwa/                        variante instalable desde el navegador
app/                        proyecto Android (WebView sin permisos)
patwalink_schema.sql        esquema Supabase para el glosario colaborativo
```

## Pruebas

```bash
node herramientas/runsuite.js
```

Sale con código 1 si baja de 67 casos. Ejecutarlo antes de cada commit.

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

El motor supera 67 de 70 casos gramaticales. Los tres restantes no son
fallos del motor: son casos con más de una traducción correcta, y uno de
ellos no tiene solución posible en texto plano.

**El glosario está pendiente de validación por hablantes nativos.** Alrededor
del 79% de las entradas son palabras inglesas asumidas como válidas en criollo:
es lo que describe la literatura sobre la composición del léxico, pero no se ha
verificado entrada por entrada. Hasta que eso ocurra, el 96% mide la distancia
respecto al criterio de quien escribió la batería, no respecto al criollo real.
