# PRD + Arquitectura Técnica
## Aplicación de catalogación, geolocalización y reseña de baños públicos y privados

**Versión:** 1.0 · **Fecha:** agosto 2026 · **Autor:** Product & Architecture
**Nombre de trabajo:** *TazaFinder* (alternativas: *Pipí Maps*, *Al Baño*, *Loo*, *Urgencias*)

---

## 0. Ficha rápida del producto

| Campo | Valor |
|---|---|
| Categoría | Utilidad / Mapas / Comunidad (UGC geolocalizado) |
| Mercado inicial | España (foco: Madrid, Barcelona, Bilbao, Valencia, Sevilla, Málaga) |
| Plataformas | iOS, Android, Web responsive (PWA) |
| Modelo de datos | Colaborativo (crowdsourcing) + importación OpenStreetMap + B2B verificado |
| Monetización | Freemium + verificación de establecimientos (B2B) |
| Métrica norte | **Sesiones que terminan en "he llegado y estaba bien"** (llamada *Successful Relief Rate*) |

---

## 1. Resumen ejecutivo

### 1.1 El problema

Encontrar un baño accesible en la calle es un problema **de alta frecuencia, alta ansiedad y baja tolerancia al fallo**. En España el problema tiene una particularidad estructural: **la red de baños públicos municipales es escasa y poco fiable**, y su lugar lo ocupa de facto la hostelería (bares, cafeterías, centros comerciales, gasolineras). Eso genera una pregunta que ningún mapa responde hoy:

> *"¿Me van a dejar pasar sin consumir?"*

Google Maps sabe **dónde** hay un bar. No sabe si el baño está limpio, si hay que pedir la llave, si cobran 0,50 €, si hay cambiador, si el acceso es por unas escaleras imposibles con silla de ruedas, o si el cartel dice "aseo exclusivo para clientes".

### 1.2 La visión

**Un mapa vivo de todos los baños del mundo, mantenido por quienes los usan, que responde en menos de diez segundos a la pregunta más urgente que existe.**

### 1.3 Propuesta de valor única (UVP)

La diferenciación **no** es "un mapa con baños" — eso ya existe (Flush, Toilet Finder, la capa de OSM). La diferenciación son tres cosas que nadie ha resuelto bien:

1. **El dato de "acceso real"**, no el dato de existencia.
   Campo estrella: *¿Se puede entrar sin consumir?* con tres estados verificados por la comunidad (Sí / Consumo mínimo / Solo clientes) y confianza temporal (dato de hace 3 días vs. de hace 2 años).

2. **Diseñada para la urgencia, no para la exploración.**
   Al abrir la app no ves un mapa que explorar: ves **las tres mejores opciones ordenadas por tiempo real de llegada a pie**, con un botón gigante de "Llévame". Todo lo demás está a un nivel de profundidad más abajo.

3. **Funciona sin cobertura.**
   El momento de máxima necesidad suele coincidir con el peor sitio: sótano, metro, área de servicio, pueblo. La app cachea el entorno del usuario y **es plenamente funcional en modo offline** para consulta (la contribución se sincroniza después).

### 1.4 Segmentos con dolor extremo (los que hacen que la app se recomiende)

- **Personas con EII** (Crohn, colitis ulcerosa), colostomías, vejiga hiperactiva, embarazo avanzado. Para ellas esto no es una comodidad: condiciona salir de casa. Aliarse con ACCU España y asociaciones equivalentes es la palanca de credibilidad más barata y potente que existe.
- **Familias con bebés** (cambiador, no cambiador — información casi imposible de encontrar).
- **Personas con movilidad reducida** (accesibilidad real, no la declarada).
- **Profesionales de calle**: repartidores, taxistas/VTC, comerciales, transportistas.
- **Turistas** (España, ~90M visitantes/año, es un mercado enorme de usuarios desorientados con vejiga).

### 1.5 Panorama competitivo (resumen)

| Competidor | Fortaleza | Hueco que deja |
|---|---|---|
| Google Maps | Cobertura y confianza masivas | No modela atributos del baño; el dato de aseo es un checkbox pobre |
| Flush / Toilet Finder | Especializadas, base decente | UX genérica de mapa, datos envejecidos, sin verificación, sin foco local |
| OpenStreetMap (`amenity=toilets`) | Datos abiertos y de calidad | No es un producto de consumo; sin reseñas ni frescura |
| Refuge Restrooms | Nicho baños neutros/seguros | Alcance limitado a EE. UU. |

**Conclusión:** el mercado no está ocupado por un producto fuerte, está ocupado por productos flojos. La ventaja defendible se construye con **densidad de datos frescos y verificados en un territorio concreto**, no con tecnología.

---

## 2. Usuarios y casos de uso

### 2.1 Personas

**Ana, 34 — "La urgencia clásica"**
Está de compras en el centro. Tiene 4 minutos de margen. Abre la app, mira, camina, entra. No va a leer reseñas ni a registrarse. **Debe funcionar sin cuenta.**

**Marcos, 41 — Colitis ulcerosa**
Planifica sus rutas en función de dónde hay baño. Consulta la app **antes** de salir, no durante. Necesita fiabilidad, no cantidad. Es el usuario que más contribuye porque entiende el valor.

**Laura y Jon, 33 — Padres de bebé de 7 meses**
Filtro: cambiador. Un dato binario que hoy no existe agregado en ningún sitio.

**Silvia, 58 — Usuaria de silla de ruedas**
"Accesible" declarado ≠ accesible real. Necesita fotos de la puerta y del acceso, y ancho de puerta si es posible.

### 2.2 Historias de usuario principales (MVP)

```
US-01  Como usuario con prisa, quiero ver el baño más cercano al abrir la app,
       sin registrarme, para llegar en el menor tiempo posible.
US-02  Como usuario, quiero filtrar por gratuito / accesible / cambiador / abierto ahora.
US-03  Como usuario, quiero saber si me dejarán entrar sin consumir.
US-04  Como usuario, quiero saber cómo de fresco es el dato que estoy viendo.
US-05  Como contribuidor, quiero añadir un baño nuevo en menos de 45 segundos.
US-06  Como contribuidor, quiero valorar un baño en menos de 15 segundos (una sola pantalla).
US-07  Como usuario, quiero abrir la navegación en Google/Apple Maps con un toque.
US-08  Como usuario sin cobertura, quiero consultar los baños de mi zona igualmente.
US-09  Como usuario, quiero reportar un baño que ya no existe o cuya info es falsa.
```

---

## 3. Funcionalidades clave — Alcance del MVP

Priorización **MoSCoW**. El criterio de corte: *¿esta función es necesaria para que alguien con urgencia encuentre un baño y confíe en el dato?*

### 3.1 MUST HAVE (lanzamiento v1.0)

| # | Funcionalidad | Detalle | Esfuerzo |
|---|---|---|---|
| M1 | **Mapa + lista de cercanos** | Mapa interactivo con clustering; lista ordenada por tiempo a pie estimado | Alto |
| M2 | **Uso sin cuenta** | Consulta 100 % anónima. La cuenta solo se pide para contribuir | Bajo |
| M3 | **Ficha de baño** | Atributos, fotos, valoración media, frescura del dato, horario, botón "Cómo llegar" | Medio |
| M4 | **Filtros rápidos** | Gratuito · Accesible · Cambiador · Abierto ahora · Sin consumir · 24 h | Medio |
| M5 | **Añadir baño** | Formulario progresivo, ubicación por GPS con ajuste manual del pin, foto opcional | Medio |
| M6 | **Valorar baño** | 1 pantalla: limpieza (1–5) + chips de atributos + comentario opcional | Medio |
| M7 | **Reportar** | "Ya no existe" / "Info incorrecta" / "Contenido inapropiado" | Bajo |
| M8 | **Semilla OSM** | ~15–25k puntos importados en España el día 1 (ver §10) | Medio |
| M9 | **Modo offline (lectura)** | Caché del entorno reciente + tiles cacheados | Medio |
| M10 | **Multiidioma** | ES, EU, CA, GL, EN desde el día 1 (España es plurilingüe; ignorarlo cuesta usuarios) | Bajo |

### 3.2 SHOULD HAVE (v1.1 – v1.3, primeros 3 meses)

- Perfiles de usuario y nivel de contribuidor.
- Guardar favoritos / "mis baños de confianza".
- Fotos moderadas con difuminado automático de rostros.
- Búsqueda por dirección/lugar ("baños cerca de Estación de Atocha").
- Compartir ubicación de baño por WhatsApp (viralidad orgánica barata).
- Descarga explícita de zona offline (ciudad o radio).

### 3.3 COULD HAVE (v2)

- Panel B2B para establecimientos ("Baño Amigo Verificado", ver §12).
- Rutas con baños intermedios (senderismo, ciclismo, carretera).
- Notificación contextual ("estás en una zona sin baños en 800 m").
- Integración con Apple Watch / Wear OS (un toque, la flecha).
- API pública para terceros.

### 3.4 WON'T HAVE (explícitamente fuera)

- Chat social / feed / seguir usuarios. No es una red social; es una utilidad.
- Publicidad intrusiva en el flujo de urgencia. Destruiría la confianza.
- Vídeo, historias, gamificación agresiva con moneda virtual (ver §9).
- Reserva o pago del baño dentro de la app (v3 como muy pronto).

---

## 4. Diseño de la experiencia de usuario (UX)

### 4.1 Principio rector

> **Regla de los 10 segundos y los 3 toques.**
> Desde tocar el icono hasta empezar a caminar hacia un baño: **≤ 10 segundos y ≤ 3 toques**. Cualquier decisión de diseño que rompa esto se rechaza, por bonita que sea.

### 4.2 Flujo principal — "Modo Urgencia" (el flujo canónico)

```
[T=0s]  Toque en el icono
          │
          ▼
[T=1s]  APERTURA EN CALIENTE
        · Último snapshot de mapa cacheado se pinta INMEDIATAMENTE
        · GPS se resuelve en paralelo (no bloquea la UI)
        · Sin splash screen. Sin onboarding. Sin login. Sin permisos aún.
          │
          ▼
[T=2-3s] PANTALLA PRINCIPAL
        ┌────────────────────────────────┐
        │  [Mapa con pines + tu posición]│
        │                                │
        │  ╔══════════════════════════╗  │  ← bottom sheet, medio desplegada
        │  ║ 1. Bar Iturri      2 min ║  │
        │  ║    Gratis · Sin consumir ║  │
        │  ║    ★4,2 · dato de ayer   ║  │
        │  ║              [ IR ▸ ]    ║  │
        │  ╠══════════════════════════╣  │
        │  ║ 2. C.C. Zubiarte   4 min ║  │
        │  ║    Gratis · Accesible    ║  │
        │  ║    ★4,6 · dato: 3 días   ║  │
        │  ╠══════════════════════════╣  │
        │  ║ 3. Aseo público    5 min ║  │
        │  ╚══════════════════════════╝  │
        │  [Gratis][Accesible][Cambiador]│  ← chips de filtro
        └────────────────────────────────┘
          │
          ▼
[T=5s]  Toque en [ IR ▸ ]
          │
          ▼
[T=6s]  Se abre navegación a pie (Google Maps / Apple Maps / organic maps)
        + la app arma una notificación diferida: "¿Qué tal el baño de Bar Iturri?"
```

**Detalles que hacen o rompen este flujo:**

- **El permiso de ubicación se pide en la pantalla 1, con contexto**, no en un onboarding previo. Si se deniega, se cae a búsqueda por texto sin romper nada.
- **Nada de carrusel de bienvenida.** El onboarding se enseña *después* del primer uso exitoso, cuando el usuario ya entendió el valor.
- **Tiempo a pie, no distancia en metros.** "2 min" es accionable; "180 m" requiere traducción mental.
- **Indicador de frescura siempre visible.** "Verificado ayer" vs. "sin verificar desde 2024" cambia por completo la decisión. Es el antídoto contra el envejecimiento de los datos colaborativos.

### 4.3 Flujo secundario — Contribuir (el que sostiene el producto)

El punto crítico: **captar la reseña en el momento de máxima información y mínima fricción**, es decir, justo al salir del baño.

```
Salida de navegación detectada (geofence, opcional)
         │
         ▼
Notificación diferida (~8 min después de llegar):
"¿Qué tal el baño de Bar Iturri?"   [😖] [😐] [🙂] [😄]
         │  ← un toque desde la notificación ya registra la valoración base
         ▼
Al abrir: pantalla ÚNICA de valoración
  · Limpieza:  ○ ○ ● ○ ○
  · Chips (multi-selección, tocar=sí, doble=no):
      [Gratis] [De pago] [Accesible] [Cambiador] [Papel] [Jabón]
      [Me dejaron pasar sin consumir] [Pedí llave] [Cola]
  · Comentario (opcional, 200 car.)
  · Foto (opcional)
  · [ Publicar ]
```

**Añadir un baño nuevo** se hace en 3 pasos cortos con barra de progreso: (1) mapa con pin arrastrable y dirección autocompletada, (2) tipo + chips de atributos, (3) confirmar. Nada obligatorio salvo ubicación y tipo.

### 4.4 Accesibilidad (requisito, no adorno)

Un producto que sirve a personas con discapacidad no puede ser inaccesible.

- WCAG 2.2 AA como criterio de aceptación de cada pantalla.
- Objetivos táctiles ≥ 48 dp; el botón "IR" ≥ 64 dp.
- Compatibilidad total con VoiceOver / TalkBack, incluida la lista de resultados.
- Contraste mínimo 4.5:1; modo alto contraste y respeto del tamaño de fuente del sistema (hasta 200 %).
- Modo oscuro real (se usa de noche, en la calle).
- Nada de información transmitida solo por color.

---

## 5. Stack tecnológico recomendado

### 5.1 Cuadro resumen

| Capa | Elección | Alternativa | Motivo principal |
|---|---|---|---|
| Móvil | **React Native + Expo (SDK reciente)** | Flutter | Un solo código iOS+Android+Web; OTA updates con EAS; ecosistema de mapas maduro |
| Web | **Next.js (App Router) + React** | Remix | SEO crítico para captación orgánica ("baños públicos en Bilbao"); SSR/ISR |
| Renderizado de mapas | **MapLibre GL (native + JS)** | Mapbox GL | Open source, sin lock-in ni coste por carga de mapa |
| Tiles de mapa | **Protomaps (PMTiles) autoalojado** o **MapTiler** | Mapbox | Protomaps: coste casi cero y tiles offline en un solo fichero; MapTiler tiene servidores en la UE |
| Datos base de POIs | **OpenStreetMap** (`amenity=toilets`, `toilets:*`) | — | Semilla gratuita de decenas de miles de puntos en España (ojo licencia, §10.2) |
| Rutas / tiempo a pie | **Valhalla** u **OSRM** autoalojado | Google Routes API | Millones de cálculos de ETA a pie salen carísimos en Google |
| Geocoding | **Photon** (autoalojado) o **MapTiler Geocoding** | Google Places | Coste y RGPD |
| Backend | **Supabase** (Postgres 16 + PostGIS + Auth + Storage + Realtime + Edge Functions) | Node/NestJS en Cloud Run + Neon | Un equipo pequeño entrega el MVP en semanas; PostGIS nativo; RLS resuelve gran parte de la autorización |
| Base de datos | **PostgreSQL + PostGIS** | MongoDB con índices 2dsphere | Consultas geoespaciales serias, integridad relacional para reseñas y moderación, `pg_trgm` para búsqueda |
| Caché / cercanía | **Redis (Upstash)** + índice **H3** o **geohash** | — | Cachear "top N baños por celda H3" convierte la consulta más frecuente en un `GET` de coste ~0 |
| Búsqueda de texto | Postgres FTS + `pg_trgm` | Typesense / Meilisearch | Suficiente hasta escala grande; migrable después |
| CDN / edge | **Cloudflare** (CDN, R2, WAF, Turnstile) | Fastly | R2 sin coste de egreso para fotos; Turnstile como anti-bot |
| Imágenes | R2/S3 + **Cloudflare Images** o `imgproxy` | Cloudinary | Redimensionado on-the-fly, coste bajo |
| Push | **Expo Notifications** (sobre FCM/APNs) | OneSignal | Integrado con el stack |
| Observabilidad | **Sentry** + **PostHog** (UE) | Datadog + Amplitude | PostHog self-host/EU cumple RGPD y permite feature flags |
| CI/CD | **GitHub Actions** + **EAS Build/Submit** | Bitrise | Builds reproducibles y despliegue a tiendas automatizado |
| IaC | **Terraform** (o Pulumi) | — | Reproducibilidad multi-región desde el principio |

### 5.2 Justificación de las decisiones no obvias

**Por qué MapLibre + Protomaps en lugar de Google Maps.**
El coste de Google Maps escala con las **cargas de mapa**, no con los ingresos. Una app de urgencia se abre muchísimas veces y se monetiza poquísimo por sesión: es exactamente el peor perfil de uso para ese modelo de precios. MapLibre + tiles propios convierte un coste variable peligroso en un coste fijo predecible. Además, **PMTiles permite empaquetar una ciudad entera en un fichero descargable**, que es la base del modo offline. Google/Apple Maps se siguen usando — pero solo como *destino* del botón "Cómo llegar", donde el usuario ya está fuera de nuestra app y el coste es cero.

**Por qué Postgres + PostGIS y no una NoSQL.**
El modelo es intrínsecamente relacional (usuarios ↔ reseñas ↔ baños ↔ ediciones ↔ votos ↔ reportes) y el sistema de reputación y moderación exige consultas de agregación y transacciones. PostGIS resuelve `ST_DWithin` sobre índices GiST con un rendimiento excelente hasta decenas de millones de filas. La escalabilidad global se resuelve con **réplicas de lectura por región + caché de celdas H3**, no cambiando de motor.

**Por qué Supabase para el MVP.**
Reduce el tiempo de lanzamiento de meses a semanas: Auth (incluido Apple/Google sign-in, obligatorio en iOS si hay login social), Storage, RLS y Edge Functions vienen resueltos. Es Postgres estándar, así que **la salida está garantizada**: si el producto crece, se migra a Postgres gestionado propio sin reescribir el modelo de datos. Región recomendada: **Frankfurt (eu-central-1)** por RGPD y latencia desde España.

**Por qué React Native y no nativo.**
El diferencial de este producto está en los **datos**, no en el rendimiento de la UI. Un equipo pequeño mantiene una base de código, itera más rápido y puede publicar correcciones OTA sin pasar por revisión de tienda — algo valioso cuando el bug es "el mapa no carga en modo offline".

### 5.3 Arquitectura de despliegue

```
                     ┌──────────────────────────┐
                     │  Cloudflare (CDN + WAF)  │
                     │  Turnstile · R2 · Images │
                     └────────────┬─────────────┘
                                  │
     ┌────────────────────────────┼────────────────────────────┐
     │                            │                            │
┌────▼─────┐              ┌───────▼────────┐          ┌────────▼────────┐
│  Apps    │              │  Next.js (Web) │          │  Tiles PMTiles  │
│ iOS/And. │              │   Vercel/CF    │          │   en R2 (edge)  │
│  (Expo)  │              └───────┬────────┘          └─────────────────┘
└────┬─────┘                      │
     │        ┌───────────────────┴─────────────────┐
     └───────▶│      API Gateway / Edge Functions   │
              │  (PostgREST + funciones Deno/Node)  │
              └───────────────┬─────────────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
┌───────▼────────┐   ┌────────▼────────┐   ┌─────────▼─────────┐
│ Postgres 16    │   │ Redis (Upstash) │   │ Valhalla (rutas)  │
│ + PostGIS      │   │ caché celdas H3 │   │ + Photon (geocod.)│
│ eu-central-1   │   │  multi-región   │   │  contenedores     │
│ + réplicas     │   └─────────────────┘   └───────────────────┘
│   us-east /    │
│   ap-southeast │   ┌─────────────────────────────────────────┐
└────────────────┘   │ Workers asíncronos (colas):             │
                     │ · moderación de texto/imagen            │
                     │ · recálculo de reputación y ranking     │
                     │ · decaimiento de frescura de datos      │
                     │ · sincronización incremental con OSM    │
                     └─────────────────────────────────────────┘
```

**Estrategia de escalado global:** la primaria de escritura permanece en la UE; las lecturas (que son el 95 % del tráfico) se sirven desde réplicas regionales y, sobre todo, desde caché de celdas H3 en el edge. Un baño cambia de estado pocas veces al día: **es un caso de uso ideal para caché agresiva** (TTL 5–15 min con invalidación por evento).

---

## 6. Estructura de la base de datos

### 6.1 Diagrama de entidades

```
users ──< reviews >── toilets ──< toilet_photos
  │                      │
  │                      ├──< toilet_edits (propuestas de cambio)
  │                      └──< reports
  ├──< review_votes
  ├──< user_badges >── badges
  └──  user_reputation (materializada)
```

### 6.2 Esquema SQL (PostgreSQL + PostGIS)

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────── USUARIOS ───────────────────────────────
CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email            CITEXT UNIQUE,              -- null si es cuenta anónima/dispositivo
    display_name     TEXT NOT NULL,
    avatar_url       TEXT,
    locale           TEXT DEFAULT 'es',
    home_city        TEXT,
    -- Reputación y confianza
    reputation       INT  NOT NULL DEFAULT 0,
    trust_level      SMALLINT NOT NULL DEFAULT 0,   -- 0 nuevo … 4 moderador comunitario
    is_banned        BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason       TEXT,
    -- Antifraude
    device_hash      TEXT,                          -- hash de atestación de dispositivo
    signup_ip_hash   TEXT,                          -- hasheado, nunca IP en claro (RGPD)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at   TIMESTAMPTZ
);
CREATE INDEX idx_users_reputation ON users (reputation DESC);

-- ──────────────────────────────── BAÑOS ────────────────────────────────
CREATE TYPE toilet_kind    AS ENUM ('public','hospitality','retail','transport',
                                    'petrol_station','park','beach','other');
CREATE TYPE access_policy  AS ENUM ('open','customers_only','min_purchase',
                                    'ask_key','staff_permission','unknown');
CREATE TYPE toilet_status  AS ENUM ('active','temporarily_closed','permanently_closed',
                                    'pending_review','rejected');

CREATE TABLE toilets (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Identidad
    name             TEXT NOT NULL,
    kind             toilet_kind NOT NULL DEFAULT 'other',
    status           toilet_status NOT NULL DEFAULT 'pending_review',
    -- Geografía
    location         GEOGRAPHY(POINT, 4326) NOT NULL,
    address          TEXT,
    city             TEXT,
    postal_code      TEXT,
    country_code     CHAR(2) NOT NULL DEFAULT 'ES',
    h3_r8            TEXT,           -- celda H3 res.8 para caché y agregados
    floor_note       TEXT,           -- "planta -1, al fondo a la derecha"
    -- Atributos (el corazón del producto)
    is_free          BOOLEAN,
    price_cents      INT,
    currency         CHAR(3) DEFAULT 'EUR',
    access           access_policy NOT NULL DEFAULT 'unknown',
    is_accessible    BOOLEAN,        -- accesibilidad silla de ruedas
    has_baby_change  BOOLEAN,
    is_gender_neutral BOOLEAN,
    has_toilet_paper BOOLEAN,
    has_soap         BOOLEAN,
    has_hand_dryer   BOOLEAN,
    has_bidet        BOOLEAN,
    has_urinal       BOOLEAN,
    is_24h           BOOLEAN,
    opening_hours    JSONB,          -- formato OSM opening_hours o estructura propia
    -- Agregados (denormalizados, recalculados por worker)
    rating_avg       NUMERIC(2,1),
    rating_count     INT NOT NULL DEFAULT 0,
    cleanliness_avg  NUMERIC(2,1),
    confidence_score NUMERIC(3,2) DEFAULT 0.30,  -- 0-1, ver §8.3
    last_verified_at TIMESTAMPTZ,                -- clave para el indicador de frescura
    -- Procedencia
    source           TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'osm' | 'partner'
    osm_id           BIGINT UNIQUE,
    created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    is_partner       BOOLEAN NOT NULL DEFAULT FALSE, -- "Baño Amigo Verificado" (B2B)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices críticos
CREATE INDEX idx_toilets_location  ON toilets USING GIST (location);
CREATE INDEX idx_toilets_h3        ON toilets (h3_r8);
CREATE INDEX idx_toilets_name_trgm ON toilets USING GIN (name gin_trgm_ops);
CREATE INDEX idx_toilets_filters   ON toilets (country_code, status)
       WHERE status = 'active';
-- Índice parcial para el filtro más usado
CREATE INDEX idx_toilets_free_access ON toilets (is_free, is_accessible, has_baby_change)
       WHERE status = 'active';

-- ─────────────────────────────── RESEÑAS ───────────────────────────────
CREATE TABLE reviews (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    toilet_id        UUID NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    -- Puntuaciones
    rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    cleanliness      SMALLINT CHECK (cleanliness BETWEEN 1 AND 5),
    -- Confirmación de atributos en el momento de la visita
    attrs_snapshot   JSONB,   -- {"is_free":true,"has_baby_change":false,...}
    comment          TEXT CHECK (char_length(comment) <= 500),
    -- Verificación de presencia (antifraude)
    submitted_from   GEOGRAPHY(POINT, 4326),
    distance_m       NUMERIC(8,1),        -- distancia al baño al reseñar
    is_verified_visit BOOLEAN DEFAULT FALSE,   -- TRUE si distance_m <= 150
    -- Moderación
    moderation_state TEXT NOT NULL DEFAULT 'approved',  -- approved|flagged|hidden
    helpful_count    INT NOT NULL DEFAULT 0,
    report_count     INT NOT NULL DEFAULT 0,
    weight           NUMERIC(3,2) NOT NULL DEFAULT 1.0, -- peso en la media (§8.3)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Una reseña activa por usuario y baño cada 30 días
    UNIQUE (toilet_id, user_id, (date_trunc('month', created_at)))
);
CREATE INDEX idx_reviews_toilet ON reviews (toilet_id, created_at DESC);
CREATE INDEX idx_reviews_user   ON reviews (user_id, created_at DESC);

-- ──────────────────── TABLAS DE SOPORTE (resumen) ─────────────────────
CREATE TABLE toilet_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    toilet_id UUID REFERENCES toilets(id) ON DELETE CASCADE,
    user_id   UUID REFERENCES users(id)   ON DELETE SET NULL,
    storage_key TEXT NOT NULL,
    blur_hash   TEXT,
    nsfw_score  NUMERIC(3,2),
    faces_blurred BOOLEAN DEFAULT FALSE,
    moderation_state TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Propuestas de edición: NUNCA se sobrescribe un baño directamente
CREATE TABLE toilet_edits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    toilet_id UUID REFERENCES toilets(id) ON DELETE CASCADE,
    user_id   UUID REFERENCES users(id),
    changes   JSONB NOT NULL,             -- {"is_free":{"old":true,"new":false}}
    state     TEXT DEFAULT 'pending',     -- pending|applied|rejected
    votes_up INT DEFAULT 0, votes_down INT DEFAULT 0,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_type TEXT NOT NULL,            -- toilet|review|photo|user
    target_id UUID NOT NULL,
    reporter_id UUID REFERENCES users(id),
    reason TEXT NOT NULL,                 -- not_exists|wrong_info|spam|offensive|unsafe
    note TEXT,
    state TEXT DEFAULT 'open',
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE review_votes (
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    user_id   UUID REFERENCES users(id)   ON DELETE CASCADE,
    is_helpful BOOLEAN NOT NULL,
    PRIMARY KEY (review_id, user_id)
);

CREATE TABLE badges (
    code TEXT PRIMARY KEY, name TEXT, description TEXT,
    icon TEXT, tier SMALLINT
);
CREATE TABLE user_badges (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    badge_code TEXT REFERENCES badges(code),
    awarded_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, badge_code)
);
```

### 6.3 Consulta principal (baños cercanos con filtros)

```sql
SELECT id, name, address, is_free, is_accessible, has_baby_change,
       rating_avg, rating_count, confidence_score, last_verified_at,
       ST_Distance(location, $1::geography) AS distance_m
FROM   toilets
WHERE  status = 'active'
  AND  ST_DWithin(location, $1::geography, $2)   -- radio en metros
  AND  ($3::boolean IS NULL OR is_free       = $3)
  AND  ($4::boolean IS NULL OR is_accessible = $4)
  AND  ($5::boolean IS NULL OR has_baby_change = $5)
ORDER BY distance_m
LIMIT 50;
```

> **Nota de rendimiento:** esta consulta se cachea por celda H3 (res. 8 ≈ 0,7 km²) + combinación de filtros. En una ciudad, el 90 % de las peticiones se resuelve desde Redis sin tocar Postgres. El orden final por **tiempo a pie** lo aplica Valhalla en lote sobre los ~20 primeros candidatos.

---

## 7. API principal (v1)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/v1/toilets/nearby?lat&lng&radius&filters` | Consulta principal, cacheada |
| `GET` | `/v1/toilets/{id}` | Ficha completa con reseñas paginadas |
| `POST` | `/v1/toilets` | Alta de baño (auth requerida) |
| `POST` | `/v1/toilets/{id}/edits` | Propuesta de edición |
| `POST` | `/v1/toilets/{id}/reviews` | Nueva reseña |
| `POST` | `/v1/reviews/{id}/vote` | Voto útil / no útil |
| `POST` | `/v1/reports` | Reporte de contenido |
| `GET` | `/v1/regions/{code}/pack` | Descarga de paquete offline (PMTiles + JSON) |
| `GET` | `/v1/me` | Perfil, reputación, insignias |

Autenticación con JWT (Supabase Auth). *Rate limiting* por IP y por usuario en el edge (Cloudflare), más límites por nivel de confianza en la propia API.

---

## 8. Estrategia de moderación y anti-fraude

El riesgo real de una app de reseñas de establecimientos es doble: **spam comercial** (bares que se autopromocionan o hunden al de enfrente) y **datos que envejecen en silencio**, que es lo que ha matado a todas las apps de este nicho.

### 8.1 Defensa en profundidad (5 capas)

**Capa 1 — Fricción de entrada, no de uso**
- Consulta anónima libre. **Contribuir exige cuenta verificada** (email + Apple/Google sign-in).
- Atestación de dispositivo (Play Integrity / DeviceCheck) para bloquear granjas de emuladores.
- Cloudflare Turnstile en el alta desde web.
- Cuentas nuevas: máx. 3 contribuciones en las primeras 24 h.

**Capa 2 — Verificación de presencia física (la más eficaz)**
- La reseña registra la distancia al baño en el momento del envío.
- **≤ 150 m → `is_verified_visit = true`**, peso 1,0 y sello visible "Visita verificada".
- **> 150 m → peso 0,3** y sin sello. No se prohíbe (hay quien reseña al llegar a casa), pero pesa menos.
- Detección de *GPS spoofing* (`isMockLocation` en Android, comprobación de coherencia de velocidad entre eventos).

**Capa 3 — Filtros automáticos de contenido**
- Clasificación de texto (toxicidad, spam, datos personales, teléfonos/URLs) antes de publicar.
- Imágenes: detección NSFW + **difuminado automático de rostros** obligatorio + borrado de EXIF (incluido GPS de la foto).
- Detección de duplicados por similitud de texto (`pg_trgm`) y de ubicación (baños a < 25 m con nombre parecido se sugieren como fusión).
- Señales de comportamiento: ráfagas de reseñas, todas 5★ o todas 1★, cuenta creada hoy, mismo dispositivo con varias cuentas.

**Capa 4 — Consenso comunitario (edición tipo wiki)**
- **Nunca se sobrescribe un dato directamente.** Un cambio entra como `toilet_edit` y se aplica cuando:
  - lo propone un usuario de nivel de confianza ≥ 3, **o**
  - recibe 2 confirmaciones independientes de usuarios distintos, **o**
  - pasan 72 h sin objeciones y el proponente tiene reputación positiva.
- 3 reportes de "ya no existe" de usuarios independientes → estado `temporarily_closed` automático + revisión.

**Capa 5 — Moderación humana**
- Cola priorizada por riesgo (denuncias de establecimientos, contenido sensible, edits masivos).
- **Moderadores comunitarios** (nivel 4) por territorio, con acciones auditadas y reversibles.
- Canal de reclamación para negocios (obligado por el DSA europeo): un local puede impugnar una reseña con un formulario, y toda decisión de retirada debe motivarse.

### 8.2 Ponderación de reseñas

La media visible no es aritmética. El peso de cada reseña:

```
peso = w_base
     × (1.0 si visita verificada, si no 0.3)
     × factor_reputación(autor)        [0.5 … 1.5]
     × decaimiento_temporal            [exp(-días/365), suelo 0.2]
```

Consecuencia: **una reseña de hace tres años casi no cuenta**, y el sistema empuja de forma natural hacia el dato reciente sin necesidad de borrar el histórico.

### 8.3 `confidence_score` — el antídoto contra los datos zombis

Cada baño lleva un score 0–1 que se muestra al usuario de forma legible ("Verificado ayer" / "Sin confirmar desde hace 8 meses"):

```
confianza = f(nº de confirmaciones independientes,
              antigüedad de la última verificación,
              reputación media de los confirmadores,
              coherencia entre reseñas,
              es socio verificado B2B → +0.2)
```

Un job diario decae la confianza de todo baño no verificado. Por debajo de 0,25 el baño se marca visualmente como "info sin confirmar" y entra en la cola de "misiones de verificación" (§9).

---

## 9. Estrategia de gamificación

### 9.1 Advertencia de diseño (importante)

La gamificación mal hecha **es una máquina de generar spam**: si premias el volumen, obtienes volumen basura. La regla es sencilla:

> **Se premia la contribución *verificada y confirmada por otros*, nunca la contribución enviada.**

Los puntos se acreditan **con retardo**, cuando otro usuario confirma el dato. Eso hace que inventarse baños no tenga retorno.

### 9.2 Sistema de niveles

| Nivel | Nombre | Puntos | Privilegios |
|---|---|---|---|
| 0 | Visitante | 0 | Consulta. Contribuciones en cola de revisión |
| 1 | Explorador | 25 | Contribuciones publicadas directamente |
| 2 | Cartógrafo | 150 | Sus ediciones necesitan solo 1 confirmación |
| 3 | Guardián | 600 | Ediciones aplicadas al instante; voto de peso doble |
| 4 | Moderador | Por invitación | Herramientas de moderación territorial |

**Puntuación (indicativa):**
| Acción | Puntos |
|---|---|
| Reseña con visita verificada | +10 |
| Baño nuevo confirmado por otro usuario | +30 |
| Confirmar/actualizar un baño existente | +5 |
| Foto útil aprobada | +8 |
| Reporte válido de baño inexistente | +15 |
| Reseña retirada por moderación | −25 |
| Contribución detectada como falsa | −100 y bajada de nivel |

### 9.3 Mecánicas que funcionan en este contexto

- **Misiones de verificación geolocalizadas.** "Hay 4 baños sin confirmar a menos de 500 m de ti. ¿Nos echas una mano?" — resuelve el problema del envejecimiento de datos y aprovecha el momento en que el usuario ya está allí. Es la mecánica de mayor ROI del sistema.
- **Insignias con significado local**, no genéricas: *"Guardián de Indautxu"*, *"Ruta Norte"*, *"Primer baño de Getxo"*.
- **Impacto visible, que es el verdadero motor:** *"Tus aportaciones han ayudado a 1.240 personas este mes."* En productos de utilidad esto motiva más que cualquier ranking.
- **Rankings locales por barrio/ciudad**, mensuales y reiniciables. Los rankings globales desmotivan a todo el mundo salvo a los diez primeros.
- **Cobertura colectiva por ciudad:** barra de progreso pública ("Bilbao: 68 % de zonas cubiertas"). Convierte la contribución en un objetivo comunitario, no individual.

### 9.4 Lo que NO se debe hacer

- Rachas diarias (*streaks*): incentivan aportaciones falsas para no romper la racha.
- Moneda virtual canjeable: convierte el spam en algo económicamente racional.
- Puntos por comentar mucho: premia la palabrería, no el dato.
- Ranking global permanente: pertenece a un puñado de usuarios y expulsa al resto.

---

## 10. Arranque de datos (*cold start*) — el verdadero riesgo del proyecto

Una app de mapas colaborativos vacía es inútil, y por tanto no atrae contribuidores. Hay que romper el círculo antes del lanzamiento.

### 10.1 Fuentes de semilla

1. **OpenStreetMap** — `amenity=toilets` y etiquetas asociadas (`wheelchair`, `fee`, `changing_table`, `opening_hours`, `access`). Aporta decenas de miles de puntos en España el día 1.
2. **Portales de datos abiertos municipales** — muchos ayuntamientos publican sus aseos públicos (con licencias generalmente permisivas tipo CC-BY; verificar caso a caso).
3. **Importación asistida de categorías con baño casi garantizado**: centros comerciales, estaciones, gasolineras, bibliotecas, museos, grandes superficies — importadas como *"probable, sin verificar"*, con confianza baja y una llamada explícita a confirmar.
4. **Campaña de siembra manual** en 3 barrios piloto (p. ej. Abando/Casco Viejo en Bilbao) antes del lanzamiento público, para garantizar densidad real en la zona donde se hará el lanzamiento.

### 10.2 Aviso legal sobre OSM (crítico, se suele pasar por alto)

Los datos de OSM están bajo **ODbL 1.0**, que incluye cláusula de *share-alike*. Si se mezclan con datos propios en una misma base de datos, la base derivada puede quedar sujeta a ODbL. Opciones:

- **(A) Capa separada.** Mantener los objetos OSM en una tabla/capa distinta e identificada, y publicar las contribuciones propias como base de datos independiente (*"produced work"* frente a *"derivative database"*). Es la opción prudente pero exige rigor técnico.
- **(B) Asumir ODbL** y publicar la base derivada abierta. Coherente con el espíritu del proyecto y una excelente narrativa de marca, pero renuncia al dato como activo exclusivo.
- **(C) Solo referencia visual**: usar OSM únicamente como fondo cartográfico y construir los POIs desde cero. Más lento, base 100 % propia.

**Recomendación:** empezar con (A), con atribución visible a OpenStreetMap, y **consultar con un abogado especializado en propiedad intelectual antes del lanzamiento**. Esto no es un detalle menor: condiciona el valor del activo principal de la empresa. (No soy abogado y esto no es asesoramiento jurídico.)

---

## 11. Cumplimiento legal, privacidad y confianza

- **RGPD / LOPDGDD.** La geolocalización es dato personal. Principios aplicados:
  - Ubicación procesada **en el dispositivo** siempre que sea posible; al servidor solo se envían coordenadas **redondeadas a ~100 m** para la consulta de cercanía.
  - **No se almacena histórico de ubicación del usuario.** Nunca.
  - Las coordenadas de verificación de reseña se guardan como distancia, no como punto exacto, pasada la validación.
  - IPs hasheadas con sal; retención mínima; DPA con todos los subencargados; datos alojados en la UE.
  - Ejercicio de derechos (acceso, supresión, portabilidad) automatizado en la app.
- **DSA (Reglamento de Servicios Digitales).** Mecanismo de notificación y acción, motivación de las decisiones de retirada y canal de reclamación interno para negocios afectados.
- **Difamación.** Las reseñas sobre negocios reales conllevan riesgo legal. Política de contenidos clara (prohibido acusar de delitos, prohibido identificar a empleados), retirada rápida ante requerimiento fundado y registro de auditoría.
- **Reglas de tienda.** Apple exige *Sign in with Apple* si hay login social, y mecanismo de denuncia + bloqueo para contenido generado por usuarios (guía 1.2). Sin esto, la app no pasa revisión.
- **Accesibilidad.** WCAG 2.2 AA y EN 301 549 — además de ser lo correcto, es exigible en la UE.

---

## 12. Monetización (visión, fuera del MVP)

1. **Freemium (v2):** paquetes offline de países/regiones, filtros avanzados, sin banners. ~2,99 €/año. Precio bajo a propósito: el objetivo es cubrir infraestructura, no exprimir.
2. **B2B "Baño Amigo Verificado" (v2, la vía con más recorrido):** un bar paga una cuota pequeña por aparecer verificado, con horario y foto oficial, y se compromete a dejar pasar sin consumir. **Gana tráfico real** (quien entra a un baño suele consumir algo). Es la única monetización que mejora el producto para el usuario en lugar de degradarlo.
3. **Instituciones (v3):** ayuntamientos y entes turísticos pagan por datos agregados de cobertura y demanda de aseos. Dato valioso para planificación urbana.
4. **Nunca:** vender datos de ubicación individuales. Es la línea que no se cruza.

---

## 13. Métricas de éxito

**Métrica norte:** *Successful Relief Rate* — porcentaje de sesiones de búsqueda que terminan en navegación iniciada + confirmación posterior positiva.

| Área | Métrica | Objetivo a 6 meses |
|---|---|---|
| Rendimiento | Tiempo de apertura a primer resultado | < 3 s (p90) |
| Cobertura | Baños activos en España | 40.000 |
| Frescura | % de baños verificados en los últimos 90 días | > 45 % |
| Calidad | % de reseñas con visita verificada | > 70 % |
| Densidad | % de zonas urbanas con ≥ 1 baño a < 400 m | > 80 % en 5 ciudades |
| Retención | D30 | > 22 % (alta para una utilidad) |
| Contribución | % de usuarios activos que contribuyen | > 6 % |
| Moderación | Tiempo medio de resolución de reporte | < 24 h |

---

## 14. Roadmap indicativo

| Fase | Duración | Entregable |
|---|---|---|
| **F0 — Descubrimiento** | 3 sem. | Entrevistas (10 usuarios de alto dolor), análisis legal OSM, prototipo Figma del flujo de urgencia |
| **F1 — Fundamentos** | 5 sem. | Esquema BD + PostGIS, API `nearby`, importación OSM España, infraestructura de tiles |
| **F2 — MVP app** | 8 sem. | RN/Expo: mapa, ficha, filtros, alta, reseña, offline lectura |
| **F3 — Confianza** | 4 sem. | Moderación, reputación, confidence score, reportes, cola de revisión |
| **F4 — Beta cerrada** | 4 sem. | 300 usuarios en Bilbao + Madrid; siembra manual de barrios piloto |
| **F5 — Lanzamiento ES** | 3 sem. | Tiendas, web SEO por ciudades, prensa local, alianza con ACCU España |
| **F6 — Escala** | continuo | Gamificación, B2B, expansión LatAm/UE |

**Equipo mínimo viable:** 1 PM/diseño · 2 full-stack (1 con foco RN) · 1 backend/datos con experiencia geoespacial · 1 community/moderación a media jornada desde F4.

---

## 15. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Cold start**: mapa vacío fuera de las zonas piloto | Crítico | Semilla OSM + lanzamiento ciudad a ciudad, nunca nacional de golpe |
| **Datos que envejecen** (mata a todos los competidores) | Crítico | Confidence score + misiones de verificación + decaimiento temporal |
| Licencia ODbL contamina la base propia | Alto | Separación de capas + dictamen jurídico previo al lanzamiento |
| Google añade estos atributos a Maps | Alto | Defensa: profundidad de dato, comunidad y nicho de accesibilidad. No se compite en cobertura |
| Spam de negocios | Medio | Verificación de presencia + consenso + ponderación |
| Costes de mapas/rutas se disparan | Medio | Stack open source autoalojado desde el día 1 |
| Baja tasa de contribución | Medio | Captura en el momento (notificación diferida) + reseña de 15 s |

---

## 16. Preguntas abiertas para la siguiente iteración

1. ¿Lanzamiento nacional o ciudad a ciudad? *(Recomendación firme: ciudad a ciudad, empezando por Bilbao/Bizkaia por densidad manejable y posibilidad de siembra manual.)*
2. ¿Se acepta ODbL para la base derivada, o se invierte en construir un dataset propio desde cero?
3. ¿Se contempla alianza institucional temprana (ayuntamientos, Turespaña) o se prioriza la vía puramente comunitaria?
4. ¿Presupuesto para moderación humana desde el día 1, o se retrasa hasta tener volumen?
5. ¿Nombre y marca? El nombre condiciona el SEO y el tono: uno humorístico gana virilidad social pero puede restar credibilidad ante instituciones y asociaciones de pacientes.

---

*Documento vivo. Toda decisión aquí propuesta es revisable a la luz de la investigación de usuarios de la fase F0.*
