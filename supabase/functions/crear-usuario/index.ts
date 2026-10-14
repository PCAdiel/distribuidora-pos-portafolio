import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type RolUsuario = 'ADMIN' | 'CAJERO' | 'VENDEDOR' | 'EMPLEADO';

interface CrearUsuarioBody {
  nombre?: string;
  correo?: string;
  password?: string;
  rol?: RolUsuario;
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (request.method !== 'POST') {
      return json({ error: 'Método no permitido.' }, 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Faltan variables de entorno de Supabase.' }, 500);
    }

    if (!authorization) {
      return json({ error: 'Debes iniciar sesión para crear usuarios.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: currentUser, error: currentUserError } = await userClient.auth.getUser();

    if (currentUserError || !currentUser.user) {
      return json({ error: 'Sesión inválida.' }, 401);
    }

    const { data: membresia, error: membresiaError } = await userClient
      .from('usuarios_empresa')
      .select('empresa_id, rol')
      .eq('user_id', currentUser.user.id)
      .limit(1)
      .maybeSingle();

    if (membresiaError) {
      return json({ error: membresiaError.message }, 400);
    }

    if (!membresia?.empresa_id) {
      return json({ error: 'Tu usuario no está asociado a una empresa.' }, 403);
    }

    if (membresia.rol !== 'ADMIN') {
      return json({ error: 'Solo un administrador puede crear usuarios.' }, 403);
    }

    const body = await request.json() as CrearUsuarioBody;
    const nombre = body.nombre?.trim();
    const correo = body.correo?.trim().toLowerCase();
    const password = body.password?.trim();
    const rolesPermitidos: RolUsuario[] = ['ADMIN', 'CAJERO', 'VENDEDOR', 'EMPLEADO'];
    const rol = body.rol && rolesPermitidos.includes(body.rol) ? body.rol : 'VENDEDOR';

    if (!nombre || !correo || !password) {
      return json({ error: 'Nombre, correo y contraseña son obligatorios.' }, 400);
    }

    if (password.length < 6) {
      return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
    }

    const { data: usuarioCreado, error: crearError } = await adminClient.auth.admin.createUser({
      email: correo,
      password,
      email_confirm: true,
      user_metadata: {
        nombre,
        rol,
        empresa_id: membresia.empresa_id
      }
    });

    if (crearError || !usuarioCreado.user) {
      return json({ error: crearError?.message ?? 'No se pudo crear el usuario.' }, 400);
    }

    const { error: relacionError } = await adminClient
      .from('usuarios_empresa')
      .upsert({
        user_id: usuarioCreado.user.id,
        empresa_id: membresia.empresa_id,
        rol,
        nombre,
        correo,
        activo: true
      }, { onConflict: 'user_id,empresa_id' });

    if (relacionError) {
      await adminClient.auth.admin.deleteUser(usuarioCreado.user.id);
      return json({ error: relacionError.message }, 400);
    }

    return json({
      userId: usuarioCreado.user.id,
      email: usuarioCreado.user.email,
      nombre,
      rol,
      activo: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
