import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCard, IonCardContent, IonContent, IonIcon, IonInput, IonItem, IonLabel, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonText, IonToggle } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { businessOutline, peopleOutline, printOutline, settingsOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { EmpresaConfig, EmpresaService } from '../../core/services/empresa.service';
import { BluetoothPrinterDevice, ImpresionService } from '../../core/services/impresion.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { UsuarioEmpresa, UsuariosService } from '../../core/services/usuarios.service';
import { AppRole } from '../../models/roles.model';

interface UsuarioLocal {
  id: string;
  nombre: string;
  correo: string;
  rol: AppRole;
  activo: boolean;
}

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [FormsModule, IonContent, IonCard, IonCardContent, IonItem, IonLabel, IonInput, IonButton, IonSelect, IonSelectOption, IonText, IonSegment, IonSegmentButton, IonIcon, IonToggle],
  template: `
    <ion-content>
      <section class="page-shell">
        <div class="page-title">
          <div><h1>Configuración</h1><p>Empresa, impresión, usuarios y preferencias del sistema.</p></div>
          <img class="brand-logo small" src="assets/mariva-logo.svg" alt="Mariva">
        </div>

        <ion-segment [(ngModel)]="seccion" class="settings-tabs">
          <ion-segment-button value="EMPRESA"><ion-icon name="business-outline"></ion-icon><ion-label>Empresa</ion-label></ion-segment-button>
          <ion-segment-button value="IMPRESORA"><ion-icon name="print-outline"></ion-icon><ion-label>Impresora</ion-label></ion-segment-button>
          <ion-segment-button value="USUARIOS"><ion-icon name="people-outline"></ion-icon><ion-label>Usuarios</ion-label></ion-segment-button>
          <ion-segment-button value="PREFERENCIAS"><ion-icon name="settings-outline"></ion-icon><ion-label>Preferencias</ion-label></ion-segment-button>
        </ion-segment>

        @if (mensaje) { <ion-text color="success"><p>{{ mensaje }}</p></ion-text> }
        @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }

        @if (seccion === 'EMPRESA') {
          <ion-card class="form-card">
            <ion-card-content>
              <div class="panel-title">
                <div><h2>Datos de empresa</h2><span class="muted">Se usarán en tickets y comprobantes.</span></div>
                <div class="round-icon"><ion-icon name="business-outline"></ion-icon></div>
              </div>
              <div class="form-grid">
                <ion-item><ion-label position="stacked">RUC / DNI</ion-label><ion-input [(ngModel)]="empresa.ruc" /></ion-item>
                <ion-item><ion-label position="stacked">Razón social</ion-label><ion-input [(ngModel)]="empresa.razonSocial" /></ion-item>
                <ion-item><ion-label position="stacked">Nombre comercial</ion-label><ion-input [(ngModel)]="empresa.nombreComercial" /></ion-item>
                <ion-item><ion-label position="stacked">Dirección</ion-label><ion-input [(ngModel)]="empresa.direccion" /></ion-item>
                <ion-item><ion-label position="stacked">Teléfono</ion-label><ion-input [(ngModel)]="empresa.telefono" /></ion-item>
                <ion-item><ion-label position="stacked">Correo</ion-label><ion-input [(ngModel)]="empresa.correo" type="email" /></ion-item>
                <ion-item><ion-label position="stacked">Logo URL</ion-label><ion-input [(ngModel)]="empresa.logoUrl" placeholder="assets/mariva-logo.svg" /></ion-item>
              </div>
              <ion-button [disabled]="guardando" (click)="guardarEmpresa()">{{ guardando ? 'Guardando...' : 'Guardar empresa' }}</ion-button>
            </ion-card-content>
          </ion-card>
        }

        @if (seccion === 'IMPRESORA') {
          <ion-card class="form-card printer-card">
            <ion-card-content>
              <div class="panel-title">
                <div><h2>Editar impresora</h2><span class="muted">Parámetros para recibos y cuentas.</span></div>
                <div class="round-icon"><ion-icon name="print-outline"></ion-icon></div>
              </div>
              <div class="form-grid">
                <ion-item><ion-label position="stacked">Nombre</ion-label><ion-input [(ngModel)]="impresoraNombre" /></ion-item>
                <ion-item><ion-label>Modelo</ion-label><ion-select [(ngModel)]="impresoraModelo"><ion-select-option value="XPrinter">XPrinter</ion-select-option><ion-select-option value="Otro modelo">Otro modelo</ion-select-option></ion-select></ion-item>
                <ion-item><ion-label>Interfaz</ion-label><ion-select [(ngModel)]="tipoImpresora"><ion-select-option value="BLUETOOTH">Bluetooth</ion-select-option><ion-select-option value="WIFI">WiFi</ion-select-option><ion-select-option value="ETHERNET">Ethernet</ion-select-option></ion-select></ion-item>
                @if (tipoImpresora === 'BLUETOOTH') {
                  <ion-item>
                    <ion-label>Emparejada</ion-label>
                    <ion-select [(ngModel)]="impresoraBluetoothAddress" (ionChange)="seleccionarImpresoraBluetooth()">
                      @for (impresora of impresorasBluetooth; track impresora.address) {
                        <ion-select-option [value]="impresora.address">{{ impresora.name }} - {{ impresora.address }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-item>
                  <ion-item><ion-label position="stacked">MAC Bluetooth</ion-label><ion-input [(ngModel)]="impresoraBluetoothAddress" placeholder="00:11:22:33:44:55" /></ion-item>
                  <ion-button fill="outline" [disabled]="buscandoBluetooth" (click)="buscarImpresorasBluetooth()">{{ buscandoBluetooth ? 'Buscando...' : 'Buscar emparejadas' }}</ion-button>
                }
                <ion-item><ion-label position="stacked">Dirección IP</ion-label><ion-input [(ngModel)]="impresoraIp" /></ion-item>
                <ion-item><ion-label position="stacked">Puerto</ion-label><ion-input [(ngModel)]="impresoraPuerto" type="number" /></ion-item>
                <ion-item><ion-label>Ancho de papel</ion-label><ion-select [(ngModel)]="papel"><ion-select-option value="58mm">58 mm</ion-select-option><ion-select-option value="80mm">80 mm</ion-select-option></ion-select></ion-item>
              </div>
              <ion-item><ion-label>Imprimir recibos y cuentas</ion-label><ion-toggle [(ngModel)]="imprimirRecibos"></ion-toggle></ion-item>
              <ion-item><ion-label>Imprimir automáticamente</ion-label><ion-toggle [(ngModel)]="imprimirAutomatico"></ion-toggle></ion-item>
              <div class="action-row">
                <ion-button (click)="guardarImpresora()">Guardar impresora</ion-button>
                <ion-button fill="outline" (click)="impresionPrueba()"><ion-icon name="print-outline" slot="start"></ion-icon>Impresión de prueba</ion-button>
              </div>
            </ion-card-content>
          </ion-card>
        }

        @if (seccion === 'USUARIOS') {
          <div class="grid-2">
            <ion-card class="form-card">
              <ion-card-content>
                <div class="panel-title">
                  <div>
                    <h2>{{ usuarioEditandoId ? 'Editar usuario' : 'Nuevo usuario' }}</h2>
                    <span class="muted">{{ usuarioEditandoId ? 'Actualiza nombre, rol y estado.' : 'Crea una cuenta real para ingresar al sistema.' }}</span>
                  </div>
                </div>
                <ion-item><ion-label position="stacked">Nombre</ion-label><ion-input [(ngModel)]="usuarioForm.nombre" /></ion-item>
                <ion-item><ion-label position="stacked">Correo / usuario</ion-label><ion-input [(ngModel)]="usuarioForm.correo" type="email" [disabled]="!!usuarioEditandoId" /></ion-item>
                @if (!usuarioEditandoId) {
                  <ion-item><ion-label position="stacked">Contrasena inicial</ion-label><ion-input [(ngModel)]="passwordTemporal" type="password" /></ion-item>
                }
                <ion-item>
                  <ion-label>Rol</ion-label>
                  <ion-select [(ngModel)]="usuarioForm.rol">
                    <ion-select-option value="ADMIN">Administrador</ion-select-option>
                    <ion-select-option value="CAJERO">Cajero</ion-select-option>
                    <ion-select-option value="VENDEDOR">Vendedor</ion-select-option>
                  </ion-select>
                </ion-item>
                @if (usuarioEditandoId) {
                  <ion-item><ion-label>Usuario activo</ion-label><ion-toggle [(ngModel)]="usuarioForm.activo"></ion-toggle></ion-item>
                }
                <div class="action-row">
                  <ion-button [disabled]="guardandoUsuario" (click)="guardarUsuario()">{{ guardandoUsuario ? 'Guardando...' : (usuarioEditandoId ? 'Guardar cambios' : 'Registrar usuario') }}</ion-button>
                  @if (usuarioEditandoId) {
                    <ion-button fill="outline" (click)="cancelarEdicionUsuario()">Cancelar</ion-button>
                  }
                </div>
                <p class="muted">Usa Supabase Auth mediante Edge Function para que el usuario pueda iniciar sesión.</p>
              </ion-card-content>
            </ion-card>

            <ion-card class="panel">
              <ion-card-content>
                <div class="panel-title">
                  <div><h2>Usuarios</h2><span class="muted">{{ cargandoUsuarios ? 'Cargando...' : usuarios.length + ' registrados' }}</span></div>
                  <ion-button fill="clear" size="small" (click)="cargarUsuarios()">Actualizar</ion-button>
                </div>
                @for (usuario of usuarios; track usuario.id) {
                  <div class="user-row">
                    <div><strong>{{ usuario.nombre }}</strong><span>{{ usuario.correo }} · {{ usuario.rol }}</span></div>
                    <div class="user-actions">
                      <span [class]="usuario.activo ? 'badge green' : 'badge red'">{{ usuario.activo ? 'Activo' : 'Inactivo' }}</span>
                      <ion-button fill="clear" size="small" (click)="editarUsuario(usuario)">Editar</ion-button>
                      <ion-button fill="clear" size="small" (click)="cambiarEstadoUsuario(usuario)">{{ usuario.activo ? 'Desactivar' : 'Activar' }}</ion-button>
                      <ion-button fill="clear" size="small" (click)="resetearPassword(usuario)">Reset pass</ion-button>
                    </div>
                  </div>
                } @empty {
                  <p class="muted">No hay usuarios registrados.</p>
                }
              </ion-card-content>
            </ion-card>
          </div>
        }

        @if (seccion === 'PREFERENCIAS') {
          <ion-card class="form-card">
            <ion-card-content>
              <div class="panel-title">
                <div><h2>Preferencias del sistema</h2><span class="muted">Ajustes operativos generales.</span></div>
                <div class="round-icon"><ion-icon name="shield-checkmark-outline"></ion-icon></div>
              </div>
              <ion-item><ion-label>Alertar stock bajo</ion-label><ion-toggle [(ngModel)]="alertarStock"></ion-toggle></ion-item>
              <ion-item><ion-label>Permitir ventas sin cliente</ion-label><ion-toggle [(ngModel)]="ventasSinCliente"></ion-toggle></ion-item>
              <ion-button (click)="guardarPreferencias()">Guardar preferencias</ion-button>
            </ion-card-content>
          </ion-card>
        }
      </section>
    </ion-content>
  `,
  styles: [`
    .settings-tabs {
      margin-bottom: 16px;
      border-radius: 8px;
      background: #fff;
      box-shadow: var(--app-shadow);
    }

    .printer-card {
      color: #fff;
      background: #303030;
      border-color: #454545;
    }

    .printer-card ion-item {
      --color: #fff;
      --background: transparent;
      --border-color: #666;
    }

    .user-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--app-line);
    }

    .user-row strong,
    .user-row span {
      display: block;
    }

    .user-row div span {
      color: var(--app-muted);
      font-size: 12px;
    }

    .user-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 4px;
    }

    @media (max-width: 720px) {
      .user-row {
        align-items: flex-start;
        flex-direction: column;
      }

      .user-actions {
        justify-content: flex-start;
      }
    }
  `]
})
export class ConfiguracionPage {
  seccion: 'EMPRESA' | 'IMPRESORA' | 'USUARIOS' | 'PREFERENCIAS' = 'EMPRESA';
  empresa: EmpresaConfig = this.empresaService.obtenerLocal();
  tipoImpresora = localStorage.getItem('cfg_impresora') || 'ETHERNET';
  papel = localStorage.getItem('cfg_papel') || '80mm';
  impresoraNombre = localStorage.getItem('cfg_impresora_nombre') || 'Loys';
  impresoraModelo = localStorage.getItem('cfg_impresora_modelo') || 'Otro modelo';
  impresoraIp = localStorage.getItem('cfg_impresora_ip') || '192.168.0.114';
  impresoraPuerto = Number(localStorage.getItem('cfg_impresora_puerto') || 9100);
  impresoraBluetoothAddress = localStorage.getItem('cfg_impresora_bluetooth_address') || '';
  impresoraBluetoothName = localStorage.getItem('cfg_impresora_bluetooth_name') || '';
  impresorasBluetooth: BluetoothPrinterDevice[] = [];
  buscandoBluetooth = false;
  imprimirRecibos = localStorage.getItem('cfg_imprimir_recibos') !== 'false';
  imprimirAutomatico = localStorage.getItem('cfg_imprimir_auto') !== 'false';
  alertarStock = localStorage.getItem('cfg_alertar_stock') !== 'false';
  ventasSinCliente = localStorage.getItem('cfg_ventas_sin_cliente') !== 'false';
  usuarioForm: UsuarioLocal = { id: '', nombre: '', correo: '', rol: 'VENDEDOR', activo: true };
  usuarioEditandoId = '';
  passwordTemporal = '';
  usuarios: UsuarioLocal[] = JSON.parse(localStorage.getItem('cfg_usuarios') || '[]');
  guardando = false;
  guardandoUsuario = false;
  cargandoUsuarios = false;
  mensaje = '';
  error = '';

  constructor(
    private empresaService: EmpresaService,
    private supabaseService: SupabaseService,
    private usuariosService: UsuariosService,
    private impresionService: ImpresionService
  ) {
    addIcons({ businessOutline, printOutline, peopleOutline, settingsOutline, shieldCheckmarkOutline });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.empresa = await this.empresaService.obtener();
    } catch {
      this.empresa = this.empresaService.obtenerLocal();
    }

    await this.cargarUsuarios();
  }

  async guardarEmpresa(): Promise<void> {
    try {
      this.guardando = true;
      this.mensaje = '';
      this.error = '';
      this.empresa = await this.empresaService.guardar(this.empresa);
      this.mensaje = 'Empresa guardada y asociada a tu usuario.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo guardar la empresa.');
    } finally {
      this.guardando = false;
    }
  }

  guardarImpresora(): void {
    localStorage.setItem('cfg_impresora', this.tipoImpresora);
    localStorage.setItem('cfg_papel', this.papel);
    localStorage.setItem('cfg_impresora_nombre', this.impresoraNombre);
    localStorage.setItem('cfg_impresora_modelo', this.impresoraModelo);
    localStorage.setItem('cfg_impresora_ip', this.impresoraIp);
    localStorage.setItem('cfg_impresora_puerto', String(Number(this.impresoraPuerto) || 9100));
    localStorage.setItem('cfg_impresora_bluetooth_address', this.impresoraBluetoothAddress);
    localStorage.setItem('cfg_impresora_bluetooth_name', this.impresoraBluetoothName);
    localStorage.setItem('cfg_imprimir_recibos', String(this.imprimirRecibos));
    localStorage.setItem('cfg_imprimir_auto', String(this.imprimirAutomatico));
    this.mensaje = 'Configuración de impresora guardada.';
  }

  async buscarImpresorasBluetooth(): Promise<void> {
    try {
      this.buscandoBluetooth = true;
      this.error = '';
      this.mensaje = '';
      this.impresorasBluetooth = await this.impresionService.listarImpresorasBluetooth();

      if (this.impresorasBluetooth.length === 0) {
        this.error = 'No hay impresoras Bluetooth emparejadas. Empareja la Xprinter desde Ajustes de Android.';
        return;
      }

      if (!this.impresoraBluetoothAddress) {
        this.impresoraBluetoothAddress = this.impresorasBluetooth[0].address;
        this.seleccionarImpresoraBluetooth();
      }

      this.mensaje = `${this.impresorasBluetooth.length} impresora(s) emparejada(s) encontrada(s).`;
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudieron buscar impresoras Bluetooth.');
    } finally {
      this.buscandoBluetooth = false;
    }
  }

  seleccionarImpresoraBluetooth(): void {
    const seleccionada = this.impresorasBluetooth.find(item => item.address === this.impresoraBluetoothAddress);

    if (seleccionada) {
      this.impresoraBluetoothName = seleccionada.name;
      this.impresoraNombre = seleccionada.name;
    }
  }

  async impresionPrueba(): Promise<void> {
    try {
      this.guardarImpresora();
      await this.impresionService.imprimirPrueba();
      this.mensaje = 'Impresión de prueba enviada.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo imprimir la prueba.');
    }
  }

  async guardarUsuario(): Promise<void> {
    try {
      this.guardandoUsuario = true;
      this.mensaje = '';
      this.error = '';

      const usuario = this.usuarioEditandoId
        ? await this.usuariosService.actualizarUsuario({
          id: this.usuarioEditandoId,
          nombre: this.usuarioForm.nombre,
          rol: this.usuarioForm.rol,
          activo: this.usuarioForm.activo
        })
        : await this.usuariosService.crearUsuario({
          nombre: this.usuarioForm.nombre,
          correo: this.usuarioForm.correo,
          password: this.passwordTemporal,
          rol: this.usuarioForm.rol
        });

      const estabaEditando = !!this.usuarioEditandoId;
      this.reemplazarUsuario(usuario);
      this.limpiarUsuarioForm();
      this.mensaje = estabaEditando
        ? 'Usuario actualizado.'
        : 'Usuario creado. Ya puede ingresar con su correo y contrasena inicial.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo guardar el usuario.');
    } finally {
      this.guardandoUsuario = false;
    }
  }

  async cargarUsuarios(): Promise<void> {
    try {
      this.cargandoUsuarios = true;
      this.error = '';
      const usuarios = await this.usuariosService.listarUsuarios();
      this.usuarios = usuarios;
      localStorage.setItem('cfg_usuarios', JSON.stringify(this.usuarios));
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudieron cargar usuarios.');
    } finally {
      this.cargandoUsuarios = false;
    }
  }

  editarUsuario(usuario: UsuarioLocal): void {
    this.usuarioEditandoId = usuario.id;
    this.usuarioForm = { ...usuario };
    this.passwordTemporal = '';
    this.mensaje = '';
    this.error = '';
  }

  cancelarEdicionUsuario(): void {
    this.limpiarUsuarioForm();
  }

  async cambiarEstadoUsuario(usuario: UsuarioLocal): Promise<void> {
    const accion = usuario.activo ? 'desactivar' : 'activar';
    const confirmar = window.confirm(`Deseas ${accion} a ${usuario.nombre}?`);

    if (!confirmar) {
      return;
    }

    try {
      this.mensaje = '';
      this.error = '';
      const actualizado = await this.usuariosService.actualizarUsuario({
        id: usuario.id,
        nombre: usuario.nombre,
        rol: usuario.rol,
        activo: !usuario.activo
      });
      this.reemplazarUsuario(actualizado);
      this.mensaje = usuario.activo ? 'Usuario desactivado.' : 'Usuario activado.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo cambiar el estado del usuario.');
    }
  }

  async resetearPassword(usuario: UsuarioLocal): Promise<void> {
    const password = window.prompt(`Nueva contrasena para ${usuario.nombre}`);

    if (password === null) {
      return;
    }

    try {
      this.mensaje = '';
      this.error = '';
      await this.usuariosService.resetearPassword(usuario.id, password);
      this.mensaje = 'Contrasena actualizada. El usuario ya puede ingresar con la nueva clave.';
    } catch (e) {
      this.error = this.supabaseService.obtenerMensajeError(e, 'No se pudo resetear la contrasena.');
    }
  }

  private reemplazarUsuario(usuario: UsuarioEmpresa): void {
    this.usuarios = [usuario, ...this.usuarios.filter(item => item.id !== usuario.id)];
    localStorage.setItem('cfg_usuarios', JSON.stringify(this.usuarios));
  }

  private limpiarUsuarioForm(): void {
    this.usuarioForm = { id: '', nombre: '', correo: '', rol: 'VENDEDOR', activo: true };
    this.usuarioEditandoId = '';
    this.passwordTemporal = '';
  }

  guardarPreferencias(): void {
    localStorage.setItem('cfg_alertar_stock', String(this.alertarStock));
    localStorage.setItem('cfg_ventas_sin_cliente', String(this.ventasSinCliente));
    this.mensaje = 'Preferencias guardadas.';
  }
}
