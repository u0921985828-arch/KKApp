# CERCA

Localizador colaborativo de baños públicos. España primero, escalable.

La app entera es **un archivo**: `www/index.html`. Sin build, sin bundler.
Se abre en un navegador y funciona. Capacitor sólo la envuelve para Android.

```
cerca/
├── www/index.html          ← la aplicación completa (~1560 líneas)
├── sql/
│   ├── 01_esquema.sql      ← tablas, PostGIS, RLS, RPC
│   ├── 02_seguridad.sql    ← sesión anónima, reportes, borrado suave
│   └── 03_auditoria.sql    ← correcciones de la auditoría
├── docs/
│   ├── PRD.md              ← producto, UVP, moderación, monetización
│   ├── PUESTA_EN_MARCHA.md ← Supabase + hosting + APK, paso a paso
│   └── AUDITORIA.md        ← 18 hallazgos, 16 aplicados
├── .github/workflows/apk.yml
├── capacitor.config.json
└── package.json
```

## Arrancar en 20 minutos

1. **Supabase.** Proyecto nuevo en Fráncfort (`eu-central-1`, por el RGPD).
   En SQL Editor, pegar y ejecutar `sql/01`, `sql/02` y `sql/03`, **en ese orden**.
2. **Panel de Supabase**, dos interruptores que el SQL no puede tocar:
   - Authentication → Sign In / Providers → **Anonymous sign-ins: ON**
   - Authentication → Bot & Abuse Protection → **Turnstile: ON**.
     No es opcional: sin él, acuñar identidades anónimas es gratis y el
     auto-ocultado por reportes se vuelve una palanca de censura.
     Necesitas un widget de Turnstile en Cloudflare (gratis): la **Secret
     Key** se pega en el panel de Supabase y la **Site Key** en los Ajustes
     de la app, junto a la URL y la clave `anon`. Sin Site Key configurada,
     la app intenta abrir sesión sin captcha y el servidor la rechaza.
3. **Conectar la app.** Abrir `www/index.html`, tocar el logo CERCA → Ajustes,
   pegar Project URL y clave `anon`, Conectar.

La geolocalización sólo funciona en HTTPS o en `localhost`. Abrir el archivo
con doble clic (`file://`) da mapa pero no ubicación.

## Publicar

- **Web:** subir `www/` a Cloudflare Pages o GitHub Pages. HTTPS gratis.
- **APK:** `npm install && npx cap add android`, luego el workflow de
  `.github/workflows/apk.yml`. Léelo entero antes: necesita un keystore
  propio y cuatro secretos. **Si pierdes el keystore no podrás volver a
  publicar bajo el mismo `appId`. Nunca. Haz copia fuera de GitHub.**

## Antes de tocar el código

```bash
npm run check     # sintaxis del bloque <script>
```

Es todo el CI que hay. Corre en dos segundos y evita la mayoría de las
regresiones en un archivo de este tamaño.

## Lo que hay que saber

**La clave `anon` es pública por diseño.** Se extrae de cualquier APK en cinco
minutos. Lo que protege la base de datos no es ocultarla, es el RLS: `UPDATE`
y `DELETE` no tienen política, así que nadie puede modificar ni borrar una
fila. Ni tú desde la app. Ocultar es cambiar un estado, siempre reversible.

**La clave `service_role` sí lo salta todo.** Nunca en la app, nunca en el
repositorio. Sólo en el panel de Supabase.

**La ubicación del usuario no se guarda en ninguna parte.** Al valorar, las
coordenadas viajan para que el servidor mida la distancia al baño y se
descartan al terminar la transacción: sólo persisten los metros. Si activas
registro de sentencias en Postgres, `log_statement` debe estar en `none` o
esas coordenadas acabarán en los logs, que es justo lo que se evita.

**Terceros que reciben datos** y deben aparecer en la política de privacidad:
Supabase (Fráncfort, guarda IP en el registro de sesión), Overpass (recibe la
zona consultada), OpenStreetMap (recibe el viewport de cada tesela).

**Los baños base vienen de OSM bajo licencia ODbL.** Hoy sólo se consultan al
vuelo, así que la cláusula share-alike no contamina nada. El día que se
importen a la propia base, sí. Está en `docs/PRD.md` §10.2 con las tres salidas.

## Pendiente

- Supabase CLI para versionar migraciones. Medio día. Hazlo mientras sean
  tres archivos SQL y no doce.
- Fotos: Storage + borrado de EXIF antes de subir.
- Política de privacidad publicada. Google Play la exige.
- Teselas propias (Protomaps/PMTiles + R2) e importación de OSM cuando el
  volumen deje de ser razonable para servidores de voluntarios. Mes 6.
