import { Injectable, inject } from '@angular/core';
import { Params } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

/** Chave do sessionStorage — escopo da aba: morre ao fechar, sobrevive a F5. */
const CHAVE_STORAGE = 'pront.busca.estado';

/** Estado persistido: params da busca CARIMBADOS com o usuário dono. */
interface EstadoSalvo {
  /** idUser do dono — a busca de um usuário nunca é restaurada para outro. */
  u: number;
  p: Params;
}

/**
 * Guarda os queryParams da ÚLTIMA busca de pacientes executada, para que os
 * botões "Voltar à busca" (ficha do paciente, impressão em lote, vínculos) e a
 * reentrada em /prontuario pelo menu restaurem filtros/ordenação/página.
 *
 * Memória + sessionStorage: o storage cobre F5 na ficha do paciente (o service
 * é recriado) sem "grudar" os filtros para sempre — fechar a aba zera tudo.
 *
 * LGPD: o estado leva o idUser do dono e obter() só devolve para ele — após
 * logout (ou login de outro usuário na mesma aba) nada é restaurado, então o
 * termo pesquisado (nome/CPF) de um usuário nunca vaza para o seguinte. Além
 * do bloqueio na leitura, o dado em repouso é APAGADO no logout e em qualquer
 * leitura com dono divergente (não fica CPF de paciente parado no storage).
 */
@Injectable({ providedIn: 'root' })
export class BuscaEstadoService {
  private readonly auth = inject(AuthService);
  private estado: EstadoSalvo | null = null;

  constructor() {
    // Logout (ou troca de usuário) com o app vivo → apaga o estado em repouso.
    this.auth.currentUser$.subscribe((usuario) => {
      const est = this.estado;
      if (usuario == null || (est != null && est.u !== usuario.idUser)) this.limpar();
    });
  }

  /** Salva os params da busca (chaves null — defaults — são descartadas). */
  salvar(params: Params): void {
    const dono = this.auth.getCurrentUser()?.idUser;
    if (dono == null) return; // anônimo (hyperlink) não persiste busca
    const limpo: Params = {};
    for (const [chave, valor] of Object.entries(params)) {
      if (valor != null) limpo[chave] = valor;
    }
    this.estado = { u: dono, p: limpo };
    try {
      sessionStorage.setItem(CHAVE_STORAGE, JSON.stringify(this.estado));
    } catch {
      // SSR / storage indisponível / quota: segue valendo só a memória.
    }
  }

  /**
   * Últimos params salvos DO USUÁRIO LOGADO ({} = busca sem filtros).
   * null = nenhuma busca nesta aba, usuário anônimo ou estado de outro usuário.
   */
  obter(): Params | null {
    const dono = this.auth.getCurrentUser()?.idUser;
    const est = this.carregar();
    if (est == null) return null;
    if (dono == null || est.u !== dono) {
      this.limpar(); // estado de outro usuário (ou aba deslogada): apaga, não só oculta
      return null;
    }
    return est.p;
  }

  /** True quando há algo além do default para restaurar (para o usuário atual). */
  temEstado(): boolean {
    const p = this.obter();
    return p != null && Object.keys(p).length > 0;
  }

  /** Apaga memória + sessionStorage (logout, troca de usuário, dado inválido). */
  private limpar(): void {
    this.estado = null;
    try {
      sessionStorage.removeItem(CHAVE_STORAGE);
    } catch {
      // SSR/storage indisponível: nada a apagar.
    }
  }

  /** Cache em memória, re-hidratado do sessionStorage (F5 fora da busca). */
  private carregar(): EstadoSalvo | null {
    if (this.estado != null) return this.estado;
    try {
      const bruto = sessionStorage.getItem(CHAVE_STORAGE);
      const lido = bruto ? (JSON.parse(bruto) as EstadoSalvo) : null;
      this.estado = lido && typeof lido.u === 'number' && lido.p != null ? lido : null;
    } catch {
      this.estado = null;
    }
    return this.estado;
  }
}
