-- ============================================================
-- CLINICAL HUB · MÉTRICAS DE NEGOCIO (para Hitos)
-- n8n deja aquí, una fila por día, los suscriptores acumulados y la
-- facturación acumulada en dólares. El panel solo la lee.
-- Solo CREA una tabla nueva: no toca, cambia ni borra ninguna existente.
-- Pegar completo en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists public.metricas_negocio (
  fecha                      date primary key,          -- un registro por día
  suscriptores_acumulados    integer check (suscriptores_acumulados >= 0),        -- total histórico, no los activos
  facturacion_acumulada_usd  numeric(14,2) check (facturacion_acumulada_usd >= 0), -- en dólares
  actualizado_en             timestamptz not null default now()
);

-- Seguridad: nadie sin sesión la ve. El panel solo lee.
alter table public.metricas_negocio enable row level security;

-- Leer: usuarios con sesión y código de la app verificado (aal2), como el resto del panel.
create policy "metricas_negocio: leer con sesion 2FA" on public.metricas_negocio
  for select to authenticated
  using ((auth.jwt() ->> 'aal') = 'aal2');

-- Escribir: no hay política a propósito. n8n escribe con la service_role key,
-- que pasa por encima de RLS; desde el panel nadie puede escribir aquí.
--
-- En n8n, el nodo de Supabase hace un "upsert" por fecha, por ejemplo:
--   fecha = hoy, suscriptores_acumulados = <total>, facturacion_acumulada_usd = <total USD>
