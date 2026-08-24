// Aba "Eventos e Diagn." (NephroSys pag.3): lista de diagnósticos/problemas (CID).
// Sub-aba "Procedimentos" desabilitada (origem ainda não envia).
// Usa ProntuarioService.listarProblemas.
//
// Etapa 2 (prontuário como sistema de registro): quando o usuário está logado com
// papel de escrita (isLoggedIn && podeAcessarProntuario), a aba ganha escrita
// NATIVA — incluir / cancelar problema/CID. No fluxo anônimo (hyperlink RM =
// consulta) nada de escrita aparece (podeEscrever === false). SSR-safe.

import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ProblemaLeitura } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

const DESCRICAO_MIN = 3;
const MOTIVO_MIN = 5;

@Component({
  selector: 'pr-eventos-diagn',
  standalone: true,
  imports: [CommonModule, FormsModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './eventos-diagn.html',
  styleUrl: './eventos-diagn.scss',
})
export class EventosDiagn implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly problemas = signal<ProblemaLeitura[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);

  /** Toggle "Ver canceladas" — recarrega os problemas com verCanceladas. */
  readonly verCanceladas = signal(false);

  /**
   * Escrita nativa habilitada SÓ para autenticado com papel de escrita. No fluxo
   * anônimo (hyperlink RM) fica false → todos os controles de escrita invisíveis.
   */
  readonly podeEscrever = computed(
    () => this.auth.isLoggedIn() && this.auth.podeAcessarProntuario()
  );

  // --- Form: novo problema/CID -----------------------------------------------
  readonly novoAberto = signal(false);
  readonly salvando = signal(false);
  readonly erroSalvar = signal<string | null>(null);
  novoCid10 = '';
  novaDescricao = '';
  novoPrincipal = false;
  novaDataDiagnostico = '';

  // --- Ação: cancelar (inline por problema) ----------------------------------
  /** id do problema com ação aberta; null = nenhuma. */
  readonly acaoAbertaId = signal<number | null>(null);
  readonly processandoAcao = signal(false);
  readonly erroAcao = signal<string | null>(null);
  acaoMotivo = '';

  readonly DESCRICAO_MIN = DESCRICAO_MIN;
  readonly MOTIVO_MIN = MOTIVO_MIN;

  private idPaciente = 0;

  ngOnInit(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      return;
    }
    this.idPaciente = id;
    this.carregar(true);
  }

  private carregar(primeira: boolean): void {
    if (primeira) this.carregando.set(true);
    this.prontuario.listarProblemas(this.idPaciente, this.verCanceladas()).subscribe({
      next: (lista) => {
        this.problemas.set(lista ?? []);
        this.carregando.set(false);
      },
      error: () => {
        if (primeira) this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  alternarCanceladas(): void {
    this.verCanceladas.update((v) => !v);
    this.carregar(false);
  }

  // --- Novo problema/CID -----------------------------------------------------

  abrirNovo(): void {
    this.novoCid10 = '';
    this.novaDescricao = '';
    this.novoPrincipal = false;
    this.novaDataDiagnostico = '';
    this.erroSalvar.set(null);
    this.novoAberto.set(true);
  }

  cancelarNovo(): void {
    this.novoAberto.set(false);
    this.erroSalvar.set(null);
  }

  get novoValido(): boolean {
    return this.novaDescricao.trim().length >= DESCRICAO_MIN;
  }

  salvarNovo(): void {
    if (!this.novoValido || this.salvando()) return;
    this.salvando.set(true);
    this.erroSalvar.set(null);
    this.prontuario
      .criarProblema(this.idPaciente, {
        cid10: this.novoCid10.trim() || null,
        descricao: this.novaDescricao.trim(),
        principal: this.novoPrincipal,
        dataDiagnostico: this.novaDataDiagnostico || null,
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.novoAberto.set(false);
          this.carregar(false);
        },
        error: (e) => {
          this.salvando.set(false);
          this.erroSalvar.set(this.mensagemErro(e, 'Não foi possível salvar o problema.'));
        },
      });
  }

  // --- Cancelar --------------------------------------------------------------

  /** true se o problema aceita ações de escrita (nativo e não cancelado). */
  podeAgir(p: ProblemaLeitura): boolean {
    return this.podeEscrever() && p.ehNativa && !p.cancelado;
  }

  acaoAberta(p: ProblemaLeitura): boolean {
    return this.acaoAbertaId() === p.idProblema;
  }

  abrirCancelar(p: ProblemaLeitura): void {
    this.acaoAbertaId.set(p.idProblema);
    this.acaoMotivo = '';
    this.erroAcao.set(null);
  }

  fecharAcao(): void {
    this.acaoAbertaId.set(null);
    this.erroAcao.set(null);
  }

  get acaoMotivoValido(): boolean {
    return this.acaoMotivo.trim().length >= MOTIVO_MIN;
  }

  confirmarCancelar(p: ProblemaLeitura): void {
    if (!this.acaoMotivoValido || this.processandoAcao()) return;
    if (!this.confirmar('Confirmar o cancelamento deste problema? Esta ação é registrada e não pode ser desfeita.')) {
      return;
    }
    this.processandoAcao.set(true);
    this.erroAcao.set(null);
    this.prontuario
      .cancelarProblema(this.idPaciente, p.idProblema, { motivo: this.acaoMotivo.trim() })
      .subscribe({
        next: () => {
          this.processandoAcao.set(false);
          this.fecharAcao();
          this.carregar(false);
        },
        error: (err) => {
          this.processandoAcao.set(false);
          this.erroAcao.set(this.mensagemErro(err, 'Não foi possível cancelar o problema.'));
        },
      });
  }

  // --- Helpers ---------------------------------------------------------------

  private confirmar(msg: string): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return window.confirm(msg);
  }

  private mensagemErro(e: unknown, padrao: string): string {
    const err = e as { error?: { mensagem?: string; erros?: string[]; detail?: string; message?: string }; message?: string };
    return (
      err?.error?.mensagem ||
      err?.error?.erros?.join?.(', ') ||
      err?.error?.detail ||
      err?.error?.message ||
      err?.message ||
      padrao
    );
  }
}
