import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { NubefactRespuesta } from '../models/facturacion.models';

@Injectable({ providedIn: 'root' })
export class NubefactService {
  constructor(private supabaseService: SupabaseService) {}

  async emitir(comprobanteId: string): Promise<NubefactRespuesta> {
    const { data, error } = await this.supabaseService.supabase.functions.invoke('emitir-comprobante', {
      body: { comprobante_id: comprobanteId }
    });

    if (error) {
      throw new Error(error.message || 'No se pudo enviar el comprobante a Nubefact.');
    }

    return data as NubefactRespuesta;
  }

  async consultar(comprobanteId: string): Promise<NubefactRespuesta> {
    const { data, error } = await this.supabaseService.supabase.functions.invoke('consultar-comprobante', {
      body: { comprobante_id: comprobanteId }
    });

    if (error) {
      throw new Error(error.message || 'No se pudo consultar el comprobante en Nubefact.');
    }

    return data as NubefactRespuesta;
  }

  async anular(comprobanteId: string): Promise<NubefactRespuesta> {
    const { data, error } = await this.supabaseService.supabase.functions.invoke('anular-comprobante', {
      body: { comprobante_id: comprobanteId }
    });

    if (error) {
      throw new Error(error.message || 'No se pudo anular el comprobante en Nubefact.');
    }

    return data as NubefactRespuesta;
  }
}
