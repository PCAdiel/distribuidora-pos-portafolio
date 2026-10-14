-- Fase 3: combos en POS, lotes gestionables y Kardex visible.
-- Ejecutar despues de 20260611110000_phase2_kardex_inventory_reports.sql.

alter table venta_detalle add column if not exists tipo_item text not null default 'PRODUCTO';
alter table venta_detalle add column if not exists combo_id uuid references combos(id);
alter table venta_detalle add column if not exists descripcion text;

do $$
begin
  alter table venta_detalle
    add constraint venta_detalle_tipo_item_chk
    check (tipo_item in ('PRODUCTO', 'COMBO'));
exception
  when duplicate_object then null;
end $$;

create index if not exists venta_detalle_combo_id_idx on venta_detalle(combo_id);
create index if not exists producto_lotes_producto_activo_idx on producto_lotes(producto_id, activo);

create or replace function public.listar_combos_pos()
returns table (
  combo_id uuid,
  nombre text,
  descripcion text,
  precio_venta numeric,
  activo boolean,
  stock_disponible numeric,
  componentes jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_empresa_id uuid;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select ue.empresa_id
  into v_empresa_id
  from usuarios_empresa ue
  where ue.user_id = v_user_id
  limit 1;

  if v_empresa_id is null then
    raise exception 'El usuario no esta asociado a una empresa.';
  end if;

  return query
  select
    c.id as combo_id,
    c.nombre,
    c.descripcion,
    c.precio_venta,
    c.activo,
    coalesce(floor(min(p.stock / nullif(ci.cantidad, 0))), 0)::numeric as stock_disponible,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'producto_id', p.id,
          'producto', p.nombre,
          'cantidad', ci.cantidad,
          'stock', p.stock
        )
        order by p.nombre
      ) filter (where ci.id is not null),
      '[]'::jsonb
    ) as componentes
  from combos c
  join combo_items ci on ci.combo_id = c.id
  join productos p on p.id = ci.producto_id and p.empresa_id = c.empresa_id
  where c.empresa_id = v_empresa_id
    and c.activo = true
    and p.activo = true
  group by c.id, c.nombre, c.descripcion, c.precio_venta, c.activo
  order by c.nombre;
end;
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
  v_combo record;
  v_combo_id uuid;
  v_componente record;
  v_tipo_item text;
  v_cantidad numeric;
  v_cantidad_componente numeric;
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
    v_tipo_item := upper(coalesce(
      nullif(v_item ->> 'tipo_item', ''),
      nullif(v_item ->> 'tipo', ''),
      case when v_item ? 'combo_id' then 'COMBO' else 'PRODUCTO' end
    ));
    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 0);

    if v_cantidad <= 0 then
      raise exception 'Un item de la venta tiene cantidad invalida.';
    end if;

    if v_tipo_item = 'PRODUCTO' then
      v_producto_id := nullif(v_item ->> 'producto_id', '')::uuid;

      if v_producto_id is null then
        raise exception 'Un producto de la venta tiene ID invalido.';
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
    elsif v_tipo_item = 'COMBO' then
      v_combo_id := nullif(v_item ->> 'combo_id', '')::uuid;

      if v_combo_id is null then
        raise exception 'Un combo de la venta tiene ID invalido.';
      end if;

      select c.id, c.nombre, c.precio_venta, c.activo
      into v_combo
      from combos c
      where c.id = v_combo_id
        and c.empresa_id = v_empresa_id;

      if not found or v_combo.activo is not true then
        raise exception 'Combo no encontrado o inactivo.';
      end if;

      if not exists (select 1 from combo_items ci where ci.combo_id = v_combo_id) then
        raise exception 'El combo % no tiene productos configurados.', v_combo.nombre;
      end if;

      for v_componente in
        select p.id, p.nombre, p.stock, p.activo, ci.cantidad
        from combo_items ci
        join productos p on p.id = ci.producto_id
        where ci.combo_id = v_combo_id
          and p.empresa_id = v_empresa_id
        for update of p
      loop
        if v_componente.activo is not true then
          raise exception 'El producto % del combo esta inactivo.', v_componente.nombre;
        end if;

        v_cantidad_componente := v_cantidad * v_componente.cantidad;

        if v_componente.stock < v_cantidad_componente then
          raise exception 'Stock insuficiente para combo %. Producto: %, disponible: %, solicitado: %.',
            v_combo.nombre, v_componente.nombre, v_componente.stock, v_cantidad_componente;
        end if;
      end loop;

      v_line_total := round(v_cantidad * v_combo.precio_venta, 2);
      v_total := v_total + v_line_total;
    else
      raise exception 'Tipo de item invalido.';
    end if;
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
    v_tipo_item := upper(coalesce(
      nullif(v_item ->> 'tipo_item', ''),
      nullif(v_item ->> 'tipo', ''),
      case when v_item ? 'combo_id' then 'COMBO' else 'PRODUCTO' end
    ));
    v_cantidad := (v_item ->> 'cantidad')::numeric;

    if v_tipo_item = 'PRODUCTO' then
      v_producto_id := (v_item ->> 'producto_id')::uuid;

      select p.id, p.nombre, p.precio_venta, p.stock, p.costo_unitario
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

      insert into venta_detalle(venta_id, producto_id, combo_id, tipo_item, descripcion, cantidad, precio_unitario, descuento, total)
      values(v_venta_id, v_producto_id, null, 'PRODUCTO', v_producto.nombre, v_cantidad, v_producto.precio_venta, 0, v_line_total);

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
    elsif v_tipo_item = 'COMBO' then
      v_combo_id := (v_item ->> 'combo_id')::uuid;

      select c.id, c.nombre, c.precio_venta
      into v_combo
      from combos c
      where c.id = v_combo_id
        and c.empresa_id = v_empresa_id;

      v_line_total := round(v_cantidad * v_combo.precio_venta, 2);

      insert into venta_detalle(venta_id, producto_id, combo_id, tipo_item, descripcion, cantidad, precio_unitario, descuento, total)
      values(v_venta_id, null, v_combo_id, 'COMBO', v_combo.nombre, v_cantidad, v_combo.precio_venta, 0, v_line_total);

      for v_componente in
        select p.id, p.nombre, p.stock, p.costo_unitario, ci.cantidad
        from combo_items ci
        join productos p on p.id = ci.producto_id
        where ci.combo_id = v_combo_id
          and p.empresa_id = v_empresa_id
        for update of p
      loop
        v_cantidad_componente := v_cantidad * v_componente.cantidad;
        v_stock_anterior := v_componente.stock;
        v_stock_nuevo := v_stock_anterior - v_cantidad_componente;
        v_costo_unitario := coalesce(v_componente.costo_unitario, 0);

        if v_stock_nuevo < 0 then
          raise exception 'Stock insuficiente para combo.';
        end if;

        update productos
        set stock = v_stock_nuevo,
            updated_at = now()
        where id = v_componente.id
          and empresa_id = v_empresa_id;

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
          v_componente.id,
          'COMBO',
          'POS_COMBO',
          v_venta_id,
          v_cantidad_componente,
          v_costo_unitario,
          round(v_cantidad_componente * v_costo_unitario, 2),
          v_stock_anterior,
          v_stock_nuevo,
          v_user_id,
          'Salida por combo: ' || v_combo.nombre
        );
      end loop;
    end if;
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

revoke all on function public.listar_combos_pos() from public;
grant execute on function public.listar_combos_pos() to authenticated;
grant execute on function public.registrar_venta_pos_json(jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
