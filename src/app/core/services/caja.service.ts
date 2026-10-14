import { Injectable } from '@angular/core';
import { Venta } from '../../models/venta.model';
import { SupabaseService } from './supabase.service';

export interface MovimientoCaja {
  id: string;
  tipo: 'INGRESO' | 'EGRESO';
  descripcion: string;
  monto: number;
  fecha: string;
}

export interface TurnoCaja {
  id: string;
  numero: number;
  estado: 'ABIERTA' | 'CERRADA';
  responsable: string;
  montoInicial: number;
  montoFinal?: number;
  abiertoEn: string;
  cerradoEn?: string;
  movimientos: MovimientoCaja[];
}

const KEY = 'caja_turnos';

@Injectable({ providedIn: 'root' })
export class CajaService {
  constructor(private supabaseService: SupabaseService) {}

  listarTurnos(): TurnoCaja[] {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as TurnoCaja[];
  }

  async listarTurnosRemoto(): Promise<TurnoCaja[]> {
    if (!this.supabaseService.isConfigured) {
      return this.listarTurnos();
    }

    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const { data, error } = await this.supabaseService.supabase
      .from('caja_turnos')
      .select('*, caja_movimientos(*)')
      .eq('empresa_id', empresaId)
      .order('abierto_en', { ascending: false });

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudieron cargar los turnos de caja.');
    }

    const turnos = (data ?? []).map(row => this.mapearTurno(row));
    this.guardarLocal(turnos);
    return turnos;
  }

  obtenerTurnoActivo(): TurnoCaja | undefined {
    return this.listarTurnos().find(turno => turno.estado === 'ABIERTA');
  }

  async abrirTurno(montoInicial: number, responsable = 'Administrador'): Promise<TurnoCaja> {
    if (montoInicial < 0) {
      throw new Error('El monto inicial no puede ser negativo.');
    }

    if (!responsable.trim()) {
      throw new Error('Ingresa el responsable del turno.');
    }

    if (!this.supabaseService.isConfigured) {
      return this.abrirTurnoLocal(montoInicial, responsable);
    }

    const activo = (await this.listarTurnosRemoto()).find(turno => turno.estado === 'ABIERTA');

    if (activo) {
      return activo;
    }

    const empresaId = await this.supabaseService.obtenerEmpresaId();
    const userId = await this.supabaseService.obtenerUsuarioId();
    const numero = await this.obtenerSiguienteNumero(empresaId);
    const { data, error } = await this.supabaseService.supabase
      .from('caja_turnos')
      .insert({
        empresa_id: empresaId,
        user_id: userId,
        numero,
        responsable: responsable.trim(),
        monto_inicial: montoInicial,
        estado: 'ABIERTA'
      })
      .select('*, caja_movimientos(*)')
      .single();

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo abrir el turno.');
    }

    await this.listarTurnosRemoto();
    return this.mapearTurno(data);
  }

  async cerrarTurno(montoFinal: number): Promise<TurnoCaja | undefined> {
    if (montoFinal < 0) {
      throw new Error('El monto final no puede ser negativo.');
    }

    if (!this.supabaseService.isConfigured) {
      return this.cerrarTurnoLocal(montoFinal);
    }

    const turno = (await this.listarTurnosRemoto()).find(item => item.estado === 'ABIERTA');

    if (!turno) {
      throw new Error('No hay un turno abierto para cerrar.');
    }

    const { data, error } = await this.supabaseService.supabase
      .from('caja_turnos')
      .update({
        estado: 'CERRADA',
        monto_final: montoFinal,
        cerrado_en: new Date().toISOString()
      })
      .eq('id', turno.id)
      .select('*, caja_movimientos(*)')
      .single();

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo cerrar el turno.');
    }

    await this.listarTurnosRemoto();
    return this.mapearTurno(data);
  }

  async registrarMovimiento(tipo: 'INGRESO' | 'EGRESO', descripcion: string, monto: number): Promise<void> {
    if (monto <= 0) {
      throw new Error('El monto del movimiento debe ser mayor a cero.');
    }

    if (!descripcion.trim()) {
      throw new Error('Ingresa una descripción para el movimiento.');
    }

    if (!this.supabaseService.isConfigured) {
      this.registrarMovimientoLocal(tipo, descripcion, monto);
      return;
    }

    const turno = (await this.listarTurnosRemoto()).find(item => item.estado === 'ABIERTA');

    if (!turno) {
      throw new Error('Abre un turno antes de registrar movimientos.');
    }

    const { error } = await this.supabaseService.supabase
      .from('caja_movimientos')
      .insert({
        turno_id: turno.id,
        tipo,
        descripcion: descripcion.trim(),
        monto
      });

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo registrar el movimiento.');
    }

    await this.listarTurnosRemoto();
  }

  calcularResumen(turno: TurnoCaja | undefined, ventas: Venta[]) {
    const movimientos = turno?.movimientos ?? [];
    const ventasTurno = this.filtrarVentasPorTurno(turno, ventas);
    const ingresos = movimientos.filter(m => m.tipo === 'INGRESO').reduce((acc, m) => acc + m.monto, 0);
    const egresos = movimientos.filter(m => m.tipo === 'EGRESO').reduce((acc, m) => acc + m.monto, 0);
    const ventasTotal = ventasTurno.reduce((acc, venta) => acc + venta.total, 0);
    const cobrosEfectivo = ventasTurno
      .filter(venta => venta.pagos.some(pago => pago.metodo === 'EFECTIVO'))
      .reduce((acc, venta) => acc + venta.total, 0);
    const efectivoTeorico = (turno?.montoInicial ?? 0) + cobrosEfectivo + ingresos - egresos;

    return {
      ventasTotal,
      cobrosEfectivo,
      ingresos,
      egresos,
      efectivoTeorico,
      ventasCount: ventasTurno.length
    };
  }

  private abrirTurnoLocal(montoInicial: number, responsable: string): TurnoCaja {
    const turnos = this.listarTurnos();
    const activo = turnos.find(turno => turno.estado === 'ABIERTA');

    if (activo) {
      return activo;
    }

    const turno: TurnoCaja = {
      id: crypto.randomUUID(),
      numero: turnos.length + 1,
      estado: 'ABIERTA',
      responsable,
      montoInicial,
      abiertoEn: new Date().toISOString(),
      movimientos: []
    };

    this.guardarLocal([turno, ...turnos]);
    return turno;
  }

  private cerrarTurnoLocal(montoFinal: number): TurnoCaja | undefined {
    const turnos = this.listarTurnos();
    const turnosActualizados = turnos.map(turno =>
      turno.estado === 'ABIERTA'
        ? { ...turno, estado: 'CERRADA' as const, montoFinal, cerradoEn: new Date().toISOString() }
        : turno
    );
    this.guardarLocal(turnosActualizados);
    return turnosActualizados.find(turno => turno.cerradoEn && turno.montoFinal === montoFinal);
  }

  private registrarMovimientoLocal(tipo: 'INGRESO' | 'EGRESO', descripcion: string, monto: number): void {
    const turnos = this.listarTurnos();
    const turnosActualizados = turnos.map(turno => {
      if (turno.estado !== 'ABIERTA') {
        return turno;
      }

      return {
        ...turno,
        movimientos: [
          {
            id: crypto.randomUUID(),
            tipo,
            descripcion,
            monto,
            fecha: new Date().toISOString()
          },
          ...turno.movimientos
        ]
      };
    });
    this.guardarLocal(turnosActualizados);
  }

  private async obtenerSiguienteNumero(empresaId: string): Promise<number> {
    const { data, error } = await this.supabaseService.supabase
      .from('caja_turnos')
      .select('numero')
      .eq('empresa_id', empresaId)
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw this.supabaseService.crearError(error, 'No se pudo calcular el número de turno.');
    }

    return Number(data?.numero ?? 0) + 1;
  }

  private filtrarVentasPorTurno(turno: TurnoCaja | undefined, ventas: Venta[]): Venta[] {
    if (!turno) {
      return [];
    }

    const desde = new Date(turno.abiertoEn).getTime();
    const hasta = turno.cerradoEn ? new Date(turno.cerradoEn).getTime() : Date.now();

    return ventas.filter(venta => {
      const fecha = new Date(venta.fecha).getTime();
      return fecha >= desde && fecha <= hasta;
    });
  }

  private guardarLocal(turnos: TurnoCaja[]): void {
    localStorage.setItem(KEY, JSON.stringify(turnos));
  }

  private mapearTurno(row: any): TurnoCaja {
    return {
      id: row.id,
      numero: Number(row.numero),
      estado: row.estado,
      responsable: row.responsable,
      montoInicial: Number(row.monto_inicial),
      montoFinal: row.monto_final === null ? undefined : Number(row.monto_final),
      abiertoEn: row.abierto_en,
      cerradoEn: row.cerrado_en ?? undefined,
      movimientos: (row.caja_movimientos ?? [])
        .map((movimiento: any) => ({
          id: movimiento.id,
          tipo: movimiento.tipo,
          descripcion: movimiento.descripcion,
          monto: Number(movimiento.monto),
          fecha: movimiento.created_at
        }))
        .sort((a: MovimientoCaja, b: MovimientoCaja) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    };
  }
}
