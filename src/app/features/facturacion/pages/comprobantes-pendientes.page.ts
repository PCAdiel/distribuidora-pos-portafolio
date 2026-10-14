import { Component } from '@angular/core';
import { IonBadge, IonButton, IonCard, IonCardContent, IonContent, IonItem, IonLabel, IonText } from '@ionic/angular/standalone';
import { VentasService } from '../../../core/services/ventas.service';
import { Venta } from '../../../models/venta.model';
import { NubefactService } from '../services/nubefact.service';

@Component({
  selector: 'app-comprobantes-pendientes',
  standalone: true,
  imports: [IonBadge, IonButton, IonCard, IonCardContent, IonContent, IonItem, IonLabel, IonText],
  template: `
    <ion-content>
      <section class="page-section">
        <div class="page-title">
          <div>
            <h1>Facturacion pendiente</h1>
            <p>Comprobantes locales preparados para enviar o reintentar con Nubefact.</p>
          </div>
          <ion-button (click)="cargar()">Actualizar</ion-button>
        </div>

        @if (mensaje) { <ion-text color="success"><p>{{ mensaje }}</p></ion-text> }
        @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }

        <ion-card class="panel">
          <ion-card-content>
            @for (venta of pendientes; track venta.id) {
              <ion-item>
                <ion-label>
                  <strong>{{ venta.tipoComprobante }} {{ venta.comprobante?.serie }}-{{ venta.comprobante?.numero }}</strong>
                  <p>{{ venta.fecha }} - S/ {{ venta.total.toFixed(2) }}</p>
                </ion-label>
                <ion-badge color="warning">{{ venta.comprobante?.estado }}</ion-badge>
                <ion-button size="small" [disabled]="procesandoId === venta.comprobante?.id" (click)="reintentar(venta)">
                  {{ procesandoId === venta.comprobante?.id ? 'Enviando...' : 'Reintentar' }}
                </ion-button>
              </ion-item>
            } @empty {
              <p class="muted">No hay comprobantes pendientes.</p>
            }
          </ion-card-content>
        </ion-card>
      </section>
    </ion-content>
  `
})
export class ComprobantesPendientesPage {
  pendientes: Venta[] = [];
  procesandoId = '';
  mensaje = '';
  error = '';

  constructor(
    private ventasService: VentasService,
    private nubefactService: NubefactService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    const ventas = await this.ventasService.listarRemoto().catch(() => this.ventasService.listar());
    this.pendientes = ventas.filter(venta => [
      'PENDIENTE_FACTURACION',
      'ERROR_FACTURACION',
      'PENDIENTE_REINTENTO'
    ].includes(venta.comprobante?.estado ?? ''));
  }

  async reintentar(venta: Venta): Promise<void> {
    if (!venta.comprobante?.id) {
      this.error = 'El comprobante no tiene ID para reintentar.';
      return;
    }

    try {
      this.procesandoId = venta.comprobante.id;
      this.mensaje = '';
      this.error = '';
      const respuesta = await this.nubefactService.emitir(venta.comprobante.id);

      if (!respuesta.ok) {
        throw new Error(String(respuesta.nubefact?.['errors'] ?? 'Nubefact no acepto el comprobante.'));
      }

      this.mensaje = 'Comprobante enviado correctamente.';
      await this.cargar();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo reintentar el comprobante.';
    } finally {
      this.procesandoId = '';
    }
  }
}
