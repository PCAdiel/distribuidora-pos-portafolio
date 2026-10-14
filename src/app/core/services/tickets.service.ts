import { Injectable } from '@angular/core';
import { Combo } from '../../models/combo.model';
import { Producto } from '../../models/producto.model';
import { TicketItem } from '../../models/ticket.model';

@Injectable({ providedIn: 'root' })
export class TicketsService {
  calcularTotal(items: TicketItem[]): number {
    return items.reduce((acc, item) => acc + item.total, 0);
  }

  agregarProducto(items: TicketItem[], producto: Producto): TicketItem[] {
    const item = items.find(i => this.itemKey(i) === this.productoKey(producto.id));
    const cantidadActual = item?.cantidad ?? 0;

    return this.actualizarCantidad(items, producto, cantidadActual + 1, 'PRODUCTO');
  }

  agregarCombo(items: TicketItem[], combo: Combo): TicketItem[] {
    const producto = this.comboComoProducto(combo);
    const item = items.find(i => this.itemKey(i) === this.comboKey(combo.id));
    const cantidadActual = item?.cantidad ?? 0;

    return this.actualizarCantidad(items, producto, cantidadActual + 1, 'COMBO', combo.id);
  }

  disminuirProducto(items: TicketItem[], productoId: string): TicketItem[] {
    const item = items.find(i => this.itemKey(i) === this.productoKey(productoId));

    if (!item) {
      return items;
    }

    return this.actualizarCantidad(items, item.producto, item.cantidad - 1, 'PRODUCTO');
  }

  disminuirItem(items: TicketItem[], item: TicketItem): TicketItem[] {
    return this.actualizarCantidad(items, item.producto, item.cantidad - 1, item.tipo ?? 'PRODUCTO', item.comboId);
  }

  actualizarCantidad(
    items: TicketItem[],
    producto: Producto,
    cantidad: number,
    tipo: 'PRODUCTO' | 'COMBO' = 'PRODUCTO',
    comboId?: string
  ): TicketItem[] {
    const cantidadNormalizada = Math.trunc(Number(cantidad));
    const key = tipo === 'COMBO' ? this.comboKey(comboId ?? producto.id) : this.productoKey(producto.id);

    if (!Number.isFinite(cantidadNormalizada) || cantidadNormalizada < 0) {
      throw new Error('La cantidad debe ser un numero valido mayor o igual a cero.');
    }

    if (cantidadNormalizada > producto.stock) {
      throw new Error(`No hay stock suficiente para ${producto.nombre}. Stock disponible: ${producto.stock}.`);
    }

    if (cantidadNormalizada === 0) {
      return this.eliminarItem(items, key);
    }

    const total = this.redondearMoneda(cantidadNormalizada * producto.precioVenta);
    const existe = items.some(i => this.itemKey(i) === key);

    if (!existe) {
      return [
        ...items,
        {
          tipo,
          comboId,
          producto,
          cantidad: cantidadNormalizada,
          precioUnitario: producto.precioVenta,
          total
        }
      ];
    }

    return items.map(item =>
      this.itemKey(item) === key
        ? {
            ...item,
            tipo,
            comboId,
            cantidad: cantidadNormalizada,
            precioUnitario: producto.precioVenta,
            total
          }
        : item
    );
  }

  eliminarProducto(items: TicketItem[], productoId: string): TicketItem[] {
    return this.eliminarItem(items, this.productoKey(productoId));
  }

  eliminarTicketItem(items: TicketItem[], item: TicketItem): TicketItem[] {
    return this.eliminarItem(items, this.itemKey(item));
  }

  validarAntesDeCobrar(items: TicketItem[]): void {
    if (items.length === 0) {
      throw new Error('Agrega al menos un producto al ticket.');
    }

    for (const item of items) {
      if (item.cantidad <= 0) {
        throw new Error(`La cantidad de ${item.producto.nombre} debe ser mayor a cero.`);
      }

      if (item.cantidad > item.producto.stock) {
        throw new Error(`No hay stock suficiente para ${item.producto.nombre}.`);
      }
    }
  }

  private comboComoProducto(combo: Combo): Producto {
    return {
      id: combo.id,
      nombre: combo.nombre,
      categoria: 'Combo',
      descripcion: combo.descripcion,
      unidadMedida: 'NIU',
      precioVenta: combo.precioVenta,
      stock: combo.stockDisponible,
      stockMinimo: 0,
      activo: combo.activo
    };
  }

  private eliminarItem(items: TicketItem[], key: string): TicketItem[] {
    return items.filter(item => this.itemKey(item) !== key);
  }

  private itemKey(item: TicketItem): string {
    return item.tipo === 'COMBO' ? this.comboKey(item.comboId ?? item.producto.id) : this.productoKey(item.producto.id);
  }

  private productoKey(productoId: string): string {
    return `PRODUCTO:${productoId}`;
  }

  private comboKey(comboId: string): string {
    return `COMBO:${comboId}`;
  }

  private redondearMoneda(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
