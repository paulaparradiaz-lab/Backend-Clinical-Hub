-- ============================================================
-- CLINICAL HUB · HISTORIAL DE ESTADOS DE LAS MEJORAS (rama feedback_ia)
-- Guarda cuándo se creó cada mejora y cada vez que cambia de estado,
-- y la fecha en que se completó (escribible, para mejoras del pasado),
-- para la pestaña Impacto (antes y después de completarla).
-- Crea una tabla, una columna y dos disparadores nuevos. No toca,
-- cambia ni borra ningún dato existente.
-- ============================================================

-- 1. El historial: una fila por cada estado que tuvo una mejora.
create table if not exists public.mejora_ia_historial (
  id           bigint generated always as identity primary key,
  mejora_id    bigint not null references public.mejoras_ia(id),
  estado       text not null,
  cambiado_en  timestamptz not null default now(),
  cambiado_por uuid default auth.uid()
);
create index if not exists mejora_ia_historial_mejora on public.mejora_ia_historial (mejora_id, cambiado_en);

-- 2. Fecha de completada: se llena sola al marcarla Completada y se
--    puede escribir a mano para las mejoras que se hicieron en el pasado,
--    por fuera del sistema. Es la fecha desde la que Impacto mide.
alter table public.mejoras_ia add column if not exists completada_en timestamptz;
grant update (completada_en) on public.mejoras_ia to authenticated;

create or replace function public.fecha_completada_mejora()
returns trigger language plpgsql set search_path = ''
as $$
begin
  -- Al entrar a Completada sin una fecha escrita a mano, se pone hoy.
  -- Si la mejora vuelve a completarse, estrena fecha (no se queda con la vieja).
  if new.estado = 'hecha' then
    if tg_op = 'INSERT' then
      new.completada_en := coalesce(new.completada_en, now());
    elsif old.estado is distinct from 'hecha' and new.completada_en is not distinct from old.completada_en then
      new.completada_en := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists fecha_completada on public.mejoras_ia;
create trigger fecha_completada before insert or update of estado on public.mejoras_ia
  for each row execute function public.fecha_completada_mejora();

-- 3. Historial: se llena solo al crear una mejora y cada vez que cambia su estado.
--    El panel no escribe aquí; solo lee.
create or replace function public.anotar_estado_mejora()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Una mejora del pasado entra con su fecha real: la de completada
    -- si ya viene completada, si no la de creación.
    insert into public.mejora_ia_historial (mejora_id, estado, cambiado_en)
    values (new.id, new.estado,
            coalesce(case when new.estado = 'hecha' then new.completada_en end, new.creado_en));
  elsif new.estado is distinct from old.estado then
    insert into public.mejora_ia_historial (mejora_id, estado) values (new.id, new.estado);
  end if;
  return new;
end;
$$;

drop trigger if exists anotar_estado on public.mejoras_ia;
create trigger anotar_estado after insert or update of estado on public.mejoras_ia
  for each row execute function public.anotar_estado_mejora();

-- 4. Seguridad: solo lectura, con sesión y segundo factor.
alter table public.mejora_ia_historial enable row level security;
revoke all on public.mejora_ia_historial from anon, authenticated;
grant select on public.mejora_ia_historial to authenticated;
create policy "lectura autenticados" on public.mejora_ia_historial for select to authenticated using (true);
create policy "exigir 2FA" on public.mejora_ia_historial as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- 5. Las mejoras que ya existían: se anota su creación con la fecha
--    real y, si ya no están pendientes, su estado actual con la fecha
--    de hoy (antes no se guardaba cuándo cambiaron).
insert into public.mejora_ia_historial (mejora_id, estado, cambiado_en, cambiado_por)
select m.id, 'pendiente', m.creado_en, m.creado_por
from public.mejoras_ia m
where not exists (select 1 from public.mejora_ia_historial h where h.mejora_id = m.id);

insert into public.mejora_ia_historial (mejora_id, estado, cambiado_en, cambiado_por)
select m.id, m.estado, now(), null
from public.mejoras_ia m
where m.estado <> 'pendiente'
  and not exists (select 1 from public.mejora_ia_historial h where h.mejora_id = m.id and h.estado = m.estado);

-- Las que ya estaban completadas estrenan su fecha de completada (hoy).
update public.mejoras_ia set completada_en = now()
where estado = 'hecha' and completada_en is null;

-- Las funciones de los disparadores no se llaman desde el panel: nadie
-- de afuera las puede ejecutar (los disparadores siguen funcionando).
revoke execute on function public.anotar_estado_mejora() from public, anon, authenticated;
revoke execute on function public.fecha_completada_mejora() from public, anon, authenticated;
