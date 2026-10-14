import { Component, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  IonAlert,
  IonBadge,
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
  IonSelectOption
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, cloudDoneOutline, cloudOfflineOutline, printOutline, removeOutline, syncOutline, trashOutline } from 'ionicons/icons';
import { ErrorService } from '../../core/errors/error.service';
import { OfflineQueueService } from '../../core/offline/offline-queue.service';
import { PosCalculatorService } from '../../core/pos/pos-calculator.service';
import { PosValidationService } from '../../core/pos/pos-validation.service';
import { ClientesService } from '../../core/services/clientes.service';
import { CombosService } from '../../core/services/combos.service';
import { ImpresionService } from '../../core/services/impresion.service';
import { ProductosService } from '../../core/services/productos.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { SupabaseTicketsService, SupabaseTicketItem } from '../../core/services/supabase-tickets.service';
import { TicketsService } from '../../core/services/tickets.service';
import { VentasService } from '../../core/services/ventas.service';
import { Cliente } from '../../models/cliente.model';
import { Combo } from '../../models/combo.model';
import { Producto } from '../../models/producto.model';
import { TicketItem } from '../../models/ticket.model';
import { Venta } from '../../models/venta.model';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [DatePipe, FormsModule, IonContent, IonCard, IonCardContent, IonButton, IonItem, IonLabel, IonSelect, IonSelectOption, IonBadge, IonAlert, IonInput, IonSearchbar, IonIcon],
  template: `
    <ion-content>
      <section class="pos-shell">
        <div class="page-title">
          <div>
            <h1>Ticket / Venta</h1>
            <p>Venta rápida con control de stock e impresión de cuenta.</p>
          </div>
          <div class="pos-status">
            <ion-badge [color]="online ? 'success' : 'warning'">
              <ion-icon [name]="online ? 'cloud-done-outline' : 'cloud-offline-outline'"></ion-icon>
              {{ online ? 'Online' : 'Offline' }}
            </ion-badge>
            @if (ventasPendientes > 0) {
              <ion-button size="small" fill="outline" color="warning" (click)="sincronizarPendientes()">
                <ion-icon name="sync-outline" slot="start"></ion-icon>
                {{ ventasPendientes }} pendiente(s)
              </ion-button>
            }
            <img class="brand-logo small" src="assets/mariva-logo.svg" alt="Mariva">
          </div>
        </div>

        <div class="pos-grid">
          <div class="catalog-panel">
            <ion-card class="panel">
              <ion-card-content>
                <div class="panel-title">
                  <div><h2>Productos</h2><span class="muted">{{ productosFiltrados.length }} disponibles</span></div>
                </div>
                <ion-searchbar [(ngModel)]="busqueda" placeholder="Buscar producto"></ion-searchbar>
                <div class="product-pos-grid">
                  @for (p of productosFiltrados; track p.id) {
                    <button class="pos-product" type="button" (click)="agregar(p)" [disabled]="p.stock <= cantidadEnTicket(p.id)">
                      @if (mostrarImagen(p)) {
                        <img [src]="p.imagenUrl" [alt]="p.nombre" (error)="marcarImagenFallida(p.id)">
                      } @else {
                        <span class="product-thumb placeholder">{{ iniciales(p.nombre) }}</span>
                      }
                      <strong>{{ p.nombre }}</strong>
                      <span>{{ p.categoria }} · Stock {{ p.stock }}</span>
                      <b>S/ {{ p.precioVenta.toFixed(2) }}</b>
                    </button>
                  }
                </div>
              </ion-card-content>
            </ion-card>

            @if (combosFiltrados.length) {
              <ion-card class="panel">
                <ion-card-content>
                  <div class="panel-title">
                    <div><h2>Combos</h2><span class="muted">{{ combosFiltrados.length }} disponibles</span></div>
                  </div>
                  <div class="product-pos-grid">
                    @for (combo of combosFiltrados; track combo.id) {
                      <button class="pos-product combo-product" type="button" (click)="agregarCombo(combo)" [disabled]="combo.stockDisponible <= cantidadComboEnTicket(combo.id)">
                        <span class="product-thumb placeholder">CB</span>
                        <strong>{{ combo.nombre }}</strong>
                        <span>Combo - Stock {{ combo.stockDisponible }}</span>
                        <span>{{ resumenCombo(combo) }}</span>
                        <b>S/ {{ combo.precioVenta.toFixed(2) }}</b>
                      </button>
                    }
                  </div>
                </ion-card-content>
              </ion-card>
            }
          </div>

          <aside class="ticket-panel">
            <ion-card class="panel">
              <ion-card-content>
                <div class="panel-title">
                  <div><h2>Ticket actual</h2><span class="muted">{{ carrito.length }} artículos</span></div>
                  <ion-badge color="success">S/ {{ total.toFixed(2) }}</ion-badge>
                </div>

                <ion-item>
                  <ion-label>Cliente</ion-label>
                  <ion-select [(ngModel)]="clienteId">
                    @for (c of clientes; track c.id) {
                      <ion-select-option [value]="c.id">{{ c.nombreRazonSocial }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>

                <ion-item>
                  <ion-label>Comprobante</ion-label>
                  <ion-select [(ngModel)]="tipoComprobante">
                    <ion-select-option value="BOLETA">Boleta</ion-select-option>
                    <ion-select-option value="FACTURA">Factura</ion-select-option>
                  </ion-select>
                </ion-item>

                <div class="ticket-lines">
                  @for (item of carrito; track itemTrack(item)) {
                    <div class="ticket-line">
                      <div class="ticket-item-info">
                        <strong>{{ item.producto.nombre }}</strong>
                        @if (item.tipo === 'COMBO') { <ion-badge color="tertiary">Combo</ion-badge> }
                        <span>S/ {{ item.precioUnitario.toFixed(2) }} · Stock {{ item.producto.stock }}</span>
                      </div>
                      <div class="qty-controls">
                        <ion-button size="small" fill="clear" (click)="disminuir(item)"><ion-icon name="remove-outline"></ion-icon></ion-button>
                        <ion-input class="qty-input" type="number" min="0" [max]="item.producto.stock" [ngModel]="item.cantidad" (ngModelChange)="editarCantidad(item, $event)" />
                        <ion-button size="small" fill="clear" (click)="aumentar(item)"><ion-icon name="add-outline"></ion-icon></ion-button>
                      </div>
                      <b class="ticket-item-total">S/ {{ item.total.toFixed(2) }}</b>
                      <ion-button class="ticket-delete" size="small" color="danger" fill="clear" (click)="eliminar(item)"><ion-icon name="trash-outline"></ion-icon></ion-button>
                    </div>
                  } @empty {
                    <div class="empty-ticket">
                      <strong>Ticket vacío</strong>
                      <span>Agrega productos desde el catálogo.</span>
                    </div>
                  }
                </div>

                <div class="totals">
                  <span>Subtotal</span><b>S/ {{ subtotal.toFixed(2) }}</b>
                  <span>IGV</span><b>S/ {{ igv.toFixed(2) }}</b>
                  <span>Total</span><strong>S/ {{ total.toFixed(2) }}</strong>
                </div>

                <ion-button expand="block" color="success" [disabled]="carrito.length === 0 || procesandoCobro" (click)="cobrar()">
                  {{ procesandoCobro ? 'Procesando...' : 'Cobrar / Emitir' }}
                </ion-button>
                <div class="action-row">
                  <ion-button fill="outline" [disabled]="carrito.length === 0" (click)="imprimirTicket()"><ion-icon name="print-outline" slot="start"></ion-icon>Precuenta</ion-button>
                  <ion-button fill="outline" color="medium" [disabled]="carrito.length === 0" (click)="limpiarTicket()">Limpiar</ion-button>
                </div>
              </ion-card-content>
            </ion-card>
          </aside>
        </div>

        <div class="ticket-print">
          <h2>Distribuidora Mariva</h2>
          <p>Gaseosas y Golosinas</p>
          <p>{{ tituloDocumentoImpresion }}</p>
          @if (comprobanteImpresion) {
            <p>{{ comprobanteImpresion.tipo }} {{ comprobanteImpresion.serie }}-{{ comprobanteImpresion.numero }}</p>
          }
          <p>{{ fechaImpresion | date:'short' }}</p>
          <p>Cliente: {{ clienteImpresion }}</p>
          @for (item of detallesImpresion; track itemTrack(item)) {
            <div class="line">
              <span>{{ item.producto.nombre }} x{{ item.cantidad }}</span>
              <b>S/ {{ item.total.toFixed(2) }}</b>
            </div>
          }
          <div class="line"><span>Subtotal</span><b>S/ {{ subtotalImpresion.toFixed(2) }}</b></div>
          <div class="line"><span>IGV</span><b>S/ {{ igvImpresion.toFixed(2) }}</b></div>
          <div class="line"><span>Total</span><b>S/ {{ totalImpresion.toFixed(2) }}</b></div>
          <p>Gracias por su compra.</p>
        </div>

        <ion-alert [isOpen]="!!mensaje" header="Resultado" [message]="mensaje" [buttons]="['OK']" (didDismiss)="mensaje=''" />
      </section>
    </ion-content>
  `,
  styles: [`
    .pos-shell {
      width: min(1480px, 100%);
      margin: 0 auto;
      padding: 16px;
    }

    .pos-status {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pos-status ion-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 10px;
    }

    .pos-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(340px, 430px);
      gap: 16px;
      align-items: start;
    }

    .ticket-panel {
      position: sticky;
      top: 14px;
    }

    .product-pos-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }

    .pos-product {
      min-height: 170px;
      padding: 12px;
      border: 1px solid var(--app-line);
      border-radius: 8px;
      background: #fff;
      text-align: left;
      box-shadow: 0 6px 18px rgba(16,24,40,.05);
    }

    .pos-product:disabled {
      opacity: .48;
    }

    .pos-product img,
    .pos-product .product-thumb {
      width: 58px;
      height: 58px;
      margin-bottom: 10px;
      border-radius: 8px;
      object-fit: cover;
    }

    .pos-product strong,
    .pos-product span,
    .pos-product b {
      display: block;
    }

    .pos-product span {
      color: var(--app-muted);
      font-size: 12px;
      margin: 4px 0;
    }

    .pos-product b {
      color: var(--app-orange);
    }

    .combo-product {
      background: #fff9f2;
      border-color: rgba(255, 107, 20, .28);
    }

    .ticket-lines {
      display: grid;
      gap: 8px;
      margin: 14px 0;
      max-height: 42vh;
      overflow: auto;
    }

    .ticket-line {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) auto minmax(78px, auto) 36px;
      grid-template-areas: "info qty total remove";
      gap: 8px;
      align-items: center;
      padding: 10px;
      border: 1px solid var(--app-line);
      border-radius: 8px;
      background: #fafafa;
    }

    .ticket-item-info {
      grid-area: info;
      min-width: 0;
    }

    .ticket-line strong,
    .ticket-line span {
      display: block;
    }

    .ticket-line strong {
      line-height: 1.25;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .ticket-line span {
      color: var(--app-muted);
      font-size: 12px;
    }

    .qty-controls {
      grid-area: qty;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      border: 1px solid var(--app-line);
      border-radius: 999px;
      background: #fff;
      padding: 0 2px;
      white-space: nowrap;
    }

    .qty-controls ion-button {
      width: 30px;
      height: 30px;
      margin: 0;
      --padding-start: 4px;
      --padding-end: 4px;
    }

    .qty-input {
      width: 42px;
      min-height: 30px;
      text-align: center;
      --padding-start: 0;
      --padding-end: 0;
    }

    .ticket-item-total {
      grid-area: total;
      justify-self: end;
      white-space: nowrap;
      color: var(--app-blue);
    }

    .ticket-delete {
      grid-area: remove;
      justify-self: end;
      width: 34px;
      height: 34px;
      margin: 0;
      --padding-start: 4px;
      --padding-end: 4px;
    }

    .empty-ticket {
      padding: 28px 12px;
      text-align: center;
      border: 1px dashed var(--app-line);
      border-radius: 8px;
      color: var(--app-muted);
    }

    .empty-ticket strong,
    .empty-ticket span {
      display: block;
    }

    .totals {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      margin: 14px 0;
      padding-top: 12px;
      border-top: 1px solid var(--app-line);
    }

    .totals strong {
      font-size: 24px;
      color: var(--app-orange);
    }

    @media (max-width: 1000px) {
      .pos-grid {
        grid-template-columns: 1fr;
      }

      .ticket-panel {
        position: static;
      }
    }

    @media (max-width: 520px) {
      .ticket-line {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas:
          "info total"
          "qty remove";
      }

      .qty-controls {
        justify-self: start;
      }
    }
  `]
})
export class PosPage implements OnDestroy {
  productos = this.productosService.listar();
  combos: Combo[] = [];
  clientes = this.clientesService.listar();
  clienteId = this.clientes[0]?.id;
  tipoComprobante: 'BOLETA' | 'FACTURA' = 'BOLETA';
  carrito: TicketItem[] = [];
  mensaje = '';
  busqueda = '';
  fechaActual = new Date();
  procesandoCobro = false;
  online = navigator.onLine;
  ventasPendientes = 0;
  imagenesFallidas = new Set<string>();
  ventaParaImprimir?: Venta;
  modoImpresion: 'PRECUENTA' | 'COMPROBANTE' = 'PRECUENTA';
  private ticketSupabaseId?: string;
  private sincronizacionEnCurso = false;
  private sincronizacionPendiente = false;
  private pendientesSub?: Subscription;
  private readonly onOnline = () => {
    this.online = true;
    void this.sincronizarPendientes();
  };
  private readonly onOffline = () => {
    this.online = false;
  };

  constructor(
    private productosService: ProductosService,
    private combosService: CombosService,
    private clientesService: ClientesService,
    private ventasService: VentasService,
    private ticketsService: TicketsService,
    private supabaseService: SupabaseService,
    private supabaseTicketsService: SupabaseTicketsService,
    private impresionService: ImpresionService,
    private offlineQueue: OfflineQueueService,
    private posCalculator: PosCalculatorService,
    private posValidation: PosValidationService,
    private errorService: ErrorService
  ) {
    addIcons({ addOutline, removeOutline, trashOutline, printOutline, syncOutline, cloudDoneOutline, cloudOfflineOutline });
  }

  async ngOnInit(): Promise<void> {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    this.pendientesSub = this.offlineQueue.pendientes$.subscribe(count => this.ventasPendientes = count);
    await this.actualizarPendientes();

    try {
      this.productos = await this.productosService.listarRemoto();
      this.clientes = await this.clientesService.listarRemoto();
      this.clienteId = this.clientes[0]?.id;
    } catch (e) {
      this.mensaje = this.supabaseService.obtenerMensajeError(e, 'No se pudieron cargar datos desde Supabase.');
    }

    try {
      this.combos = await this.combosService.listarPos();
    } catch (e) {
      console.warn('No se pudieron cargar combos. Revisa si ejecutaste la migracion fase 3.', e);
      this.combos = [];
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    this.pendientesSub?.unsubscribe();
  }

  get productosFiltrados(): Producto[] {
    const texto = this.busqueda.trim().toLowerCase();
    return this.productos.filter(p => p.activo && (!texto || `${p.nombre} ${p.categoria}`.toLowerCase().includes(texto)));
  }

  get combosFiltrados(): Combo[] {
    const texto = this.busqueda.trim().toLowerCase();
    return this.combos.filter(combo =>
      combo.activo &&
      combo.stockDisponible > 0 &&
      (!texto || `${combo.nombre} ${combo.descripcion ?? ''}`.toLowerCase().includes(texto))
    );
  }

  get clienteSeleccionado(): Cliente | undefined {
    return this.clientes.find(c => c.id === this.clienteId);
  }

  get total(): number {
    return this.posCalculator.total(this.carrito);
  }

  get subtotal(): number {
    return this.posCalculator.subtotal(this.carrito);
  }

  get igv(): number {
    return this.posCalculator.igv(this.carrito);
  }

  get detallesImpresion(): TicketItem[] {
    return this.ventaParaImprimir?.detalles ?? this.carrito;
  }

  get comprobanteImpresion() {
    return this.ventaParaImprimir?.comprobante;
  }

  get tituloDocumentoImpresion(): string {
    if (this.modoImpresion === 'PRECUENTA') {
      return 'PRECUENTA';
    }

    const tipo = this.ventaParaImprimir?.tipoComprobante ?? this.tipoComprobante;
    return tipo === 'FACTURA' ? 'FACTURA' : 'BOLETA DE VENTA';
  }

  get fechaImpresion(): string | Date {
    return this.ventaParaImprimir?.fecha ?? this.fechaActual;
  }

  get clienteImpresion(): string {
    return this.ventaParaImprimir?.cliente?.nombreRazonSocial ?? this.clienteSeleccionado?.nombreRazonSocial ?? 'Cliente general';
  }

  get subtotalImpresion(): number {
    return this.ventaParaImprimir?.subtotal ?? this.subtotal;
  }

  get igvImpresion(): number {
    return this.ventaParaImprimir?.igv ?? this.igv;
  }

  get totalImpresion(): number {
    return this.ventaParaImprimir?.total ?? this.total;
  }

  async agregar(producto: Producto): Promise<void> {
    await this.actualizarTicket(() => this.ticketsService.agregarProducto(this.carrito, producto));
  }

  async agregarCombo(combo: Combo): Promise<void> {
    await this.actualizarTicket(() => this.ticketsService.agregarCombo(this.carrito, combo));
  }

  async aumentar(item: TicketItem): Promise<void> {
    if (item.tipo === 'COMBO') {
      const combo = this.combos.find(c => c.id === (item.comboId ?? item.producto.id));
      if (!combo) {
        this.mensaje = 'No se pudo encontrar el combo en el catalogo.';
        return;
      }

      await this.agregarCombo(combo);
      return;
    }

    await this.agregar(item.producto);
  }

  async disminuir(item: TicketItem): Promise<void> {
    await this.actualizarTicket(() => this.ticketsService.disminuirItem(this.carrito, item));
  }

  async editarCantidad(item: TicketItem, value: string | number | null | undefined): Promise<void> {
    const cantidad = Number(value ?? 0);
    await this.actualizarTicket(() => this.ticketsService.actualizarCantidad(this.carrito, item.producto, cantidad, item.tipo ?? 'PRODUCTO', item.comboId));
  }

  async eliminar(item: TicketItem): Promise<void> {
    this.carrito = this.ticketsService.eliminarTicketItem(this.carrito, item);
    this.solicitarSincronizacionTicket();
  }

  async limpiarTicket(): Promise<void> {
    this.carrito = [];
    this.solicitarSincronizacionTicket();
  }

  cantidadEnTicket(productoId: string): number {
    return this.carrito.find(item => item.tipo !== 'COMBO' && item.producto.id === productoId)?.cantidad ?? 0;
  }

  cantidadComboEnTicket(comboId: string): number {
    return this.carrito.find(item => item.tipo === 'COMBO' && (item.comboId ?? item.producto.id) === comboId)?.cantidad ?? 0;
  }

  itemTrack(item: TicketItem): string {
    return item.tipo === 'COMBO' ? `COMBO:${item.comboId ?? item.producto.id}` : `PRODUCTO:${item.producto.id}`;
  }

  resumenCombo(combo: Combo): string {
    return combo.componentes.slice(0, 2).map(item => `${item.cantidad} ${item.productoNombre}`).join(' + ') || 'Sin componentes';
  }

  async cobrar(): Promise<void> {
    if (this.procesandoCobro) {
      return;
    }

    this.procesandoCobro = true;

    try {
      this.ticketsService.validarAntesDeCobrar(this.carrito);
      this.validarClienteAntesDeCobrar();
      const total = this.total;
      const venta: Venta = {
        id: crypto.randomUUID(),
        cliente: this.clienteSeleccionado,
        detalles: this.carrito.map(item => ({
          ...item,
          producto: { ...item.producto }
        })),
        pagos: [{ metodo: 'EFECTIVO', monto: total }],
        tipoComprobante: this.tipoComprobante,
        subtotal: this.subtotal,
        igv: this.igv,
        total,
        fecha: new Date().toISOString()
      };

      const registrada = await this.ventasService.registrar(venta);
      await this.actualizarPendientes();
      try {
        await this.marcarTicketCobradoSupabase();
      } catch (e) {
        this.ventasService.ultimoErrorSincronizacion = this.supabaseService.obtenerMensajeError(e, 'No se pudo actualizar el ticket en Supabase.');
      }

      const mensajeResultado = this.ventasService.ultimoErrorSincronizacion
        ? `Venta registrada localmente. Supabase: ${this.ventasService.ultimoErrorSincronizacion}`
        : `${registrada.tipoComprobante} ${registrada.comprobante?.serie}-${registrada.comprobante?.numero} aceptada. Total S/ ${registrada.total.toFixed(2)}`;
      this.ventaParaImprimir = registrada;
      this.modoImpresion = 'COMPROBANTE';
      this.fechaActual = new Date(registrada.fecha);
      this.carrito = [];

      try {
        this.productos = await this.productosService.listarRemoto();
        this.combos = await this.combosService.listarPos();
      } catch (e) {
        console.warn('No se pudo refrescar el catálogo después de cobrar.', e);
      }

      this.imprimirAutomaticamente(mensajeResultado);
    } catch (e) {
      this.mensaje = this.supabaseService.obtenerMensajeError(e, 'No se pudo registrar la venta.');
      this.errorService.log('pos.cobrar', e);
    } finally {
      this.procesandoCobro = false;
    }
  }

  async sincronizarPendientes(): Promise<void> {
    if (!this.online) {
      this.mensaje = 'Sin conexion. Las ventas pendientes se sincronizaran cuando vuelva internet.';
      return;
    }

    try {
      const total = await this.ventasService.sincronizarPendientes();
      await this.actualizarPendientes();
      this.mensaje = total > 0 ? `${total} venta(s) sincronizada(s).` : 'No hay ventas pendientes por sincronizar.';
      this.productos = await this.productosService.listarRemoto();
      this.combos = await this.combosService.listarPos();
    } catch (e) {
      this.mensaje = this.supabaseService.obtenerMensajeError(e, 'No se pudieron sincronizar las ventas pendientes.');
    }
  }

  imprimirTicket(): void {
    this.ventaParaImprimir = undefined;
    this.modoImpresion = 'PRECUENTA';
    this.fechaActual = new Date();
    this.imprimirAutomaticamente();
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

  private async actualizarTicket(update: () => TicketItem[]): Promise<void> {
    try {
      this.carrito = update();
      this.solicitarSincronizacionTicket();
    } catch (e) {
      this.mensaje = this.supabaseService.obtenerMensajeError(e, 'No se pudo actualizar el ticket.');
    }
  }

  private solicitarSincronizacionTicket(): void {
    void this.sincronizarTicketEnSegundoPlano();
  }

  private validarClienteAntesDeCobrar(): void {
    const ventasSinCliente = localStorage.getItem('cfg_ventas_sin_cliente') !== 'false';
    const cliente = this.clienteSeleccionado;
    const documento = this.soloDigitos(cliente?.numeroDocumento ?? '');

    if (!ventasSinCliente && (!cliente || cliente.tipoDocumento === 'SIN_DOCUMENTO')) {
      throw new Error('Selecciona un cliente antes de cobrar. La venta sin cliente está desactivada en Configuración.');
    }

    if (this.tipoComprobante === 'BOLETA' && this.total > 700) {
      if (!cliente || cliente.tipoDocumento !== 'DNI' || documento.length !== 8) {
        throw new Error('Para boletas mayores a S/ 700 selecciona un cliente con DNI valido de 8 digitos.');
      }
    }

    if (this.tipoComprobante === 'FACTURA') {
      if (!cliente || cliente.tipoDocumento !== 'RUC' || documento.length !== 11) {
        throw new Error('Para emitir factura selecciona un cliente con RUC valido de 11 digitos.');
      }

      if (!cliente.nombreRazonSocial.trim()) {
        throw new Error('Para emitir factura el cliente debe tener razon social.');
      }

      if (!cliente.direccion?.trim()) {
        throw new Error('Para emitir factura el cliente debe tener direccion fiscal.');
      }
    }
  }

  private soloDigitos(value: string): string {
    return value.replace(/\D/g, '');
  }

  private async actualizarPendientes(): Promise<void> {
    await this.offlineQueue.refrescarConteo();
    this.ventasPendientes = await this.offlineQueue.contarPendientes();
  }

  private imprimirAutomaticamente(mensajeDespues?: string): void {
    setTimeout(async () => {
      try {
        if (this.modoImpresion === 'COMPROBANTE' && this.ventaParaImprimir) {
          await this.impresionService.imprimirVenta(this.ventaParaImprimir);
        } else {
          await this.impresionService.imprimirPrecuenta({
            cliente: this.clienteImpresion,
            detalles: this.detallesImpresion,
            subtotal: this.subtotalImpresion,
            igv: this.igvImpresion,
            total: this.totalImpresion
          });
        }

        if (mensajeDespues) {
          this.mensaje = mensajeDespues;
        }
      } catch (e) {
        const errorImpresion = this.supabaseService.obtenerMensajeError(e, 'No se pudo imprimir el ticket.');
        this.mensaje = mensajeDespues ? `${mensajeDespues} Impresión: ${errorImpresion}` : errorImpresion;
      }
    }, 150);
  }

  private async sincronizarTicketEnSegundoPlano(): Promise<void> {
    if (!this.supabaseService.isConfigured) {
      return;
    }

    if (this.sincronizacionEnCurso) {
      this.sincronizacionPendiente = true;
      return;
    }

    this.sincronizacionEnCurso = true;

    try {
      do {
        this.sincronizacionPendiente = false;
        await this.sincronizarTicketSupabase();
      } while (this.sincronizacionPendiente);
    } catch (e) {
      console.warn('No se pudo sincronizar el ticket con Supabase.', e);
    } finally {
      this.sincronizacionEnCurso = false;
    }
  }

  private async sincronizarTicketSupabase(): Promise<void> {
    if (!this.supabaseService.isConfigured) {
      return;
    }

    if (this.carrito.length === 0) {
      await this.eliminarTicketSupabase();
      return;
    }

    const ticket = this.construirTicketSupabase('ABIERTO');

    if (!this.ticketSupabaseId) {
      const creado = await this.supabaseTicketsService.crear(ticket);
      this.ticketSupabaseId = creado.id;
      return;
    }

    await this.supabaseTicketsService.actualizar(this.ticketSupabaseId, ticket, ticket.ticket_items);
  }

  private async eliminarTicketSupabase(): Promise<void> {
    if (!this.supabaseService.isConfigured || !this.ticketSupabaseId) {
      return;
    }

    await this.supabaseTicketsService.eliminar(this.ticketSupabaseId);
    this.ticketSupabaseId = undefined;
  }

  private async marcarTicketCobradoSupabase(): Promise<void> {
    if (!this.supabaseService.isConfigured || !this.ticketSupabaseId) {
      return;
    }

    const ticket = this.construirTicketSupabase('COBRADO');
    await this.supabaseTicketsService.actualizar(this.ticketSupabaseId, ticket, ticket.ticket_items);
    this.ticketSupabaseId = undefined;
  }

  private construirTicketSupabase(status: 'ABIERTO' | 'COBRADO' | 'CANCELADO') {
    return {
      cliente_id: null,
      title: `Ticket ${new Date().toLocaleTimeString()}`,
      description: `Comprobante: ${this.tipoComprobante}`,
      status,
      subtotal: this.subtotal,
      igv: this.igv,
      total: this.total,
      ticket_items: this.carrito.map(item => this.mapearItemSupabase(item))
    };
  }

  private mapearItemSupabase(item: TicketItem): SupabaseTicketItem {
    return {
      producto_id: null,
      producto_local_id: item.tipo === 'COMBO' ? `combo:${item.comboId ?? item.producto.id}` : `producto:${item.producto.id}`,
      nombre: item.producto.nombre,
      description: item.tipo === 'COMBO' ? 'Combo' : item.producto.categoria,
      quantity: item.cantidad,
      price: item.precioUnitario,
      total: item.total
    };
  }
}
