import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { ROLES_ADMIN, ROLES_CAJA, ROLES_VENTA } from './models/roles.model';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell.page').then(m => m.ShellPage),
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.page').then(m => m.DashboardPage) },
      { path: 'pos', canActivate: [roleGuard(ROLES_VENTA)], loadComponent: () => import('./features/pos/pos.page').then(m => m.PosPage) },
      { path: 'productos', canActivate: [roleGuard(ROLES_ADMIN)], loadComponent: () => import('./features/productos/productos.page').then(m => m.ProductosPage) },
      { path: 'combos', canActivate: [roleGuard(ROLES_ADMIN)], loadComponent: () => import('./features/combos/combos.page').then(m => m.CombosPage) },
      { path: 'clientes', canActivate: [roleGuard(ROLES_VENTA)], loadComponent: () => import('./features/clientes/clientes.page').then(m => m.ClientesPage) },
      { path: 'ventas', canActivate: [roleGuard(ROLES_CAJA)], loadComponent: () => import('./features/ventas/ventas.page').then(m => m.VentasPage) },
      { path: 'caja', canActivate: [roleGuard(ROLES_CAJA)], loadComponent: () => import('./features/caja/caja.page').then(m => m.CajaPage) },
      { path: 'reportes', canActivate: [roleGuard(ROLES_CAJA)], loadComponent: () => import('./features/reportes/reportes.page').then(m => m.ReportesPage) },
      { path: 'comprobantes', canActivate: [roleGuard(ROLES_CAJA)], loadComponent: () => import('./features/comprobantes/comprobantes.page').then(m => m.ComprobantesPage) },
      { path: 'facturacion/pendientes', canActivate: [roleGuard(ROLES_CAJA)], loadComponent: () => import('./features/facturacion/pages/comprobantes-pendientes.page').then(m => m.ComprobantesPendientesPage) },
      { path: 'configuracion', canActivate: [roleGuard(ROLES_ADMIN, true)], loadComponent: () => import('./features/configuracion/configuracion.page').then(m => m.ConfiguracionPage) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
