// core/guards/prontuario.guard.ts
//
// Guard da area clinica de PRONTUARIO.
//
// MODO PADRAO (environment.prontuarioAcessoAnonimo = false):
//   - !logado           -> /login (com returnUrl para retomar apos autenticar);
//   - sem permissao      -> /acesso-negado (role fora de ['ADMIN','CLINICO']).
//
// MODO HYPERLINK (environment.prontuarioAcessoAnonimo = true — espelha a flag
// Prontuario:AcessoAnonimo do backend): a area abre para QUALQUER visitante
// (logado ou nao, qualquer papel), pois o prontuario e alvo de hyperlink por CPF
// vindo de outro sistema (/prontuario?cpf=...). O que cada um pode fazer e
// decidido pelo BACKEND: a ficha fica aberta, a BUSCA continua exigindo login
// (retorna 401 para anonimos). O guard aqui e so UX — a protecao real e a API.

import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const prontuarioGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Modo hyperlink: acesso liberado (a API governa o que anonimo pode ler).
  if (environment.prontuarioAcessoAnonimo) {
    return true;
  }

  // Precisa estar autenticado.
  if (!auth.isLoggedIn()) {
    router.navigate(['/login'], {
      queryParams: { returnUrl: state.url },
    });
    return false;
  }

  // Precisa ter papel clinico (ADMIN ou CLINICO).
  if (!auth.podeAcessarProntuario()) {
    router.navigate(['/acesso-negado']);
    return false;
  }

  return true;
};
