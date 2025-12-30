import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isSessionChecked() && authService.isLoggedIn()) {
    return true;
  }

  return authService.validateSession().pipe(
    take(1),
    map((isValid) => {
      if (isValid) {
        return true;
      }
      // deploy
      router.navigate(['/login'], {
        queryParams: { returnUrl: state.url },
      });
      return false;
    })
  );
};
