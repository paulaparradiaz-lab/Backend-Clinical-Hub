-- ============================================================
-- CLINICAL HUB · VISTAS DE LA CLASIFICACIÓN POR IA (rama feedback_ia)
-- Lee las dos tablas que llena la IA:
--   feedback_prueba_clasificacion_por_ia  → cada feedback ya clasificado
--   categorias_para_ia                    → catálogo de temas y tipos de mejora
-- Solo AGREGA reglas de lectura y CREA vistas nuevas.
-- No cambia, mueve ni borra ningún dato ni ninguna tabla existente.
-- ============================================================

-- 1. Seguridad: las tablas de IA tenían RLS activo sin reglas, así que
--    el panel las veía vacías. Se les da la misma regla que al resto:
--    solo lectura, con sesión y segundo factor (aal2).
create policy "lectura autenticados" on public.feedback_prueba_clasificacion_por_ia
  for select to authenticated using (true);
create policy "exigir 2FA" on public.feedback_prueba_clasificacion_por_ia
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "lectura autenticados" on public.categorias_para_ia
  for select to authenticated using (true);
create policy "exigir 2FA" on public.categorias_para_ia
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');


-- 2. v_ia_feedback · la base limpia. Las demás vistas salen de aquí.
--    - fecha de texto ("29/8/2026, 7:50:03 p. m.") → fecha y hora reales
--    - estrellas de texto → número
--    - "sepsis,shock" → lista {sepsis,shock}
--    - SIN correo del médico
create or replace view public.v_ia_feedback
with (security_invoker = true) as
select
  f.id,
  to_timestamp(
    replace(replace(f.fecha, ' p. m.', ' PM'), ' a. m.', ' AM'),
    'DD/MM/YYYY, HH12:MI:SS AM'
  )::timestamp                                            as fecha,
  f.pais,
  case when trim(f.estrellas) ~ '^[1-5]$' then trim(f.estrellas)::int end as estrellas,
  f.origen,
  array(select trim(x) from unnest(string_to_array(f.tipos, ','))       x where trim(x) <> '') as tipos,
  array(select trim(x) from unnest(string_to_array(f.tema_slug, ','))   x where trim(x) <> '') as temas,
  array(select trim(x) from unnest(string_to_array(f.mejora_slug, ',')) x where trim(x) <> '') as mejoras,
  array(select trim(x) from unnest(string_to_array(f.sugerencias, ',')) x where trim(x) <> '') as sugerencias,
  f.confianza,
  f.estado,
  f.tema_puntual,
  f.guia_de_referencia,
  f.mejora                                                as mejora_texto
from public.feedback_prueba_clasificacion_por_ia f;


-- 3. v_ia_temas · ranking de temas pedidos (una fila por tema).
create or replace view public.v_ia_temas
with (security_invoker = true) as
select
  t.slug,
  coalesce(c.nombre, t.slug)                              as nombre,
  count(*)                                                as veces,
  count(distinct v.pais)                                  as paises,
  array_agg(distinct v.pais) filter (where v.pais is not null) as lista_paises,
  max(v.fecha)                                            as ultima_vez,
  count(*) filter (where v.estado = 'por_revisar')        as por_revisar
from public.v_ia_feedback v
cross join lateral unnest(v.temas) as t(slug)
left join public.categorias_para_ia c on c.slug = t.slug and c.tipo = 'tema'
group by t.slug, c.nombre;


-- 4. v_ia_mejoras · conteo por tipo de mejora (una fila por tipo).
create or replace view public.v_ia_mejoras
with (security_invoker = true) as
select
  m.slug,
  coalesce(c.nombre, m.slug)                              as nombre,
  count(*)                                                as veces,
  round(avg(v.estrellas), 2)                              as promedio_estrellas,
  count(v.estrellas)                                      as con_estrellas,
  max(v.fecha)                                            as ultima_vez,
  count(*) filter (where v.estado = 'por_revisar')        as por_revisar
from public.v_ia_feedback v
cross join lateral unnest(v.mejoras) as m(slug)
left join public.categorias_para_ia c on c.slug = m.slug and c.tipo = 'mejora'
group by m.slug, c.nombre;


-- 5. v_ia_por_revisar · lo que la IA no tuvo claro, con sus sugerencias.
create or replace view public.v_ia_por_revisar
with (security_invoker = true) as
select *
from public.v_ia_feedback
where estado = 'por_revisar';


-- 6. Permisos de las vistas: solo lectura y solo con sesión.
revoke all on public.v_ia_feedback, public.v_ia_temas, public.v_ia_mejoras, public.v_ia_por_revisar
  from anon, authenticated;
grant select on public.v_ia_feedback, public.v_ia_temas, public.v_ia_mejoras, public.v_ia_por_revisar
  to authenticated;


-- ============================================================
-- 7. El Inbox puede clasificar (se agregó después)
--    El panel puede EDITAR solo cuatro columnas: tipos, tema_slug,
--    mejora_slug y estado. El texto del médico, la fecha, el país,
--    las estrellas y el correo no se pueden cambiar desde el panel.
--    No hay permiso de crear ni de borrar filas.
-- ============================================================
revoke insert, update, delete, truncate on public.feedback_prueba_clasificacion_por_ia
  from anon, authenticated;
grant update (tipos, tema_slug, mejora_slug, estado)
  on public.feedback_prueba_clasificacion_por_ia to authenticated;

create policy "edicion autenticados" on public.feedback_prueba_clasificacion_por_ia
  for update to authenticated using (true) with check (true);
create policy "exigir 2FA al editar" on public.feedback_prueba_clasificacion_por_ia
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- El catálogo solo se lee.
revoke insert, update, delete, truncate on public.categorias_para_ia from anon, authenticated;


-- ============================================================
-- 8. Los rankings cuentan solo lo ya clasificado
--    Lo que sigue "por_revisar" vive en el Inbox y todavía no suma:
--    en cuanto se clasifica, entra al ranking (igual que el panel viejo).
-- ============================================================
drop view if exists public.v_ia_temas;
create view public.v_ia_temas
with (security_invoker = true) as
select
  t.slug,
  coalesce(c.nombre, t.slug)                              as nombre,
  count(*)                                                as veces,
  count(distinct v.pais)                                  as paises,
  array_agg(distinct v.pais) filter (where v.pais is not null) as lista_paises,
  max(v.fecha)                                            as ultima_vez
from public.v_ia_feedback v
cross join lateral unnest(v.temas) as t(slug)
left join public.categorias_para_ia c on c.slug = t.slug and c.tipo = 'tema'
where v.estado is distinct from 'por_revisar'
group by t.slug, c.nombre;

drop view if exists public.v_ia_mejoras;
create view public.v_ia_mejoras
with (security_invoker = true) as
select
  m.slug,
  coalesce(c.nombre, m.slug)                              as nombre,
  count(*)                                                as veces,
  round(avg(v.estrellas), 2)                              as promedio_estrellas,
  count(v.estrellas)                                      as con_estrellas,
  max(v.fecha)                                            as ultima_vez
from public.v_ia_feedback v
cross join lateral unnest(v.mejoras) as m(slug)
left join public.categorias_para_ia c on c.slug = m.slug and c.tipo = 'mejora'
where v.estado is distinct from 'por_revisar'
group by m.slug, c.nombre;

revoke all on public.v_ia_temas, public.v_ia_mejoras from anon, authenticated;
grant select on public.v_ia_temas, public.v_ia_mejoras to authenticated;


-- ============================================================
-- 9. El Inbox es solo para lo que tiene texto
--    Un feedback que trae solo estrellas no tiene nada que clasificar:
--    no entra al Inbox, aunque la IA lo haya dejado "por_revisar".
--    Sus estrellas siguen sumando en Métricas.
-- ============================================================
create or replace view public.v_ia_por_revisar
with (security_invoker = true) as
select *
from public.v_ia_feedback
where estado = 'por_revisar'
  and (coalesce(trim(tema_puntual), '') <> ''
    or coalesce(trim(mejora_texto), '') <> ''
    or coalesce(trim(guia_de_referencia), '') <> '');
