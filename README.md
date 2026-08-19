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
│   ├── 03_auditoria.sql    ← correcciones de la auditoría
│   └── 04_avisos.sql       ← permisos de PUBLIC, auth.uid() por fila
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
   En SQL Editor, pegar y ejecutar `sql/01`, `sql/02`, `sql/03` y `sql/04`,
   **en ese orden**.
2. **Panel de Supabase**, dos interruptores que el SQL no puede tocar:
   - Authentication → Sign In / Providers → **Anonymous sign-ins: ON**
   - Authentication → Bot & Abuse Protection → **Turnstile: ON**.
     No es opcional: sin él, acuñar identidades anónimas es gratis y el
     auto-ocultado por reportes se vuelve una palanca de censura.
     Necesitas un widget de Turnstile en Cloudflare (gratis): la **Secret
     Key** se pega en el panel de Supabase y la **Site Key** en los Ajustes
     de la app, junto a la URL y la clave `anon`. Sin Site Key configurada,
     la app intenta abrir sesión sin captcha y el servidor la rechaza.
3. **Conectar la app.** Ya viene conectada: la constante `FABRICA` al principio
   del `<script>` lleva la URL del proyecto, la clave `anon` y la Site Key de
   Turnstile. Cámbialas por las tuyas y listo. Quien use la app no configura
   nada; Ajustes → «Usar otro servidor» existe sólo para apuntar a otro
   Supabase.

La geolocalización sólo funciona en HTTPS o en `localhost`. Abrir el archivo
con doble clic (`file://`) da mapa pero no ubicación.

## Publicar

- **Web:** subir `www/` a Cloudflare Pages o GitHub Pages. HTTPS gratis.
- **APK:** `npm install && npx cap add android`, luego el workflow de
  `.github/workflows/apk.yml`. Léelo entero antes: necesita un keystore
  propio y cuatro secretos. **Si pierdes el keystore no podrás volver a
  publicar bajo el mismo `appId`. Nunca. Haz copia fuera de GitHub.**

## El mapa se tiñe en el móvil

Las teselas llegan de OSM en su estilo estándar y se reescriben píxel a píxel
al descargarse (`TeselaCERCA`), sin servidor de teselas propio.

No se hace con filtros CSS porque no puede hacerse: entre el suelo (`#F2EFE9`)
y el asfalto (`#FFFFFF`) hay trece niveles de luz, así que cualquier ajuste de
contraste o los funde en el mismo tono o los hunde juntos en negro. Lo que hay
es una rampa de 256 entradas: entra luminancia, sale paleta. Detalles que
importan y no son obvios:

- **La rampa no es monótona.** La única tinta oscura de OSM son las etiquetas,
  así que el tramo bajo sube a porcelana y los nombres de calle se siguen
  leyendo sobre el cobalto.
- **Las vías principales son amarillas**, más brillantes que el suelo pero
  menos luminosas. Sin un empujón explícito quedarían por debajo de él y el
  mapa perdería la jerarquía viaria.
- **El matiz original sobrevive** como una desviación suave sobre la rampa: el
  agua se sigue leyendo azul y el verde verde, dentro de la paleta.
- **Si el servidor de teselas no manda CORS**, el lienzo no se puede leer y la
  tesela se pinta tal cual: el mapa nunca se queda en blanco.

Ajustes → Mapa permite volver al estilo original de OSM.

## El modo moho 🍄

El botón 🍄 ejecuta sobre las calles reales el modelo de *Physarum
polycephalum* de Tero et al. (Science, 2010) — el del moho que reprodujo el
metro de Tokio. La red peatonal de OSM alrededor tuyo hace de malla inicial
del plasmodio, tú eres la boca y los baños cercanos la comida: cada tubo
engorda en proporción al flujo que lo atraviesa (`dD/dt = f(|Q|) − D`, con
las presiones resueltas por Kirchhoff en cada paso) y el resto se atrofia.
Los corredores que sobreviven son las mejores rutas contando la red entera,
y el baño que más flujo recibe es la elección del moho.

Para UNA ruta a un baño concreto, la ruta clásica (botón del detalle) ya es
óptima y más rápida de calcular. El moho aporta otra cosa: mira varios
baños a la vez y muestra qué corredores del barrio valen más, con rutas
alternativas si el primero falla.

## Antes de tocar el código

```bash
npm run check     # sintaxis del bloque <script>
```

Es todo el CI que hay. Corre en dos segundos y evita la mayoría de las
regresiones en un archivo de este tamaño.

## Lo que hay que saber

**La clave `anon` es pública por diseño.** Por eso está incrustada en
`FABRICA` sin más ceremonia: se extrae de cualquier APK en cinco minutos, y
ocultarla no protegería nada. Lo que protege la base de datos es el RLS:
`UPDATE` y `DELETE` no tienen política, así que nadie puede modificar ni
borrar una fila. Ni tú desde la app. Ocultar es cambiar un estado, siempre
reversible.

**Leer no abre sesión.** La identidad anónima se acuña la primera vez que
alguien publica, no al abrir la app. Si no, cada visita dejaría un usuario
huérfano en `auth.users` y el captcha saltaría nada más entrar.

**La clave `service_role` sí lo salta todo.** Nunca en la app, nunca en el
repositorio. Sólo en el panel de Supabase.

**La ubicación del usuario no se guarda en ninguna parte.** Al valorar, las
coordenadas viajan para que el servidor mida la distancia al baño y se
descartan al terminar la transacción: sólo persisten los metros. Si activas
registro de sentencias en Postgres, `log_statement` debe estar en `none` o
esas coordenadas acabarán en los logs, que es justo lo que se evita.

**Terceros que reciben datos** y deben aparecer en la política de privacidad:
Supabase (guarda IP en el registro de sesión), Overpass (recibe la zona
consultada), OpenStreetMap (recibe el viewport de cada tesela), Nominatim
(recibe el texto del buscador de zonas), FOSSGIS routing (recibe origen y
destino al dibujar la ruta a pie), Cloudflare Turnstile (verifica el captcha
al abrir sesión).

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
