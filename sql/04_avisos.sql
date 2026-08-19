-- ═══════════════════════════════════════════════════════════════════════
--  CERCA · Migración 04 · Avisos del linter de Supabase
--
--  Ejecutar DESPUÉS de la 03. Idempotente. No borra datos.
--
--  Cierra: EXECUTE de PUBLIC sobre nuestras funciones (el `revoke from anon`
--  de la 02 no servía de nada), auth.uid() reevaluado por fila en cuatro
--  políticas, y la clave ajena de reports sin índice.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══ 1. EXECUTE DE PUBLIC SOBRE NUESTRAS FUNCIONES ════════════════════
-- PostgreSQL concede EXECUTE a PUBLIC al crear una función, y PUBLIC
-- alcanza a todos los roles. Por eso el `revoke execute ... from anon` de
-- la 02 no quitaba nada: el permiso seguía llegando por la puerta de al
-- lado. Aquí se revoca de PUBLIC y se concede explícitamente a quien debe
-- tenerlo, que es la única forma de que el revoke signifique algo.
--
-- No era explotable —guard_* y add_review comprueban auth.uid() y el RLS
-- bloquea el insert de anon— pero tres capas de defensa valen más que dos.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('add_review','add_toilet','apply_reports','guard_report',
                        'guard_review','guard_toilet','peso_reporte','report_item',
                        'retract','reviews_for','suppressed','toilets_nearby')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Consulta: cualquiera, con o sin sesión. La app abre y funciona.
grant execute on function public.toilets_nearby(double precision, double precision, integer) to anon, authenticated;
grant execute on function public.reviews_for(text[]) to anon, authenticated;
grant execute on function public.suppressed() to anon, authenticated;

-- Publicar: sólo con sesión firmada.
grant execute on function public.add_toilet(text, double precision, double precision,
  boolean, boolean, boolean, boolean, text, text, text, text) to authenticated;
grant execute on function public.add_review(text, smallint, smallint, jsonb, text,
  double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.report_item(text, text, text, text) to authenticated;
grant execute on function public.retract(text, text) to authenticated;

-- guard_*, apply_reports y peso_reporte se quedan sin permisos para nadie.
-- Los disparadores no comprueban EXECUTE, así que siguen funcionando; lo
-- que desaparece es poder llamarlos a mano por /rest/v1/rpc/.

-- ═══ 2. auth.uid() REEVALUADO POR FILA ════════════════════════════════
-- Suelto en una política, Postgres lo llama una vez por fila. Envuelto en
-- un subselect escalar, una vez por consulta. Con dos filas da igual; con
-- doscientas mil, no.

drop policy if exists toilets_insert on public.toilets;
create policy toilets_insert on public.toilets
  for insert to authenticated
  with check ((select auth.uid()) is not null and created_by = (select auth.uid()));

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert to authenticated
  with check ((select auth.uid()) is not null and created_by = (select auth.uid()));

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check ((select auth.uid()) is not null and created_by = (select auth.uid()));

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports
  for select to authenticated using (created_by = (select auth.uid()));

-- ═══ 3. CLAVE AJENA SIN ÍNDICE ════════════════════════════════════════
-- toilets y reviews ya tenían su índice de propietario; reports no. Sin él,
-- borrar un usuario de auth.users obliga a recorrer la tabla entera.
create index if not exists reports_owner_idx on public.reports (created_by, created_at desc);

-- ═══ 4. spatial_ref_sys ═══════════════════════════════════════════════
-- Tabla de la extensión PostGIS, no nuestra: 8.500 filas de sistemas de
-- coordenadas, las mismas en todas las bases del mundo. El linter la marca
-- como ERROR igualmente. Se intenta cerrarla, pero la política de lectura
-- va PRIMERO: activar RLS sin ella dejaría a PostGIS sin poder consultar
-- los sistemas de coordenadas y st_distance se rompería. Si el rol no es
-- dueño de la tabla —lo normal en Supabase— se deja como está.

do $$
begin
  begin
    create policy srs_read on public.spatial_ref_sys for select using (true);
  exception when duplicate_object then null;
  end;
  alter table public.spatial_ref_sys enable row level security;
exception when others then
  raise notice 'spatial_ref_sys pertenece a PostGIS: se deja como está (%)', sqlerrm;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  LO QUE EL LINTER SIGUE MARCANDO Y NO SE TOCA, A PROPÓSITO:
--
--  · authenticated puede ejecutar add_review, report_item y retract.
--    Es el diseño: son SECURITY DEFINER porque el servidor tiene que medir
--    la distancia y escribir saltándose el insert directo, y las tres
--    empiezan comprobando auth.uid(). El aviso pide confirmar que es
--    deliberado. Lo es.
--
--  · st_estimatedextent (×3) es de PostGIS, propiedad de supabase_admin.
--    No podemos revocarla ni deberíamos.
--
--  · postgis instalada en public. Moverla a otro esquema con las tablas ya
--    usando geography(point,4326) obliga a reescribir el search_path de
--    todas las funciones y a arriesgar los tipos de las columnas. El
--    beneficio es de higiene; el riesgo, de romper la app. Se queda.
--
--  · «Unused index» sobre los seis índices. La base está vacía y nadie ha
--    lanzado todavía una consulta: son exactamente los que la app necesita
--    (toilets_geom_idx es el que hace que toilets_nearby no recorra la
--    tabla entera). Volver a mirarlo cuando haya tráfico real.
-- ═══════════════════════════════════════════════════════════════════════
