import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonBadge, IonButton, IonCard, IonCardContent, IonContent, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { eyeOutline, printOutline } from 'ionicons/icons';
import { ImpresionService } from '../../core/services/impresion.service';
import { VentasService } from '../../core/services/ventas.service';
import { Venta } from '../../models/venta.model';

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [DatePipe, FormsModule, IonContent, IonCard, IonCardContent, IonBadge, IonText, IonButton, IonIcon, IonItem, IonLabel, IonSelect, IonSelectOption, IonInput],
  template: `
    <ion-content>
      <section class="page-shell">
        <div class="page-title">
          <div><h1>Ventas</h1><p>Consulta por día, semana, mes o rango personalizado.</p></div>
          <span class="badge green">S/ {{ totalFiltrado.toFixed(2) }}</span>
        </div>

        @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }

        <ion-card class="panel">
          <ion-card-content>
            <div class="filters">
              <ion-item>
                <ion-label>Periodo</ion-label>
                <ion-select [(ngModel)]="periodo">
                  <ion-select-option value="DIA">Día</ion-select-option>
                  <ion-select-option value="SEMANA">Semana</ion-select-option>
                  <ion-select-option value="MES">Mes</ion-select-option>
                  <ion-select-option value="RANGO">Rango</ion-select-option>
                  <ion-select-option value="TODOS">Todos</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item><ion-label position="stacked">Desde</ion-label><ion-input [(ngModel)]="desde" type="date" /></ion-item>
              <ion-item><ion-label position="stacked">Hasta</ion-label><ion-input [(ngModel)]="hasta" type="date" /></ion-item>
            </div>
          </ion-card-content>
        </ion-card>

        <div class="ventas-grid">
          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title">
                <div><h2>Historial</h2><span class="muted">{{ ventasFiltradas.length }} ventas</span></div>
              </div>
              <div class="data-table">
                <div class="data-head sales-head"><span>Fecha</span><span>Cliente</span><span>Tipo</span><span>Total</span><span>Acciones</span></div>
                @for (v of ventasFiltradas; track v.id) {
                  <div class="data-row sales-row" [class.selected]="ventaSeleccionada?.id === v.id">
                    <span>{{ v.fecha | date:'short' }}</span>
                    <strong>{{ v.cliente?.nombreRazonSocial || 'Cliente general' }}</strong>
                    <ion-badge>{{ v.tipoComprobante }}</ion-badge>
                    <b>S/ {{ v.total.toFixed(2) }}</b>
                    <div class="action-row">
                      <ion-button size="small" fill="outline" (click)="seleccionar(v)"><ion-icon name="eye-outline" slot="start"></ion-icon>Detalle</ion-button>
                      <ion-button size="small" fill="clear" (click)="imprimir(v)"><ion-icon name="print-outline"></ion-icon></ion-button>
                    </div>
                  </div>
                }
              </div>
            </ion-card-content>
          </ion-card>

          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title"><div><h2>Detalle</h2><span class="muted">Productos vendidos</span></div></div>
              @if (ventaSeleccionada) {
                <h3>{{ ventaSeleccionada.comprobante?.serie }}-{{ ventaSeleccionada.comprobante?.numero }}</h3>
                <p class="muted">{{ ventaSeleccionada.fecha | date:'medium' }}</p>
                @for (item of ventaSeleccionada.detalles; track item.producto.id + item.producto.nombre) {
                  <div class="detail-line">
                    <span>{{ item.producto.nombre }} x{{ item.cantidad }}</span>
                    <b>S/ {{ item.total.toFixed(2) }}</b>
                  </div>
                }
                <div class="totals-detail"><span>Total</span><strong>S/ {{ ventaSeleccionada.total.toFixed(2) }}</strong></div>
                <ion-button expand="block" (click)="imprimir(ventaSeleccionada)"><ion-icon name="print-outline" slot="start"></ion-icon>Reimprimir</ion-button>
              } @else {
                <p class="muted">Selecciona una venta para ver el detalle.</p>
              }
            </ion-card-content>
          </ion-card>
        </div>

        @if (ventaImpresion) {
          <div class="ticket-print">
            <h2>Distribuidora Mariva</h2>
            <p>{{ ventaImpresion.tipoComprobante }} {{ ventaImpresion.comprobante?.serie }}-{{ ventaImpresion.comprobante?.numero }}</p>
            <p>{{ ventaImpresion.fecha | date:'short' }}</p>
            <p>Cliente: {{ ventaImpresion.cliente?.nombreRazonSocial || 'Cliente general' }}</p>
            @for (item of ventaImpresion.detalles; track item.producto.id + item.producto.nombre) {
              <div class="line"><span>{{ item.producto.nombre }} x{{ item.cantidad }}</span><b>S/ {{ item.total.toFixed(2) }}</b></div>
            }
            <div class="line"><span>Total</span><b>S/ {{ ventaImpresion.total.toFixed(2) }}</b></div>
          </div>
        }
      </section>
    </ion-content>
  `,
  styles: [`
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }

    .ventas-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(300px, .75fr);
      gap: 16px;
      margin-top: 16px;
    }

    .sales-head,
    .sales-row {
      grid-template-columns: 145px minmax(180px, 1fr) 100px 110px 180px;
    }

    .sales-row.selected {
      background: #fff7ed;
    }

    .detail-line,
    .totals-detail {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--app-line);
    }

    .totals-detail strong {
      color: var(--app-orange);
      font-size: 22px;
    }

    @media (max-width: 1000px) {
      .ventas-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class VentasPage {
  ventas: Venta[] = this.ventasService.listar();
  ventaSeleccionada?: Venta;
  ventaImpresion?: Venta;
  periodo: 'DIA' | 'SEMANA' | 'MES' | 'RANGO' | 'TODOS' = 'DIA';
  desde = new Date().toISOString().slice(0, 10);
  hasta = new Date().toISOString().slice(0, 10);
  error = '';

  constructor(private ventasService: VentasService, private impresionService: ImpresionService) {
    addIcons({ eyeOutline, printOutline });
  }

  get ventasFiltradas(): Venta[] {
    const ahora = new Date();
    return this.ventas.filter(venta => {
      const fecha = new Date(venta.fecha);
      if (this.periodo === 'TODOS') return true;
      if (this.periodo === 'DIA') return fecha.toDateString() === ahora.toDateString();
      if (this.periodo === 'SEMANA') return (ahora.getTime() - fecha.getTime()) / 86400000 <= 7;
      if (this.periodo === 'MES') return fecha.getMonth() === ahora.getMonth() && fecha.getFullYear() === ahora.getFullYear();
      const desde = new Date(`${this.desde}T00:00:00`);
      const hasta = new Date(`${this.hasta}T23:59:59`);
      return fecha >= desde && fecha <= hasta;
    });
  }

  get totalFiltrado(): number {
    return this.ventasFiltradas.reduce((acc, venta) => acc + venta.total, 0);
  }

  async ngOnInit(): Promise<void> {
    try {
      this.ventas = await this.ventasService.listarRemoto();
      this.ventaSeleccionada = this.ventas[0];
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudieron cargar las ventas desde Supabase.';
    }
  }

  seleccionar(venta: Venta): void {
    this.ventaSeleccionada = venta;
  }

  imprimir(venta: Venta): void {
    this.ventaImpresion = venta;
    setTimeout(async () => {
      try {
        await this.impresionService.imprimirVenta(venta);
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'No se pudo imprimir la venta.';
      }
    });
  }
}
