import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonBadge, IonButton, IonCard, IonCardContent, IonContent, IonIcon, IonItem, IonLabel, IonSelect, IonSelectOption, IonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, printOutline, receiptOutline, trashOutline } from 'ionicons/icons';
import { ImpresionService } from '../../core/services/impresion.service';
import { ProductosService } from '../../core/services/productos.service';
import { VentasService } from '../../core/services/ventas.service';
import { Producto } from '../../models/producto.model';
import { Venta } from '../../models/venta.model';

@Component({
  selector: 'app-comprobantes',
  standalone: true,
  imports: [DatePipe, FormsModule, IonContent, IonCard, IonCardContent, IonBadge, IonButton, IonIcon, IonText, IonItem, IonLabel, IonSelect, IonSelectOption],
  template: `
    <ion-content>
      <section class="page-shell">
        <div class="hero-band">
          <div>
            <span class="badge green">Comprobantes</span>
            <h1>Documentos emitidos</h1>
            <p>Consulta, reimpresión y preparación para formatos fiscales.</p>
          </div>
          <img class="brand-logo" src="assets/mariva-logo.svg" alt="Distribuidora Mariva">
        </div>

        @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }

        <div class="comprobante-grid">
          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title">
                <div><h2>Historial</h2><span class="muted">{{ ventas.length }} comprobantes</span></div>
              </div>
              @for (v of ventas; track v.id) {
                <button type="button" class="comprobante-item" [class.active]="ventaSeleccionada?.id === v.id" (click)="seleccionar(v)">
                  <div class="round-icon"><ion-icon name="receipt-outline"></ion-icon></div>
                  <div>
                    <strong>{{ v.comprobante?.serie }}-{{ v.comprobante?.numero }}</strong>
                    <span>{{ v.fecha | date:'short' }} · {{ v.cliente?.nombreRazonSocial || 'Cliente general' }}</span>
                  </div>
                  <b>S/ {{ v.total.toFixed(2) }}</b>
                </button>
              } @empty {
                <p class="muted">Emite una venta para ver comprobantes.</p>
              }
            </ion-card-content>
          </ion-card>

          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title">
                <div>
                  <h2>Detalle imprimible</h2>
                  <span class="muted">Compatible con reimpresión</span>
                </div>
                @if (ventaSeleccionada) { <ion-badge color="success">{{ ventaSeleccionada.comprobante?.estado }}</ion-badge> }
              </div>

              @if (ventaSeleccionada) {
                <div class="receipt-preview">
                  <img src="assets/mariva-logo.svg" alt="Mariva">
                  <h3>Distribuidora Mariva</h3>
                  <p>{{ ventaSeleccionada.tipoComprobante }} {{ ventaSeleccionada.comprobante?.serie }}-{{ ventaSeleccionada.comprobante?.numero }}</p>
                  <p>{{ ventaSeleccionada.fecha | date:'medium' }}</p>
                  <p>Cliente: {{ ventaSeleccionada.cliente?.nombreRazonSocial || 'Cliente general' }}</p>
                  @for (item of ventaSeleccionada.detalles; track item.producto.id + item.producto.nombre) {
                    <div class="receipt-line">
                      <span>{{ item.producto.nombre }} x{{ item.cantidad }}</span>
                      <b>S/ {{ item.total.toFixed(2) }}</b>
                      <ion-button size="small" fill="clear" color="danger" (click)="quitarItem(item.producto.id)"><ion-icon name="trash-outline"></ion-icon></ion-button>
                    </div>
                  }
                  <div class="receipt-line total"><span>Total</span><b>S/ {{ ventaSeleccionada.total.toFixed(2) }}</b></div>
                </div>

                <div class="action-row">
                  <ion-button (click)="imprimir(ventaSeleccionada)"><ion-icon name="print-outline" slot="start"></ion-icon>Imprimir / Reimprimir</ion-button>
                  <ion-item>
                    <ion-label>Agregar producto</ion-label>
                    <ion-select [(ngModel)]="productoAgregarId">
                      @for (p of productos; track p.id) {
                        <ion-select-option [value]="p.id">{{ p.nombre }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-item>
                  <ion-button fill="outline" (click)="agregarProducto()"><ion-icon name="add-outline" slot="start"></ion-icon>Agregar</ion-button>
                </div>
              } @else {
                <p class="muted">Selecciona un comprobante.</p>
              }
            </ion-card-content>
          </ion-card>
        </div>

        @if (ventaImpresion) {
          <div class="ticket-print">
            <h2>Distribuidora Mariva</h2>
            <p>{{ ventaImpresion.tipoComprobante }} {{ ventaImpresion.comprobante?.serie }}-{{ ventaImpresion.comprobante?.numero }}</p>
            <p>{{ ventaImpresion.fecha | date:'short' }}</p>
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
    .comprobante-grid {
      display: grid;
      grid-template-columns: minmax(300px, .8fr) minmax(0, 1.2fr);
      gap: 16px;
    }

    .comprobante-item {
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr) auto;
      gap: 12px;
      width: 100%;
      align-items: center;
      padding: 12px;
      border: 1px solid var(--app-line);
      border-radius: 8px;
      background: #fff;
      text-align: left;
      margin-bottom: 8px;
    }

    .comprobante-item.active {
      border-color: var(--app-orange);
      background: #fff7ed;
    }

    .comprobante-item strong,
    .comprobante-item span {
      display: block;
    }

    .comprobante-item span {
      color: var(--app-muted);
      font-size: 12px;
    }

    .receipt-preview {
      max-width: 420px;
      margin: 0 auto 14px;
      padding: 16px;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      background: #fff;
      text-align: center;
    }

    .receipt-preview img {
      width: 70px;
      height: 70px;
      object-fit: contain;
    }

    .receipt-line {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 8px;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px dashed #e5e7eb;
      text-align: left;
    }

    .receipt-line.total b {
      color: var(--app-orange);
      font-size: 20px;
    }

    @media (max-width: 900px) {
      .comprobante-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ComprobantesPage {
  ventas: Venta[] = this.ventasService.listar();
  productos: Producto[] = this.productosService.listar();
  ventaSeleccionada?: Venta;
  ventaImpresion?: Venta;
  productoAgregarId = '';
  error = '';

  constructor(
    private ventasService: VentasService,
    private productosService: ProductosService,
    private impresionService: ImpresionService
  ) {
    addIcons({ receiptOutline, printOutline, addOutline, trashOutline });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.ventas = await this.ventasService.listarRemoto();
      this.productos = await this.productosService.listarRemoto();
      this.ventaSeleccionada = this.ventas[0];
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudieron cargar los comprobantes desde Supabase.';
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
        this.error = e instanceof Error ? e.message : 'No se pudo imprimir el comprobante.';
      }
    });
  }

  agregarProducto(): void {
    const producto = this.productos.find(p => p.id === this.productoAgregarId);
    if (!producto || !this.ventaSeleccionada) {
      return;
    }

    this.ventaSeleccionada.detalles.push({
      producto,
      cantidad: 1,
      precioUnitario: producto.precioVenta,
      total: producto.precioVenta
    });
    this.ventaSeleccionada.total += producto.precioVenta;
  }

  quitarItem(productoId: string): void {
    if (!this.ventaSeleccionada) {
      return;
    }

    const item = this.ventaSeleccionada.detalles.find(detalle => detalle.producto.id === productoId);
    this.ventaSeleccionada.detalles = this.ventaSeleccionada.detalles.filter(detalle => detalle.producto.id !== productoId);
    this.ventaSeleccionada.total -= item?.total ?? 0;
  }
}
