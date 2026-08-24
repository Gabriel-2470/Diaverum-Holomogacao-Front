// Aba "HC / Evolução" (NephroSys pag.5): coluna de datas à esquerda + evoluções
// cronológicas à direita, filtro por tipo e impressão. Usa listarEvolucoes (paginado).
// SSR-safe (window.print / confirm guardados por isPlatformBrowser).
//
// Etapa 1 (prontuário como sistema de registro): quando o usuário está logado com
// papel de escrita (isLoggedIn && podeAcessarProntuario), a aba ganha escrita
// NATIVA — incluir / retificar / cancelar. No fluxo anônimo (hyperlink RM = consulta)
// nada de escrita aparece (podeEscrever === false → controles invisíveis).

import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Evolucao, TipoEvolucao } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

const LETRA: Record<string, string> = {
  MEDICA: 'M',
  ENFERMAGEM: 'E',
  NUTRICAO: 'N',
  PSICOLOGIA: 'P',
  SERVICO_SOCIAL: 'S',
  FARMACIA: 'F',
  OUTRO: 'O',
};

/** Domínio de tipos oferecido no select do form de nova evolução. */
const TIPOS_ESCRITA: TipoEvolucao[] = [
  'MEDICA',
  'ENFERMAGEM',
  'NUTRICAO',
  'PSICOLOGIA',
  'SERVICO_SOCIAL',
  'FARMACIA',
  'OUTRO',
];

const TEXTO_MIN = 10;
const MOTIVO_MIN = 5;

@Component({
  selector: 'pr-hc-evolucao',
  standalone: true,
  imports: [CommonModule, FormsModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './hc-evolucao.html',
  styleUrl: './hc-evolucao.scss',
})
export class HcEvolucao implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly evolucoes = signal<Evolucao[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly pagina = signal(1);
  readonly temMais = signal(false);
  readonly carregandoMais = signal(false);

  /** Filtro "Somente:" por tipo. '' = todos. */
  tipoFiltro = '';

  /** Toggle "Ver canceladas" — recarrega a lista com verCanceladas. */
  readonly verCanceladas = signal(false);

  /**
   * Escrita nativa habilitada SÓ para autenticado com papel de escrita. No fluxo
   * anônimo (hyperlink RM) fica false → todos os controles de escrita invisíveis.
   */
  readonly podeEscrever = computed(
    () => this.auth.isLoggedIn() && this.auth.podeAcessarProntuario()
  );

  // --- Form: nova evolução ---------------------------------------------------
  readonly novoAberto = signal(false);
  readonly salvando = signal(false);
  readonly erroSalvar = signal<string | null>(null);
  novoTipo: TipoEvolucao | '' = '';
  novoTexto = '';
  novoEspecialidade = '';
  readonly tiposEscrita = TIPOS_ESCRITA;

  // --- Form: retificar / cancelar (inline por evolução) ----------------------
  /** id da evolução com ação aberta; null = nenhuma. */
  readonly acaoAbertaId = signal<number | null>(null);
  /** tipo da ação aberta. */
  readonly acaoTipo = signal<'retificar' | 'cancelar' | null>(null);
  readonly processandoAcao = signal(false);
  readonly erroAcao = signal<string | null>(null);
  acaoTexto = '';
  acaoMotivo = '';

  readonly TEXTO_MIN = TEXTO_MIN;
  readonly MOTIVO_MIN = MOTIVO_MIN;

  private idPaciente = 0;

  readonly tipos = computed(() =>
    Array.from(new Set(this.evolucoes().map((e) => e.tipo).filter((t): t is string => !!t))).sort()
  );

  readonly filtradas = computed<Evolucao[]>(() => {
    const t = this.tipoFiltro;
    const arr = this.evolucoes();
    return t ? arr.filter((e) => e.tipo === t) : arr;
  });

  ngOnInit(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      return;
    }
    this.idPaciente = id;
    this.carregarPagina(1, true);
  }

  private carregarPagina(pagina: number, primeira: boolean): void {
    if (primeira) this.carregando.set(true);
    else this.carregandoMais.set(true);
    this.prontuario.listarEvolucoes(this.idPaciente, pagina, this.verCanceladas()).subscribe({
      next: (lista) => {
        const arr = lista ?? [];
        this.evolucoes.update((atual) => (primeira ? arr : [...atual, ...arr]));
        this.pagina.set(pagina);
        this.temMais.set(arr.length >= 20);
        this.carregando.set(false);
        this.carregandoMais.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
        this.carregandoMais.set(false);
      },
    });
  }

  /** Recarrega do início (após escrita ou toggle de canceladas). */
  private recarregar(): void {
    this.pagina.set(1);
    this.carregarPagina(1, true);
  }

  carregarMais(): void {
    if (!this.carregandoMais()) this.carregarPagina(this.pagina() + 1, false);
  }

  alternarCanceladas(): void {
    this.verCanceladas.update((v) => !v);
    this.recarregar();
  }

  letra(tipo: string | null): string {
    return LETRA[(tipo ?? '').toUpperCase()] ?? 'O';
  }

  ancora(e: Evolucao): string {
    return 'evo-' + e.idEvolucao;
  }

  irPara(e: Evolucao): void {
    if (!isPlatformBrowser(this.platformId)) return;
    document.getElementById(this.ancora(e))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  imprimir(): void {
    if (isPlatformBrowser(this.platformId)) window.print();
  }

  // --- Nova evolução ---------------------------------------------------------

  abrirNovo(): void {
    this.novoTipo = '';
    this.novoTexto = '';
    this.novoEspecialidade = '';
    this.erroSalvar.set(null);
    this.novoAberto.set(true);
  }

  cancelarNovo(): void {
    this.novoAberto.set(false);
    this.erroSalvar.set(null);
  }

  get novoTextoValido(): boolean {
    return this.novoTexto.trim().length >= TEXTO_MIN;
  }

  get novoValido(): boolean {
    return !!this.novoTipo && this.novoTextoValido;
  }

  salvarNovo(): void {
    if (!this.novoValido || this.salvando()) return;
    this.salvando.set(true);
    this.erroSalvar.set(null);
    this.prontuario
      .criarEvolucao(this.idPaciente, {
        tipo: this.novoTipo as TipoEvolucao,
        texto: this.novoTexto.trim(),
        especialidade: this.novoEspecialidade.trim() || null,
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.novoAberto.set(false);
          this.recarregar();
        },
        error: (e) => {
          this.salvando.set(false);
          this.erroSalvar.set(this.mensagemErro(e, 'Não foi possível salvar a evolução.'));
        },
      });
  }

  // --- Retificar / Cancelar --------------------------------------------------

  /** true se a evolução aceita ações de escrita (nativa e não cancelada). */
  podeAgir(e: Evolucao): boolean {
    return this.podeEscrever() && e.ehNativa && !e.cancelado;
  }

  abrirRetificar(e: Evolucao): void {
    this.acaoAbertaId.set(e.idEvolucao);
    this.acaoTipo.set('retificar');
    this.acaoTexto = e.texto ?? '';
    this.acaoMotivo = '';
    this.erroAcao.set(null);
  }

  abrirCancelar(e: Evolucao): void {
    this.acaoAbertaId.set(e.idEvolucao);
    this.acaoTipo.set('cancelar');
    this.acaoTexto = '';
    this.acaoMotivo = '';
    this.erroAcao.set(null);
  }

  fecharAcao(): void {
    this.acaoAbertaId.set(null);
    this.acaoTipo.set(null);
    this.erroAcao.set(null);
  }

  acaoAberta(e: Evolucao, tipo: 'retificar' | 'cancelar'): boolean {
    return this.acaoAbertaId() === e.idEvolucao && this.acaoTipo() === tipo;
  }

  get acaoTextoValido(): boolean {
    return this.acaoTexto.trim().length >= TEXTO_MIN;
  }

  get acaoMotivoValido(): boolean {
    return this.acaoMotivo.trim().length >= MOTIVO_MIN;
  }

  confirmarRetificar(e: Evolucao): void {
    if (!this.acaoTextoValido || !this.acaoMotivoValido || this.processandoAcao()) return;
    if (!this.confirmar('Confirmar a retificação? A evolução original será cancelada e vinculada à nova.')) {
      return;
    }
    this.processandoAcao.set(true);
    this.erroAcao.set(null);
    this.prontuario
      .retificarEvolucao(this.idPaciente, e.idEvolucao, {
        texto: this.acaoTexto.trim(),
        motivo: this.acaoMotivo.trim(),
      })
      .subscribe({
        next: () => {
          this.processandoAcao.set(false);
          this.fecharAcao();
          this.recarregar();
        },
        error: (err) => {
          this.processandoAcao.set(false);
          this.erroAcao.set(this.mensagemErro(err, 'Não foi possível retificar a evolução.'));
        },
      });
  }

  confirmarCancelar(e: Evolucao): void {
    if (!this.acaoMotivoValido || this.processandoAcao()) return;
    if (!this.confirmar('Confirmar o cancelamento desta evolução? Esta ação é registrada e não pode ser desfeita.')) {
      return;
    }
    this.processandoAcao.set(true);
    this.erroAcao.set(null);
    this.prontuario
      .cancelarEvolucao(this.idPaciente, e.idEvolucao, { motivo: this.acaoMotivo.trim() })
      .subscribe({
        next: () => {
          this.processandoAcao.set(false);
          this.fecharAcao();
          this.recarregar();
        },
        error: (err) => {
          this.processandoAcao.set(false);
          this.erroAcao.set(this.mensagemErro(err, 'Não foi possível cancelar a evolução.'));
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
