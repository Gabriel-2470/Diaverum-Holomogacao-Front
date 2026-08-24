import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  NavigationStart,
  ParamMap,
  Params,
  Router,
  RouterLink,
  convertToParamMap,
} from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, Subscription, of, timer } from 'rxjs';
import { catchError, debounce, switchMap, tap } from 'rxjs/operators';

import { ProntuarioService } from '../../services/prontuario.service';
import { BuscaEstadoService } from '../../services/busca-estado.service';
import { AuthService } from '../../../../core/services/auth.service';
import { UnidadeService, Unidade } from '../../../../core/services/unidade.service';
import { PacienteBusca, ResultadoPaginado } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonBlocoComponent } from '../../components/skeleton-bloco/skeleton-bloco';

/** Um paciente selecionado (mantido leve — so o necessario para a barra/lote). */
interface PacienteSelecionado {
  id: number;
  nome: string;
}

/** Direcao de ordenacao. */
type Direcao = 'ASC' | 'DESC';

/** Coluna clicavel de ordenacao (espelha ordenarPor do contrato). */
type ColunaOrd = 'NOME' | 'CPF' | 'NASCIMENTO' | 'IDADE' | 'SITUACAO' | 'UNIDADE' | 'ULTIMA_SESSAO';

/**
 * Snapshot completo do estado do grid (filtros + paginacao + ordenacao). E a
 * unica fonte serializada para a URL — round-trip simetrico com lerEstado/paraQueryParams.
 */
interface EstadoBusca {
  q: string;
  situacao: string;
  sexo: string; // '' | 'M' | 'F'
  unidade: number | null;
  idadeMin: number | null; // 0..130 | null
  idadeMax: number | null; // 0..130 | null
  pagina: number;
  tam: number; // 20 | 50 | 100
  ord: string; // '' | ColunaOrd
  dir: Direcao;
}

/** Requisicao interna da busca (repassada ao stream unico). */
interface Requisicao {
  estado: EstadoBusca;
  /** true = executa imediatamente (paginacao/filtro/ordenacao/retry); false = com debounce (digitacao). */
  imediato: boolean;
  /** Atraso do debounce quando !imediato (ms). Default 300 (digitacao do texto); 400 na faixa etaria. */
  atraso?: number;
}

/** Opcao de select (situacao / sexo). */
interface OpcaoSelect {
  valor: string;
  rotulo: string;
}

/** Chip de filtro ativo exibido abaixo da barra. */
interface ChipFiltro {
  tipo: 'situacao' | 'sexo' | 'unidade' | 'idade';
  rotulo: string;
}

@Component({
  selector: 'pr-busca-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EstadoVazioComponent, SkeletonBlocoComponent],
  templateUrl: './busca-pacientes.html',
  styleUrl: './busca-pacientes.scss',
})
export class BuscaPacientesComponent implements OnInit, OnDestroy {
  private readonly prontuario = inject(ProntuarioService);
  private readonly auth = inject(AuthService);
  private readonly unidadeService = inject(UnidadeService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly buscaEstado = inject(BuscaEstadoService);

  /** Chaves de queryParam que compõem o estado da busca (espelho de paraQueryParams). */
  private static readonly CHAVES_URL = [
    'q',
    'situacao',
    'sexo',
    'unidade',
    'im',
    'ix',
    'pagina',
    'tam',
    'ord',
    'dir',
  ];

  /** Tamanhos de pagina validos (contrato: 20|50|100). */
  private readonly TAMANHOS = [20, 50, 100];
  /** Colunas de ordenacao aceitas pelo backend (whitelist inclui CPF e IDADE). */
  private readonly COLUNAS_ORD: ColunaOrd[] = [
    'NOME',
    'CPF',
    'NASCIMENTO',
    'IDADE',
    'SITUACAO',
    'UNIDADE',
    'ULTIMA_SESSAO',
  ];
  /** Limites da faixa etaria (contrato: 0..130). */
  private readonly IDADE_MIN = 0;
  private readonly IDADE_MAX = 130;

  /** Deep-link por CPF (?cpf=... vindo do hyperlink de outro sistema). */
  readonly resolvendoCpf = signal(false);
  readonly cpfNaoEncontrado = signal<string | null>(null);

  /** Busca exige login (401) — visitante anônimo do hyperlink tentou pesquisar. */
  readonly precisaLogin = signal(false);

  /** Papel ADMIN → habilita o atalho para a Fila de vínculo (papel é estável na sessão). */
  readonly isAdmin = computed(() => this.auth.getRole() === 'ADMIN');

  // --------------------------------- Filtros (signals) ---------------------------------

  /** Texto do campo unico (nome OU CPF). */
  readonly termo = signal('');
  /** Filtro de situacao (select). '' = todas. */
  readonly situacaoFiltro = signal('');
  /** Filtro de sexo. '' = todos; 'M' | 'F'. */
  readonly sexoFiltro = signal('');
  /** Filtro de unidade (idUnidade). null = "Todas" (cai no escopo da clínica ativa). */
  readonly unidadeFiltro = signal<number | null>(null);
  /** Faixa etária — idade mínima (0..130). null = sem limite inferior. */
  readonly idadeMinFiltro = signal<number | null>(null);
  /** Faixa etária — idade máxima (0..130). null = sem limite superior. */
  readonly idadeMaxFiltro = signal<number | null>(null);

  /**
   * Posições ao vivo das alças do slider de idade (0..130). São a fonte da UI:
   * atualizam a cada pixel no `input` (só o label) e só viram filtro no `change`
   * (aoAplicarIdade). Espelham idadeMin/idadeMaxFiltro (null → 0 / 130).
   */
  readonly idadeMinSlider = signal(this.IDADE_MIN);
  readonly idadeMaxSlider = signal(this.IDADE_MAX);

  /** % da alça mínima na trilha (para posicionar o segmento ativo). */
  readonly idadePctMin = computed(() => (this.idadeMinSlider() / this.IDADE_MAX) * 100);
  /** % da alça máxima na trilha. */
  readonly idadePctMax = computed(() => (this.idadeMaxSlider() / this.IDADE_MAX) * 100);

  /** Texto dinâmico ao lado do rótulo "Idade" (ex.: "60 – 80 anos" / "todas"). */
  readonly idadeSliderTexto = computed(() => {
    const min = this.idadeMinSlider();
    const max = this.idadeMaxSlider();
    if (min <= this.IDADE_MIN && max >= this.IDADE_MAX) return 'todas';
    return `${min} – ${max} anos`;
  });

  /** Exportação CSV em andamento (desabilita o botão + rótulo "Exportando…"). */
  readonly exportando = signal(false);
  /** Falha discreta na última exportação CSV. */
  readonly erroExport = signal(false);
  /** Itens por pagina. */
  readonly tamanhoPagina = signal(20);
  /** Coluna de ordenacao ativa ('' = ordem padrao do backend). */
  readonly ordenarPor = signal<string>('');
  /** Direcao da ordenacao ativa. */
  readonly direcao = signal<Direcao>('ASC');

  readonly opcoesSituacao: OpcaoSelect[] = [
    { valor: '', rotulo: 'Todas' },
    { valor: 'ATIVO', rotulo: 'Ativos' },
    { valor: 'OBITO', rotulo: 'Óbitos' },
    { valor: 'TRANSFERIDO', rotulo: 'Transferidos' },
    { valor: 'TRANSPLANTADO', rotulo: 'Transplantados' },
    { valor: 'ABANDONO', rotulo: 'Abandono' },
  ];

  readonly opcoesSexo: OpcaoSelect[] = [
    { valor: '', rotulo: 'Todos' },
    { valor: 'M', rotulo: 'Masculino' },
    { valor: 'F', rotulo: 'Feminino' },
  ];

  readonly opcoesTamanho = this.TAMANHOS;

  /** Unidades de envio (TBL_UNIDADE_ENVIO) para popular o select. Reusa UnidadeService. */
  readonly unidades = signal<Unidade[]>([]);

  readonly carregando = signal(false);
  readonly erro = signal(false);
  readonly buscou = signal(false);
  readonly pacientes = signal<PacienteBusca[]>([]);
  readonly total = signal(0);

  /** Paginacao real (servidor). paginaAtual tambem e a pagina requisitada. */
  readonly paginaAtual = signal(1);
  readonly totalPaginas = signal(1);

  /** Seleção múltipla que PERSISTE entre páginas (id -> {id, nome}). */
  readonly selecionados = signal<Map<number, PacienteSelecionado>>(new Map());
  readonly quantidadeSelecionada = computed(() => this.selecionados().size);

  /** Clinica ativa (idUnidade). A busca respeita este escopo quando nao ha filtro de unidade. */
  readonly unidadeAtiva = signal<{ id: number | null; nome: string }>({ id: null, nome: '' });

  // --- Situacao: mapa de rótulo + classe do chip (.nx-chip). ATIVO/null = sem chip. ---
  private readonly SITUACOES: Record<string, { rotulo: string; classe: string }> = {
    OBITO: { rotulo: 'Óbito', classe: 'nx-chip--obito' },
    TRANSFERIDO: { rotulo: 'Transferido', classe: 'nx-chip--transfer' },
    TRANSPLANTADO: { rotulo: 'Transplantado', classe: 'nx-chip--transpl' },
    ABANDONO: { rotulo: 'Abandono', classe: 'nx-chip--cinza' },
    OUTRO: { rotulo: 'Outro', classe: 'nx-chip--cinza' },
  };

  /** Mensagem de contagem para o aria-live. */
  readonly contagemTexto = computed(() => {
    if (this.carregando()) return 'Buscando pacientes...';
    if (!this.buscou()) return '';
    const n = this.total();
    if (n === 0) return 'Nenhum paciente encontrado.';
    return n === 1 ? '1 paciente encontrado.' : `${n} pacientes encontrados.`;
  });

  /** Rodapé da paginação: "Página X de Y · N pacientes". */
  readonly resumoPaginacao = computed(() => {
    const n = this.total();
    const rotuloN = n === 1 ? '1 paciente' : `${n} pacientes`;
    return `Página ${this.paginaAtual()} de ${this.totalPaginas()} · ${rotuloN}`;
  });

  /** Chips dos filtros ATIVOS (situação/sexo/unidade/idade). O termo tem o × próprio no campo. */
  readonly chips = computed<ChipFiltro[]>(() => {
    const lista: ChipFiltro[] = [];
    const sit = this.situacaoFiltro();
    if (sit) lista.push({ tipo: 'situacao', rotulo: `Situação: ${this.rotuloSituacaoFiltro(sit)}` });
    const sx = this.sexoFiltro();
    if (sx) lista.push({ tipo: 'sexo', rotulo: `Sexo: ${sx === 'M' ? 'Masculino' : 'Feminino'}` });
    const uni = this.unidadeFiltro();
    if (uni != null) lista.push({ tipo: 'unidade', rotulo: `Unidade: ${this.nomeUnidadePorId(uni)}` });
    const rotIdade = this.rotuloFaixaEtaria();
    if (rotIdade) lista.push({ tipo: 'idade', rotulo: rotIdade });
    return lista;
  });

  /** Rótulo do chip de idade — só quando a faixa é válida e tem ao menos um lado. '' oculta o chip. */
  private rotuloFaixaEtaria(): string {
    const min = this.idadeMinFiltro();
    const max = this.idadeMaxFiltro();
    if (!this.faixaEtariaValida(min, max)) return ''; // min>max: ignora até corrigir
    if (min != null && max != null) return `Idade: ${min}–${max}`;
    if (min != null) return `Idade: ≥${min}`;
    if (max != null) return `Idade: ≤${max}`;
    return '';
  }

  /** True quando há qualquer filtro de conteúdo ativo → exibe "Limpar filtros". */
  readonly temFiltroAtivo = computed(
    () =>
      this.termo().trim() !== '' ||
      this.situacaoFiltro() !== '' ||
      this.sexoFiltro() !== '' ||
      this.unidadeFiltro() != null ||
      this.idadeMinFiltro() != null ||
      this.idadeMaxFiltro() != null
  );

  /** True quando TODOS os pacientes da página atual estão selecionados (página não vazia). */
  readonly paginaTodaSelecionada = computed(() => {
    const lista = this.pacientes();
    if (lista.length === 0) return false;
    const sel = this.selecionados();
    return lista.every((p) => sel.has(p.idProntPaciente));
  });

  /** True quando ALGUNS (mas não todos) da página estão selecionados (checkbox indeterminado). */
  readonly paginaParcialmenteSelecionada = computed(() => {
    const lista = this.pacientes();
    if (lista.length === 0) return false;
    const sel = this.selecionados();
    const marcados = lista.filter((p) => sel.has(p.idProntPaciente)).length;
    return marcados > 0 && marcados < lista.length;
  });

  /**
   * True quando a navegação que CRIOU o componente veio do histórico (popstate).
   * Precisa ser field initializer: roda durante a ativação da rota, quando a
   * navegação ainda é corrente — no ngOnInit getCurrentNavigation() já é null.
   */
  private readonly veioDoHistorico =
    this.router.getCurrentNavigation()?.trigger === 'popstate';

  private readonly req$ = new Subject<Requisicao>();
  private sub?: Subscription;
  private subEventos?: Subscription;
  private subUrl?: Subscription;
  /** Marca que a próxima emissão de queryParamMap veio de voltar/avançar (popstate). */
  private ehPopstate = false;

  ngOnInit(): void {
    this.unidadeAtiva.set(this.auth.getUnidadeAtiva());
    this.carregarUnidades();

    // Stream único da busca: digitação de texto com debounce 300ms; faixa etária com
    // 400ms (r.atraso); demais ações imediatas.
    this.sub = this.req$
      .pipe(
        debounce((r) => timer(r.imediato ? 0 : (r.atraso ?? 300))),
        tap(() => {
          this.erro.set(false);
          this.carregando.set(true);
        }),
        switchMap((r) => {
          const est = r.estado;
          const t = this.termoNormalizado(est.q);
          // Filtro de unidade tem prioridade; sem ele, respeita o escopo da clínica ativa.
          const idUnidade = est.unidade ?? this.unidadeAtiva().id;
          // Faixa etária só vai ao backend quando válida (min<=max ou um lado só);
          // min>max é ignorado (sem 400) até o usuário corrigir.
          const faixaOk = this.faixaEtariaValida(est.idadeMin, est.idadeMax);
          return this.prontuario
            .buscarPacientes(t, idUnidade, est.pagina, est.situacao, {
              tamanho: est.tam,
              sexo: est.sexo,
              ordenarPor: est.ord,
              direcao: est.dir,
              idadeMin: faixaOk ? est.idadeMin : null,
              idadeMax: faixaOk ? est.idadeMax : null,
            })
            .pipe(
              catchError((e: HttpErrorResponse) => {
                // Anônimo (hyperlink) tentando pesquisar: a busca exige login.
                if (e?.status === 401) this.precisaLogin.set(true);
                else this.erro.set(true);
                return of<ResultadoPaginado<PacienteBusca> | null>(null);
              })
            );
        })
      )
      .subscribe((res) => {
        this.carregando.set(false);
        if (res == null) {
          if (this.erro()) {
            this.buscou.set(true);
            this.pacientes.set([]);
            this.total.set(0);
            this.totalPaginas.set(1);
          }
          return;
        }
        this.buscou.set(true);
        this.pacientes.set(res.itens ?? []);
        this.total.set(res.total ?? res.itens?.length ?? 0);
        this.paginaAtual.set(res.pagina ?? 1);
        this.totalPaginas.set(res.totalPaginas ?? 1);
      });

    // Deep-link: /prontuario?cpf=99999999999 (hyperlink de outro sistema) resolve o
    // CPF e abre a ficha direto. Tem PRIORIDADE sobre os filtros da URL.
    const cpfParam = this.rota.snapshot.queryParamMap.get('cpf');
    const cpfDigitos = (cpfParam ?? '').replace(/\D/g, '');
    if (cpfDigitos.length === 11) {
      this.resolverCpf(cpfDigitos);
      return; // fluxo do deep-link cuida da navegação; não monta a busca.
    }
    if (cpfParam) {
      this.cpfNaoEncontrado.set('CPF inválido no link recebido (precisa de 11 dígitos).');
    }

    // Detecta voltar/avançar do navegador para re-hidratar o estado a partir da URL.
    this.subEventos = this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.ehPopstate = e.navigationTrigger === 'popstate';
    });
    this.subUrl = this.rota.queryParamMap.subscribe((pm) => {
      // Só reage a voltar/avançar; navegações internas (nossas) são ignoradas aqui
      // porque a própria ação já disparou a busca.
      if (!this.ehPopstate) return;
      this.ehPopstate = false;
      const est = this.lerEstado(pm);
      this.aplicarEstadoNosSignais(est);
      this.erro.set(false);
      this.carregando.set(true);
      this.emitir(est, true);
    });

    // Carga inicial: lê o estado da URL (refresh/link compartilhado) e busca.
    // URL sem NENHUM parâmetro de busca (entrada pelo menu) → restaura a última
    // busca da sessão (BuscaEstadoService) e reflete na URL sem sujar o histórico.
    // NÃO restaura em: navegação popstate (a entrada do histórico representa o
    // próprio estado — sem filtros É o estado dela) nem com ?cpf= presente,
    // mesmo vazio/inválido (o hyperlink é soberano).
    let pmInicial = this.rota.snapshot.queryParamMap;
    if (
      !this.veioDoHistorico &&
      cpfParam == null &&
      !this.temParamsDeBusca(pmInicial) &&
      this.buscaEstado.temEstado()
    ) {
      const salvos = this.buscaEstado.obter()!;
      pmInicial = convertToParamMap(salvos);
      this.router.navigate([], { relativeTo: this.rota, queryParams: salvos, replaceUrl: true });
    }
    const inicial = this.lerEstado(pmInicial);
    this.aplicarEstadoNosSignais(inicial);
    this.carregando.set(true);
    this.emitir(inicial, true);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.subEventos?.unsubscribe();
    this.subUrl?.unsubscribe();
  }

  // --------------------------------- Fonte do select de unidades ---------------------------------

  /** Popula o select de Unidade a partir de TBL_UNIDADE_ENVIO (rota /unidade-envio). */
  private carregarUnidades(): void {
    this.unidadeService.buscarUnidades().subscribe({
      next: (u) => this.unidades.set(u ?? []),
      error: () => this.unidades.set([]), // silencioso: o select fica só com "Todas".
    });
  }

  private nomeUnidadePorId(id: number): string {
    const u = this.unidades().find((x) => x.iD_UNIDADE === id);
    return u?.descricao ?? `Unidade ${id}`;
  }

  // --------------------------------- Estado <-> URL ---------------------------------

  /** Lê um EstadoBusca a partir dos queryParams (com normalização/defaults). */
  private lerEstado(pm: ParamMap): EstadoBusca {
    const q = pm.get('q') ?? '';
    const situacao = this.normalizarSituacao(pm.get('situacao'));
    const sexo = this.normalizarSexo(pm.get('sexo'));

    const uRaw = pm.get('unidade');
    const uNum = uRaw != null && uRaw !== '' ? Number(uRaw) : NaN;
    const unidade = Number.isFinite(uNum) ? uNum : null;

    const idadeMin = this.normalizarIdade(pm.get('im'));
    const idadeMax = this.normalizarIdade(pm.get('ix'));

    const pNum = Number(pm.get('pagina'));
    const pagina = Number.isFinite(pNum) && pNum >= 1 ? Math.floor(pNum) : 1;

    const tNum = Number(pm.get('tam'));
    const tam = this.TAMANHOS.includes(tNum) ? tNum : 20;

    const ord = this.normalizarOrd(pm.get('ord'));
    const dir: Direcao = pm.get('dir') === 'DESC' ? 'DESC' : 'ASC';

    return { q, situacao, sexo, unidade, idadeMin, idadeMax, pagina, tam, ord, dir };
  }

  /** Serializa o estado para queryParams; chaves em default viram null (removidas da URL). */
  private paraQueryParams(est: EstadoBusca): Params {
    return {
      q: est.q.trim() ? est.q : null,
      situacao: est.situacao || null,
      sexo: est.sexo || null,
      unidade: est.unidade != null ? est.unidade : null,
      im: est.idadeMin != null ? est.idadeMin : null,
      ix: est.idadeMax != null ? est.idadeMax : null,
      pagina: est.pagina > 1 ? est.pagina : null,
      tam: est.tam !== 20 ? est.tam : null,
      ord: est.ord || null,
      dir: est.ord && est.dir === 'DESC' ? 'DESC' : null,
    };
  }

  private estadoDosSignais(): EstadoBusca {
    return {
      q: this.termo(),
      situacao: this.situacaoFiltro(),
      sexo: this.sexoFiltro(),
      unidade: this.unidadeFiltro(),
      idadeMin: this.idadeMinFiltro(),
      idadeMax: this.idadeMaxFiltro(),
      pagina: this.paginaAtual(),
      tam: this.tamanhoPagina(),
      ord: this.ordenarPor(),
      dir: this.direcao(),
    };
  }

  private aplicarEstadoNosSignais(est: EstadoBusca): void {
    this.termo.set(est.q);
    this.situacaoFiltro.set(est.situacao);
    this.sexoFiltro.set(est.sexo);
    this.unidadeFiltro.set(est.unidade);
    this.idadeMinFiltro.set(est.idadeMin);
    this.idadeMaxFiltro.set(est.idadeMax);
    this.paginaAtual.set(est.pagina);
    this.tamanhoPagina.set(est.tam);
    this.ordenarPor.set(est.ord);
    this.direcao.set(est.dir);
    this.sincronizarSliderIdade(); // alças acompanham o estado hidratado (URL/popstate)
  }

  private normalizarSituacao(v: string | null): string {
    const up = (v ?? '').trim().toUpperCase();
    return this.opcoesSituacao.some((o) => o.valor === up) && up !== '' ? up : '';
  }

  private normalizarSexo(v: string | null): string {
    const up = (v ?? '').trim().toUpperCase();
    return up === 'M' || up === 'F' ? up : '';
  }

  private normalizarOrd(v: string | null): string {
    const up = (v ?? '').trim().toUpperCase() as ColunaOrd;
    return this.COLUNAS_ORD.includes(up) ? up : '';
  }

  /** Parseia/valida uma idade da URL ou de input: inteiro clampado a [0,130] ou null. */
  private normalizarIdade(v: string | number | null): number | null {
    if (v == null || v === '') return null;
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return null;
    return Math.min(this.IDADE_MAX, Math.max(this.IDADE_MIN, n));
  }

  /** Faixa etária utilizável: incompleta (um lado null) ou min<=max. min>max é inválido. */
  private faixaEtariaValida(min: number | null, max: number | null): boolean {
    return min == null || max == null || min <= max;
  }

  /** True quando a URL traz ao menos um parâmetro de busca (estado explícito). */
  private temParamsDeBusca(pm: ParamMap): boolean {
    return BuscaPacientesComponent.CHAVES_URL.some((chave) => pm.has(chave));
  }

  private emitir(est: EstadoBusca, imediato: boolean, atraso?: number): void {
    // Toda busca executada vira a "última busca" — é o que os botões
    // "Voltar à busca" usam para voltar com filtros/ordenação/página.
    this.buscaEstado.salvar(this.paraQueryParams(est));
    this.req$.next({ estado: est, imediato, atraso });
  }

  /**
   * Dispara a busca com o estado atual dos signals e sincroniza a URL.
   * replaceUrl=true na digitação (não polui o histórico); false nas ações discretas.
   * `atraso` sobrescreve o debounce (ms) quando !imediato (ex.: 400 na faixa etária).
   */
  private disparar(imediato: boolean, replaceUrl: boolean, atraso?: number): void {
    const est = this.estadoDosSignais();
    this.erro.set(false);
    this.carregando.set(true);
    this.emitir(est, imediato, atraso);
    this.router.navigate([], {
      relativeTo: this.rota,
      queryParams: this.paraQueryParams(est),
      replaceUrl,
    });
  }

  // --------------------------------- Handlers de filtros ---------------------------------

  aoDigitar(valor: string): void {
    this.termo.set(valor);
    this.paginaAtual.set(1); // nova busca por texto volta à página 1
    this.disparar(false, true); // debounce + replaceUrl (digitação)
  }

  aoMudarSituacao(valor: string): void {
    this.situacaoFiltro.set(valor);
    this.paginaAtual.set(1);
    this.disparar(true, false);
  }

  aoMudarSexo(valor: string): void {
    this.sexoFiltro.set(valor);
    this.paginaAtual.set(1);
    this.disparar(true, false);
  }

  aoMudarUnidade(valor: number | null): void {
    this.unidadeFiltro.set(valor == null ? null : Number(valor));
    this.paginaAtual.set(1);
    this.disparar(true, false);
  }

  /** Clampa um valor de alça ao intervalo [0,130] (inteiro). */
  private clampIdade(valor: string | number): number {
    const n = Math.floor(Number(valor));
    if (!Number.isFinite(n)) return this.IDADE_MIN;
    return Math.min(this.IDADE_MAX, Math.max(this.IDADE_MIN, n));
  }

  /** Arrasto da alça mínima (`input`): só move o label; trava em ≤ alça máxima (não cruza). */
  aoDeslizarIdadeMin(valor: string | number): void {
    this.idadeMinSlider.set(Math.min(this.clampIdade(valor), this.idadeMaxSlider()));
  }

  /** Arrasto da alça máxima (`input`): só move o label; trava em ≥ alça mínima (não cruza). */
  aoDeslizarIdadeMax(valor: string | number): void {
    this.idadeMaxSlider.set(Math.max(this.clampIdade(valor), this.idadeMinSlider()));
  }

  /**
   * Soltou a alça (`change`): converte as posições em filtro e dispara a busca.
   * Alça em 0/130 = sem limite (null) → 0–130 completo não manda idadeMin/idadeMax,
   * sem chip, some da URL (reusa a lógica idadeMin/idadeMax existente).
   */
  aoAplicarIdade(): void {
    const min = this.idadeMinSlider();
    const max = this.idadeMaxSlider();
    this.idadeMinFiltro.set(min <= this.IDADE_MIN ? null : min);
    this.idadeMaxFiltro.set(max >= this.IDADE_MAX ? null : max);
    this.paginaAtual.set(1);
    this.disparar(true, false);
  }

  /** Reposiciona as alças do slider a partir dos filtros aplicados (null → 0 / 130). */
  private sincronizarSliderIdade(): void {
    this.idadeMinSlider.set(this.idadeMinFiltro() ?? this.IDADE_MIN);
    this.idadeMaxSlider.set(this.idadeMaxFiltro() ?? this.IDADE_MAX);
  }

  aoMudarTamanho(valor: string | number): void {
    const n = Number(valor);
    this.tamanhoPagina.set(this.TAMANHOS.includes(n) ? n : 20);
    this.paginaAtual.set(1);
    this.disparar(true, false);
  }

  /** × do campo de busca: limpa só o texto (mantém demais filtros). */
  limparBusca(): void {
    this.termo.set('');
    this.paginaAtual.set(1);
    this.disparar(true, false);
  }

  /** "Limpar filtros": zera filtros de conteúdo + ordenação e volta à página 1 (mantém tamanho). */
  limparFiltros(): void {
    this.termo.set('');
    this.situacaoFiltro.set('');
    this.sexoFiltro.set('');
    this.unidadeFiltro.set(null);
    this.idadeMinFiltro.set(null);
    this.idadeMaxFiltro.set(null);
    this.sincronizarSliderIdade(); // alças voltam a 0–130
    this.ordenarPor.set('');
    this.direcao.set('ASC');
    this.paginaAtual.set(1);
    this.disparar(true, false);
  }

  /** Remove UM filtro pelo chip. */
  removerChip(tipo: ChipFiltro['tipo']): void {
    if (tipo === 'situacao') this.situacaoFiltro.set('');
    else if (tipo === 'sexo') this.sexoFiltro.set('');
    else if (tipo === 'unidade') this.unidadeFiltro.set(null);
    else if (tipo === 'idade') {
      this.idadeMinFiltro.set(null);
      this.idadeMaxFiltro.set(null);
      this.sincronizarSliderIdade(); // alças voltam a 0–130
    }
    this.paginaAtual.set(1);
    this.disparar(true, false);
  }

  private rotuloSituacaoFiltro(valor: string): string {
    return this.opcoesSituacao.find((o) => o.valor === valor)?.rotulo ?? valor;
  }

  /** Reexecuta a busca atual (botao "Tentar novamente"). */
  tentarNovamente(): void {
    this.erro.set(false);
    this.disparar(true, false);
  }

  // --------------------------------- Exportar CSV ---------------------------------

  /**
   * Exporta a busca ATUAL (mesmos filtros/ordenação, sem paginação) em CSV e
   * dispara o download no browser. Estado "Exportando…" no botão; erro discreto.
   */
  exportarCsv(): void {
    if (this.exportando()) return;
    this.exportando.set(true);
    this.erroExport.set(false);

    const est = this.estadoDosSignais();
    // Mesma resolução de escopo e faixa etária da busca.
    const idUnidade = est.unidade ?? this.unidadeAtiva().id;
    const faixaOk = this.faixaEtariaValida(est.idadeMin, est.idadeMax);

    this.prontuario
      .exportarPacientesCsv({
        filtro: this.termoNormalizado(est.q),
        situacao: est.situacao,
        sexo: est.sexo,
        idUnidade,
        idadeMin: faixaOk ? est.idadeMin : null,
        idadeMax: faixaOk ? est.idadeMax : null,
        ordenarPor: est.ord,
        direcao: est.dir,
      })
      .subscribe({
        next: (blob) => {
          this.exportando.set(false);
          this.baixarBlob(blob, this.nomeArquivoCsv());
        },
        error: () => {
          this.exportando.set(false);
          this.erroExport.set(true);
        },
      });
  }

  /** Dispara o download de um Blob (SSR-safe: sem document/URL no servidor, no-op). */
  private baixarBlob(blob: Blob, nomeArquivo: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /** Nome do arquivo CSV com a data de hoje (pacientes-YYYY-MM-DD.csv). */
  private nomeArquivoCsv(): string {
    const iso = new Date().toISOString().slice(0, 10);
    return `pacientes-${iso}.csv`;
  }

  // --------------------------------- Ordenação ---------------------------------

  ordenarPorColuna(coluna: ColunaOrd): void {
    if (this.ordenarPor() === coluna) {
      this.direcao.set(this.direcao() === 'ASC' ? 'DESC' : 'ASC'); // 2º clique inverte
    } else {
      this.ordenarPor.set(coluna); // 1º clique = ASC
      this.direcao.set('ASC');
    }
    this.paginaAtual.set(1); // reordenar volta à página 1
    this.disparar(true, false);
  }

  /** Valor do aria-sort para o cabeçalho. */
  ariaSort(coluna: ColunaOrd): 'ascending' | 'descending' | 'none' {
    if (this.ordenarPor() !== coluna) return 'none';
    return this.direcao() === 'ASC' ? 'ascending' : 'descending';
  }

  /** Seta visual do cabeçalho (▲/▼) — vazio quando a coluna não é a ativa. */
  indicadorOrd(coluna: ColunaOrd): string {
    if (this.ordenarPor() !== coluna) return '';
    return this.direcao() === 'ASC' ? '▲' : '▼';
  }

  // --------------------------------- Paginação ---------------------------------

  irParaPagina(pagina: number): void {
    const alvo = Math.min(Math.max(1, pagina), this.totalPaginas());
    if (alvo === this.paginaAtual() || this.carregando()) return;
    this.paginaAtual.set(alvo);
    this.disparar(true, false);
  }

  paginaAnterior(): void {
    this.irParaPagina(this.paginaAtual() - 1);
  }

  proximaPagina(): void {
    this.irParaPagina(this.paginaAtual() + 1);
  }

  primeiraPagina(): void {
    this.irParaPagina(1);
  }

  ultimaPagina(): void {
    this.irParaPagina(this.totalPaginas());
  }

  // --------------------------------- Seleção múltipla ---------------------------------

  estaSelecionado(id: number): boolean {
    return this.selecionados().has(id);
  }

  /** Alterna a seleção de UMA linha. O clique no checkbox NÃO abre a ficha (stopPropagation no template). */
  alternarSelecao(p: PacienteBusca): void {
    this.selecionados.update((mapa) => {
      const novo = new Map(mapa);
      if (novo.has(p.idProntPaciente)) {
        novo.delete(p.idProntPaciente);
      } else {
        novo.set(p.idProntPaciente, { id: p.idProntPaciente, nome: p.nome ?? '' });
      }
      return novo;
    });
  }

  /** Marca/desmarca TODA a página atual (persiste na seleção global). */
  alternarPagina(): void {
    const lista = this.pacientes();
    if (lista.length === 0) return;
    const todosMarcados = this.paginaTodaSelecionada();
    this.selecionados.update((mapa) => {
      const novo = new Map(mapa);
      for (const p of lista) {
        if (todosMarcados) {
          novo.delete(p.idProntPaciente);
        } else {
          novo.set(p.idProntPaciente, { id: p.idProntPaciente, nome: p.nome ?? '' });
        }
      }
      return novo;
    });
  }

  limparSelecao(): void {
    this.selecionados.set(new Map());
  }

  imprimirSelecionados(): void {
    const ids = [...this.selecionados().keys()];
    if (ids.length === 0) return;
    this.router.navigate(['/prontuario', 'imprimir-lote'], {
      queryParams: { ids: ids.join(',') },
    });
  }

  // --------------------------------- Situação (chip) ---------------------------------

  /** Normaliza a situação (uppercase; null/vazio => ATIVO). */
  private situacaoChave(p: PacienteBusca): string {
    return (p.situacao ?? '').trim().toUpperCase() || 'ATIVO';
  }

  /** True quando há chip de situação a exibir (tudo que não é ATIVO). */
  temChipSituacao(p: PacienteBusca): boolean {
    return this.situacaoChave(p) !== 'ATIVO';
  }

  classeSituacao(p: PacienteBusca): string {
    return this.SITUACOES[this.situacaoChave(p)]?.classe ?? 'nx-chip--cinza';
  }

  rotuloSituacao(p: PacienteBusca): string {
    const chave = this.situacaoChave(p);
    const base = this.SITUACOES[chave]?.rotulo ?? chave;
    const data = this.formatarData(p.dataSituacao);
    return p.dataSituacao && data !== '—' ? `${base} · ${data}` : base;
  }

  // --------------------------------- Colunas derivadas ---------------------------------

  /** Idade em anos, calculada de dataNascimento (fallback: campo idade da origem). */
  private idadeAnos(p: PacienteBusca): number | null {
    if (p.dataNascimento) {
      const nasc = new Date(p.dataNascimento);
      if (!isNaN(nasc.getTime())) {
        const hoje = new Date();
        let anos = hoje.getFullYear() - nasc.getFullYear();
        const m = hoje.getMonth() - nasc.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
        if (anos >= 0 && anos < 200) return anos;
      }
    }
    return p.idade ?? null;
  }

  /** Texto da coluna Idade no formato 'XX a' (ou '—' quando indisponível). */
  idadeTexto(p: PacienteBusca): string {
    const a = this.idadeAnos(p);
    return a == null ? '—' : `${a} a`;
  }

  /** Nome da unidade do paciente (coluna Unidade); fallback para nomeClinica legado. */
  nomeUnidade(p: PacienteBusca): string {
    return p.nomeUnidade || p.nomeClinica || '—';
  }

  // --------------------------------- Navegação / util ---------------------------------

  abrirPaciente(p: PacienteBusca): void {
    this.router.navigate(['/prontuario', 'paciente', p.idProntPaciente]);
  }

  irParaLogin(): void {
    this.router.navigate(['/login'], { queryParams: { returnUrl: '/prontuario' } });
  }

  /** Resolve o CPF do deep-link e navega para a ficha (replaceUrl tira o CPF do histórico). */
  private resolverCpf(cpfDigitos: string): void {
    this.resolvendoCpf.set(true);
    this.prontuario.pacientePorCpf(cpfDigitos).subscribe({
      next: (id) => {
        this.resolvendoCpf.set(false);
        this.router.navigate(['/prontuario', 'paciente', id], { replaceUrl: true });
      },
      error: (e: HttpErrorResponse) => {
        this.resolvendoCpf.set(false);
        if (e?.status === 401) {
          // Flag de acesso anônimo desligada no backend: cai no fluxo com login.
          this.router.navigate(['/login'], {
            queryParams: { returnUrl: `/prontuario?cpf=${cpfDigitos}` },
          });
          return;
        }
        this.cpfNaoEncontrado.set(
          e?.status === 404
            ? 'Nenhum paciente encontrado para o CPF informado no link.'
            : 'Não foi possível localizar o paciente do link. Tente novamente.'
        );
      },
    });
  }

  /** Enter/Espaco na linha abre o paciente (acessibilidade de linha clicavel). */
  aoTeclaLinha(evento: KeyboardEvent, p: PacienteBusca): void {
    // Ignora quando o foco está num controle interativo (checkbox / link) da linha.
    const alvo = evento.target as HTMLElement | null;
    if (alvo && alvo.closest('input, button, a')) return;
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      this.abrirPaciente(p);
    }
  }

  formatarData(v: string | null): string {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }

  /**
   * Formata CPF completo como 000.000.000-00. Null-safe: retorna '' quando não há
   * 11 dígitos (o template cai no fallback cpfMascarado). Nunca aplica máscara de ***.
   */
  formatarCpf(cpf: string | null | undefined): string {
    const d = (cpf ?? '').replace(/\D/g, '');
    if (d.length !== 11) return '';
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  /** Normaliza para comparacao de tamanho: colapsa espacos (nome) sem descartar CPF. */
  private termoNormalizado(v: string): string {
    return (v ?? '').trim().replace(/\s+/g, ' ');
  }
}
