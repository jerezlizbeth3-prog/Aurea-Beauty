-- =========================================================
-- Aurae Beauty - Políticas RLS para el panel administrativo
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Puede ejecutarse varias veces (usa DROP POLICY IF EXISTS).
-- =========================================================

-- 1) Activar RLS en las tablas del panel
alter table public.productos enable row level security;
alter table public.inventario enable row level security;
alter table public.clientes    enable row level security;
alter table public.pedidos     enable row level security;
alter table public.detalle_pedido enable row level security;
alter table public.pagos       enable row level security;
alter table public.envios      enable row level security;

-- 2) Limpiar políticas anteriores de escritura (por si se reejecuta)
drop policy if exists "productos_select_authenticated"   on public.productos;
drop policy if exists "productos_insert_authenticated"   on public.productos;
drop policy if exists "productos_update_authenticated"   on public.productos;
drop policy if exists "productos_select_anon"            on public.productos;

drop policy if exists "inventario_select_authenticated"  on public.inventario;
drop policy if exists "inventario_insert_authenticated"  on public.inventario;
drop policy if exists "inventario_update_authenticated"  on public.inventario;
drop policy if exists "inventario_select_anon"           on public.inventario;

drop policy if exists "clientes_select_authenticated"    on public.clientes;
drop policy if exists "pedidos_select_authenticated"     on public.pedidos;
drop policy if exists "pedidos_update_authenticated"     on public.pedidos;
drop policy if exists "detalle_pedido_select_authenticated" on public.detalle_pedido;
drop policy if exists "pagos_select_authenticated"        on public.pagos;
drop policy if exists "envios_select_authenticated"       on public.envios;
drop policy if exists "envios_insert_authenticated"       on public.envios;
drop policy if exists "envios_update_authenticated"       on public.envios;

-- 3) LECTURA: usuarios autenticados (admin)
--    El catálogo público del sitio se sirve desde js/catalog.js,
--    por lo que estas políticas solo aplican al panel.
create policy "productos_select_authenticated"
  on public.productos
  for select
  to authenticated
  using (true);

create policy "inventario_select_authenticated"
  on public.inventario
  for select
  to authenticated
  using (true);

-- 4) ESCRITURA: solo usuarios autenticados
--    No se crea ninguna política DELETE: el sistema nunca borra filas.
create policy "productos_insert_authenticated"
  on public.productos
  for insert
  to authenticated
  with check (true);

create policy "productos_update_authenticated"
  on public.productos
  for update
  to authenticated
  using (true)
  with check (true);

create policy "inventario_insert_authenticated"
  on public.inventario
  for insert
  to authenticated
  with check (true);

create policy "inventario_update_authenticated"
  on public.inventario
  for update
  to authenticated
  using (true)
  with check (true);

-- 5) PEDIDOS: lectura + actualización de estado del pedido
--    No se crea política DELETE ni INSERT: los pedidos los crea
--    el proceso de ventas, no el panel. El panel solo cambia estados.
create policy "pedidos_select_authenticated"
  on public.pedidos
  for select
  to authenticated
  using (true);

create policy "pedidos_update_authenticated"
  on public.pedidos
  for update
  to authenticated
  using (true)
  with check (true);

-- 6) Tablas de solo lectura para el panel
create policy "clientes_select_authenticated"
  on public.clientes
  for select
  to authenticated
  using (true);

create policy "detalle_pedido_select_authenticated"
  on public.detalle_pedido
  for select
  to authenticated
  using (true);

create policy "pagos_select_authenticated"
  on public.pagos
  for select
  to authenticated
  using (true);

-- 7) ENVIOS: lectura + escritura (el panel cambia el estado del envío)
create policy "envios_select_authenticated"
  on public.envios
  for select
  to authenticated
  using (true);

create policy "envios_insert_authenticated"
  on public.envios
  for insert
  to authenticated
  with check (true);

create policy "envios_update_authenticated"
  on public.envios
  for update
  to authenticated
  using (true)
  with check (true);

-- =========================================================
-- 8) REALTIME: publicar las tablas que el panel escucha
--    Sin esto, el canal se suscribe pero nunca llegan eventos.
--    Las políticas RLS de arriba se aplican también a los eventos.
-- =========================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'envios'
  ) then
    alter publication supabase_realtime add table public.envios;
  end if;
end $$;

-- =========================================================
-- OPCIONAL: si el catálogo público llega a leer productos
-- desde el navegador sin iniciar sesión, descomenta esto.
-- =========================================================
-- create policy "productos_select_anon"
--   on public.productos
--   for select
--   to anon
--   using (activo = true);
--
-- create policy "inventario_select_anon"
--   on public.inventario
--   for select
--   to anon
--   using (true);

-- =========================================================
-- OPCIONAL: políticas más restrictivas por rol de administrador.
-- Úsalas si tu tabla auth.users tiene el rol en app_metadata.
-- Reemplazan las políticas UPDATE de arriba.
-- =========================================================
-- create policy "productos_update_solo_admin"
--   on public.productos
--   for update
--   to authenticated
--   using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
--   with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
