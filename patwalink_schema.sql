-- ============================================================
-- PatwaLink — Esquema Supabase v1
-- Glosario colaborativo Patois <-> ES/EN con contexto cultural
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";     -- búsqueda difusa (ortografía no estandarizada)
create extension if not exists "unaccent";

-- ============================================================
-- 1. NORMALIZACIÓN ORTOGRÁFICA
-- El patois no tiene ortografía única. "wah gwaan" / "wagwan" /
-- "whagwan" / "wa gwan" son la MISMA frase. Esta función colapsa
-- las variantes a una clave canónica para búsqueda y deduplicación.
-- ============================================================

create or replace function patwa_normalize(txt text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(
      lower(unaccent(coalesce(txt, ''))),
      '''`´’-.,!?¡¿"()',
      ''
    ),
    '\s+', '', 'g'
  )
$$;

-- Normalización fonética: colapsa los rasgos regulares del criollo
-- jamaicano frente a la ortografía inglesa.
create or replace function patwa_phonetic_key(txt text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := patwa_normalize(txt);

  -- th -> d/t  (them->dem, thing->ting)
  s := replace(s, 'th', 'd');
  -- h inicial inestable (h-dropping / h-insertion): hungry~ungry
  s := regexp_replace(s, '^h', '', 'g');
  -- dígrafos vocálicos a vocal simple (gwaan->gwan, deh->de)
  s := replace(s, 'aa', 'a');
  s := replace(s, 'ee', 'e');
  s := replace(s, 'oo', 'u');
  s := replace(s, 'ou', 'u');
  s := replace(s, 'ow', 'u');
  s := replace(s, 'eh', 'e');
  s := replace(s, 'ah', 'a');
  -- wh -> w  (whagwan -> wagwan)
  s := replace(s, 'wh', 'w');
  -- consonantes dobles
  s := regexp_replace(s, '(.)\1', '\1', 'g');
  -- -er / -a finales equivalentes (bredder ~ bredda)
  s := regexp_replace(s, 'er$', 'a', 'g');

  return s;
end;
$$;

-- ============================================================
-- 2. PERFILES Y REPUTACIÓN
-- Mismo patrón que CERCA: auth anónima + reputación ponderada.
-- native_speaker se otorga manualmente o por validación de pares.
-- ============================================================

create table profiles (
  id              uuid primary key references auth.users on delete cascade,
  display_name    text,
  reputation      integer not null default 1 check (reputation >= 0),
  native_speaker  boolean not null default false,
  parish          text,                 -- Kingston, St. Ann, Westmoreland...
  diaspora_region text,                 -- London, Toronto, NYC...
  created_at      timestamptz not null default now()
);

-- Peso de voto: los nativos pesan más, con techo para evitar
-- que una sola cuenta domine el consenso.
create or replace function vote_weight(p_user uuid)
returns numeric
language sql
stable
as $$
  select least(
    5.0,
    (case when native_speaker then 3.0 else 1.0 end)
      * (1 + ln(greatest(reputation, 1)))
  )
  from profiles where id = p_user
$$;

-- ============================================================
-- 3. ENTRADAS DEL GLOSARIO
-- Una entrada = un lema en patois. La ortografía canónica sigue
-- el sistema Cassidy-JLU de la UWI cuando existe.
-- ============================================================

create type entry_status as enum ('draft', 'published', 'disputed', 'rejected');

create table entries (
  id            uuid primary key default gen_random_uuid(),
  headword      text not null,                    -- forma canónica: "wah gwaan"
  norm_key      text generated always as (patwa_normalize(headword)) stored,
  phon_key      text generated always as (patwa_phonetic_key(headword)) stored,
  pos           text,                             -- sustantivo, verbo, interjección, frase
  etymology     text,                             -- akan, twi, inglés, español, yoruba...
  status        entry_status not null default 'draft',
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index entries_norm_key_uniq on entries(norm_key);
create index entries_phon_key_idx on entries(phon_key);
create index entries_headword_trgm on entries using gin (headword gin_trgm_ops);
create index entries_status_idx on entries(status) where status = 'published';

-- ============================================================
-- 4. VARIANTES ORTOGRÁFICAS
-- Todas las grafías atestiguadas de la misma entrada.
-- Es lo que hace que la búsqueda funcione de verdad.
-- ============================================================

create table entry_variants (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references entries(id) on delete cascade,
  spelling   text not null,
  norm_key   text generated always as (patwa_normalize(spelling)) stored,
  source     text,          -- 'uwi', 'social', 'lyrics', 'user'
  created_at timestamptz not null default now()
);

create unique index entry_variants_uniq on entry_variants(entry_id, norm_key);
create index entry_variants_norm_idx on entry_variants(norm_key);
create index entry_variants_trgm on entry_variants using gin (spelling gin_trgm_ops);

-- ============================================================
-- 5. ACEPCIONES (polisemia + registro social)
-- El núcleo del producto. Una frase, varios significados según
-- contexto y tono. Aquí es donde ganas a Google Translate.
-- ============================================================

create type register_level as enum (
  'neutral',        -- uso general
  'informal',       -- entre iguales, bredren
  'intimate',       -- familia, pareja
  'vulgar',         -- palabrota; incluye el uso como intensificador
  'respectful',     -- a mayores, autoridad
  'rasta',          -- lenguaje Iyaric / Dread Talk
  'dancehall',      -- jerga de escena musical
  'archaic'
);

create table entry_senses (
  id             uuid primary key default gen_random_uuid(),
  entry_id       uuid not null references entries(id) on delete cascade,
  sense_order    smallint not null default 1,
  gloss_en       text not null,
  gloss_es       text not null,
  register       register_level not null default 'neutral',

  -- El campo que justifica la app:
  cultural_note  text,     -- por qué se dice así, a quién SÍ y a quién NO
  usage_warning  text,     -- riesgo de ofender / malinterpretar
  tone_note      text,     -- cómo cambia con la entonación

  literal_en     text,     -- descomposición literal si ayuda
  confidence     numeric(3,2) not null default 0.50
                   check (confidence between 0 and 1),
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create unique index entry_senses_order_uniq on entry_senses(entry_id, sense_order);
create index entry_senses_entry_idx on entry_senses(entry_id);

-- ============================================================
-- 6. EJEMPLOS DE USO
-- Sin letras de canciones con copyright: solo frases originales
-- o de dominio público. Guarda la fuente para poder auditarlo.
-- ============================================================

create table sense_examples (
  id           uuid primary key default gen_random_uuid(),
  sense_id     uuid not null references entry_senses(id) on delete cascade,
  patois_text  text not null,
  translation_es text,
  translation_en text,
  context_note text,        -- "saludo a un desconocido en la calle"
  source_type  text not null default 'original'
                 check (source_type in ('original','public_domain','user_submitted')),
  created_at   timestamptz not null default now()
);

create index sense_examples_sense_idx on sense_examples(sense_id);

-- ============================================================
-- 7. AUDIO (pronunciación por hablantes nativos)
-- Ficheros en Supabase Storage; aquí solo la referencia.
-- ============================================================

create table sense_audio (
  id            uuid primary key default gen_random_uuid(),
  sense_id      uuid not null references entry_senses(id) on delete cascade,
  storage_path  text not null,
  speaker_id    uuid references profiles(id) on delete set null,
  parish        text,
  duration_ms   integer,
  approved      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index sense_audio_sense_idx on sense_audio(sense_id);

-- ============================================================
-- 8. CONTRIBUCIONES Y VOTOS PONDERADOS
-- Nadie edita directamente. Todo pasa por propuesta + consenso.
-- ============================================================

create type suggestion_kind as enum ('new_entry','edit_sense','new_variant','new_example','flag_error');
create type suggestion_status as enum ('pending','accepted','rejected');

create table suggestions (
  id          uuid primary key default gen_random_uuid(),
  kind        suggestion_kind not null,
  entry_id    uuid references entries(id) on delete cascade,
  sense_id    uuid references entry_senses(id) on delete cascade,
  payload     jsonb not null,          -- contenido propuesto
  rationale   text,
  status      suggestion_status not null default 'pending',
  score       numeric(6,2) not null default 0,
  author_id   uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index suggestions_status_idx on suggestions(status) where status = 'pending';
create index suggestions_entry_idx on suggestions(entry_id);

create table suggestion_votes (
  suggestion_id uuid not null references suggestions(id) on delete cascade,
  voter_id      uuid not null references profiles(id) on delete cascade,
  value         smallint not null check (value in (-1, 1)),
  weight        numeric(4,2) not null,
  created_at    timestamptz not null default now(),
  primary key (suggestion_id, voter_id)
);

-- Recalcula el score y auto-resuelve al cruzar el umbral.
create or replace function recalc_suggestion_score()
returns trigger
language plpgsql
security definer
as $$
declare
  new_score numeric;
  sid uuid;
begin
  sid := coalesce(new.suggestion_id, old.suggestion_id);

  select coalesce(sum(value * weight), 0) into new_score
  from suggestion_votes where suggestion_id = sid;

  update suggestions
     set score = new_score,
         status = case
           when new_score >=  6 then 'accepted'::suggestion_status
           when new_score <= -4 then 'rejected'::suggestion_status
           else status
         end,
         resolved_at = case
           when new_score >= 6 or new_score <= -4 then now()
           else resolved_at
         end
   where id = sid and status = 'pending';

  -- Reputación al autor cuando se acepta
  update profiles p
     set reputation = p.reputation + 2
    from suggestions s
   where s.id = sid and s.status = 'accepted'
     and s.resolved_at > now() - interval '1 second'
     and p.id = s.author_id;

  return null;
end;
$$;

create trigger trg_recalc_score
after insert or update or delete on suggestion_votes
for each row execute function recalc_suggestion_score();

-- Fija el peso del voto en el servidor: el cliente no lo decide.
create or replace function set_vote_weight()
returns trigger
language plpgsql
security definer
as $$
begin
  new.weight := vote_weight(new.voter_id);
  return new;
end;
$$;

create trigger trg_set_vote_weight
before insert or update on suggestion_votes
for each row execute function set_vote_weight();

-- ============================================================
-- 9. BÚSQUEDA
-- Cascada: exacta normalizada -> fonética -> trigrama difuso.
-- Devuelve la entrada con sus acepciones en JSON, listo para
-- inyectar como contexto al LLM traductor.
-- ============================================================

create or replace function search_patois(q text, max_results int default 10)
returns table (
  entry_id   uuid,
  headword   text,
  match_type text,
  similarity real,
  senses     jsonb
)
language sql
stable
as $$
  with cand as (
    select e.id, e.headword,
           case
             when e.norm_key = patwa_normalize(q) then 'exact'
             when exists (select 1 from entry_variants v
                          where v.entry_id = e.id
                            and v.norm_key = patwa_normalize(q)) then 'variant'
             when e.phon_key = patwa_phonetic_key(q) then 'phonetic'
             else 'fuzzy'
           end as mtype,
           similarity(e.headword, q) as sim
    from entries e
    where e.status = 'published'
      and (
        e.norm_key = patwa_normalize(q)
        or e.phon_key = patwa_phonetic_key(q)
        or e.headword % q
        or exists (select 1 from entry_variants v
                   where v.entry_id = e.id
                     and (v.norm_key = patwa_normalize(q) or v.spelling % q))
      )
  )
  select c.id, c.headword, c.mtype, c.sim,
         (select jsonb_agg(jsonb_build_object(
            'gloss_es', s.gloss_es,
            'gloss_en', s.gloss_en,
            'register', s.register,
            'cultural_note', s.cultural_note,
            'usage_warning', s.usage_warning,
            'tone_note', s.tone_note
          ) order by s.sense_order)
          from entry_senses s where s.entry_id = c.id)
  from cand c
  order by
    case c.mtype when 'exact' then 0 when 'variant' then 1
                 when 'phonetic' then 2 else 3 end,
    c.sim desc
  limit max_results;
$$;

-- ============================================================
-- 10. RLS
-- ============================================================

alter table profiles          enable row level security;
alter table entries           enable row level security;
alter table entry_variants    enable row level security;
alter table entry_senses      enable row level security;
alter table sense_examples    enable row level security;
alter table sense_audio       enable row level security;
alter table suggestions       enable row level security;
alter table suggestion_votes  enable row level security;

create policy "perfiles públicos" on profiles
  for select using (true);
create policy "edito mi perfil" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and reputation = (select reputation from profiles where id = auth.uid()));

create policy "leer entradas publicadas" on entries
  for select using (status = 'published' or created_by = auth.uid());

create policy "leer variantes" on entry_variants for select using (true);
create policy "leer acepciones" on entry_senses for select using (true);
create policy "leer ejemplos" on sense_examples for select using (true);
create policy "leer audio aprobado" on sense_audio
  for select using (approved = true or speaker_id = auth.uid());

-- Escritura solo vía sugerencias
create policy "leer sugerencias" on suggestions for select using (true);
create policy "crear sugerencia" on suggestions
  for insert with check (auth.uid() = author_id);
create policy "editar mi sugerencia pendiente" on suggestions
  for update using (auth.uid() = author_id and status = 'pending');

create policy "leer votos" on suggestion_votes for select using (true);
create policy "votar" on suggestion_votes
  for insert with check (
    auth.uid() = voter_id
    and not exists (select 1 from suggestions s
                    where s.id = suggestion_id and s.author_id = auth.uid())
  );
create policy "cambiar mi voto" on suggestion_votes
  for update using (auth.uid() = voter_id);

-- ============================================================
-- 11. SEMILLA DE EJEMPLO
-- Muestra el nivel de detalle que debe tener cada entrada.
-- ============================================================

insert into entries (id, headword, pos, etymology, status)
values ('11111111-1111-1111-1111-111111111111',
        'wah gwaan', 'interjección',
        'ing. "what is going on"', 'published');

insert into entry_variants (entry_id, spelling, source) values
  ('11111111-1111-1111-1111-111111111111', 'wagwan',   'social'),
  ('11111111-1111-1111-1111-111111111111', 'whagwan',  'social'),
  ('11111111-1111-1111-1111-111111111111', 'wa gwaan', 'uwi'),
  ('11111111-1111-1111-1111-111111111111', 'weh gwaan','social');

insert into entry_senses
  (entry_id, sense_order, gloss_en, gloss_es, register, cultural_note, usage_warning, tone_note, literal_en)
values
  ('11111111-1111-1111-1111-111111111111', 1,
   'what''s up (greeting)', '¿qué tal? (saludo)', 'informal',
   'Saludo por defecto entre iguales. La respuesta esperada no es literal: "mi deh yah" o "everyting criss". Contestar con un parte real de tu día suena a extranjero.',
   'De un turista a un desconocido mayor puede sonar a exceso de confianza. Con gente mayor o en contexto formal, "good morning" sigue siendo lo correcto.',
   'Tono ascendente y relajado = saludo neutro.',
   'what is going on'),
  ('11111111-1111-1111-1111-111111111111', 2,
   'what''s going on here? (demand for explanation)',
   '¿qué está pasando aquí? (exigir explicación)', 'neutral',
   'Con tono cortante deja de ser saludo y pasa a ser una interpelación: se usa al llegar a una situación tensa o al pedir cuentas.',
   'Confundir las dos acepciones es el error clásico de quien aprende la frase en una canción.',
   'Tono descendente, acento fuerte en "gwaan" = exigencia, no saludo.',
   'what is going on');
