export interface ProductoLote {
  id?: string;
  productoId: string;
  codigoLote: string;
  fechaVencimiento: string;
  stockLote: number;
  costoUnitario: number;
  activo: boolean;
}
