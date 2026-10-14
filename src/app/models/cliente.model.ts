export interface Cliente {
  id: string;
  tipoDocumento: 'DNI' | 'RUC' | 'SIN_DOCUMENTO';
  numeroDocumento: string;
  nombreRazonSocial: string;
  direccion?: string;
  telefono?: string;
  correo?: string;
}
