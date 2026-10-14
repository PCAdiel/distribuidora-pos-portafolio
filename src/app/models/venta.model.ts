import { Cliente } from './cliente.model';
import { Producto } from './producto.model';

export interface VentaDetalle {
  tipo?: 'PRODUCTO' | 'COMBO';
  comboId?: string;
  producto: Producto;
  cantidad: number;
  precioUnitario: number;
  total: number;
}

export interface Pago {
  metodo: 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA';
  monto: number;
  referencia?: string;
}

export type ComprobanteEstado =
  | 'PENDIENTE'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'PENDIENTE_FACTURACION'
  | 'ENVIANDO'
  | 'EMITIDO'
  | 'ERROR_FACTURACION'
  | 'PENDIENTE_REINTENTO'
  | 'ANULADO_LOCAL'
  | 'ANULADO_NUBEFACT';

export interface Comprobante {
  id: string;
  tipo: 'BOLETA' | 'FACTURA';
  serie: string;
  numero: number;
  estado: ComprobanteEstado;
  pdfUrl?: string;
  xmlUrl?: string;
  cdrUrl?: string;
  enlace?: string;
  sunatDescription?: string;
  sunatNote?: string;
  sunatResponseCode?: string;
  cadenaQr?: string;
  codigoHash?: string;
}

export interface Venta {
  id: string;
  clientSaleId?: string;
  cliente?: Cliente;
  detalles: VentaDetalle[];
  pagos: Pago[];
  tipoComprobante: 'BOLETA' | 'FACTURA';
  subtotal: number;
  igv: number;
  total: number;
  comprobante?: Comprobante;
  fecha: string;
}
