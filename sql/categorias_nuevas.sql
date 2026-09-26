-- ============================================================
-- CLINICAL HUB · CREAR ETIQUETAS DESDE EL PANEL (rama feedback_ia)
-- Deja crear etiquetas nuevas en categorias_para_ia: temas pedidos
-- (tipo 'tema') y mejoras globales (tipo 'mejora'). Solo da un
-- permiso nuevo. No toca, cambia ni borra ningún dato existente.
-- Las etiquetas no se borran desde el panel.
-- ============================================================

grant insert (slug, nombre, tipo, sinonimos) on public.categorias_para_ia to authenticated;

create policy "alta autenticados" on public.categorias_para_ia
  for insert to authenticated with check (tipo in ('tema', 'mejora'));
create policy "exigir 2FA al crear" on public.categorias_para_ia
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
