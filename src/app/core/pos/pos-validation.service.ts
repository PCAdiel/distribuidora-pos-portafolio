import { Injectable } from '@angular/core';
import { Cliente } from '../../models/cliente.model';

@Injectable({ providedIn: 'root' })
export class PosValidationService {
  validarClienteParaCobro(options: {
    cliente?: Cliente;
    tipoComprobante: 'BOLETA' | 'FACTURA';
    total: number;
    ventasSinCliente: boolean;
  }): void {
    const { cliente, tipoComprobante, total, ventasSinCliente } = options;
    const documento = this.soloDigitos(cliente?.numeroDocumento ?? '');

    if (!ventasSinCliente && (!cliente || cliente.tipoDocumento === 'SIN_DOCUMENTO')) {
      throw new Error('Selecciona un cliente antes de cobrar. La venta sin cliente esta desactivada en Configuracion.');
    }

    if (tipoComprobante === 'BOLETA' && total > 700) {
      if (!cliente || cliente.tipoDocumento === 'SIN_DOCUMENTO' || documento.length < 8) {
        throw new Error('Para boletas mayores a S/ 700 selecciona un cliente con documento valido.');
      }
    }

    if (tipoComprobante === 'FACTURA') {
      if (!cliente || cliente.tipoDocumento !== 'RUC' || documento.length !== 11) {
        throw new Error('Para emitir factura selecciona un cliente con RUC valido de 11 digitos.');
      }

      if (!cliente.nombreRazonSocial.trim() || !cliente.direccion?.trim()) {
        throw new Error('Para emitir factura el cliente debe tener razon social y direccion.');
      }
    }
  }

  private soloDigitos(value: string): string {
    return value.replace(/\D/g, '');
  }
}
