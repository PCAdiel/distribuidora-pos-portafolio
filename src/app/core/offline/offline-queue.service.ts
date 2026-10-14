import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Venta } from '../../models/venta.model';

export type OfflineVentaEstado =
  | 'PENDIENTE_SYNC'
  | 'SINCRONIZANDO'
  | 'SINCRONIZADA'
  | 'ERROR_SYNC'
  | 'PENDIENTE_FACTURACION'
  | 'EMITIDA';

export interface OfflineVentaPendiente {
  clientSaleId: string;
  venta: Venta;
  estado: OfflineVentaEstado;
  fechaLocal: string;
  intentos: number;
  ultimoError?: string;
  sincronizadaVentaId?: string;
}

const DB_NAME = 'distribuidora_mariva_offline';
const DB_VERSION = 1;
const STORE = 'ventas_pendientes';

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  readonly pendientes$ = new BehaviorSubject<number>(0);
  private dbPromise?: Promise<IDBDatabase>;

  constructor() {
    void this.refrescarConteo();
  }

  async guardarVentaPendiente(venta: Venta, ultimoError?: string): Promise<OfflineVentaPendiente> {
    const clientSaleId = venta.clientSaleId || venta.id || crypto.randomUUID();
    const record: OfflineVentaPendiente = {
      clientSaleId,
      venta: { ...venta, clientSaleId },
      estado: 'PENDIENTE_SYNC',
      fechaLocal: new Date().toISOString(),
      intentos: 0,
      ultimoError
    };

    const db = await this.db();
    await this.put(db, record);
    await this.refrescarConteo();
    return record;
  }

  async listarPendientes(): Promise<OfflineVentaPendiente[]> {
    const db = await this.db();
    const records = await this.getAll(db);
    return records.filter(record => record.estado !== 'SINCRONIZADA' && record.estado !== 'EMITIDA');
  }

  async contarPendientes(): Promise<number> {
    const pendientes = await this.listarPendientes();
    return pendientes.length;
  }

  async marcarSincronizando(clientSaleId: string): Promise<void> {
    await this.update(clientSaleId, record => ({
      ...record,
      estado: 'SINCRONIZANDO',
      intentos: record.intentos + 1,
      ultimoError: undefined
    }));
  }

  async marcarSincronizada(clientSaleId: string, ventaId: string): Promise<void> {
    await this.update(clientSaleId, record => ({
      ...record,
      estado: 'SINCRONIZADA',
      sincronizadaVentaId: ventaId,
      ultimoError: undefined
    }));
    await this.refrescarConteo();
  }

  async marcarError(clientSaleId: string, error: string): Promise<void> {
    await this.update(clientSaleId, record => ({
      ...record,
      estado: 'ERROR_SYNC',
      ultimoError: error
    }));
    await this.refrescarConteo();
  }

  async refrescarConteo(): Promise<void> {
    try {
      this.pendientes$.next(await this.contarPendientes());
    } catch {
      this.pendientes$.next(0);
    }
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'clientSaleId' });
            store.createIndex('estado', 'estado', { unique: false });
            store.createIndex('fechaLocal', 'fechaLocal', { unique: false });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    return this.dbPromise;
  }

  private put(db: IDBDatabase, record: OfflineVentaPendiente): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private getAll(db: IDBDatabase): Promise<OfflineVentaPendiente[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as OfflineVentaPendiente[]);
      request.onerror = () => reject(request.error);
    });
  }

  private get(db: IDBDatabase, clientSaleId: string): Promise<OfflineVentaPendiente | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(clientSaleId);
      request.onsuccess = () => resolve(request.result as OfflineVentaPendiente | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  private async update(
    clientSaleId: string,
    updater: (record: OfflineVentaPendiente) => OfflineVentaPendiente
  ): Promise<void> {
    const db = await this.db();
    const current = await this.get(db, clientSaleId);

    if (!current) {
      return;
    }

    await this.put(db, updater(current));
  }
}
