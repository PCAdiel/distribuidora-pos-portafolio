import { Injectable } from '@angular/core';
import { Venta } from '../../../models/venta.model';
import { NubefactComprobanteRequest } from '../models/facturacion.models';

@Injectable({ providedIn: 'root' })
export class NubefactMapper {
  toComprobanteRequest(venta: Venta): NubefactComprobanteRequest {
    const tipo = venta.tipoComprobante === 'FACTURA' ? 1 : 2;
    const cliente = venta.cliente;

    return {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: tipo,
      serie: venta.comprobante?.serie ?? (tipo === 1 ? 'F001' : 'B001'),
      numero: venta.comprobante?.numero ?? 0,
      sunat_transaction: 1,
      cliente_tipo_de_documento: this.tipoDocumentoNubefact(cliente?.tipoDocumento),
      cliente_numero_de_documento: cliente?.numeroDocumento || (tipo === 1 ? '' : '00000000'),
      cliente_denominacion: cliente?.nombreRazonSocial || 'Clientes varios',
      cliente_direccion: cliente?.direccion || '',
      fecha_de_emision: this.fechaNubefact(venta.fecha),
      moneda: 1,
      porcentaje_de_igv: 18,
      total_gravada: venta.subtotal,
      total_igv: venta.igv,
      total: venta.total,
      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: false,
      formato_de_pdf: 'TICKET',
      items: venta.detalles.map(item => {
        const valorUnitario = this.round(item.precioUnitario / 1.18);
        const subtotal = this.round(item.total / 1.18);
        const igv = this.round(item.total - subtotal);

        return {
          unidad_de_medida: item.producto.unidadMedida || 'NIU',
          codigo: item.producto.id,
          descripcion: item.producto.nombre,
          cantidad: item.cantidad,
          valor_unitario: valorUnitario,
          precio_unitario: item.precioUnitario,
          subtotal,
          tipo_de_igv: 1 as const,
          igv,
          total: item.total,
          anticipo_regularizacion: false as const
        };
      })
    };
  }

  private tipoDocumentoNubefact(tipo?: string): string {
    if (tipo === 'RUC') {
      return '6';
    }

    if (tipo === 'DNI') {
      return '1';
    }

    return '-';
  }

  private fechaNubefact(fecha: string): string {
    const date = new Date(fecha);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(Number.isNaN(date.getTime()) ? new Date() : date);
    const day = parts.find(part => part.type === 'day')?.value ?? '01';
    const month = parts.find(part => part.type === 'month')?.value ?? '01';
    const year = parts.find(part => part.type === 'year')?.value ?? String(new Date().getFullYear());

    return `${day}-${month}-${year}`;
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
