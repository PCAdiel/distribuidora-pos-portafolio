import { Injectable } from '@angular/core';
import { Cliente } from '../../models/cliente.model';
import { SupabaseService } from './supabase.service';

const KEY = 'demo_clientes';

const SEED: Cliente[] = [
  { id: 'c1', tipoDocumento: 'SIN_DOCUMENTO', numeroDocumento: '-', nombreRazonSocial: 'Cliente general' },
  { id: 'c2', tipoDocumento: 'RUC', numeroDocumento: '20600000001', nombreRazonSocial: 'Minimarket El Sol SAC', direccion: 'Av. Peru 123' }
];

@Injectable({ providedIn: 'root' })
export class ClientesService {
  constructor(private supabaseService: SupabaseService) {}

  listar(): Cliente[] {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(SEED));
      return SEED;
    }
    return JSON.parse(raw) as Cliente[];
  }

  async listarRemoto(): Promise<Cliente[]> {
    if (!this.supabaseService.isConfigured) {
      return this.listar();
    }

    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const { data, error } = await this.supabaseService.supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const clientes = (data ?? []).map(row => this.mapearDesdeSupabase(row));
    const salida = clientes.length ? clientes : this.listar();
    localStorage.setItem(KEY, JSON.stringify(salida));
    return salida;
  }

  async guardar(cliente: Cliente): Promise<Cliente> {
    const idLocalAnterior = cliente.id;
    const esNuevo = !cliente.id || !this.supabaseService.esUuid(cliente.id);
    const clienteLocal = this.guardarLocal(cliente);

    if (!this.supabaseService.isConfigured) {
      return clienteLocal;
    }

    const clienteSupabase = await this.guardarEnSupabase(clienteLocal, esNuevo);
    this.reemplazarLocal(idLocalAnterior || clienteLocal.id, clienteSupabase);
    return clienteSupabase;
  }

  private guardarLocal(cliente: Cliente): Cliente {
    const clientes = this.listar();
    const index = clientes.findIndex(c => c.id === cliente.id);
    const clienteFinal = cliente.id ? cliente : { ...cliente, id: `local-${crypto.randomUUID()}` };

    if (index >= 0) {
      clientes[index] = clienteFinal;
    } else {
      clientes.unshift(clienteFinal);
    }

    localStorage.setItem(KEY, JSON.stringify(clientes));
    return clienteFinal;
  }

  private reemplazarLocal(idAnterior: string, cliente: Cliente): void {
    const clientes = this.listar().filter(c => c.id !== idAnterior && c.id !== cliente.id);
    clientes.unshift(cliente);
    localStorage.setItem(KEY, JSON.stringify(clientes));
  }

  private async guardarEnSupabase(cliente: Cliente, forzarInsert = false): Promise<Cliente> {
    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const payload = {
      empresa_id: empresaId,
      tipo_documento: cliente.tipoDocumento,
      numero_documento: cliente.numeroDocumento,
      nombre_razon_social: cliente.nombreRazonSocial,
      direccion: cliente.direccion ?? null,
      telefono: cliente.telefono ?? null,
      correo: cliente.correo ?? null
    };

    if (!forzarInsert && this.supabaseService.esUuid(cliente.id)) {
      const { data, error } = await this.supabaseService.supabase
        .from('clientes')
        .update(payload)
        .eq('id', cliente.id)
        .select()
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        return this.mapearDesdeSupabase(data);
      }
    }

    const { data, error } = await this.supabaseService.supabase
      .from('clientes')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return this.mapearDesdeSupabase(data);
  }

  private mapearDesdeSupabase(row: any): Cliente {
    return {
      id: row.id,
      tipoDocumento: row.tipo_documento,
      numeroDocumento: row.numero_documento,
      nombreRazonSocial: row.nombre_razon_social,
      direccion: row.direccion ?? undefined,
      telefono: row.telefono ?? undefined,
      correo: row.correo ?? undefined
    };
  }

  async eliminar(cliente: Cliente): Promise<void> {
    const clientes = this.listar().filter(c => c.id !== cliente.id);
    localStorage.setItem(KEY, JSON.stringify(clientes));

    if (!this.supabaseService.isConfigured || !this.supabaseService.esUuid(cliente.id)) {
      return;
    }

    const { error } = await this.supabaseService.supabase
      .from('clientes')
      .delete()
      .eq('id', cliente.id);

    if (error) {
      throw this.supabaseService.crearError(error);
    }
  }
}
