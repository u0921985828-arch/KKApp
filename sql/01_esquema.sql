-- ═══════════════════════════════════════════════════════════════════════
--  CERCA · Esquema de base de datos
--  Pégalo entero en Supabase → SQL Editor → Run. Es idempotente:
--  puedes volver a ejecutarlo sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ───────────────────────────── TABLAS ─────────────────────────────────

create table if not exists public.toilets (
  id          uuid primary key default gen_random_uuid(),
  osm_ref     text unique,                          -- 'osm:node/123' si nació en OSM
  name        text not null check (char_length(name) between 2 and 90),
  geom        geography(point, 4326) not null,
  free        boolean,
  acc         boolean,                              -- accesible en silla de ruedas
  baby        boolean,                              -- cambiador
  h24         boolean,
  entry       text check (entry in ('open','cust','shut')),
  note        text check (char_length(note) <= 300),
  status      text not null default 'active'
              check (status in ('active','closed','hidden')),
  device_id   text not null,                        -- identificador de dispositivo
  created_at  timestamptz not null default now()
);

create index if not exists toilets_geom_idx   on public.toilets using gist (geom);
create index if not exists toilets_status_idx on public.toilets (status) where status = 'active';

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  toilet_ref  text not null,                        -- 'osm:node/123' | 'db:<uuid>'
  rating      smallint not null check (rating between 1 and 5),
  clean       smallint check (clean between 1 and 5),
  attrs       jsonb not null default '{}'::jsonb,
  comment     text check (char_length(comment) <= 300),
  verified    boolean not null default false,       -- reseñada a <=150 m del baño
  dist_m      numeric(8,1),
  device_id   text not null,
  created_at  timestamptz not null default now()
);

create index if not exists reviews_ref_idx on public.reviews (toilet_ref, created_at desc);

-- Una reseña por baño, dispositivo y día (día local; ::date a secas no es
-- inmutable y Postgres lo rechaza en un índice)
create unique index if not exists reviews_one_per_day
  on public.reviews (toilet_ref, device_id, ((created_at at time zone 'Europe/Madrid')::date));

-- ─────────────────────── ANTI-SPAM (triggers) ─────────────────────────
-- Sin cuentas de usuario, el freno es el dispositivo + los límites por hora.
-- Cuando actives Supabase Auth, sustituye device_id por auth.uid().

create or replace function public.guard_review() returns trigger
language plpgsql security definer as $$
declare n int;
begin
  if new.device_id is null or char_length(new.device_id) < 10 then
    raise exception 'device_id no válido';
  end if;
  select count(*) into n from public.reviews
    where device_id = new.device_id and created_at > now() - interval '1 hour';
  if n >= 12 then
    raise exception 'Has alcanzado el límite de reseñas por hora';
  end if;
  -- La verificación de visita no la decide el cliente
  new.verified := (new.dist_m is not null and new.dist_m <= 150);
  return new;
end $$;

drop trigger if exists trg_guard_review on public.reviews;
create trigger trg_guard_review before insert on public.reviews
  for each row execute function public.guard_review();

create or replace function public.guard_toilet() returns trigger
language plpgsql security definer as $$
declare n int; dup int;
begin
  if new.device_id is null or char_length(new.device_id) < 10 then
    raise exception 'device_id no válido';
  end if;
  select count(*) into n from public.toilets
    where device_id = new.device_id and created_at > now() - interval '1 hour';
  if n >= 6 then
    raise exception 'Has alcanzado el límite de altas por hora';
  end if;
  -- Duplicados: ya hay un baño a menos de 15 m
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

-- ──────────────────────── SEGURIDAD (RLS) ─────────────────────────────

alter table public.toilets enable row level security;
alter table public.reviews enable row level security;

drop policy if exists toilets_read   on public.toilets;
drop policy if exists toilets_insert on public.toilets;
drop policy if exists reviews_read   on public.reviews;
drop policy if exists reviews_insert on public.reviews;

create policy toilets_read   on public.toilets for select using (status = 'active');
create policy toilets_insert on public.toilets for insert with check (true);
create policy reviews_read   on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert with check (true);
-- Nadie puede UPDATE ni DELETE: no hay política para ellos, así que RLS los bloquea.

grant usage on schema public to anon, authenticated;
grant select, insert on public.toilets, public.reviews to anon, authenticated;

-- ─────────────────── CONSULTA PRINCIPAL (RPC) ─────────────────────────
-- Baños cercanos con su valoración agregada, en una sola llamada.

create or replace function public.toilets_nearby(
  lat        double precision,
  lng        double precision,
  radius_m   integer default 1600
)
returns table (
  ref         text,
  name        text,
  lat_out     double precision,
  lon_out     double precision,
  free        boolean,
  acc         boolean,
  baby        boolean,
  h24         boolean,
  entry       text,
  note        text,
  dist_m      double precision,
  rating      numeric,
  n_reviews   integer,
  last_review timestamptz
)
language sql stable as $$
  with p as (
    select st_setsrid(st_makepoint(lng, lat), 4326)::geography as g
  )
  select
    coalesce(t.osm_ref, 'db:' || t.id::text),
    t.name,
    st_y(t.geom::geometry),
    st_x(t.geom::geometry),
    t.free, t.acc, t.baby, t.h24, t.entry, t.note,
    st_distance(t.geom, p.g),
    r.avg_rating,
    coalesce(r.n, 0),
    r.last_ts
  from public.toilets t
  cross join p
  left join lateral (
    select round(avg(rv.rating)::numeric, 1) as avg_rating,
           count(*)::int                     as n,
           max(rv.created_at)                as last_ts
    from public.reviews rv
    where rv.toilet_ref = coalesce(t.osm_ref, 'db:' || t.id::text)
  ) r on true
  where t.status = 'active'
    and st_dwithin(t.geom, p.g, radius_m)
  order by 11
  limit 200;
$$;

-- Alta de baño: la función construye la geometría, el cliente solo manda lat/lng.
create or replace function public.add_toilet(
  p_name text, p_lat double precision, p_lng double precision,
  p_free boolean default null, p_acc boolean default null,
  p_baby boolean default null, p_h24 boolean default null,
  p_entry text default null, p_note text default null,
  p_device text default null, p_osm_ref text default null
) returns text
language plpgsql security invoker as $$
declare new_id uuid;
begin
  insert into public.toilets (osm_ref, name, geom, free, acc, baby, h24, entry, note, device_id)
  values (p_osm_ref, p_name,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
          p_free, p_acc, p_baby, p_h24, p_entry, p_note, p_device)
  returning id into new_id;
  return coalesce(p_osm_ref, 'db:' || new_id::text);
end $$;

-- Reseñas de una lista de baños (para pintar la ficha y las medias de OSM)
create or replace function public.reviews_for(refs text[])
returns setof public.reviews
language sql stable as $$
  select * from public.reviews
  where toilet_ref = any(refs)
  order by created_at desc
  limit 500;
$$;

grant execute on function public.toilets_nearby(double precision, double precision, integer) to anon, authenticated;
grant execute on function public.add_toilet(text, double precision, double precision, boolean, boolean, boolean, boolean, text, text, text, text) to anon, authenticated;
grant execute on function public.reviews_for(text[]) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- SIGUIENTE PASO cuando haya volumen: activar Supabase Auth (incluido el
-- inicio de sesión anónimo), añadir created_by uuid references auth.users,
-- y cambiar las políticas de insert a:
--     with check (auth.uid() = created_by)
-- El resto del esquema no cambia.
-- ═══════════════════════════════════════════════════════════════════════
