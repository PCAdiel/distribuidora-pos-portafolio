-- Fase 1: seguridad POS/Nubefact.
-- Ejecutar despues de 20260610120000_pos_beta_rpc_json.sql.

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

create table if not exists facturacion_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  comprobante_id uuid references comprobantes(id) on delete cascade,
  venta_id uuid references ventas(id) on delete cascade,
  proveedor text not null default 'NUBEFACT',
  operacion text not null,
  estado text not null,
  mensaje text,
  detalle jsonb,
  created_at timestamptz not null default now()
);

alter table facturacion_eventos enable row level security;

create index if not exists facturacion_eventos_empresa_created_idx
on facturacion_eventos(empresa_id, created_at desc);

create index if not exists comprobantes_empresa_estado_idx
on comprobantes(empresa_id, estado);

drop policy if exists "ventas_update_empresa" on ventas;
drop policy if exists "comprobantes_update_empresa" on comprobantes;
drop policy if exists "facturacion_eventos_select_empresa" on facturacion_eventos;
drop policy if exists "facturacion_eventos_insert_empresa" on facturacion_eventos;

create policy "facturacion_eventos_select_empresa"
on facturacion_eventos for select
using (usuario_es_miembro_empresa(empresa_id));

-- Los eventos fiscales se insertan desde funciones SECURITY DEFINER o Edge Functions seguras.
create policy "facturacion_eventos_insert_server"
on facturacion_eventos for insert
with check (false);

create or replace function public.registrar_evento_facturacion(
  p_comprobante_id uuid,
  p_operacion text,
  p_estado text,
  p_mensaje text default null,
  p_detalle jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_comprobante record;
begin
  if v_user_id is null then
    raise exception 'No autorizado.';
  end if;

  select c.id, c.empresa_id, c.venta_id
  into v_comprobante
  from comprobantes c
  where c.id = p_comprobante_id;

  if not found then
    raise exception 'Comprobante no encontrado.';
  end if;

  if not usuario_tiene_rol(v_comprobante.empresa_id, array['ADMIN', 'CAJERO']) then
    raise exception 'Tu rol no permite operar comprobantes.';
  end if;

  insert into facturacion_eventos(
    empresa_id,
    comprobante_id,
    venta_id,
    proveedor,
    operacion,
    estado,
    mensaje,
    detalle
  )
  values(
    v_comprobante.empresa_id,
    v_comprobante.id,
    v_comprobante.venta_id,
    'NUBEFACT',
    p_operacion,
    p_estado,
    p_mensaje,
    p_detalle
  );
end;
$$;

create or replace function public.marcar_comprobante_nubefact(
  p_comprobante_id uuid,
  p_operacion text,
  p_estado text,
  p_respuesta jsonb,
  p_mensaje text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_comprobante record;
  v_estado text := upper(coalesce(p_estado, 'PENDIENTE_REINTENTO'));
begin
  if v_user_id is null then
    raise exception 'No autorizado.';
  end if;

  select c.id, c.empresa_id, c.venta_id
  into v_comprobante
  from comprobantes c
  where c.id = p_comprobante_id;

  if not found then
    raise exception 'Comprobante no encontrado.';
  end if;

  if not usuario_tiene_rol(v_comprobante.empresa_id, array['ADMIN', 'CAJERO']) then
    raise exception 'Tu rol no permite operar comprobantes.';
  end if;

  update comprobantes
  set
    estado = v_estado,
    proveedor = 'NUBEFACT',
    proveedor_id = coalesce(p_respuesta ->> 'enlace', p_respuesta ->> 'enlace_del_pdf', proveedor_id),
    pdf_url = coalesce(p_respuesta ->> 'enlace_del_pdf', pdf_url),
    xml_url = coalesce(p_respuesta ->> 'enlace_del_xml', xml_url),
    cdr_url = coalesce(p_respuesta ->> 'enlace_del_cdr', cdr_url),
    estado_sunat = coalesce(p_respuesta ->> 'sunat_responsecode', p_respuesta ->> 'estado_sunat', estado_sunat),
    respuesta_sunat = coalesce(p_respuesta, respuesta_sunat),
    sunat_description = coalesce(p_respuesta ->> 'sunat_description', sunat_description),
    sunat_note = coalesce(p_respuesta ->> 'sunat_note', sunat_note),
    sunat_responsecode = coalesce(p_respuesta ->> 'sunat_responsecode', sunat_responsecode),
    sunat_soap_error = coalesce(p_respuesta ->> 'sunat_soap_error', sunat_soap_error),
    cadena_para_codigo_qr = coalesce(p_respuesta ->> 'cadena_para_codigo_qr', cadena_para_codigo_qr),
    codigo_hash = coalesce(p_respuesta ->> 'codigo_hash', codigo_hash),
    error_mensaje = p_mensaje,
    updated_at = now()
  where id = p_comprobante_id;

  insert into facturacion_eventos(
    empresa_id,
    comprobante_id,
    venta_id,
    proveedor,
    operacion,
    estado,
    mensaje,
    detalle
  )
  values(
    v_comprobante.empresa_id,
    v_comprobante.id,
    v_comprobante.venta_id,
    'NUBEFACT',
    p_operacion,
    v_estado,
    p_mensaje,
    p_respuesta
  );

  return jsonb_build_object(
    'comprobante_id', p_comprobante_id,
    'estado', v_estado
  );
end;
$$;

create or replace function public.marcar_comprobante_anulado_nubefact(
  p_comprobante_id uuid,
  p_respuesta jsonb,
  p_mensaje text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_comprobante record;
begin
  if v_user_id is null then
    raise exception 'No autorizado.';
  end if;

  select c.id, c.empresa_id, c.venta_id
  into v_comprobante
  from comprobantes c
  where c.id = p_comprobante_id;

  if not found then
    raise exception 'Comprobante no encontrado.';
  end if;

  if not usuario_tiene_rol(v_comprobante.empresa_id, array['ADMIN', 'CAJERO']) then
    raise exception 'Tu rol no permite anular comprobantes.';
  end if;

  update comprobantes
  set
    estado = 'ANULADO_NUBEFACT',
    ticket_anulacion = coalesce(p_respuesta ->> 'ticket', p_respuesta ->> 'ticket_anulacion', ticket_anulacion),
    respuesta_sunat = coalesce(p_respuesta, respuesta_sunat),
    error_mensaje = p_mensaje,
    updated_at = now()
  where id = p_comprobante_id;

  insert into facturacion_eventos(
    empresa_id,
    comprobante_id,
    venta_id,
    proveedor,
    operacion,
    estado,
    mensaje,
    detalle
  )
  values(
    v_comprobante.empresa_id,
    v_comprobante.id,
    v_comprobante.venta_id,
    'NUBEFACT',
    'generar_anulacion',
    'ANULADO_NUBEFACT',
    p_mensaje,
    p_respuesta
  );

  return jsonb_build_object(
    'comprobante_id', p_comprobante_id,
    'estado', 'ANULADO_NUBEFACT'
  );
end;
$$;

revoke all on function public.registrar_evento_facturacion(uuid, text, text, text, jsonb) from public;
revoke all on function public.marcar_comprobante_nubefact(uuid, text, text, jsonb, text) from public;
revoke all on function public.marcar_comprobante_anulado_nubefact(uuid, jsonb, text) from public;
grant execute on function public.registrar_evento_facturacion(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.marcar_comprobante_nubefact(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.marcar_comprobante_anulado_nubefact(uuid, jsonb, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
