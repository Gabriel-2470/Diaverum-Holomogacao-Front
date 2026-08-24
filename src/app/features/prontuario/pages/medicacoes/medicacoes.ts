// Aba "Medicações" (layout NephroSys pag.7; substitui a antiga 'prescricoes').
// Usa ProntuarioService.listarPrescricoes e considera MEDICAMENTOSA tudo que
// nao e prescricao de dialise. Radios "Medicações em uso"/"Histórico" filtram
// as duas visoes (LEITURA — grid item-a-item, intacta).
//
// Etapa 3 (prontuário como sistema de registro): quando o usuário está logado com
// papel de escrita (isLoggedIn && podeAcessarProntuario), a aba ganha escrita
// NATIVA de PRESCRIÇÕES (tipo MEDICAMENTOSA) — prescrever (cabeçalho + itens
// dinâmicos) / suspender (encerrar vigência). No fluxo anônimo (hyperlink RM =
// consulta) nada de escrita aparece (podeEscrever === false). SSR-safe.

import { Component, OnInit, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  Prescricao,
  PrescricaoItem,
  CriarPrescricaoItemPayload,
} from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

type ModoMedicacao = 'uso' | 'historico';

/** Linha do grid: um item de prescricao medicamentosa + dados da prescricao pai. */
interface LinhaMedicacao {
  chave: string;
  prescricao: Prescricao;
  item: PrescricaoItem;
  inicio: string | null;
  fim: string | null;
  emUso: boolean;
}

/** Item editável do form de nova prescrição (itens dinâmicos add/remove). */
interface ItemForm {
  medicamentoOuParametro: string;
  principioAtivo: string;
  dose: string;
  unidadeDose: string;
  via: string;
  frequencia: string;
  observacao: string;
}

const MEDICAMENTO_MIN = 2;
const MOTIVO_MIN = 5;

@Component({
  selector: 'pr-medicacoes',
  standalone: true,
  imports: [CommonModule, FormsModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './medicacoes.html',
  styleUrl: './medicacoes.scss',
})
export class MedicacoesComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly prescricoes = signal<Prescricao[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly modo = signal<ModoMedicacao>('uso');
  readonly chaveSelecionada = signal<string | null>(null);

  /** Toggle "Ver canceladas" — recarrega as prescrições com verCanceladas. */
  readonly verCanceladas = signal(false);

  /**
   * Escrita nativa habilitada SÓ para autenticado com papel de escrita. No fluxo
   * anônimo (hyperlink RM) fica false → todos os controles de escrita invisíveis.
   */
  readonly podeEscrever = computed(
    () => this.auth.isLoggedIn() && this.auth.podeAcessarProntuario()
  );

  // --- Form: nova prescrição (cabeçalho + itens dinâmicos) -------------------
  readonly novoAberto = signal(false);
  readonly salvando = signal(false);
  readonly erroSalvar = signal<string | null>(null);
  novaDataInicio = '';
  readonly itens = signal<ItemForm[]>([this.itemVazio()]);

  // --- Ação: suspender (inline por prescrição) -------------------------------
  /** id da prescrição com ação aberta; null = nenhuma. */
  readonly acaoAbertaId = signal<number | null>(null);
  readonly processandoAcao = signal(false);
  readonly erroAcao = signal<string | null>(null);
  acaoMotivo = '';

  readonly MEDICAMENTO_MIN = MEDICAMENTO_MIN;
  readonly MOTIVO_MIN = MOTIVO_MIN;

  private idPaciente = 0;

  /** Grid de LEITURA (item a item). Ignora prescrições suspensas — grid estável. */
  readonly linhas = computed<LinhaMedicacao[]>(() => {
    const out: LinhaMedicacao[] = [];
    for (const p of this.prescricoes()) {
      if (!this.ehMedicamentosa(p)) continue;
      if (p.cancelado) continue;
      const emUso = this.emUso(p);
      const inicio = p.dataInicio || p.dataPrescricao;
      for (const it of p.itens ?? []) {
        out.push({
          chave: `${p.idPrescricao}-${it.idPrescricaoItem}`,
          prescricao: p,
          item: it,
          inicio,
          fim: p.dataFim,
          emUso,
        });
      }
    }
    out.sort((a, b) => this.ts(b.inicio) - this.ts(a.inicio));
    return out;
  });

  readonly linhasFiltradas = computed<LinhaMedicacao[]>(() =>
    this.linhas().filter((l) => (this.modo() === 'uso' ? l.emUso : !l.emUso))
  );

  readonly selecionada = computed<LinhaMedicacao | null>(
    () => this.linhasFiltradas().find((l) => l.chave === this.chaveSelecionada()) ?? null
  );

  /** Prescrições medicamentosas (cartões de escrita), mais recentes primeiro. */
  readonly prescricoesMedicamentosas = computed<Prescricao[]>(() => {
    const arr = this.prescricoes().filter((p) => this.ehMedicamentosa(p));
    arr.sort(
      (a, b) => this.ts(b.dataInicio || b.dataPrescricao) - this.ts(a.dataInicio || a.dataPrescricao)
    );
    return arr;
  });

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
    this.buscar(true);
  }

  private buscar(primeira: boolean): void {
    this.prontuario.listarPrescricoes(this.idPaciente, this.verCanceladas()).subscribe({
      next: (lista) => {
        this.prescricoes.set(lista ?? []);
        this.carregando.set(false);
      },
      error: () => {
        if (primeira) this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  definirModo(m: ModoMedicacao): void {
    this.modo.set(m);
    this.chaveSelecionada.set(null);
  }

  selecionar(l: LinhaMedicacao): void {
    this.chaveSelecionada.set(l.chave);
  }

  alternarCanceladas(): void {
    this.verCanceladas.update((v) => !v);
    this.buscar(false);
  }

  /** Dias entre o inicio e o fim (ou hoje, quando em aberto). */
  tempoUsoTexto(l: LinhaMedicacao): string {
    const ini = this.data(l.inicio);
    if (!ini) return '—';
    const fim = this.data(l.fim) ?? this.hoje();
    const dias = Math.max(0, Math.round((fim.getTime() - ini.getTime()) / 86400000));
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }

  /** dose + unidade + via + frequencia concatenados. */
  posologia(it: PrescricaoItem): string {
    const dose = [it.dose, it.unidadeDose].filter(Boolean).join(' ');
    const partes = [dose, it.via, it.frequencia]
      .map((p) => (p ?? '').trim())
      .filter((p) => p.length > 0);
    return partes.length ? partes.join(' - ') : '—';
  }

  // --- Nova prescrição -------------------------------------------------------

  private itemVazio(): ItemForm {
    return {
      medicamentoOuParametro: '',
      principioAtivo: '',
      dose: '',
      unidadeDose: '',
      via: '',
      frequencia: '',
      observacao: '',
    };
  }

  abrirNovo(): void {
    this.novaDataInicio = '';
    this.itens.set([this.itemVazio()]);
    this.erroSalvar.set(null);
    this.novoAberto.set(true);
  }

  cancelarNovo(): void {
    this.novoAberto.set(false);
    this.erroSalvar.set(null);
  }

  adicionarItem(): void {
    this.itens.update((a) => [...a, this.itemVazio()]);
  }

  removerItem(indice: number): void {
    this.itens.update((a) => (a.length > 1 ? a.filter((_, i) => i !== indice) : a));
  }

  itemValido(it: ItemForm): boolean {
    return it.medicamentoOuParametro.trim().length >= MEDICAMENTO_MIN;
  }

  get novoValido(): boolean {
    const its = this.itens();
    return its.length > 0 && its.every((it) => this.itemValido(it));
  }

  salvarNovo(): void {
    if (!this.novoValido || this.salvando()) return;
    this.salvando.set(true);
    this.erroSalvar.set(null);
    const itens: CriarPrescricaoItemPayload[] = this.itens().map((it) => ({
      medicamentoOuParametro: it.medicamentoOuParametro.trim(),
      principioAtivo: it.principioAtivo.trim() || null,
      dose: it.dose.trim() || null,
      unidadeDose: it.unidadeDose.trim() || null,
      via: it.via.trim() || null,
      frequencia: it.frequencia.trim() || null,
      observacao: it.observacao.trim() || null,
    }));
    this.prontuario
      .criarPrescricao(this.idPaciente, {
        tipo: 'MEDICAMENTOSA',
        dataInicio: this.novaDataInicio || null,
        itens,
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.novoAberto.set(false);
          this.buscar(false);
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
    if (!this.confirmar('Confirmar a suspensão desta prescrição? Esta ação é registrada e não pode ser desfeita.')) {
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
          this.buscar(false);
        },
        error: (err) => {
          this.processandoAcao.set(false);
          this.erroAcao.set(this.mensagemErro(err, 'Não foi possível suspender a prescrição.'));
        },
      });
  }

  // --- Helpers ---------------------------------------------------------------

  /** MEDICAMENTOSA por exclusao: tudo que nao e prescricao de dialise. */
  private ehMedicamentosa(p: Prescricao): boolean {
    const t = (p.tipo ?? '').trim().toUpperCase();
    return !(t.includes('DIALI') || t === 'HD' || t === 'DP');
  }

  /** "Em uso" = statusOrigem VIGENTE/ACTIVE; sem status, cai na vigencia por datas. */
  private emUso(p: Prescricao): boolean {
    const s = (p.statusOrigem ?? '').trim().toUpperCase();
    if (s) {
      return s === 'VIGENTE' || s === 'ACTIVE' || s === 'ATIVO' || s === 'ATIVA' || s === 'EM USO';
    }
    const fim = this.data(p.dataFim);
    return !fim || fim.getTime() >= this.hoje().getTime();
  }

  private data(v: string | null | undefined): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private hoje(): Date {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  private ts(v: string | null | undefined): number {
    const d = this.data(v);
    return d ? d.getTime() : 0;
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
