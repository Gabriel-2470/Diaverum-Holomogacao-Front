import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ActivatedRoute,
  Params,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { BuscaEstadoService } from '../../services/busca-estado.service';
import { SkeletonBlocoComponent } from '../../components/skeleton-bloco/skeleton-bloco';
import { SyncStatus } from '../../components/sync-status/sync-status';
import { BadgeClinico, BadgeClinicoTom } from '../../components/badge-clinico/badge-clinico';
import { idadeAnosMeses } from '../../util/idade.util';
import { SECOES_IMPRESSAO } from '../imprimir/imprimir';

/** Uma aba do prontuario do paciente (faixa horizontal estilo NephroSys). */
interface AbaProntuario {
  rota: string;
  rotulo: string;
}

type EstadoErro = 'revisao' | 'nao-encontrado' | 'sem-acesso' | 'generico' | null;

/**
 * Rota PAI de `:id` na area de prontuario, com o "jeitao" NephroSys:
 *   - barra de titulo vinho: "Prontuário - {NOME} - {X} Anos {Y} Meses"
 *     (sem data de nascimento, so o nome);
 *   - BARRA DO PACIENTE sempre visivel: nome em negrito maiusculo, codigo,
 *     "Sexo:" com fundo amarelo, "Data Nascimento:" dd/MM/yyyy, chip
 *     "Somente leitura", frescor da sync (discreto) e "Voltar à busca";
 *   - FAIXA de 17 abas horizontais (caixinhas cinza; ativa branca elevada)
 *     + <router-outlet>.
 *
 * Carrega o cabecalho UMA vez (ProntuarioService.obterCabecalho) e popula o
 * ProntuarioContextoService (signals) — as abas leem idPacienteAtual().
 * Provê o ProntuarioContextoService no proprio componente, de modo que cada
 * paciente tenha seu contexto isolado (descartado ao sair da rota).
 * V1 SOMENTE LEITURA: nenhuma affordance de edicao.
 *
 * Trata os codigos do backend com mensagem propria:
 *   409 -> vinculo do paciente em revisao;
 *   404 -> paciente nao encontrado;
 *   403 -> sem acesso a clinica do paciente.
 */
@Component({
  selector: 'pr-paciente-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SkeletonBlocoComponent,
    SyncStatus,
    BadgeClinico,
  ],
  providers: [ProntuarioContextoService],
  templateUrl: './paciente-shell.html',
  styleUrl: './paciente-shell.scss',
})
export class PacienteShellComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);
  private readonly buscaEstado = inject(BuscaEstadoService);

  /** "Voltar à busca" com os filtros/ordenação/página da última busca da sessão. */
  get paramsVoltarBusca(): Params {
    return this.buscaEstado.obter() ?? {};
  }

  readonly carregando = signal(true);
  readonly erro = signal<EstadoErro>(null);

  /** Modal "Imprimir Prontuário" (seleção de abas). */
  readonly secoesImpressao = SECOES_IMPRESSAO;
  readonly mostrarImpressao = signal(false);
  readonly selecaoImpressao = signal<Record<string, boolean>>(
    Object.fromEntries(SECOES_IMPRESSAO.map((s) => [s.chave, true]))
  );

  readonly cabecalho = this.contexto.cabecalho;
  readonly statusSync = this.contexto.statusSync;
  readonly ultimaSyncUtc = this.contexto.ultimaSyncUtc;

  /** Ordem EXATA das abas do NephroSys (todas clicaveis). */
  readonly abas: AbaProntuario[] = [
    { rota: 'identificacao', rotulo: 'Identificação' },
    { rota: 'dados-clinicos', rotulo: 'Dados Clínicos' },
    { rota: 'eventos', rotulo: 'Eventos e Diagn.' },
    { rota: 'sae', rotulo: 'SAE' },
    { rota: 'hc-evolucao', rotulo: 'HC / Evolução' },
    { rota: 'exames', rotulo: 'Exames' },
    { rota: 'medicacoes', rotulo: 'Medicações' },
    { rota: 'sol-exames', rotulo: 'Sol. Exames' },
    { rota: 'laudos', rotulo: 'Laudos' },
    { rota: 'acessos', rotulo: 'Acessos' },
    { rota: 'presc-hd', rotulo: 'Presc. HD/DP' },
    { rota: 'tx', rotulo: 'TX' },
    { rota: 'social', rotulo: 'Social' },
    { rota: 'ver-hd', rotulo: 'Ver HD/DP' },
    { rota: 'imagens', rotulo: 'Imagens' },
    { rota: 'resumo', rotulo: 'Resumo' },
    { rota: 'linha-do-tempo', rotulo: 'Linha do tempo' },
  ];

  /** Titulo da janela: "Prontuário - {NOME} - {X} Anos {Y} Meses". */
  readonly tituloJanela = computed(() => {
    const c = this.cabecalho();
    if (!c) {
      return 'Prontuário';
    }
    const nome = (c.nome ?? '').trim().toUpperCase() || 'PACIENTE SEM NOME';
    const idade = idadeAnosMeses(c.dataNascimento);
    return idade ? `Prontuário - ${nome} - ${idade}` : `Prontuário - ${nome}`;
  });

  /**
   * Codigo exibido na barra do paciente. O Cabecalho do espelho nao expõe
   * idExterno, entao usamos o idProntPaciente (chave do prontuario).
   */
  readonly codigoPaciente = computed(() => {
    const c = this.cabecalho();
    return c ? String(c.idProntPaciente) : '—';
  });

  /**
   * Badge de situação cadastral ao lado do chip "Somente leitura". null quando o
   * paciente é ATIVO (situacao null/ATIVO). ÓBITO em vermelho (perigo) com a data
   * quando houver; demais situações em cinza (neutro). Tooltip com a causa do
   * óbito quando disponível.
   */
  readonly situacaoBadge = computed<{ tom: BadgeClinicoTom; texto: string; titulo: string } | null>(
    () => {
      const c = this.cabecalho();
      if (!c) return null;
      const chave = (c.situacao ?? '').trim().toUpperCase() || 'ATIVO';
      if (chave === 'ATIVO') return null;

      const rotulos: Record<string, string> = {
        OBITO: 'ÓBITO',
        TRANSFERIDO: 'TRANSFERIDO',
        TRANSPLANTADO: 'TRANSPLANTADO',
        ABANDONO: 'ABANDONO',
        OUTRO: 'OUTRO',
      };
      const base = rotulos[chave] ?? chave;
      const data = this.formatarDataSituacao(c.dataSituacao);
      const texto = data ? `${base} ${data}` : base;
      const tom: BadgeClinicoTom = chave === 'OBITO' ? 'perigo' : 'neutro';
      const causa = (c.causaObito ?? '').trim();
      return { tom, texto, titulo: causa || texto };
    }
  );

  /** Formata a data da situação (dd/MM/yyyy) ou '' quando ausente/inválida. */
  private formatarDataSituacao(v: string | null): string {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
  }

  /** Rotulo do sexo ("Masculino"/"Feminino" ou o valor bruto da origem). */
  readonly sexoRotulo = computed(() => {
    const g = (this.cabecalho()?.genero ?? '').trim();
    const v = g.toUpperCase();
    if (v === 'M' || v === 'MASCULINO') return 'Masculino';
    if (v === 'F' || v === 'FEMININO') return 'Feminino';
    return g;
  });

  private paramSub?: Subscription;
  private cabecalhoSub?: Subscription;

  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe((params) => {
      const raw = params.get('id');
      const id = raw != null ? Number(raw) : NaN;
      if (!raw || Number.isNaN(id)) {
        this.contexto.limpar();
        this.carregando.set(false);
        this.erro.set('nao-encontrado');
        return;
      }
      this.carregarCabecalho(id);
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    this.cabecalhoSub?.unsubscribe();
    this.contexto.limpar();
  }

  recarregar(): void {
    const id = this.contexto.idPacienteAtual() ?? Number(this.route.snapshot.paramMap.get('id'));
    if (id && !Number.isNaN(id)) {
      this.carregarCabecalho(id);
    }
  }

  // -------------------------- Impressão com seleção de abas --------------------------

  abrirImpressao(): void {
    this.mostrarImpressao.set(true);
  }

  fecharImpressao(): void {
    this.mostrarImpressao.set(false);
  }

  alternarSecao(chave: string): void {
    this.selecaoImpressao.update((s) => ({ ...s, [chave]: !s[chave] }));
  }

  marcarTodas(valor: boolean): void {
    this.selecaoImpressao.set(Object.fromEntries(this.secoesImpressao.map((s) => [s.chave, valor])));
  }

  readonly algumaSelecionada = computed(() =>
    Object.values(this.selecaoImpressao()).some((v) => v)
  );

  confirmarImpressao(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) return;
    const abas = this.secoesImpressao
      .filter((s) => this.selecaoImpressao()[s.chave])
      .map((s) => s.chave);
    if (abas.length === 0) return;
    this.mostrarImpressao.set(false);
    this.router.navigate(['/prontuario', 'paciente', id, 'imprimir'], {
      queryParams: { abas: abas.join(',') },
    });
  }

  private carregarCabecalho(id: number): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.contexto.definirIdPaciente(id);

    this.cabecalhoSub?.unsubscribe();
    this.cabecalhoSub = this.prontuario.obterCabecalho(id).subscribe({
      next: (cab) => {
        this.contexto.definirCabecalho(cab);
        this.carregando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.contexto.definirCabecalho(null);
        this.carregando.set(false);
        this.erro.set(this.classificarErro(e));
      },
    });
  }

  private classificarErro(e: HttpErrorResponse): EstadoErro {
    switch (e.status) {
      case 409:
        return 'revisao';
      case 404:
        return 'nao-encontrado';
      case 403:
        return 'sem-acesso';
      default:
        return 'generico';
    }
  }
}
