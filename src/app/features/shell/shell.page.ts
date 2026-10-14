import { Component } from '@angular/core';
import { NgFor } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuButton,
  IonMenuToggle,
  IonRouterOutlet,
  IonSplitPane,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  barChartOutline,
  cartOutline,
  cashOutline,
  cubeOutline,
  layersOutline,
  logOutOutline,
  peopleOutline,
  receiptOutline,
  settingsOutline
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { AppRole, ROLES_ADMIN, ROLES_CAJA, ROLES_VENTA } from '../../models/roles.model';

interface MenuItem {
  label: string;
  path: string;
  icon: string;
  roles?: AppRole[];
  allowWithoutCompany?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    NgFor,
    RouterLink,
    RouterLinkActive,
    IonSplitPane,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonLabel,
    IonRouterOutlet,
    IonMenuToggle
  ],
  template: `
    <ion-split-pane contentId="main">
      <ion-menu contentId="main" class="app-menu">
        <ion-content>
          <div class="menu-brand">
            <img src="assets/mariva-logo.svg" alt="Distribuidora Mariva">
            <div>
              <strong>Distribuidora Mariva</strong>
              <span>Gaseosas y Golosinas</span>
            </div>
          </div>

          <ion-list class="menu-list">
            <ion-menu-toggle auto-hide="true" *ngFor="let item of menuVisible">
              <ion-item button [routerLink]="item.path" routerLinkActive="active" lines="none">
                <ion-icon slot="start" [name]="item.icon"></ion-icon>
                <ion-label>{{ item.label }}</ion-label>
              </ion-item>
            </ion-menu-toggle>
          </ion-list>

          <div class="menu-footer">
            <ion-item button lines="none" (click)="logout()">
              <ion-icon slot="start" name="log-out-outline"></ion-icon>
              <ion-label>Cerrar sesión</ion-label>
            </ion-item>
            <small>POS Mariva · v1.0</small>
          </div>
        </ion-content>
      </ion-menu>

      <div class="ion-page" id="main">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
            <ion-title>Distribuidora Mariva</ion-title>
            <div class="toolbar-brand" slot="end">
              <img class="brand-logo small" src="assets/mariva-logo.svg" alt="Mariva">
            </div>
          </ion-toolbar>
        </ion-header>
        <ion-router-outlet></ion-router-outlet>
      </div>
    </ion-split-pane>
  `,
  styles: [`
    ion-split-pane {
      --side-width: 284px;
      --side-max-width: 284px;
      --border: 0;
    }

    .app-menu {
      --width: 284px;
    }

    .app-menu ion-content {
      --background: linear-gradient(180deg, #242424, #3b281f 58%, #1f1f1f);
      color: #fff;
    }

    .menu-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 24px 18px 18px;
      border-bottom: 1px solid rgba(255,255,255,.12);
    }

    .menu-brand img {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: #fff;
    }

    .menu-brand strong,
    .menu-brand span {
      display: block;
    }

    .menu-brand strong {
      font-size: 16px;
      font-weight: 900;
    }

    .menu-brand span {
      color: rgba(255,255,255,.66);
      font-size: 12px;
    }

    .menu-list {
      padding: 14px 10px;
      background: transparent;
    }

    ion-item {
      --background: transparent;
      --color: rgba(255,255,255,.86);
      --border-radius: 8px;
      --padding-start: 14px;
      min-height: 48px;
      margin: 5px 0;
      font-weight: 760;
    }

    ion-item ion-icon {
      color: rgba(255,255,255,.8);
      font-size: 21px;
      margin-right: 8px;
    }

    ion-item.active,
    ion-item:hover {
      --background: linear-gradient(135deg, #f97316, #2f9e44);
      --color: #fff;
      box-shadow: 0 14px 26px rgba(0,0,0,.22);
    }

    .menu-footer {
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: 16px;
    }

    .menu-footer ion-item {
      --background: rgba(255,255,255,.08);
    }

    .menu-footer small {
      display: block;
      padding: 8px 12px 0;
      color: rgba(255,255,255,.5);
    }

    @media (max-height: 680px) {
      .menu-footer {
        position: static;
        padding: 8px 10px 14px;
      }
    }
  `]
})
export class ShellPage {
  menuVisible: MenuItem[] = [];
  private menu: MenuItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'analytics-outline' },
    { label: 'Ticket / Venta', path: '/pos', icon: 'cart-outline', roles: ROLES_VENTA },
    { label: 'Productos', path: '/productos', icon: 'cube-outline', roles: ROLES_ADMIN },
    { label: 'Combos', path: '/combos', icon: 'layers-outline', roles: ROLES_ADMIN },
    { label: 'Clientes', path: '/clientes', icon: 'people-outline', roles: ROLES_VENTA },
    { label: 'Ventas', path: '/ventas', icon: 'receipt-outline', roles: ROLES_CAJA },
    { label: 'Caja / Turno', path: '/caja', icon: 'cash-outline', roles: ROLES_CAJA },
    { label: 'Reportes', path: '/reportes', icon: 'bar-chart-outline', roles: ROLES_CAJA },
    { label: 'Comprobantes', path: '/comprobantes', icon: 'receipt-outline', roles: ROLES_CAJA },
    { label: 'Configuración', path: '/configuracion', icon: 'settings-outline', roles: ROLES_ADMIN, allowWithoutCompany: true }
  ];

  constructor(private auth: AuthService) {
    addIcons({
      analyticsOutline,
      barChartOutline,
      cartOutline,
      cubeOutline,
      layersOutline,
      peopleOutline,
      receiptOutline,
      cashOutline,
      settingsOutline,
      logOutOutline
    });
  }

  async ngOnInit(): Promise<void> {
    const perfil = await this.auth.obtenerPerfil();
    this.menuVisible = this.menu.filter(item => {
      if (!item.roles || !perfil) {
        return true;
      }

      if (perfil.userId === 'demo') {
        return item.roles.includes(perfil.rol);
      }

      if (!perfil.empresaId) {
        return item.allowWithoutCompany === true;
      }

      return item.roles.includes(perfil.rol);
    });
  }

  logout(): void {
    void this.auth.logout();
  }
}
