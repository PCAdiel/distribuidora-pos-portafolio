import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AppRole } from '../../models/roles.model';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const logged = await auth.isLoggedIn();

  return logged ? true : router.parseUrl('/login');
};

export const roleGuard = (roles: AppRole[], allowWithoutCompany = false): CanActivateFn => async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowed = await auth.hasAnyRole(roles, allowWithoutCompany);

  return allowed ? true : router.parseUrl('/dashboard');
};
