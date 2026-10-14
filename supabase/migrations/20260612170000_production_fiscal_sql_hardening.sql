-- Endurecimiento final para venta/facturacion antes de beta comercial.
-- Objetivo:
-- 1. Mantener numeracion unica por empresa.
-- 2. Mantener idempotencia de ventas por empresa.
-- 3. Bloquear actualizaciones directas de ventas, detalles, pagos y comprobantes desde frontend.
-- 4. Dejar los cambios fiscales solo por RPC/Edge Functions seguras.

create extension if not exists pgcrypto;

alter table ventas add column if not exists client_sale_id uuid;
update ventas set client_sale_id = gen_random_uuid() where client_sale_id is null;
alter table ventas alter column client_sale_id set not null;

alter table comprobantes add column if not exists empresa_id uuid references empresas(id) on delete cascade;
alter table comprobantes add column if not exists estado_sunat text;
alter table comprobantes add column if not exists respuesta_sunat jsonb;
alter table comprobantes add column if not exists ticket_anulacion text;
alter table comprobantes add column if not exists sunat_description text;
alter table comprobantes add column if not exists sunat_note text;
alter table comprobantes add column if not exists sunat_responsecode text;
alter table comprobantes add column if not exists sunat_soap_error text;
alter table comprobantes add column if not exists cadena_para_codigo_qr text;
alter table comprobantes add column if not exists codigo_hash text;
alter table comprobantes add column if not exists updated_at timestamptz not null default now();

update comprobantes c
set empresa_id = v.empresa_id
from ventas v
where c.venta_id = v.id
  and c.empresa_id is null;

drop index if exists ventas_client_sale_id_uidx;
create unique index if not exists ventas_empresa_client_sale_id_uidx
on ventas(empresa_id, client_sale_id);

alter table comprobantes drop constraint if exists comprobantes_tipo_comprobante_serie_numero_key;
create unique index if not exists comprobantes_empresa_tipo_serie_numero_uidx
on comprobantes(empresa_id, tipo_comprobante, serie, numero);

alter table ventas enable row level security;
alter table venta_detalle enable row level security;
alter table pagos enable row level security;
alter table comprobantes enable row level security;

drop policy if exists "ventas_update_empresa" on ventas;
drop policy if exists "venta_detalle_update_empresa" on venta_detalle;
drop policy if exists "pagos_update_empresa" on pagos;
drop policy if exists "comprobantes_update_empresa" on comprobantes;

drop policy if exists "ventas_no_direct_update" on ventas;
drop policy if exists "venta_detalle_no_direct_update" on venta_detalle;
drop policy if exists "pagos_no_direct_update" on pagos;
drop policy if exists "comprobantes_no_direct_update" on comprobantes;

create policy "ventas_no_direct_update"
on ventas for update
using (false)
with check (false);

create policy "venta_detalle_no_direct_update"
on venta_detalle for update
using (false)
with check (false);

create policy "pagos_no_direct_update"
on pagos for update
using (false)
with check (false);

create policy "comprobantes_no_direct_update"
on comprobantes for update
using (false)
with check (false);

revoke update on ventas from authenticated;
revoke update on venta_detalle from authenticated;
revoke update on pagos from authenticated;
revoke update on comprobantes from authenticated;

select pg_notify('pgrst', 'reload schema');
