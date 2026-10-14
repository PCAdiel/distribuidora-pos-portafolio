export type FacturacionEstado =
  | 'PENDIENTE_FACTURACION'
  | 'ENVIANDO'
  | 'EMITIDO'
  | 'ERROR_FACTURACION'
  | 'PENDIENTE_REINTENTO'
  | 'ANULADO_LOCAL'
  | 'ANULADO_NUBEFACT';

export type NubefactTipoComprobante = 1 | 2 | 3;

export interface NubefactItem {
  unidad_de_medida: string;
  codigo?: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  precio_unitario: number;
  subtotal: number;
  tipo_de_igv: 1;
  igv: number;
  total: number;
  anticipo_regularizacion: false;
}

export interface NubefactComprobanteRequest {
  operacion: 'generar_comprobante';
  tipo_de_comprobante: NubefactTipoComprobante;
  serie: string;
  numero: number;
  sunat_transaction: 1;
  cliente_tipo_de_documento: string;
  cliente_numero_de_documento: string;
  cliente_denominacion: string;
  cliente_direccion: string;
  fecha_de_emision: string;
  moneda: 1;
  porcentaje_de_igv: 18;
  total_gravada: number;
  total_igv: number;
  total: number;
  enviar_automaticamente_a_la_sunat: true;
  enviar_automaticamente_al_cliente: false;
  formato_de_pdf: 'TICKET' | 'A4';
  items: NubefactItem[];
}

export interface NubefactRespuesta {
  ok?: boolean;
  comprobante?: {
    comprobante_id?: string;
    estado?: string;
  };
  nubefact?: Record<string, unknown>;
  tipo_de_comprobante?: number;
  serie?: string;
  numero?: number;
  enlace?: string;
  enlace_del_pdf?: string;
  enlace_del_xml?: string;
  enlace_del_cdr?: string;
  aceptada_por_sunat?: boolean;
  sunat_description?: string;
  sunat_note?: string;
  sunat_responsecode?: string;
  sunat_soap_error?: string;
  cadena_para_codigo_qr?: string;
  codigo_hash?: string;
  errors?: string;
  codigo?: string | number;
}
