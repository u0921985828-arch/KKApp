# CERCA · De un HTML a una app real

Tres piezas independientes. Puedes parar en cualquiera de ellas y tener algo que funciona.

| Pieza | Qué te da | Tiempo | Coste |
|---|---|---|---|
| 1 · Supabase | Base de datos compartida entre usuarios | ~20 min | 0 € (plan gratuito) |
| 2 · Web | URL pública que funciona en cualquier móvil | ~10 min | 0 € |
| 3 · APK | App instalable en Android | ~40 min la primera vez | 0 € (25 $ solo si publicas en Play) |

---

## 1 · Base de datos (Supabase)

1. Crea cuenta en supabase.com → **New project**.
   - Nombre: `cerca`
   - **Región: `eu-central-1` (Frankfurt)** — la más cercana y dentro de la UE por el RGPD.
   - Guarda la contraseña de la base de datos.
2. Espera a que arranque (~2 min).
3. Menú lateral → **SQL Editor** → **New query** → pega entero `supabase_schema.sql` → **Run**.
   Debe terminar con *Success*. Crea las tablas, PostGIS, las políticas de seguridad, los frenos anti-spam y las funciones `toilets_nearby`, `add_toilet` y `reviews_for`.
4. Menú lateral → **Project Settings → API**. Copia:
   - **Project URL** → `https://xxxxxxxx.supabase.co`
   - **anon / publishable key** → la clave larga.
     > Esta clave es pública por diseño: va dentro de la app y cualquiera puede leerla. Lo que protege los datos son las políticas RLS del esquema, no la clave. **La `service_role` no la pongas nunca en la app.**
5. Abre `banos.html` en el móvil → toca el logo **CERCA** → pega URL y clave → **Conectar**.

Listo. A partir de ahí:
- Los baños que añadas se publican para todo el mundo.
- Las reseñas se comparten, incluidas las de baños que solo existen en OpenStreetMap.
- Sin cobertura, la app guarda los envíos en una cola y los suelta sola cuando vuelve la red.

**Comprobación rápida**, en el SQL Editor:
```sql
select count(*) from toilets;
select * from reviews order by created_at desc limit 10;
```

---

## 2 · Web pública

`banos.html` es un archivo suelto: cualquier hosting estático vale.

**Cloudflare Pages** (recomendado, gratis y rápido desde España):
1. Crea un repo en GitHub con el archivo renombrado a `index.html`.
2. Cloudflare → Workers & Pages → **Create → Pages → Connect to Git**.
3. Build command: *(vacío)* · Output directory: `/`
4. Deploy. Ya tienes `https://cerca.pages.dev`.

Alternativa aún más corta: GitHub Pages (Settings → Pages → branch `main`, carpeta `/root`).

> Ojo con una cosa: **la geolocalización solo funciona en HTTPS**. En `file://` o `http://` el navegador la bloquea. Cualquiera de las dos opciones te da HTTPS.

Con eso ya tienes PWA de facto: se puede "Añadir a pantalla de inicio" desde Chrome.

---

## 3 · APK (Capacitor)

Aquí está la clave de tu pregunta: **el APK no necesita hosting**. Capacitor mete el HTML *dentro* del APK y lo sirve en local. Arranca al instante, funciona sin red desde el primer segundo y no depende de que tu web esté viva.

### Estructura del proyecto

```
cerca/
├── www/
│   └── index.html        ← banos.html renombrado
├── capacitor.config.json
├── package.json
└── .github/workflows/apk.yml
```

### `package.json`
```json
{
  "name": "cerca",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "@capacitor/cli": "^6.2.0",
    "@capacitor/core": "^6.2.0",
    "@capacitor/android": "^6.2.0",
    "@capacitor/geolocation": "^6.1.0"
  }
}
```

### `capacitor.config.json`
```json
{
  "appId": "com.eddie.cerca",
  "appName": "Cerca",
  "webDir": "www",
  "android": { "allowMixedContent": false },
  "server": { "androidScheme": "https" }
}
```

`androidScheme: https` es **imprescindible**: sin él el WebView sirve la app en `http://localhost` y Android bloquea la geolocalización.

### Permisos — `android/app/src/main/AndroidManifest.xml`
Después del primer `npx cap add android`, añade dentro de `<manifest>`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

### Construir en local (desde Termux o PC)
```bash
npm install
npx cap add android
npx cap sync
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

### `.github/workflows/apk.yml` — compilación automática
Como hiciste con la app de chat: subes el cambio y GitHub te devuelve el APK.

```yaml
name: APK
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21

      - uses: android-actions/setup-android@v3

      - name: Instalar dependencias
        run: npm install

      - name: Preparar proyecto Android
        run: |
          npx cap add android || true
          npx cap sync android

      - name: Permisos de ubicación
        run: |
          f=android/app/src/main/AndroidManifest.xml
          grep -q ACCESS_FINE_LOCATION $f || sed -i \
            's|<application|<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>\n    <application|' $f

      - name: Compilar
        run: cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon

      - uses: actions/upload-artifact@v4
        with:
          name: cerca-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

El APK sale en la pestaña **Actions → la ejecución → Artifacts**. Es un *debug build*: se instala perfectamente por USB o descargándolo, pero para Play Store necesitas firmarlo con tu propio keystore.

### Mejora recomendada para el APK
Descarga `leaflet.js`, `leaflet.css` y las fuentes, y guárdalos en `www/vendor/`. Cambia los `<link>` y `<script>` a rutas relativas. Así la app arranca **completamente sin red**, sin depender de CDN. Es el mismo criterio que usaste en la app de chat local.

---

## Por qué no v0

v0 genera interfaces y las despliega en Vercel. En este caso:

- **No te da base de datos.** Tendrías que conectar Supabase igual, así que ese paso no te lo ahorra.
- **No te da APK.** Vercel aloja una web; para el APK necesitas Capacitor de todas formas.
- **Rompe tu formato.** v0 escupe un proyecto Next.js con muchos archivos. Tú trabajas con un HTML único que va directo al WebView. Meter Next.js en un APK obliga a exportación estática y a pelearte con el router — trabajo extra para acabar en el mismo sitio.
- **Añade dependencia.** Un archivo que abres en cualquier navegador no puede caducar. Un proyecto en la nube de un tercero, sí.

**v0 sí tiene sentido** si en algún momento quieres un panel de administración o moderación en web (revisar reportes, fusionar duplicados, gestionar los establecimientos verificados). Eso es un CRUD sobre Supabase, y para eso genera pantallas muy rápido. Pero para la app en sí, no.

---

## Orden sugerido

1. **Hoy:** Supabase + conectar la app desde el móvil. Añade 10 baños reales de tu barrio y compruébalo desde otro dispositivo.
2. **Esta semana:** Cloudflare Pages, para poder pasar el enlace y que alguien más lo pruebe.
3. **Cuando el flujo te convenza:** APK con Capacitor + GitHub Actions.

No compiles el APK antes de tener claro el flujo. Cada iteración en web son segundos; en APK, minutos.

---

## Cosas que faltan y conviene tener presentes

- **Moderación.** No hay ninguna todavía, más allá de los límites por hora y el veto a duplicados a menos de 15 m. En cuanto haya usuarios de verdad hace falta al menos un botón de reportar y una vista para revisarlos.
- **Fotos.** Supabase Storage lo resuelve, pero con fotos llega la obligación de moderarlas y de borrar el EXIF (que lleva coordenadas).
- **Aviso de privacidad.** Si lo publicas, necesitas una política de privacidad: la app usa geolocalización, y eso es dato personal bajo RGPD. Google Play la exige.
- **Licencia ODbL.** Ahora mismo los datos de OSM no se guardan en tu base: solo se consultan al vuelo. Eso te mantiene limpio. **Ojo el día que decidas importar OSM a tus tablas** — ahí entra la cláusula de compartir-igual del PRD (§10.2).

---

## Addendum tras la auditoría (migración 03)

El orden de ejecución del SQL, sin saltarse ninguno:

1. `sql/01_esquema.sql` — esquema base
2. `sql/02_seguridad.sql` — identidad, reportes, borrado suave
3. `sql/03_auditoria.sql` — correcciones de auditoría

Los tres son idempotentes: se pueden repetir sin romper nada.

**Un ajuste en el panel que el SQL no puede hacer por ti:**

- Authentication → Sign In / Providers → **Anonymous sign-ins: ON**

**Cloudflare Turnstile: todavía NO.** La app abre sesión llamando a
`/auth/v1/signup` sin token de captcha; si activas Turnstile en el panel,
Supabase rechaza ese signup y la app entera se queda sin poder publicar.
Sigue siendo la protección correcta —sin ella, acuñar identidades anónimas
es gratis y el auto-ocultado por reportes se convierte en una palanca de
censura— pero exige primero implementar el widget y el
`gotrue_meta_security.captcha_token` en `www/index.html`. Hasta entonces lo
mitiga el sistema de pesos de la migración 03.

**Y uno en Postgres, si activas registro de sentencias:** `log_statement`
debe quedar en `none`. La función `add_review` recibe las coordenadas del
usuario como argumento para medir la distancia y las descarta al terminar
la transacción; si Postgres registra parámetros de sentencia, esas
coordenadas acaban en los logs, que es exactamente lo que se quería evitar.

**El APK:** usa `apk.yml` de esta carpeta, no el workflow del cuerpo de este
manual. Aquel compilaba `assembleDebug`, que no es distribuible: firmado con
la clave de depuración compartida y con el localStorage —y el JWT de sesión
dentro— accesible por ADB.

**Pendiente, medio día de trabajo:** pasar a Supabase CLI (`supabase init`,
`supabase migration new`) en vez de numerar archivos SQL a mano. Hazlo ahora
que son tres y no doce, o llegará el día en que nadie sepa qué versión del
esquema está viva en Fráncfort.
