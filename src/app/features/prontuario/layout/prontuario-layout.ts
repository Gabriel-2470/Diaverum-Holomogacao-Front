// features/prontuario/layout/prontuario-layout.ts
//
// SHELL PROPRIO da area clinica de prontuario, FORA do LayoutComponent operacional.
// Aplica o tema NephroSys (.prontuario-theme) na raiz, monta a BARRA DE TITULO
// vinho fina ("Prontuário Clínico" + clinica ativa + usuario + "voltar ao
// operacional" + sair), o <router-outlet> das paginas e a faixa LGPD no rodape.
//
// SSR: nada de acesso direto a window/localStorage aqui — a clinica ativa e o
// usuario vem do AuthService, que ja isola o browser com isPlatformBrowser.

import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-prontuario-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './prontuario-layout.html',
  styleUrl: './prontuario-layout.scss',
})
export class ProntuarioLayout {
  private readonly auth = inject(AuthService);

  /** Clinica ativa (id + nome) para exibir na barra de titulo. */
  readonly unidadeAtiva = signal(this.auth.getUnidadeAtiva());

  /** Nome do usuario logado (ou vazio). */
  readonly usuarioNome = computed(() => this.auth.getCurrentUser()?.nome ?? '');

  /** Papel do usuario (ADMIN / CLINICO) so para exibicao discreta. */
  readonly usuarioRole = computed(() => this.auth.getRole() ?? '');

  sair(): void {
    this.auth.logout();
  }
}
