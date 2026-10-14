import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { ErrorService } from '../../../core/errors/error.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Venta } from '../../../models/venta.model';
import { NubefactService } from './nubefact.service';

@Injectable({ providedIn: 'root' })
export class FacturacionService {
  constructor(
    private nubefact: NubefactService,
    private supabaseService: SupabaseService,
    private errorService: ErrorService
  ) {}

  async intentarEmitirSiConfigurado(venta: Venta): Promise<Venta> {
    if (!environment.nubefactEnabled || !this.supabaseService.isConfigured || !venta.comprobante?.id) {
      return venta;
    }

    try {
      const respuesta = await this.nubefact.emitir(venta.comprobante.id);
      const estado = respuesta.comprobante?.estado ?? (respuesta.ok ? 'EMITIDO' : 'PENDIENTE_REINTENTO');
      const nubefact = respuesta.nubefact ?? {};

      return {
        ...venta,
        comprobante: {
          ...venta.comprobante,
          estado: estado as NonNullable<Venta['comprobante']>['estado'],
          enlace: this.leerTexto(nubefact, 'enlace') ?? venta.comprobante.enlace,
          pdfUrl: this.leerTexto(nubefact, 'enlace_del_pdf') ?? venta.comprobante.pdfUrl,
          xmlUrl: this.leerTexto(nubefact, 'enlace_del_xml') ?? venta.comprobante.xmlUrl,
          cdrUrl: this.leerTexto(nubefact, 'enlace_del_cdr') ?? venta.comprobante.cdrUrl,
          sunatDescription: this.leerTexto(nubefact, 'sunat_description') ?? venta.comprobante.sunatDescription,
          sunatNote: this.leerTexto(nubefact, 'sunat_note') ?? venta.comprobante.sunatNote,
          sunatResponseCode: this.leerTexto(nubefact, 'sunat_responsecode') ?? venta.comprobante.sunatResponseCode,
          cadenaQr: this.leerTexto(nubefact, 'cadena_para_codigo_qr') ?? venta.comprobante.cadenaQr,
          codigoHash: this.leerTexto(nubefact, 'codigo_hash') ?? venta.comprobante.codigoHash
        }
      };
    } catch (error) {
      this.errorService.log('nubefact.emitir', error);

      return {
        ...venta,
        comprobante: {
          ...venta.comprobante,
          estado: 'PENDIENTE_REINTENTO'
        }
      };
    }
  }

  private leerTexto(data: Record<string, unknown>, key: string): string | undefined {
    const value = data[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }
}
