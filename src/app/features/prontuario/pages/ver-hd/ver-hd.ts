// Aba "Ver HD/DP" (layout NephroSys pag.14; substitui a antiga 'sessoes').
// Grid denso de sessoes (listarSessoes paginado, "Carregar mais") com filtro de
// periodo CLIENT-SIDE; clique na linha carrega obterSessao e mostra os sinais
// vitais. UF realizada/PA vem do detalhe (preenchidas quando carregado).
//
// Etapa 4 (prontuário como sistema de registro): a sessão de HD normalmente vem
// da MÁQUINA. O registro assistencial MANUAL fica ATRÁS de uma flag de ambiente
// (environment.prontuarioSessaoNativa) — quando ligada E o usuário está logado
// com papel de escrita, a aba ganha escrita NATIVA de SESSÕES (cabeçalho + sinais
// vitais seriados) e cancelamento lógico. No fluxo anônimo (hyperlink RM =
// consulta) nada de escrita aparece (podeEscrever === false). SSR-safe.

import { Component, OnInit, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../../../environments/environment';
import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  SessaoResumo,
  SessaoDetalhe,
  SinalVitalLeitura,
  CriarSessaoPayload,
  CriarSinalVitalPayload,
} from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

/** Estado do detalhe de uma sessao (cache por idSessao). */
interface EstadoDetalhe {
  carregando: boolean;
  erro: boolean;
  dados: SessaoDetalhe | null;
}

/** Leitura editável do sub-form de sinais vitais (add/remove dinâmico). */
interface SinalForm {
  momento: string;
  paSis: number | null;
  paDia: number | null;
  fc: number | null;
  temperatura: number | null;
  ufAcumuladaMl: number | null;
  observacao: string;
}

const STATUS_SESSAO = ['REALIZADA', 'FALTA', 'SUSPENSA'];
const ACESSO_TIPO = ['FAV', 'CDL', 'PC', 'ENXERTO'];
const MOTIVO_MIN = 5;

@Component({
  selector: 'pr-ver-hd',
  standalone: true,
  imports: [CommonModule, FormsModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './ver-hd.html',
  styleUrl: './ver-hd.scss',
})
export class VerHdComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly sessoes = signal<SessaoResumo[]>([]);
  readonly carregando = signal(true);
  readonly carregandoMais = signal(false);
  readonly erro = signal(false);
  readonly fimDaLista = signal(false);

  /** Filtro de periodo (yyyy-MM-dd vindos dos inputs date). */
  readonly de = signal<string>('');
  readonly ate = signal<string>('');

  readonly expandida = signal<number | null>(null);
  private readonly detalhes = signal<Record<number, EstadoDetalhe>>({});

  /** Toggle "Ver canceladas" — recarrega as sessões com verCanceladas. */
  readonly verCanceladas = signal(false);

  /**
   * Flag de ambiente: escrita nativa de SESSÕES atrás de flag (default FALSE).
   * A sessão normalmente vem da máquina; só habilita o registro manual quando ligada.
   */
  readonly sessaoNativaHabilitada = environment.prontuarioSessaoNativa === true;

  /**
   * Escrita habilitada SÓ para autenticado com papel de escrita. No fluxo anônimo
   * (hyperlink RM) fica false → todos os controles de escrita invisíveis.
   */
  readonly podeEscrever = computed(
    () => this.auth.isLoggedIn() && this.auth.podeAcessarProntuario()
  );

  /** Escrita de sessão só quando a flag de ambiente está ligada E há papel de escrita. */
  readonly podeCriarSessao = computed(() => this.sessaoNativaHabilitada && this.podeEscrever());

  // --- Form: nova sessão (cabeçalho + sinais vitais dinâmicos) ---------------
  readonly novoAberto = signal(false);
  readonly salvando = signal(false);
  readonly erroSalvar = signal<string | null>(null);

  novaDataSessao = '';
  novaDuracaoMin: number | null = null;
  novoStatusSessao = 'REALIZADA';
  novoPesoPre: number | null = null;
  novoPesoPos: number | null = null;
  novoPesoSeco: number | null = null;
  novaUfRealizadaMl: number | null = null;
  novaPaPreSis: number | null = null;
  novaPaPreDia: number | null = null;
  novaPaPosSis: number | null = null;
  novaPaPosDia: number | null = null;
  novoAcessoTipo = '';
  novaTeveIntercorrencia = false;
  novasIntercorrencias = '';
  novaMaquina = '';

  readonly sinais = signal<SinalForm[]>([this.sinalVazio()]);

  readonly statusSessaoOpcoes = STATUS_SESSAO;
  readonly acessoTipoOpcoes = ACESSO_TIPO;

  // --- Ação: cancelar (inline por sessão) ------------------------------------
  /** id da sessão com ação aberta; null = nenhuma. */
  readonly acaoAbertaId = signal<number | null>(null);
  readonly processandoAcao = signal(false);
  readonly erroAcao = signal<string | null>(null);
  acaoMotivo = '';

  readonly MOTIVO_MIN = MOTIVO_MIN;

  private pagina = 1;

  /** Sessoes filtradas pelo periodo, mais recentes primeiro. */
  readonly filtradas = computed<SessaoResumo[]>(() => {
    const de = this.de();
    const ate = this.ate();
    const arr = this.sessoes().filter((s) => {
      const iso = this.isoData(s.dataSessao);
      if (!iso) return !de && !ate;
      if (de && iso < de) return false;
      if (ate && iso > ate) return false;
      return true;
    });
    arr.sort((a, b) => this.ts(b.dataSessao) - this.ts(a.dataSessao));
    return arr;
  });

  readonly total = computed(() => this.filtradas().length);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.pagina = 1;
    this.sessoes.set([]);
    this.fimDaLista.set(false);
    this.expandida.set(null);
    this.detalhes.set({});
    this.carregando.set(true);
    this.erro.set(false);
    this.buscarPagina(false);
  }

  carregarMais(): void {
    if (this.carregandoMais() || this.fimDaLista()) return;
    this.pagina += 1;
    this.carregandoMais.set(true);
    this.buscarPagina(true);
  }

  private buscarPagina(append: boolean): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      this.carregandoMais.set(false);
      return;
    }
    this.prontuario.listarSessoes(id, this.pagina, this.verCanceladas()).subscribe({
      next: (lista) => {
        const itens = lista ?? [];
        if (itens.length === 0) {
          this.fimDaLista.set(true);
        } else if (append) {
          this.sessoes.update((prev) => [...prev, ...itens]);
        } else {
          this.sessoes.set(itens);
        }
        this.carregando.set(false);
        this.carregandoMais.set(false);
      },
      error: () => {
        if (!append) this.erro.set(true);
        this.carregando.set(false);
        this.carregandoMais.set(false);
      },
    });
  }

  alternarCanceladas(): void {
    this.verCanceladas.update((v) => !v);
    this.carregar();
  }

  definirDe(ev: Event): void {
    this.de.set((ev.target as HTMLInputElement).value ?? '');
  }

  definirAte(ev: Event): void {
    this.ate.set((ev.target as HTMLInputElement).value ?? '');
  }

  alternar(idSessao: number): void {
    if (this.expandida() === idSessao) {
      this.expandida.set(null);
      return;
    }
    this.expandida.set(idSessao);
    if (!this.detalhes()[idSessao]) {
      this.carregarDetalhe(idSessao);
    }
  }

  estaExpandida(idSessao: number): boolean {
    return this.expandida() === idSessao;
  }

  detalhe(idSessao: number): EstadoDetalhe | null {
    return this.detalhes()[idSessao] ?? null;
  }

  /** Detalhe ja carregado (para preencher UF realizada/PA no grid). */
  detalheDados(idSessao: number): SessaoDetalhe | null {
    return this.detalhes()[idSessao]?.dados ?? null;
  }

  private carregarDetalhe(idSessao: number): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) return;
    this.atualizarDetalhe(idSessao, { carregando: true, erro: false, dados: null });
    this.prontuario.obterSessao(id, idSessao, this.verCanceladas()).subscribe({
      next: (dados) => this.atualizarDetalhe(idSessao, { carregando: false, erro: false, dados }),
      error: () => this.atualizarDetalhe(idSessao, { carregando: false, erro: true, dados: null }),
    });
  }

  private atualizarDetalhe(idSessao: number, estado: EstadoDetalhe): void {
    this.detalhes.update((prev) => ({ ...prev, [idSessao]: estado }));
  }

  duracaoHhMm(min: number | null | undefined): string {
    if (min == null) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  ufRealizadaTexto(s: SessaoResumo): string {
    const det = this.detalheDados(s.idSessao);
    return det?.ufRealizadaMl != null ? `${det.ufRealizadaMl} mL` : '—';
  }

  paPreTexto(s: SessaoResumo): string {
    const det = this.detalheDados(s.idSessao);
    return det?.paPreSis != null ? `${det.paPreSis}/${det.paPreDia ?? '—'}` : '—';
  }

  paPosTexto(s: SessaoResumo): string {
    const det = this.detalheDados(s.idSessao);
    return det?.paPosSis != null ? `${det.paPosSis}/${det.paPosDia ?? '—'}` : '—';
  }

  paSinal(sv: SinalVitalLeitura): string {
    return sv.paSis != null ? `${sv.paSis}/${sv.paDia ?? '—'}` : '—';
  }

  sinaisOrdenados(det: SessaoDetalhe): SinalVitalLeitura[] {
    return [...(det.sinaisVitais ?? [])].sort((a, b) => (a.seqLeitura ?? 0) - (b.seqLeitura ?? 0));
  }

  // ---------------------------------------------------------------------------
  // ESCRITA nativa de sessão (Etapa 4) — só flag de ambiente ligada E logado.
  // ---------------------------------------------------------------------------

  private sinalVazio(): SinalForm {
    return {
      momento: '',
      paSis: null,
      paDia: null,
      fc: null,
      temperatura: null,
      ufAcumuladaMl: null,
      observacao: '',
    };
  }

  abrirNovo(): void {
    this.novaDataSessao = '';
    this.novaDuracaoMin = null;
    this.novoStatusSessao = 'REALIZADA';
    this.novoPesoPre = null;
    this.novoPesoPos = null;
    this.novoPesoSeco = null;
    this.novaUfRealizadaMl = null;
    this.novaPaPreSis = null;
    this.novaPaPreDia = null;
    this.novaPaPosSis = null;
    this.novaPaPosDia = null;
    this.novoAcessoTipo = '';
    this.novaTeveIntercorrencia = false;
    this.novasIntercorrencias = '';
    this.novaMaquina = '';
    this.sinais.set([this.sinalVazio()]);
    this.erroSalvar.set(null);
    this.novoAberto.set(true);
  }

  cancelarNovo(): void {
    this.novoAberto.set(false);
    this.erroSalvar.set(null);
  }

  adicionarSinal(): void {
    this.sinais.update((a) => [...a, this.sinalVazio()]);
  }

  removerSinal(indice: number): void {
    this.sinais.update((a) => (a.length > 1 ? a.filter((_, i) => i !== indice) : a));
  }

  get novoValido(): boolean {
    return this.novaDataSessao.trim().length > 0;
  }

  private sinalPreenchido(s: SinalForm): boolean {
    return (
      s.momento.trim().length > 0 ||
      s.paSis != null ||
      s.paDia != null ||
      s.fc != null ||
      s.temperatura != null ||
      s.ufAcumuladaMl != null ||
      s.observacao.trim().length > 0
    );
  }

  salvarNovo(): void {
    if (!this.novoValido || this.salvando()) return;
    const id = this.contexto.idPacienteAtual();
    if (id == null) return;
    this.salvando.set(true);
    this.erroSalvar.set(null);

    const sinais: CriarSinalVitalPayload[] = this.sinais()
      .filter((s) => this.sinalPreenchido(s))
      .map((s) => ({
        momento: s.momento.trim() || null,
        paSis: s.paSis,
        paDia: s.paDia,
        fc: s.fc,
        temperatura: s.temperatura,
        ufAcumuladaMl: s.ufAcumuladaMl,
        observacao: s.observacao.trim() || null,
      }));

    const payload: CriarSessaoPayload = {
      dataSessao: this.novaDataSessao,
      duracaoMin: this.novaDuracaoMin,
      statusSessao: this.novoStatusSessao || null,
      pesoPre: this.novoPesoPre,
      pesoPos: this.novoPesoPos,
      pesoSeco: this.novoPesoSeco,
      ufRealizadaMl: this.novaUfRealizadaMl,
      paPreSis: this.novaPaPreSis,
      paPreDia: this.novaPaPreDia,
      paPosSis: this.novaPaPosSis,
      paPosDia: this.novaPaPosDia,
      acessoTipo: this.novoAcessoTipo || null,
      teveIntercorrencia: this.novaTeveIntercorrencia,
      intercorrencias: this.novasIntercorrencias.trim() || null,
      maquina: this.novaMaquina.trim() || null,
      sinais: sinais.length ? sinais : undefined,
    };

    this.prontuario.criarSessao(id, payload).subscribe({
      next: () => {
        this.salvando.set(false);
        this.novoAberto.set(false);
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.erroSalvar.set(this.mensagemErro(e, 'Não foi possível salvar a sessão.'));
      },
    });
  }

  // --- Cancelar sessão -------------------------------------------------------

  /** true se a sessão aceita ação de cancelamento (nativa e não cancelada). */
  podeAgir(s: SessaoResumo): boolean {
    return this.podeCriarSessao() && s.ehNativa && !s.cancelado;
  }

  acaoAberta(s: SessaoResumo): boolean {
    return this.acaoAbertaId() === s.idSessao;
  }

  abrirCancelar(s: SessaoResumo): void {
    this.acaoAbertaId.set(s.idSessao);
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

  confirmarCancelar(s: SessaoResumo): void {
    if (!this.acaoMotivoValido || this.processandoAcao()) return;
    if (!this.confirmar('Confirmar o cancelamento desta sessão? Esta ação é registrada e não pode ser desfeita.')) {
      return;
    }
    const id = this.contexto.idPacienteAtual();
    if (id == null) return;
    this.processandoAcao.set(true);
    this.erroAcao.set(null);
    this.prontuario.cancelarSessao(id, s.idSessao, { motivo: this.acaoMotivo.trim() }).subscribe({
      next: () => {
        this.processandoAcao.set(false);
        this.fecharAcao();
        this.carregar();
      },
      error: (err) => {
        this.processandoAcao.set(false);
        this.erroAcao.set(this.mensagemErro(err, 'Não foi possível cancelar a sessão.'));
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

  private isoData(v: string | null | undefined): string | null {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  private ts(v: string | null | undefined): number {
    if (!v) return 0;
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
}
