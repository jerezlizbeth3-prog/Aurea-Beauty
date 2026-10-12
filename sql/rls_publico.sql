-- =========================================================
-- Aurae Beauty - Políticas RLS para el sitio público
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Puede ejecutarse varias veces (usa DROP POLICY IF EXISTS).
-- =========================================================

-- NOTA: autenticado = panel admin, anon = sitio público (index.html)
-- Las reseñas y los videos los lee anon; las reseñas las escribe anon.

-- 1) Activar RLS en las tablas del sitio público
alter table public.resenas     enable row level security;
alter table public.videos_uso  enable row level security;

-- 2) Limpiar políticas anteriores (por si se reejecuta)
drop policy if exists "resenas_select_anon"    on public.resenas;
drop policy if exists "resenas_insert_anon"    on public.resenas;
drop policy if exists "resenas_select_auth"    on public.resenas;
drop policy if exists "videos_uso_select_anon" on public.videos_uso;

-- 3) RESEÑAS: cualquier visitante ve solo las aprobadas
create policy "resenas_select_anon"
  on public.resenas
  for select
  to anon
  using (aprobada = true);

-- 4) RESEÑAS: cualquier visitante puede enviar una reseña
--    pero siempre queda pendiente de aprobación (aprobada = false),
--    nunca puede publicar directamente.
create policy "resenas_insert_anon"
  on public.resenas
  for insert
  to anon
  with check (aprobada = false);

-- 5) RESEÑAS: lecturas del panel admin (autenticado)
create policy "resenas_select_auth"
  on public.resenas
  for select
  to authenticated
  using (true);

-- 6) VIDEOS DE USO: cualquier visitante ve solo los activos
create policy "videos_uso_select_anon"
  on public.videos_uso
  for select
  to anon
  using (activo = true);
-- =========================================================
-- CATEGORÍAS VISIBLES (apéndice) - sitio público
-- El público consulta la lista completa (visible true/false)
-- y el front oculta el botón de las categorías con
-- visible = false. Los nombres no son datos sensibles.
-- =========================================================
alter table public.categorias_config enable row level security;

drop policy if exists "categorias_config_select_anon" on public.categorias_config;

create policy "categorias_config_select_anon"
  on public.categorias_config
  for select
  to anon
  using (true);
