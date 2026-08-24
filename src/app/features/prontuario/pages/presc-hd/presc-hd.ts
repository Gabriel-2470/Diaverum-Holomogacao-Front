// Aba "Presc. HD/DP" (layout NephroSys pag.11): grid de prescricoes de dialise
// + group "Geral" com os parametros da ULTIMA SESSAO + "Orientações" com os
// itens da prescricao de dialise vigente (ou da linha selecionada).
// Usa listarPrescricoes + listarSessoes/obterSessao. LEITURA intacta.
//
// Etapa 3 (prontuário como sistema de registro): quando o usuário está logado com
// papel de escrita (isLoggedIn && podeAcessarProntuario), a aba ganha escrita
// NATIVA de PRESCRIÇÕES (tipo DIALISE) — prescrever (cabeçalho + parâmetros
// dinâmicos) / suspender (encerrar vigência). No fluxo anônimo (hyperlink RM =
// consulta) nada de escrita aparece (podeEscrever === false). SSR-safe.

import { Component, OnInit, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  Prescricao,
  PrescricaoItem,
  SessaoDetalhe,
  CriarPrescricaoItemPayload,
} from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

/** Parâmetro editável do form de nova prescrição de diálise (itens dinâmicos). */
interface ParametroForm {
  medicamentoOuParametro: string;
  dose: string;
  unidadeDose: string;
  via: string;
  frequencia: string;
  momentoDialise: string;
  observacao: string;
}

const MOMENTOS_DIALISE = ['INTRA', 'POS', 'DOMICILIAR', 'NA'];
const PARAMETRO_MIN = 2;
const MOTIVO_MIN = 5;

@Component({
  selector: 'pr-presc-hd',
  standalone: true,
  imports: [CommonModule, FormsModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './presc-hd.html',
  styleUrl: './presc-hd.scss',
})
export class PrescHdComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly prescricoes = signal<Prescricao[]>([]);
  readonly ultimaSessao = signal<SessaoDetalhe | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly idSelecionada = signal<number | null>(null);

  /** Toggle "Ver suspensas" — recarrega as prescrições com verCanceladas. */
  readonly verCanceladas = signal(false);

  /**
   * Escrita nativa habilitada SÓ para autenticado com papel de escrita. No fluxo
   * anônimo (hyperlink RM) fica false → todos os controles de escrita invisíveis.
   */
  readonly podeEscrever = computed(
    () => this.auth.isLoggedIn() && this.auth.podeAcessarProntuario()
  );

  // --- Form: nova prescrição de diálise (cabeçalho + parâmetros dinâmicos) ----
  readonly novoAberto = signal(false);
  readonly salvando = signal(false);
  readonly erroSalvar = signal<string | null>(null);
  novaDataInicio = '';
  readonly parametros = signal<ParametroForm[]>([this.parametroVazio()]);
  readonly momentos = MOMENTOS_DIALISE;

  // --- Ação: suspender (inline por prescrição) -------------------------------
  /** id da prescrição com ação aberta; null = nenhuma. */
  readonly acaoAbertaId = signal<number | null>(null);
  readonly processandoAcao = signal(false);
  readonly erroAcao = signal<string | null>(null);
  acaoMotivo = '';

  readonly PARAMETRO_MIN = PARAMETRO_MIN;
  readonly MOTIVO_MIN = MOTIVO_MIN;

  private idPaciente = 0;

  /** Prescricoes de dialise NÃO suspensas (LEITURA — grid estável), + recentes 1o. */
  readonly dialise = computed<Prescricao[]>(() => {
    const arr = this.prescricoes().filter((p) => this.ehDialise(p) && !p.cancelado);
    arr.sort((a, b) => this.ts(b.dataInicio || b.dataPrescricao) - this.ts(a.dataInicio || a.dataPrescricao));
    return arr;
  });

  /** Todas as prescrições de diálise (cartões de escrita), + recentes 1o. */
  readonly prescricoesDialise = computed<Prescricao[]>(() => {
    const arr = this.prescricoes().filter((p) => this.ehDialise(p));
    arr.sort((a, b) => this.ts(b.dataInicio || b.dataPrescricao) - this.ts(a.dataInicio || a.dataPrescricao));
    return arr;
  });

  /** Vigente: statusOrigem VIGENTE/ACTIVE; fallback = mais recente. */
  readonly vigente = computed<Prescricao | null>(() => {
    const lista = this.dialise();
    return lista.find((p) => this.statusVigente(p.statusOrigem)) ?? lista[0] ?? null;
  });

  /** Prescricao exibida em "Orientações": a selecionada no grid ou a vigente. */
  readonly exibida = computed<Prescricao | null>(() => {
    const id = this.idSelecionada();
    if (id != null) {
      return this.dialise().find((p) => p.idPrescricao === id) ?? this.vigente();
    }
    return this.vigente();
  });

  readonly orientacoes = computed<PrescricaoItem[]>(() => this.exibida()?.itens ?? []);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      return;
    }
    this.idPaciente = id;
    this.carregando.set(true);
    this.erro.set(false);

    const prescricoes$ = this.prontuario.listarPrescricoes(id, this.verCanceladas());
    const ultimaSessao$ = this.prontuario.listarSessoes(id, 1).pipe(
      switchMap((lista) => {
        const maisRecente = [...(lista ?? [])].sort(
          (a, b) => this.ts(b.dataSessao) - this.ts(a.dataSessao)
        )[0];
        return maisRecente ? this.prontuario.obterSessao(id, maisRecente.idSessao) : of(null);
      }),
      catchError(() => of(null))
    );

    forkJoin([prescricoes$, ultimaSessao$]).subscribe({
      next: ([prescricoes, sessao]) => {
        this.prescricoes.set(prescricoes ?? []);
        this.ultimaSessao.set(sessao);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  /** Recarrega só as prescrições (após escrita ou toggle de suspensas). */
  private recarregarPrescricoes(): void {
    this.prontuario.listarPrescricoes(this.idPaciente, this.verCanceladas()).subscribe({
      next: (lista) => this.prescricoes.set(lista ?? []),
    });
  }

  alternarCanceladas(): void {
    this.verCanceladas.update((v) => !v);
    this.recarregarPrescricoes();
  }

  selecionar(p: Prescricao): void {
    this.idSelecionada.set(p.idPrescricao);
  }

  statusTexto(p: Prescricao): string {
    return p.statusOrigem || (this.vigente()?.idPrescricao === p.idPrescricao ? 'Vigente' : '—');
  }

  duracaoHhMm(min: number | null | undefined): string {
    if (min == null) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Valor da orientacao: dose+unidade, senao observacao/frequencia. */
  valorOrientacao(it: PrescricaoItem): string {
    const dose = [it.dose, it.unidadeDose].filter(Boolean).join(' ').trim();
    if (dose) return dose;
    const obs = (it.observacao ?? '').trim();
    if (obs) return obs;
    const freq = (it.frequencia ?? '').trim();
    return freq || '—';
  }

  /** Resumo do parâmetro para os cartões (dose/via/frequencia/momento). */
  resumoParametro(it: PrescricaoItem): string {
    const dose = [it.dose, it.unidadeDose].filter(Boolean).join(' ');
    const partes = [dose, it.via, it.frequencia, it.momentoDialise]
      .map((p) => (p ?? '').trim())
      .filter((p) => p.length > 0);
    return partes.length ? partes.join(' - ') : '—';
  }

  // --- Nova prescrição de diálise --------------------------------------------

  private parametroVazio(): ParametroForm {
    return {
      medicamentoOuParametro: '',
      dose: '',
      unidadeDose: '',
      via: '',
      frequencia: '',
      momentoDialise: '',
      observacao: '',
    };
  }

  abrirNovo(): void {
    this.novaDataInicio = '';
    this.parametros.set([this.parametroVazio()]);
    this.erroSalvar.set(null);
    this.novoAberto.set(true);
  }

  cancelarNovo(): void {
    this.novoAberto.set(false);
    this.erroSalvar.set(null);
  }

  adicionarParametro(): void {
    this.parametros.update((a) => [...a, this.parametroVazio()]);
  }

  removerParametro(indice: number): void {
    this.parametros.update((a) => (a.length > 1 ? a.filter((_, i) => i !== indice) : a));
  }

  parametroValido(it: ParametroForm): boolean {
    return it.medicamentoOuParametro.trim().length >= PARAMETRO_MIN;
  }

  get novoValido(): boolean {
    const its = this.parametros();
    return its.length > 0 && its.every((it) => this.parametroValido(it));
  }

  salvarNovo(): void {
    if (!this.novoValido || this.salvando()) return;
    this.salvando.set(true);
    this.erroSalvar.set(null);
    const itens: CriarPrescricaoItemPayload[] = this.parametros().map((it) => ({
      medicamentoOuParametro: it.medicamentoOuParametro.trim(),
      dose: it.dose.trim() || null,
      unidadeDose: it.unidadeDose.trim() || null,
      via: it.via.trim() || null,
      frequencia: it.frequencia.trim() || null,
      momentoDialise: it.momentoDialise || null,
      observacao: it.observacao.trim() || null,
    }));
    this.prontuario
      .criarPrescricao(this.idPaciente, {
        tipo: 'DIALISE',
        dataInicio: this.novaDataInicio || null,
        itens,
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.novoAberto.set(false);
          this.recarregarPrescricoes();
        },
        error: (e) => {
          this.salvando.set(false);
          this.erroSalvar.set(this.mensagemErro(e, 'Não foi possível salvar a prescrição.'));
        },
      });
  }

  // --- Suspender -------------------------------------------------------------

  /** true se a prescrição aceita ações de escrita (nativa e não suspensa). */
  podeAgir(p: Prescricao): boolean {
    return this.podeEscrever() && p.ehNativa && !p.cancelado;
  }

  acaoAberta(p: Prescricao): boolean {
    return this.acaoAbertaId() === p.idPrescricao;
  }

  abrirSuspender(p: Prescricao): void {
    this.acaoAbertaId.set(p.idPrescricao);
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

  confirmarSuspender(p: Prescricao): void {
    if (!this.acaoMotivoValido || this.processandoAcao()) return;
    if (!this.confirmar('Confirmar a suspensão desta prescrição de diálise? Esta ação é registrada e não pode ser desfeita.')) {
      return;
    }
    this.processandoAcao.set(true);
    this.erroAcao.set(null);
    this.prontuario
      .suspenderPrescricao(this.idPaciente, p.idPrescricao, { motivo: this.acaoMotivo.trim() })
      .subscribe({
        next: () => {
          this.processandoAcao.set(false);
          this.fecharAcao();
          this.recarregarPrescricoes();
        },
        error: (err) => {
          this.processandoAcao.set(false);
          this.erroAcao.set(this.mensagemErro(err, 'Não foi possível suspender a prescrição.'));
        },
      });
  }

  // --- Helpers ---------------------------------------------------------------

  private ehDialise(p: Prescricao): boolean {
    const t = (p.tipo ?? '').trim().toUpperCase();
    return t.includes('DIALI') || t === 'HD' || t === 'DP';
  }

  private statusVigente(s: string | null): boolean {
    const v = (s ?? '').trim().toUpperCase();
    return v === 'VIGENTE' || v === 'ACTIVE' || v === 'ATIVO' || v === 'ATIVA';
  }

  private ts(v: string | null | undefined): number {
    if (!v) return 0;
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

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
