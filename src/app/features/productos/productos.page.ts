import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonToggle
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { createOutline, imageOutline, trashOutline } from 'ionicons/icons';
import { LotesService } from '../../core/services/lotes.service';
import { ProductosService } from '../../core/services/productos.service';
import { StockAjustesService, TipoAjusteStock } from '../../core/services/stock-ajustes.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Producto } from '../../models/producto.model';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [FormsModule, IonContent, IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonButton, IonSelect, IonSelectOption, IonText, IonSearchbar, IonTextarea, IonToggle, IonIcon],
  template: `
    <ion-content>
      <section class="page-shell">
        <div class="page-title">
          <div>
            <h1>Productos</h1>
            <p>Catálogo visual, stock y precios de venta.</p>
          </div>
          <span class="badge">{{ productosFiltrados.length }} visibles</span>
        </div>

        <div class="grid-2">
          <ion-card class="form-card">
            <ion-card-content>
              <div class="panel-title">
                <div>
                  <h2>{{ editando ? 'Editar producto' : 'Nuevo producto' }}</h2>
                  <span class="muted">Nombre, precio, stock, imagen y estado.</span>
                </div>
                <div class="round-icon"><ion-icon name="image-outline"></ion-icon></div>
              </div>

              <ion-item><ion-label position="stacked">Nombre</ion-label><ion-input [(ngModel)]="form.nombre" /></ion-item>
              <ion-item><ion-label position="stacked">Categoría</ion-label><ion-input [(ngModel)]="form.categoria" /></ion-item>
              <ion-item><ion-label position="stacked">Descripción</ion-label><ion-textarea [(ngModel)]="form.descripcion" autoGrow="true" /></ion-item>

              <div class="form-grid">
                <ion-item><ion-label position="stacked">Precio venta</ion-label><ion-input [(ngModel)]="form.precioVenta" type="number" /></ion-item>
                <ion-item><ion-label position="stacked">Costo unitario</ion-label><ion-input [(ngModel)]="form.costoUnitario" type="number" /></ion-item>
                <ion-item><ion-label position="stacked">Stock</ion-label><ion-input [(ngModel)]="form.stock" type="number" /></ion-item>
                <ion-item><ion-label position="stacked">Stock mínimo</ion-label><ion-input [(ngModel)]="form.stockMinimo" type="number" /></ion-item>
              </div>

              <ion-item><ion-label position="stacked">URL de imagen</ion-label><ion-input [(ngModel)]="form.imagenUrl" placeholder="https://..." /></ion-item>
              <ion-item>
                <ion-label>Producto activo</ion-label>
                <ion-toggle [(ngModel)]="form.activo"></ion-toggle>
              </ion-item>

              <div class="action-row">
                <ion-button [disabled]="guardando" (click)="guardar()">{{ guardando ? 'Guardando...' : (editando ? 'Actualizar producto' : 'Guardar producto') }}</ion-button>
                <ion-button fill="outline" color="medium" (click)="cancelarEdicion()">Limpiar</ion-button>
              </div>

              @if (mensaje) { <ion-text color="success"><p>{{ mensaje }}</p></ion-text> }
              @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }
            </ion-card-content>
          </ion-card>

          <div>
            <div class="search-row">
              <ion-searchbar [(ngModel)]="busqueda" placeholder="Buscar producto o categoría"></ion-searchbar>
              <ion-select [(ngModel)]="filtro" interface="popover" label="Filtro" labelPlacement="stacked">
                <ion-select-option value="TODOS">Todos</ion-select-option>
                <ion-select-option value="ACTIVOS">Activos</ion-select-option>
                <ion-select-option value="INACTIVOS">Inactivos</ion-select-option>
                <ion-select-option value="STOCK_BAJO">Stock bajo</ion-select-option>
              </ion-select>
            </div>

            <div class="list-grid">
              @for (p of productosFiltrados; track p.id) {
                <ion-card class="product-card">
                  <ion-card-content>
                    <div class="product-top">
                      @if (mostrarImagen(p)) {
                        <img class="product-thumb" [src]="p.imagenUrl" [alt]="p.nombre" (error)="marcarImagenFallida(p.id)">
                      } @else {
                        <div class="product-thumb placeholder">{{ iniciales(p.nombre) }}</div>
                      }
                      <div>
                        <strong>{{ p.nombre }}</strong>
                        <span class="muted">{{ p.categoria }}</span>
                        @if (p.stock <= p.stockMinimo) { <span class="badge red">Stock bajo</span> }
                      </div>
                    </div>
                    <p class="muted">{{ p.descripcion || 'Sin descripción' }}</p>
                    <div class="product-meta">
                      <span class="price">S/ {{ p.precioVenta.toFixed(2) }}</span>
                      <span>Stock: <b>{{ p.stock }}</b></span>
                      <span [class]="p.activo ? 'badge green' : 'badge red'">{{ p.activo ? 'Activo' : 'Inactivo' }}</span>
                    </div>
                    <div class="action-row">
                      <ion-button size="small" fill="outline" (click)="editar(p)"><ion-icon name="create-outline" slot="start"></ion-icon>Editar</ion-button>
                      <ion-button size="small" fill="outline" color="success" (click)="ajustarStock(p)">Ajuste</ion-button>
                      <ion-button size="small" fill="outline" color="warning" (click)="registrarLote(p)">Lote</ion-button>
                      <ion-button size="small" color="danger" fill="clear" (click)="eliminar(p)"><ion-icon name="trash-outline" slot="start"></ion-icon>Eliminar</ion-button>
                    </div>
                  </ion-card-content>
                </ion-card>
              } @empty {
                <ion-card class="panel"><ion-card-content><p class="muted">No hay productos con ese filtro.</p></ion-card-content></ion-card>
              }
            </div>
          </div>
        </div>
      </section>
    </ion-content>
  `,
  styles: [`
    .product-card {
      margin: 0;
    }

    .product-top {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 10px;
    }

    .product-top strong,
    .product-top span {
      display: block;
    }

    .product-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      margin: 12px 0;
    }
  `]
})
export class ProductosPage {
  productos = this.productosService.listar();
  form: Producto = this.nuevo();
  guardando = false;
  editando = false;
  mensaje = '';
  error = '';
  busqueda = '';
  filtro: 'TODOS' | 'ACTIVOS' | 'INACTIVOS' | 'STOCK_BAJO' = 'TODOS';
  imagenesFallidas = new Set<string>();

  constructor(
    private productosService: ProductosService,
    private supabaseService: SupabaseService,
    private stockAjustesService: StockAjustesService,
    private lotesService: LotesService
  ) {
    addIcons({ createOutline, trashOutline, imageOutline });
  }

  get productosFiltrados(): Producto[] {
    const texto = this.busqueda.trim().toLowerCase();
    return this.productos.filter(producto => {
      const coincideTexto = !texto || `${producto.nombre} ${producto.categoria} ${producto.descripcion ?? ''}`.toLowerCase().includes(texto);
      const coincideFiltro =
        this.filtro === 'TODOS' ||
        (this.filtro === 'ACTIVOS' && producto.activo) ||
        (this.filtro === 'INACTIVOS' && !producto.activo) ||
        (this.filtro === 'STOCK_BAJO' && producto.stock <= producto.stockMinimo);
      return coincideTexto && coincideFiltro;
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.productos = await this.productosService.listarRemoto();
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudieron cargar los productos desde Supabase.');
    }
  }

  nuevo(): Producto {
    return { id: '', nombre: '', categoria: 'Gaseosas', descripcion: '', unidadMedida: 'NIU', precioVenta: 0, costoUnitario: 0, stock: 0, stockMinimo: 10, imagenUrl: '', activo: true };
  }

  editar(producto: Producto): void {
    this.form = { ...producto };
    this.editando = true;
    this.mensaje = '';
    this.error = '';
  }

  cancelarEdicion(): void {
    this.form = this.nuevo();
    this.editando = false;
  }

  async guardar(): Promise<void> {
    try {
      this.guardando = true;
      this.error = '';
      this.mensaje = '';

      if (!this.form.nombre.trim()) {
        throw new Error('Ingresa el nombre del producto.');
      }

      await this.productosService.guardar(this.form);
      this.productos = await this.productosService.listarRemoto();
      this.cancelarEdicion();
      this.mensaje = 'Producto guardado.';
    } catch (e) {
      this.productos = this.productosService.listar();
      this.mensaje = 'Producto guardado localmente.';
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo guardar el producto en Supabase.');
    } finally {
      this.guardando = false;
    }
  }

  async eliminar(producto: Producto): Promise<void> {
    try {
      await this.productosService.eliminar(producto);
      this.productos = this.productosService.listar();
      this.mensaje = 'Producto eliminado o desactivado.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo eliminar el producto.');
    }
  }

  async ajustarStock(producto: Producto): Promise<void> {
    try {
      this.error = '';
      this.mensaje = '';
      const tipo = (prompt('Tipo de ajuste: ENTRADA, AJUSTE_POSITIVO, AJUSTE_NEGATIVO, MERMA, VENCIMIENTO o DEVOLUCION', 'ENTRADA') ?? '').trim().toUpperCase() as TipoAjusteStock;
      const cantidad = Number(prompt(`Cantidad para ${producto.nombre}`, '1') ?? 0);
      const observacion = prompt('Observacion del ajuste', '') ?? '';

      if (!tipo || !Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error('Ingresa un tipo y una cantidad valida.');
      }

      await this.stockAjustesService.registrar(producto.id, tipo, cantidad, observacion);
      this.productos = await this.productosService.listarRemoto();
      this.mensaje = 'Ajuste de stock registrado en Kardex.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo registrar el ajuste.');
    }
  }

  async registrarLote(producto: Producto): Promise<void> {
    try {
      this.error = '';
      this.mensaje = '';
      const codigoLote = (prompt(`Codigo de lote para ${producto.nombre}`, '') ?? '').trim();
      const fechaVencimiento = (prompt('Fecha de vencimiento (YYYY-MM-DD)', new Date().toISOString().slice(0, 10)) ?? '').trim();
      const stockLote = Number(prompt('Stock del lote', '0') ?? 0);
      const costoUnitario = Number(prompt('Costo unitario del lote', String(producto.costoUnitario ?? producto.precioCompra ?? 0)) ?? 0);

      if (!codigoLote || !fechaVencimiento || !Number.isFinite(stockLote) || stockLote < 0) {
        throw new Error('Completa codigo, fecha y stock del lote.');
      }

      await this.lotesService.guardar({
        productoId: producto.id,
        codigoLote,
        fechaVencimiento,
        stockLote,
        costoUnitario: Number.isFinite(costoUnitario) ? costoUnitario : 0,
        activo: true
      });
      this.mensaje = 'Lote registrado para reportes de vencimiento.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo registrar el lote.');
    }
  }

  iniciales(nombre: string): string {
    return nombre.slice(0, 2).toUpperCase();
  }

  mostrarImagen(producto: Producto): boolean {
    return Boolean(producto.imagenUrl?.trim()) && !this.imagenesFallidas.has(producto.id);
  }

  marcarImagenFallida(productoId: string): void {
    this.imagenesFallidas.add(productoId);
  }
}
