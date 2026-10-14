import { Injectable } from '@angular/core';
import { AppRole } from '../../models/roles.model';
import { SupabaseService } from './supabase.service';

export interface CrearUsuarioRequest {
  nombre: string;
  correo: string;
  password: string;
  rol: AppRole;
}

export interface UsuarioEmpresa {
  id: string;
  membresiaId?: string;
  nombre: string;
  correo: string;
  rol: AppRole;
  activo: boolean;
}

interface CrearUsuarioResponse {
  userId: string;
  email: string;
  nombre?: string;
  rol?: AppRole;
  activo?: boolean;
}

interface GestionUsuariosResponse {
  usuarios?: UsuarioEmpresa[];
  usuario?: UsuarioEmpresa;
  ok?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  constructor(private supabaseService: SupabaseService) {}

  async listarUsuarios(): Promise<UsuarioEmpresa[]> {
    const data = await this.invocarGestionUsuarios({
      accion: 'listar'
    });

    return data.usuarios ?? [];
  }

  async crearUsuario(payload: CrearUsuarioRequest): Promise<UsuarioEmpresa> {
    if (!this.supabaseService.isConfigured) {
      throw new Error('Supabase no está configurado. No se puede crear un usuario real para login.');
    }

    const nombre = payload.nombre.trim();
    const correo = payload.correo.trim().toLowerCase();
    const password = payload.password.trim();

    if (!nombre || !correo) {
      throw new Error('Ingresa nombre y correo del usuario.');
    }

    if (password.length < 6) {
      throw new Error('La contraseña inicial debe tener al menos 6 caracteres.');
    }

    const { data: sessionData, error: sessionError } = await this.supabaseService.supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    const token = sessionData.session?.access_token;

    if (!token) {
      throw new Error('Debes iniciar sesión como administrador para crear usuarios.');
    }

    const { data, error } = await this.supabaseService.supabase.functions.invoke<CrearUsuarioResponse>('crear-usuario', {
      body: {
        nombre,
        correo,
        password,
        rol: payload.rol
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (error) {
      throw this.supabaseService.crearError(
        error,
        'No se pudo crear el usuario. Verifica que la Edge Function crear-usuario esté desplegada.'
      );
    }

    if (!data?.userId) {
      throw new Error('Supabase no devolvió el ID del usuario creado.');
    }

    return {
      id: data.userId,
      nombre: data.nombre ?? nombre,
      correo: data.email ?? correo,
      rol: data.rol ?? payload.rol,
      activo: data.activo ?? true
    };
  }

  async actualizarUsuario(payload: Pick<UsuarioEmpresa, 'id' | 'nombre' | 'rol' | 'activo'>): Promise<UsuarioEmpresa> {
    const nombre = payload.nombre.trim();

    if (!nombre) {
      throw new Error('Ingresa el nombre del usuario.');
    }

    const data = await this.invocarGestionUsuarios({
      accion: 'actualizar',
      userId: payload.id,
      nombre,
      rol: payload.rol,
      activo: payload.activo
    });

    if (!data.usuario) {
      throw new Error('No se recibio el usuario actualizado.');
    }

    return data.usuario;
  }

  async resetearPassword(userId: string, password: string): Promise<void> {
    const nuevaPassword = password.trim();

    if (nuevaPassword.length < 6) {
      throw new Error('La nueva contrasena debe tener al menos 6 caracteres.');
    }

    await this.invocarGestionUsuarios({
      accion: 'reset_password',
      userId,
      password: nuevaPassword
    });
  }

  private async invocarGestionUsuarios(body: Record<string, unknown>): Promise<GestionUsuariosResponse> {
    if (!this.supabaseService.isConfigured) {
      throw new Error('Supabase no esta configurado.');
    }

    const { data: sessionData, error: sessionError } = await this.supabaseService.supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    const token = sessionData.session?.access_token;

    if (!token) {
      throw new Error('Debes iniciar sesion como administrador.');
    }

    const { data, error } = await this.supabaseService.supabase.functions.invoke<GestionUsuariosResponse>('gestionar-usuario', {
      body,
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (error) {
      throw this.supabaseService.crearError(
        error,
        'No se pudo gestionar el usuario. Verifica que la Edge Function gestionar-usuario este desplegada.'
      );
    }

    return data ?? {};
  }
}
