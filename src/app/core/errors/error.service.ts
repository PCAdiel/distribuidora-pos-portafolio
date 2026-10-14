import { Injectable, isDevMode } from '@angular/core';

interface SupabaseLikeError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class ErrorService {
  toUserMessage(error: unknown, fallback = 'No se pudo completar la operacion. Intenta nuevamente.'): string {
    const technical = this.toTechnicalMessage(error);
    const normalized = technical.toLowerCase();

    if (!technical) {
      return fallback;
    }

    if (normalized.includes('pgrst202') || normalized.includes('could not find the function')) {
      return 'No se pudo registrar la venta. Ejecuta la migracion de Supabase y vuelve a intentar.';
    }

    if (normalized.includes('stock insuficiente')) {
      return this.extractBusinessMessage(technical, 'Stock insuficiente.');
    }

    if (normalized.includes('factura') && normalized.includes('ruc')) {
      return 'Para emitir factura selecciona un cliente con RUC, razon social y direccion.';
    }

    if (normalized.includes('boletas mayores') || normalized.includes('s/ 700')) {
      return 'Para boletas mayores a S/ 700 selecciona un cliente con documento valido.';
    }

    if (normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('fetch')) {
      return 'No hay conexion. La venta quedara pendiente para sincronizarse.';
    }

    if (normalized.includes('bluetooth') || normalized.includes('printer') || normalized.includes('impresora')) {
      return 'No se pudo imprimir. Verifica la impresora y vuelve a intentar.';
    }

    if (normalized.includes('jwt') || normalized.includes('auth') || normalized.includes('iniciar sesion')) {
      return 'Tu sesion no esta activa. Inicia sesion nuevamente.';
    }

    if (this.isBusinessMessage(technical)) {
      return technical;
    }

    return fallback;
  }

  toTechnicalMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (error && typeof error === 'object') {
      const value = error as SupabaseLikeError;
      return [value.message, value.details, value.hint, value.code].filter(Boolean).join(' ');
    }

    return typeof error === 'string' ? error : '';
  }

  log(context: string, error: unknown): void {
    const detail = this.toTechnicalMessage(error);

    if (isDevMode()) {
      console.warn(`[${context}]`, error);
    }

    try {
      const raw = localStorage.getItem('app_error_log') || '[]';
      const logs = JSON.parse(raw) as Array<{ at: string; context: string; detail: string }>;
      logs.unshift({ at: new Date().toISOString(), context, detail });
      localStorage.setItem('app_error_log', JSON.stringify(logs.slice(0, 50)));
    } catch {
      // Logging must never break the sale flow.
    }
  }

  private isBusinessMessage(message: string): boolean {
    return [
      'venta',
      'producto',
      'cliente',
      'comprobante',
      'pago',
      'stock',
      'sesion',
      'empresa',
      'ticket'
    ].some(word => message.toLowerCase().includes(word));
  }

  private extractBusinessMessage(message: string, fallback: string): string {
    const match = message.match(/Stock insuficiente[^.]*\./i);
    return match?.[0] ?? fallback;
  }
}
