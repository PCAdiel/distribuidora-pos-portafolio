import { Injectable } from '@angular/core';
import { ProductoLote } from '../../models/lote.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class LotesService {
  constructor(private supabaseService: SupabaseService) {}

  async listarPorProducto(productoId: string): Promise<ProductoLote[]> {
    if (!this.supabaseService.isConfigured || !this.supabaseService.esUuid(productoId)) {
      return [];
    }

    const { data, error } = await this.supabaseService.supabase
      .from('producto_lotes')
      .select('*')
      .eq('producto_id', productoId)
      .eq('activo', true)
      .order('fecha_vencimiento', { ascending: true });

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudieron cargar los lotes.');
    }

    return (data ?? []).map(this.mapearLote);
  }

  async guardar(lote: ProductoLote): Promise<ProductoLote> {
    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const payload = {
      empresa_id: empresaId,
      producto_id: lote.productoId,
      codigo_lote: lote.codigoLote.trim(),
      fecha_vencimiento: lote.fechaVencimiento,
      stock_lote: lote.stockLote,
      costo_unitario: lote.costoUnitario,
      activo: lote.activo
    };

    const query = lote.id
      ? this.supabaseService.supabase
          .from('producto_lotes')
          .update(payload)
          .eq('id', lote.id)
          .select()
          .single()
      : this.supabaseService.supabase
          .from('producto_lotes')
          .insert(payload)
          .select()
          .single();

    const { data, error } = await query;

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo guardar el lote.');
    }

    return this.mapearLote(data);
  }

  private mapearLote(row: any): ProductoLote {
    return {
      id: row.id,
      productoId: row.producto_id,
      codigoLote: row.codigo_lote,
      fechaVencimiento: row.fecha_vencimiento,
      stockLote: Number(row.stock_lote),
      costoUnitario: Number(row.costo_unitario),
      activo: row.activo
    };
  }
}
