-- Fase 2: Kardex, inventario valorizado, lotes, combos y reportes base.
-- Ejecutar despues de 20260611100000_phase1_security_nubefact.sql.

create extension if not exists pgcrypto;

alter table productos add column if not exists costo_unitario numeric(10,2) not null default 0;
alter table productos alter column stock_minimo set default 0;
update productos set stock_minimo = 0 where stock_minimo is null;
alter table productos alter column stock_minimo set not null;
update productos
set costo_unitario = coalesce(precio_compra, 0)
where costo_unitario = 0
  and precio_compra is not null;

create table if not exists kardex_movimientos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  producto_id uuid not null references productos(id),
  tipo_movimiento text not null check (
    tipo_movimiento in (
      'ENTRADA',
      'SALIDA',
      'VENTA',
      'AJUSTE_POSITIVO',
      'AJUSTE_NEGATIVO',
      'DEVOLUCION',
      'COMBO',
      'MERMA',
      'VENCIMIENTO'
    )
  ),
  origen text not null,
  referencia_id uuid,
  fecha timestamptz not null default now(),
  cantidad numeric(10,2) not null check (cantidad > 0),
  costo_unitario numeric(10,2) not null default 0,
  costo_total numeric(10,2) not null default 0,
  stock_anterior numeric(10,2) not null,
  stock_nuevo numeric(10,2) not null,
  usuario_id uuid references auth.users(id),
  observacion text,
  created_at timestamptz not null default now()
);

create table if not exists producto_lotes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  producto_id uuid not null references productos(id),
  codigo_lote text not null,
  fecha_vencimiento date not null,
  stock_lote numeric(10,2) not null default 0 check (stock_lote >= 0),
  costo_unitario numeric(10,2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique(empresa_id, producto_id, codigo_lote)
);

create table if not exists combos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  precio_venta numeric(10,2) not null check (precio_venta >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists combo_items (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references combos(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric(10,2) not null check (cantidad > 0),
  unique(combo_id, producto_id)
);

alter table kardex_movimientos enable row level security;
alter table producto_lotes enable row level security;
alter table combos enable row level security;
alter table combo_items enable row level security;

create index if not exists kardex_empresa_producto_fecha_idx
on kardex_movimientos(empresa_id, producto_id, fecha desc);

create index if not exists kardex_empresa_fecha_idx
on kardex_movimientos(empresa_id, fecha desc);

create index if not exists producto_lotes_empresa_vencimiento_idx
on producto_lotes(empresa_id, fecha_vencimiento, activo);

create index if not exists combos_empresa_activo_idx
on combos(empresa_id, activo);

create index if not exists combo_items_combo_idx
on combo_items(combo_id);

drop policy if exists "kardex_select_empresa" on kardex_movimientos;
drop policy if exists "kardex_insert_server" on kardex_movimientos;
drop policy if exists "producto_lotes_select_empresa" on producto_lotes;
drop policy if exists "producto_lotes_insert_admin" on producto_lotes;
drop policy if exists "producto_lotes_update_admin" on producto_lotes;
drop policy if exists "combos_select_empresa" on combos;
drop policy if exists "combos_insert_admin" on combos;
drop policy if exists "combos_update_admin" on combos;
drop policy if exists "combo_items_select_empresa" on combo_items;
drop policy if exists "combo_items_insert_admin" on combo_items;
drop policy if exists "combo_items_update_admin" on combo_items;
drop policy if exists "combo_items_delete_admin" on combo_items;

create policy "kardex_select_empresa"
on kardex_movimientos for select
using (usuario_es_miembro_empresa(empresa_id));

create policy "kardex_insert_server"
on kardex_movimientos for insert
with check (false);

create policy "producto_lotes_select_empresa"
on producto_lotes for select
using (usuario_es_miembro_empresa(empresa_id));

create policy "producto_lotes_insert_admin"
on producto_lotes for insert
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

create policy "producto_lotes_update_admin"
on producto_lotes for update
using (usuario_tiene_rol(empresa_id, array['ADMIN']))
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

create policy "combos_select_empresa"
on combos for select
using (usuario_es_miembro_empresa(empresa_id));

create policy "combos_insert_admin"
on combos for insert
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

create policy "combos_update_admin"
on combos for update
using (usuario_tiene_rol(empresa_id, array['ADMIN']))
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

create policy "combo_items_select_empresa"
on combo_items for select
using (
  exists (
    select 1
    from combos c
    where c.id = combo_items.combo_id
      and usuario_es_miembro_empresa(c.empresa_id)
  )
);

create policy "combo_items_insert_admin"
on combo_items for insert
with check (
  exists (
    select 1
    from combos c
    join productos p on p.id = combo_items.producto_id
    where c.id = combo_items.combo_id
      and p.empresa_id = c.empresa_id
      and usuario_tiene_rol(c.empresa_id, array['ADMIN'])
  )
);

create policy "combo_items_update_admin"
on combo_items for update
using (
  exists (
    select 1
    from combos c
    where c.id = combo_items.combo_id
      and usuario_tiene_rol(c.empresa_id, array['ADMIN'])
  )
)
with check (
  exists (
    select 1
    from combos c
    join productos p on p.id = combo_items.producto_id
    where c.id = combo_items.combo_id
      and p.empresa_id = c.empresa_id
      and usuario_tiene_rol(c.empresa_id, array['ADMIN'])
  )
);

create policy "combo_items_delete_admin"
on combo_items for delete
using (
  exists (
    select 1
    from combos c
    where c.id = combo_items.combo_id
      and usuario_tiene_rol(c.empresa_id, array['ADMIN'])
  )
);

create or replace function public.registrar_ajuste_stock(
  p_producto_id uuid,
  p_tipo_movimiento text,
  p_cantidad numeric,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_empresa_id uuid;
  v_producto record;
  v_stock_anterior numeric;
  v_stock_nuevo numeric;
  v_tipo text := upper(coalesce(p_tipo_movimiento, ''));
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  select ue.empresa_id
  into v_empresa_id
  from usuarios_empresa ue
  where ue.user_id = v_user_id
  limit 1;

  if v_empresa_id is null or not usuario_tiene_rol(v_empresa_id, array['ADMIN']) then
    raise exception 'Tu rol no permite ajustar stock.';
  end if;

  if v_tipo not in ('ENTRADA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'MERMA', 'VENCIMIENTO', 'DEVOLUCION') then
    raise exception 'Tipo de movimiento invalido.';
  end if;

  select p.id, p.stock, p.costo_unitario
  into v_producto
  from productos p
  where p.id = p_producto_id
    and p.empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception 'Producto no encontrado.';
  end if;

  v_stock_anterior := v_producto.stock;

  if v_tipo in ('ENTRADA', 'AJUSTE_POSITIVO', 'DEVOLUCION') then
    v_stock_nuevo := v_stock_anterior + p_cantidad;
  else
    v_stock_nuevo := v_stock_anterior - p_cantidad;
  end if;

  if v_stock_nuevo < 0 then
    raise exception 'El ajuste dejaria stock negativo.';
  end if;

  update productos
  set stock = v_stock_nuevo,
      updated_at = now()
  where id = p_producto_id;

  insert into kardex_movimientos(
    empresa_id,
    producto_id,
    tipo_movimiento,
    origen,
    referencia_id,
    cantidad,
    costo_unitario,
    costo_total,
    stock_anterior,
    stock_nuevo,
    usuario_id,
    observacion
  )
  values(
    v_empresa_id,
    p_producto_id,
    v_tipo,
    'AJUSTE_MANUAL',
    null,
    p_cantidad,
    coalesce(v_producto.costo_unitario, 0),
    round(p_cantidad * coalesce(v_producto.costo_unitario, 0), 2),
    v_stock_anterior,
    v_stock_nuevo,
    v_user_id,
    p_observacion
  );

  return jsonb_build_object(
    'producto_id', p_producto_id,
    'stock_anterior', v_stock_anterior,
    'stock_nuevo', v_stock_nuevo
  );
end;
$$;

create or replace function public.reporte_inventario_valorizado()
returns table (
  producto_id uuid,
  producto text,
  categoria text,
  stock_actual numeric,
  costo_unitario numeric,
  valor_stock numeric,
  precio_venta numeric,
  valor_venta_potencial numeric,
  margen_estimado numeric,
  estado_stock text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.nombre,
    coalesce(c.nombre, 'General'),
    p.stock,
    coalesce(p.costo_unitario, 0),
    round(p.stock * coalesce(p.costo_unitario, 0), 2),
    p.precio_venta,
    round(p.stock * p.precio_venta, 2),
    round((p.precio_venta - coalesce(p.costo_unitario, 0)) * p.stock, 2),
    case
      when p.stock = 0 then 'CRITICO'
      when p.stock < p.stock_minimo then 'ALTO'
      when p.stock = p.stock_minimo and p.stock_minimo > 0 then 'MEDIO'
      else 'OK'
    end
  from productos p
  left join categorias c on c.id = p.categoria_id
  where usuario_tiene_rol(p.empresa_id, array['ADMIN', 'CAJERO'])
    and p.activo is true
  order by p.nombre;
$$;

create or replace function public.reporte_stock_minimo()
returns table (
  producto_id uuid,
  producto text,
  categoria text,
  stock_actual numeric,
  stock_minimo numeric,
  estado_stock text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.nombre,
    coalesce(c.nombre, 'General'),
    p.stock,
    p.stock_minimo,
    case
      when p.stock = 0 then 'CRITICO'
      when p.stock < p.stock_minimo then 'ALTO'
      when p.stock = p.stock_minimo and p.stock_minimo > 0 then 'MEDIO'
      else 'OK'
    end
  from productos p
  left join categorias c on c.id = p.categoria_id
  where usuario_tiene_rol(p.empresa_id, array['ADMIN', 'CAJERO'])
    and p.activo is true
    and p.stock <= p.stock_minimo
  order by p.stock asc, p.nombre;
$$;

create or replace function public.reporte_productos_vencimiento(p_dias integer default 30)
returns table (
  lote_id uuid,
  producto_id uuid,
  producto text,
  codigo_lote text,
  fecha_vencimiento date,
  stock_lote numeric,
  costo_unitario numeric,
  estado_vencimiento text
)
language sql
security definer
set search_path = public
as $$
  select
    l.id,
    p.id,
    p.nombre,
    l.codigo_lote,
    l.fecha_vencimiento,
    l.stock_lote,
    l.costo_unitario,
    case
      when l.fecha_vencimiento < current_date then 'VENCIDO'
      when l.fecha_vencimiento <= current_date + interval '7 days' then 'POR_VENCER_7'
      when l.fecha_vencimiento <= current_date + interval '15 days' then 'POR_VENCER_15'
      when l.fecha_vencimiento <= current_date + make_interval(days => p_dias) then 'POR_VENCER_30'
      else 'VIGENTE'
    end
  from producto_lotes l
  join productos p on p.id = l.producto_id
  where usuario_tiene_rol(l.empresa_id, array['ADMIN', 'CAJERO'])
    and l.activo is true
    and l.stock_lote > 0
    and l.fecha_vencimiento <= current_date + make_interval(days => p_dias)
  order by l.fecha_vencimiento asc, p.nombre;
$$;

create or replace function public.reporte_ventas_metodo_pago(p_desde date default null, p_hasta date default null)
returns table (
  metodo text,
  operaciones bigint,
  total numeric
)
language sql
security definer
set search_path = public
as $$
  select
    pg.metodo,
    count(*)::bigint,
    coalesce(sum(pg.monto), 0)
  from pagos pg
  join ventas v on v.id = pg.venta_id
  where usuario_tiene_rol(v.empresa_id, array['ADMIN', 'CAJERO'])
    and (p_desde is null or v.created_at >= p_desde)
    and (p_hasta is null or v.created_at < p_hasta + 1)
  group by pg.metodo
  order by 3 desc;
$$;

create or replace function public.reporte_productos_mas_vendidos(p_desde date default null, p_hasta date default null, p_limite integer default 10)
returns table (
  producto_id uuid,
  producto text,
  cantidad numeric,
  total numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.nombre,
    coalesce(sum(vd.cantidad), 0),
    coalesce(sum(vd.total), 0)
  from venta_detalle vd
  join ventas v on v.id = vd.venta_id
  join productos p on p.id = vd.producto_id
  where usuario_tiene_rol(v.empresa_id, array['ADMIN', 'CAJERO'])
    and (p_desde is null or v.created_at >= p_desde)
    and (p_hasta is null or v.created_at < p_hasta + 1)
  group by p.id, p.nombre
  order by 3 desc, 4 desc
  limit greatest(coalesce(p_limite, 10), 1);
$$;

create or replace function public.reporte_comprobantes_estado(p_desde date default null, p_hasta date default null)
returns table (
  estado text,
  cantidad bigint,
  total numeric
)
language sql
security definer
set search_path = public
as $$
  select
    c.estado,
    count(*)::bigint,
    coalesce(sum(v.total), 0)
  from comprobantes c
  join ventas v on v.id = c.venta_id
  where usuario_tiene_rol(c.empresa_id, array['ADMIN', 'CAJERO'])
    and (p_desde is null or c.created_at >= p_desde)
    and (p_hasta is null or c.created_at < p_hasta + 1)
  group by c.estado
  order by 2 desc;
$$;

create or replace function public.reporte_ingresos_egresos(p_desde date default null, p_hasta date default null)
returns table (
  tipo text,
  operaciones bigint,
  total numeric
)
language sql
security definer
set search_path = public
as $$
  select
    cm.tipo,
    count(*)::bigint,
    coalesce(sum(cm.monto), 0)
  from caja_movimientos cm
  join caja_turnos ct on ct.id = cm.turno_id
  where usuario_tiene_rol(ct.empresa_id, array['ADMIN', 'CAJERO'])
    and (p_desde is null or cm.created_at >= p_desde)
    and (p_hasta is null or cm.created_at < p_hasta + 1)
  group by cm.tipo
  order by cm.tipo;
$$;

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
  v_stock_anterior numeric;
  v_stock_nuevo numeric;
  v_costo_unitario numeric;
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

    if not found or v_producto.activo is not true then
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

    select p.precio_venta, p.stock, p.costo_unitario
    into v_producto
    from productos p
    where p.id = v_producto_id
      and p.empresa_id = v_empresa_id
    for update;

    v_stock_anterior := v_producto.stock;
    v_stock_nuevo := v_stock_anterior - v_cantidad;
    v_costo_unitario := coalesce(v_producto.costo_unitario, 0);
    v_line_total := round(v_cantidad * v_producto.precio_venta, 2);

    if v_stock_nuevo < 0 then
      raise exception 'Stock insuficiente.';
    end if;

    update productos
    set stock = v_stock_nuevo,
        updated_at = now()
    where id = v_producto_id
      and empresa_id = v_empresa_id;

    insert into venta_detalle(venta_id, producto_id, cantidad, precio_unitario, descuento, total)
    values(v_venta_id, v_producto_id, v_cantidad, v_producto.precio_venta, 0, v_line_total);

    insert into kardex_movimientos(
      empresa_id,
      producto_id,
      tipo_movimiento,
      origen,
      referencia_id,
      cantidad,
      costo_unitario,
      costo_total,
      stock_anterior,
      stock_nuevo,
      usuario_id,
      observacion
    )
    values(
      v_empresa_id,
      v_producto_id,
      'VENTA',
      'POS',
      v_venta_id,
      v_cantidad,
      v_costo_unitario,
      round(v_cantidad * v_costo_unitario, 2),
      v_stock_anterior,
      v_stock_nuevo,
      v_user_id,
      'Salida por venta POS'
    );
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

revoke all on function public.registrar_ajuste_stock(uuid, text, numeric, text) from public;
revoke all on function public.reporte_inventario_valorizado() from public;
revoke all on function public.reporte_stock_minimo() from public;
revoke all on function public.reporte_productos_vencimiento(integer) from public;
revoke all on function public.reporte_ventas_metodo_pago(date, date) from public;
revoke all on function public.reporte_productos_mas_vendidos(date, date, integer) from public;
revoke all on function public.reporte_comprobantes_estado(date, date) from public;
revoke all on function public.reporte_ingresos_egresos(date, date) from public;

grant execute on function public.registrar_ajuste_stock(uuid, text, numeric, text) to authenticated;
grant execute on function public.reporte_inventario_valorizado() to authenticated;
grant execute on function public.reporte_stock_minimo() to authenticated;
grant execute on function public.reporte_productos_vencimiento(integer) to authenticated;
grant execute on function public.reporte_ventas_metodo_pago(date, date) to authenticated;
grant execute on function public.reporte_productos_mas_vendidos(date, date, integer) to authenticated;
grant execute on function public.reporte_comprobantes_estado(date, date) to authenticated;
grant execute on function public.reporte_ingresos_egresos(date, date) to authenticated;

select pg_notify('pgrst', 'reload schema');
