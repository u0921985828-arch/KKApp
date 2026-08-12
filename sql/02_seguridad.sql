-- ═══════════════════════════════════════════════════════════════════════
--  CERCA · Migración 02 · Identidad, reportes y borrado suave
--
--  Pégala entera en Supabase → SQL Editor → Run. Es idempotente: puedes
--  volver a ejecutarla sin romper nada ni perder datos.
--
--  ANTES DE EJECUTARLA, activa el inicio de sesión anónimo:
--     Authentication → Sign In / Providers → Anonymous sign-ins → ON
--  Si no lo haces, la app podrá LEER pero no PUBLICAR.
--
--  Qué cambia respecto al esquema inicial:
--   1. Cada alta y cada reseña quedan firmadas por el servidor (auth.uid()),
--      no por un device_id que el cliente puede falsificar.
--   2. Hay reportes: la comunidad puede marcar un baño falso o una reseña
--      ofensiva, y a los 3 reportes distintos se oculta solo.
--   3. Nada se borra nunca. Ocultar es cambiar un estado; todo recuperable.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ─────────────────────── 1. COLUMNAS NUEVAS ───────────────────────────

alter table public.toilets add column if not exists created_by    uuid references auth.users(id) on delete set null;
alter table public.toilets add column if not exists hidden_at     timestamptz;
alter table public.toilets add column if not exists hidden_reason text;
alter table public.toilets alter column device_id drop not null;

alter table public.reviews add column if not exists created_by    uuid references auth.users(id) on delete set null;
alter table public.reviews add column if not exists status        text not null default 'visible';
alter table public.reviews add column if not exists hidden_at     timestamptz;
alter table public.reviews add column if not exists hidden_reason text;
alter table public.reviews alter column device_id drop not null;

do $$ begin
  alter table public.reviews
    add constraint reviews_status_chk check (status in ('visible','hidden'));
exception when duplicate_object then null; end $$;

create index if not exists toilets_owner_idx on public.toilets (created_by, created_at desc);
create index if not exists reviews_owner_idx on public.reviews (created_by, created_at desc);
create index if not exists reviews_visible_idx on public.reviews (toilet_ref, created_at desc)
  where status = 'visible';

-- Una reseña por baño y persona al día (antes era por dispositivo)
drop index if exists public.reviews_one_per_day;
create unique index if not exists reviews_one_per_day_user
  on public.reviews (toilet_ref, created_by, ((created_at at time zone 'Europe/Madrid')::date));

-- ─────────────────────── 2. TABLA DE REPORTES ─────────────────────────

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('toilet','review')),
  target_ref  text not null,        -- 'db:<uuid>' | 'osm:node/123' | <uuid de reseña>
  reason      text not null check (reason in ('fake','closed','dirty','offensive','private','dup','other')),
  detail      text check (char_length(detail) <= 300),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Una persona, un reporte por elemento. Impide inflar la cuenta uno mismo.
create unique index if not exists reports_one_per_user
  on public.reports (kind, target_ref, created_by);

create index if not exists reports_target_idx on public.reports (kind, target_ref);

-- ───────────────── 3. AUTO-OCULTADO POR REPORTES ──────────────────────
-- 3 personas distintas → se oculta. 'closed' no oculta: marca cerrado.

create or replace function public.apply_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; n_closed int; uid_col uuid;
begin
  select count(distinct created_by) into n
    from public.reports
    where kind = new.kind and target_ref = new.target_ref
      and reason <> 'closed';

  select count(distinct created_by) into n_closed
    from public.reports
    where kind = new.kind and target_ref = new.target_ref
      and reason = 'closed';

  if new.kind = 'toilet' then
    if n >= 3 then
      update public.toilets set status = 'hidden', hidden_at = now(),
             hidden_reason = 'reportado por la comunidad'
       where coalesce(osm_ref, 'db:' || id::text) = new.target_ref
         and status = 'active';
    elsif n_closed >= 3 then
      update public.toilets set status = 'closed', hidden_at = now(),
             hidden_reason = 'cerrado según la comunidad'
       where coalesce(osm_ref, 'db:' || id::text) = new.target_ref
         and status = 'active';
    end if;
  else
    if n >= 3 then
      update public.reviews set status = 'hidden', hidden_at = now(),
             hidden_reason = 'reportada por la comunidad'
       where id::text = new.target_ref and status = 'visible';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_reports on public.reports;
create trigger trg_apply_reports after insert on public.reports
  for each row execute function public.apply_reports();

-- ──────────── 4. GUARDIAS: la identidad la pone el servidor ───────────

create or replace function public.guard_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Necesitas una sesión abierta para publicar';
  end if;

  -- Nada de esto lo decide el cliente
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
    where status = 'active' and st_dwithin(geom, new.geom, 15);
  if dup > 0 then
    raise exception 'Ya hay un baño registrado a menos de 15 metros';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_toilet on public.toilets;
create trigger trg_guard_toilet before insert on public.toilets
  for each row execute function public.guard_toilet();

create or replace function public.guard_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Necesitas una sesión abierta para reportar';
  end if;
  new.created_by := uid;

  select count(*) into n from public.reports
    where created_by = uid and created_at > now() - interval '1 hour';
  if n >= 20 then
    raise exception 'Has alcanzado el límite de reportes por hora';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_report on public.reports;
create trigger trg_guard_report before insert on public.reports
  for each row execute function public.guard_report();

-- ───────────────────── 5. SEGURIDAD (RLS) ─────────────────────────────
-- Leer: cualquiera, incluso sin sesión (la app abre y funciona al instante).
-- Escribir: sólo con sesión, y siempre firmando con la propia identidad.
-- UPDATE y DELETE: SIGUEN SIN POLÍTICA. Nadie borra ni modifica nada.

alter table public.toilets enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;

drop policy if exists toilets_read   on public.toilets;
drop policy if exists toilets_insert on public.toilets;
drop policy if exists reviews_read   on public.reviews;
drop policy if exists reviews_insert on public.reviews;
drop policy if exists reports_insert on public.reports;
drop policy if exists reports_read   on public.reports;

create policy toilets_read on public.toilets
  for select to anon, authenticated using (status = 'active');

create policy toilets_insert on public.toilets
  for insert to authenticated with check (auth.uid() is not null and created_by = auth.uid());

create policy reviews_read on public.reviews
  for select to anon, authenticated using (status = 'visible');

create policy reviews_insert on public.reviews
  for insert to authenticated with check (auth.uid() is not null and created_by = auth.uid());

create policy reports_insert on public.reports
  for insert to authenticated with check (auth.uid() is not null and created_by = auth.uid());

-- Cada cual ve sólo sus propios reportes. La cola de moderación es del panel.
create policy reports_read on public.reports
  for select to authenticated using (created_by = auth.uid());

revoke insert on public.toilets, public.reviews from anon;
grant  usage  on schema public to anon, authenticated;
grant  select on public.toilets, public.reviews to anon, authenticated;
grant  insert on public.toilets, public.reviews to authenticated;
grant  select, insert on public.reports to authenticated;

-- ─────────────── 6. RETIRAR LO PROPIO (borrado suave) ─────────────────
-- No borra la fila: la marca oculta. Sólo funciona sobre lo tuyo.

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
  elsif p_kind = 'review' then
    update public.reviews
       set status = 'hidden', hidden_at = now(), hidden_reason = 'retirada por su autor'
     where id::text = p_ref and created_by = uid and status = 'visible';
    get diagnostics hit = row_count;
  end if;

  return hit > 0;
end $$;

create or replace function public.report_item(
  p_kind text, p_ref text, p_reason text, p_detail text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas una sesión abierta'; end if;
  insert into public.reports (kind, target_ref, reason, detail)
  values (p_kind, p_ref, p_reason, left(coalesce(p_detail, ''), 300))
  on conflict (kind, target_ref, created_by) do nothing;
  return true;
end $$;

-- ─────────────── 7. CONSULTAS ACTUALIZADAS (RPC) ──────────────────────
-- Sólo cuentan las reseñas visibles y los baños activos.
-- Cambian el tipo de retorno respecto a la 01 (columna mine), y Postgres
-- no permite eso con create or replace: hay que soltarlas primero.

drop function if exists public.toilets_nearby(double precision, double precision, integer);
drop function if exists public.reviews_for(text[]);

create or replace function public.toilets_nearby(
  lat double precision, lng double precision, radius_m integer default 1600
)
returns table (
  ref text, name text, lat_out double precision, lon_out double precision,
  free boolean, acc boolean, baby boolean, h24 boolean, entry text, note text,
  dist_m double precision, rating numeric, n_reviews integer,
  last_review timestamptz, mine boolean
)
language sql stable set search_path = public as $$
  with p as (select st_setsrid(st_makepoint(lng, lat), 4326)::geography as g)
  select
    coalesce(t.osm_ref, 'db:' || t.id::text),
    t.name,
    st_y(t.geom::geometry), st_x(t.geom::geometry),
    t.free, t.acc, t.baby, t.h24, t.entry, t.note,
    st_distance(t.geom, p.g),
    r.avg_rating, coalesce(r.n, 0), r.last_ts,
    (t.created_by is not distinct from auth.uid())
  from public.toilets t
  cross join p
  left join lateral (
    select round(avg(rv.rating)::numeric, 1) as avg_rating,
           count(*)::int as n, max(rv.created_at) as last_ts
    from public.reviews rv
    where rv.toilet_ref = coalesce(t.osm_ref, 'db:' || t.id::text)
      and rv.status = 'visible'
  ) r on true
  where t.status = 'active' and st_dwithin(t.geom, p.g, radius_m)
  order by 11
  limit 200;
$$;

-- Reseñas de una tanda de baños. No expone quién las escribió: sólo si
-- son tuyas, para poder retirarlas.
create or replace function public.reviews_for(refs text[])
returns table (
  id text, toilet_ref text, rating smallint, clean smallint, attrs jsonb,
  comment text, verified boolean, created_at timestamptz, mine boolean
)
language sql stable set search_path = public as $$
  select r.id::text, r.toilet_ref, r.rating, r.clean, r.attrs,
         r.comment, r.verified, r.created_at,
         (r.created_by is not distinct from auth.uid())
  from public.reviews r
  where r.toilet_ref = any(refs) and r.status = 'visible'
  order by r.created_at desc
  limit 500;
$$;

-- El alta ya no acepta identidad del cliente: la pone el servidor.
create or replace function public.add_toilet(
  p_name text, p_lat double precision, p_lng double precision,
  p_free boolean default null, p_acc boolean default null,
  p_baby boolean default null, p_h24 boolean default null,
  p_entry text default null, p_note text default null,
  p_device text default null, p_osm_ref text default null
) returns text
language plpgsql security invoker set search_path = public as $$
declare new_id uuid;
begin
  insert into public.toilets (osm_ref, name, geom, free, acc, baby, h24, entry, note)
  values (p_osm_ref, p_name,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
          p_free, p_acc, p_baby, p_h24, p_entry, p_note)
  returning id into new_id;
  return coalesce(p_osm_ref, 'db:' || new_id::text);
end $$;

grant execute on function public.toilets_nearby(double precision, double precision, integer) to anon, authenticated;
grant execute on function public.reviews_for(text[]) to anon, authenticated;
grant execute on function public.add_toilet(text, double precision, double precision, boolean, boolean, boolean, boolean, text, text, text, text) to authenticated;
grant execute on function public.report_item(text, text, text, text) to authenticated;
grant execute on function public.retract(text, text) to authenticated;

revoke execute on function public.add_toilet(text, double precision, double precision, boolean, boolean, boolean, boolean, text, text, text, text) from anon;

-- ───────────────── 8. COLA DE MODERACIÓN (sólo tú) ────────────────────
-- Se consulta desde el panel de Supabase, con service_role. Ni anon ni
-- authenticated pueden verla.

create or replace view public.mod_queue as
select rp.kind, rp.target_ref,
       count(distinct rp.created_by)                       as reportes,
       array_agg(distinct rp.reason)                       as motivos,
       max(rp.created_at)                                  as ultimo,
       case when rp.kind = 'toilet'
            then (select t.status from public.toilets t
                   where coalesce(t.osm_ref,'db:'||t.id::text) = rp.target_ref)
            else (select r.status from public.reviews r
                   where r.id::text = rp.target_ref) end   as estado_actual
from public.reports rp
group by rp.kind, rp.target_ref
order by 3 desc, 5 desc;

revoke all on public.mod_queue from anon, authenticated;

-- Para reponer algo ocultado por error, desde el SQL Editor:
--   update public.toilets set status='active', hidden_at=null where id='...';
--   update public.reviews set status='visible', hidden_at=null where id='...';
--   delete from public.reports where target_ref='...';   -- limpia la cuenta

-- ═══════════════════════════════════════════════════════════════════════
--  COMPROBACIÓN RÁPIDA (opcional). Debe devolver 0 filas:
--    select * from public.mod_queue;
--  Y esto debe fallar con "Necesitas una sesión abierta", que es lo correcto:
--    select public.add_toilet('prueba', 43.26, -2.93);
-- ═══════════════════════════════════════════════════════════════════════
