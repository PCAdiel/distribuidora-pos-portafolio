import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonContent, IonIcon, IonInput, IonItem, IonLabel, IonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { lockClosedOutline, mailOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, IonContent, IonCard, IonCardContent, IonInput, IonItem, IonLabel, IonButton, IonText, IonIcon],
  template: `
    <ion-content>
      <section class="login-shell">
        <div class="login-brand">
          <img class="brand-logo" src="assets/mariva-logo.svg" alt="Distribuidora Mariva">
          <span class="badge green">POS conectado</span>
          <h1>Distribuidora Mariva</h1>
          <p>Control de tickets, ventas, caja, productos y clientes para operación diaria.</p>
          <div class="login-stats">
            <div><strong>POS</strong><span>Ventas rápidas</span></div>
            <div><strong>Stock</strong><span>Alertas visuales</span></div>
            <div><strong>Caja</strong><span>Turnos claros</span></div>
          </div>
        </div>

        <ion-card class="login-card">
          <ion-card-content>
            <div class="panel-title">
              <div>
                <h2>Ingresar</h2>
                <p class="muted">Usa tu cuenta para continuar.</p>
              </div>
              <div class="round-icon"><ion-icon name="shield-checkmark-outline"></ion-icon></div>
            </div>

            <ion-item>
              <ion-icon name="mail-outline" slot="start"></ion-icon>
              <ion-label position="stacked">Correo</ion-label>
              <ion-input [(ngModel)]="email" type="email" placeholder="correo@empresa.com"></ion-input>
            </ion-item>

            <ion-item>
              <ion-icon name="lock-closed-outline" slot="start"></ion-icon>
              <ion-label position="stacked">Contraseña</ion-label>
              <ion-input [(ngModel)]="password" type="password" placeholder="Contraseña"></ion-input>
            </ion-item>

            <ion-button expand="block" class="ion-margin-top" (click)="login()">Ingresar al sistema</ion-button>
            @if (error) { <ion-text color="danger"><p>{{ error }}</p></ion-text> }
          </ion-card-content>
        </ion-card>
      </section>
    </ion-content>
  `,
  styles: [`
    .login-shell {
      min-height: 100%;
      display: grid;
      grid-template-columns: minmax(320px, 1.1fr) minmax(320px, 430px);
      gap: 24px;
      align-items: center;
      padding: 28px;
      background:
        linear-gradient(110deg, rgba(36,36,36,.94), rgba(86,41,13,.72)),
        radial-gradient(circle at top right, rgba(250,204,21,.28), transparent 36%),
        #242424;
    }

    .login-brand {
      color: #fff;
      max-width: 720px;
    }

    .login-brand .brand-logo {
      width: 118px;
      height: 118px;
      margin-bottom: 14px;
    }

    .login-brand h1 {
      margin: 14px 0 8px;
      font-size: clamp(36px, 6vw, 66px);
      line-height: 1;
      font-weight: 950;
      letter-spacing: 0;
    }

    .login-brand p {
      max-width: 560px;
      color: rgba(255,255,255,.78);
      font-size: 17px;
    }

    .login-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 22px;
    }

    .login-stats div {
      padding: 14px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 8px;
      background: rgba(255,255,255,.08);
    }

    .login-stats strong,
    .login-stats span {
      display: block;
    }

    .login-stats strong {
      font-size: 20px;
      font-weight: 900;
    }

    .login-stats span {
      color: rgba(255,255,255,.72);
      font-size: 12px;
    }

    .login-card {
      margin: 0;
      background: rgba(255,255,255,.96);
    }

    @media (max-width: 860px) {
      .login-shell {
        grid-template-columns: 1fr;
        padding: 18px;
      }

      .login-stats {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class LoginPage {
  email = '';
  password = '';
  error = '';

  constructor(private auth: AuthService, private router: Router) {
    addIcons({ mailOutline, lockClosedOutline, shieldCheckmarkOutline });
  }

  async login(): Promise<void> {
    try {
      this.error = '';
      const email = this.email.trim();
      const password = this.password.trim();

      if (!email || !password) {
        this.error = 'Ingresa correo y contraseña.';
        return;
      }

      await this.auth.login(email, password);
      await this.router.navigateByUrl('/dashboard');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Error al iniciar sesión';
    }
  }
}
