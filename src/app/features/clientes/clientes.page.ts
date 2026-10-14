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
  IonText
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { createOutline, peopleOutline, trashOutline } from 'ionicons/icons';
import { ClientesService } from '../../core/services/clientes.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Cliente } from '../../models/cliente.model';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [FormsModule, IonContent, IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonButton, IonSelect, IonSelectOption, IonText, IonSearchbar, IonIcon],
  template: `
    <ion-content>
      <section class="page-shell">
        <div class="page-title">
          <div>
            <h1>Clientes</h1>
            <p>Registro, edición y consulta rápida de clientes.</p>
          </div>
          <span class="badge blue">{{ clientesFiltrados.length }} clientes</span>
        </div>

        <div class="grid-2">
          <ion-card class="form-card">
            <ion-card-content>
              <div class="panel-title">
                <div>
                  <h2>{{ editando ? 'Editar cliente' : 'Nuevo cliente' }}</h2>
                  <span class="muted">Datos fiscales y de contacto.</span>
                </div>
                <div class="round-icon"><ion-icon name="people-outline"></ion-icon></div>
              </div>

              <ion-item>
                <ion-label>Tipo</ion-label>
                <ion-select [(ngModel)]="form.tipoDocumento">
                  <ion-select-option value="DNI">DNI</ion-select-option>
                  <ion-select-option value="RUC">RUC</ion-select-option>
                  <ion-select-option value="SIN_DOCUMENTO">Sin documento</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item><ion-label position="stacked">Número</ion-label><ion-input [(ngModel)]="form.numeroDocumento" /></ion-item>
              <ion-item><ion-label position="stacked">Nombre / Razón social</ion-label><ion-input [(ngModel)]="form.nombreRazonSocial" /></ion-item>
              <ion-item><ion-label position="stacked">Dirección</ion-label><ion-input [(ngModel)]="form.direccion" /></ion-item>
              <div class="form-grid">
                <ion-item><ion-label position="stacked">Teléfono</ion-label><ion-input [(ngModel)]="form.telefono" /></ion-item>
                <ion-item><ion-label position="stacked">Correo</ion-label><ion-input [(ngModel)]="form.correo" type="email" /></ion-item>
              </div>

              <div class="action-row">
                <ion-button [disabled]="guardando" (click)="guardar()">{{ guardando ? 'Guardando...' : (editando ? 'Actualizar cliente' : 'Guardar cliente') }}</ion-button>
                <ion-button fill="outline" color="medium" (click)="cancelarEdicion()">Limpiar</ion-button>
              </div>

              @if (mensaje) { <ion-text color="success"><p>{{ mensaje }}</p></ion-text> }
              @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }
            </ion-card-content>
          </ion-card>

          <div>
            <ion-searchbar [(ngModel)]="busqueda" placeholder="Buscar por nombre, documento o correo"></ion-searchbar>
            <div class="list-grid">
              @for (c of clientesFiltrados; track c.id) {
                <ion-card class="client-card">
                  <ion-card-content>
                    <div class="client-top">
                      <div class="client-avatar">{{ iniciales(c.nombreRazonSocial) }}</div>
                      <div>
                        <strong>{{ c.nombreRazonSocial }}</strong>
                        <span class="muted">{{ c.tipoDocumento }}: {{ c.numeroDocumento }}</span>
                      </div>
                    </div>
                    <p class="muted">{{ c.direccion || 'Sin dirección' }}</p>
                    <p class="muted">{{ c.telefono || 'Sin teléfono' }} - {{ c.correo || 'Sin correo' }}</p>
                    <div class="action-row">
                      <ion-button size="small" fill="outline" (click)="editar(c)"><ion-icon name="create-outline" slot="start"></ion-icon>Editar</ion-button>
                      <ion-button size="small" color="danger" fill="clear" (click)="eliminar(c)"><ion-icon name="trash-outline" slot="start"></ion-icon>Eliminar</ion-button>
                    </div>
                  </ion-card-content>
                </ion-card>
              } @empty {
                <ion-card class="panel"><ion-card-content><p class="muted">No hay clientes con ese filtro.</p></ion-card-content></ion-card>
              }
            </div>
          </div>
        </div>
      </section>
    </ion-content>
  `,
  styles: [`
    .client-card {
      margin: 0;
    }

    .client-top {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 10px;
    }

    .client-avatar {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      color: #fff;
      background: linear-gradient(135deg, var(--app-blue), var(--app-green));
      font-weight: 900;
    }

    .client-top strong,
    .client-top span {
      display: block;
    }
  `]
})
export class ClientesPage {
  clientes = this.clientesService.listar();
  form: Cliente = this.nuevo();
  guardando = false;
  editando = false;
  mensaje = '';
  error = '';
  busqueda = '';

  constructor(private clientesService: ClientesService, private supabaseService: SupabaseService) {
    addIcons({ peopleOutline, createOutline, trashOutline });
  }

  get clientesFiltrados(): Cliente[] {
    const texto = this.busqueda.trim().toLowerCase();
    return this.clientes.filter(cliente =>
      !texto || `${cliente.nombreRazonSocial} ${cliente.numeroDocumento} ${cliente.correo ?? ''}`.toLowerCase().includes(texto)
    );
  }

  async ngOnInit(): Promise<void> {
    try {
      this.clientes = await this.clientesService.listarRemoto();
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudieron cargar los clientes desde Supabase.');
    }
  }

  nuevo(): Cliente {
    return { id: '', tipoDocumento: 'DNI', numeroDocumento: '', nombreRazonSocial: '' };
  }

  editar(cliente: Cliente): void {
    this.form = { ...cliente };
    this.editando = true;
  }

  cancelarEdicion(): void {
    this.form = this.nuevo();
    this.editando = false;
  }

  async guardar(): Promise<void> {
    try {
      this.guardando = true;
      this.mensaje = '';
      this.error = '';

      if (!this.form.nombreRazonSocial.trim()) {
        throw new Error('Ingresa el nombre o razón social.');
      }

      if (!this.form.numeroDocumento.trim()) {
        throw new Error('Ingresa el número de documento.');
      }

      await this.clientesService.guardar(this.form);
      this.clientes = await this.clientesService.listarRemoto();
      this.cancelarEdicion();
      this.mensaje = 'Cliente guardado.';
    } catch (e) {
      this.clientes = this.clientesService.listar();
      this.mensaje = 'Cliente guardado localmente.';
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo guardar el cliente.');
    } finally {
      this.guardando = false;
    }
  }

  async eliminar(cliente: Cliente): Promise<void> {
    try {
      await this.clientesService.eliminar(cliente);
      this.clientes = this.clientesService.listar();
      this.mensaje = 'Cliente eliminado.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo eliminar el cliente.');
    }
  }

  iniciales(nombre: string): string {
    return nombre
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || 'CL';
  }
}
