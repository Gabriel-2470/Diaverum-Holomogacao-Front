import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { catchError } from 'rxjs';
import { throwError } from 'rxjs';
import { Router } from '@angular/router';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const router = inject(Router);

  let modifiedReq = req.clone({
    withCredentials: true,
  });

  // Adicionar token JWT se existir
  if (isPlatformBrowser(platformId)) {
    const token = localStorage.getItem('token');
    if (token) {
      modifiedReq = modifiedReq.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  }

  return next(modifiedReq).pipe(
    catchError((error) => {
      // Se receber 401 (Unauthorized) E estiver em uma rota que não é login
      if (error.status === 401 && isPlatformBrowser(platformId)) {
        const currentUrl = router.url;
        const isLoginPage = currentUrl.includes('/login');

        // Log detalhado para diagnóstico
        console.error('HTTP 401 received for', req.url, 'while at', currentUrl);

        // Não limpar todo o estado do localStorage automaticamente — remover apenas o token
        // para forçar re-login, preservando `currentUser` e `unidadeSelecionada` para manter
        // a visualização do usuário até que ele reconfirme a sessão.
        if (!isLoginPage) {
          localStorage.removeItem('token');
          router.navigate(['/login']);
        }
      }
      return throwError(() => error);
    })
  );
};
