import { Producto } from './producto.model';

export interface TicketItem {
  tipo?: 'PRODUCTO' | 'COMBO';
  comboId?: string;
  producto: Producto;
  cantidad: number;
  precioUnitario: number;
  total: number;
}
