import { Injectable } from '@angular/core';
import { Comprobante, Venta } from '../../models/venta.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FacturacionProviderService {
  async emitir(venta: Venta): Promise<Comprobante> {
    // MODO PRODUCCIÓN: llamar a Supabase Edge Function, nunca al proveedor directo desde Ionic.
    if (environment.providerEdgeFunctionUrl) {
      const response = await fetch(environment.providerEdgeFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(venta)
      });
      if (!response.ok) throw new Error('Error al emitir comprobante con proveedor API');
      return await response.json() as Comprobante;
    }

    // MODO DEMO: simula emisión aceptada.
    return {
      id: crypto.randomUUID(),
      tipo: venta.tipoComprobante,
      serie: venta.tipoComprobante === 'FACTURA' ? 'F001' : 'B001',
      numero: Date.now() % 100000,
      estado: 'ACEPTADO',
      pdfUrl: 'demo://comprobante.pdf'
    };
  }
}
