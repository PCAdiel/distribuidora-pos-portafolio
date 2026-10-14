-- Supabase PostgreSQL - esquema inicial para distribuidora POS
create extension if not exists pgcrypto;

create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  ruc varchar(11) not null unique,
  razon_social text not null,
  direccion text,
  telefono text,
  logo_url text,
  created_at timestamptz default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

insert into roles(nombre) values ('ADMIN'), ('CAJERO'), ('VENDEDOR'), ('EMPLEADO') on conflict do nothing;

create table if not exists usuarios_empresa (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  rol text not null default 'EMPLEADO',
  nombre text,
  correo text,
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz default now(),
  unique(user_id, empresa_id)
);

create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nombre text not null,
  created_at timestamptz default now()
);

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  categoria_id uuid references categorias(id),
  nombre text not null,
  descripcion text,
  unidad_medida text default 'NIU',
  precio_venta numeric(10,2) not null,
  precio_compra numeric(10,2),
  stock numeric(10,2) default 0,
  stock_minimo numeric(10,2) default 0,
  imagen_url text,
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  tipo_documento text default 'DNI',
  numero_documento text not null,
  nombre_razon_social text not null,
  direccion text,
  telefono text,
  correo text,
  created_at timestamptz default now()
);

create table if not exists ventas (
  id uuid primary key default gen_random_uuid(),
  client_sale_id uuid not null default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  cliente_id uuid references clientes(id),
  usuario_id uuid references auth.users(id),
  tipo_comprobante text not null check (tipo_comprobante in ('BOLETA','FACTURA')),
  subtotal numeric(10,2) not null,
  igv numeric(10,2) not null,
  total numeric(10,2) not null,
  estado text default 'REGISTRADA',
  created_at timestamptz default now()
);

create table if not exists venta_detalle (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references ventas(id) on delete cascade,
  producto_id uuid references productos(id),
  cantidad numeric(10,2) not null,
  precio_unitario numeric(10,2) not null,
  descuento numeric(10,2) default 0,
  total numeric(10,2) not null
);

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references ventas(id) on delete cascade,
  metodo text not null,
  monto numeric(10,2) not null,
  referencia text,
  created_at timestamptz default now()
);

create table if not exists comprobantes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  venta_id uuid references ventas(id) on delete cascade,
  tipo_comprobante text not null,
  serie varchar(4) not null,
  numero integer not null,
  estado text default 'PENDIENTE',
  proveedor text,
  proveedor_id text,
  pdf_url text,
  xml_url text,
  cdr_url text,
  estado_sunat text,
  respuesta_sunat jsonb,
  ticket_anulacion text,
  sunat_description text,
  sunat_note text,
  sunat_responsecode text,
  sunat_soap_error text,
  cadena_para_codigo_qr text,
  codigo_hash text,
  error_mensaje text,
  updated_at timestamptz not null default now(),
  created_at timestamptz default now(),
  unique(empresa_id, tipo_comprobante, serie, numero)
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid references clientes(id),
  title text not null default 'Ticket',
  description text,
  status text not null default 'ABIERTO' check (status in ('ABIERTO','COBRADO','CANCELADO')),
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  igv numeric(10,2) not null default 0 check (igv >= 0),
  total numeric(10,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  producto_id uuid references productos(id),
  producto_local_id text not null,
  nombre text not null,
  description text,
  quantity numeric(10,2) not null check (quantity > 0),
  price numeric(10,2) not null check (price >= 0),
  total numeric(10,2) not null check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ticket_id, producto_local_id)
);

alter table ticket_items alter column producto_id drop not null;
alter table ticket_items add column if not exists producto_local_id text;
update ticket_items set producto_local_id = producto_id::text where producto_local_id is null;
alter table ticket_items alter column producto_local_id set not null;
alter table ticket_items drop constraint if exists ticket_items_ticket_id_producto_id_key;
create unique index if not exists ticket_items_ticket_producto_local_idx
on ticket_items(ticket_id, producto_local_id);
create unique index if not exists ventas_empresa_client_sale_id_uidx
on ventas(empresa_id, client_sale_id);
create unique index if not exists comprobantes_empresa_tipo_serie_numero_uidx
on comprobantes(empresa_id, tipo_comprobante, serie, numero);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tickets_set_updated_at on tickets;
create trigger tickets_set_updated_at
before update on tickets
for each row execute function set_updated_at();

drop trigger if exists ticket_items_set_updated_at on ticket_items;
create trigger ticket_items_set_updated_at
before update on ticket_items
for each row execute function set_updated_at();

drop trigger if exists usuarios_empresa_set_updated_at on usuarios_empresa;
create trigger usuarios_empresa_set_updated_at
before update on usuarios_empresa
for each row execute function set_updated_at();

alter table empresas enable row level security;
alter table usuarios_empresa enable row level security;
alter table categorias enable row level security;
alter table productos enable row level security;
alter table clientes enable row level security;
alter table ventas enable row level security;
alter table venta_detalle enable row level security;
alter table pagos enable row level security;
alter table comprobantes enable row level security;
alter table tickets enable row level security;
alter table ticket_items enable row level security;

-- Ejemplo de política base por empresa. Repite el patrón por tabla.
drop policy if exists "productos_select_empresa" on productos;
drop policy if exists "productos_insert_empresa" on productos;
drop policy if exists "productos_update_empresa" on productos;
drop policy if exists "tickets_select_owner_empresa" on tickets;
drop policy if exists "tickets_insert_owner_empresa" on tickets;
drop policy if exists "tickets_update_owner_empresa" on tickets;
drop policy if exists "tickets_delete_owner_empresa" on tickets;
drop policy if exists "ticket_items_select_owner_ticket" on ticket_items;
drop policy if exists "ticket_items_insert_owner_ticket" on ticket_items;
drop policy if exists "ticket_items_update_owner_ticket" on ticket_items;
drop policy if exists "ticket_items_delete_owner_ticket" on ticket_items;

create policy "productos_select_empresa"
on productos for select
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "productos_insert_empresa"
on productos for insert
with check (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "productos_update_empresa"
on productos for update
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "tickets_select_owner_empresa"
on tickets for select
using (
  user_id = auth.uid()
  and empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "tickets_insert_owner_empresa"
on tickets for insert
with check (
  user_id = auth.uid()
  and empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "tickets_update_owner_empresa"
on tickets for update
using (
  user_id = auth.uid()
  and empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "tickets_delete_owner_empresa"
on tickets for delete
using (
  user_id = auth.uid()
  and empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "ticket_items_select_owner_ticket"
on ticket_items for select
using (
  ticket_id in (
    select id from tickets
    where user_id = auth.uid()
      and empresa_id in (
        select empresa_id from usuarios_empresa where user_id = auth.uid()
      )
  )
);

create policy "ticket_items_insert_owner_ticket"
on ticket_items for insert
with check (
  ticket_id in (
    select id from tickets
    where user_id = auth.uid()
      and empresa_id in (
        select empresa_id from usuarios_empresa where user_id = auth.uid()
      )
  )
);

create policy "ticket_items_update_owner_ticket"
on ticket_items for update
using (
  ticket_id in (
    select id from tickets
    where user_id = auth.uid()
      and empresa_id in (
        select empresa_id from usuarios_empresa where user_id = auth.uid()
      )
  )
)
with check (
  ticket_id in (
    select id from tickets
    where user_id = auth.uid()
      and empresa_id in (
        select empresa_id from usuarios_empresa where user_id = auth.uid()
      )
  )
);

create policy "ticket_items_delete_owner_ticket"
on ticket_items for delete
using (
  ticket_id in (
    select id from tickets
    where user_id = auth.uid()
      and empresa_id in (
        select empresa_id from usuarios_empresa where user_id = auth.uid()
      )
  )
);

alter table empresas add column if not exists correo text;
alter table empresas add column if not exists nombre_comercial text;
alter table empresas add column if not exists updated_at timestamptz not null default now();
alter table productos add column if not exists updated_at timestamptz not null default now();
alter table clientes add column if not exists updated_at timestamptz not null default now();
alter table ventas add column if not exists updated_at timestamptz not null default now();
alter table comprobantes add column if not exists updated_at timestamptz not null default now();

create table if not exists caja_turnos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid references auth.users(id),
  numero integer not null,
  responsable text not null,
  estado text not null default 'ABIERTA' check (estado in ('ABIERTA','CERRADA')),
  monto_inicial numeric(10,2) not null default 0 check (monto_inicial >= 0),
  monto_final numeric(10,2) check (monto_final >= 0),
  abierto_en timestamptz not null default now(),
  cerrado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references caja_turnos(id) on delete cascade,
  tipo text not null check (tipo in ('INGRESO','EGRESO')),
  descripcion text not null,
  monto numeric(10,2) not null check (monto >= 0),
  created_at timestamptz not null default now()
);

alter table caja_turnos enable row level security;
alter table caja_movimientos enable row level security;

create unique index if not exists categorias_empresa_nombre_idx
on categorias(empresa_id, nombre);

drop trigger if exists empresas_set_updated_at on empresas;
create trigger empresas_set_updated_at
before update on empresas
for each row execute function set_updated_at();

drop trigger if exists productos_set_updated_at on productos;
create trigger productos_set_updated_at
before update on productos
for each row execute function set_updated_at();

drop trigger if exists clientes_set_updated_at on clientes;
create trigger clientes_set_updated_at
before update on clientes
for each row execute function set_updated_at();

drop trigger if exists ventas_set_updated_at on ventas;
create trigger ventas_set_updated_at
before update on ventas
for each row execute function set_updated_at();

drop trigger if exists comprobantes_set_updated_at on comprobantes;
create trigger comprobantes_set_updated_at
before update on comprobantes
for each row execute function set_updated_at();

drop trigger if exists caja_turnos_set_updated_at on caja_turnos;
create trigger caja_turnos_set_updated_at
before update on caja_turnos
for each row execute function set_updated_at();

drop policy if exists "empresas_select_miembro" on empresas;
drop policy if exists "empresas_insert_authenticated" on empresas;
drop policy if exists "empresas_update_miembro" on empresas;
drop policy if exists "usuarios_empresa_select_self" on usuarios_empresa;
drop policy if exists "usuarios_empresa_insert_self" on usuarios_empresa;
drop policy if exists "usuarios_empresa_update_self" on usuarios_empresa;
drop policy if exists "categorias_select_empresa" on categorias;
drop policy if exists "categorias_insert_empresa" on categorias;
drop policy if exists "categorias_update_empresa" on categorias;
drop policy if exists "clientes_select_empresa" on clientes;
drop policy if exists "clientes_insert_empresa" on clientes;
drop policy if exists "clientes_update_empresa" on clientes;
drop policy if exists "clientes_delete_empresa" on clientes;
drop policy if exists "ventas_select_empresa" on ventas;
drop policy if exists "ventas_insert_empresa" on ventas;
drop policy if exists "ventas_update_empresa" on ventas;
drop policy if exists "venta_detalle_select_empresa" on venta_detalle;
drop policy if exists "venta_detalle_insert_empresa" on venta_detalle;
drop policy if exists "venta_detalle_update_empresa" on venta_detalle;
drop policy if exists "pagos_select_empresa" on pagos;
drop policy if exists "pagos_insert_empresa" on pagos;
drop policy if exists "pagos_update_empresa" on pagos;
drop policy if exists "comprobantes_select_empresa" on comprobantes;
drop policy if exists "comprobantes_insert_empresa" on comprobantes;
drop policy if exists "comprobantes_update_empresa" on comprobantes;
drop policy if exists "caja_turnos_select_empresa" on caja_turnos;
drop policy if exists "caja_turnos_insert_empresa" on caja_turnos;
drop policy if exists "caja_turnos_update_empresa" on caja_turnos;
drop policy if exists "caja_movimientos_select_empresa" on caja_movimientos;
drop policy if exists "caja_movimientos_insert_empresa" on caja_movimientos;

create policy "usuarios_empresa_select_self"
on usuarios_empresa for select
using (user_id = auth.uid());

create policy "usuarios_empresa_insert_self"
on usuarios_empresa for insert
with check (user_id = auth.uid());

create policy "usuarios_empresa_update_self"
on usuarios_empresa for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "empresas_select_miembro"
on empresas for select
using (
  id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "empresas_insert_authenticated"
on empresas for insert
with check (auth.role() = 'authenticated');

create policy "empresas_update_miembro"
on empresas for update
using (
  id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
)
with check (
  id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "categorias_select_empresa"
on categorias for select
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "categorias_insert_empresa"
on categorias for insert
with check (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "categorias_update_empresa"
on categorias for update
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
)
with check (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "clientes_select_empresa"
on clientes for select
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "clientes_insert_empresa"
on clientes for insert
with check (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "clientes_update_empresa"
on clientes for update
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
)
with check (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "clientes_delete_empresa"
on clientes for delete
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "ventas_select_empresa"
on ventas for select
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "ventas_insert_empresa"
on ventas for insert
with check (
  usuario_id = auth.uid()
  and empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "venta_detalle_select_empresa"
on venta_detalle for select
using (
  venta_id in (
    select id from ventas
    where empresa_id in (
      select empresa_id from usuarios_empresa where user_id = auth.uid()
    )
  )
);

create policy "venta_detalle_insert_empresa"
on venta_detalle for insert
with check (
  venta_id in (
    select id from ventas
    where empresa_id in (
      select empresa_id from usuarios_empresa where user_id = auth.uid()
    )
  )
);

create policy "pagos_select_empresa"
on pagos for select
using (
  venta_id in (
    select id from ventas
    where empresa_id in (
      select empresa_id from usuarios_empresa where user_id = auth.uid()
    )
  )
);

create policy "pagos_insert_empresa"
on pagos for insert
with check (
  venta_id in (
    select id from ventas
    where empresa_id in (
      select empresa_id from usuarios_empresa where user_id = auth.uid()
    )
  )
);

create policy "comprobantes_select_empresa"
on comprobantes for select
using (
  venta_id in (
    select id from ventas
    where empresa_id in (
      select empresa_id from usuarios_empresa where user_id = auth.uid()
    )
  )
);

create policy "comprobantes_insert_empresa"
on comprobantes for insert
with check (
  venta_id in (
    select id from ventas
    where empresa_id in (
      select empresa_id from usuarios_empresa where user_id = auth.uid()
    )
  )
);

create policy "caja_turnos_select_empresa"
on caja_turnos for select
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "caja_turnos_insert_empresa"
on caja_turnos for insert
with check (
  user_id = auth.uid()
  and empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "caja_turnos_update_empresa"
on caja_turnos for update
using (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
)
with check (
  empresa_id in (
    select empresa_id from usuarios_empresa where user_id = auth.uid()
  )
);

create policy "caja_movimientos_select_empresa"
on caja_movimientos for select
using (
  turno_id in (
    select id from caja_turnos
    where empresa_id in (
      select empresa_id from usuarios_empresa where user_id = auth.uid()
    )
  )
);

create policy "caja_movimientos_insert_empresa"
on caja_movimientos for insert
with check (
  turno_id in (
    select id from caja_turnos
    where empresa_id in (
      select empresa_id from usuarios_empresa where user_id = auth.uid()
    )
  )
);

-- Endurecimiento para producción: roles, RLS y venta transaccional.
alter table empresas add column if not exists created_by uuid references auth.users(id);
alter table usuarios_empresa drop constraint if exists usuarios_empresa_rol_check;
alter table usuarios_empresa add constraint usuarios_empresa_rol_check
check (rol in ('ADMIN', 'CAJERO', 'VENDEDOR', 'EMPLEADO'));

update empresas e
set created_by = ue.user_id
from usuarios_empresa ue
where ue.empresa_id = e.id
  and e.created_by is null
  and ue.rol = 'ADMIN';

create or replace function usuario_es_miembro_empresa(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from usuarios_empresa ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = p_empresa_id
      and coalesce(ue.activo, true)
  );
$$;

create or replace function usuario_tiene_rol(p_empresa_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from usuarios_empresa ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = p_empresa_id
      and ue.rol = any(p_roles)
      and coalesce(ue.activo, true)
  );
$$;

create or replace function usuario_sin_empresa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from usuarios_empresa ue
    where ue.user_id = auth.uid()
  );
$$;

create or replace function empresa_creada_por_usuario(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from empresas e
    where e.id = p_empresa_id
      and e.created_by = auth.uid()
  );
$$;

revoke all on function usuario_es_miembro_empresa(uuid) from public;
revoke all on function usuario_tiene_rol(uuid, text[]) from public;
revoke all on function usuario_sin_empresa() from public;
revoke all on function empresa_creada_por_usuario(uuid) from public;
grant execute on function usuario_es_miembro_empresa(uuid) to authenticated;
grant execute on function usuario_tiene_rol(uuid, text[]) to authenticated;
grant execute on function usuario_sin_empresa() to authenticated;
grant execute on function empresa_creada_por_usuario(uuid) to authenticated;

drop policy if exists "usuarios_empresa_select_self" on usuarios_empresa;
drop policy if exists "usuarios_empresa_insert_self" on usuarios_empresa;
drop policy if exists "usuarios_empresa_update_self" on usuarios_empresa;
drop policy if exists "usuarios_empresa_select_miembro_o_admin" on usuarios_empresa;
drop policy if exists "usuarios_empresa_insert_bootstrap" on usuarios_empresa;
drop policy if exists "usuarios_empresa_update_admin" on usuarios_empresa;

create policy "usuarios_empresa_select_miembro_o_admin"
on usuarios_empresa for select
using (
  user_id = auth.uid()
  or usuario_tiene_rol(empresa_id, array['ADMIN'])
);

create policy "usuarios_empresa_insert_bootstrap"
on usuarios_empresa for insert
with check (
  user_id = auth.uid()
  and rol = 'ADMIN'
  and usuario_sin_empresa()
  and empresa_creada_por_usuario(empresa_id)
);

create policy "usuarios_empresa_update_admin"
on usuarios_empresa for update
using (usuario_tiene_rol(empresa_id, array['ADMIN']))
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

drop policy if exists "empresas_insert_authenticated" on empresas;
drop policy if exists "empresas_update_miembro" on empresas;
drop policy if exists "empresas_insert_owner" on empresas;
drop policy if exists "empresas_update_admin" on empresas;

create policy "empresas_insert_owner"
on empresas for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

create policy "empresas_update_admin"
on empresas for update
using (usuario_tiene_rol(id, array['ADMIN']))
with check (usuario_tiene_rol(id, array['ADMIN']));

drop policy if exists "productos_insert_empresa" on productos;
drop policy if exists "productos_update_empresa" on productos;
drop policy if exists "productos_insert_admin" on productos;
drop policy if exists "productos_update_admin" on productos;

create policy "productos_insert_admin"
on productos for insert
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

create policy "productos_update_admin"
on productos for update
using (usuario_tiene_rol(empresa_id, array['ADMIN']))
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

drop policy if exists "categorias_insert_empresa" on categorias;
drop policy if exists "categorias_update_empresa" on categorias;
drop policy if exists "categorias_insert_admin" on categorias;
drop policy if exists "categorias_update_admin" on categorias;

create policy "categorias_insert_admin"
on categorias for insert
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

create policy "categorias_update_admin"
on categorias for update
using (usuario_tiene_rol(empresa_id, array['ADMIN']))
with check (usuario_tiene_rol(empresa_id, array['ADMIN']));

drop policy if exists "ventas_insert_empresa" on ventas;
drop policy if exists "ventas_insert_operador" on ventas;

create policy "ventas_insert_operador"
on ventas for insert
with check (
  usuario_id = auth.uid()
  and usuario_tiene_rol(empresa_id, array['ADMIN', 'CAJERO', 'VENDEDOR', 'EMPLEADO'])
);

drop policy if exists "caja_turnos_insert_empresa" on caja_turnos;
drop policy if exists "caja_turnos_update_empresa" on caja_turnos;
drop policy if exists "caja_turnos_insert_cajero" on caja_turnos;
drop policy if exists "caja_turnos_update_cajero" on caja_turnos;

create policy "caja_turnos_insert_cajero"
on caja_turnos for insert
with check (
  user_id = auth.uid()
  and usuario_tiene_rol(empresa_id, array['ADMIN', 'CAJERO'])
);

create policy "caja_turnos_update_cajero"
on caja_turnos for update
using (usuario_tiene_rol(empresa_id, array['ADMIN', 'CAJERO']))
with check (usuario_tiene_rol(empresa_id, array['ADMIN', 'CAJERO']));

create or replace function registrar_venta_pos(
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
declare
  v_user_id uuid := auth.uid();
  v_empresa_id uuid;
  v_rol text;
  v_venta_id uuid;
  v_created_at timestamptz;
  v_item jsonb;
  v_pago jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_precio numeric;
  v_total_item numeric;
  v_stock numeric;
  v_pago_monto numeric;
  v_pago_metodo text;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para registrar ventas.';
  end if;

  select ue.empresa_id, ue.rol
  into v_empresa_id, v_rol
  from usuarios_empresa ue
  where ue.user_id = v_user_id
  limit 1;

  if v_empresa_id is null then
    raise exception 'El usuario no está asociado a una empresa.';
  end if;

  if v_rol not in ('ADMIN', 'CAJERO', 'VENDEDOR', 'EMPLEADO') then
    raise exception 'Tu rol no permite registrar ventas.';
  end if;

  if p_tipo_comprobante not in ('BOLETA', 'FACTURA') then
    raise exception 'Tipo de comprobante inválido.';
  end if;

  if p_total <= 0 or p_subtotal < 0 or p_igv < 0 then
    raise exception 'Los importes de la venta no son válidos.';
  end if;

  if jsonb_typeof(p_detalles) <> 'array' or jsonb_array_length(p_detalles) = 0 then
    raise exception 'La venta debe tener al menos un producto.';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from clientes c
    where c.id = p_cliente_id
      and c.empresa_id = v_empresa_id
  ) then
    raise exception 'El cliente no pertenece a tu empresa.';
  end if;

  insert into ventas(empresa_id, cliente_id, usuario_id, tipo_comprobante, subtotal, igv, total, estado)
  values(v_empresa_id, p_cliente_id, v_user_id, p_tipo_comprobante, p_subtotal, p_igv, p_total, 'REGISTRADA')
  returning id, created_at into v_venta_id, v_created_at;

  for v_item in select * from jsonb_array_elements(p_detalles) loop
    v_producto_id := (v_item ->> 'producto_id')::uuid;
    v_cantidad := (v_item ->> 'cantidad')::numeric;
    v_precio := (v_item ->> 'precio_unitario')::numeric;
    v_total_item := (v_item ->> 'total')::numeric;

    if v_cantidad <= 0 or v_precio < 0 or v_total_item < 0 then
      raise exception 'Un producto de la venta tiene cantidades o importes inválidos.';
    end if;

    select p.stock
    into v_stock
    from productos p
    where p.id = v_producto_id
      and p.empresa_id = v_empresa_id
      and p.activo = true
    for update;

    if not found then
      raise exception 'Producto no encontrado o no pertenece a tu empresa.';
    end if;

    if v_stock < v_cantidad then
      raise exception 'Stock insuficiente para producto %. Disponible: %, solicitado: %.',
        v_producto_id, v_stock, v_cantidad;
    end if;

    update productos
    set stock = stock - v_cantidad
    where id = v_producto_id;

    insert into venta_detalle(venta_id, producto_id, cantidad, precio_unitario, descuento, total)
    values(v_venta_id, v_producto_id, v_cantidad, v_precio, 0, v_total_item);
  end loop;

  if p_pagos is not null and jsonb_typeof(p_pagos) = 'array' then
    for v_pago in select * from jsonb_array_elements(p_pagos) loop
      v_pago_metodo := coalesce(v_pago ->> 'metodo', 'EFECTIVO');
      v_pago_monto := (v_pago ->> 'monto')::numeric;

      if v_pago_monto <= 0 then
        raise exception 'El monto de pago debe ser mayor a cero.';
      end if;

      insert into pagos(venta_id, metodo, monto, referencia)
      values(v_venta_id, v_pago_metodo, v_pago_monto, null);
    end loop;
  end if;

  return jsonb_build_object(
    'venta_id', v_venta_id,
    'created_at', v_created_at
  );
end;
$$;

revoke all on function registrar_venta_pos(uuid, text, numeric, numeric, numeric, jsonb, jsonb) from public;
grant execute on function registrar_venta_pos(uuid, text, numeric, numeric, numeric, jsonb, jsonb) to authenticated;
