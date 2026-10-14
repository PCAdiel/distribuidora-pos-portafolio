import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type TipoAjusteStock = 'ENTRADA' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'MERMA' | 'VENCIMIENTO' | 'DEVOLUCION';

@Injectable({ providedIn: 'root' })
export class StockAjustesService {
  constructor(private supabaseService: SupabaseService) {}

  async registrar(productoId: string, tipo: TipoAjusteStock, cantidad: number, observacion?: string): Promise<void> {
    if (!this.supabaseService.isConfigured || !this.supabaseService.esUuid(productoId)) {
      throw new Error('El ajuste de stock requiere un producto sincronizado con Supabase.');
    }

    const { error } = await this.supabaseService.supabase.rpc('registrar_ajuste_stock', {
      p_producto_id: productoId,
      p_tipo_movimiento: tipo,
      p_cantidad: cantidad,
      p_observacion: observacion ?? null
    });

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo registrar el ajuste de stock.');
    }
  }
}
