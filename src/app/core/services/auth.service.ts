import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AppRole } from '../../models/roles.model';
import { SupabaseService } from './supabase.service';

export interface PerfilUsuario {
  userId: string;
  email: string;
  empresaId?: string;
  rol: AppRole;
  activo: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private perfilCache?: PerfilUsuario | null;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async isLoggedIn(): Promise<boolean> {
    if (!this.supabaseService.isConfigured) {
      return false;
    }

    const { data } = await this.supabaseService.supabase.auth.getSession();

    if (!data.session) {
      return false;
    }

    const perfil = await this.obtenerPerfil(true);

    if (perfil?.activo === false) {
      await this.logout();
      return false;
    }

    return true;
  }

  async login(email: string, password: string): Promise<void> {
    if (!this.supabaseService.isConfigured) {
      throw new Error('Supabase no esta configurado. Configura la URL y anon key antes de iniciar sesion.');
    }

    const { error } = await this.supabaseService.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    this.perfilCache = undefined;
    const perfil = await this.obtenerPerfil(true);

    if (perfil?.activo === false) {
      await this.supabaseService.supabase.auth.signOut();
      this.perfilCache = undefined;
      throw new Error('Tu usuario esta inactivo. Contacta al administrador.');
    }
  }

  async logout(): Promise<void> {
    if (this.supabaseService.isConfigured) {
      await this.supabaseService.supabase.auth.signOut();
    }

    this.perfilCache = undefined;
    await this.router.navigateByUrl('/login');
  }

  async obtenerPerfil(force = false): Promise<PerfilUsuario | null> {
    if (!force && this.perfilCache !== undefined) {
      return this.perfilCache;
    }

    if (!this.supabaseService.isConfigured) {
      this.perfilCache = null;
      return this.perfilCache;
    }

    const { data: userData, error: userError } = await this.supabaseService.supabase.auth.getUser();

    if (userError || !userData.user) {
      this.perfilCache = null;
      return null;
    }

    const { data, error } = await this.supabaseService.supabase
      .from('usuarios_empresa')
      .select('empresa_id, rol, activo')
      .eq('user_id', userData.user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo leer el rol del usuario.');
    }

    this.perfilCache = {
      userId: userData.user.id,
      email: userData.user.email ?? '',
      empresaId: data?.empresa_id ?? undefined,
      rol: (data?.rol ?? 'EMPLEADO') as AppRole,
      activo: data?.activo !== false
    };

    return this.perfilCache;
  }

  async hasAnyRole(roles: AppRole[], allowWithoutCompany = false): Promise<boolean> {
    const perfil = await this.obtenerPerfil();

    if (!perfil || !perfil.activo) {
      return false;
    }

    if (!perfil.empresaId) {
      return allowWithoutCompany;
    }

    return roles.includes(perfil.rol);
  }
}
