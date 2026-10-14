import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type RolUsuario = 'ADMIN' | 'CAJERO' | 'VENDEDOR' | 'EMPLEADO';
type Accion = 'listar' | 'actualizar' | 'reset_password';

interface GestionarUsuarioBody {
  accion?: Accion;
  userId?: string;
  nombre?: string;
  rol?: RolUsuario;
  activo?: boolean;
  password?: string;
}

interface MembresiaAdmin {
  empresa_id: string;
  rol: RolUsuario;
  activo?: boolean;
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (request.method !== 'POST') {
      return json({ error: 'Metodo no permitido.' }, 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Faltan variables de entorno de Supabase.' }, 500);
    }

    if (!authorization) {
      return json({ error: 'Debes iniciar sesion.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: currentUser, error: currentUserError } = await userClient.auth.getUser();

    if (currentUserError || !currentUser.user) {
      return json({ error: 'Sesion invalida.' }, 401);
    }

    const { data: membresiaData, error: membresiaError } = await userClient
      .from('usuarios_empresa')
      .select('empresa_id, rol, activo')
      .eq('user_id', currentUser.user.id)
      .limit(1)
      .maybeSingle();

    if (membresiaError) {
      return json({ error: membresiaError.message }, 400);
    }

    const membresia = membresiaData as MembresiaAdmin | null;

    if (!membresia?.empresa_id || membresia.rol !== 'ADMIN' || membresia.activo === false) {
      return json({ error: 'Solo un administrador activo puede gestionar usuarios.' }, 403);
    }

    const body = await request.json().catch(() => ({})) as GestionarUsuarioBody;
    const accion = body.accion ?? 'listar';

    if (accion === 'listar') {
      return listarUsuarios(adminClient, membresia.empresa_id);
    }

    if (accion === 'actualizar') {
      return actualizarUsuario(adminClient, membresia.empresa_id, currentUser.user.id, body);
    }

    if (accion === 'reset_password') {
      return resetearPassword(adminClient, membresia.empresa_id, body);
    }

    return json({ error: 'Accion no soportada.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.';
    return json({ error: message }, 500);
  }
});

async function listarUsuarios(adminClient: any, empresaId: string): Promise<Response> {
  const { data, error } = await adminClient
    .from('usuarios_empresa')
    .select('id, user_id, empresa_id, rol, nombre, correo, activo, created_at')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });

  if (error) {
    return json({ error: error.message }, 400);
  }

  const usuarios = [];

  for (const row of data ?? []) {
    let nombre = row.nombre;
    let correo = row.correo;

    if (!nombre || !correo) {
      const { data: authData } = await adminClient.auth.admin.getUserById(row.user_id);
      nombre = nombre || authData?.user?.user_metadata?.nombre || authData?.user?.email || 'Usuario';
      correo = correo || authData?.user?.email || '';
    }

    usuarios.push({
      id: row.user_id,
      membresiaId: row.id,
      nombre,
      correo,
      rol: row.rol,
      activo: row.activo !== false
    });
  }

  return json({ usuarios });
}

async function actualizarUsuario(
  adminClient: any,
  empresaId: string,
  currentUserId: string,
  body: GestionarUsuarioBody
): Promise<Response> {
  const userId = body.userId?.trim();
  const nombre = body.nombre?.trim();
  const rolesPermitidos: RolUsuario[] = ['ADMIN', 'CAJERO', 'VENDEDOR', 'EMPLEADO'];
  const rol = body.rol && rolesPermitidos.includes(body.rol) ? body.rol : undefined;
  const activo = typeof body.activo === 'boolean' ? body.activo : undefined;

  if (!userId) {
    return json({ error: 'Usuario requerido.' }, 400);
  }

  if (!nombre) {
    return json({ error: 'El nombre es obligatorio.' }, 400);
  }

  if (!rol) {
    return json({ error: 'Rol no valido.' }, 400);
  }

  if (userId === currentUserId && (rol !== 'ADMIN' || activo === false)) {
    return json({ error: 'No puedes quitarte tu propio acceso administrador.' }, 400);
  }

  const target = await obtenerMembresia(adminClient, empresaId, userId);

  if (!target) {
    return json({ error: 'Usuario no encontrado en la empresa.' }, 404);
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(userId);

  if (authError || !authData?.user) {
    return json({ error: authError?.message ?? 'No se pudo leer el usuario Auth.' }, 400);
  }

  const correo = authData.user.email ?? target.correo ?? '';
  const activoFinal = activo ?? target.activo !== false;
  const metadata = {
    ...(authData.user.user_metadata ?? {}),
    nombre,
    rol,
    empresa_id: empresaId
  };

  const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: metadata,
    ban_duration: activoFinal ? 'none' : '876000h'
  });

  if (updateAuthError) {
    return json({ error: updateAuthError.message }, 400);
  }

  const { error: updateError } = await adminClient
    .from('usuarios_empresa')
    .update({
      nombre,
      correo,
      rol,
      activo: activoFinal,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('empresa_id', empresaId);

  if (updateError) {
    return json({ error: updateError.message }, 400);
  }

  return json({
    usuario: {
      id: userId,
      nombre,
      correo,
      rol,
      activo: activoFinal
    }
  });
}

async function resetearPassword(adminClient: any, empresaId: string, body: GestionarUsuarioBody): Promise<Response> {
  const userId = body.userId?.trim();
  const password = body.password?.trim();

  if (!userId) {
    return json({ error: 'Usuario requerido.' }, 400);
  }

  if (!password || password.length < 6) {
    return json({ error: 'La nueva contrasena debe tener al menos 6 caracteres.' }, 400);
  }

  const target = await obtenerMembresia(adminClient, empresaId, userId);

  if (!target) {
    return json({ error: 'Usuario no encontrado en la empresa.' }, 404);
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, { password });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ ok: true });
}

async function obtenerMembresia(adminClient: any, empresaId: string, userId: string): Promise<any | null> {
  const { data, error } = await adminClient
    .from('usuarios_empresa')
    .select('id, user_id, empresa_id, rol, nombre, correo, activo')
    .eq('user_id', userId)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
