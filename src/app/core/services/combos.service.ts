import { Injectable } from '@angular/core';
import { Combo, ComboItem } from '../../models/combo.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class CombosService {
  constructor(private supabaseService: SupabaseService) {}

  async listarPos(): Promise<Combo[]> {
    if (!this.supabaseService.isConfigured) {
      return [];
    }

    const { data, error } = await this.supabaseService.supabase.rpc('listar_combos_pos');

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudieron cargar los combos.');
    }

    return (data ?? []).map((row: any) => ({
      id: row.combo_id,
      nombre: row.nombre,
      descripcion: row.descripcion ?? undefined,
      precioVenta: Number(row.precio_venta),
      activo: row.activo,
      stockDisponible: Number(row.stock_disponible ?? 0),
      componentes: (row.componentes ?? []).map((item: any) => ({
        productoId: item.producto_id,
        productoNombre: item.producto,
        cantidad: Number(item.cantidad),
        stock: Number(item.stock)
      }))
    }));
  }

  async listarAdmin(): Promise<Combo[]> {
    if (!this.supabaseService.isConfigured) {
      return [];
    }

    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const { data, error } = await this.supabaseService.supabase
      .from('combos')
      .select('*, combo_items(*, productos(id, nombre, stock, precio_venta))')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudieron cargar los combos.');
    }

    return (data ?? []).map(row => this.mapearAdmin(row));
  }

  async guardar(combo: Pick<Combo, 'id' | 'nombre' | 'descripcion' | 'precioVenta' | 'activo'> & { componentes: ComboItem[] }): Promise<Combo> {
    if (!this.supabaseService.isConfigured) {
      throw new Error('Supabase debe estar configurado para guardar combos.');
    }

    const componentes = this.validarComponentes(combo.componentes);
    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const payload = {
      empresa_id: empresaId,
      nombre: combo.nombre.trim(),
      descripcion: combo.descripcion?.trim() || null,
      precio_venta: combo.precioVenta,
      activo: combo.activo
    };

    if (!payload.nombre) {
      throw new Error('Ingresa el nombre del combo.');
    }

    if (!Number.isFinite(payload.precio_venta) || payload.precio_venta <= 0) {
      throw new Error('El precio del combo debe ser mayor a cero.');
    }

    const comboId = combo.id && this.supabaseService.esUuid(combo.id)
      ? await this.actualizarCombo(combo.id, payload)
      : await this.crearCombo(payload);

    await this.reemplazarComponentes(comboId, componentes);
    const actualizado = await this.obtenerPorId(comboId);

    if (!actualizado) {
      throw new Error('No se pudo leer el combo guardado.');
    }

    return actualizado;
  }

  async desactivar(comboId: string): Promise<void> {
    if (!this.supabaseService.isConfigured || !this.supabaseService.esUuid(comboId)) {
      throw new Error('Combo no valido.');
    }

    const { error } = await this.supabaseService.supabase
      .from('combos')
      .update({ activo: false })
      .eq('id', comboId);

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo desactivar el combo.');
    }
  }

  private async crearCombo(payload: any): Promise<string> {
    const { data, error } = await this.supabaseService.supabase
      .from('combos')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo crear el combo.');
    }

    return data.id;
  }

  private async actualizarCombo(comboId: string, payload: any): Promise<string> {
    const { error } = await this.supabaseService.supabase
      .from('combos')
      .update(payload)
      .eq('id', comboId);

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo actualizar el combo.');
    }

    return comboId;
  }

  private async reemplazarComponentes(comboId: string, componentes: ComboItem[]): Promise<void> {
    const { error: deleteError } = await this.supabaseService.supabase
      .from('combo_items')
      .delete()
      .eq('combo_id', comboId);

    if (deleteError) {
      throw this.supabaseService.crearError(deleteError, 'No se pudieron actualizar los componentes del combo.');
    }

    const rows = componentes.map(item => ({
      combo_id: comboId,
      producto_id: item.productoId,
      cantidad: item.cantidad
    }));

    const { error: insertError } = await this.supabaseService.supabase
      .from('combo_items')
      .insert(rows);

    if (insertError) {
      throw this.supabaseService.crearError(insertError, 'No se pudieron guardar los componentes del combo.');
    }
  }

  private async obtenerPorId(comboId: string): Promise<Combo | null> {
    const { data, error } = await this.supabaseService.supabase
      .from('combos')
      .select('*, combo_items(*, productos(id, nombre, stock, precio_venta))')
      .eq('id', comboId)
      .maybeSingle();

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo leer el combo.');
    }

    return data ? this.mapearAdmin(data) : null;
  }

  private validarComponentes(componentes: ComboItem[]): ComboItem[] {
    if (!componentes.length) {
      throw new Error('Agrega al menos un producto al combo.');
    }

    const porProducto = new Map<string, ComboItem>();

    for (const item of componentes) {
      if (!this.supabaseService.esUuid(item.productoId)) {
        throw new Error(`El producto ${item.productoNombre} no esta sincronizado con Supabase.`);
      }

      if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) {
        throw new Error(`La cantidad de ${item.productoNombre} debe ser mayor a cero.`);
      }

      const existente = porProducto.get(item.productoId);
      if (existente) {
        existente.cantidad += item.cantidad;
      } else {
        porProducto.set(item.productoId, { ...item });
      }
    }

    return [...porProducto.values()];
  }

  private mapearAdmin(row: any): Combo {
    const componentes = (row.combo_items ?? []).map((item: any) => ({
      productoId: item.producto_id,
      productoNombre: item.productos?.nombre ?? 'Producto',
      cantidad: Number(item.cantidad),
      stock: Number(item.productos?.stock ?? 0),
      precioVenta: Number(item.productos?.precio_venta ?? 0)
    })) as ComboItem[];

    return {
      id: row.id,
      nombre: row.nombre,
      descripcion: row.descripcion ?? undefined,
      precioVenta: Number(row.precio_venta),
      activo: row.activo,
      stockDisponible: this.stockDisponible(componentes),
      componentes
    };
  }

  private stockDisponible(componentes: ComboItem[]): number {
    if (!componentes.length) {
      return 0;
    }

    return Math.floor(Math.min(...componentes.map(item => item.stock / item.cantidad)));
  }
}
