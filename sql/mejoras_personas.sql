-- ============================================================
-- CLINICAL HUB · PERSONAS DE CADA MEJORA (rama feedback_ia)
-- Crea una tabla nueva y una función de solo lectura. No toca,
-- cambia ni borra ningún dato existente.
-- ============================================================

-- 1. Quién está a cargo de cada mejora: una o varias personas.
--    La persona es un usuario del panel (auth.users).
create table if not exists public.mejora_ia_persona (
  mejora_id   bigint not null references public.mejoras_ia(id),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  creado_en   timestamptz not null default now(),
  primary key (mejora_id, usuario_id)
);

alter table public.mejora_ia_persona enable row level security;
revoke all on public.mejora_ia_persona from anon, authenticated;
-- Se asigna y se quita; no hay nada que editar.
grant select, insert, delete on public.mejora_ia_persona to authenticated;

create policy "lectura autenticados" on public.mejora_ia_persona for select to authenticated using (true);
create policy "alta autenticados" on public.mejora_ia_persona for insert to authenticated with check (true);
create policy "quitar autenticados" on public.mejora_ia_persona for delete to authenticated using (true);
create policy "exigir 2FA" on public.mejora_ia_persona as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');


-- 2. La lista de usuarios del panel, para elegir a quién asignar.
--    auth.users no se puede leer desde el navegador; esta función
--    devuelve solo id, correo y nombre, y solo con segundo factor.
--    Cada usuario nuevo que se cree aparece solo, sin agregarlo a mano.
create or replace function public.usuarios_panel()
returns table (id uuid, correo text, nombre text)
language sql stable security definer set search_path = ''
as $$
  select u.id,
         u.email::text,
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'nombre'), ''),
                  nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
                  split_part(u.email, '@', 1))
  from auth.users u
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and u.deleted_at is null
  order by 3;
$$;

revoke all on function public.usuarios_panel() from public, anon;
grant execute on function public.usuarios_panel() to authenticated;
