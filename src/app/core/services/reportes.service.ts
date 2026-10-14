import { Injectable } from '@angular/core';
import { ProductosService } from './productos.service';
import { SupabaseService } from './supabase.service';
import { VentasService } from './ventas.service';

export interface InventarioValorizadoItem {
  productoId: string;
  producto: string;
  categoria: string;
  stockActual: number;
  costoUnitario: number;
  valorStock: number;
  precioVenta: number;
  valorVentaPotencial: number;
  margenEstimado: number;
  estadoStock: 'CRITICO' | 'ALTO' | 'MEDIO' | 'OK';
}

export interface StockMinimoItem {
  productoId: string;
  producto: string;
  categoria: string;
  stockActual: number;
  stockMinimo: number;
  estadoStock: 'CRITICO' | 'ALTO' | 'MEDIO' | 'OK';
}

export interface VencimientoItem {
  loteId: string;
  productoId: string;
  producto: string;
  codigoLote: string;
  fechaVencimiento: string;
  stockLote: number;
  costoUnitario: number;
  estadoVencimiento: 'VENCIDO' | 'POR_VENCER_7' | 'POR_VENCER_15' | 'POR_VENCER_30' | 'VIGENTE';
}

export interface ResumenSimple {
  nombre: string;
  operaciones?: number;
  cantidad?: number;
  total: number;
}

export interface KardexMovimientoItem {
  id: string;
  producto: string;
  tipoMovimiento: string;
  origen: string;
  fecha: string;
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  observacion?: string;
}

@Injectable({ providedIn: 'root' })
export class ReportesService {
  constructor(
    private supabaseService: SupabaseService,
    private productosService: ProductosService,
    private ventasService: VentasService
  ) {}

  async inventarioValorizado(): Promise<InventarioValorizadoItem[]> {
    if (!this.supabaseService.isConfigured) {
      return this.productosService.listar().map(producto => {
        const costo = producto.costoUnitario ?? producto.precioCompra ?? 0;
        return {
          productoId: producto.id,
          producto: producto.nombre,
          categoria: producto.categoria,
          stockActual: producto.stock,
          costoUnitario: costo,
          valorStock: this.round(producto.stock * costo),
          precioVenta: producto.precioVenta,
          valorVentaPotencial: this.round(producto.stock * producto.precioVenta),
          margenEstimado: this.round((producto.precioVenta - costo) * producto.stock),
          estadoStock: this.estadoStock(producto.stock, producto.stockMinimo)
        };
      });
    }

    const { data, error } = await this.supabaseService.supabase.rpc('reporte_inventario_valorizado');
    if (error) throw this.supabaseService.crearError(error, 'No se pudo cargar inventario valorizado.');
    return (data ?? []).map(this.mapInventario);
  }

  async stockMinimo(): Promise<StockMinimoItem[]> {
    if (!this.supabaseService.isConfigured) {
      return this.productosService.listar()
        .filter(producto => producto.stock <= producto.stockMinimo)
        .map(producto => ({
          productoId: producto.id,
          producto: producto.nombre,
          categoria: producto.categoria,
          stockActual: producto.stock,
          stockMinimo: producto.stockMinimo,
          estadoStock: this.estadoStock(producto.stock, producto.stockMinimo)
        }));
    }

    const { data, error } = await this.supabaseService.supabase.rpc('reporte_stock_minimo');
    if (error) throw this.supabaseService.crearError(error, 'No se pudo cargar stock minimo.');
    return (data ?? []).map((row: any) => ({
      productoId: row.producto_id,
      producto: row.producto,
      categoria: row.categoria,
      stockActual: Number(row.stock_actual),
      stockMinimo: Number(row.stock_minimo),
      estadoStock: row.estado_stock
    }));
  }

  async productosPorVencer(dias = 30): Promise<VencimientoItem[]> {
    if (!this.supabaseService.isConfigured) {
      return [];
    }

    const { data, error } = await this.supabaseService.supabase.rpc('reporte_productos_vencimiento', {
      p_dias: dias
    });
    if (error) throw this.supabaseService.crearError(error, 'No se pudo cargar productos por vencer.');
    return (data ?? []).map((row: any) => ({
      loteId: row.lote_id,
      productoId: row.producto_id,
      producto: row.producto,
      codigoLote: row.codigo_lote,
      fechaVencimiento: row.fecha_vencimiento,
      stockLote: Number(row.stock_lote),
      costoUnitario: Number(row.costo_unitario),
      estadoVencimiento: row.estado_vencimiento
    }));
  }

  async ventasPorMetodoPago(desde: string, hasta: string): Promise<ResumenSimple[]> {
    if (!this.supabaseService.isConfigured) {
      const ventas = this.ventasService.listar().filter(venta => this.enRango(venta.fecha, desde, hasta));
      const map = new Map<string, ResumenSimple>();
      ventas.flatMap(venta => venta.pagos).forEach(pago => {
        const current = map.get(pago.metodo) ?? { nombre: pago.metodo, operaciones: 0, total: 0 };
        current.operaciones = (current.operaciones ?? 0) + 1;
        current.total = this.round(current.total + pago.monto);
        map.set(pago.metodo, current);
      });
      return [...map.values()];
    }

    const { data, error } = await this.supabaseService.supabase.rpc('reporte_ventas_metodo_pago', {
      p_desde: desde,
      p_hasta: hasta
    });
    if (error) throw this.supabaseService.crearError(error, 'No se pudo cargar ventas por metodo de pago.');
    return (data ?? []).map((row: any) => ({
      nombre: row.metodo,
      operaciones: Number(row.operaciones),
      total: Number(row.total)
    }));
  }

  async productosMasVendidos(desde: string, hasta: string): Promise<ResumenSimple[]> {
    if (!this.supabaseService.isConfigured) {
      const map = new Map<string, ResumenSimple>();
      this.ventasService.listar().filter(venta => this.enRango(venta.fecha, desde, hasta)).forEach(venta => {
        venta.detalles.forEach(detalle => {
          const current = map.get(detalle.producto.id) ?? { nombre: detalle.producto.nombre, cantidad: 0, total: 0 };
          current.cantidad = this.round((current.cantidad ?? 0) + detalle.cantidad);
          current.total = this.round(current.total + detalle.total);
          map.set(detalle.producto.id, current);
        });
      });
      return [...map.values()].sort((a, b) => (b.cantidad ?? 0) - (a.cantidad ?? 0)).slice(0, 10);
    }

    const { data, error } = await this.supabaseService.supabase.rpc('reporte_productos_mas_vendidos', {
      p_desde: desde,
      p_hasta: hasta,
      p_limite: 10
    });
    if (error) throw this.supabaseService.crearError(error, 'No se pudo cargar productos mas vendidos.');
    return (data ?? []).map((row: any) => ({
      nombre: row.producto,
      cantidad: Number(row.cantidad),
      total: Number(row.total)
    }));
  }

  async comprobantesPorEstado(desde: string, hasta: string): Promise<ResumenSimple[]> {
    if (!this.supabaseService.isConfigured) {
      const map = new Map<string, ResumenSimple>();
      this.ventasService.listar().filter(venta => this.enRango(venta.fecha, desde, hasta)).forEach(venta => {
        const estado = venta.comprobante?.estado ?? 'REGISTRADA';
        const current = map.get(estado) ?? { nombre: estado, operaciones: 0, total: 0 };
        current.operaciones = (current.operaciones ?? 0) + 1;
        current.total = this.round(current.total + venta.total);
        map.set(estado, current);
      });
      return [...map.values()];
    }

    const { data, error } = await this.supabaseService.supabase.rpc('reporte_comprobantes_estado', {
      p_desde: desde,
      p_hasta: hasta
    });
    if (error) throw this.supabaseService.crearError(error, 'No se pudo cargar comprobantes.');
    return (data ?? []).map((row: any) => ({
      nombre: row.estado,
      operaciones: Number(row.cantidad),
      total: Number(row.total)
    }));
  }

  async ingresosEgresos(desde: string, hasta: string): Promise<ResumenSimple[]> {
    if (!this.supabaseService.isConfigured) {
      return [];
    }

    const { data, error } = await this.supabaseService.supabase.rpc('reporte_ingresos_egresos', {
      p_desde: desde,
      p_hasta: hasta
    });
    if (error) throw this.supabaseService.crearError(error, 'No se pudo cargar ingresos y egresos.');
    return (data ?? []).map((row: any) => ({
      nombre: row.tipo,
      operaciones: Number(row.operaciones),
      total: Number(row.total)
    }));
  }

  async kardexReciente(limite = 20): Promise<KardexMovimientoItem[]> {
    if (!this.supabaseService.isConfigured) {
      return [];
    }

    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const { data, error } = await this.supabaseService.supabase
      .from('kardex_movimientos')
      .select('*, productos(nombre)')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false })
      .limit(limite);

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo cargar el Kardex.');
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      producto: row.productos?.nombre ?? 'Producto',
      tipoMovimiento: row.tipo_movimiento,
      origen: row.origen,
      fecha: row.fecha,
      cantidad: Number(row.cantidad),
      stockAnterior: Number(row.stock_anterior),
      stockNuevo: Number(row.stock_nuevo),
      observacion: row.observacion ?? undefined
    }));
  }

  private mapInventario(row: any): InventarioValorizadoItem {
    return {
      productoId: row.producto_id,
      producto: row.producto,
      categoria: row.categoria,
      stockActual: Number(row.stock_actual),
      costoUnitario: Number(row.costo_unitario),
      valorStock: Number(row.valor_stock),
      precioVenta: Number(row.precio_venta),
      valorVentaPotencial: Number(row.valor_venta_potencial),
      margenEstimado: Number(row.margen_estimado),
      estadoStock: row.estado_stock
    };
  }

  private estadoStock(stock: number, minimo: number): 'CRITICO' | 'ALTO' | 'MEDIO' | 'OK' {
    if (stock === 0) return 'CRITICO';
    if (stock < minimo) return 'ALTO';
    if (stock === minimo && minimo > 0) return 'MEDIO';
    return 'OK';
  }

  private enRango(fecha: string, desde: string, hasta: string): boolean {
    const value = new Date(fecha).getTime();
    return value >= new Date(`${desde}T00:00:00`).getTime() &&
      value <= new Date(`${hasta}T23:59:59`).getTime();
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
