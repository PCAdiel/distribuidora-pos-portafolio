import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface SupabaseTicketItem {
  id?: string;
  ticket_id?: string;
  producto_id?: string | null;
  producto_local_id: string;
  nombre: string;
  description?: string | null;
  quantity: number;
  price: number;
  total: number;
}

export interface SupabaseTicket {
  id?: string;
  empresa_id?: string;
  user_id?: string;
  cliente_id?: string | null;
  title: string;
  description?: string | null;
  status: 'ABIERTO' | 'COBRADO' | 'CANCELADO';
  subtotal: number;
  igv: number;
  total: number;
  ticket_items?: SupabaseTicketItem[];
}

@Injectable({ providedIn: 'root' })
export class SupabaseTicketsService {
  constructor(private supabaseService: SupabaseService) {}

  async listar(): Promise<SupabaseTicket[]> {
    const { data, error } = await this.supabaseService.supabase
      .from('tickets')
      .select('*, ticket_items(*)')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []) as SupabaseTicket[];
  }

  async crear(ticket: Omit<SupabaseTicket, 'id' | 'empresa_id' | 'user_id'>): Promise<SupabaseTicket> {
    const context = await this.obtenerContextoUsuario();
    const { ticket_items: items = [], ...ticketData } = ticket;

    const { data, error } = await this.supabaseService.supabase
      .from('tickets')
      .insert({
        ...ticketData,
        empresa_id: context.empresaId,
        user_id: context.userId
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (items.length) {
      await this.reemplazarItems(data.id, items);
    }

    return {
      ...(data as SupabaseTicket),
      ticket_items: items
    };
  }

  async actualizar(ticketId: string, changes: Partial<SupabaseTicket>, items?: SupabaseTicketItem[]): Promise<void> {
    const { ticket_items: _ignored, id: _id, empresa_id: _empresaId, user_id: _userId, ...ticketChanges } = changes;

    const { error } = await this.supabaseService.supabase
      .from('tickets')
      .update(ticketChanges)
      .eq('id', ticketId);

    if (error) {
      throw error;
    }

    if (items) {
      await this.reemplazarItems(ticketId, items);
    }
  }

  async eliminar(ticketId: string): Promise<void> {
    const { error } = await this.supabaseService.supabase
      .from('tickets')
      .delete()
      .eq('id', ticketId);

    if (error) {
      throw error;
    }
  }

  async disminuirCantidad(itemId: string, cantidad = 1): Promise<void> {
    if (cantidad <= 0) {
      throw new Error('La cantidad a disminuir debe ser mayor a cero.');
    }

    const { data: item, error: selectError } = await this.supabaseService.supabase
      .from('ticket_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (selectError) {
      throw selectError;
    }

    const siguienteCantidad = Number(item.quantity) - cantidad;

    if (siguienteCantidad < 0) {
      throw new Error('La cantidad del ticket no puede quedar en negativo.');
    }

    if (siguienteCantidad === 0) {
      const { error } = await this.supabaseService.supabase
        .from('ticket_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        throw error;
      }

      return;
    }

    const { error } = await this.supabaseService.supabase
      .from('ticket_items')
      .update({
        quantity: siguienteCantidad,
        total: this.redondearMoneda(siguienteCantidad * Number(item.price))
      })
      .eq('id', itemId);

    if (error) {
      throw error;
    }
  }

  private async reemplazarItems(ticketId: string, items: SupabaseTicketItem[]): Promise<void> {
    const invalidItem = items.find(item =>
      !item.producto_local_id ||
      !Number.isFinite(item.quantity) ||
      !Number.isFinite(item.price) ||
      !Number.isFinite(item.total) ||
      item.quantity <= 0 ||
      item.price < 0 ||
      item.total < 0
    );

    if (invalidItem) {
      throw new Error(`El item ${invalidItem.nombre} tiene cantidades o importes inválidos.`);
    }

    const itemsUnicos = this.consolidarItems(items);

    if (itemsUnicos.length === 0) {
      const { error: deleteError } = await this.supabaseService.supabase
        .from('ticket_items')
        .delete()
        .eq('ticket_id', ticketId);

      if (deleteError) {
        throw deleteError;
      }

      return;
    }

    await this.eliminarItemsRetirados(ticketId, itemsUnicos.map(item => item.producto_local_id));

    const rows = itemsUnicos.map(item => ({
      ticket_id: ticketId,
      producto_id: item.producto_id ?? null,
      producto_local_id: item.producto_local_id,
      nombre: item.nombre,
      description: item.description ?? null,
      quantity: item.quantity,
      price: item.price,
      total: item.total
    }));

    const { error: upsertError } = await this.supabaseService.supabase
      .from('ticket_items')
      .upsert(rows, { onConflict: 'ticket_id,producto_local_id' });

    if (upsertError) {
      throw upsertError;
    }
  }

  private consolidarItems(items: SupabaseTicketItem[]): SupabaseTicketItem[] {
    const porProducto = new Map<string, SupabaseTicketItem>();

    for (const item of items) {
      const existente = porProducto.get(item.producto_local_id);

      if (!existente) {
        porProducto.set(item.producto_local_id, { ...item });
        continue;
      }

      const quantity = Number(existente.quantity) + Number(item.quantity);
      porProducto.set(item.producto_local_id, {
        ...existente,
        nombre: item.nombre || existente.nombre,
        description: item.description ?? existente.description,
        producto_id: item.producto_id ?? existente.producto_id ?? null,
        quantity,
        price: Number(item.price),
        total: this.redondearMoneda(quantity * Number(item.price))
      });
    }

    return [...porProducto.values()];
  }

  private async eliminarItemsRetirados(ticketId: string, productoLocalIds: string[]): Promise<void> {
    const { data, error: selectError } = await this.supabaseService.supabase
      .from('ticket_items')
      .select('id, producto_local_id')
      .eq('ticket_id', ticketId);

    if (selectError) {
      throw selectError;
    }

    const idsActuales = new Set(productoLocalIds);
    const idsParaEliminar = (data ?? [])
      .filter(item => !idsActuales.has(item.producto_local_id))
      .map(item => item.id);

    if (idsParaEliminar.length === 0) {
      return;
    }

    const { error: deleteError } = await this.supabaseService.supabase
      .from('ticket_items')
      .delete()
      .in('id', idsParaEliminar);

    if (deleteError) {
      throw deleteError;
    }
  }

  private async obtenerContextoUsuario(): Promise<{ userId: string; empresaId: string }> {
    const { data: userData, error: userError } = await this.supabaseService.supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    const userId = userData.user?.id;

    if (!userId) {
      throw new Error('Debes iniciar sesión para guardar tickets en Supabase.');
    }

    const { data: empresa, error: empresaError } = await this.supabaseService.supabase
      .from('usuarios_empresa')
      .select('empresa_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (empresaError) {
      throw empresaError;
    }

    if (!empresa?.empresa_id) {
      throw new Error('El usuario no está asociado a una empresa.');
    }

    return {
      userId,
      empresaId: empresa.empresa_id
    };
  }

  private redondearMoneda(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
