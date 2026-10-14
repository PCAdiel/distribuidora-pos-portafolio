export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  descripcion?: string;
  unidadMedida: 'NIU' | 'CAJA' | 'PAQUETE';
  precioVenta: number;
  precioCompra?: number;
  costoUnitario?: number;
  stock: number;
  stockMinimo: number;
  imagenUrl?: string;
  activo: boolean;
}
