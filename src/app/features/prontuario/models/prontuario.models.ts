// features/prontuario/models/prontuario.models.ts
//
// Interfaces (camelCase) que espelham os DTOs de leitura do backend:
//   DiaverumApi/Models/Prontuario/ProntuarioLeituraDtos.cs
// Propriedades PascalCase no C# -> camelCase no JSON (System.Text.Json padrao).
// Area SOMENTE LEITURA: nenhum tipo aqui representa payload de escrita.

/** Envelope generico de resultado paginado (offset/limit). Espelha ResultadoPaginado<T>. */
export interface ResultadoPaginado<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
  /** Total de paginas (paginacao.totalPaginas; fallback = ceil(total/tamanho)). */
  totalPaginas: number;
}

/**
 * Situacao cadastral do paciente (espelho da origem). null = ATIVO (default).
 * Aberta a novos codigos alem dos conhecidos (defensivo).
 */
export type SituacaoPaciente =
  | 'ATIVO'
  | 'OBITO'
  | 'TRANSFERIDO'
  | 'TRANSPLANTADO'
  | 'ABANDONO'
  | 'OUTRO'
  | string
  | null;

/** Metadados de paginacao devolvidos no envelope (paginacao.*) das rotas offset/limit. */
export interface PaginacaoMeta {
  paginaAtual: number;
  tamanhoPagina: number;
  totalRegistros: number;
  totalPaginas: number;
}

/** Resultado da BUSCA de pacientes (lista). CPF SEMPRE mascarado (minimizacao LGPD). */
export interface PacienteBusca {
  idProntPaciente: number;
  nome: string | null;
  /** CPF completo (somente dígitos, 11 posições) quando autorizado; null quando indisponível. */
  cpf: string | null;
  /** CPF mascarado (ex '***.***.789-**'). Fallback quando o CPF completo não vem. */
  cpfMascarado: string | null;
  dataNascimento: string | null;
  idade: number | null;
  genero: string | null;
  /** Unidade de envio (TBL_UNIDADE_ENVIO) a que o paciente pertence. null quando desconhecida. */
  idUnidade: number | null;
  /** Nome da unidade de envio (coluna "Unidade" do grid). null quando desconhecida. */
  nomeUnidade: string | null;
  nomeClinica: string | null;
  statusMatch: number;
  dataUltimaSyncUtc: string | null;
  /** Situacao cadastral (ATIVO|OBITO|TRANSFERIDO|TRANSPLANTADO|ABANDONO|OUTRO|null; null=ATIVO). */
  situacao: SituacaoPaciente;
  /** Data da situacao (ISO) quando houver (ex.: data do obito/transferencia). null se nao informada. */
  dataSituacao: string | null;
  /** Data da ultima sessao de HD (ISO) do paciente. null quando nao houver sessao. */
  ultimaSessao: string | null;
}

/** Cabecalho do paciente (ja autorizado e auditado): pode trazer CPF completo. */
export interface Cabecalho {
  idProntPaciente: number;
  nome: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  idade: number | null;
  genero: string | null;
  idUnidade: number | null;
  nomeClinica: string | null;
  modalidadeTratamento: string | null;
  indDiabetes: boolean | null;
  /** Contagem de alergias ativas (EXCLUIDO_NA_ORIGEM = 0). */
  alergiasAtivas: number;
  statusMatch: number;
  dataUltimaSyncUtc: string | null;
  /** Saude da ultima sync do par (fonte,unidade): OK | ATENCAO | CRITICO. */
  statusUltimaSync: string | null;
  /** Situacao cadastral (ATIVO|OBITO|TRANSFERIDO|TRANSPLANTADO|ABANDONO|OUTRO|null; null=ATIVO). */
  situacao: SituacaoPaciente;
  /** Data da situacao (ISO) quando houver (ex.: data do obito). null se nao informada. */
  dataSituacao: string | null;
  /** Causa do obito (texto livre da origem). Preenchida so quando situacao=OBITO. */
  causaObito: string | null;
}

/** Ultima sessao de HD resumida (embutida no resumo). */
export interface ResumoUltimaSessao {
  idSessao: number;
  dataSessao: string | null;
  pesoPre: number | null;
  pesoPos: number | null;
}

/** Alergia curta para o cartao de resumo. */
export interface ResumoAlergia {
  substancia: string | null;
  criticidade: string | null;
}

/** Problema ativo curto para o cartao de resumo. */
export interface ResumoProblema {
  cid10: string | null;
  descricao: string | null;
  principal: boolean;
}

/** Cabecalho da prescricao vigente (embutido no resumo). */
export interface ResumoPrescricao {
  idPrescricao: number;
  dataPrescricao: string | null;
  tipo: string | null;
  statusOrigem: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  prescritorNome: string | null;
}

/**
 * Resumo clinico do paciente: contagens + destaques (ultima sessao, alergias,
 * problemas ativos, prescricao vigente).
 */
export interface Resumo {
  idProntPaciente: number;
  totalEvolucoes: number;
  totalSessoes: number;
  totalExames: number;
  ultimaSessao: ResumoUltimaSessao | null;
  alergias: ResumoAlergia[];
  problemasAtivos: ResumoProblema[];
  prescricaoVigente: ResumoPrescricao | null;
}

/**
 * Evento da linha do tempo (VW_PRONT_LINHA_TEMPO). Keyset por
 * (DATA_HORA DESC, TIPO, ID_REGISTRO).
 */
export interface EventoTimeline {
  idProntPaciente: number;
  tipo: string | null;
  idRegistro: number;
  dataHora: string | null;
  dataEvento: string | null;
  titulo: string | null;
  resumo: string | null;
  autor: string | null;
}

/**
 * Pagina keyset da linha do tempo. O backend devolve os itens em `dados` e os
 * metadados de cursor em `paginacao`. Esta interface consolida os dois lados.
 */
export interface TimelinePagina {
  itens: EventoTimeline[];
  tamanho: number;
  temMais: boolean;
  proximoCursor: string | null;
}

/**
 * Plano de SAE (Sistematizacao da Assistencia de Enfermagem) do paciente.
 * Uma linha por par diagnostico/prescricao de enfermagem, com contagem de
 * execucoes. GET /prontuario/paciente/{id}/sae -> array puro.
 */
export interface SaePlano {
  idSaePlano: number;
  ordem: number;
  diagnostico: string | null;
  prescricao: string | null;
  dataInicio: string | null;
  /** null = plano vigente; preenchida = plano encerrado. */
  dataFim: string | null;
  responsavelNome: string | null;
  /** Marcador de destaque/evidencia vindo da origem. */
  indEvidenciar: boolean;
  totalExecucoes: number;
  /** Data (ISO) da ultima execucao registrada. null quando nunca executado. */
  ultimaExecucao: string | null;
}

/** Evolucao/nota clinica (TBL_PRONT_EVOLUCAO). */
export interface Evolucao {
  idEvolucao: number;
  idProntPaciente: number;
  dataEvolucao: string | null;
  tipo: string | null;
  profissionalNome: string | null;
  profissionalConselho: string | null;
  especialidade: string | null;
  texto: string | null;

  // --- Etapa 1 (escrita nativa) — campos aditivos do EvolucaoLeituraDto ---
  /** true quando a fonte do registro e NATIVO (criado aqui). Origem externa => false. */
  ehNativa: boolean;
  /** Cancelamento logico (P2). Registro cancelado nao aparece na lista padrao. */
  cancelado: boolean;
  /** Motivo do cancelamento (exibido na tarja quando cancelado). */
  motivoCancelamento: string | null;
  /** Quando esta evolucao retifica outra, aponta o id da original retificada. */
  idEvolucaoRetificada: number | null;

  /**
   * Nota RESTRITA: visivel apenas para a equipe clinica. Para o consumidor anonimo
   * (hyperlink) o backend ja devolve o `texto` mascarado
   * ("[Nota restrita — visivel apenas para a equipe clinica]"); a UI apenas sinaliza
   * com uma tarja discreta.
   */
  restrita: boolean;
}
/** Alias historico do DTO (EvolucaoLeituraDto). */
export type EvolucaoLeitura = Evolucao;

/** Dominio de tipo de evolucao nativa (select do form de escrita). */
export type TipoEvolucao =
  | 'MEDICA'
  | 'ENFERMAGEM'
  | 'NUTRICAO'
  | 'PSICOLOGIA'
  | 'SERVICO_SOCIAL'
  | 'FARMACIA'
  | 'OUTRO';

/** Payload de inclusao de evolucao nativa. POST .../evolucoes */
export interface CriarEvolucaoPayload {
  tipo: TipoEvolucao | string;
  texto: string;
  especialidade?: string | null;
}

/** Payload de retificacao. POST .../evolucoes/{id}/retificar */
export interface RetificarEvolucaoPayload {
  texto: string;
  motivo: string;
}

/** Payload de cancelamento logico. POST .../evolucoes/{id}/cancelar */
export interface CancelarEvolucaoPayload {
  motivo: string;
}

/** Retorno da inclusao/retificacao (dados do envelope). */
export interface EvolucaoCriada {
  idEvolucao: number;
}

/** Item de prescricao (TBL_PRONT_PRESCRICAO_ITEM). */
export interface PrescricaoItem {
  idPrescricaoItem: number;
  idPrescricao: number;
  medicamentoOuParametro: string | null;
  principioAtivo: string | null;
  dose: string | null;
  unidadeDose: string | null;
  via: string | null;
  frequencia: string | null;
  momentoDialise: string | null;
  observacao: string | null;
}
/** Alias historico do DTO (PrescricaoItemLeituraDto). */
export type PrescricaoItemLeitura = PrescricaoItem;

/** Prescricao (TBL_PRONT_PRESCRICAO) com seus itens aninhados. */
export interface Prescricao {
  idPrescricao: number;
  idProntPaciente: number;
  dataPrescricao: string | null;
  tipo: string | null;
  statusOrigem: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  prescritorNome: string | null;
  prescritorConselho: string | null;
  itens: PrescricaoItem[];

  // --- Etapa 3 (escrita nativa) — campos aditivos do PrescricaoLeituraDto ---
  /** true quando a fonte do registro e NATIVO (criado aqui). Origem externa => false. */
  ehNativa: boolean;
  /** Suspensao logica (encerramento de vigencia). Cancelada nao aparece na lista padrao. */
  cancelado: boolean;
  /** Motivo da suspensao (exibido na tarja quando cancelado). */
  motivoCancelamento: string | null;
}
/** Alias historico do DTO (PrescricaoLeituraDto). */
export type PrescricaoLeitura = Prescricao;

/** Item do payload de inclusao de prescricao nativa (medicamento ou parametro de dialise). */
export interface CriarPrescricaoItemPayload {
  medicamentoOuParametro: string;
  principioAtivo?: string | null;
  dose?: string | null;
  unidadeDose?: string | null;
  via?: string | null;
  frequencia?: string | null;
  momentoDialise?: string | null;
  observacao?: string | null;
}

/** Payload de inclusao de prescricao nativa (cabecalho + itens). POST .../prescricoes */
export interface CriarPrescricaoPayload {
  tipo: 'DIALISE' | 'MEDICAMENTOSA';
  dataInicio?: string | null;
  itens: CriarPrescricaoItemPayload[];
}

/** Retorno da inclusao de prescricao (dados do envelope). */
export interface PrescricaoCriada {
  idPrescricao: number;
}

/** Sessao de HD resumida (lista). */
export interface SessaoResumo {
  idSessao: number;
  idProntPaciente: number;
  dataSessao: string | null;
  duracaoMin: number | null;
  statusSessao: string | null;
  pesoPre: number | null;
  pesoPos: number | null;
  ktv: number | null;
  urr: number | null;
  teveIntercorrencia: boolean;

  // --- Etapa 4 (escrita nativa) — campos aditivos do SessaoResumoDto ---
  /** true quando a fonte do registro e NATIVO (criado aqui). Origem externa => false. */
  ehNativa: boolean;
  /** Cancelamento logico. Registro cancelado nao aparece na lista padrao. */
  cancelado: boolean;
  /** Motivo do cancelamento (exibido na tarja quando cancelado). */
  motivoCancelamento: string | null;
}

/** Sinal vital intra-sessao (TBL_PRONT_SESSAO_SINAL_VITAL). */
export interface SinalVitalLeitura {
  idSinal: number;
  idSessao: number;
  seqLeitura: number | null;
  momento: string | null;
  dataHora: string | null;
  paSis: number | null;
  paDia: number | null;
  fc: number | null;
  temperatura: number | null;
  glicemia: number | null;
  satO2: number | null;
  ufAcumuladaMl: number | null;
  fluxoSangueMlMin: number | null;
  observacao: string | null;
}

/** Sessao de HD detalhada com sinais vitais aninhados. */
export interface SessaoDetalhe {
  idSessao: number;
  idProntPaciente: number;
  dataSessao: string | null;
  duracaoMin: number | null;
  statusSessao: string | null;
  pesoPre: number | null;
  pesoPos: number | null;
  pesoSeco: number | null;
  ufPrescritaMl: number | null;
  ufRealizadaMl: number | null;
  paPreSis: number | null;
  paPreDia: number | null;
  paPosSis: number | null;
  paPosDia: number | null;
  acessoTipo: string | null;
  dialisador: string | null;
  fluxoSangueMlMin: number | null;
  fluxoDialisatoMlMin: number | null;
  anticoagulacao: string | null;
  ktv: number | null;
  urr: number | null;
  teveIntercorrencia: boolean;
  intercorrencias: string | null;
  maquina: string | null;
  sinaisVitais: SinalVitalLeitura[];

  // --- Etapa 4 (escrita nativa) — campos aditivos do SessaoDetalheDto ---
  /** true quando a fonte do registro e NATIVO (criado aqui). Origem externa => false. */
  ehNativa: boolean;
  /** Cancelamento logico. Registro cancelado nao aparece na lista padrao. */
  cancelado: boolean;
  /** Motivo do cancelamento (exibido na tarja quando cancelado). */
  motivoCancelamento: string | null;
}

/** Item do payload de inclusao de sinal vital seriado (intra-sessao). */
export interface CriarSinalVitalPayload {
  momento?: string | null;
  dataHora?: string | null;
  paSis?: number | null;
  paDia?: number | null;
  fc?: number | null;
  temperatura?: number | null;
  glicemia?: number | null;
  satO2?: number | null;
  ufAcumuladaMl?: number | null;
  fluxoSangueMlMin?: number | null;
  observacao?: string | null;
}

/** Payload de inclusao de sessao de HD nativa (cabecalho + sinais). POST .../sessoes */
export interface CriarSessaoPayload {
  dataSessao: string;
  duracaoMin?: number | null;
  statusSessao?: string | null;
  pesoPre?: number | null;
  pesoPos?: number | null;
  pesoSeco?: number | null;
  ufRealizadaMl?: number | null;
  paPreSis?: number | null;
  paPreDia?: number | null;
  paPosSis?: number | null;
  paPosDia?: number | null;
  acessoTipo?: string | null;
  teveIntercorrencia?: boolean;
  intercorrencias?: string | null;
  maquina?: string | null;
  sinais?: CriarSinalVitalPayload[];
}

/** Retorno da inclusao de sessao (dados do envelope). */
export interface SessaoCriada {
  idSessao: number;
}

/** Exame/resultado laboratorial (TBL_PRONT_EXAME). */
export interface ExameLeitura {
  idExame: number;
  idProntPaciente: number;
  dataColeta: string | null;
  dataResultado: string | null;
  codigoLoinc: string | null;
  codigoLocal: string | null;
  nomeExame: string | null;
  valorNumerico: number | null;
  valorTexto: string | null;
  unidade: string | null;
  faixaReferencia: string | null;
  flagInterpretacao: string | null;
}
/** Alias curto (mesmo shape de ExameLeitura). */
export type Exame = ExameLeitura;

/** Alergia/intolerancia (TBL_PRONT_ALERGIA). */
export interface AlergiaLeitura {
  idAlergia: number;
  idProntPaciente: number;
  substancia: string | null;
  categoria: string | null;
  criticidade: string | null;
  reacao: string | null;
  statusOrigem: string | null;
  dataRegistro: string | null;

  // --- Etapa 2 (escrita nativa) — campos aditivos do AlergiaLeituraDto ---
  /** true quando a fonte do registro e NATIVO (criado aqui). Origem externa => false. */
  ehNativa: boolean;
  /** Cancelamento logico. Registro cancelado nao aparece na lista padrao. */
  cancelado: boolean;
  /** Motivo do cancelamento (exibido na tarja quando cancelado). */
  motivoCancelamento: string | null;
}
/** Alias curto (mesmo shape de AlergiaLeitura). */
export type Alergia = AlergiaLeitura;

/** Payload de inclusao de alergia nativa. POST .../alergias */
export interface CriarAlergiaPayload {
  substancia: string;
  categoria?: string | null;
  criticidade?: string | null;
  reacao?: string | null;
}

/** Retorno da inclusao de alergia (dados do envelope). */
export interface AlergiaCriada {
  idAlergia: number;
}

/** Problema/diagnostico (TBL_PRONT_PROBLEMA). */
export interface ProblemaLeitura {
  idProblema: number;
  idProntPaciente: number;
  cid10: string | null;
  descricao: string | null;
  principal: boolean;
  statusOrigem: string | null;
  dataDiagnostico: string | null;

  // --- Etapa 2 (escrita nativa) — campos aditivos do ProblemaLeituraDto ---
  /** true quando a fonte do registro e NATIVO (criado aqui). Origem externa => false. */
  ehNativa: boolean;
  /** Cancelamento logico. Registro cancelado nao aparece na lista padrao. */
  cancelado: boolean;
  /** Motivo do cancelamento (exibido na tarja quando cancelado). */
  motivoCancelamento: string | null;
}
/** Alias curto (mesmo shape de ProblemaLeitura). */
export type Problema = ProblemaLeitura;

/** Payload de inclusao de problema/CID nativo. POST .../problemas */
export interface CriarProblemaPayload {
  cid10?: string | null;
  descricao: string;
  principal?: boolean;
  dataDiagnostico?: string | null;
}

/** Retorno da inclusao de problema (dados do envelope). */
export interface ProblemaCriado {
  idProblema: number;
}

/** Payload de cancelamento logico generico (alergia / problema). POST .../cancelar */
export interface CancelarPayload {
  motivo: string;
}

/**
 * Cadastro (espelho) do paciente + divergencias contra o cadastro local
 * (VW_PRONT_DIVERGENCIA_CADASTRO). Espelho ja autorizado -> CPF completo.
 */
export interface Cadastro {
  idProntPaciente: number;
  nome: string | null;
  cpf: string | null;
  cns: string | null;
  dataNascimento: string | null;
  idade: number | null;
  genero: string | null;
  idUnidade: number | null;
  nomeClinica: string | null;
  telefone: string | null;
  email: string | null;
  enderecoJson: string | null;
  modalidadeTratamento: string | null;
  indDiabetes: boolean | null;
  statusMatch: number;
  dataUltimaSyncUtc: string | null;

  // --- Campos aditivos da migracao NephroSys (GET /cadastro). Null-safe: a
  //     origem pode nao enviar; a tela mostra "—" quando ausente. ---
  /** Tipagem sanguinea + fator Rh (ex.: "O+"). */
  aboRh: string | null;
  /** Altura em centimetros. */
  alturaCm: number | null;
  /** Peso seco (kg). */
  pesoSecoKg: number | null;
  /** Diurese residual (mL/dia). */
  diureseMl: number | null;
  /** Data de inicio da TRS (terapia renal substitutiva). */
  dataInicioTrs: string | null;
  /** Nome da mae (filiacao). */
  nomeMae: string | null;
  /**
   * JSON bruto da migracao NephroSys (convenio/plano + blocos social/nutricao/habitos/
   * observacoes/pendenciaHd). Parse seguro no front (try/catch); pode vir null/vazio.
   */
  jsonExtra: string | null;

  // Divergencias (LEFT JOIN). Null quando nao ha vinculo local.
  idPaciente: number | null;
  nomeLocal: string | null;
  divergeNome: boolean;
  dataNascimentoLocal: string | null;
  divergeDataNascimento: boolean;
  generoLocal: string | null;
  divergeGenero: boolean;
  cpfLocal: string | null;
  divergeCpf: boolean;
}

/** Documento anexo — metadados (TBL_PRONT_DOCUMENTO). */
export interface DocumentoLeitura {
  idDocumento: number;
  idProntPaciente: number;
  tipo: string | null;
  titulo: string | null;
  dataDocumento: string | null;
  mimeType: string | null;
  tamanhoBytes: number | null;
  urlOrigem: string | null;

  // --- Etapa 5 (escrita nativa) — campos aditivos do DocumentoLeituraDto ---
  /** true quando a fonte do registro e NATIVO (enviado aqui). Origem externa => false. */
  ehNativa: boolean;
  /** Cancelamento logico. Registro cancelado nao aparece na lista padrao. */
  cancelado: boolean;
  /** Motivo do cancelamento (exibido na tarja quando cancelado). */
  motivoCancelamento: string | null;
}
/** Alias curto (mesmo shape de DocumentoLeitura). */
export type Documento = DocumentoLeitura;

/** Retorno da inclusao de documento (dados do envelope). POST .../documentos */
export interface DocumentoCriado {
  idDocumento: number;
}

// ===========================================================================
// Dados vindos da migracao NephroSys (5 rotas GET aditivas, somente leitura).
// ===========================================================================

/** Codigo do marcador sorologico. Aberto a novos codigos alem dos conhecidos. */
export type MarcadorViralCodigo =
  | 'HEPATITE_B'
  | 'HEPATITE_C'
  | 'HIV'
  | 'HBSAG'
  | 'CMV'
  | 'CHAGAS'
  | string;

/** Resultado sorologico. null = origem nao informou. */
export type MarcadorViralResultado =
  | 'REAGENTE'
  | 'NAO_REAGENTE'
  | 'INDETERMINADO'
  | 'NAO_REALIZADO'
  | null;

/** Marcador viral/sorologia (GET .../marcadores-virais). */
export interface MarcadorViral {
  idMarcador: number;
  marcador: MarcadorViralCodigo;
  resultado: MarcadorViralResultado;
  dataRegistro: string | null;
  observacao: string | null;
}

/** Vacina aplicada (GET .../vacinas). */
export interface Vacina {
  idVacina: number;
  vacinaNome: string | null;
  complemento: string | null;
  dataAplicacao: string | null;
  lote: string | null;
}

/** Evento na vida de um acesso vascular (subitem de AcessoVascular). */
export interface AcessoEvento {
  idAcessoEvento: number;
  dataEvento: string | null;
  eventoDescricao: string | null;
  motivoDescricao: string | null;
  observacao: string | null;
}

/** Categoria do acesso vascular. null = origem nao categorizou. */
export type AcessoVascularCategoria = 'CATETER' | 'FISTULA' | 'OUTRO' | null;

/** Acesso vascular cadastrado (GET .../acessos-vasculares) com seus eventos. */
export interface AcessoVascular {
  idAcesso: number;
  categoria: AcessoVascularCategoria;
  tipoDescricao: string | null;
  localizacao: string | null;
  dataConfeccao: string | null;
  dataPerda: string | null;
  ativo: boolean;
  profissionalNome: string | null;
  eventos: AcessoEvento[];
}

/** Solicitacao de exame (GET .../sol-exames). */
export interface SolExame {
  idSolExame: number;
  /** Competencia no formato 'YYYY/MM' ou 'YYYYMM'. */
  competencia: string | null;
  codigoExameLocal: string | null;
  nomeExame: string | null;
  indSolicitado: boolean;
  indExtra: boolean;
  observacao: string | null;
}

/** Dados de transplante / lista de espera (GET .../transplante). Pode vir null. */
export interface Transplante {
  idTransplante: number;
  emLista: boolean;
  dataInscricao: string | null;
  situacaoLista: string | null;
  indTxRim: boolean;
  indTxPancreas: boolean;
  indUrgencia: boolean;
  codSnt: string | null;
  hlaA: string | null;
  hlaB: string | null;
  hlaDr: string | null;
  hlaDq: string | null;
  hlaDw: string | null;
  pra: number | null;
  dataPra: string | null;
  centroVinculo: string | null;
  equipeVinculo: string | null;
  observacao: string | null;
}

/** Saude da sincronizacao consumida pelo indicador (sync-status). OK | ATENCAO | CRITICO. */
export type StatusSync = 'OK' | 'ATENCAO' | 'CRITICO' | null;

/** Estado de sincronizacao compartilhado pelo contexto do prontuario. */
export interface EstadoSincronizacao {
  status: StatusSync;
  dataUltimaSyncUtc: string | null;
}

// ===========================================================================
// Fila de VINCULO (AdminOnly). Espelho ainda nao casado com um paciente local:
// pode estar sem CPF, em conflito, ou aguardando decisao manual do admin.
// ===========================================================================

/**
 * Paciente LOCAL candidato a vinculo com um registro do espelho. Chega na fila
 * ja resolvido (o backend sugere os possiveis alvos do vinculo).
 */
export interface VinculoCandidato {
  idPaciente: number;
  nome: string | null;
  cpf: string | null;
  idUnidade?: number | null;
  nomeClinica?: string | null;
  dataNascimento?: string | null;
}

/**
 * Item da fila de vinculo (AdminOnly). `candidatos` chega ja normalizado em array;
 * a origem pode enviar `candidatosJson` como string (parse feito no service).
 */
export interface VinculoFilaItem {
  idProntPaciente: number;
  nome: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  /** Codigo/estado do match (numerico ou textual conforme a origem). */
  statusMatch: number | string | null;
  /** Motivo do conflito, quando houver (ex.: divergencia de nome/nascimento). */
  motivoConflito: string | null;
  candidatos: VinculoCandidato[];
}
