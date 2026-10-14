import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonContent, IonIcon, IonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, arrowForwardOutline, cartOutline, cashOutline, cubeOutline, peopleOutline, receiptOutline } from 'ionicons/icons';
import { ClientesService } from '../../core/services/clientes.service';
import { ProductosService } from '../../core/services/productos.service';
import { VentasService } from '../../core/services/ventas.service';
import { Cliente } from '../../models/cliente.model';
import { Producto } from '../../models/producto.model';
import { Venta } from '../../models/venta.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, RouterLink, IonContent, IonCard, IonCardContent, IonIcon, IonButton, IonText],
  template: `
    <ion-content>
      <section class="page-shell">
        <div class="hero-band">
          <div>
            <span class="badge green">Panel operativo</span>
            <h1>Dashboard</h1>
            <p>Resumen de ventas, caja, productos y clientes de Distribuidora Mariva.</p>
          </div>
          <img class="brand-logo" src="assets/mariva-logo.svg" alt="Distribuidora Mariva">
        </div>

        @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }

        <div class="grid-auto">
          <ion-card class="metric-card">
            <ion-card-content>
              <div><span>Ventas hoy</span><strong>S/ {{ ventasHoy.toFixed(2) }}</strong><span>{{ ventasHoyCount }} operaciones</span></div>
              <div class="metric-icon green"><ion-icon name="cash-outline"></ion-icon></div>
            </ion-card-content>
          </ion-card>

          <ion-card class="metric-card">
            <ion-card-content>
              <div><span>Total vendido</span><strong>S/ {{ totalVentas.toFixed(2) }}</strong><span>{{ ventas.length }} ventas registradas</span></div>
              <div class="metric-icon"><ion-icon name="receipt-outline"></ion-icon></div>
            </ion-card-content>
          </ion-card>

          <ion-card class="metric-card">
            <ion-card-content>
              <div><span>Productos</span><strong>{{ productos.length }}</strong><span>{{ stockBajo }} con stock bajo</span></div>
              <div class="metric-icon blue"><ion-icon name="cube-outline"></ion-icon></div>
            </ion-card-content>
          </ion-card>

          <ion-card class="metric-card">
            <ion-card-content>
              <div><span>Clientes</span><strong>{{ clientes.length }}</strong><span>Base comercial</span></div>
              <div class="metric-icon dark"><ion-icon name="people-outline"></ion-icon></div>
            </ion-card-content>
          </ion-card>
        </div>

        <div class="dashboard-grid">
          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title">
                <div><h2>Accesos rápidos</h2><span class="muted">Operaciones frecuentes</span></div>
              </div>
              <div class="quick-grid">
                <ion-button routerLink="/pos"><ion-icon name="cart-outline" slot="start"></ion-icon>Nuevo ticket</ion-button>
                <ion-button routerLink="/productos" fill="outline"><ion-icon name="cube-outline" slot="start"></ion-icon>Productos</ion-button>
                <ion-button routerLink="/clientes" fill="outline"><ion-icon name="people-outline" slot="start"></ion-icon>Clientes</ion-button>
                <ion-button routerLink="/caja" fill="outline"><ion-icon name="cash-outline" slot="start"></ion-icon>Caja</ion-button>
              </div>
            </ion-card-content>
          </ion-card>

          <ion-card class="panel">
            <ion-card-content>
              <div class="panel-title">
                <div><h2>Stock bajo</h2><span class="muted">Reponer a tiempo</span></div>
                <ion-icon name="alert-circle-outline"></ion-icon>
              </div>
              @for (p of productosBajoStock; track p.id) {
                <div class="compact-row">
                  <div>
                    <strong>{{ p.nombre }}</strong>
                    <span>{{ p.categoria }}</span>
                  </div>
                  <b>{{ p.stock }}</b>
                </div>
              } @empty {
                <p class="muted">No hay productos por debajo del mínimo.</p>
              }
            </ion-card-content>
          </ion-card>

          <ion-card class="panel recent-panel">
            <ion-card-content>
              <div class="panel-title">
                <div><h2>Ventas recientes</h2><span class="muted">Últimos comprobantes emitidos</span></div>
                <ion-button size="small" fill="clear" routerLink="/ventas">Ver todo <ion-icon name="arrow-forward-outline" slot="end"></ion-icon></ion-button>
              </div>
              <div class="data-table">
                <div class="data-head sales-head"><span>Fecha</span><span>Cliente</span><span>Total</span><span>Estado</span></div>
                @for (v of ventas.slice(0, 6); track v.id) {
                  <div class="data-row sales-row">
                    <span>{{ v.fecha | date:'short' }}</span>
                    <strong>{{ v.cliente?.nombreRazonSocial || 'Cliente general' }}</strong>
                    <b>S/ {{ v.total.toFixed(2) }}</b>
                    <span class="badge green">{{ v.comprobante?.estado || 'REGISTRADA' }}</span>
                  </div>
                }
              </div>
            </ion-card-content>
          </ion-card>
        </div>
      </section>
    </ion-content>
  `,
  styles: [`
    .dashboard-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr);
      gap: 16px;
      margin-top: 16px;
    }

    .recent-panel {
      grid-column: 1 / -1;
    }

    .quick-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
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

    .sales-head,
    .sales-row {
      grid-template-columns: 160px minmax(180px, 1fr) 120px 130px;
    }

    @media (max-width: 900px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class DashboardPage {
  ventas: Venta[] = this.ventasService.listar();
  productos: Producto[] = this.productosService.listar();
  clientes: Cliente[] = this.clientesService.listar();
  totalVentas = 0;
  ventasHoy = 0;
  ventasHoyCount = 0;
  stockBajo = 0;
  productosBajoStock: Producto[] = [];
  error = '';

  constructor(
    private ventasService: VentasService,
    private productosService: ProductosService,
    private clientesService: ClientesService
  ) {
    addIcons({ cashOutline, receiptOutline, cubeOutline, peopleOutline, cartOutline, alertCircleOutline, arrowForwardOutline });
    this.calcular();
  }

  async ngOnInit(): Promise<void> {
    try {
      this.ventas = await this.ventasService.listarRemoto();
      this.productos = await this.productosService.listarRemoto();
      this.clientes = await this.clientesService.listarRemoto();
      this.calcular();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo cargar el dashboard desde Supabase.';
      this.calcular();
    }
  }

  private calcular(): void {
    const hoy = new Date().toDateString();
    const ventasDelDia = this.ventas.filter(v => new Date(v.fecha).toDateString() === hoy);
    this.totalVentas = this.ventas.reduce((acc, v) => acc + v.total, 0);
    this.ventasHoy = ventasDelDia.reduce((acc, v) => acc + v.total, 0);
    this.ventasHoyCount = ventasDelDia.length;
    this.productosBajoStock = this.productos.filter(p => p.stock <= p.stockMinimo);
    this.stockBajo = this.productosBajoStock.length;
  }
}
