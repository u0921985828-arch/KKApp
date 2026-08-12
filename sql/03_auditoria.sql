-- ═══════════════════════════════════════════════════════════════════════
--  CERCA · Migración 03 · Correcciones de auditoría
--
--  Ejecutar DESPUÉS de la 02. Idempotente. No borra datos.
--
--  Cierra: A-01 (distancia falsificable), A-02 (identidades gratis),
--  A-03 (reportes sin efecto sobre OSM), ALTA-09 (hueco de 15 m),
--  MEDIA-03 (vista definer), MEDIA-04 (huso horario), MEDIA-06 (límite
--  global de reseñas).
-- ═══════════════════════════════════════════════════════════════════════

-- ═══ A-03 · SUPRESIONES ════════════════════════════════════════════════
-- Los baños de OpenStreetMap no viven en nuestra tabla: se consultan al
-- vuelo. Para poder retirarlos del mapa hace falta una capa de anotación
-- encima, desacoplada del origen. Ventaja lateral: no importamos OSM, así
-- que la licencia ODbL sigue sin tocarnos.

create table if not exists public.suppressions (
  ref        text primary key,
  reason     text not null,
  created_at timestamptz not null default now()
);

alter table public.suppressions enable row level security;
drop policy if exists sup_read on public.suppressions;
create policy sup_read on public.suppressions
  for select to anon, authenticated using (true);
grant select on public.suppressions to anon, authenticated;
-- Sin política de insert/update/delete: sólo escribe el trigger (definer).

create or replace function public.suppressed()
returns table (ref text, reason text)
language sql stable set search_path = public as $$
  select s.ref, s.reason from public.suppressions s;
$$;
grant execute on function public.suppressed() to anon, authenticated;

-- ═══ A-02 · PESO DE LOS REPORTES ═══════════════════════════════════════
-- Contar cabezas no vale cuando acuñar cabezas es gratis. Una identidad
-- recién nacida puede reportar, pero su voto no pesa hasta tener historial.

create or replace function public.peso_reporte(u uuid) returns int
language sql stable set search_path = public as $$
  select case
    when u is null then 0
    when (select count(*) from public.reviews
           where created_by = u and verified and status = 'visible') >= 3 then 2
    when (select min(created_at) from public.reviews where created_by = u)
         < now() - interval '7 days' then 1
    else 0 end;
$$;

-- ═══ A-02 + A-03 · AUTO-OCULTADO REESCRITO ═════════════════════════════
-- Umbral por peso (4), no por número. Y escribe en suppressions, que es
-- lo único que alcanza a los baños que sólo existen en OSM.

create or replace function public.apply_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare p int; p_closed int; existe int;
begin
  select coalesce(sum(public.peso_reporte(x.uid)), 0) into p
    from (select distinct created_by as uid from public.reports
           where kind = new.kind and target_ref = new.target_ref
             and reason <> 'closed') x;

  select coalesce(sum(public.peso_reporte(x.uid)), 0) into p_closed
    from (select distinct created_by as uid from public.reports
           where kind = new.kind and target_ref = new.target_ref
             and reason = 'closed') x;

  if new.kind = 'toilet' then
    if p >= 4 or p_closed >= 4 then
      -- 1) Si el baño es nuestro, se marca en la tabla
      update public.toilets
         set status = case when p >= 4 then 'hidden' else 'closed' end,
             hidden_at = now(),
             hidden_reason = case when p >= 4 then 'reportado por la comunidad'
                                  else 'cerrado según la comunidad' end
       where coalesce(osm_ref, 'db:' || id::text) = new.target_ref
         and status = 'active';
      get diagnostics existe = row_count;

      -- 2) Sea nuestro o de OSM, se anota la supresión. El cliente la aplica
      --    sobre lo que descarga de Overpass.
      insert into public.suppressions (ref, reason)
      values (new.target_ref,
              case when p >= 4 then 'reportado por la comunidad'
                   else 'cerrado según la comunidad' end)
      on conflict (ref) do nothing;
    end if;
  else
    if p >= 4 then
      update public.reviews
         set status = 'hidden', hidden_at = now(),
             hidden_reason = 'reportada por la comunidad'
       where id::text = new.target_ref and status = 'visible';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_reports on public.reports;
create trigger trg_apply_reports after insert on public.reports
  for each row execute function public.apply_reports();

-- Retirar lo propio también levanta la supresión correspondiente
create or replace function public.retract(p_kind text, p_ref text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid; hit int := 0;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Necesitas una sesión abierta'; end if;

  if p_kind = 'toilet' then
    update public.toilets
       set status = 'hidden', hidden_at = now(), hidden_reason = 'retirado por su autor'
     where coalesce(osm_ref, 'db:' || id::text) = p_ref
       and created_by = uid and status = 'active';
    get diagnostics hit = row_count;
    if hit > 0 then
      insert into public.suppressions (ref, reason)
      values (p_ref, 'retirado por su autor') on conflict (ref) do nothing;
    end if;
  elsif p_kind = 'review' then
    update public.reviews
       set status = 'hidden', hidden_at = now(), hidden_reason = 'retirada por su autor'
     where id::text = p_ref and created_by = uid and status = 'visible';
    get diagnostics hit = row_count;
  end if;
  return hit > 0;
end $$;

-- ═══ A-01 · LA DISTANCIA LA CALCULA EL SERVIDOR ════════════════════════
-- Antes: el móvil declaraba dist_m y el servidor se lo creía. Ahora las
-- coordenadas entran como argumento, se usan para medir, y MUEREN AL
-- TERMINAR LA TRANSACCIÓN. No se escriben en ninguna tabla.

create or replace function public.add_review(
  p_ref        text,
  p_rating     smallint,
  p_clean      smallint    default null,
  p_attrs      jsonb       default '{}'::jsonb,
  p_comment    text        default null,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_toilet_lat double precision default null,   -- para baños que sólo viven en OSM
  p_toilet_lng double precision default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare g_user geography; g_toilet geography; d numeric; new_id uuid;
begin
  if auth.uid() is null then raise exception 'Necesitas una sesión abierta'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Valoración fuera de rango';
  end if;

  select t.geom into g_toilet from public.toilets t
   where coalesce(t.osm_ref, 'db:' || t.id::text) = p_ref and t.status = 'active';

  if g_toilet is null and p_toilet_lat is not null and p_toilet_lng is not null then
    g_toilet := st_setsrid(st_makepoint(p_toilet_lng, p_toilet_lat), 4326)::geography;
  end if;

  if p_lat is not null and p_lng is not null and g_toilet is not null then
    g_user := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
    d := round(st_distance(g_user, g_toilet)::numeric, 1);
  end if;

  insert into public.reviews (toilet_ref, rating, clean, attrs, comment, dist_m)
  values (p_ref, p_rating, p_clean, coalesce(p_attrs, '{}'::jsonb),
          left(p_comment, 300), d)
  returning id into new_id;

  return new_id;   -- g_user se descarta aquí. Nunca se persiste.
end $$;

-- La vía directa se cierra: ya no se puede insertar una reseña declarando
-- uno mismo la distancia.
revoke insert on public.reviews from authenticated, anon;
grant execute on function public.add_review(
  text, smallint, smallint, jsonb, text,
  double precision, double precision, double precision, double precision
) to authenticated;

-- Cinturón además de tirantes: si algún día se reabre el insert directo,
-- una distancia declarada por el cliente no otorga verificación.
create or replace function public.guard_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Necesitas una sesión abierta para publicar';
  end if;

  new.created_by := uid;
  new.device_id  := coalesce(new.device_id, uid::text);
  new.status     := 'visible';
  new.hidden_at  := null;
  new.verified   := (new.dist_m is not null and new.dist_m <= 150);

  select count(*) into n from public.reviews
    where created_by = uid and created_at > now() - interval '1 hour';
  if n >= 12 then
    raise exception 'Has alcanzado el límite de reseñas por hora';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_review on public.reviews;
create trigger trg_guard_review before insert on public.reviews
  for each row execute function public.guard_review();

-- ═══ ALTA-09 · EL HUECO DE 15 m NO SE LIBERA AL OCULTAR ════════════════
-- Si no, el spam entra en bucle: publicar → lo ocultan → republicar.

create or replace function public.guard_toilet() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; dup int; uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Necesitas una sesión abierta para publicar';
  end if;

  new.created_by := uid;
  new.device_id  := coalesce(new.device_id, uid::text);
  new.status     := coalesce(new.status, 'active');
  new.hidden_at  := null;

  select count(*) into n from public.toilets
    where created_by = uid and created_at > now() - interval '1 hour';
  if n >= 6 then
    raise exception 'Has alcanzado el límite de altas por hora';
  end if;

  select count(*) into dup from public.toilets
    where st_dwithin(geom, new.geom, 15)
      and (status = 'active'
        or (status in ('hidden','closed') and hidden_at > now() - interval '90 days'));
  if dup > 0 then
    raise exception 'Ya hay un baño registrado a menos de 15 metros';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_toilet on public.toilets;
create trigger trg_guard_toilet before insert on public.toilets
  for each row execute function public.guard_toilet();

-- ═══ MEDIA-04 · HUSO HORARIO EN EL LÍMITE DIARIO ═══════════════════════
-- created_at::date evalúa en UTC. En Bilbao, entre las 00:00 y las 02:00
-- la fecha UTC es la de ayer: se podía reseñar dos veces la misma noche.

drop index if exists public.reviews_one_per_day_user;
create unique index if not exists reviews_one_per_day_local
  on public.reviews
  (toilet_ref, created_by, ((created_at at time zone 'Europe/Madrid')::date));

-- ═══ MEDIA-06 · RESEÑAS REPARTIDAS, NO POR ORDEN GLOBAL ════════════════
-- Antes, un baño con 400 reseñas se comía el límite de 500 y los otros 59
-- volvían vacíos, mostrando "sin confirmar" sobre datos que sí existen.

create or replace function public.reviews_for(refs text[])
returns table (
  id text, toilet_ref text, rating smallint, clean smallint, attrs jsonb,
  comment text, verified boolean, created_at timestamptz, mine boolean
)
language sql stable set search_path = public as $$
  select x.id, x.toilet_ref, x.rating, x.clean, x.attrs,
         x.comment, x.verified, x.created_at, x.mine
  from (
    select r.id::text as id, r.toilet_ref, r.rating, r.clean, r.attrs,
           r.comment, r.verified, r.created_at,
           (r.created_by is not distinct from auth.uid()) as mine,
           row_number() over (partition by r.toilet_ref
                              order by r.created_at desc) as rn
    from public.reviews r
    where r.toilet_ref = any(refs) and r.status = 'visible'
  ) x
  where x.rn <= 8;
$$;
grant execute on function public.reviews_for(text[]) to anon, authenticated;

-- ═══ MEDIA-03 · LA VISTA DE MODERACIÓN NO SALTA EL RLS ═════════════════
-- Una vista se ejecuta con permisos de su propietario salvo que se diga
-- lo contrario. Hoy sólo la protegen los permisos; eso es una sola barrera.

create or replace view public.mod_queue as
select rp.kind, rp.target_ref,
       count(distinct rp.created_by)                       as reportes,
       coalesce(sum(public.peso_reporte(rp.created_by)), 0) as peso,
       array_agg(distinct rp.reason)                       as motivos,
       max(rp.created_at)                                  as ultimo,
       case when rp.kind = 'toilet'
            then coalesce((select t.status from public.toilets t
                            where coalesce(t.osm_ref,'db:'||t.id::text) = rp.target_ref),
                          case when exists (select 1 from public.suppressions s
                                             where s.ref = rp.target_ref)
                               then 'suprimido (OSM)' else 'visible (OSM)' end)
            else (select r.status from public.reviews r
                   where r.id::text = rp.target_ref) end   as estado_actual
from public.reports rp
group by rp.kind, rp.target_ref
order by 4 desc, 6 desc;

alter view public.mod_queue set (security_invoker = on);
revoke all on public.mod_queue from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  REPONER algo ocultado por error, desde el SQL Editor:
--    delete from public.suppressions where ref = 'osm:node/123';
--    update public.toilets set status='active', hidden_at=null where id='...';
--    update public.reviews set status='visible', hidden_at=null where id='...';
--    delete from public.reports where target_ref = '...';   -- limpia la cuenta
--
--  COMPROBACIÓN. Esto debe fallar ("Necesitas una sesión abierta"):
--    select public.add_review('db:00000000-0000-0000-0000-000000000000', 5::smallint);
-- ═══════════════════════════════════════════════════════════════════════
