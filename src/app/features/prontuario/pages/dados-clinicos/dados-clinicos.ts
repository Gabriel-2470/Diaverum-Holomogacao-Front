// Aba "Dados Clínicos" (NephroSys pag.2): Dados Gerais, Marcadores Virais
// (estrutura — origem ainda não envia), Vacinas (vazia), Alergias (dado real).
// Usa listarProblemas + listarAlergias.
//
// Etapa 2 (prontuário como sistema de registro): quando o usuário está logado com
// papel de escrita (isLoggedIn && podeAcessarProntuario), a SEÇÃO de Alergias ganha
// escrita NATIVA — incluir / cancelar. No fluxo anônimo (hyperlink RM = consulta)
// nada de escrita aparece (podeEscrever === false → controles invisíveis). SSR-safe.

import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  AlergiaLeitura,
  ProblemaLeitura,
  Cadastro,
  MarcadorViral,
  MarcadorViralResultado,
  Vacina,
} from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

/** Ordem/rótulo das linhas de marcadores e o código correspondente da origem. */
const MARCADORES_MAP: { rotulo: string; codigo: string }[] = [
  { rotulo: 'Hepatite C', codigo: 'HEPATITE_C' },
  { rotulo: 'Hepatite B', codigo: 'HEPATITE_B' },
  { rotulo: 'HIV', codigo: 'HIV' },
  { rotulo: 'Anti-HBs', codigo: 'HBSAG' },
  { rotulo: 'CMV (Igg)', codigo: 'CMV' },
  { rotulo: 'Chagas (Igm)', codigo: 'CHAGAS' },
];
const OPCOES = ['Positivo', 'Negativo', 'Coletado', 'Não Inform.'];

/** Linha de marcador pronta para leitura (radio marcado + rótulo do resultado). */
interface MarcadorView {
  rotulo: string;
  opcaoSelecionada: string;
  resultadoRotulo: string | null;
  observacao: string | null;
  dataRegistro: string | null;
}

/** Domínio dos selects do form de nova alergia. */
const CATEGORIAS = ['MEDICAMENTO', 'ALIMENTO', 'AMBIENTAL', 'OUTRO'];
const CRITICIDADES = ['ALTA', 'BAIXA', 'INDETERMINADA'];

const SUBSTANCIA_MIN = 2;
const MOTIVO_MIN = 5;

@Component({
  selector: 'pr-dados-clinicos',
  standalone: true,
  imports: [CommonModule, FormsModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './dados-clinicos.html',
  styleUrl: './dados-clinicos.scss',
})
export class DadosClinicos implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly opcoes = OPCOES;

  readonly alergias = signal<AlergiaLeitura[]>([]);
  readonly problemas = signal<ProblemaLeitura[]>([]);
  readonly cadastro = signal<Cadastro | null>(null);
  readonly marcadoresVirais = signal<MarcadorViral[]>([]);
  readonly vacinas = signal<Vacina[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);

  /** true quando a origem enviou ao menos um marcador (esconde o aviso). */
  readonly temMarcadores = computed(() => this.marcadoresVirais().length > 0);

  /** Linhas de marcadores prontas para leitura (radio correto + rótulo textual). */
  readonly marcadoresView = computed<MarcadorView[]>(() => {
    const lista = this.marcadoresVirais();
    return MARCADORES_MAP.map((row) => {
      const m = lista.find((x) => (x.marcador ?? '').toUpperCase() === row.codigo) ?? null;
      const resultado = m?.resultado ?? null;
      return {
        rotulo: row.rotulo,
        opcaoSelecionada: this.opcaoDoResultado(resultado),
        resultadoRotulo: this.rotuloDoResultado(resultado),
        observacao: m?.observacao ?? null,
        dataRegistro: m?.dataRegistro ?? null,
      };
    });
  });

  /** Toggle "Ver canceladas" — recarrega as alergias com verCanceladas. */
  readonly verCanceladas = signal(false);

  /**
   * Escrita nativa habilitada SÓ para autenticado com papel de escrita. No fluxo
   * anônimo (hyperlink RM) fica false → todos os controles de escrita invisíveis.
   */
  readonly podeEscrever = computed(
    () => this.auth.isLoggedIn() && this.auth.podeAcessarProntuario()
  );

  // --- Form: nova alergia ----------------------------------------------------
  readonly novoAberto = signal(false);
  readonly salvando = signal(false);
  readonly erroSalvar = signal<string | null>(null);
  novaSubstancia = '';
  novaCategoria = '';
  novaCriticidade = '';
  novaReacao = '';
  readonly categorias = CATEGORIAS;
  readonly criticidades = CRITICIDADES;

  // --- Ação: cancelar (inline por alergia) -----------------------------------
  /** id da alergia com ação aberta; null = nenhuma. */
  readonly acaoAbertaId = signal<number | null>(null);
  readonly processandoAcao = signal(false);
  readonly erroAcao = signal<string | null>(null);
  acaoMotivo = '';

  readonly SUBSTANCIA_MIN = SUBSTANCIA_MIN;
  readonly MOTIVO_MIN = MOTIVO_MIN;

  private idPaciente = 0;

  /** Diagnóstico base = problema principal (ou o primeiro ativo). */
  readonly diagBase = computed<ProblemaLeitura | null>(() => {
    const ps = this.problemas();
    return ps.find((p) => p.principal) ?? ps[0] ?? null;
  });

  /** Observações = CIDs ativos resumidos ("N18.5, E11.2 ..."). */
  readonly observacoes = computed(() =>
    this.problemas()
      .map((p) => p.cid10 || p.descricao)
      .filter((x): x is string => !!x)
      .join(', ')
  );

  /** Alertas = alergias de criticidade alta. */
  readonly alertas = computed(() =>
    this.alergias()
      .filter((a) => this.ehAlta(a.criticidade))
      .map((a) => a.substancia)
      .filter((x): x is string => !!x)
      .join('; ')
  );

  ngOnInit(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      return;
    }
    this.idPaciente = id;
    // As rotas aditivas (cadastro/marcadores/vacinas) são resilientes: um erro
    // nelas não derruba a aba (mantém alergias/problemas, que já funcionavam).
    forkJoin({
      alergias: this.prontuario.listarAlergias(id, this.verCanceladas()),
      problemas: this.prontuario.listarProblemas(id),
      cadastro: this.prontuario.obterCadastro(id).pipe(catchError(() => of(null))),
      marcadores: this.prontuario
        .listarMarcadoresVirais(id)
        .pipe(catchError(() => of([] as MarcadorViral[]))),
      vacinas: this.prontuario.listarVacinas(id).pipe(catchError(() => of([] as Vacina[]))),
    }).subscribe({
      next: (r) => {
        this.alergias.set(r.alergias ?? []);
        this.problemas.set(r.problemas ?? []);
        this.cadastro.set(r.cadastro ?? null);
        this.marcadoresVirais.set(r.marcadores ?? []);
        this.vacinas.set(r.vacinas ?? []);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  ehAlta(c: string | null): boolean {
    const v = (c ?? '').toLowerCase();
    return v === 'high' || v === 'alta';
  }

  /** Mapeia o resultado sorológico para a opção de radio correspondente. */
  private opcaoDoResultado(r: MarcadorViralResultado): string {
    switch (r) {
      case 'REAGENTE':
        return 'Positivo';
      case 'NAO_REAGENTE':
        return 'Negativo';
      case 'INDETERMINADO':
        return 'Coletado';
      default:
        return 'Não Inform.';
    }
  }

  /** Rótulo textual do resultado (null quando a origem não informou → sem texto). */
  private rotuloDoResultado(r: MarcadorViralResultado): string | null {
    switch (r) {
      case 'REAGENTE':
        return 'Reagente';
      case 'NAO_REAGENTE':
        return 'Não reagente';
      case 'INDETERMINADO':
        return 'Indeterminado';
      case 'NAO_REALIZADO':
        return 'Não realizado';
      default:
        return null;
    }
  }

  /** Recarrega só a lista de alergias (após escrita ou toggle de canceladas). */
  private recarregarAlergias(): void {
    this.prontuario.listarAlergias(this.idPaciente, this.verCanceladas()).subscribe({
      next: (lista) => this.alergias.set(lista ?? []),
    });
  }

  alternarCanceladas(): void {
    this.verCanceladas.update((v) => !v);
    this.recarregarAlergias();
  }

  // --- Nova alergia ----------------------------------------------------------

  abrirNovo(): void {
    this.novaSubstancia = '';
    this.novaCategoria = '';
    this.novaCriticidade = '';
    this.novaReacao = '';
    this.erroSalvar.set(null);
    this.novoAberto.set(true);
  }

  cancelarNovo(): void {
    this.novoAberto.set(false);
    this.erroSalvar.set(null);
  }

  get novoValido(): boolean {
    return this.novaSubstancia.trim().length >= SUBSTANCIA_MIN;
  }

  salvarNovo(): void {
    if (!this.novoValido || this.salvando()) return;
    this.salvando.set(true);
    this.erroSalvar.set(null);
    this.prontuario
      .criarAlergia(this.idPaciente, {
        substancia: this.novaSubstancia.trim(),
        categoria: this.novaCategoria || null,
        criticidade: this.novaCriticidade || null,
        reacao: this.novaReacao.trim() || null,
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.novoAberto.set(false);
          this.recarregarAlergias();
        },
        error: (e) => {
          this.salvando.set(false);
          this.erroSalvar.set(this.mensagemErro(e, 'Não foi possível salvar a alergia.'));
        },
      });
  }

  // --- Cancelar --------------------------------------------------------------

  /** true se a alergia aceita ações de escrita (nativa e não cancelada). */
  podeAgir(a: AlergiaLeitura): boolean {
    return this.podeEscrever() && a.ehNativa && !a.cancelado;
  }

  acaoAberta(a: AlergiaLeitura): boolean {
    return this.acaoAbertaId() === a.idAlergia;
  }

  abrirCancelar(a: AlergiaLeitura): void {
    this.acaoAbertaId.set(a.idAlergia);
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

  confirmarCancelar(a: AlergiaLeitura): void {
    if (!this.acaoMotivoValido || this.processandoAcao()) return;
    if (!this.confirmar('Confirmar o cancelamento desta alergia? Esta ação é registrada e não pode ser desfeita.')) {
      return;
    }
    this.processandoAcao.set(true);
    this.erroAcao.set(null);
    this.prontuario
      .cancelarAlergia(this.idPaciente, a.idAlergia, { motivo: this.acaoMotivo.trim() })
      .subscribe({
        next: () => {
          this.processandoAcao.set(false);
          this.fecharAcao();
          this.recarregarAlergias();
        },
        error: (err) => {
          this.processandoAcao.set(false);
          this.erroAcao.set(this.mensagemErro(err, 'Não foi possível cancelar a alergia.'));
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
