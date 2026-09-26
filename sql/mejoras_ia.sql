-- ============================================================
-- CLINICAL HUB · MEJORAS DEL PANEL NUEVO (rama feedback_ia)
-- Crea dos tablas nuevas y da un permiso nuevo. No toca, cambia ni
-- borra ningún dato existente ni las tablas viejas (acciones, etc.).
-- ============================================================

-- 1. Las mejoras: una decisión concreta, con su estado.
create table if not exists public.mejoras_ia (
  id          bigint generated always as identity primary key,
  titulo      text not null check (length(trim(titulo)) > 0),
  detalle     text,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'en_curso', 'hecha', 'descartada')),
  creado_en   timestamptz not null default now(),
  creado_por  uuid default auth.uid()
);

-- 2. El enlace mejora ↔ tema. El tema es el código de categorias_para_ia
--    (por ejemplo "sepsis"), el mismo que escribe la IA en cada fila.
create table if not exists public.mejora_ia_tema (
  mejora_id   bigint not null references public.mejoras_ia(id),
  tema_slug   text not null,
  creado_en   timestamptz not null default now(),
  primary key (mejora_id, tema_slug)
);

-- 3. Seguridad: como el resto del panel, con sesión y segundo factor.
alter table public.mejoras_ia enable row level security;
alter table public.mejora_ia_tema enable row level security;

revoke all on public.mejoras_ia, public.mejora_ia_tema from anon, authenticated;
-- Las mejoras se crean, se leen y se editan; no se borran (para
-- descartar una se usa el estado "descartada" y la historia no se pierde).
grant select, insert on public.mejoras_ia to authenticated;
grant update (titulo, detalle, estado) on public.mejoras_ia to authenticated;
-- Los enlaces sí se pueden quitar: eso es "Desvincular".
grant select, insert, delete on public.mejora_ia_tema to authenticated;

create policy "lectura autenticados" on public.mejoras_ia for select to authenticated using (true);
create policy "alta autenticados" on public.mejoras_ia for insert to authenticated with check (true);
create policy "edicion autenticados" on public.mejoras_ia for update to authenticated using (true) with check (true);
create policy "exigir 2FA" on public.mejoras_ia as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "lectura autenticados" on public.mejora_ia_tema for select to authenticated using (true);
create policy "alta autenticados" on public.mejora_ia_tema for insert to authenticated with check (true);
create policy "desvincular autenticados" on public.mejora_ia_tema for delete to authenticated using (true);
create policy "exigir 2FA" on public.mejora_ia_tema as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');


-- 4. Renombrar un tema desde el ranking (el lápiz).
--    El panel solo puede cambiar el nombre bonito y los sinónimos.
--    El código (slug), el tipo y el estado del tema no se tocan, así la
--    IA sigue clasificando con el mismo código.
grant update (nombre, sinonimos) on public.categorias_para_ia to authenticated;
create policy "edicion autenticados" on public.categorias_para_ia
  for update to authenticated using (true) with check (true);
create policy "exigir 2FA al editar" on public.categorias_para_ia
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
