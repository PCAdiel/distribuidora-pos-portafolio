-- Gestion segura de usuarios desde la app.
-- No se eliminan usuarios: se activan/desactivan para conservar historial.

alter table usuarios_empresa add column if not exists nombre text;
alter table usuarios_empresa add column if not exists correo text;
alter table usuarios_empresa add column if not exists activo boolean not null default true;
alter table usuarios_empresa add column if not exists updated_at timestamptz not null default now();

update usuarios_empresa ue
set
  nombre = coalesce(ue.nombre, nullif(u.raw_user_meta_data ->> 'nombre', ''), u.email),
  correo = coalesce(ue.correo, u.email),
  activo = coalesce(ue.activo, true)
from auth.users u
where ue.user_id = u.id;

drop trigger if exists usuarios_empresa_set_updated_at on usuarios_empresa;
create trigger usuarios_empresa_set_updated_at
before update on usuarios_empresa
for each row execute function set_updated_at();

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

revoke all on function usuario_es_miembro_empresa(uuid) from public;
revoke all on function usuario_tiene_rol(uuid, text[]) from public;
grant execute on function usuario_es_miembro_empresa(uuid) to authenticated;
grant execute on function usuario_tiene_rol(uuid, text[]) to authenticated;

select pg_notify('pgrst', 'reload schema');
