import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of, throwError, Subject } from 'rxjs';
import { map, switchMap, catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Paciente {
  iD_PACIENTE?: number;
  NOME: string;
  CPF: string;
  GENERO?: string;
  DATA_NASCIMENTO?: string;
  TIPO_TRATAMENTO: string;
  DIABETES: boolean | string;
  PESO?: number;
  ALTURA?: number;
  DATA_ULTIMA_ATUALIZACAO?: string;
  ID_UNIDADE?: number;  // ID da unidade/clínica do paciente
}

export interface Agendamento {
  iD_AGENDAMENTO?: number;
  DATA_AGENDAMENTO: string;
}

export interface AgendaDetalhe {
  ID_AGENDA_DETALHE?: number;
  ID_AGENDAMENTO: number;
  SEQUENCIA: number;
  ID_UNIDADE?: number;
  ID_EXAME: number;
  ID_GRUPO_EXAME?: number;
  CD_EXAME_DB?: string;
  CPF_PACIENTE: string;
  DATA_CANCELAMENTO?: string;
  NUMERO_ATENDIMENTO_APOIADO?: string;
  DESC_EXAME?: string;
  IND_REG_ENVIADO?: boolean; // true quando o exame já foi enviado para sincronização
}

export interface ResultadoImportacao {
  pacienteId: number | null;
  pacienteNome: string;
  agendamentoId: number | null;
  sucesso: boolean;
  totalExames: number;
  mensagem: string;
  erro?: string;
}

export interface ResultadoImportacaoCompleta {
  sucesso: boolean;
  totalProcessados: number;
  sucessos: number;
  erros: number;
  totalExames: number;
  detalhes: ResultadoImportacao[];
  mensagem: string;
}

@Injectable({
  providedIn: 'root',
})
export class PacienteService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Notificador para mudanças em exames/agenda de um paciente
  private pacienteExamesAtualizadosSubject = new Subject<string | null>();
  public pacienteExamesAtualizados$ = this.pacienteExamesAtualizadosSubject.asObservable();

  /**
   * Notifica que os exames de um paciente (ou a lista inteira) foram atualizados.
   * Se cpf for omitido/not null, os assinantes podem atualizar apenas esse paciente.
   */
  public notifyPacienteExamesAtualizados(cpf?: string | null): void {
    this.pacienteExamesAtualizadosSubject.next(cpf ?? null);
  }

  // ==================== HEALTH CHECK ====================

  /**
   * Verifica se o backend está online
   */
  verificarBackendOnline(): Observable<{ status: string; mensagem?: string; erro?: string }> {
    return this.http.get<any>(`${this.apiUrl}/health`).pipe(
      map(() => ({ status: 'online', mensagem: 'Backend respondendo' })),
      catchError(() => {
        return this.http.get<any>(`${this.apiUrl}/pacientes`).pipe(
          map(() => ({ status: 'online', mensagem: 'Backend respondendo via /pacientes' })),
          catchError((erro) => of({ status: 'offline', erro: erro.message }))
        );
      })
    );
  }

  // ==================== PACIENTES ====================

  /**
   * Busca todos os pacientes com paginação
   */
  buscarPacientes(pagina: number = 1, tamanhoPagina: number = 50, idUnidade?: number | null): Observable<any> {
    let params = new HttpParams()
      .set('pagina', pagina.toString())
      .set('tamanhoPagina', tamanhoPagina.toString());

    if (idUnidade != null) {
      params = params.set('idUnidade', idUnidade.toString());
    }

    const url = `${this.apiUrl}/pacientes`;
    console.log('PacienteService.buscarPacientes -> URL, params:', url, { pagina, tamanhoPagina, idUnidade });

    return this.http.get<any>(url, { params }).pipe(
      map((res) => {
        console.log('PacienteService.buscarPacientes -> response sample:', Array.isArray(res?.dados) ? res.dados.slice(0,5) : res?.dados);
        return res;
      })
    );
  }

  /**
   * Busca um paciente por ID
   */
  buscarPacientePorId(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/pacientes/${id}`);
  }

  /**
   * Busca um paciente por CPF
   */
  buscarPacientePorCPF(cpf: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/pacientes/cpf/${cpf}`);
  }

  /**
   * Cria um novo paciente
   */
  criarPaciente(paciente: Paciente): Observable<any> {
    const pacienteDTO = this.converterPacienteParaDTO(paciente);
    return this.http.post<any>(`${this.apiUrl}/pacientes`, pacienteDTO);
  }

  /**
   * Atualiza um paciente existente
   */
  atualizarPaciente(id: number, paciente: Paciente): Observable<any> {
    const pacienteDTO = this.converterPacienteParaDTO(paciente);
    return this.http.put<any>(`${this.apiUrl}/pacientes/${id}`, pacienteDTO);
  }

  /**
   * Exclui um paciente
   */
  excluirPaciente(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/pacientes/${id}`);
  }

  /**
   * Exclui múltiplos pacientes em lote (muito mais rápido)
   */
  excluirPacientesEmLote(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/pacientes/lote`, {
      body: { ids }
    });
  }

  /**
   * Remove pacientes da listagem por CPF (soft delete)
   */
  removerPacientesPorCpf(cpfs: string[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/agenda-detalhe/remover-por-cpf`, {
      body: { cpfs }
    });
  }

  // ==================== AGENDAMENTOS ==

  /**
   * Cria um novo agendamento
   */
  criarAgendamento(agendamento: Agendamento): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/agendamento`, agendamento);
  }

  /**
   * Busca todos os agendamentos
   */
  buscarAgendamentos(idUnidade?: number | null): Observable<any> {
    let params = new HttpParams();
    if (idUnidade != null) params = params.set('idUnidade', idUnidade.toString());
    return this.http.get<any>(`${this.apiUrl}/agendamento`, { params });
  }

  /**
   * Busca o último agendamento criado
   */
  buscarUltimoAgendamento(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/agendamento`).pipe(
      map((response) => {
        const dados = response.dados || response || [];
        if (dados.length === 0) {
          throw new Error('Nenhum agendamento encontrado');
        }
        return {
          idAgendamento: dados[0].iD_AGENDAMENTO || dados[0].ID_AGENDAMENTO,
          ...dados[0],
        };
      })
    );
  }

  /**
   * Marca agendamentos como enviados
   */
  marcarAgendamentosEnviados(cpfs: string[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/pacientes/marcar-enviados`, { cpfs });
  }

  /**
   * Processa pacientes pendentes via endpoint de sincronização
   * Envia os CPFs para /api/db-sync/processa-pendentes
   * O backend espera receber List<string> ids diretamente (array de strings)
   */
  processarPendentes(cpfs: string[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/db-sync/processa-pendentes`, cpfs);
  }

  // ==================== AGENDA DETALHE ====================

  /**
   * 🚀 NOVO: Busca agenda detalhe usando a VIEW otimizada (VLT_AGENDA_DETALHE_SEL_PAGED)
   * Retorna dados consolidados: paciente + agendamento + exames em uma única chamada
   */
  buscarAgendaDetalhePaged(offset: number = 0, pageSize: number = 1000, idUnidade: number): Observable<any> {
    const params = new HttpParams()
      .set('offset', offset.toString())
      .set('pageSize', pageSize.toString())
      .set('idUnidade', idUnidade.toString());

    return this.http.get<any>(`${this.apiUrl}/agenda-detalhe/paged`, { params });
  }

  /**
   * 🚀 NOVO: Busca apenas registros pendentes de envio (IND_REG_ENVIADO = 0)
   */
  buscarAgendaDetalhePendentes(idUnidade: number): Observable<any> {
    const params = new HttpParams().set('idUnidade', idUnidade.toString());
    return this.http.get<any>(`${this.apiUrl}/agenda-detalhe/pending`, { params });
  }

  /**
   * 🚀 NOVO: Busca avançada na view com múltiplos filtros
   */
  buscarAgendaDetalheSearch(
    idUnidade: number,
    cpf?: string,
    indRegEnviado?: number,
    dataInicio?: string,
    dataFim?: string,
    idGrupoExame?: number
  ): Observable<any> {
    let params = new HttpParams().set('idUnidade', idUnidade.toString());
    
    if (cpf) params = params.set('cpf', cpf);
    if (indRegEnviado !== undefined) params = params.set('indRegEnviado', indRegEnviado.toString());
    if (dataInicio) params = params.set('dataInicio', dataInicio);
    if (dataFim) params = params.set('dataFim', dataFim);
    if (idGrupoExame) params = params.set('idGrupoExame', idGrupoExame.toString());

    return this.http.get<any>(`${this.apiUrl}/agenda-detalhe/search`, { params });
  }

  /**
   * Cria um detalhe de agenda
   */
  criarAgendaDetalhe(detalhe: AgendaDetalhe): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/agenda-detalhe`, detalhe);
  }

  /**
   * Busca todos os detalhes de agenda
   */
  buscarAgendaDetalhes(idUnidade?: number | null): Observable<any> {
    let params = new HttpParams();
    if (idUnidade != null) params = params.set('idUnidade', idUnidade.toString());
    return this.http.get<any>(`${this.apiUrl}/agenda-detalhe`, { params });
  }

  /**
   * Remove um exame de um paciente (DELETE)
   */
  removerExameDoPaciente(cpf: string, idExame: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/agenda-detalhe/paciente/${cpf}/exame/${idExame}`).pipe(
      // Notificar automaticamente quando um exame for removido
      tap(() => this.notifyPacienteExamesAtualizados(cpf))
    );
  }

  /**
   * Adiciona um exame a um paciente existente (POST)
   */
  adicionarExameAoPaciente(
    cpf: string,
    idExame: number,
    cdExame: string,
    cdExameDb: string,
    descExame: string,
    idUnidade: number = 3039
  ): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/agenda-detalhe/paciente/${cpf}/exame`, {
      idExame,
      cdExame,
      cdExameDb,
      descExame,
      idUnidade,
    }).pipe(
      // Notificar automaticamente quando um exame for adicionado
      tap(() => this.notifyPacienteExamesAtualizados(cpf))
    );
  }

  /**
   * Busca os exames de um paciente por CPF
   */
  buscarExamesDoPaciente(cpf: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/agenda-detalhe/paciente/${cpf}`);
  }

  /**
   * Gera agenda detalhe usando procedure VLT_GERA_AGENDA_DETALHE
   * Importa múltiplos pacientes em UMA ÚNICA requisição
   * Evita problemas de rate limiting - MUITO MAIS RÁPIDO
   */
  importarPacientesLote(
    pacientes: Paciente[],
    dataAgendamento: string,
    idGrupoExame: number,
    idUnidade: number
  ): Observable<any> {
    const payload = {
      idUnidade: idUnidade,
      idGrupoExame: idGrupoExame,
      dataAgendamento: dataAgendamento,
      pacientes: pacientes.map((p) => ({
        CPF: p.CPF,
        NOME: p.NOME,
        GENERO: p.GENERO,
        DATA_NASCIMENTO: p.DATA_NASCIMENTO,
        TIPO_TRATAMENTO: p.TIPO_TRATAMENTO,
        DIABETES: p.DIABETES || null,
        PESO: p.PESO,
        ALTURA: p.ALTURA,
      })),
    };

    console.log(`🚀 Enviando ${pacientes.length} pacientes em lote único...`);

    return this.http.post<any>(`${this.apiUrl}/pacientes/importar-lote`, payload).pipe(
      map((response) => {
        console.log('✅ Lote importado:', response);
        return {
          sucesso: response.sucesso || false,
          totalProcessados: response.totalProcessados || 0,
          sucessos: response.sucessos || 0,
          erros: response.erros || 0,
          totalExames: response.totalExames || 0,
          mensagem: response.mensagem || 'Importação concluída',
        };
      }),
      catchError((erro) => {
        console.error('❌ Erro na importação em lote:', erro);
        throw erro;
      })
    );
  }

  /**
   * Gera agenda detalhe usando a procedure VLT_GERA_AGENDA_DETALHE
   * A procedure executa os INSERTs mas não retorna o ID
   * Retornamos 0 como sucesso (já que a procedure é void)
   */
  gerarAgendaDetalhe(
    idUnidade: number,
    idGrupoExame: number,
    dataCadastro: Date,
    horaCadastro: string,
    dataAgendamento: Date,
    isGlicemia: boolean = false
  ): Observable<number> {
    const hora = horaCadastro || this.obterHoraAtual();

    const payload = {
      idUnidade,
      idGrupoExame,
      dataCadastro,
      horaCadastro: hora,
      dataAgendamento,
      isGlicemia: isGlicemia,
    };

    return this.http
      .post<any>(`${this.apiUrl}/agendamento/gerar-detalhes`, payload)
      .pipe(map((response) => response.idAgendamento || 0));
  }

  // ==================== IMPORTAÇÃO ====================

  /**
   * Importa um paciente completo usando procedure otimizada
   * (cria/atualiza paciente + agendamento + agenda_detalhe com CROSS JOIN)
   */
  importarPacienteCompleto(
    paciente: Paciente,
    dataAgendamento: string,
    idGrupoExame: number,
    idUnidade: number
  ): Observable<{ idPaciente: number; idAgendamento: number; totalExames: number }> {
    const payload = {
      idUnidade,
      idGrupoExame,
      dataAgendamento,
      cpfPaciente: paciente.CPF,
      nome: paciente.NOME,
      genero: paciente.GENERO,
      dataNascimento: paciente.DATA_NASCIMENTO,
      tipoTratamento: paciente.TIPO_TRATAMENTO,
      diabetes: this.converterDiabetes(paciente.DIABETES),
      peso: paciente.PESO,
      altura: paciente.ALTURA,
    };

    return this.http.post<any>(`${this.apiUrl}/paciente/importar-completo`, payload).pipe(
      map((response) => ({
        idPaciente: response.idPaciente || response.id_paciente,
        idAgendamento: response.idAgendamento || response.id_agendamento,
        totalExames: response.totalExames || response.total_exames_inseridos || 0,
      }))
    );
  }

  /**
   * Importa múltiplos pacientes de forma completa
   */
  importarPacientesCompleto(
    pacientes: Paciente[],
    dataAgendamento: string,
    idGrupoExame: number,
    examesDoGrupo: number[] = [],
    idUnidade: number = 3039,
    examesCompletos: any[] = []
  ): Observable<any> {
    const requisicoesPacientes$ = pacientes.map((paciente, index) => {
      return this.importarPacienteCompleto(paciente, dataAgendamento, idGrupoExame, idUnidade).pipe(
        map((resultado) => {
          return {
            pacienteId: resultado.idPaciente,
            pacienteNome: paciente.NOME,
            agendamentoId: resultado.idAgendamento,
            sucesso: true,
            totalExames: resultado.totalExames,
            mensagem: `${paciente.NOME}: ${resultado.totalExames} exames agendados`,
          };
        }),
        catchError((erro) => {
          return of({
            pacienteId: null,
            pacienteNome: paciente.NOME,
            agendamentoId: null,
            sucesso: false,
            totalExames: 0,
            mensagem: '',
            erro: erro.message,
          });
        })
      );
    });

    return forkJoin(requisicoesPacientes$).pipe(
      map((resultados: ResultadoImportacao[]) => {
        const sucessos = resultados.filter((r: ResultadoImportacao) => r.sucesso).length;
        const erros = resultados.filter((r: ResultadoImportacao) => !r.sucesso).length;
        const totalExames = resultados.reduce(
          (acc: number, r: ResultadoImportacao) => acc + r.totalExames,
          0
        );

        return {
          sucesso: sucessos > 0,
          totalProcessados: resultados.length,
          sucessos,
          erros,
          totalExames,
          detalhes: resultados,
          mensagem: `${sucessos} pacientes importados com ${totalExames} exames gerados`,
        };
      }),
      catchError((erro) =>
        of({
          sucesso: false,
          totalProcessados: 0,
          sucessos: 0,
          erros: pacientes.length,
          totalExames: 0,
          detalhes: [],
          mensagem: erro.message,
        })
      )
    );
  }

  // ==================== MÉTODOS PRIVADOS ====================

  /**
   * Converte o objeto Paciente para o formato DTO esperado pelo backend
   */
  private converterPacienteParaDTO(paciente: Paciente): any {
    const anyP: any = paciente;
    const dataRaw = paciente.DATA_NASCIMENTO || anyP.dataNascimento || '';

    return {
      NOME: paciente.NOME || anyP.nome || '',
      CPF: paciente.CPF || anyP.cpf || '',
      GENERO: paciente.GENERO || anyP.genero || '',
      DATA_NASCIMENTO: this.formatarDataParaISO(dataRaw),
      TIPO_TRATAMENTO: (
        paciente.TIPO_TRATAMENTO ||
        anyP.tipoTratamento ||
        anyP.tratamento ||
        ''
      ).toString(),
      DIABETES: this.converterDiabetes(paciente.DIABETES || anyP.DIABETES),
      PESO: paciente.PESO ?? anyP.peso ?? 0,
      ALTURA: paciente.ALTURA ?? anyP.altura ?? 0,
    };
  }

  /**
   * Formata data para o formato ISO (YYYY-MM-DD) que o backend aceita
   * Aceita formatos: DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, M/D/YY, etc.
   */
  private formatarDataParaISO(data: string): string {
    if (!data || data.trim() === '') {
      return '';
    }

    data = data.trim();

    // Se já está no formato ISO (YYYY-MM-DD), retorna como está
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return data;
    }

    let partes: string[] = [];
    if (data.includes('/')) {
      partes = data.split('/');
    } else if (data.includes('-')) {
      partes = data.split('-');
    } else if (data.includes('.')) {
      partes = data.split('.');
    }

    if (partes.length !== 3) {
      return '';
    }

    const p0 = parseInt(partes[0], 10);
    const p1 = parseInt(partes[1], 10);
    const p2 = parseInt(partes[2], 10);

    let dia: number, mes: number, ano: number;

    if (partes[2].length === 4) {
      ano = p2;
      if (p0 > 12) {
        dia = p0;
        mes = p1;
      } else if (p1 > 12) {
        mes = p0;
        dia = p1;
      } else {
        dia = p0;
        mes = p1;
      }
    } else if (partes[2].length <= 2) {
      ano = p2 > 30 ? 1900 + p2 : 2000 + p2;
      if (p0 > 12) {
        dia = p0;
        mes = p1;
      } else if (p1 > 12) {
        mes = p0;
        dia = p1;
      } else {
        dia = p0;
        mes = p1;
      }
    } else {
      return '';
    }

    if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1900 || ano > 2100) {
      return '';
    }

    const diaStr = dia.toString().padStart(2, '0');
    const mesStr = mes.toString().padStart(2, '0');

    return `${ano}-${mesStr}-${diaStr}`;
  }

  /**
   * Converte valor de diabetes para string "Sim" ou "Não"
   */
  private converterDiabetes(diabetes: boolean | string | null | undefined): string | null {
    if (diabetes === null || diabetes === undefined) {
      return null;
    }
    if (typeof diabetes === 'boolean') {
      return diabetes ? 'Sim' : 'Não';
    }
    return diabetes;
  }

  /**
   * Obtém a hora atual formatada
   */
  private obterHoraAtual(): string {
    return new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
