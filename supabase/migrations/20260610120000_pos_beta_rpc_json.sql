create extension if not exists pgcrypto;

alter table ventas add column if not exists client_sale_id uuid;
update ventas set client_sale_id = gen_random_uuid() where client_sale_id is null;
alter table ventas alter column client_sale_id set not null;
create unique index if not exists ventas_client_sale_id_uidx on ventas(client_sale_id);

alter table comprobantes add column if not exists empresa_id uuid references empresas(id) on delete cascade;
alter table comprobantes add column if not exists sunat_description text;
alter table comprobantes add column if not exists sunat_note text;
alter table comprobantes add column if not exists sunat_responsecode text;
alter table comprobantes add column if not exists sunat_soap_error text;
alter table comprobantes add column if not exists cadena_para_codigo_qr text;
alter table comprobantes add column if not exists codigo_hash text;
alter table comprobantes add column if not exists updated_at timestamptz not null default now();
alter table productos add column if not exists codigo text;

update comprobantes c
set empresa_id = v.empresa_id
from ventas v
where c.venta_id = v.id
  and c.empresa_id is null;

create table if not exists facturacion_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  proveedor text not null default 'NUBEFACT',
  enabled boolean not null default false,
  modo text not null default 'demo',
  api_url text,
  ruc text,
  razon_social text,
  direccion text,
  ubigeo text,
  serie_boleta text not null default 'B001',
  serie_factura text not null default 'F001',
  formato_pdf text not null default 'TICKET',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(empresa_id, proveedor)
);

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

alter table facturacion_config enable row level security;
alter table facturacion_eventos enable row level security;

create index if not exists productos_empresa_activo_idx on productos(empresa_id, activo);
create index if not exists productos_empresa_codigo_idx on productos(empresa_id, codigo) where codigo is not null;
create index if not exists productos_empresa_nombre_idx on productos(empresa_id, nombre);
create index if not exists ventas_empresa_created_at_idx on ventas(empresa_id, created_at desc);
create index if not exists venta_detalle_venta_id_idx on venta_detalle(venta_id);
create index if not exists pagos_venta_id_idx on pagos(venta_id);
create index if not exists comprobantes_venta_id_idx on comprobantes(venta_id);
create index if not exists comprobantes_empresa_estado_idx on comprobantes(empresa_id, estado);
create index if not exists clientes_empresa_numero_documento_idx on clientes(empresa_id, numero_documento);
create index if not exists tickets_empresa_user_status_idx on tickets(empresa_id, user_id, status);
create index if not exists facturacion_eventos_empresa_created_idx on facturacion_eventos(empresa_id, created_at desc);

drop policy if exists "facturacion_config_select_empresa" on facturacion_config;
drop policy if exists "facturacion_config_insert_admin" on facturacion_config;
drop policy if exists "facturacion_config_update_admin" on facturacion_config;
drop policy if exists "facturacion_eventos_select_empresa" on facturacion_eventos;
drop policy if exists "facturacion_eventos_insert_empresa" on facturacion_eventos;

create policy "facturacion_config_select_empresa"
on facturacion_config for select
using (usuario_es_miembro_empresa(empresa_id));

create policy "facturacion_config_insert_admin"
on facturacion_config for insert
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

create policy "facturacion_config_update_admin"
on facturacion_config for update
using (usuario_tiene_rol(empresa_id, array['ADMIN']))
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

create policy "facturacion_eventos_select_empresa"
on facturacion_eventos for select
using (usuario_es_miembro_empresa(empresa_id));

create policy "facturacion_eventos_insert_empresa"
on facturacion_eventos for insert
with check (usuario_es_miembro_empresa(empresa_id));

create or replace function public.registrar_venta_pos_json(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_empresa_id uuid;
  v_rol text;
  v_client_sale_id uuid;
  v_cliente_id uuid;
  v_tipo_comprobante text;
  v_detalles jsonb;
  v_pagos jsonb;
  v_sent_total numeric := coalesce((p_payload ->> 'total')::numeric, 0);
  v_total numeric := 0;
  v_subtotal numeric := 0;
  v_igv numeric := 0;
  v_pago_total numeric := 0;
  v_venta_id uuid;
  v_comprobante_id uuid;
  v_created_at timestamptz;
  v_existing record;
  v_item jsonb;
  v_pago jsonb;
  v_producto record;
  v_producto_id uuid;
  v_cantidad numeric;
  v_line_total numeric;
  v_pago_monto numeric;
  v_pago_metodo text;
  v_cliente record;
  v_serie text;
  v_numero integer;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesion para registrar ventas.';
  end if;

  select ue.empresa_id, ue.rol
  into v_empresa_id, v_rol
  from usuarios_empresa ue
  where ue.user_id = v_user_id
  limit 1;

  if v_empresa_id is null then
    raise exception 'El usuario no esta asociado a una empresa.';
  end if;

  if v_rol not in ('ADMIN', 'CAJERO', 'VENDEDOR', 'EMPLEADO') then
    raise exception 'Tu rol no permite registrar ventas.';
  end if;

  v_client_sale_id := coalesce(nullif(p_payload ->> 'client_sale_id', '')::uuid, gen_random_uuid());

  select v.id as venta_id, v.created_at, c.id as comprobante_id, c.serie, c.numero, c.estado
  into v_existing
  from ventas v
  left join comprobantes c on c.venta_id = v.id
  where v.client_sale_id = v_client_sale_id
    and v.empresa_id = v_empresa_id
  limit 1;

  if found then
    return jsonb_build_object(
      'venta_id', v_existing.venta_id,
      'comprobante_id', v_existing.comprobante_id,
      'serie', v_existing.serie,
      'numero', v_existing.numero,
      'estado', coalesce(v_existing.estado, 'REGISTRADA'),
      'total', null,
      'created_at', v_existing.created_at,
      'duplicada', true
    );
  end if;

  v_tipo_comprobante := upper(coalesce(p_payload ->> 'tipo_comprobante', 'BOLETA'));

  if v_tipo_comprobante not in ('BOLETA', 'FACTURA') then
    raise exception 'Tipo de comprobante invalido.';
  end if;

  v_cliente_id := nullif(p_payload ->> 'cliente_id', '')::uuid;
  v_detalles := p_payload -> 'detalles';
  v_pagos := p_payload -> 'pagos';

  if jsonb_typeof(v_detalles) <> 'array' or jsonb_array_length(v_detalles) = 0 then
    raise exception 'La venta debe tener al menos un producto.';
  end if;

  if v_cliente_id is not null then
    select *
    into v_cliente
    from clientes
    where id = v_cliente_id
      and empresa_id = v_empresa_id;

    if not found then
      raise exception 'El cliente no pertenece a tu empresa.';
    end if;
  end if;

  if v_tipo_comprobante = 'FACTURA' then
    if v_cliente_id is null
       or v_cliente.tipo_documento <> 'RUC'
       or length(regexp_replace(coalesce(v_cliente.numero_documento, ''), '\D', '', 'g')) <> 11
       or length(trim(coalesce(v_cliente.nombre_razon_social, ''))) = 0
       or length(trim(coalesce(v_cliente.direccion, ''))) = 0 then
      raise exception 'Para factura selecciona un cliente con RUC, razon social y direccion.';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(v_detalles) loop
    v_producto_id := nullif(v_item ->> 'producto_id', '')::uuid;
    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 0);

    if v_producto_id is null or v_cantidad <= 0 then
      raise exception 'Un producto de la venta tiene cantidad invalida.';
    end if;

    select p.id, p.nombre, p.precio_venta, p.stock, p.activo
    into v_producto
    from productos p
    where p.id = v_producto_id
      and p.empresa_id = v_empresa_id
    for update;

    if not found then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    if v_producto.activo is not true then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    if v_producto.stock < v_cantidad then
      raise exception 'Stock insuficiente para %. Disponible: %, solicitado: %.',
        v_producto.nombre, v_producto.stock, v_cantidad;
    end if;

    v_line_total := round(v_cantidad * v_producto.precio_venta, 2);
    v_total := v_total + v_line_total;
  end loop;

  v_total := round(v_total, 2);
  v_subtotal := round(v_total / 1.18, 2);
  v_igv := round(v_total - v_subtotal, 2);

  if abs(v_total - v_sent_total) > 0.05 then
    raise exception 'El total de la venta cambio. Actualiza el ticket.';
  end if;

  if v_tipo_comprobante = 'BOLETA' and v_total > 700 then
    if v_cliente_id is null
       or v_cliente.tipo_documento = 'SIN_DOCUMENTO'
       or length(regexp_replace(coalesce(v_cliente.numero_documento, ''), '\D', '', 'g')) < 8 then
      raise exception 'Para boletas mayores a S/ 700 selecciona un cliente con documento.';
    end if;
  end if;

  if jsonb_typeof(v_pagos) <> 'array' or jsonb_array_length(v_pagos) = 0 then
    raise exception 'Registra al menos un pago.';
  end if;

  for v_pago in select * from jsonb_array_elements(v_pagos) loop
    v_pago_monto := coalesce((v_pago ->> 'monto')::numeric, 0);
    if v_pago_monto <= 0 then
      raise exception 'El monto de pago debe ser mayor a cero.';
    end if;
    v_pago_total := v_pago_total + v_pago_monto;
  end loop;

  if round(v_pago_total, 2) < v_total then
    raise exception 'El pago registrado es insuficiente.';
  end if;

  insert into ventas(empresa_id, cliente_id, usuario_id, tipo_comprobante, subtotal, igv, total, estado, client_sale_id)
  values(v_empresa_id, v_cliente_id, v_user_id, v_tipo_comprobante, v_subtotal, v_igv, v_total, 'REGISTRADA', v_client_sale_id)
  returning id, created_at into v_venta_id, v_created_at;

  for v_item in select * from jsonb_array_elements(v_detalles) loop
    v_producto_id := (v_item ->> 'producto_id')::uuid;
    v_cantidad := (v_item ->> 'cantidad')::numeric;

    select p.precio_venta
    into v_producto
    from productos p
    where p.id = v_producto_id
      and p.empresa_id = v_empresa_id
    for update;

    v_line_total := round(v_cantidad * v_producto.precio_venta, 2);

    update productos
    set stock = stock - v_cantidad
    where id = v_producto_id
      and empresa_id = v_empresa_id;

    insert into venta_detalle(venta_id, producto_id, cantidad, precio_unitario, descuento, total)
    values(v_venta_id, v_producto_id, v_cantidad, v_producto.precio_venta, 0, v_line_total);
  end loop;

  for v_pago in select * from jsonb_array_elements(v_pagos) loop
    v_pago_metodo := upper(coalesce(v_pago ->> 'metodo', 'EFECTIVO'));
    v_pago_monto := (v_pago ->> 'monto')::numeric;

    insert into pagos(venta_id, metodo, monto, referencia)
    values(v_venta_id, v_pago_metodo, v_pago_monto, nullif(v_pago ->> 'referencia', ''));
  end loop;

  v_serie := coalesce(
    nullif(p_payload ->> 'serie', ''),
    case when v_tipo_comprobante = 'FACTURA' then 'F001' else 'B001' end
  );

  perform pg_advisory_xact_lock(hashtext(v_empresa_id::text || ':' || v_tipo_comprobante || ':' || v_serie));

  select coalesce(max(numero), 0) + 1
  into v_numero
  from comprobantes
  where empresa_id = v_empresa_id
    and tipo_comprobante = v_tipo_comprobante
    and serie = v_serie;

  insert into comprobantes(
    empresa_id,
    venta_id,
    tipo_comprobante,
    serie,
    numero,
    estado,
    proveedor,
    error_mensaje
  )
  values(
    v_empresa_id,
    v_venta_id,
    v_tipo_comprobante,
    v_serie,
    v_numero,
    'PENDIENTE_FACTURACION',
    'LOCAL',
    null
  )
  returning id into v_comprobante_id;

  return jsonb_build_object(
    'venta_id', v_venta_id,
    'comprobante_id', v_comprobante_id,
    'serie', v_serie,
    'numero', v_numero,
    'estado', 'PENDIENTE_FACTURACION',
    'total', v_total,
    'subtotal', v_subtotal,
    'igv', v_igv,
    'created_at', v_created_at,
    'duplicada', false
  );
end;
$$;

create or replace function public.registrar_venta_pos(
  p_cliente_id uuid,
  p_tipo_comprobante text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_detalles jsonb,
  p_pagos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.registrar_venta_pos_json(jsonb_build_object(
    'client_sale_id', gen_random_uuid(),
    'cliente_id', p_cliente_id,
    'tipo_comprobante', p_tipo_comprobante,
    'subtotal', p_subtotal,
    'igv', p_igv,
    'total', p_total,
    'detalles', p_detalles,
    'pagos', p_pagos
  ));
end;
$$;

revoke all on function public.registrar_venta_pos_json(jsonb) from public;
revoke all on function public.registrar_venta_pos(uuid, text, numeric, numeric, numeric, jsonb, jsonb) from public;
grant execute on function public.registrar_venta_pos_json(jsonb) to authenticated;
grant execute on function public.registrar_venta_pos(uuid, text, numeric, numeric, numeric, jsonb, jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
