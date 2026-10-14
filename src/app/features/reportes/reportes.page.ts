import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonBadge, IonButton, IonCard, IonCardContent, IonContent, IonIcon, IonInput, IonItem, IonLabel, IonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';
import {
  InventarioValorizadoItem,
  KardexMovimientoItem,
  ReportesService,
  ResumenSimple,
  StockMinimoItem,
  VencimientoItem
} from '../../core/services/reportes.service';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [DatePipe, FormsModule, IonContent, IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonButton, IonIcon, IonBadge, IonText],
  template: `
    <ion-content>
      <section class="page-shell">
        <div class="page-title">
          <div>
            <h1>Reportes</h1>
            <p>Kardex, inventario, caja, ventas, stock minimo y vencimientos.</p>
          </div>
          <ion-button (click)="cargar()" [disabled]="cargando">
            <ion-icon name="refresh-outline" slot="start"></ion-icon>
            {{ cargando ? 'Cargando...' : 'Actualizar' }}
          </ion-button>
        </div>

        @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }

        <ion-card class="panel">
          <ion-card-content>
            <div class="filters">
              <ion-item><ion-label position="stacked">Desde</ion-label><ion-input [(ngModel)]="desde" type="date" /></ion-item>
              <ion-item><ion-label position="stacked">Hasta</ion-label><ion-input [(ngModel)]="hasta" type="date" /></ion-item>
              <ion-item><ion-label position="stacked">Dias vencimiento</ion-label><ion-input [(ngModel)]="diasVencimiento" type="number" /></ion-item>
            </div>
          </ion-card-content>
        </ion-card>

        <div class="grid-auto">
          <ion-card class="metric-card">
            <ion-card-content>
              <div><span>Valor stock</span><strong>S/ {{ totalValorStock.toFixed(2) }}</strong><span>{{ inventario.length }} productos</span></div>
            </ion-card-content>
          </ion-card>
          <ion-card class="metric-card">
            <ion-card-content>
              <div><span>Venta potencial</span><strong>S/ {{ totalVentaPotencial.toFixed(2) }}</strong><span>Margen S/ {{ totalMargen.toFixed(2) }}</span></div>
            </ion-card-content>
          </ion-card>
          <ion-card class="metric-card">
            <ion-card-content>
              <div><span>Stock minimo</span><strong>{{ stockMinimo.length }}</strong><span>productos en alerta</span></div>
            </ion-card-content>
          </ion-card>
          <ion-card class="metric-card">
            <ion-card-content>
              <div><span>Por vencer</span><strong>{{ vencimientos.length }}</strong><span>lotes encontrados</span></div>
            </ion-card-content>
          </ion-card>
        </div>

        <div class="reports-grid">
          <ion-card class="panel report-wide">
            <ion-card-content>
              <div class="panel-title"><div><h2>Inventario valorizado</h2><span class="muted">Costo, precio y margen estimado</span></div></div>
              <div class="data-table">
                <div class="data-head inv-head"><span>Producto</span><span>Stock</span><span>Costo</span><span>Valor stock</span><span>Venta potencial</span><span>Estado</span></div>
                @for (item of inventario; track item.productoId) {
                  <div class="data-row inv-row">
                    <strong>{{ item.producto }}</strong>
                    <span>{{ item.stockActual }}</span>
                    <span>S/ {{ item.costoUnitario.toFixed(2) }}</span>
                    <b>S/ {{ item.valorStock.toFixed(2) }}</b>
                    <b>S/ {{ item.valorVentaPotencial.toFixed(2) }}</b>
                    <ion-badge [color]="colorEstadoStock(item.estadoStock)">{{ item.estadoStock }}</ion-badge>
                  </div>
                } @empty {
                  <p class="muted">No hay inventario para mostrar.</p>
                }
              </div>
            </ion-card-content>
          </ion-card>

          <ion-card class="panel report-wide">
            <ion-card-content>
              <div class="panel-title"><div><h2>Kardex reciente</h2><span class="muted">Ultimos movimientos de stock</span></div></div>
              <div class="data-table">
                <div class="data-head kardex-head"><span>Producto</span><span>Tipo</span><span>Cantidad</span><span>Stock</span><span>Fecha</span></div>
                @for (item of kardex; track item.id) {
                  <div class="data-row kardex-row">
                    <strong>{{ item.producto }}</strong>
                    <ion-badge [color]="colorKardex(item.tipoMovimiento)">{{ item.tipoMovimiento }}</ion-badge>
                    <span>{{ item.cantidad }}</span>
                    <span>{{ item.stockAnterior }} -> {{ item.stockNuevo }}</span>
                    <span>{{ item.fecha | date:'short' }}</span>
                  </div>
                } @empty {
                  <p class="muted">Aun no hay movimientos de Kardex.</p>
                }
              </div>
            </ion-card-content>
          </ion-card>

          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title"><div><h2>Stock minimo</h2><span class="muted">Critico, alto y medio</span></div></div>
              @for (item of stockMinimo; track item.productoId) {
                <div class="compact-row">
                  <div><strong>{{ item.producto }}</strong><span>{{ item.categoria }} - Min. {{ item.stockMinimo }}</span></div>
                  <ion-badge [color]="colorEstadoStock(item.estadoStock)">{{ item.stockActual }}</ion-badge>
                </div>
              } @empty {
                <p class="muted">Sin alertas de stock minimo.</p>
              }
            </ion-card-content>
          </ion-card>

          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title"><div><h2>Productos por vencer</h2><span class="muted">Lotes activos</span></div></div>
              @for (item of vencimientos; track item.loteId) {
                <div class="compact-row">
                  <div><strong>{{ item.producto }}</strong><span>{{ item.codigoLote }} - {{ item.fechaVencimiento | date:'shortDate' }}</span></div>
                  <ion-badge [color]="colorVencimiento(item.estadoVencimiento)">{{ item.estadoVencimiento }}</ion-badge>
                </div>
              } @empty {
                <p class="muted">No hay lotes por vencer en el rango.</p>
              }
            </ion-card-content>
          </ion-card>

          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title"><div><h2>Ventas por metodo</h2><span class="muted">Pagos registrados</span></div></div>
              @for (item of ventasMetodo; track item.nombre) {
                <div class="compact-row"><div><strong>{{ item.nombre }}</strong><span>{{ item.operaciones }} operaciones</span></div><b>S/ {{ item.total.toFixed(2) }}</b></div>
              } @empty {
                <p class="muted">Sin ventas para el periodo.</p>
              }
            </ion-card-content>
          </ion-card>

          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title"><div><h2>Mas vendidos</h2><span class="muted">Top 10 del periodo</span></div></div>
              @for (item of masVendidos; track item.nombre) {
                <div class="compact-row"><div><strong>{{ item.nombre }}</strong><span>{{ item.cantidad }} unidades</span></div><b>S/ {{ item.total.toFixed(2) }}</b></div>
              } @empty {
                <p class="muted">Sin productos vendidos.</p>
              }
            </ion-card-content>
          </ion-card>

          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title"><div><h2>Ingresos y egresos</h2><span class="muted">Caja</span></div></div>
              @for (item of ingresosEgresos; track item.nombre) {
                <div class="compact-row"><div><strong>{{ item.nombre }}</strong><span>{{ item.operaciones }} movimientos</span></div><b>S/ {{ item.total.toFixed(2) }}</b></div>
              } @empty {
                <p class="muted">Sin movimientos de caja.</p>
              }
            </ion-card-content>
          </ion-card>

          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title"><div><h2>Comprobantes</h2><span class="muted">Emitidos y anulados</span></div></div>
              @for (item of comprobantes; track item.nombre) {
                <div class="compact-row"><div><strong>{{ item.nombre }}</strong><span>{{ item.operaciones }} comprobantes</span></div><b>S/ {{ item.total.toFixed(2) }}</b></div>
              } @empty {
                <p class="muted">Sin comprobantes en el periodo.</p>
              }
            </ion-card-content>
          </ion-card>
        </div>
      </section>
    </ion-content>
  `,
  styles: [`
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }

    .reports-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }

    .report-wide {
      grid-column: 1 / -1;
    }

    .inv-head,
    .inv-row {
      grid-template-columns: minmax(220px, 1fr) 90px 100px 130px 150px 110px;
    }

    .kardex-head,
    .kardex-row {
      grid-template-columns: minmax(220px, 1fr) 120px 100px 130px 150px;
    }

    .compact-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--app-line);
    }

    .compact-row:last-child {
      border-bottom: 0;
    }

    .compact-row strong,
    .compact-row span {
      display: block;
    }

    .compact-row span {
      color: var(--app-muted);
      font-size: 12px;
    }

    @media (max-width: 760px) {
      .inv-head,
      .inv-row,
      .kardex-head,
      .kardex-row {
        grid-template-columns: minmax(170px, 1fr) 70px 110px;
      }

      .inv-head span:nth-child(3),
      .inv-head span:nth-child(5),
      .inv-head span:nth-child(6),
      .inv-row span:nth-child(3),
      .inv-row b:nth-child(5),
      .inv-row ion-badge,
      .kardex-head span:nth-child(4),
      .kardex-head span:nth-child(5),
      .kardex-row span:nth-child(4),
      .kardex-row span:nth-child(5) {
        display: none;
      }
    }
  `]
})
export class ReportesPage {
  desde = new Date().toISOString().slice(0, 10);
  hasta = new Date().toISOString().slice(0, 10);
  diasVencimiento = 30;
  cargando = false;
  error = '';

  inventario: InventarioValorizadoItem[] = [];
  stockMinimo: StockMinimoItem[] = [];
  vencimientos: VencimientoItem[] = [];
  ventasMetodo: ResumenSimple[] = [];
  masVendidos: ResumenSimple[] = [];
  comprobantes: ResumenSimple[] = [];
  ingresosEgresos: ResumenSimple[] = [];
  kardex: KardexMovimientoItem[] = [];

  constructor(private reportesService: ReportesService) {
    addIcons({ refreshOutline });
  }

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  get totalValorStock(): number {
    return this.inventario.reduce((sum, item) => sum + item.valorStock, 0);
  }

  get totalVentaPotencial(): number {
    return this.inventario.reduce((sum, item) => sum + item.valorVentaPotencial, 0);
  }

  get totalMargen(): number {
    return this.inventario.reduce((sum, item) => sum + item.margenEstimado, 0);
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    this.error = '';

    try {
      const [
        inventario,
        stockMinimo,
        vencimientos,
        ventasMetodo,
        masVendidos,
        comprobantes,
        ingresosEgresos,
        kardex
      ] = await Promise.all([
        this.reportesService.inventarioValorizado(),
        this.reportesService.stockMinimo(),
        this.reportesService.productosPorVencer(Number(this.diasVencimiento) || 30),
        this.reportesService.ventasPorMetodoPago(this.desde, this.hasta),
        this.reportesService.productosMasVendidos(this.desde, this.hasta),
        this.reportesService.comprobantesPorEstado(this.desde, this.hasta),
        this.reportesService.ingresosEgresos(this.desde, this.hasta),
        this.reportesService.kardexReciente()
      ]);

      this.inventario = inventario;
      this.stockMinimo = stockMinimo;
      this.vencimientos = vencimientos;
      this.ventasMetodo = ventasMetodo;
      this.masVendidos = masVendidos;
      this.comprobantes = comprobantes;
      this.ingresosEgresos = ingresosEgresos;
      this.kardex = kardex;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudieron cargar los reportes.';
    } finally {
      this.cargando = false;
    }
  }

  colorEstadoStock(estado: string): string {
    if (estado === 'CRITICO') return 'danger';
    if (estado === 'ALTO') return 'warning';
    if (estado === 'MEDIO') return 'medium';
    return 'success';
  }

  colorVencimiento(estado: string): string {
    if (estado === 'VENCIDO') return 'danger';
    if (estado === 'POR_VENCER_7') return 'warning';
    if (estado === 'POR_VENCER_15') return 'medium';
    return 'success';
  }

  colorKardex(tipo: string): string {
    if (['SALIDA', 'VENTA', 'AJUSTE_NEGATIVO', 'MERMA', 'VENCIMIENTO', 'COMBO'].includes(tipo)) return 'warning';
    if (['ENTRADA', 'AJUSTE_POSITIVO', 'DEVOLUCION'].includes(tipo)) return 'success';
    return 'medium';
  }
}
