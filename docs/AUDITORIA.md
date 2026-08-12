# Auditoría técnica · CERCA (localizador de baños)

## FASE 1 · Reconocimiento

**Inventario real del entorno.** No hay repositorio: hay cuatro entregables sueltos.

| Archivo | Líneas | Naturaleza |
|---|---|---|
| `banos.html` | 1399 | Aplicación completa (HTML+CSS+JS, un solo archivo) |
| `supabase_schema.sql` | 212 | Esquema base |
| `supabase_migracion_02_seguridad.sql` | ~400 | Migración de identidad y moderación |
| `PRD_App_Localizador_Banos.md` | 759 | Producto y arquitectura |
| `PUESTA_EN_MARCHA.md` | 204 | Despliegue |

**Sistema de compilación: no existe.** No hay `package.json`, `CMakeLists.txt`, `Cargo.toml` ni `.github/workflows/`. El workflow de Capacitor vive como texto dentro de `PUESTA_EN_MARCHA.md`, sin materializar. **Esto ya es un hallazgo**: no hay pipeline, ni CI, ni linter, ni un solo test.

**Disciplinas que no aplican y no voy a inventar.** JavaScript en WebView es monohilo: no hay condiciones de carrera de memoria, ni deadlocks, ni inversión de prioridad, ni punteros colgantes, ni gestión manual de ciclo de vida. No hay DSP, ni callbacks de audio, ni SIMD, ni aliasing. Los apartados de concurrencia de bajo nivel y de ingeniería de audio del guion **no tienen superficie sobre la que operar aquí**. Sí hay carreras *asíncronas* (promesas concurrentes), y ahí sí hay sangre: ver A-02.

**El eje real del riesgo** no es la memoria ni la latencia: es la **integridad del dato bajo adversario**. La app es un bien común editable por desconocidos anónimos. Ese es el frente y ahí va el peso del informe.

---

## FASE 2-3 · Hallazgos

### CRÍTICAS

---

**`supabase_migracion_02_seguridad.sql` · `guard_review()` | Integridad del dato — Gravedad: CRÍTICA**

* **Vector de Fallo:** `new.verified := (new.dist_m is not null and new.dist_m <= 150)`. `dist_m` lo calcula y lo envía **el cliente**. El servidor valida un número que no puede comprobar.
* **Mecanismo de Impacto:** La "visita verificada" —el activo diferencial del producto según el PRD §UVP— se falsifica con `{"dist_m": 0}` en un `curl`. Un competidor hunde un bar con 12 reseñas "verificadas" por hora sin moverse del sofá. El sello de confianza pasa a significar nada, y como es el que gobierna el `confidence_score` visible, contamina toda la jerarquía de la lista.
* **Solución de Grado de Producción:** La distancia se calcula en el servidor contra la geometría del baño. Las coordenadas entran como argumento y **no se persisten jamás** — sólo sobrevive `dist_m`:

```sql
create or replace function public.add_review(
  p_ref text, p_rating smallint, p_clean smallint,
  p_attrs jsonb, p_comment text,
  p_lat double precision, p_lng double precision,
  p_toilet_lat double precision default null,   -- sólo para baños que aún viven en OSM
  p_toilet_lng double precision default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare g_user geography; g_toilet geography; d numeric; new_id uuid;
begin
  if auth.uid() is null then raise exception 'Necesitas una sesión abierta'; end if;

  g_user := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  select t.geom into g_toilet from public.toilets t
   where coalesce(t.osm_ref, 'db:' || t.id::text) = p_ref and t.status = 'active';

  if g_toilet is null and p_toilet_lat is not null then
    g_toilet := st_setsrid(st_makepoint(p_toilet_lng, p_toilet_lat), 4326)::geography;
  end if;

  d := case when g_toilet is null then null
            else round(st_distance(g_user, g_toilet)::numeric, 1) end;

  insert into public.reviews (toilet_ref, rating, clean, attrs, comment, dist_m)
  values (p_ref, p_rating, p_clean, coalesce(p_attrs,'{}'::jsonb), left(p_comment,300), d)
  returning id into new_id;
  return new_id;                      -- g_user muere aquí. No se escribe en ninguna tabla.
end $$;

revoke insert on public.reviews from authenticated;   -- ya sólo se entra por aquí
```

  Y en `guard_review()`, blindar contra la vía directa: `if new.dist_m is not null and current_setting('request.jwt.claims', true) is not null then new.verified := false; end if;` salvo que venga de la función. Lo limpio es cerrar el `INSERT` directo, como arriba.
* **Trade-off:** Las coordenadas exactas del usuario viajan al servidor en el instante de reseñar (antes no salían de Supabase, sólo iban a Overpass). Viven en RAM durante la transacción y no se escriben. Contrapartida obligada: hay que declararlo en la política de privacidad y desactivar el log de parámetros de sentencia en Postgres (`log_statement = 'none'`), o las coordenadas acabarán en los logs, que es exactamente lo que se quería evitar.

---

**`supabase_migracion_02_seguridad.sql` · `apply_reports()` | Modelo de confianza — Gravedad: CRÍTICA**

* **Vector de Fallo:** `count(distinct created_by) >= 3` con inicio de sesión anónimo abierto. Acuñar identidades cuesta un `POST /auth/v1/signup` vacío. Tres son gratis.
* **Mecanismo de Impacto:** El sistema de moderación se convierte en el arma. Un solo dispositivo genera tres sesiones anónimas y **oculta el baño de la competencia en treinta segundos**. Peor que no tener moderación: da una palanca de censura a coste cero, y la víctima ni se entera porque el ocultado es silencioso. El mismo truco resetea los límites de 12 reseñas/hora y 6 altas/hora, que quedan decorativos.
* **Solución de Grado de Producción:** Tres capas, ninguna suficiente sola:
  1. **CAPTCHA en el registro anónimo** (Supabase → Auth → Bot & Abuse Protection → Cloudflare Turnstile). Sube el coste de acuñar identidad de 0 a algo.
  2. **Reputación mínima para que el reporte cuente.** Una identidad recién nacida puede reportar, pero su voto no pesa hasta tener historial:

```sql
create or replace function public.peso_reporte(u uuid) returns int
language sql stable set search_path = public as $$
  select case
    when (select count(*) from public.reviews
           where created_by = u and verified and status = 'visible') >= 3 then 2
    when (select min(created_at) from public.reviews where created_by = u)
         < now() - interval '7 days' then 1
    else 0 end;
$$;
-- en apply_reports(): sumar peso_reporte() en vez de contar cabezas, umbral 4.
```

  3. **Asimetría deliberada:** ocultar exige 4 puntos de peso; **reponer basta con que el autor lo pida** (`retract` inverso). El daño de un falso positivo es mayor que el de un falso negativo, y el sistema debe inclinarse hacia dejar visible.
* **Trade-off:** Los primeros usuarios legítimos no pueden moderar hasta acumular historial, así que durante el arranque la moderación eres tú a mano sobre `mod_queue`. Es el precio correcto: en cold start no hay volumen de spam, hay volumen cero de todo.

---

**`supabase_migracion_02_seguridad.sql` · `apply_reports()` líneas del bloque `toilet` | Lógica de negocio — Gravedad: CRÍTICA**

* **Vector de Fallo:** El `UPDATE` busca `where coalesce(osm_ref,'db:'||id::text) = new.target_ref` **en la tabla `toilets`**. Los baños de OpenStreetMap no están en esa tabla: se consultan al vuelo contra Overpass y nunca se insertan.
* **Mecanismo de Impacto:** **El botón de reportar no hace nada sobre la inmensa mayoría del catálogo.** El `UPDATE` afecta a 0 filas, la función devuelve éxito, la app dice "Aviso enviado. Gracias" y el baño inventado, cerrado o inexistente sigue en el mapa para siempre. Es la peor clase de fallo: silencioso y con acuse de recibo falso.
* **Solución de Grado de Producción:** Tabla de supresiones desacoplada del origen del dato (y encima resuelve el problema ODbL: no importas OSM, sólo anotas encima):

```sql
create table if not exists public.suppressions (
  ref        text primary key,
  reason     text not null,
  created_at timestamptz not null default now()
);
alter table public.suppressions enable row level security;
create policy sup_read on public.suppressions for select to anon, authenticated using (true);
grant select on public.suppressions to anon, authenticated;

-- en apply_reports(), rama 'toilet', cuando se alcanza el umbral:
insert into public.suppressions (ref, reason)
values (new.target_ref, 'reportado por la comunidad')
on conflict (ref) do nothing;

create or replace function public.suppressed(p_since timestamptz default 'epoch')
returns table (ref text, reason text)
language sql stable set search_path = public as $$
  select s.ref, s.reason from public.suppressions s where s.created_at > p_since;
$$;
grant execute on function public.suppressed(timestamptz) to anon, authenticated;
```

  Y en el cliente, dentro de `render()`, antes del filtro de usuario:

```js
S.list = all.filter(t => !S.supp.has(t.id)).filter(t => { /* filtros actuales */ });
```

  cargando `S.supp` en `Cloud.nearby()` y cacheándolo en `localStorage` para que funcione sin cobertura.
* **Trade-off:** Una llamada más por ciclo de búsqueda y una lista que crece sin techo natural. Con `p_since` y caché incremental el coste es despreciable; sin ella, a los dos años son cientos de miles de refs y hay que particionar por región.

---

### ALTAS

---

**`banos.html` · `merged()` líneas 545-556 | Integridad del dato — Gravedad: ALTA**

* **Vector de Fallo:** `const hit = rs.find(r => r.attrs && r.attrs[k] != null)` sobre reseñas ordenadas por fecha descendente. **La reseña más reciente sobrescribe los atributos, sin consenso ni ponderación.**
* **Mecanismo de Impacto:** Una sola reseña —anónima, sin verificar, de una identidad de dos minutos de vida— cambia "gratuito: sí" a "gratuito: no" para todos los usuarios. No hace falta ni el sistema de reportes para envenenar el mapa: basta con reseñar. Y como los atributos gobiernan los filtros, un baño accesible desaparece de la búsqueda de una persona en silla de ruedas.
* **Solución de Grado de Producción:** Voto mayoritario ponderado sobre la ventana reciente, con las visitas verificadas pesando el doble:

```js
function consenso(rs, k) {
  const w = new Map();                       // valor -> peso acumulado
  rs.slice(0, 8).forEach(r => {              // sólo las 8 más recientes
    const v = r.attrs && r.attrs[k];
    if (v == null || v === "") return;
    const peso = (r.verified ? 2 : 1) * (r.ts > Date.now() - 15552000000 ? 1 : 0.5);
    w.set(v, (w.get(v) || 0) + peso);
  });
  if (!w.size) return undefined;
  const [mejor, p] = [...w.entries()].sort((a, b) => b[1] - a[1])[0];
  const total = [...w.values()].reduce((s, x) => s + x, 0);
  return p / total >= 0.6 ? mejor : undefined;   // sin mayoría clara, no se afirma nada
}
// en merged(): ["free","acc","baby","h24","entry"].forEach(k => {
//   const v = consenso(rs, k); if (v !== undefined) o[k] = v; });
```

* **Trade-off:** Un dato correcto tarda más en propagarse: un baño que acaba de empezar a cobrar necesita dos o tres reseñas para reflejarlo en vez de una. A cambio, un actor aislado no puede mentir. En un bien común, la inercia es una virtud.

---

**`banos.html` · `Auth.ensure()` líneas 425-445 | Concurrencia asíncrona — Gravedad: ALTA**

* **Vector de Fallo:** No hay cerrojo de vuelo. `fetchToilets()` dispara `Cloud.flush()` y `Cloud.nearby()`, y cada `Cloud.call()` invoca `Auth.ensure()` por su cuenta. Con la sesión caducada, N llamadas concurrentes lanzan N refrescos.
* **Mecanismo de Impacto:** Los refresh tokens de GoTrue **rotan**: el primer refresco invalida el token que las otras llamadas están usando, todas fallan, `this.borra()` limpia la sesión y se crea un usuario anónimo huérfano nuevo. Resultado en producción: la tabla `auth.users` engorda con identidades muertas, el usuario pierde la autoría de lo que publicó (adiós botón "retirar lo mío") y, con la cola de salida llena, se dispara una tormenta de registros. Reproducible sin más que dejar la app abierta una hora y arrastrar el mapa.
* **Solución de Grado de Producción:** Memoizar la promesa en vuelo:

```js
_vuelo: null,
async ensure() {
  if (!DB.cfg.url || !DB.cfg.key) return null;
  if (this.vivo()) return this.token;
  if (this._vuelo) return this._vuelo;              // los demás esperan al primero
  this._vuelo = (async () => {
    try {
      if (this.ses && this.ses.refresh_token) {
        try { this.guarda(await this.post("/auth/v1/token?grant_type=refresh_token",
                          { refresh_token: this.ses.refresh_token })); return this.token; }
        catch (e) { this.borra(); }
      }
      this.guarda(await this.post("/auth/v1/signup", {}));
      return this.token;
    } finally { this._vuelo = null; }
  })();
  return this._vuelo;
}
```

* **Trade-off:** Ninguno real. Si el primer intento falla, todos fallan juntos en vez de reintentar en paralelo — que es justo el comportamiento correcto.

---

**`banos.html` · `merged()` línea 547 + envío de reseña línea 1088 | Consistencia de estado — Gravedad: ALTA**

* **Vector de Fallo:** `const seen = new Set(own.map(r => r.ts))` deduplica reseña local contra reseña remota **comparando marcas de tiempo**. La local lleva el reloj del móvil; la remota, `created_at` del servidor. Nunca coinciden. Y a diferencia del alta de baño (línea 1193, que sí limpia `DB.mine` al publicar), la reseña publicada **no se borra del almacén local**.
* **Mecanismo de Impacto:** El usuario ve **su propia reseña duplicada** en cada ficha que valora, y la media aritmética la cuenta dos veces: un 5 propio sobre un baño sin más reseñas muestra 5,0 con "2 reseñas". El contador de la cabecera miente y la confianza del dato se infla artificialmente. Es el bug que más rápido detecta un usuario y el que peor sienta.
* **Solución de Grado de Producción:** Simetría con el alta de baño — publicado con éxito, el servidor manda:

```js
Cloud.send(op)
  .then(id => {
    (DB.reviews[t.id] || []).some((r, i) => r.ts === op.d.ts &&
      (DB.reviews[t.id].splice(i, 1), true));
    DB.save("reviews");
    toast(r.verified ? "Publicado · visita verificada" : "Publicado. Sin verificar: estabas lejos.");
    Cloud.reviews([t.id]).then(() => { render(); openDetail(t.id); });
  })
```

  Y mientras tanto, deduplicación defensiva en `merged()` por ventana temporal en vez de igualdad exacta: `!srv.some(s => Math.abs(s.ts - r.ts) < 300000 && s.rating === r.rating)`.
* **Trade-off:** Si la reseña se publica y la relectura falla (red inestable justo después), el usuario ve su reseña desaparecer un momento hasta el siguiente ciclo. Menos malo que verla duplicada para siempre.

---

**`banos.html` · `fetchToilets()` línea 738 y todos los `fetch` | Resiliencia — Gravedad: ALTA**

* **Vector de Fallo:** Ningún `fetch` lleva `AbortController` ni timeout. El pestillo `S.fetching = true` sólo se libera al resolverse la promesa.
* **Mecanismo de Impacto:** Overpass es un servidor de voluntarios que bajo carga **no rechaza: se queda colgado**. Una petición sin timeout en una red móvil mala deja `S.fetching` en `true` de forma permanente: `maybeRefetch()` sale por la puerta de atrás en cada arrastre y **la app queda congelada en "Buscando" hasta que se mata el proceso**. En una app cuyo caso de uso es la urgencia, esto es el fallo más caro del informe en términos de producto.
* **Solución de Grado de Producción:**

```js
async function fetchConTimeout(url, opts, ms = 12000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, Object.assign({}, opts, { signal: ac.signal })); }
  finally { clearTimeout(id); }
}
```

  Aplicado a Overpass (12 s), Supabase (8 s) y Auth (8 s). Y el pestillo, en `finally`, no en la rama feliz:

```js
async function fetchToilets(lat, lon) {
  if (S.fetching) return;
  S.fetching = true; latch("busy", "Buscando");
  try { /* … */ } finally { S.fetching = false; }
}
```

* **Trade-off:** Una consulta legítimamente lenta (Overpass en hora punta tarda 15-20 s) se abortará y caerá a caché. Preferible: mostrar dato viejo con su sello de antigüedad es exactamente el diseño del PRD.

---

**`banos.html` · `Cloud.flush()` líneas 660-676 | Resiliencia / DevOps — Gravedad: ALTA**

* **Vector de Fallo:** La cola no tiene contador de intentos, ni techo de tamaño, ni backoff. Los errores no clasificados como definitivos se reencolan indefinidamente, y el vaciado es un `for` con `await` secuencial ejecutado **antes** de pintar nada.
* **Mecanismo de Impacto:** Un fallo persistente no contemplado por el regex de la línea 668 —un 401 por sesión rota, un 500 del servidor— acumula operaciones sin límite. Cada `fetchToilets()` reintenta la cola entera en serie: con 40 pendientes y 8 s de timeout cada una, **el usuario espera cinco minutos antes de ver un solo baño**, en la situación exacta en que abrió la app corriendo.
* **Solución de Grado de Producción:** Techo, intentos, backoff, y desacoplar el vaciado del camino crítico:

```js
queue(op) {
  op.try = 0; op.next = 0;
  DB.outbox.push(op);
  if (DB.outbox.length > 200) DB.outbox.shift();     // techo duro
  DB.save("outbox");
},
async flush(max = 5) {                                // nunca más de 5 por ciclo
  if (!this.on || !DB.outbox.length) return 0;
  let sent = 0, n = 0;
  const left = [];
  for (const op of DB.outbox) {
    if (n >= max || (op.next || 0) > Date.now()) { left.push(op); continue; }
    n++;
    try { await this.send(op); sent++; }
    catch (e) {
      const m = String(e.message || "");
      if (/duplicad|límite|limite|no válido|menos de 15/i.test(m) || /"code":"23505"/.test(m)) {
        toast(m.replace(/.*"message":"([^"]+)".*/, "$1").slice(0, 90));
      } else if ((op.try = (op.try || 0) + 1) < 6) {
        op.next = Date.now() + Math.min(3600000, 30000 * 2 ** op.try);   // backoff exponencial
        left.push(op);
      }                                               // al 6º intento se descarta y se avisa
    }
  }
  DB.outbox = left; DB.save("outbox");
  return sent;
}
```

  Y en `fetchToilets()`, lanzar `Cloud.flush()` **sin `await`**: la cola es trabajo de fondo, no bloquea la pantalla.
* **Trade-off:** Se pierden envíos tras seis intentos fallidos. Hay que avisarlo explícitamente ("no se pudo publicar tu reseña de X") en lugar de callarlo, o el usuario cree que contribuyó y no.

---

**`banos.html` · `openInfo()` línea 1215 | Cumplimiento legal — Gravedad: ALTA**

* **Vector de Fallo:** El literal `"Todo se guarda en este dispositivo. No sale de aquí."` se sigue mostrando con el servidor conectado, publicando en Supabase.
* **Mecanismo de Impacto:** Es una declaración falsa sobre tratamiento de datos dentro de la propia interfaz. Google Play exige coherencia entre la sección de Seguridad de los Datos y el comportamiento real: la discrepancia es motivo de retirada de la ficha, y bajo RGPD es información engañosa al interesado. Además hay dos flujos de datos no declarados en ninguna parte: **las coordenadas del centro de búsqueda viajan a Overpass** (servidor de terceros, fuera de tu control) y **el viewport viaja a `tile.openstreetmap.org`** en cada tesela.
* **Solución de Grado de Producción:** Texto condicionado al estado real y enumeración honesta de los terceros:

```js
<p class="sub">${Cloud.on
  ? "Lo que publicas se comparte. Tu ubicación exacta nunca se guarda."
  : "Todo se queda en este dispositivo."}</p>
```

  Y en la política de privacidad, tres apartados obligatorios: Supabase (Frankfurt, encargado del tratamiento, conserva IP en los registros de autenticación), Overpass (recibe la zona consultada), OpenStreetMap (recibe el viewport). El "nunca sale de aquí" sólo es cierto de la ubicación *precisa* y sólo si se implementa A-01 con la disciplina de no persistirla.
* **Trade-off:** Ninguno técnico. Cuesta credibilidad de marketing y la compra entera: es lo que separa un producto defendible de una multa.

---

**`PUESTA_EN_MARCHA.md` · workflow de GitHub Actions | DevOps — Gravedad: ALTA**

* **Vector de Fallo:** El pipeline ejecuta `assembleDebug` y publica el artefacto como entregable.
* **Mecanismo de Impacto:** Un APK debug va firmado con la clave de depuración compartida, lleva `android:debuggable="true"` y permite copia de seguridad automática. Cualquiera con ADB **lee el `localStorage` del WebView, y con él el JWT de sesión y la configuración del servidor**. No es distribuible: Play lo rechaza, y si se reparte por fuera es una puerta abierta.
* **Solución de Grado de Producción:** `assembleRelease` con firma desde secretos del repositorio, `minifyEnabled`, y `android:allowBackup="false"` con `android:usesCleartextTraffic="false"` en el manifiesto:

```yaml
- run: npx cap sync android && cd android && ./gradlew assembleRelease
  env:
    KEYSTORE_B64: ${{ secrets.KEYSTORE_B64 }}
    KEY_ALIAS:    ${{ secrets.KEY_ALIAS }}
    KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
```

  Y materializar el workflow como archivo real en `.github/workflows/apk.yml`, no como texto en un manual que nadie ejecuta.
* **Trade-off:** Hay que custodiar el keystore. Si se pierde, no se puede volver a publicar bajo el mismo `applicationId`: cópialo fuera de GitHub el día que lo generes.

---

**`supabase_migracion_02_seguridad.sql` · `guard_toilet()` | Antiabuso — Gravedad: ALTA**

* **Vector de Fallo:** El veto de duplicados filtra `where status = 'active'`. Un baño ocultado deja de ocupar su radio de 15 m.
* **Mecanismo de Impacto:** Ciclo infinito de spam: publicar → la comunidad lo oculta → el hueco geográfico queda libre → volver a publicar lo mismo. La moderación se convierte en una noria y el moderador se cansa antes que el atacante.
* **Solución de Grado de Producción:** El veto ignora el estado, y además se aprovecha la supresión de C-03:

```sql
select count(*) into dup from public.toilets
  where st_dwithin(geom, new.geom, 15)
    and (status = 'active'
      or (status = 'hidden' and hidden_at > now() - interval '90 days'));
if dup > 0 then
  raise exception 'Ya hay un baño registrado a menos de 15 metros';
end if;
```

* **Trade-off:** Un baño ocultado por error bloquea su ubicación 90 días. Se resuelve reponiéndolo desde `mod_queue` en vez de creando uno nuevo, que es el flujo correcto de todos modos.

---

### MEDIAS

---

**`banos.html` · `fetchToilets()` líneas 745-752 | Resiliencia — Gravedad: MEDIA**

* **Vector de Fallo:** `catch (e) { if (DB.cloud && DB.cloud.items) S.cloud = DB.cloud.items; }` y `catch (e) { /* las reseñas propias siguen visibles */ }`. Excepciones tragadas sin rastro. `render()` se invoca **dentro** de esos `try`.
* **Mecanismo de Impacto:** Un fallo de programación en `render()` —no de red— se captura como si fuera un corte de conexión y el usuario ve datos de caché en silencio. El síntoma que llega a soporte es "a veces no salen baños nuevos", imposible de diagnosticar porque no queda registro de nada.
* **Solución de Grado de Producción:** Sacar `render()` fuera del `try`, distinguir error de red de error de código, y dejar rastro local:

```js
const LOG = [];
function fallo(donde, e) {
  LOG.push({ t: Date.now(), donde, msg: String(e && e.message || e) });
  if (LOG.length > 50) LOG.shift();
  if (!(e instanceof TypeError)) console.error(donde, e);   // TypeError ≈ red caída
}
```

  Con `LOG` volcable desde Ajustes → Exportar. Sin telemetría remota: no hace falta, y encaja con la postura de privacidad.
* **Trade-off:** 50 entradas en memoria. Nada.

---

**`banos.html` · `render()` líneas 796-801 | Eficiencia algorítmica — Gravedad: MEDIA**

* **Vector de Fallo:** `merged()` se ejecuta sobre **todos** los baños (hasta 400: 200 de OSM + 200 de la nube) en cada `render()`, y cada llamada hace `concat` + `sort` de reseñas. `paintList()` sólo pinta 40.
* **Mecanismo de Impacto:** ~360 fusiones desechadas por ciclo. `render()` se dispara en cada `dragend`, así que arrastrar el mapa en una zona densa produce microcortes en el hilo de UI en gama baja. No es fatal —la N es pequeña— pero es trabajo tirado en el hilo que no hay que bloquear.
* **Solución de Grado de Producción:** Distancia y filtro primero, fusión sólo sobre el corte visible:

```js
const all = Array.from(by.values());
S.list = all.map(t => (t.d = dist(ref.lat, ref.lon, t.lat, t.lon), t))
            .sort((a, b) => a.d - b.d)
            .slice(0, 60)              // margen sobre los 40 que se pintan
            .map(merged)
            .filter(pasaFiltros);
```

  Ojo al orden: los filtros dependen de atributos que produce `merged()`, así que el `slice` debe llevar margen para que un filtro agresivo no vacíe la lista.
* **Trade-off:** Con filtros muy restrictivos podrían quedar fuera resultados válidos más allá del puesto 60. Se corrige ampliando el corte cuando la lista resultante baja de 10.

---

**`supabase_migracion_02_seguridad.sql` · vista `mod_queue` | Superficie de exposición — Gravedad: MEDIA**

* **Vector de Fallo:** Una vista en Postgres se ejecuta con los permisos de su propietario salvo que lleve `security_invoker`. `mod_queue` no lo lleva: es un puente que **salta el RLS de `reports`**. Hoy está a salvo sólo porque se revocaron los permisos.
* **Mecanismo de Impacto:** Un `grant select on public.mod_queue to authenticated` hecho por descuido dentro de seis meses —o un futuro panel de administración— expone la cola completa de reportes a cualquier usuario anónimo con sesión. El linter de Supabase lo marcará como `security_definer_view`.
* **Solución de Grado de Producción:** `alter view public.mod_queue set (security_invoker = on);`. Con el RLS vigente, un usuario normal sólo vería sus propios reportes aunque se le conceda acceso, y `service_role` lo sigue viendo todo. Defensa en profundidad: el permiso deja de ser la única barrera.
* **Trade-off:** Ninguno.

---

**`supabase_migracion_02_seguridad.sql` · índice `reviews_one_per_day_user` | Corrección funcional — Gravedad: MEDIA**

* **Vector de Fallo:** `(created_at::date)` evalúa en UTC. El usuario está en `Europe/Madrid` (UTC+2 en verano).
* **Mecanismo de Impacto:** Entre las 00:00 y las 02:00 hora local, la fecha UTC sigue siendo la de ayer: se puede reseñar el mismo baño dos veces en una noche. Simétricamente, quien reseñó a las 01:00 y vuelve a las 23:00 del mismo día local se lleva un rechazo incomprensible. Vida nocturna en Bilbao — el caso de uso más probable de esta app.
* **Solución de Grado de Producción:**

```sql
drop index if exists public.reviews_one_per_day_user;
create unique index reviews_one_per_day_user on public.reviews
  (toilet_ref, created_by, ((created_at at time zone 'Europe/Madrid')::date));
```

  Al internacionalizar, guardar el huso del baño en `toilets` y usar una columna generada.
* **Trade-off:** Ata el esquema a un huso concreto. Correcto mientras el alcance sea España, y es una deuda explícita, no oculta.

---

**`banos.html` · `Auth.guarda()` línea 400 | Superficie de exposición — Gravedad: MEDIA**

* **Vector de Fallo:** `access_token` y `refresh_token` en `localStorage`, y ninguna `Content-Security-Policy` en el documento. El código construye la UI con `innerHTML` en catorce sitios.
* **Mecanismo de Impacto:** `esc()` está bien escrita y hoy cubre todas las interpolaciones de dato ajeno — lo he verificado. Pero un solo `${t.name}` sin escapar añadido dentro de seis meses convierte un nombre de baño en robo de sesión para todo el que abra esa ficha. Sin CSP no hay segunda línea de defensa.
* **Solución de Grado de Producción:** Cinturón además de tirantes, en el `<head>`:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://unpkg.com;
  style-src  'self' 'unsafe-inline';
  img-src    'self' data: https://tile.openstreetmap.org;
  connect-src 'self' https://*.supabase.co https://overpass-api.de https://overpass.kumi.systems;">
```

  El `'unsafe-inline'` en scripts es inevitable con la arquitectura de archivo único; aun así `connect-src` acota a dónde puede exfiltrarse un token, que es lo que importa. Y sesiones cortas: `JWT expiry` a 3600 s en Supabase, ya que el refresco es automático.
* **Trade-off:** La CSP romperá cualquier CDN nuevo que se añada sin actualizarla. Es un fallo ruidoso e inmediato en desarrollo, que es el tipo bueno de fallo.

---

**`supabase_migracion_02_seguridad.sql` · `reviews_for()` | Eficiencia — Gravedad: MEDIA**

* **Vector de Fallo:** `limit 500` global sobre hasta 60 baños, ordenado por fecha descendente sin partición.
* **Mecanismo de Impacto:** Un baño popular con 400 reseñas consume el presupuesto entero y **los otros 59 baños vuelven sin ninguna**, mostrando "sin confirmar" sobre datos que sí existen. El indicador de confianza miente a la baja, que es peor que no mostrarlo.
* **Solución de Grado de Producción:** Partición por baño, que es lo que la UI necesita:

```sql
select * from (
  select r.id::text, r.toilet_ref, r.rating, r.clean, r.attrs, r.comment,
         r.verified, r.created_at,
         (r.created_by is not distinct from auth.uid()) as mine,
         row_number() over (partition by r.toilet_ref order by r.created_at desc) as rn
  from public.reviews r
  where r.toilet_ref = any(refs) and r.status = 'visible'
) x where x.rn <= 8;
```

* **Trade-off:** La media agregada la sigue calculando `toilets_nearby` sobre el total, así que no se pierde precisión estadística: sólo se recortan las reseñas mostradas, que es exactamente lo que se pinta.

---

### BAJAS

---

**`banos.html` · `confianza()` líneas 563-565 | Coherencia de interfaz — Gravedad: BAJA**

* **Vector de Fallo:** `hace()` devuelve `"3 días"` sin preposición. La línea 563 lo usa crudo; las 564-565 anteponen `"hace "`.
* **Mecanismo de Impacto:** La misma ficha muestra `"3 días"` y `"hace 4 meses"` según la antigüedad. Roza lo cosmético, pero en una app cuyo diferencial es que el usuario confíe en la frescura del dato, la incoherencia del sello de frescura resta exactamente donde no conviene.
* **Solución de Grado de Producción:** Que `hace()` devuelva siempre la forma completa (`"hoy"`, `"ayer"`, `"hace 3 días"`) y eliminar los prefijos de las líneas 564-565. Comprobar también el `<time>` de la lista de reseñas, que la usa cruda.
* **Trade-off:** Ninguno.

---

**Proyecto completo | Deuda técnica estructural — Gravedad: BAJA (hoy) / CRÍTICA (a seis meses)**

* **Vector de Fallo:** Cero tests, cero CI, cero linter, ningún control de versiones del esquema SQL más allá de dos archivos sueltos con numeración manual.
* **Mecanismo de Impacto:** Con 1399 líneas y un solo autor es sostenible. En cuanto entren dos personas o la migración 05, la ausencia de un orden reproducible de migraciones provoca divergencia entre lo que hay en producción y lo que dice el repositorio. Nadie sabrá qué versión del esquema está viva en Frankfurt, y eso se descubre siempre en el peor momento.
* **Solución de Grado de Producción:** Supabase CLI (`supabase init`, `supabase migration new`, `supabase db push`), que versiona las migraciones con marca temporal y las aplica en orden y de forma idempotente. Y en CI, el mínimo viable que ya evita el 80% de las regresiones: `node --check` sobre el bloque de script extraído.
* **Trade-off:** Media jornada de montaje. Hazlo ahora, mientras hay dos archivos SQL y no doce.

---

## Veredicto

La arquitectura de fondo es correcta y la elección de RLS con `UPDATE`/`DELETE` sin política es una decisión de diseño acertada: hace estructuralmente imposible la destrucción de datos, que es la clase de garantía que no depende de acordarse de nada.

El problema no está donde suele buscarse. **No hay un solo hallazgo de rendimiento que importe** — la app es rápida y lo seguirá siendo. Los tres CRÍTICOS son todos del mismo tipo: **el servidor confía en afirmaciones que el cliente no puede demostrar.** La distancia la declara el móvil (A-01), la identidad se acuña gratis (A-02) y el reporte apunta a una fila que no existe (A-03). Los tres desarman el sistema de confianza que es, literalmente, el producto entero: sin él esto es otro mapa de baños mediocre, que es exactamente lo que el PRD identificó como el fracaso a evitar.

**Orden de ataque, sin negociación:**

1. **A-03** (reportes sobre OSM) — media hora, y ahora mismo el botón miente al usuario.
2. **A-01** (distancia servidor) — la verificación es el activo; hoy es decorativa.
3. **ALTA-05** (timeout / pestillo) — el fallo que hace que la app no sirva justo cuando se necesita.
4. **ALTA-03** (reseña duplicada) — el primero que verá cualquier persona a quien se la enseñes.
5. **A-02** (Turnstile + reputación) — puede esperar a que haya usuarios, pero no a que haya spam.

Lo demás aguanta hasta después de la beta.

---

# Auditoría 2 · 2026-08-12 · Puesta en marcha real

Primera ejecución de los tres SQL contra un proyecto Supabase limpio, lectura
completa de `www/index.html` cruzada con el esquema desplegado, y revisión de
los workflows. Ocho hallazgos, todos aplicados.

## SQL: los scripts no se podían ejecutar en orden (CRÍTICO, aplicado)

Nadie había ejecutado los tres archivos seguidos contra un proyecto virgen.
Tres errores lo impedían:

- **01 y 02**: `created_at::date` no es inmutable y Postgres rechaza el índice
  `reviews_one_per_day`. La 03 ya usaba la forma correcta
  (`at time zone 'Europe/Madrid'`); ahora la usan las tres.
- **02**: `toilets_nearby` y `reviews_for` cambian su tipo de retorno
  (columna `mine`) y `create or replace` no puede hacer eso → `drop function`
  previo.
- **03**: `mod_queue` mete la columna `peso` en medio de la vista y
  `create or replace view` no reordena columnas → `drop view` previo.

## La documentación exigía Turnstile pero la app no lo soporta (CRÍTICO, documentado)

`www/index.html` llama a `/auth/v1/signup` sin `gotrue_meta_security`, así que
activar Turnstile en el panel rompe el inicio de sesión anónimo entero.
README y PUESTA_EN_MARCHA ahora lo dicen; implementar el captcha en la app
sigue siendo la tarea pendiente más urgente (cierra de verdad A-02).

## App: cuatro fallos funcionales (aplicados)

- **La nube pisaba con null los datos de OSM.** Un baño presente en ambas
  fuentes perdía horario, precio y atributos que OSM sí conoce. Ahora solo
  pisan los valores con contenido.
- **La cola offline dejaba copias duplicadas.** El envío directo retiraba la
  copia local al publicar; el que salía por la cola, no: baño y reseña
  aparecían dos veces. La cola ahora hace lo mismo que el envío directo.
- **Lo añadido antes de conectar no se publicaba nunca.** Conectar el servidor
  no encolaba los baños ya guardados en el móvil; se quedaban locales para
  siempre. Al conectar ahora se encolan y publican.
- **"SIN DATOS" con datos.** Con Overpass caído pero servidor conectado, el
  pestillo decía "Sin datos" aunque la lista mostraba baños de la comunidad.

## Workflow del APK roto (aplicado)

`android/` está en `.gitignore` y el workflow hacía `cap sync` sin generarla:
fallaba en el primer paso. Además pedía editar a mano un `build.gradle` que se
regenera en cada build. Ahora el workflow crea la plataforma, inyecta la firma
y endurece el manifest él mismo. Pendiente de probar con el keystore real.

## Menores

- `PUESTA_EN_MARCHA.md` nombraba archivos SQL que no existen en el repo.
- `openDetail` trataba longitud 0 como "sin valor" (`ref.lng || ref.lon`);
  el meridiano de Greenwich cruza España.
