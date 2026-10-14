import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface EmpresaConfig {
  id?: string;
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  direccion?: string;
  telefono?: string;
  correo?: string;
  logoUrl?: string;
}

const EMPRESA_KEY = 'cfg_empresa';

@Injectable({ providedIn: 'root' })
export class EmpresaService {
  constructor(private supabaseService: SupabaseService) {}

  obtenerLocal(): EmpresaConfig {
    const raw = localStorage.getItem(EMPRESA_KEY);

    if (raw) {
      return JSON.parse(raw) as EmpresaConfig;
    }

    return {
      ruc: localStorage.getItem('cfg_ruc') || '',
      razonSocial: localStorage.getItem('cfg_razon') || '',
      nombreComercial: localStorage.getItem('cfg_nombre_comercial') || '',
      direccion: '',
      telefono: '',
      correo: ''
    };
  }

  async obtener(): Promise<EmpresaConfig> {
    if (!this.supabaseService.isConfigured) {
      return this.obtenerLocal();
    }

    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const { data, error } = await this.supabaseService.supabase
      .from('empresas')
      .select('*')
      .eq('id', empresaId)
      .single();

    if (error) {
      throw error;
    }

    const empresa = this.mapearDesdeSupabase(data);
    this.guardarLocal(empresa);
    return empresa;
  }

  async guardar(empresa: EmpresaConfig): Promise<EmpresaConfig> {
    const normalizada = {
      ...empresa,
      ruc: empresa.ruc.trim(),
      razonSocial: empresa.razonSocial.trim()
    };

    if (!normalizada.ruc || !normalizada.razonSocial) {
      throw new Error('Ingresa RUC y razón social.');
    }

    this.guardarLocal(normalizada);

    if (!this.supabaseService.isConfigured) {
      return normalizada;
    }

    const userId = await this.supabaseService.obtenerUsuarioId();
    const empresaId = await this.obtenerEmpresaIdAsociada(userId);
    const payload = {
      ruc: normalizada.ruc,
      razon_social: normalizada.razonSocial,
      nombre_comercial: normalizada.nombreComercial ?? null,
      direccion: normalizada.direccion ?? null,
      telefono: normalizada.telefono ?? null,
      correo: normalizada.correo ?? null,
      logo_url: normalizada.logoUrl ?? null
    };

    if (empresaId) {
      const { data, error } = await this.supabaseService.supabase
        .from('empresas')
        .update(payload)
        .eq('id', empresaId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const actualizada = this.mapearDesdeSupabase(data);
      this.guardarLocal(actualizada);
      return actualizada;
    }

    const { data: creada, error: empresaError } = await this.supabaseService.supabase
      .from('empresas')
      .insert({ ...payload, created_by: userId })
      .select()
      .single();

    if (empresaError) {
      throw empresaError;
    }

    const { error: usuarioEmpresaError } = await this.supabaseService.supabase
      .from('usuarios_empresa')
      .insert({
        user_id: userId,
        empresa_id: creada.id,
        rol: 'ADMIN'
      });

    if (usuarioEmpresaError) {
      throw usuarioEmpresaError;
    }

    const empresaCreada = this.mapearDesdeSupabase(creada);
    this.guardarLocal(empresaCreada);
    return empresaCreada;
  }

  private async obtenerEmpresaIdAsociada(userId: string): Promise<string | null> {
    const { data, error } = await this.supabaseService.supabase
      .from('usuarios_empresa')
      .select('empresa_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.empresa_id ?? null;
  }

  private guardarLocal(empresa: EmpresaConfig): void {
    localStorage.setItem(EMPRESA_KEY, JSON.stringify(empresa));
    localStorage.setItem('cfg_ruc', empresa.ruc);
    localStorage.setItem('cfg_razon', empresa.razonSocial);
    localStorage.setItem('cfg_nombre_comercial', empresa.nombreComercial ?? '');
  }

  private mapearDesdeSupabase(row: any): EmpresaConfig {
    return {
      id: row.id,
      ruc: row.ruc,
      razonSocial: row.razon_social,
      nombreComercial: row.nombre_comercial ?? '',
      direccion: row.direccion ?? '',
      telefono: row.telefono ?? '',
      correo: row.correo ?? '',
      logoUrl: row.logo_url ?? ''
    };
  }
}
