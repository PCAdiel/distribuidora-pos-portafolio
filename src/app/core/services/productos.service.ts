import { Injectable } from '@angular/core';
import { Producto } from '../../models/producto.model';
import { SupabaseService } from './supabase.service';

const KEY = 'demo_productos';

const SEED: Producto[] = [
  { id: 'p1', nombre: 'Coca Cola 500 ml', categoria: 'Gaseosas', unidadMedida: 'NIU', precioVenta: 3.00, stock: 120, stockMinimo: 20, activo: true },
  { id: 'p2', nombre: 'Inca Kola 500 ml', categoria: 'Gaseosas', unidadMedida: 'NIU', precioVenta: 3.00, stock: 100, stockMinimo: 20, activo: true },
  { id: 'p3', nombre: 'Agua San Luis 625 ml', categoria: 'Bebidas', unidadMedida: 'NIU', precioVenta: 2.00, stock: 150, stockMinimo: 30, activo: true },
  { id: 'p4', nombre: 'Cereal Angel Chock', categoria: 'Golosinas', unidadMedida: 'NIU', precioVenta: 2.50, stock: 90, stockMinimo: 15, activo: true },
  { id: 'p5', nombre: 'Galleta Oreo', categoria: 'Galletas', unidadMedida: 'NIU', precioVenta: 1.50, stock: 200, stockMinimo: 40, activo: true }
];

@Injectable({ providedIn: 'root' })
export class ProductosService {
  constructor(private supabaseService: SupabaseService) {}

  listar(): Producto[] {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(SEED));
      return SEED;
    }
    return JSON.parse(raw) as Producto[];
  }

  async listarRemoto(): Promise<Producto[]> {
    if (!this.supabaseService.isConfigured) {
      return this.listar();
    }

    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const { data, error } = await this.supabaseService.supabase
      .from('productos')
      .select('*, categorias(nombre)')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw this.supabaseService.crearError(error);
    }

    const productos = (data ?? []).map(row => this.mapearDesdeSupabase(row));
    localStorage.setItem(KEY, JSON.stringify(productos.length ? productos : this.listar()));
    return productos.length ? productos : this.listar();
  }

  async guardar(producto: Producto): Promise<Producto> {
    const idLocalAnterior = producto.id;
    const esNuevo = !producto.id || !this.supabaseService.esUuid(producto.id);
    const productoLocal = this.guardarLocal(producto);

    if (!this.supabaseService.isConfigured) {
      return productoLocal;
    }

    const productoSupabase = await this.guardarEnSupabase(productoLocal, esNuevo);
    this.reemplazarLocal(idLocalAnterior || productoLocal.id, productoSupabase);
    return productoSupabase;
  }

  async descontarStock(productoId: string, cantidad: number): Promise<void> {
    const productos = this.descontarStockLocal(productoId, cantidad);

    if (!this.supabaseService.isConfigured || !this.supabaseService.esUuid(productoId)) {
      return;
    }

    const producto = productos.find(p => p.id === productoId);
    const { error } = await this.supabaseService.supabase
      .from('productos')
      .update({ stock: producto?.stock ?? 0 })
      .eq('id', productoId);

    if (error) {
      throw this.supabaseService.crearError(error);
    }
  }

  descontarStockLocal(productoId: string, cantidad: number): Producto[] {
    const productos = this.listar().map(p => p.id === productoId ? { ...p, stock: Math.max(0, p.stock - cantidad) } : p);
    localStorage.setItem(KEY, JSON.stringify(productos));
    return productos;
  }

  private guardarLocal(producto: Producto): Producto {
    const productos = this.listar();
    const index = productos.findIndex(p => p.id === producto.id);
    const productoFinal = producto.id ? producto : { ...producto, id: `local-${crypto.randomUUID()}`, activo: true };

    if (index >= 0) {
      productos[index] = productoFinal;
    } else {
      productos.unshift(productoFinal);
    }

    localStorage.setItem(KEY, JSON.stringify(productos));
    return productoFinal;
  }

  private reemplazarLocal(idAnterior: string, producto: Producto): void {
    const productos = this.listar().filter(p => p.id !== idAnterior && p.id !== producto.id);
    productos.unshift(producto);
    localStorage.setItem(KEY, JSON.stringify(productos));
  }

  private async guardarEnSupabase(producto: Producto, forzarInsert = false): Promise<Producto> {
    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const categoriaId = await this.obtenerCategoriaId(empresaId, producto.categoria);
    const payload = {
      empresa_id: empresaId,
      categoria_id: categoriaId,
      nombre: producto.nombre,
      unidad_medida: producto.unidadMedida,
      precio_venta: producto.precioVenta,
      precio_compra: producto.precioCompra ?? null,
      costo_unitario: producto.costoUnitario ?? producto.precioCompra ?? 0,
      stock: producto.stock,
      stock_minimo: producto.stockMinimo,
      descripcion: producto.descripcion ?? null,
      imagen_url: producto.imagenUrl ?? null,
      activo: producto.activo
    };

    if (!forzarInsert && this.supabaseService.esUuid(producto.id)) {
      const { data, error } = await this.supabaseService.supabase
        .from('productos')
        .update(payload)
        .eq('id', producto.id)
        .select('*, categorias(nombre)')
        .maybeSingle();

      if (error) {
        throw this.supabaseService.crearError(error);
      }

      if (data) {
        return this.mapearDesdeSupabase(data);
      }
    }

    const { data, error } = await this.supabaseService.supabase
      .from('productos')
      .insert(payload)
      .select('*, categorias(nombre)')
      .single();

    if (error) {
      throw this.supabaseService.crearError(error);
    }

    return this.mapearDesdeSupabase(data);
  }

  private async obtenerCategoriaId(empresaId: string, nombre: string): Promise<string | null> {
    const categoriaNombre = nombre.trim() || 'General';
    const { data: existente, error: selectError } = await this.supabaseService.supabase
      .from('categorias')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('nombre', categoriaNombre)
      .maybeSingle();

    if (selectError) {
      throw this.supabaseService.crearError(selectError);
    }

    if (existente?.id) {
      return existente.id;
    }

    const { data, error } = await this.supabaseService.supabase
      .from('categorias')
      .insert({ empresa_id: empresaId, nombre: categoriaNombre })
      .select('id')
      .single();

    if (error) {
      throw this.supabaseService.crearError(error);
    }

    return data.id;
  }

  private mapearDesdeSupabase(row: any): Producto {
    return {
      id: row.id,
      nombre: row.nombre,
      categoria: row.categorias?.nombre ?? 'General',
      descripcion: row.descripcion ?? undefined,
      unidadMedida: row.unidad_medida,
      precioVenta: Number(row.precio_venta),
      precioCompra: row.precio_compra === null ? undefined : Number(row.precio_compra),
      costoUnitario: row.costo_unitario === null || row.costo_unitario === undefined ? undefined : Number(row.costo_unitario),
      stock: Number(row.stock),
      stockMinimo: Number(row.stock_minimo),
      imagenUrl: row.imagen_url ?? undefined,
      activo: row.activo
    };
  }

  async eliminar(producto: Producto): Promise<void> {
    const productos = this.listar().filter(p => p.id !== producto.id);
    localStorage.setItem(KEY, JSON.stringify(productos));

    if (!this.supabaseService.isConfigured || !this.supabaseService.esUuid(producto.id)) {
      return;
    }

    const { error } = await this.supabaseService.supabase
      .from('productos')
      .update({ activo: false })
      .eq('id', producto.id);

    if (error) {
      throw this.supabaseService.crearError(error);
    }
  }
}
