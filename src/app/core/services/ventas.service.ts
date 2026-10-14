import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ErrorService } from '../errors/error.service';
import { OfflineQueueService, OfflineVentaPendiente } from '../offline/offline-queue.service';
import { FacturacionService } from '../../features/facturacion/services/facturacion.service';
import { Venta } from '../../models/venta.model';
import { ProductosService } from './productos.service';
import { SupabaseService } from './supabase.service';

const KEY = 'demo_ventas';

@Injectable({ providedIn: 'root' })
export class VentasService {
  ultimoErrorSincronizacion = '';

  constructor(
    private productosService: ProductosService,
    private facturacion: FacturacionService,
    private supabaseService: SupabaseService,
    private offlineQueue: OfflineQueueService,
    private errorService: ErrorService
  ) {}

  listar(): Venta[] {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Venta[];
  }

  async listarRemoto(): Promise<Venta[]> {
    if (!this.supabaseService.isConfigured) {
      return this.listar();
    }

    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const { data, error } = await this.supabaseService.supabase
      .from('ventas')
      .select(`
        *,
        clientes(*),
        venta_detalle(*, productos(*, categorias(nombre)), combos(*)),
        pagos(*),
        comprobantes(*)
      `)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudieron cargar las ventas.');
    }

    const ventas = (data ?? []).map(row => this.mapearVentaDesdeSupabase(row));
    localStorage.setItem(KEY, JSON.stringify(ventas));
    return ventas;
  }

  async registrar(venta: Venta): Promise<Venta> {
    this.ultimoErrorSincronizacion = '';
    const preparada = this.prepararVenta(venta);
    this.validarVenta(preparada);

    if (!this.supabaseService.isConfigured || !navigator.onLine) {
      return this.guardarOffline(preparada, 'Venta guardada sin internet. Se sincronizara luego.');
    }

    try {
      const ventaRemota = await this.guardarEnSupabase(preparada);
      const ventaFinal = await this.facturacion.intentarEmitirSiConfigurado(ventaRemota);
      this.guardarLocal(ventaFinal);
      return ventaFinal;
    } catch (error) {
      this.errorService.log('ventas.registrar', error);

      if (this.esErrorConexion(error)) {
        return this.guardarOffline(preparada, 'Venta guardada sin internet. Se sincronizara luego.');
      }

      throw this.supabaseService.crearError(error, 'No se pudo registrar la venta. Intenta nuevamente.');
    }
  }

  async sincronizarPendientes(): Promise<number> {
    if (!this.supabaseService.isConfigured || !navigator.onLine) {
      return 0;
    }

    const pendientes = await this.offlineQueue.listarPendientes();
    let sincronizadas = 0;

    for (const pendiente of pendientes) {
      try {
        await this.sincronizarPendiente(pendiente);
        sincronizadas++;
      } catch (error) {
        const message = this.errorService.toTechnicalMessage(error) || 'No se pudo sincronizar la venta.';
        await this.offlineQueue.marcarError(pendiente.clientSaleId, message);
        this.errorService.log('ventas.sincronizarPendientes', error);
      }
    }

    await this.offlineQueue.refrescarConteo();
    return sincronizadas;
  }

  private async sincronizarPendiente(pendiente: OfflineVentaPendiente): Promise<void> {
    await this.offlineQueue.marcarSincronizando(pendiente.clientSaleId);
    const ventaRemota = await this.guardarEnSupabase(pendiente.venta);
    const ventaFinal = await this.facturacion.intentarEmitirSiConfigurado(ventaRemota);
    this.guardarLocal(ventaFinal);
    await this.offlineQueue.marcarSincronizada(pendiente.clientSaleId, ventaFinal.id);
  }

  private prepararVenta(venta: Venta): Venta {
    const clientSaleId = venta.clientSaleId || venta.id || crypto.randomUUID();

    return {
      ...venta,
      id: venta.id || clientSaleId,
      clientSaleId,
      detalles: venta.detalles.map(item => ({
        ...item,
        producto: { ...item.producto }
      })),
      pagos: venta.pagos.map(pago => ({ ...pago }))
    };
  }

  private async guardarOffline(venta: Venta, mensaje: string): Promise<Venta> {
    const ventaFinal: Venta = {
      ...venta,
      comprobante: venta.comprobante ?? {
        id: `local-${venta.clientSaleId}`,
        tipo: venta.tipoComprobante,
        serie: this.seriePara(venta.tipoComprobante),
        numero: Date.now() % 100000,
        estado: 'PENDIENTE_FACTURACION'
      }
    };

    this.guardarLocal(ventaFinal);
    await this.offlineQueue.guardarVentaPendiente(ventaFinal, mensaje);

    for (const item of ventaFinal.detalles) {
      if (item.tipo !== 'COMBO') {
        this.productosService.descontarStockLocal(item.producto.id, item.cantidad);
      }
    }

    this.ultimoErrorSincronizacion = mensaje;
    return ventaFinal;
  }

  private guardarLocal(venta: Venta): void {
    const ventas = this.listar();
    const index = ventas.findIndex(v => v.id === venta.id || v.clientSaleId === venta.clientSaleId);

    if (index >= 0) {
      ventas[index] = venta;
    } else {
      ventas.unshift(venta);
    }

    localStorage.setItem(KEY, JSON.stringify(ventas));
  }

  private async guardarEnSupabase(venta: Venta): Promise<Venta> {
    const clienteId = await this.obtenerIdExistente('clientes', venta.cliente?.id);
    const detalles = venta.detalles.map(item => {
      if (item.tipo === 'COMBO') {
        const comboId = item.comboId ?? item.producto.id;

        if (!this.supabaseService.esUuid(comboId)) {
          throw new Error(`El combo ${item.producto.nombre} no esta sincronizado con Supabase.`);
        }

        return {
          tipo_item: 'COMBO',
          combo_id: comboId,
          cantidad: item.cantidad
        };
      }

      if (!this.supabaseService.esUuid(item.producto.id)) {
        throw new Error(`El producto ${item.producto.nombre} no esta sincronizado con Supabase.`);
      }

      return {
        tipo_item: 'PRODUCTO',
        producto_id: item.producto.id,
        cantidad: item.cantidad
      };
    });
    const pagos = venta.pagos.map(pago => ({
      metodo: pago.metodo,
      monto: pago.monto,
      referencia: pago.referencia ?? null
    }));

    const payload = {
      client_sale_id: venta.clientSaleId,
      cliente_id: clienteId,
      tipo_comprobante: venta.tipoComprobante,
      subtotal: venta.subtotal,
      igv: venta.igv,
      total: venta.total,
      detalles,
      pagos,
      serie: this.seriePara(venta.tipoComprobante)
    };

    const { data, error } = await this.supabaseService.supabase.rpc('registrar_venta_pos_json', {
      p_payload: payload
    });

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo registrar la venta en Supabase.');
    }

    const result = data as {
      venta_id?: string;
      comprobante_id?: string;
      serie?: string;
      numero?: number;
      estado?: string;
      total?: number;
      subtotal?: number;
      igv?: number;
      created_at?: string;
      duplicada?: boolean;
    };

    if (!result?.venta_id) {
      throw new Error('Supabase no devolvio el ID de la venta registrada.');
    }

    return {
      ...venta,
      id: result.venta_id,
      fecha: result.created_at ?? venta.fecha,
      subtotal: Number(result.subtotal ?? venta.subtotal),
      igv: Number(result.igv ?? venta.igv),
      total: Number(result.total ?? venta.total),
      comprobante: {
        id: result.comprobante_id ?? venta.comprobante?.id ?? `local-${venta.clientSaleId}`,
        tipo: venta.tipoComprobante,
        serie: result.serie ?? venta.comprobante?.serie ?? this.seriePara(venta.tipoComprobante),
        numero: Number(result.numero ?? venta.comprobante?.numero ?? 0),
        estado: (result.estado ?? 'PENDIENTE_FACTURACION') as NonNullable<Venta['comprobante']>['estado']
      }
    };
  }

  private validarVenta(venta: Venta): void {
    if (venta.detalles.length === 0) {
      throw new Error('La venta debe tener al menos un producto.');
    }

    if (venta.total <= 0 || venta.subtotal < 0 || venta.igv < 0) {
      throw new Error('Los importes de la venta no son validos.');
    }

    if (venta.pagos.length === 0 || venta.pagos.some(pago => pago.monto <= 0)) {
      throw new Error('Registra al menos un pago valido.');
    }

    for (const item of venta.detalles) {
      if (item.cantidad <= 0 || item.precioUnitario < 0 || item.total < 0) {
        throw new Error(`Revisa cantidad y precio de ${item.producto.nombre}.`);
      }
    }
  }

  private mapearVentaDesdeSupabase(row: any): Venta {
    return {
      id: row.id,
      clientSaleId: row.client_sale_id ?? undefined,
      cliente: row.clientes ? {
        id: row.clientes.id,
        tipoDocumento: row.clientes.tipo_documento,
        numeroDocumento: row.clientes.numero_documento,
        nombreRazonSocial: row.clientes.nombre_razon_social,
        direccion: row.clientes.direccion ?? undefined,
        telefono: row.clientes.telefono ?? undefined,
        correo: row.clientes.correo ?? undefined
      } : undefined,
      detalles: (row.venta_detalle ?? []).map((detalle: any) => {
        const esCombo = (detalle.tipo_item ?? '').toUpperCase() === 'COMBO' || !!detalle.combo_id;

        return {
          tipo: esCombo ? 'COMBO' : 'PRODUCTO',
          comboId: esCombo ? detalle.combo_id : undefined,
          producto: {
            id: esCombo ? detalle.combo_id : (detalle.productos?.id ?? ''),
            nombre: detalle.descripcion ?? detalle.combos?.nombre ?? detalle.productos?.nombre ?? 'Producto',
            categoria: esCombo ? 'Combo' : (detalle.productos?.categorias?.nombre ?? 'General'),
            unidadMedida: detalle.productos?.unidad_medida ?? 'NIU',
            precioVenta: Number(detalle.precio_unitario),
            stock: Number(detalle.productos?.stock ?? 0),
            stockMinimo: Number(detalle.productos?.stock_minimo ?? 0),
            imagenUrl: detalle.productos?.imagen_url ?? undefined,
            activo: detalle.productos?.activo ?? true
          },
          cantidad: Number(detalle.cantidad),
          precioUnitario: Number(detalle.precio_unitario),
          total: Number(detalle.total)
        };
      }),
      pagos: (row.pagos ?? []).map((pago: any) => ({
        metodo: pago.metodo,
        monto: Number(pago.monto),
        referencia: pago.referencia ?? undefined
      })),
      tipoComprobante: row.tipo_comprobante,
      subtotal: Number(row.subtotal),
      igv: Number(row.igv),
      total: Number(row.total),
      comprobante: row.comprobantes?.[0] ? {
        id: row.comprobantes[0].id,
        tipo: row.comprobantes[0].tipo_comprobante,
        serie: row.comprobantes[0].serie,
        numero: row.comprobantes[0].numero,
        estado: row.comprobantes[0].estado,
        enlace: row.comprobantes[0].proveedor_id ?? undefined,
        pdfUrl: row.comprobantes[0].pdf_url ?? undefined,
        xmlUrl: row.comprobantes[0].xml_url ?? undefined,
        cdrUrl: row.comprobantes[0].cdr_url ?? undefined,
        sunatDescription: row.comprobantes[0].sunat_description ?? undefined,
        sunatNote: row.comprobantes[0].sunat_note ?? undefined,
        sunatResponseCode: row.comprobantes[0].sunat_responsecode ?? undefined,
        cadenaQr: row.comprobantes[0].cadena_para_codigo_qr ?? undefined,
        codigoHash: row.comprobantes[0].codigo_hash ?? undefined
      } : undefined,
      fecha: row.created_at
    };
  }

  private async obtenerIdExistente(tabla: 'clientes' | 'productos', id?: string): Promise<string | null> {
    if (!id || !this.supabaseService.esUuid(id)) {
      return null;
    }

    const { data, error } = await this.supabaseService.supabase
      .from(tabla)
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error || !data?.id) {
      return null;
    }

    return data.id;
  }

  private esErrorConexion(error: unknown): boolean {
    const message = this.errorService.toTechnicalMessage(error).toLowerCase();
    return !navigator.onLine ||
      message.includes('failed to fetch') ||
      message.includes('network request failed') ||
      message.includes('load failed') ||
      message.includes('fetch');
  }

  private seriePara(tipo: Venta['tipoComprobante']): string {
    return tipo === 'FACTURA'
      ? environment.nubefactSerieFactura
      : environment.nubefactSerieBoleta;
  }
}
