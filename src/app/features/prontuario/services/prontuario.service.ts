// features/prontuario/services/prontuario.service.ts
//
// Cliente HTTP da area de PRONTUARIO (V1 somente-leitura).
// Bate exatamente nas rotas de DiaverumApi/Endpoints/ProntuarioEndpoints.cs,
// grupo GET /api/prontuario. Todas as respostas usam o envelope { sucesso, dados }
// (rotas paginadas por offset trazem tambem `paginacao`; a timeline traz cursor).
//
// O Authorization: Bearer e injetado pelo core/interceptors/auth.interceptor.ts —
// este service NAO seta header algum. providedIn root.
//
// Contrato de retorno (alinhado aos consumidores das abas):
//   - Endpoints de LISTA simples devolvem array puro (ex.: evolucoes, prescricoes,
//     sessoes, exames, alergias, problemas, documentos).
//   - A BUSCA devolve ResultadoPaginado<T> (precisa de total/pagina).
//   - A LINHA DO TEMPO devolve TimelinePagina (keyset com cursor).

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  PacienteBusca,
  Cabecalho,
  Resumo,
  Evolucao,
  Prescricao,
  SessaoResumo,
  SessaoDetalhe,
  ExameLeitura,
  AlergiaLeitura,
  ProblemaLeitura,
  Cadastro,
  DocumentoLeitura,
  DocumentoCriado,
  EventoTimeline,
  ResultadoPaginado,
  TimelinePagina,
  CriarEvolucaoPayload,
  RetificarEvolucaoPayload,
  CancelarEvolucaoPayload,
  EvolucaoCriada,
  CriarAlergiaPayload,
  AlergiaCriada,
  CriarProblemaPayload,
  ProblemaCriado,
  CancelarPayload,
  CriarPrescricaoPayload,
  PrescricaoCriada,
  CriarSessaoPayload,
  SessaoCriada,
  MarcadorViral,
  Vacina,
  AcessoVascular,
  SolExame,
  Transplante,
  SaePlano,
  VinculoFilaItem,
  VinculoCandidato,
} from '../models/prontuario.models';

// Re-export para os consumidores que importam TimelinePagina a partir do service.
export type { TimelinePagina } from '../models/prontuario.models';

/** Opcoes da linha do tempo (keyset). */
export interface OpcoesLinhaDoTempo {
  tipos?: string[] | null;
  de?: string | null;
  ate?: string | null;
  cursor?: string | null;
  tamanho?: number | null;
}

/**
 * Opcoes ADITIVAS da busca de pacientes (rework v2 do grid). Todas opcionais —
 * quando ausentes o backend aplica os defaults (tamanho=20, sem filtro de sexo,
 * ordenacao padrao ORDER BY NOME). Mantem a assinatura posicional compativel.
 */
export interface OpcoesBuscaPacientes {
  /** Itens por pagina: 20 | 50 | 100 (default backend = 20). */
  tamanho?: number | null;
  /** Filtro de sexo: 'M' | 'F' (vazio/null = ambos). */
  sexo?: string | null;
  /** Coluna de ordenacao: 'NOME' | 'NASCIMENTO' | 'SITUACAO' | 'UNIDADE'. */
  ordenarPor?: string | null;
  /** Direcao da ordenacao: 'ASC' | 'DESC' (so aplicada com ordenarPor). */
  direcao?: string | null;
  /** Filtro de unidade de envio; sobrescreve o idUnidade posicional quando informado. */
  idUnidade?: number | null;
  /** Idade minima (0..130). Enviada apenas quando definida. */
  idadeMin?: number | null;
  /** Idade maxima (0..130). Enviada apenas quando definida. */
  idadeMax?: number | null;
}

/**
 * Filtros/ordenacao para a EXPORTACAO CSV. Espelha os mesmos parametros da busca,
 * porem SEM paginacao (pagina/tamanho) — o backend exporta o resultado inteiro.
 */
export interface OpcoesExportarCsv {
  /** Texto do campo unico (nome OU CPF). Sempre enviado (vazio = todos). */
  filtro?: string | null;
  /** Situacao cadastral ('' = todas). */
  situacao?: string | null;
  /** Sexo: 'M' | 'F' (vazio/null = ambos). */
  sexo?: string | null;
  /** Unidade de envio (idUnidade). null = escopo padrao. */
  idUnidade?: number | null;
  /** Idade minima (0..130). Enviada apenas quando definida. */
  idadeMin?: number | null;
  /** Idade maxima (0..130). Enviada apenas quando definida. */
  idadeMax?: number | null;
  /** Coluna de ordenacao (whitelist do backend). */
  ordenarPor?: string | null;
  /** Direcao da ordenacao: 'ASC' | 'DESC' (so aplicada com ordenarPor). */
  direcao?: string | null;
}

/**
 * Formato cru de um item da fila de vinculo antes de normalizar. A origem pode
 * mandar `candidatos` (array), `candidatos` (string JSON) ou `candidatosJson`.
 */
interface VinculoFilaRaw {
  idProntPaciente: number;
  nome: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  statusMatch: number | string | null;
  motivoConflito: string | null;
  candidatos?: VinculoCandidato[] | string | null;
  candidatosJson?: string | null;
}

/** Formato bruto do envelope de resposta do backend. */
interface Envelope<T> {
  sucesso?: boolean;
  dados?: T;
  paginacao?: {
    paginaAtual?: number;
    tamanhoPagina?: number;
    totalRegistros?: number;
    totalPaginas?: number;
    tamanho?: number;
    temMais?: boolean;
    proximoCursor?: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class ProntuarioService {
  private readonly baseUrl = `${environment.apiUrl}/prontuario`;
  private readonly http = inject(HttpClient);

  // ---------------------------------------------------------------------------
  // BUSCA (lista). CPF mascarado. Filtro OPCIONAL: vazio lista TODOS os pacientes
  // (paginado, ORDER BY NOME no backend); com texto, refina por nome/CPF (LIKE).
  // A busca continua SEMPRE autenticada (P3).
  // ---------------------------------------------------------------------------

  buscarPacientes(
    filtro: string,
    idUnidade?: number | null,
    pagina: number = 1,
    situacao: string = '',
    opcoes: OpcoesBuscaPacientes = {}
  ): Observable<ResultadoPaginado<PacienteBusca>> {
    let params = new HttpParams().set('filtro', filtro).set('pagina', String(pagina));

    // idUnidade do objeto de opcoes tem prioridade sobre o posicional (filtro de unidade).
    const unidade = opcoes.idUnidade != null ? opcoes.idUnidade : idUnidade;
    if (unidade != null) {
      params = params.set('idUnidade', String(unidade));
    }
    // Filtro de situacao OPCIONAL: vazio = todas as situacoes (backend nao filtra).
    if (situacao) {
      params = params.set('situacao', situacao);
    }
    // --- Novos parametros aditivos (rework v2). Enviados apenas quando presentes. ---
    if (opcoes.tamanho != null) {
      params = params.set('tamanho', String(opcoes.tamanho));
    }
    if (opcoes.sexo) {
      params = params.set('sexo', opcoes.sexo);
    }
    if (opcoes.ordenarPor) {
      params = params.set('ordenarPor', opcoes.ordenarPor);
      // direcao so faz sentido acompanhada de uma coluna de ordenacao.
      params = params.set('direcao', opcoes.direcao || 'ASC');
    }
    // Faixa etaria (0..130). Enviadas apenas quando definidas.
    if (opcoes.idadeMin != null) {
      params = params.set('idadeMin', String(opcoes.idadeMin));
    }
    if (opcoes.idadeMax != null) {
      params = params.set('idadeMax', String(opcoes.idadeMax));
    }
    return this.http
      .get<Envelope<PacienteBusca[]>>(`${this.baseUrl}/pacientes`, { params })
      .pipe(map((r) => this.desembrulharPaginado<PacienteBusca>(r)));
  }

  /**
   * Exporta o resultado da busca em CSV (blob text/csv). Usa os MESMOS filtros e
   * ordenacao da busca, SEM paginacao — o backend materializa o conjunto inteiro.
   * O download em si (createObjectURL + <a download>) fica na camada de UI.
   */
  exportarPacientesCsv(opcoes: OpcoesExportarCsv = {}): Observable<Blob> {
    // filtro sempre presente (vazio = todos), espelhando buscarPacientes.
    let params = new HttpParams().set('filtro', (opcoes.filtro ?? '').trim());
    if (opcoes.situacao) {
      params = params.set('situacao', opcoes.situacao);
    }
    if (opcoes.sexo) {
      params = params.set('sexo', opcoes.sexo);
    }
    if (opcoes.idUnidade != null) {
      params = params.set('idUnidade', String(opcoes.idUnidade));
    }
    if (opcoes.idadeMin != null) {
      params = params.set('idadeMin', String(opcoes.idadeMin));
    }
    if (opcoes.idadeMax != null) {
      params = params.set('idadeMax', String(opcoes.idadeMax));
    }
    if (opcoes.ordenarPor) {
      params = params.set('ordenarPor', opcoes.ordenarPor);
      params = params.set('direcao', opcoes.direcao || 'ASC');
    }
    return this.http.get(`${this.baseUrl}/pacientes/exportar-csv`, {
      params,
      responseType: 'blob',
    });
  }

  /**
   * Resolve um CPF COMPLETO (11 dígitos; aceita máscara) para o id do espelho.
   * Fluxo do hyperlink vindo de outro sistema (/prontuario?cpf=...). 404 se não achar.
   */
  pacientePorCpf(cpf: string): Observable<number> {
    const digitos = (cpf || '').replace(/\D/g, '');
    return this.http
      .get<Envelope<{ idProntPaciente: number }>>(`${this.baseUrl}/pacientes/por-cpf/${digitos}`)
      .pipe(map((r) => this.desembrulhar<{ idProntPaciente: number }>(r).idProntPaciente));
  }

  // ---------------------------------------------------------------------------
  // Rotas chaveadas por idProntPaciente.
  // ---------------------------------------------------------------------------

  obterCabecalho(id: number): Observable<Cabecalho> {
    return this.http
      .get<Envelope<Cabecalho>>(`${this.baseUrl}/paciente/${id}/cabecalho`)
      .pipe(map((r) => this.desembrulhar<Cabecalho>(r)));
  }

  obterResumo(id: number): Observable<Resumo> {
    return this.http
      .get<Envelope<Resumo>>(`${this.baseUrl}/paciente/${id}/resumo`)
      .pipe(map((r) => this.desembrulhar<Resumo>(r)));
  }

  obterLinhaDoTempo(id: number, opcoes: OpcoesLinhaDoTempo = {}): Observable<TimelinePagina> {
    let params = new HttpParams();
    if (opcoes.tipos && opcoes.tipos.length > 0) {
      params = params.set('tipos', opcoes.tipos.join(','));
    }
    if (opcoes.de) params = params.set('de', opcoes.de);
    if (opcoes.ate) params = params.set('ate', opcoes.ate);
    if (opcoes.cursor) params = params.set('cursor', opcoes.cursor);
    if (opcoes.tamanho != null) params = params.set('tamanho', String(opcoes.tamanho));

    return this.http
      .get<Envelope<EventoTimeline[]>>(`${this.baseUrl}/paciente/${id}/linha-do-tempo`, { params })
      .pipe(map((r) => this.desembrulharTimeline(r)));
  }

  /**
   * Plano de SAE (Sistematizacao da Assistencia de Enfermagem) do paciente.
   * GET .../sae -> array puro (uma linha por diagnostico/prescricao com execucoes).
   */
  listarSae(id: number): Observable<SaePlano[]> {
    return this.http
      .get<Envelope<SaePlano[]>>(`${this.baseUrl}/paciente/${id}/sae`)
      .pipe(map((r) => this.desembrulharLista<SaePlano>(r)));
  }

  /**
   * Lista de evolucoes (pagina 1 por padrao). Devolve array puro.
   * `verCanceladas=true` inclui as canceladas (senao o backend as filtra).
   */
  listarEvolucoes(
    id: number,
    pagina: number = 1,
    verCanceladas: boolean = false
  ): Observable<Evolucao[]> {
    let params = new HttpParams().set('pagina', String(pagina));
    if (verCanceladas) params = params.set('verCanceladas', 'true');
    return this.http
      .get<Envelope<Evolucao[]>>(`${this.baseUrl}/paciente/${id}/evolucoes`, { params })
      .pipe(map((r) => this.desembrulharLista<Evolucao>(r)));
  }

  // ---------------------------------------------------------------------------
  // ESCRITA de evolucao (Etapa 1 — nativo). Rotas do grupo ProntuarioEscrita:
  // exigem Bearer (nunca anonimo, P3). O interceptor injeta o header.
  // ---------------------------------------------------------------------------

  /** Inclui uma evolucao NATIVA (fonte NATIVO). POST .../evolucoes -> 201 {idEvolucao}. */
  criarEvolucao(id: number, payload: CriarEvolucaoPayload): Observable<EvolucaoCriada> {
    return this.http
      .post<Envelope<EvolucaoCriada>>(`${this.baseUrl}/paciente/${id}/evolucoes`, payload)
      .pipe(map((r) => this.desembrulhar<EvolucaoCriada>(r)));
  }

  /**
   * Retifica uma evolucao NATIVA: cancela a original (motivo "Retificada") e cria
   * a nova vinculada. So vale para registro nativo nao-cancelado (P2/P5).
   */
  retificarEvolucao(
    id: number,
    idEvolucao: number,
    payload: RetificarEvolucaoPayload
  ): Observable<EvolucaoCriada> {
    return this.http
      .post<Envelope<EvolucaoCriada>>(
        `${this.baseUrl}/paciente/${id}/evolucoes/${idEvolucao}/retificar`,
        payload
      )
      .pipe(map((r) => this.desembrulhar<EvolucaoCriada>(r)));
  }

  /** Cancela logicamente uma evolucao NATIVA (motivo obrigatorio). POST .../cancelar. */
  cancelarEvolucao(
    id: number,
    idEvolucao: number,
    payload: CancelarEvolucaoPayload
  ): Observable<void> {
    return this.http
      .post<Envelope<unknown>>(
        `${this.baseUrl}/paciente/${id}/evolucoes/${idEvolucao}/cancelar`,
        payload
      )
      .pipe(map(() => void 0));
  }

  /**
   * Lista de prescricoes. Devolve array puro. `verCanceladas=true` inclui as
   * suspensas (senao o backend as filtra). Chamada sem o 2o arg mantem
   * compatibilidade com quem faz listarPrescricoes(id).
   */
  listarPrescricoes(id: number, verCanceladas: boolean = false): Observable<Prescricao[]> {
    let params = new HttpParams();
    if (verCanceladas) params = params.set('verCanceladas', 'true');
    return this.http
      .get<Envelope<Prescricao[]>>(`${this.baseUrl}/paciente/${id}/prescricoes`, { params })
      .pipe(map((r) => this.desembrulharLista<Prescricao>(r)));
  }

  // ---------------------------------------------------------------------------
  // ESCRITA de prescricao (Etapa 3 — nativo). Exige Bearer (nunca anonimo).
  // ---------------------------------------------------------------------------

  /** Inclui uma prescricao NATIVA (cabecalho + itens). POST .../prescricoes -> { idPrescricao }. */
  criarPrescricao(id: number, payload: CriarPrescricaoPayload): Observable<PrescricaoCriada> {
    return this.http
      .post<Envelope<PrescricaoCriada>>(`${this.baseUrl}/paciente/${id}/prescricoes`, payload)
      .pipe(map((r) => this.desembrulhar<PrescricaoCriada>(r)));
  }

  /** Suspende (encerra vigencia) uma prescricao NATIVA (motivo obrigatorio). POST .../suspender. */
  suspenderPrescricao(
    id: number,
    idPrescricao: number,
    payload: CancelarPayload
  ): Observable<void> {
    return this.http
      .post<Envelope<unknown>>(
        `${this.baseUrl}/paciente/${id}/prescricoes/${idPrescricao}/suspender`,
        payload
      )
      .pipe(map(() => void 0));
  }

  /**
   * Lista de sessoes de HD (pagina 1 por padrao). Devolve array puro.
   * `verCanceladas=true` inclui as canceladas (senao o backend as filtra). Chamada
   * sem o 3o arg mantem compatibilidade com listarSessoes(id, pagina) e listarSessoes(id).
   */
  listarSessoes(
    id: number,
    pagina: number = 1,
    verCanceladas: boolean = false
  ): Observable<SessaoResumo[]> {
    let params = new HttpParams().set('pagina', String(pagina));
    if (verCanceladas) params = params.set('verCanceladas', 'true');
    return this.http
      .get<Envelope<SessaoResumo[]>>(`${this.baseUrl}/paciente/${id}/sessoes`, { params })
      .pipe(map((r) => this.desembrulharLista<SessaoResumo>(r)));
  }

  /**
   * Detalhe de uma sessao (com sinais vitais). `verCanceladas=true` permite abrir
   * uma sessao cancelada. Chamada sem o 3o arg mantem compat com obterSessao(id, idSessao).
   */
  obterSessao(
    id: number,
    idSessao: number,
    verCanceladas: boolean = false
  ): Observable<SessaoDetalhe> {
    let params = new HttpParams();
    if (verCanceladas) params = params.set('verCanceladas', 'true');
    return this.http
      .get<Envelope<SessaoDetalhe>>(`${this.baseUrl}/paciente/${id}/sessoes/${idSessao}`, { params })
      .pipe(map((r) => this.desembrulhar<SessaoDetalhe>(r)));
  }

  // ---------------------------------------------------------------------------
  // ESCRITA de sessao de HD (Etapa 4 — nativo). Exige Bearer (nunca anonimo).
  // Fica atras da flag de ambiente prontuarioSessaoNativa (UI) + flag backend.
  // ---------------------------------------------------------------------------

  /** Inclui uma sessao de HD NATIVA (cabecalho + sinais). POST .../sessoes -> { idSessao }. */
  criarSessao(id: number, payload: CriarSessaoPayload): Observable<SessaoCriada> {
    return this.http
      .post<Envelope<SessaoCriada>>(`${this.baseUrl}/paciente/${id}/sessoes`, payload)
      .pipe(map((r) => this.desembrulhar<SessaoCriada>(r)));
  }

  /** Cancela logicamente uma sessao de HD NATIVA (motivo obrigatorio). POST .../cancelar. */
  cancelarSessao(id: number, idSessao: number, payload: CancelarPayload): Observable<void> {
    return this.http
      .post<Envelope<unknown>>(
        `${this.baseUrl}/paciente/${id}/sessoes/${idSessao}/cancelar`,
        payload
      )
      .pipe(map(() => void 0));
  }

  listarExames(id: number): Observable<ExameLeitura[]> {
    return this.http
      .get<Envelope<ExameLeitura[]>>(`${this.baseUrl}/paciente/${id}/exames`)
      .pipe(map((r) => this.desembrulharLista<ExameLeitura>(r)));
  }

  /**
   * Lista de alergias. Devolve array puro. `verCanceladas=true` inclui as
   * canceladas (senao o backend as filtra). Chamada sem o 2o arg mantem
   * compatibilidade com quem faz listarAlergias(id).
   */
  listarAlergias(id: number, verCanceladas: boolean = false): Observable<AlergiaLeitura[]> {
    let params = new HttpParams();
    if (verCanceladas) params = params.set('verCanceladas', 'true');
    return this.http
      .get<Envelope<AlergiaLeitura[]>>(`${this.baseUrl}/paciente/${id}/alergias`, { params })
      .pipe(map((r) => this.desembrulharLista<AlergiaLeitura>(r)));
  }

  /**
   * Lista de problemas/CID. Devolve array puro. `verCanceladas=true` inclui as
   * canceladas (senao o backend as filtra). Compat com listarProblemas(id).
   */
  listarProblemas(id: number, verCanceladas: boolean = false): Observable<ProblemaLeitura[]> {
    let params = new HttpParams();
    if (verCanceladas) params = params.set('verCanceladas', 'true');
    return this.http
      .get<Envelope<ProblemaLeitura[]>>(`${this.baseUrl}/paciente/${id}/problemas`, { params })
      .pipe(map((r) => this.desembrulharLista<ProblemaLeitura>(r)));
  }

  // ---------------------------------------------------------------------------
  // ESCRITA de alergia (Etapa 2 — nativo). Exige Bearer (nunca anonimo).
  // ---------------------------------------------------------------------------

  /** Inclui uma alergia NATIVA. POST .../alergias -> { idAlergia }. */
  criarAlergia(id: number, payload: CriarAlergiaPayload): Observable<AlergiaCriada> {
    return this.http
      .post<Envelope<AlergiaCriada>>(`${this.baseUrl}/paciente/${id}/alergias`, payload)
      .pipe(map((r) => this.desembrulhar<AlergiaCriada>(r)));
  }

  /** Cancela logicamente uma alergia NATIVA (motivo obrigatorio). POST .../cancelar. */
  cancelarAlergia(
    id: number,
    idAlergia: number,
    payload: CancelarPayload
  ): Observable<void> {
    return this.http
      .post<Envelope<unknown>>(
        `${this.baseUrl}/paciente/${id}/alergias/${idAlergia}/cancelar`,
        payload
      )
      .pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------
  // ESCRITA de problema/CID (Etapa 2 — nativo). Exige Bearer (nunca anonimo).
  // ---------------------------------------------------------------------------

  /** Inclui um problema/CID NATIVO. POST .../problemas -> { idProblema }. */
  criarProblema(id: number, payload: CriarProblemaPayload): Observable<ProblemaCriado> {
    return this.http
      .post<Envelope<ProblemaCriado>>(`${this.baseUrl}/paciente/${id}/problemas`, payload)
      .pipe(map((r) => this.desembrulhar<ProblemaCriado>(r)));
  }

  /** Cancela logicamente um problema NATIVO (motivo obrigatorio). POST .../cancelar. */
  cancelarProblema(
    id: number,
    idProblema: number,
    payload: CancelarPayload
  ): Observable<void> {
    return this.http
      .post<Envelope<unknown>>(
        `${this.baseUrl}/paciente/${id}/problemas/${idProblema}/cancelar`,
        payload
      )
      .pipe(map(() => void 0));
  }

  obterCadastro(id: number): Observable<Cadastro> {
    return this.http
      .get<Envelope<Cadastro>>(`${this.baseUrl}/paciente/${id}/cadastro`)
      .pipe(map((r) => this.desembrulhar<Cadastro>(r)));
  }

  // ---------------------------------------------------------------------------
  // Dados aditivos da migracao NephroSys (5 rotas GET, somente leitura).
  // Envelope { sucesso, dados }; as 4 primeiras devolvem array puro, a de
  // transplante devolve objeto ou null.
  // ---------------------------------------------------------------------------

  /** Marcadores virais/sorologias. GET .../marcadores-virais -> array puro. */
  listarMarcadoresVirais(id: number): Observable<MarcadorViral[]> {
    return this.http
      .get<Envelope<MarcadorViral[]>>(`${this.baseUrl}/paciente/${id}/marcadores-virais`)
      .pipe(map((r) => this.desembrulharLista<MarcadorViral>(r)));
  }

  /** Vacinas aplicadas. GET .../vacinas -> array puro. */
  listarVacinas(id: number): Observable<Vacina[]> {
    return this.http
      .get<Envelope<Vacina[]>>(`${this.baseUrl}/paciente/${id}/vacinas`)
      .pipe(map((r) => this.desembrulharLista<Vacina>(r)));
  }

  /** Acessos vasculares cadastrados (com eventos aninhados). GET .../acessos-vasculares. */
  listarAcessosVasculares(id: number): Observable<AcessoVascular[]> {
    return this.http
      .get<Envelope<AcessoVascular[]>>(`${this.baseUrl}/paciente/${id}/acessos-vasculares`)
      .pipe(map((r) => this.desembrulharLista<AcessoVascular>(r)));
  }

  /** Solicitacoes de exame. GET .../sol-exames -> array puro. */
  listarSolExames(id: number): Observable<SolExame[]> {
    return this.http
      .get<Envelope<SolExame[]>>(`${this.baseUrl}/paciente/${id}/sol-exames`)
      .pipe(map((r) => this.desembrulharLista<SolExame>(r)));
  }

  /** Dados de transplante. GET .../transplante -> objeto ou null (desembrulha o envelope). */
  obterTransplante(id: number): Observable<Transplante | null> {
    return this.http
      .get<Envelope<Transplante | null>>(`${this.baseUrl}/paciente/${id}/transplante`)
      .pipe(map((r) => this.desembrulhar<Transplante | null>(r) ?? null));
  }

  /**
   * Lista de documentos/laudos. Devolve array puro. `verCanceladas=true` inclui os
   * cancelados (senao o backend os filtra). Chamada sem o 2o arg mantem
   * compatibilidade com quem faz listarDocumentos(id).
   */
  listarDocumentos(id: number, verCanceladas: boolean = false): Observable<DocumentoLeitura[]> {
    let params = new HttpParams();
    if (verCanceladas) params = params.set('verCanceladas', 'true');
    return this.http
      .get<Envelope<DocumentoLeitura[]>>(`${this.baseUrl}/paciente/${id}/documentos`, { params })
      .pipe(map((r) => this.desembrulharLista<DocumentoLeitura>(r)));
  }

  // ---------------------------------------------------------------------------
  // ESCRITA de documento/laudo (Etapa 5 — nativo). Exige Bearer (nunca anonimo).
  // Upload multipart: arquivo binario + metadados. NAO setamos Content-Type — o
  // browser define o boundary do multipart/form-data automaticamente.
  // ---------------------------------------------------------------------------

  /** Envia um documento NATIVO (arquivo + metadados). POST .../documentos -> { idDocumento }. */
  criarDocumento(
    id: number,
    arquivo: File,
    meta: { tipo: string; titulo: string; dataDocumento?: string | null }
  ): Observable<DocumentoCriado> {
    const form = new FormData();
    form.append('arquivo', arquivo);
    form.append('tipo', meta.tipo);
    form.append('titulo', meta.titulo);
    if (meta.dataDocumento) form.append('dataDocumento', meta.dataDocumento);
    return this.http
      .post<Envelope<DocumentoCriado>>(`${this.baseUrl}/paciente/${id}/documentos`, form)
      .pipe(map((r) => this.desembrulhar<DocumentoCriado>(r)));
  }

  /** Cancela logicamente um documento NATIVO (motivo obrigatorio). POST .../cancelar. */
  cancelarDocumento(
    id: number,
    idDocumento: number,
    payload: CancelarPayload
  ): Observable<void> {
    return this.http
      .post<Envelope<unknown>>(
        `${this.baseUrl}/paciente/${id}/documentos/${idDocumento}/cancelar`,
        payload
      )
      .pipe(map(() => void 0));
  }

  /**
   * URL canonica do download do conteudo binario de um documento. A rota exige o
   * mesmo Bearer das demais; para acionar o download COM o header, prefira baixar
   * via HttpClient (baixarDocumento -> blob).
   */
  urlDownloadDocumento(id: number, idDoc: number): string {
    return `${this.baseUrl}/paciente/${id}/documentos/${idDoc}/conteudo`;
  }

  /** Baixa o conteudo binario do documento como Blob (passa pelo interceptor -> Bearer). */
  baixarDocumento(id: number, idDoc: number): Observable<Blob> {
    return this.http.get(this.urlDownloadDocumento(id, idDoc), { responseType: 'blob' });
  }

  // ---------------------------------------------------------------------------
  // FILA DE VINCULO (AdminOnly). O espelho ainda nao casado com um paciente local
  // aguarda decisao manual do admin: vincular a um candidato ou marcar sem
  // correspondencia. O backend exige papel ADMIN (o interceptor injeta o Bearer).
  // ---------------------------------------------------------------------------

  /**
   * Fila de vinculos pendentes. GET .../vinculos/fila -> array puro. Normaliza os
   * `candidatos` de cada item: aceita array pronto OU `candidatosJson` (string).
   */
  listarFilaVinculo(): Observable<VinculoFilaItem[]> {
    return this.http
      .get<Envelope<VinculoFilaRaw[]>>(`${this.baseUrl}/vinculos/fila`)
      .pipe(map((r) => this.desembrulharLista<VinculoFilaRaw>(r).map((i) => this.normalizarFilaItem(i))));
  }

  /** Vincula o registro do espelho a um paciente LOCAL. POST .../vinculos/{id}/vincular. */
  vincularPaciente(idProntPaciente: number, idPacienteLocal: number): Observable<void> {
    return this.http
      .post<Envelope<unknown>>(`${this.baseUrl}/vinculos/${idProntPaciente}/vincular`, {
        idPacienteLocal,
      })
      .pipe(map(() => void 0));
  }

  /** Marca o registro do espelho como SEM correspondencia local. POST .../sem-correspondencia. */
  marcarSemCorrespondencia(idProntPaciente: number): Observable<void> {
    return this.http
      .post<Envelope<unknown>>(`${this.baseUrl}/vinculos/${idProntPaciente}/sem-correspondencia`, {})
      .pipe(map(() => void 0));
  }

  /** Normaliza um item cru da fila: resolve `candidatos` (array | candidatosJson string). */
  private normalizarFilaItem(raw: VinculoFilaRaw): VinculoFilaItem {
    return {
      idProntPaciente: raw.idProntPaciente,
      nome: raw.nome ?? null,
      cpf: raw.cpf ?? null,
      dataNascimento: raw.dataNascimento ?? null,
      statusMatch: raw.statusMatch ?? null,
      motivoConflito: raw.motivoConflito ?? null,
      candidatos: this.resolverCandidatos(raw),
    };
  }

  /** Aceita `candidatos` ja em array ou `candidatosJson` como string JSON. */
  private resolverCandidatos(raw: VinculoFilaRaw): VinculoCandidato[] {
    if (Array.isArray(raw.candidatos)) return raw.candidatos;
    const bruto = typeof raw.candidatos === 'string' ? raw.candidatos : raw.candidatosJson;
    if (typeof bruto === 'string' && bruto.trim()) {
      try {
        const parsed = JSON.parse(bruto);
        return Array.isArray(parsed) ? (parsed as VinculoCandidato[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Desembrulho do envelope { sucesso, dados }.
  // ---------------------------------------------------------------------------

  private desembrulhar<T>(r: Envelope<T> | T): T {
    const env = r as Envelope<T>;
    if (env && typeof env === 'object' && 'dados' in env) {
      return (env.dados as T) ?? (null as unknown as T);
    }
    return r as T;
  }

  private desembrulharLista<T>(r: Envelope<T[]> | T[]): T[] {
    const dados = this.desembrulhar<T[]>(r);
    return Array.isArray(dados) ? dados : [];
  }

  private desembrulharPaginado<T>(r: Envelope<T[]>): ResultadoPaginado<T> {
    const itens = this.desembrulharLista<T>(r);
    const p = r?.paginacao;
    const tamanho = p?.tamanhoPagina ?? itens.length;
    const total = p?.totalRegistros ?? itens.length;
    return {
      itens,
      pagina: p?.paginaAtual ?? 1,
      tamanho,
      total,
      totalPaginas: p?.totalPaginas ?? (tamanho > 0 ? Math.max(1, Math.ceil(total / tamanho)) : 1),
    };
  }

  private desembrulharTimeline(r: Envelope<EventoTimeline[]>): TimelinePagina {
    const itens = this.desembrulharLista<EventoTimeline>(r);
    const p = r?.paginacao;
    return {
      itens,
      tamanho: p?.tamanho ?? itens.length,
      temMais: p?.temMais ?? false,
      proximoCursor: p?.proximoCursor ?? null,
    };
  }
}
