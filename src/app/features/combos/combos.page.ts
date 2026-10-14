import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonToggle
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, cubeOutline, trashOutline } from 'ionicons/icons';
import { CombosService } from '../../core/services/combos.service';
import { ProductosService } from '../../core/services/productos.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Combo, ComboItem } from '../../models/combo.model';
import { Producto } from '../../models/producto.model';

interface ComboForm {
  id: string;
  nombre: string;
  descripcion: string;
  precioVenta: number;
  activo: boolean;
  componentes: ComboItem[];
}

@Component({
  selector: 'app-combos',
  standalone: true,
  imports: [
    FormsModule,
    IonContent,
    IonCard,
    IonCardContent,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonSelect,
    IonSelectOption,
    IonText,
    IonTextarea,
    IonToggle,
    IonIcon,
    IonBadge
  ],
  template: `
    <ion-content>
      <section class="page-shell">
        <div class="page-title">
          <div>
            <h1>Combos</h1>
            <p>Promociones con descuento de stock por componentes.</p>
          </div>
          <span class="badge">{{ combos.length }} registrados</span>
        </div>

        <div class="grid-2">
          <ion-card class="form-card">
            <ion-card-content>
              <div class="panel-title">
                <div>
                  <h2>{{ editando ? 'Editar combo' : 'Nuevo combo' }}</h2>
                  <span class="muted">Define precio y productos incluidos.</span>
                </div>
                <div class="round-icon"><ion-icon name="cube-outline"></ion-icon></div>
              </div>

              <ion-item><ion-label position="stacked">Nombre</ion-label><ion-input [(ngModel)]="form.nombre" /></ion-item>
              <ion-item><ion-label position="stacked">Descripcion</ion-label><ion-textarea [(ngModel)]="form.descripcion" autoGrow="true" /></ion-item>
              <ion-item><ion-label position="stacked">Precio venta del combo</ion-label><ion-input [(ngModel)]="form.precioVenta" type="number" /></ion-item>
              <ion-item>
                <ion-label>Combo activo</ion-label>
                <ion-toggle [(ngModel)]="form.activo"></ion-toggle>
              </ion-item>

              <div class="component-picker">
                <ion-item>
                  <ion-label position="stacked">Producto</ion-label>
                  <ion-select [(ngModel)]="productoSeleccionadoId" interface="popover">
                    @for (producto of productos; track producto.id) {
                      <ion-select-option [value]="producto.id">{{ producto.nombre }} - Stock {{ producto.stock }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
                <ion-item><ion-label position="stacked">Cantidad</ion-label><ion-input [(ngModel)]="cantidadComponente" type="number" /></ion-item>
                <ion-button fill="outline" (click)="agregarComponente()">
                  <ion-icon name="add-outline" slot="start"></ion-icon>
                  Agregar
                </ion-button>
              </div>

              <div class="component-list">
                @for (item of form.componentes; track item.productoId) {
                  <div class="component-row">
                    <div>
                      <strong>{{ item.productoNombre }}</strong>
                      <span>{{ item.cantidad }} unidad(es) - Stock {{ item.stock }}</span>
                    </div>
                    <ion-button size="small" fill="clear" color="danger" (click)="quitarComponente(item.productoId)">
                      <ion-icon name="trash-outline"></ion-icon>
                    </ion-button>
                  </div>
                } @empty {
                  <p class="muted">Agrega productos al combo.</p>
                }
              </div>

              <div class="action-row">
                <ion-button [disabled]="guardando" (click)="guardar()">{{ guardando ? 'Guardando...' : (editando ? 'Actualizar combo' : 'Guardar combo') }}</ion-button>
                <ion-button fill="outline" color="medium" (click)="limpiar()">Limpiar</ion-button>
              </div>

              @if (mensaje) { <ion-text color="success"><p>{{ mensaje }}</p></ion-text> }
              @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }
            </ion-card-content>
          </ion-card>

          <div class="list-grid">
            @for (combo of combos; track combo.id) {
              <ion-card class="combo-card">
                <ion-card-content>
                  <div class="combo-header">
                    <div>
                      <strong>{{ combo.nombre }}</strong>
                      <span class="muted">{{ combo.descripcion || 'Sin descripcion' }}</span>
                    </div>
                    <ion-badge [color]="combo.activo ? 'success' : 'medium'">{{ combo.activo ? 'Activo' : 'Inactivo' }}</ion-badge>
                  </div>
                  <div class="product-meta">
                    <span class="price">S/ {{ combo.precioVenta.toFixed(2) }}</span>
                    <span>Stock combo: <b>{{ combo.stockDisponible }}</b></span>
                  </div>
                  <div class="component-list compact">
                    @for (item of combo.componentes; track item.productoId) {
                      <div class="component-row">
                        <div><strong>{{ item.productoNombre }}</strong><span>{{ item.cantidad }} unidad(es)</span></div>
                      </div>
                    }
                  </div>
                  <div class="action-row">
                    <ion-button size="small" fill="outline" (click)="editar(combo)">Editar</ion-button>
                    <ion-button size="small" color="danger" fill="clear" [disabled]="!combo.activo" (click)="desactivar(combo)">Desactivar</ion-button>
                  </div>
                </ion-card-content>
              </ion-card>
            } @empty {
              <ion-card class="panel"><ion-card-content><p class="muted">Todavia no hay combos.</p></ion-card-content></ion-card>
            }
          </div>
        </div>
      </section>
    </ion-content>
  `,
  styles: [`
    .component-picker {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 120px auto;
      gap: 10px;
      align-items: end;
      margin: 12px 0;
    }

    .component-list {
      display: grid;
      gap: 8px;
      margin: 12px 0;
    }

    .component-row,
    .combo-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px;
      border: 1px solid var(--app-line);
      border-radius: 8px;
      background: #fff;
    }

    .component-row strong,
    .component-row span,
    .combo-header strong,
    .combo-header span {
      display: block;
    }

    .component-row span {
      color: var(--app-muted);
      font-size: 12px;
    }

    .combo-card {
      margin: 0;
    }

    .compact .component-row {
      padding: 8px 0;
      border-width: 0 0 1px;
      border-radius: 0;
    }

    @media (max-width: 720px) {
      .component-picker {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class CombosPage {
  productos: Producto[] = [];
  combos: Combo[] = [];
  form: ComboForm = this.nuevo();
  productoSeleccionadoId = '';
  cantidadComponente = 1;
  editando = false;
  guardando = false;
  mensaje = '';
  error = '';

  constructor(
    private productosService: ProductosService,
    private combosService: CombosService,
    private supabaseService: SupabaseService
  ) {
    addIcons({ addOutline, trashOutline, cubeOutline });
  }

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      const [productos, combos] = await Promise.all([
        this.productosService.listarRemoto(),
        this.combosService.listarAdmin()
      ]);
      this.productos = productos.filter(producto => producto.activo);
      this.combos = combos;
      this.productoSeleccionadoId = this.productos[0]?.id ?? '';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudieron cargar los combos.');
    }
  }

  agregarComponente(): void {
    this.error = '';
    const producto = this.productos.find(item => item.id === this.productoSeleccionadoId);
    const cantidad = Number(this.cantidadComponente);

    if (!producto) {
      this.error = 'Selecciona un producto.';
      return;
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      this.error = 'La cantidad debe ser mayor a cero.';
      return;
    }

    const existente = this.form.componentes.find(item => item.productoId === producto.id);

    if (existente) {
      existente.cantidad += cantidad;
      return;
    }

    this.form.componentes.push({
      productoId: producto.id,
      productoNombre: producto.nombre,
      cantidad,
      stock: producto.stock,
      precioVenta: producto.precioVenta
    });
  }

  quitarComponente(productoId: string): void {
    this.form.componentes = this.form.componentes.filter(item => item.productoId !== productoId);
  }

  editar(combo: Combo): void {
    this.form = {
      id: combo.id,
      nombre: combo.nombre,
      descripcion: combo.descripcion ?? '',
      precioVenta: combo.precioVenta,
      activo: combo.activo,
      componentes: combo.componentes.map(item => ({ ...item }))
    };
    this.editando = true;
    this.mensaje = '';
    this.error = '';
  }

  async guardar(): Promise<void> {
    try {
      this.guardando = true;
      this.error = '';
      this.mensaje = '';
      await this.combosService.guardar(this.form);
      await this.cargar();
      this.limpiar();
      this.mensaje = 'Combo guardado.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo guardar el combo.');
    } finally {
      this.guardando = false;
    }
  }

  async desactivar(combo: Combo): Promise<void> {
    try {
      await this.combosService.desactivar(combo.id);
      await this.cargar();
      this.mensaje = 'Combo desactivado.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo desactivar el combo.');
    }
  }

  limpiar(): void {
    this.form = this.nuevo();
    this.editando = false;
  }

  private nuevo(): ComboForm {
    return {
      id: '',
      nombre: '',
      descripcion: '',
      precioVenta: 0,
      activo: true,
      componentes: []
    };
  }
}
