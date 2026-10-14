import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { ErrorService } from '../errors/error.service';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client?: SupabaseClient;

  constructor(private errorService: ErrorService) {
    if (this.tieneCredencialesValidas()) {
      this.client = createClient(
        environment.supabaseUrl,
        environment.supabaseAnonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
          }
        }
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.client;
  }

  get supabase(): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase no esta configurado.');
    }

    return this.client;
  }

  async probarConexion(): Promise<number> {
    const { count, error } = await this.supabase
      .from('productos')
      .select('id', { count: 'exact', head: true });

    if (error) {
      throw error;
    }

    return count ?? 0;
  }

  obtenerMensajeError(error: unknown, fallback = 'Ocurrio un error con Supabase.'): string {
    return this.errorService.toUserMessage(error, fallback);
  }

  crearError(error: unknown, fallback?: string): Error {
    return new Error(this.obtenerMensajeError(error, fallback));
  }

  async obtenerUsuarioId(): Promise<string> {
    const { data, error } = await this.supabase.auth.getUser();

    if (error) {
      throw error;
    }

    const userId = data.user?.id;

    if (!userId) {
      throw new Error('Debes iniciar sesion para usar Supabase.');
    }

    return userId;
  }

  async obtenerEmpresaId(): Promise<string> {
    const userId = await this.obtenerUsuarioId();
    const { data, error } = await this.supabase
      .from('usuarios_empresa')
      .select('empresa_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.empresa_id) {
      throw new Error('Primero guarda la empresa en Configuracion para asociarla a tu usuario.');
    }

    return data.empresa_id;
  }

  esUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private tieneCredencialesValidas(): boolean {
    const url = environment.supabaseUrl?.trim();
    const key = environment.supabaseAnonKey?.trim();

    return Boolean(
      url &&
      key &&
      !url.includes('SUPABASE_URL') &&
      !key.includes('SUPABASE_ANON_KEY') &&
      url.startsWith('https://')
    );
  }
}
