export interface ComboItem {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  stock: number;
  precioVenta?: number;
}

export interface Combo {
  id: string;
  nombre: string;
  descripcion?: string;
  precioVenta: number;
  activo: boolean;
  stockDisponible: number;
  componentes: ComboItem[];
}
