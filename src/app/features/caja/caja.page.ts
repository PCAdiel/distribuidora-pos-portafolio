import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCard, IonCardContent, IonContent, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cashOutline, lockClosedOutline, printOutline, timeOutline } from 'ionicons/icons';
import { CajaService, TurnoCaja } from '../../core/services/caja.service';
import { VentasService } from '../../core/services/ventas.service';
import { Venta } from '../../models/venta.model';

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [DatePipe, FormsModule, IonContent, IonCard, IonCardContent, IonButton, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonIcon, IonText],
  template: `
    <ion-content>
      <section class="cash-shell">
        <div class="cash-header">
          <div><h1>Caja / Turno</h1><p>Control de apertura, cierre, ingresos y egresos.</p></div>
          <div class="cash-actions">
            <ion-button fill="outline" (click)="imprimir()"><ion-icon name="print-outline" slot="start"></ion-icon>Imprimir</ion-button>
          </div>
        </div>

        @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }
        @if (mensaje) { <ion-text color="success"><p>{{ mensaje }}</p></ion-text> }

        <div class="cash-grid">
          <ion-card class="cash-panel primary">
            <ion-card-content>
              <div class="panel-title">
                <div>
                  <h2>{{ turnoActivo ? 'Turno activo' : 'Caja cerrada' }}</h2>
                  <span>{{ turnoActivo ? ('Abierto: ' + (turnoActivo.abiertoEn | date:'short')) : 'Abre caja para iniciar ventas del turno' }}</span>
                </div>
                <div class="round-icon"><ion-icon name="cash-outline"></ion-icon></div>
              </div>

              @if (!turnoActivo) {
                <ion-item><ion-label position="stacked">Monto inicial</ion-label><ion-input [(ngModel)]="montoInicial" type="number" /></ion-item>
                <ion-item><ion-label position="stacked">Responsable</ion-label><ion-input [(ngModel)]="responsable" /></ion-item>
                <ion-button expand="block" color="success" (click)="abrirTurno()">Abrir turno</ion-button>
              } @else {
                <div class="cash-line"><span>Número de cierre</span><b>{{ turnoActivo.numero }}</b></div>
                <div class="cash-line"><span>Responsable</span><b>{{ turnoActivo.responsable }}</b></div>
                <div class="cash-line"><span>Fondo inicial</span><b>S/ {{ turnoActivo.montoInicial.toFixed(2) }}</b></div>
                <div class="cash-line"><span>Cobros en efectivo</span><b>S/ {{ resumen.cobrosEfectivo.toFixed(2) }}</b></div>
                <div class="cash-line"><span>Ingresos manuales</span><b>S/ {{ resumen.ingresos.toFixed(2) }}</b></div>
                <div class="cash-line"><span>Pagos / salidas</span><b>S/ {{ resumen.egresos.toFixed(2) }}</b></div>
                <div class="cash-line total"><span>Efectivo teórico</span><b>S/ {{ resumen.efectivoTeorico.toFixed(2) }}</b></div>
                <ion-item><ion-label position="stacked">Monto final contado</ion-label><ion-input [(ngModel)]="montoFinal" type="number" /></ion-item>
                <ion-button expand="block" color="success" (click)="cerrarTurno()"><ion-icon name="lock-closed-outline" slot="start"></ion-icon>Cerrar turno</ion-button>
              }
            </ion-card-content>
          </ion-card>

          <ion-card class="cash-panel">
            <ion-card-content>
              <div class="panel-title"><div><h2>Movimiento</h2><span>Registrar ingreso o salida</span></div></div>
              <ion-item>
                <ion-label>Tipo</ion-label>
                <ion-select [(ngModel)]="tipoMovimiento">
                  <ion-select-option value="INGRESO">Ingreso</ion-select-option>
                  <ion-select-option value="EGRESO">Egreso</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item><ion-label position="stacked">Descripción</ion-label><ion-input [(ngModel)]="descripcionMovimiento" /></ion-item>
              <ion-item><ion-label position="stacked">Monto</ion-label><ion-input [(ngModel)]="montoMovimiento" type="number" /></ion-item>
              <ion-button expand="block" [disabled]="!turnoActivo" (click)="registrarMovimiento()">Registrar movimiento</ion-button>
            </ion-card-content>
          </ion-card>

          <ion-card class="cash-panel history">
            <ion-card-content>
              <div class="panel-title">
                <div><h2>Historial de turnos</h2><span>{{ turnos.length }} turnos</span></div>
                <ion-icon name="time-outline"></ion-icon>
              </div>
              @for (turno of turnos; track turno.id) {
                <div class="history-row">
                  <div>
                    <strong>Turno {{ turno.numero }}</strong>
                    <span>{{ turno.abiertoEn | date:'short' }} · {{ turno.estado }}</span>
                  </div>
                  <b>S/ {{ (turno.montoFinal ?? turno.montoInicial).toFixed(2) }}</b>
                </div>
              } @empty {
                <p>No hay turnos registrados.</p>
              }
            </ion-card-content>
          </ion-card>
        </div>
      </section>
    </ion-content>
  `,
  styles: [`
    .cash-shell {
      min-height: 100%;
      padding: 18px;
      color: #f8fafc;
      background: #2b2b2b;
    }

    .cash-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 16px;
    }

    .cash-header h1 {
      margin: 0;
      color: #fff;
      font-size: clamp(26px, 3vw, 36px);
      font-weight: 900;
    }

    .cash-header p {
      margin: 5px 0 0;
      color: #cbd5e1;
    }

    .cash-grid {
      display: grid;
      grid-template-columns: minmax(320px, 1fr) minmax(300px, .75fr);
      gap: 16px;
    }

    .cash-panel {
      margin: 0;
      background: #333;
      border-color: #454545;
      color: #fff;
    }

    .cash-panel.primary {
      border-color: rgba(47,158,68,.55);
    }

    .cash-panel ion-item {
      --background: transparent;
      --color: #fff;
      --border-color: #666;
    }

    .panel-title span,
    .cash-line span,
    .history-row span {
      color: #b6c2bf;
    }

    .cash-line {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 13px 0;
      border-bottom: 1px solid #464646;
      font-size: 16px;
    }

    .cash-line.total b {
      color: #4ade80;
      font-size: 24px;
    }

    .history {
      grid-column: 1 / -1;
    }

    .history-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #464646;
    }

    .history-row strong,
    .history-row span {
      display: block;
    }

    @media (max-width: 900px) {
      .cash-grid,
      .cash-header {
        grid-template-columns: 1fr;
        display: grid;
      }
    }
  `]
})
export class CajaPage {
  ventas: Venta[] = this.ventasService.listar();
  turnos: TurnoCaja[] = this.cajaService.listarTurnos();
  turnoActivo = this.cajaService.obtenerTurnoActivo();
  resumen = this.cajaService.calcularResumen(this.turnoActivo, this.ventas);
  montoInicial = 0;
  montoFinal = 0;
  responsable = 'Administrador';
  tipoMovimiento: 'INGRESO' | 'EGRESO' = 'INGRESO';
  descripcionMovimiento = '';
  montoMovimiento = 0;
  mensaje = '';
  error = '';

  constructor(private ventasService: VentasService, private cajaService: CajaService) {
    addIcons({ cashOutline, lockClosedOutline, timeOutline, printOutline });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.ventas = await this.ventasService.listarRemoto();
      await this.refrescarCaja();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo cargar caja desde Supabase.';
      await this.refrescarCaja();
    }
  }

  async abrirTurno(): Promise<void> {
    try {
      this.error = '';
      await this.cajaService.abrirTurno(Number(this.montoInicial || 0), this.responsable || 'Administrador');
      this.mensaje = 'Turno abierto.';
      await this.refrescarCaja();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo abrir el turno.';
    }
  }

  async cerrarTurno(): Promise<void> {
    try {
      this.error = '';
      await this.cajaService.cerrarTurno(Number(this.montoFinal || this.resumen.efectivoTeorico));
      this.mensaje = 'Turno cerrado.';
      await this.refrescarCaja();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo cerrar el turno.';
    }
  }

  async registrarMovimiento(): Promise<void> {
    try {
      this.error = '';
      await this.cajaService.registrarMovimiento(this.tipoMovimiento, this.descripcionMovimiento || this.tipoMovimiento, Number(this.montoMovimiento || 0));
      this.descripcionMovimiento = '';
      this.montoMovimiento = 0;
      await this.refrescarCaja();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo registrar el movimiento.';
    }
  }

  imprimir(): void {
    window.print();
  }

  private async refrescarCaja(): Promise<void> {
    try {
      this.turnos = await this.cajaService.listarTurnosRemoto();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo sincronizar caja con Supabase.';
      this.turnos = this.cajaService.listarTurnos();
    }
    this.turnoActivo = this.cajaService.obtenerTurnoActivo();
    this.resumen = this.cajaService.calcularResumen(this.turnoActivo, this.ventas);
    this.montoFinal = this.resumen.efectivoTeorico;
  }
}
