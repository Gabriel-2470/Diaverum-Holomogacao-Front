import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import * as XLSX from 'xlsx';
import {
  PacienteService,
  Paciente,
  GruposExamesService,
  GrupoExamePerfilExame,
  UnidadeService,
} from '../../core/services';
import { Unidade } from '../../core/services/unidade.service';
import { environment } from '../../../environments/environment';

interface PerfilExameUI {
  id: number;
  nome: string;
  qtdExames: number;
  iD_GRUPO_EXAME: number;
  desC_GRUPO_EXAME: string;
}

interface ExameDetalhado {
  iD_EXAME: number;
  desC_EXAME: string;
  cD_EXAME_DB?: string;
  iD_GRUPO_EXAME?: number | null;
  sigla?: string;
  material?: string;
}

interface PacienteUI {
  id: number;
  data: string;
  nome: string;
  cpf: string;
  diabetes: boolean;
  tratamento: string;
  horarioColeta: string;
  status: 'pendente' | 'enviado' | 'erro' | 'correto' | null; // null = não transferido ainda
  expandido: boolean;
  menuAberto?: boolean;
  exames?: ExameDetalhado[];
  podeEditar?: boolean; // false quando status = 'enviado'
}

interface ErroImportacao {
  nome: string;
  cpf: string;
  erro: string;
  linha?: number;
}

@Component({
  selector: 'app-importacao-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [PacienteService, GruposExamesService, UnidadeService],
  templateUrl: './importacao-pacientes.html',
  styleUrl: './importacao-pacientes.scss',
})
export class ImportacaoPacientes implements OnInit, OnDestroy {
  arquivoSelecionado: File | null = null;
  nomeArquivo = '';
  mostrarModal = false;

  // Dados extraídos do Excel
  dadosExcelParsed: Paciente[] = [];
  examesDoGrupo: number[] = [];
  examesDoGrupoCompleto: any[] = []; // Adicionar para armazenar dados completos dos exames

  // Dados do modal
  perfilSelecionado?: number;
  dataColetaGlobal = '';
  unidadesSelecionadas: number[] = [];
  incluirGlicose = false;

  termoBusca = '';

  perfisExames: PerfilExameUI[] = [];
  unidades: Unidade[] = [];
  // Se definido, mostrará apenas pacientes relacionados a essa unidade (definido pela unidade do usuário)
  mostrarApenasUnidadeId: number | null = null;
  pacientes: PacienteUI[] = [];
  todosPacientes: PacienteUI[] = []; // Todos os pacientes sem paginação
  pacientesSelecionados: Set<number> = new Set(); // IDs dos pacientes selecionados

  // Paginação
  paginaAtual = 1;
  itensPorPagina = 50;
  paginasVisiveis: number[] = [];

  // States
  carregando = false;
  processando = false;
  mostrarPreview = false; // controla exibição da preview
  excluindoEmMassa = false; // indica se está excluindo múltiplos pacientes
  progressoExclusao = { atual: 0, total: 0 }; // progresso da exclusão
  transferindo = false; // indica se está transferindo pacientes
  progressoTransferencia = { atual: 0, total: 0 }; // progresso da transferência

  // Edição
  pacienteEditando: PacienteUI | null = null;
  salvandoEdicao = false;

  // Edição de Exames
  pacienteEditandoExames: PacienteUI | null = null;
  examesEditandoTemp: ExameDetalhado[] = [];
  examesEncontrados: any[] = [];
  buscaExame = '';
  carregandoExames = false;
  salvandoExames = false;
  timeoutBusca: any = null;

  // Erros de Importação
  mostrarModalErros = false;
  errosImportacao: ErroImportacao[] = [];
  resumoImportacao = { total: 0, sucessos: 0, erros: 0 };

  constructor(
    private router: Router,
    private http: HttpClient,
    private pacienteService: PacienteService,
    private gruposExamesService: GruposExamesService,
    private unidadeService: UnidadeService
  ) {}

  ngOnInit(): void {
    // Definir unidade do usuário: prioriza currentUser.idUnidade, depois unidadeSelecionada, depois unidadesUsuario
    try {
      const rawUser = localStorage.getItem('currentUser');
      if (rawUser) {
        try {
          const userObj = JSON.parse(rawUser) as any;
          const idFromUser = userObj?.idUnidade ?? userObj?.IdUnidade ?? userObj?.ID_UNIDADE ?? null;
          if (idFromUser != null) {
            this.mostrarApenasUnidadeId = Number(idFromUser);
            console.log('📍 Importação — usando currentUser.idUnidade:', this.mostrarApenasUnidadeId);
            
            // idUnidade = 0 significa consolidador (ver TODAS as clínicas)
            if (this.mostrarApenasUnidadeId === 0) {
              console.log('📍 Usuário consolidador (idUnidade = 0) - mostrando TODAS as clínicas');
            }
          }
        } catch (e) {
          console.warn('Importação — currentUser inválido no localStorage', e);
        }
      }

      // Se não obteve via currentUser, tentar unidadeSelecionada / unidadesUsuario (legacy)
      if (this.mostrarApenasUnidadeId == null) {
        const raw = localStorage.getItem('unidadeSelecionada');
        if (raw) {
          const u = JSON.parse(raw);
          const id = u?.idUnidade ?? u?.IdUnidade ?? u?.iD_UNIDADE ?? u?.ID_UNIDADE ?? u?.id ?? null;
          this.mostrarApenasUnidadeId = id != null ? Number(id) : null;
          console.log('📍 Importação — unidadeSelecionada carregada:', this.mostrarApenasUnidadeId);
          
          // idUnidade = 0 significa consolidador (ver TODAS as clínicas)
          if (this.mostrarApenasUnidadeId === 0) {
            console.log('📍 Usuário consolidador (idUnidade = 0) - mostrando TODAS as clínicas');
          }
        } else {
          const unidadesRaw = localStorage.getItem('unidadesUsuario');
          if (unidadesRaw) {
            try {
              const unidadesArr = JSON.parse(unidadesRaw) as any[];
              if (Array.isArray(unidadesArr) && unidadesArr.length > 0) {
                const unidadePadrao = unidadesArr.find((u) => u.UnidadePadrao || u.unidadePadrao || u.unidadePadrao === true) || unidadesArr[0];
                const idFb = unidadePadrao?.IdUnidade ?? unidadePadrao?.idUnidade ?? unidadePadrao?.iD_UNIDADE ?? unidadePadrao?.ID_UNIDADE ?? unidadePadrao?.id ?? null;
                this.mostrarApenasUnidadeId = idFb != null ? Number(idFb) : null;
                console.log('📍 Importação — fallback unidade do usuário via unidadesUsuario:', this.mostrarApenasUnidadeId);
                
                // idUnidade = 0 significa consolidador (ver TODAS as clínicas)
                if (this.mostrarApenasUnidadeId === 0) {
                  console.log('📍 Usuário consolidador (idUnidade = 0) - mostrando TODAS as clínicas');
                }
              } else {
                this.mostrarApenasUnidadeId = null;
                console.warn('⚠️ Importação — unidadesUsuario está vazia');
              }
            } catch (e) {
              this.mostrarApenasUnidadeId = null;
              console.error('❌ Importação — erro ao parsear unidadesUsuario do localStorage', e);
            }
          } else {
            this.mostrarApenasUnidadeId = null;
            console.warn('⚠️ Importação — nenhuma unidade do usuário encontrada no localStorage');
          }
        }
      }
    } catch (e) {
      this.mostrarApenasUnidadeId = null;
      console.error('❌ Importação — erro ao ler unidade do localStorage', e);
    }

    this.carregarPerfis();
    this.carregarUnidades();
    this.carregarPacientesComAgendamentos();

    // Listener para fechar menu ao clicar fora
    document.addEventListener('click', this.fecharMenusAbertos.bind(this));
  }

  ngOnDestroy(): void {
    // Remove o listener ao destruir o componente
    document.removeEventListener('click', this.fecharMenusAbertos.bind(this));
  }

  private fecharMenusAbertos(): void {
    // Fecha menus de TODOS os pacientes, não apenas os da página atual
    this.todosPacientes.forEach((p) => (p.menuAberto = false));
  }

  /**
   * Carrega as unidades disponíveis
   */
  carregarUnidades(): void {
    this.unidadeService.buscarUnidades().subscribe({
      next: (unidades: Unidade[]) => {
        this.unidades = unidades;
      },
      error: (erro: any) => {
        this.unidades = [];
      },
    });
  }

  /**
   * Carrega pacientes com seus agendamentos e exames do banco
   */
  carregarPacientesComAgendamentos(): void {
    this.carregando = true;
    // Primeiro buscar pacientes, agendamentos e detalhes
    console.log('ImportacaoPacientes.carregarPacientesComAgendamentos -> currentUser/localStorage keys:', {
      currentUser: (() => { try { return JSON.parse(localStorage.getItem('currentUser')||'null'); } catch { return null; } })(),
      unidadeSelecionada: (() => { try { return JSON.parse(localStorage.getItem('unidadeSelecionada')||'null'); } catch { return null; } })(),
      unidadesUsuario: (() => { try { return JSON.parse(localStorage.getItem('unidadesUsuario')||'null'); } catch { return null; } })(),
      mostrarApenasUnidadeId: this.mostrarApenasUnidadeId
    });

    Promise.all([
      this.pacienteService.buscarPacientes(1, 1000, this.mostrarApenasUnidadeId).toPromise(),
      this.pacienteService.buscarAgendamentos(this.mostrarApenasUnidadeId).toPromise(),
      this.pacienteService.buscarAgendaDetalhes(this.mostrarApenasUnidadeId).toPromise(),
    ])
    .then(async ([pacientesRes, agendamentosRes, detalhesRes]: any[]) => {
        const pacientes = pacientesRes?.dados || pacientesRes || [];
        const agendamentos = agendamentosRes?.dados || agendamentosRes || [];
        const detalhes = detalhesRes?.dados || detalhesRes || [];

        // Extrair IDs únicos dos exames necessários
        const idsExamesNecessarios = new Set<number>();
        detalhes.forEach((d: any) => {
          const idExame = d.iD_EXAME || d.ID_EXAME;
          if (idExame) idsExamesNecessarios.add(idExame);
        });

        // Buscar APENAS os exames necessários (pelo ID)
        const examesNecessarios = await this.buscarExamesPorIds(Array.from(idsExamesNecessarios));
        this.processarPacientesComExames(pacientes, agendamentos, detalhes, examesNecessarios);
      })
      .catch((erro: any) => {
        this.carregando = false;
        this.pacientes = [];
        this.todosPacientes = [];

        // Tratar 403 explicitamente para avisar ao usuário que não tem acesso à unidade
        const status = erro?.status ?? (erro?.statusCode ?? null);
        if (status === 403) {
          alert('Você não tem permissão para ver os pacientes desta unidade. Verifique seu perfil ou entre em contato com o administrador.');
        } else {
          console.error('Erro ao carregar pacientes/agendamentos/detalhes:', erro);
        }
      });
  }

  /**
   * Busca exames específicos pelo ID (usando endpoint direto /exames/{id})
   */
  private async buscarExamesPorIds(ids: number[]): Promise<any[]> {
    if (ids.length === 0) return [];

    const examesEncontrados: any[] = [];

    // Buscar em lotes de 20 IDs por vez para não sobrecarregar
    const batchSize = 20;
    for (let i = 0; i < ids.length; i += batchSize) {
      const loteIds = ids.slice(i, i + batchSize);

      // Busca cada exame diretamente pelo ID
      const promessas = loteIds.map(
        (id) =>
          this.http
            .get<any>(`${environment.apiUrl}/exames/${id}`)
            .toPromise()
            .catch(() => null) // Ignora erros individuais
      );

      try {
        const respostas = await Promise.all(promessas);
        respostas.forEach((response: any) => {
          if (response?.sucesso && response?.dados) {
            examesEncontrados.push(response.dados);
          }
        });
      } catch (erro) {
        console.error('Erro ao buscar lote de exames:', erro);
      }
    }

    return examesEncontrados;
  }

  /**
   * Processa pacientes com os exames carregados
   */
  private processarPacientesComExames(
    pacientes: any[],
    agendamentos: any[],
    detalhes: any[],
    todosExames: any[]
  ): void {
    // Mapeia pacientes com seus agendamentos PacienteUI
    const pacientesUI: any[] = pacientes.map((p: any) => {
      const cpfPaciente = p.cpf || p.CPF;

      // Filtra agendamentos DESTE paciente
      const agensPaciente = agendamentos.filter((a: any) => {
        const cpfAg = a.cpF_PACIENTE || a.cPF_PACIENTE || a.CPF_PACIENTE || '';
        return cpfAg === cpfPaciente;
      });

      const tratamentoValue =
        p.tipO_TRATAMENTO ||
        p.TIPO_TRATAMENTO ||
        p.tipoTratamento ||
        p.TRATAMENTO ||
        p.tratamento ||
        '';

      // ✅ ESTRATÉGIA DUPLA: Procurar exames direto pelo CPF em detalhes
      let examesDetalhes = detalhes.filter((d: any) => {
        const cpfDet = d.cpF_PACIENTE || d.CPF_PACIENTE || d.cPF_PACIENTE || d.cpfPaciente || '';
        return cpfDet === (p.cpf || p.CPF);
      });

      // Se não encontrou pelo CPF, procurar pelos agendamentos
      if (examesDetalhes.length === 0) {
        const idsAgendamento = agensPaciente.map((ag: any) => ag.iD_AGENDAMENTO || ag.id);
        examesDetalhes = detalhes.filter((d: any) => {
          const idAg = d.iD_AGENDAMENTO || d.idAgendamento;
          return idsAgendamento.includes(idAg);
        });
      }
      // Coleta TODOS os exames e faz JOIN com a tabela de exames para pegar o nome completo
      const examesDetalhados: ExameDetalhado[] = [];
      examesDetalhes.forEach((ex: any) => {
        const exameJaAdicionado = examesDetalhados.find(
          (e) => e.iD_EXAME === (ex.iD_EXAME || ex.ID_EXAME)
        );
        if (!exameJaAdicionado) {
          // Buscar dados completos do exame no catálogo
          const idExame = ex.iD_EXAME || ex.ID_EXAME;
          const exameCatalogo = todosExames.find(
            (e: any) => (e.iD_EXAME || e.ID_EXAME) === idExame
          );

          // Prioridade: 1) DESC_EXAME do detalhe (TBL_AGENDA_DETALHE), 2) dS_EXAME do catálogo, 3) fallback
          const descExame =
            ex.DESC_EXAME ||
            ex.desC_EXAME ||
            ex.descExame ||
            exameCatalogo?.dS_EXAME ||
            exameCatalogo?.DS_EXAME ||
            exameCatalogo?.dsExame ||
            `Exame ${idExame}`;

          const cdExameDB =
            ex.cD_EXAME_DB ||
            ex.CD_EXAME_DB ||
            ex.cdExameDB ||
            exameCatalogo?.cD_EXAME_DB ||
            exameCatalogo?.CD_EXAME_DB ||
            exameCatalogo?.cD_EXAME ||
            exameCatalogo?.CD_EXAME ||
            '';

          // Capturar ID_GRUPO_EXAME da TBL_AGENDA_DETALHE
          const idGrupoExame = ex.iD_GRUPO_EXAME || ex.ID_GRUPO_EXAME || ex.idGrupoExame || null;

          const novoExame = {
            iD_EXAME: idExame,
            desC_EXAME: descExame,
            cD_EXAME_DB: cdExameDB,
            iD_GRUPO_EXAME: idGrupoExame,
            sigla: exameCatalogo?.sigla || exameCatalogo?.SIGLA || ex.SIGLA || ex.sigla || '',
            material:
              exameCatalogo?.material ||
              exameCatalogo?.MATERIAL ||
              ex.MATERIAL ||
              ex.material ||
              'Soro',
          };
          examesDetalhados.push(novoExame);
        }
      });

      // Normalizar diabetes como boolean para exibição
      let diabetesBoolean = false;
      const diabetesValue = p.DIABETES || p.diabetes;

      if (typeof diabetesValue === 'boolean') {
        diabetesBoolean = diabetesValue;
      } else if (typeof diabetesValue === 'string') {
        const valorLower = diabetesValue.toLowerCase().trim();
        diabetesBoolean = ['sim', 's', 'true', '1', 'yes', 'y'].includes(valorLower);
      } else if (typeof diabetesValue === 'number') {
        diabetesBoolean = diabetesValue === 1;
      }

      // Pegar a data do agendamento pelos detalhes (exames)
      let dataAgendamento = '';
      if (examesDetalhes.length > 0) {
        const idAgendamentoPrimeiro =
          examesDetalhes[0].iD_AGENDAMENTO || examesDetalhes[0].idAgendamento;
        const agendamentoEncontrado = agendamentos.find(
          (ag: any) => (ag.iD_AGENDAMENTO || ag.id) === idAgendamentoPrimeiro
        );
        if (agendamentoEncontrado) {
          dataAgendamento =
            agendamentoEncontrado.datA_AGENDAMENTO?.split('T')[0] ||
            agendamentoEncontrado.DATA_AGENDAMENTO?.split('T')[0] ||
            agendamentoEncontrado.dataAgendamento?.split('T')[0] ||
            '';
        }
      }

      // Se não encontrou data via exames, procurar agendamento direto pelo CPF
      if (!dataAgendamento && agensPaciente.length > 0) {
        const primeiroAgendamento = agensPaciente[0];
        dataAgendamento =
          primeiroAgendamento.datA_AGENDAMENTO?.split('T')[0] ||
          primeiroAgendamento.DATA_AGENDAMENTO?.split('T')[0] ||
          primeiroAgendamento.dataAgendamento?.split('T')[0] ||
          '';
      }

      // ✅ Verificar se TODOS os exames do paciente já foram enviados (IND_REG_ENVIADO = 1)
      const todosExamesEnviados =
        examesDetalhes.length > 0 &&
        examesDetalhes.every((ex: any) => {
          const enviado = ex.inD_REG_ENVIADO ?? ex.IND_REG_ENVIADO ?? ex.ind_reg_enviado ?? false;
          return enviado === true || enviado === 1;
        });

      return {
        id: p.iD_PACIENTE || p.id,
        data: dataAgendamento,
        nome: p.nome || p.NOME || '',
        cpf: cpfPaciente || '',
        diabetes: diabetesBoolean,
        tratamento:
          p.tipO_TRATAMENTO ||
          p.TIPO_TRATAMENTO ||
          p.tipoTratamento ||
          p.TRATAMENTO ||
          p.tratamento ||
          '',
        horarioColeta: dataAgendamento,
        status: todosExamesEnviados ? ('enviado' as const) : ('correto' as const),
        expandido: false,
        exames: examesDetalhados,
        podeEditar: !todosExamesEnviados, // Bloqueia edição se todos exames já foram enviados
      };
    }).filter((p) => p !== null);

    // O backend já filtra pacientes por unidade, então não precisamos filtrar novamente aqui.
    // Apenas usamos os pacientes retornados diretamente.
    let pacientesFiltradosPorUnidade: PacienteUI[] = pacientesUI;
    
    // Log para debug
    if (this.mostrarApenasUnidadeId) {
      console.log('DEBUG: Backend já filtrou por unidade:', this.mostrarApenasUnidadeId);
      console.log('DEBUG: Pacientes retornados:', pacientesUI.length);
    }

    // Armazenar todos os pacientes e aplicar paginação
    this.todosPacientes = Array.isArray(pacientesFiltradosPorUnidade)
      ? [...pacientesFiltradosPorUnidade]
      : [];

    // Sincronizar `pacientes` (usado por alguns métodos antigos) com a página atual
    this.pacientes = this.todosPacientes.slice(0, this.itensPorPagina);

    // Reset seleção e paginação
    this.pacientesSelecionados.clear();
    this.paginaAtual = 1;
    this.atualizarPaginasVisiveis();
    this.atualizarPacientesDaPagina();

    console.log('ImportacaoPacientes -> pacientes carregados (todosPacientes):', this.todosPacientes.length);

    this.carregando = false;
  }

  /**
   * Atualiza a paginação dos pacientes
   */
  private atualizarPaginacao(): void {
    this.paginaAtual = 1;
    this.atualizarPaginasVisiveis();
  }

  /**
   * Atualiza a lista de pacientes exibidos na página atual
   */
  private atualizarPacientesDaPagina(): void {
    const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
    const fim = inicio + this.itensPorPagina;
    this.pacientes = this.todosPacientes.slice(inicio, fim);
  }

  /**
   * Carrega os perfis de exames da API
   */
  carregarPerfis(): void {
    this.carregando = true;
    this.gruposExamesService.getPerfis().subscribe({
      next: (perfis: GrupoExamePerfilExame[]) => {
        this.perfisExames = perfis.map((p) => ({
          id: p.iD_GRUPO_EXAME,
          nome: p.desC_GRUPO_EXAME,
          qtdExames: 0,
          iD_GRUPO_EXAME: p.iD_GRUPO_EXAME,
          desC_GRUPO_EXAME: p.desC_GRUPO_EXAME,
        }));

        // Carregar quantidade de exames para cada perfil
        this.perfisExames.forEach((perfil) => {
          this.carregarQtdExames(perfil);
        });

        this.carregando = false;
      },
      error: (erro: any) => {
        this.carregando = false;
      },
    });
  }

  /**
   * Carrega a quantidade de exames para um perfil
   */
  private carregarQtdExames(perfil: PerfilExameUI): void {
    this.gruposExamesService.buscarExamesDoGrupo(perfil.id).subscribe({
      next: (resposta: any) => {
        const dados = resposta.dados || [];
        perfil.qtdExames = dados.length;
      },
      error: (erro: any) => {
        perfil.qtdExames = 0;
      },
    });
  }

  /**
   * Busca os exames de um grupo específico
   */
  carregarExamesDoGrupo(idGrupo: number): Promise<void> {
    return new Promise((resolve) => {
      // Buscar exames do grupo E exames completos em paralelo
      Promise.all([
        this.gruposExamesService.buscarExamesDoGrupo(idGrupo).toPromise(),
        this.http.get<any>(`${environment.apiUrl}/exames?pagina=1&tamanhoPagina=5000`).toPromise(),
      ])
        .then(([resGrupo, resExames]: any[]) => {
          const idsExamesGrupo = (resGrupo?.dados || []).map(
            (item: any) => item.iD_EXAME || item.ID_EXAME
          );
          const todosExames = resExames?.dados || resExames || [];

          // Fazer JOIN: pega apenas os exames que estão no grupo, com dados completos
          this.examesDoGrupoCompleto = todosExames.filter((exame: any) => {
            const idExame = exame.iD_EXAME || exame.ID_EXAME;
            return idsExamesGrupo.includes(idExame);
          });

          // Extrair IDs dos exames
          this.examesDoGrupo = this.examesDoGrupoCompleto.map(
            (item: any) => item.iD_EXAME || item.ID_EXAME
          );

          // Atualizar qtdExames no perfil selecionado
          const perfilAtual = this.perfisExames.find((p) => p.id === idGrupo);
          if (perfilAtual) {
            perfilAtual.qtdExames = this.examesDoGrupo.length;
          }

          resolve();
        })
        .catch((erro: any) => {
          this.examesDoGrupo = [];
          this.examesDoGrupoCompleto = [];
          resolve();
        });
    });
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.arquivoSelecionado = file;
      this.nomeArquivo = file.name;
      this.lerArquivoExcel(file);
      this.mostrarModal = true;

      this.perfilSelecionado = undefined;
      this.dataColetaGlobal = '';
      this.unidadesSelecionadas = [];
      this.incluirGlicose = false;
    }
  }

  lerArquivoExcel(file: File): void {
    const reader = new FileReader();

    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        this.processarDadosExcel(jsonData);
      } catch (error) {}
    };

    reader.readAsArrayBuffer(file);
  }

  processarDadosExcel(dados: any[]): void {
    this.dadosExcelParsed = dados.map((linha: any, idx: number) => {
      // Função auxiliar para buscar valor em múltiplas variações de nome
      const buscarCampo = (nomes: string[]): string => {
        for (const nome of nomes) {
          // usar hasOwnProperty para aceitar valores falsy como '0' e diferenciar undefined/null
          if (
            Object.prototype.hasOwnProperty.call(linha, nome) &&
            linha[nome] !== null &&
            linha[nome] !== undefined
          ) {
            return (linha[nome] || '').toString().trim();
          }
        }
        return '';
      };

      // Extrair valores com múltiplas variações de nome de coluna
      const nome =
        buscarCampo(['Nome Sobrenome', 'Nome', 'NOME', 'nome', 'PACIENTE', 'Paciente']) || '';
      const cpf = buscarCampo(['CPF', 'cpf', 'CPF_PACIENTE']) || '';
      const genero = buscarCampo(['Gênero', 'G�nero', 'GENERO', 'genero', 'Sexo', 'SEXO']) || 'M';
      const dataNascimentoRaw =
        buscarCampo([
          'Data de Nascimento',
          'Data Nascimento',
          'DATA_NASCIMENTO',
          'data_nascimento',
          'Data_Nascimento',
        ]) || '';
      // Converter data para formato ISO (YYYY-MM-DD)
      const dataNascimento = this.formatarDataParaISO(dataNascimentoRaw);
      const peso = this.validarPeso(buscarCampo(['Peso', 'PESO', 'peso']));
      const altura = this.validarAltura(buscarCampo(['Altura', 'ALTURA', 'altura']));
      const diabetes = this.converterParaString(buscarCampo(['Diabetes', 'DIABETES', 'diabetes']));
      const tratamento =
        buscarCampo([
          'Tipo de tratamento',
          'Tipo de Tratamento',
          'Tratamento',
          'TRATAMENTO',
          'tratamento',
          'TIPO_TRATAMENTO',
          'Tipo Tratamento',
        ]) || '';

      // Validar CPF (remover formatação e manter apenas dígitos para validação)
      const cpfValidado = this.validarCPF(cpf);

      const paciente: Paciente = {
        NOME: nome,
        CPF: cpfValidado,
        TIPO_TRATAMENTO: tratamento,
        DIABETES: diabetes,
        GENERO: genero,
        DATA_NASCIMENTO: dataNascimento,
        PESO: peso,
        ALTURA: altura,
      };

      return paciente;
    });
  }

  /**
   * Valida CPF conforme algoritmo do backend
   * Retorna CPF sem formatação (apenas dígitos)
   * NOTE: Se falhar validação, ainda retorna o CPF para o backend decidir
   */
  private validarCPF(cpf: string): string {
    // Remove espaços e caracteres especiais, mantém apenas dígitos
    const cpfLimpo = cpf.replace(/[\s.-]/g, '').replace(/\D/g, '');

    // Se não tiver 11 dígitos, retorna mesmo assim (backend vai validar)
    if (cpfLimpo.length !== 11) {
      return cpfLimpo;
    }

    // Se todos os dígitos são iguais, avisa mas retorna mesmo assim
    if (cpfLimpo.split('').every((d) => d === cpfLimpo[0])) {
      return cpfLimpo;
    }

    // Calcular e validar dígitos verificadores
    const digitos = cpfLimpo.split('').map((d) => parseInt(d));

    // Validar primeiro dígito verificador
    let soma = 0;
    for (let i = 0; i < 9; i++) {
      soma += digitos[i] * (10 - i);
    }
    let resto = soma % 11;
    let digito1 = resto < 2 ? 0 : 11 - resto;

    if (digitos[9] !== digito1) {
      return cpfLimpo; // Continua mesmo assim
    }

    // Validar segundo dígito verificador
    soma = 0;
    for (let i = 0; i < 10; i++) {
      soma += digitos[i] * (11 - i);
    }
    resto = soma % 11;
    let digito2 = resto < 2 ? 0 : 11 - resto;

    if (digitos[10] !== digito2) {
      return cpfLimpo; // Continua mesmo assim
    }

    return cpfLimpo;
  }

  private converterParaString(valor: any): string {
    if (typeof valor === 'boolean') {
      return valor ? 'Sim' : 'Não';
    }

    if (typeof valor === 'string') {
      const trimmed = valor.toLowerCase().trim();
      if (['sim', 's', 'true', '1', 'yes', 'y'].includes(trimmed)) {
        return 'Sim';
      }
      if (['não', 'n', 'false', '0', 'no'].includes(trimmed)) {
        return 'Não';
      }
      if (valor.trim() === 'Sim' || valor.trim() === 'Não') {
        return valor.trim();
      }
    }

    return '';
  }

  private validarPeso(peso: any): number {
    let pesoNum = parseFloat(peso);

    if (isNaN(pesoNum) || pesoNum <= 0) {
      return 70; // Peso padrão se vazio ou inválido
    }

    if (pesoNum > 300) {
      return 300;
    }

    if (pesoNum < 1) {
      return 1;
    }

    return pesoNum;
  }

  private validarAltura(altura: any): number {
    let alturaNum = parseFloat(altura);

    if (isNaN(alturaNum) || alturaNum <= 0) {
      return 1.7; // Altura padrão se vazio ou inválido
    }

    if (alturaNum > 3) {
      alturaNum = alturaNum / 100;
    }

    if (alturaNum > 3) {
      return 3;
    }

    if (alturaNum < 0.01) {
      return 0.01;
    }

    return alturaNum;
  }

  /**
   * Formata data para o formato ISO (YYYY-MM-DD) que o backend aceita
   * Aceita formatos: DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, M/D/YY, etc.
   */
  private formatarDataParaISO(data: string): string {
    if (!data || data.trim() === '') {
      return '';
    }

    // Limpa a string
    data = data.trim();

    // Se já está no formato ISO (YYYY-MM-DD), retorna como está
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return data;
    }

    // Tenta identificar o separador
    let partes: string[] = [];
    if (data.includes('/')) {
      partes = data.split('/');
    } else if (data.includes('-')) {
      partes = data.split('-');
    } else if (data.includes('.')) {
      partes = data.split('.');
    }

    if (partes.length !== 3) {
      console.warn(`Data inválida: ${data}`);
      return '';
    }

    let dia: number, mes: number, ano: number;

    // Detectar formato baseado nos valores
    const p0 = parseInt(partes[0], 10);
    const p1 = parseInt(partes[1], 10);
    const p2 = parseInt(partes[2], 10);

    // Se o primeiro número > 12, assume que é dia (formato DD/MM/YYYY - pt-BR)
    // Se o segundo número > 12, assume que é dia (formato MM/DD/YYYY - US)
    // Se terceiro tem 4 dígitos, é ano completo

    if (partes[2].length === 4) {
      // Formato DD/MM/YYYY ou MM/DD/YYYY
      ano = p2;

      if (p0 > 12) {
        // Primeiro é dia (DD/MM/YYYY - pt-BR)
        dia = p0;
        mes = p1;
      } else if (p1 > 12) {
        // Segundo é dia (MM/DD/YYYY - US)
        mes = p0;
        dia = p1;
      } else {
        // Ambiguo - assumir pt-BR (DD/MM/YYYY)
        dia = p0;
        mes = p1;
      }
    } else if (partes[2].length === 2) {
      // Formato com ano de 2 dígitos (DD/MM/YY ou M/D/YY)
      // Converter ano de 2 para 4 dígitos
      ano = p2 > 30 ? 1900 + p2 : 2000 + p2; // 74 -> 1974, 25 -> 2025

      if (p0 > 12) {
        // Primeiro é dia (DD/MM/YY - pt-BR)
        dia = p0;
        mes = p1;
      } else if (p1 > 12) {
        // Segundo é dia (MM/DD/YY - US)
        mes = p0;
        dia = p1;
      } else {
        // Ambiguo - assumir pt-BR (DD/MM/YY)
        dia = p0;
        mes = p1;
      }
    } else {
      console.warn(`Formato de data não reconhecido: ${data}`);
      return '';
    }

    // Validar valores
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1900 || ano > 2100) {
      console.warn(`Data com valores inválidos: ${data} -> dia=${dia}, mes=${mes}, ano=${ano}`);
      return '';
    }

    // Formatar para ISO (YYYY-MM-DD)
    const diaStr = dia.toString().padStart(2, '0');
    const mesStr = mes.toString().padStart(2, '0');

    return `${ano}-${mesStr}-${diaStr}`;
  }

  private gerarCPFValido(seed: number = Math.random()): string {
    let numeros = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));

    let soma = 0;
    for (let i = 0; i < 9; i++) {
      soma += numeros[i] * (10 - i);
    }
    let resto = soma % 11;
    let digito1 = resto < 2 ? 0 : 11 - resto;
    numeros.push(digito1);

    soma = 0;
    for (let i = 0; i < 10; i++) {
      soma += numeros[i] * (11 - i);
    }
    resto = soma % 11;
    let digito2 = resto < 2 ? 0 : 11 - resto;
    numeros.push(digito2);

    return numeros.join('');
  }

  removerArquivo(): void {
    this.arquivoSelecionado = null;
    this.nomeArquivo = '';
    this.dadosExcelParsed = [];
    this.mostrarModal = false;
  }

  abrirTransferencia(): void {
    const pacientes = this.getPacientesSelecionados();

    if (pacientes.length === 0) {
      alert('Nenhum paciente selecionado para transferência.');
      return;
    }

    // Ativar estado de loading
    this.transferindo = true;
    this.progressoTransferencia = { atual: 0, total: pacientes.length };

    // Marcar todos como pendente (amarelo) enquanto processa
    pacientes.forEach((paciente) => {
      paciente.status = 'pendente';
    });

    const cpfs = pacientes.map((p) => p.cpf);

    // Chamar endpoint de processamento de pendentes
    this.pacienteService.processarPendentes(cpfs).subscribe({
      next: (res: any) => {
        // Verificar resposta do backend
        if (res.sucesso && res.resultados) {
          // Backend retorna array com status de cada CPF
          res.resultados.forEach((resultado: any, index: number) => {
            const paciente = pacientes.find((p) => p.cpf === resultado.cpf);
            if (paciente) {
              if (resultado.enviado || resultado.sucesso) {
                paciente.status = 'enviado'; // Verde
                paciente.podeEditar = false;
              } else {
                paciente.status = 'erro'; // Vermelho
              }
            }
            // Atualizar progresso
            this.progressoTransferencia.atual = index + 1;
          });

          const enviados = res.resultados.filter((r: any) => r.enviado || r.sucesso).length;
          const erros = res.resultados.length - enviados;

          if (erros > 0) {
            alert(
              `⚠️ ${enviados} enviado(s) com sucesso, ${erros} com erro. Verifique os pacientes marcados em vermelho.`
            );
          } else {
            alert(`✅ ${enviados} paciente(s) transferido(s) com sucesso!`);
          }
        } else if (res.sucesso) {
          // Resposta simples de sucesso sem detalhes por CPF
          pacientes.forEach((paciente) => {
            paciente.status = 'enviado';
            paciente.podeEditar = false;
          });
          this.progressoTransferencia.atual = pacientes.length;
          alert(`✅ ${pacientes.length} paciente(s) transferido(s) com sucesso!`);
        } else {
          // Resposta indica erro geral
          pacientes.forEach((paciente) => {
            paciente.status = 'erro';
          });
          alert(`❌ Erro ao transferir pacientes: ${res.mensagem || 'Erro desconhecido'}`);
        }

        // Desativar loading e limpar seleção
        this.transferindo = false;
        this.progressoTransferencia = { atual: 0, total: 0 };
        this.pacientesSelecionados.clear();
      },
      error: (err: any) => {
        // Marcar todos como erro (vermelho)
        pacientes.forEach((paciente) => {
          paciente.status = 'erro';
        });
        console.error('Erro ao transferir:', err);
        alert('❌ Erro ao transferir pacientes. Verifique o console para mais detalhes.');

        // Desativar loading
        this.transferindo = false;
        this.progressoTransferencia = { atual: 0, total: 0 };
      },
    });
  }

  getPacientesSelecionados() {
    return this.todosPacientes.filter((p) => this.pacientesSelecionados.has(p.id));
  }

  excluirPacientesSelecionados(): void {
    if (this.quantidadeSelecionados === 0) {
      return;
    }

    const qtdAntes = this.quantidadeSelecionados;
    const confirmacao = confirm(
      `Deseja realmente excluir ${qtdAntes} paciente${qtdAntes > 1 ? 's' : ''} selecionado${
        qtdAntes > 1 ? 's' : ''
      } do banco de dados?`
    );

    if (confirmacao) {
      const idsParaRemover = Array.from(this.pacientesSelecionados);

      // Ativar estado de carregamento
      this.excluindoEmMassa = true;
      this.progressoExclusao = { atual: 0, total: idsParaRemover.length };

      // Excluir todos os pacientes em uma única requisição (muito mais rápido!)
      this.pacienteService.excluirPacientesEmLote(idsParaRemover).subscribe({
        next: (resultado: any) => {
          this.finalizarExclusao(idsParaRemover, resultado.excluidos || idsParaRemover.length, resultado.erros || 0);
        },
        error: (erro: any) => {
          console.error('Erro ao excluir pacientes em lote:', erro);
          // Fallback: tentar excluir um por um se o endpoint em lote falhar
          this.excluirPacientesUmPorUm(idsParaRemover);
        },
      });
    }
  }

  // Fallback caso o endpoint em lote não funcione
  private excluirPacientesUmPorUm(idsParaRemover: number[]): void {
    let excluidos = 0;
    let erros = 0;

    idsParaRemover.forEach((idPaciente) => {
      this.pacienteService.excluirPaciente(idPaciente).subscribe({
        next: () => {
          excluidos++;
          this.progressoExclusao.atual = excluidos + erros;

          if (excluidos + erros === idsParaRemover.length) {
            this.finalizarExclusao(idsParaRemover, excluidos, erros);
          }
        },
        error: () => {
          erros++;
          this.progressoExclusao.atual = excluidos + erros;

          if (excluidos + erros === idsParaRemover.length) {
            this.finalizarExclusao(idsParaRemover, excluidos, erros);
          }
        },
      });
    });
  }

  private finalizarExclusao(idsRemovidos: number[], excluidos: number, erros: number): void {
    // Filtrar todosPacientes (que usa .id) removendo os selecionados
    this.todosPacientes = this.todosPacientes.filter(
      (paciente) => !idsRemovidos.includes(paciente.id)
    );

    // Também remover de dadosExcelParsed (que usa .iD_PACIENTE)
    this.dadosExcelParsed = this.dadosExcelParsed.filter(
      (paciente) => !idsRemovidos.includes(paciente.iD_PACIENTE!)
    );

    // Limpar seleção
    this.pacientesSelecionados.clear();

    // Recalcular paginação se necessário
    if (this.paginaAtual > this.totalPaginas && this.totalPaginas > 0) {
      this.paginaAtual = this.totalPaginas;
    }

    // Desativar estado de carregamento
    this.excluindoEmMassa = false;
    this.progressoExclusao = { atual: 0, total: 0 };

    // Mostrar resultado
    if (erros > 0) {
      alert(`${excluidos} paciente(s) excluído(s) com sucesso.\n${erros} erro(s) ao excluir.`);
    } else {
      alert(`✅ ${excluidos} paciente(s) excluído(s) com sucesso!`);
    }
  }

  fecharModal(): void {
    this.mostrarModal = false;
  }

  toggleUnidade(idUnidade: number): void {
    const index = this.unidadesSelecionadas.indexOf(idUnidade);
    if (index > -1) {
      this.unidadesSelecionadas.splice(index, 1);
    } else {
      this.unidadesSelecionadas.push(idUnidade);
    }
  }

  unidadeEstaSelecionada(idUnidade: number): boolean {
    return this.unidadesSelecionadas.includes(idUnidade);
  }

  selecionarTodasUnidades(): void {
    this.unidadesSelecionadas = this.unidades.map((u) => u.iD_UNIDADE);
  }

  deselecionarTodasUnidades(): void {
    this.unidadesSelecionadas = [];
  }

  finalizarImportacao(): void {
    if (!this.perfilSelecionado || !this.dataColetaGlobal) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    if (this.dadosExcelParsed.length === 0) {
      return;
    }

    // Transformar dados para PacienteUI com status
    this.pacientes = this.dadosExcelParsed.map((paciente: any, index: number) => ({
      id: index + 1,
      data: this.dataColetaGlobal,
      nome: paciente.NOME || paciente.nome || '',
      cpf: paciente.CPF || paciente.cpf || '',
      diabetes:
        typeof (paciente.DIABETES || paciente.diabetes) === 'string'
          ? ['sim', 's', 'Sim'].includes(paciente.DIABETES || paciente.diabetes)
          : (paciente.DIABETES || paciente.diabetes),
      tratamento: paciente.TIPO_TRATAMENTO || paciente.tipO_TRATAMENTO,
      horarioColeta: '',
      status: null, // Ainda não foi transferido
      expandido: false,
      podeEditar: true,
    }));

    // Sincronizar todosPacientes para que as estatísticas funcionem
    this.todosPacientes = [...this.pacientes];

    // Fechar modal e mostrar preview
    this.mostrarModal = false;
    this.mostrarPreview = true;
  }

  confirmarImportacao(): void {
    if (!this.perfilSelecionado) {
      return;
    }

    // Carregar exames e depois processar
    this.carregarExamesDoGrupo(this.perfilSelecionado).then(() => {
      this.procesarImportacao();
    });
  }

  cancelarPreview(): void {
    this.mostrarPreview = false;
    this.mostrarModal = true;
    this.pacientes = [];
  }

  procesarImportacao(): void {
    this.processando = true;

    // Preparar dados para o novo endpoint
    const dataCadastro = new Date();
    const horaCadastro = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const dataAgendamento = new Date(this.dataColetaGlobal);

    // Determinar a unidade a ser usada (prioridade):
    // 1. Unidades selecionadas manualmente no modal
    // 2. Unidade do usuário logado (do localStorage)
    // 3. Primeira unidade disponível na lista
    // 4. Fallback: ID padrão
    let unidadesParaProcessar: number[] = [];

    if (this.unidadesSelecionadas.length > 0) {
      // Usar unidades selecionadas manualmente
      unidadesParaProcessar = this.unidadesSelecionadas;
      console.log(`✅ Usando unidades selecionadas manualmente: ${unidadesParaProcessar.join(', ')}`);
    } else if (this.mostrarApenasUnidadeId) {
      // Usar a unidade do usuário logado
      unidadesParaProcessar = [this.mostrarApenasUnidadeId];
      console.log(`✅ Usando unidade do usuário logado: ${this.mostrarApenasUnidadeId}`);
    } else if (this.unidades.length > 0) {
      // Usar primeira unidade disponível
      unidadesParaProcessar = [this.unidades[0].iD_UNIDADE];
      console.warn(
        `⚠️ Nenhuma unidade do usuário encontrada, usando primeira unidade disponível: ${unidadesParaProcessar[0]}`
      );
    } else {
      // Fallback: usar ID 3039
      unidadesParaProcessar = [3039];
      console.warn('⚠️ Nenhuma unidade disponível, usando ID padrão 3039');
    }


    this.pacienteService
          .importarPacientesCompleto(
            this.dadosExcelParsed,
            this.dataColetaGlobal,
            this.perfilSelecionado!,
            this.examesDoGrupo,
            unidadesParaProcessar[0],
            this.examesDoGrupoCompleto
          )
          .subscribe({
            next: (resultado: any) => {
              this.processando = false;
              this.mostrarPreview = false;

              // Armazenar resumo da importação
              this.resumoImportacao = {
                total: resultado.totalProcessados || this.dadosExcelParsed.length,
                sucessos: resultado.sucessos || 0,
                erros: resultado.erros || 0
              };

              // Capturar pacientes com erro a partir dos detalhes
              this.errosImportacao = [];
              if (resultado.detalhes && Array.isArray(resultado.detalhes)) {
                resultado.detalhes.forEach((detalhe: any, index: number) => {
                  if (!detalhe.sucesso) {
                    const pacienteOriginal = this.dadosExcelParsed[index];
                    this.errosImportacao.push({
                      nome: detalhe.pacienteNome || pacienteOriginal?.NOME || 'Desconhecido',
                      cpf: pacienteOriginal?.CPF || 'N/A',
                      erro: detalhe.erro || detalhe.mensagem || 'Erro desconhecido ao importar',
                      linha: index + 2 // +2 porque linha 1 é cabeçalho e índice começa em 0
                    });
                  }
                });
              }

              // Log detalhado no console para diagnóstico
              console.log('📊 Resultado da importação:', {
                total: this.resumoImportacao.total,
                sucessos: this.resumoImportacao.sucessos,
                erros: this.resumoImportacao.erros,
                detalhes: resultado.detalhes
              });

              if (this.errosImportacao.length > 0) {
                console.warn('⚠️ Pacientes com erro na importação:', this.errosImportacao);
              }
              const idUnidade = this.getUnidade();
              if (resultado.sucessos > 0 && idUnidade) {
                const requestsAgendamento = this.pacienteService
                    .gerarAgendaDetalhe(
                      idUnidade,
                      this.perfilSelecionado!,
                      dataCadastro,
                      horaCadastro,
                      dataAgendamento,
                      this.incluirGlicose
                    )
                    .toPromise()

                    requestsAgendamento.then(() => {
                      this.carregarPacientesComAgendamentos();
                    })

              }

              // Mostrar modal de erros se houver falhas, senão mostrar alerta de sucesso
              if (this.errosImportacao.length > 0) {
                this.mostrarModalErros = true;
              } else {
                alert(
                  `✅ Importação concluída!\n${resultado.sucessos} paciente(s) importado(s) com sucesso para ${unidadesParaProcessar.length} unidade(s)`
                );
              }

              this.removerArquivo();
            },
            error: (erro: any) => {
              this.processando = false;
              console.error('❌ Erro na importação:', erro);

              // Marcar todos como erro
              this.errosImportacao = this.dadosExcelParsed.map((p: any, index: number) => ({
                nome: p.NOME || p.nome || 'Desconhecido',
                cpf: p.CPF || p.cpf || 'N/A',
                erro: erro?.error?.message || erro?.message || 'Erro de conexão com o servidor',
                linha: index + 2
              }));

              this.resumoImportacao = {
                total: this.dadosExcelParsed.length,
                sucessos: 0,
                erros: this.dadosExcelParsed.length
              };

              this.mostrarModalErros = true;
            },
          });
  }

  /**
   * Fecha o modal de erros de importação
   */
  fecharModalErros(): void {
    this.mostrarModalErros = false;
    this.errosImportacao = [];
  }

  togglePaciente(paciente: PacienteUI): void {
    paciente.expandido = !paciente.expandido;
  }

  toggleMenu(paciente: PacienteUI, event?: Event): void {
    // Previne o evento de propagação para não fechar o menu imediatamente
    if (event) {
      event.stopPropagation();
    }

    // Fecha todos os outros menus
    this.pacientes.forEach((p) => {
      if (p.id !== paciente.id) {
        p.menuAberto = false;
      }
    });
    // Toggle do menu atual
    paciente.menuAberto = !paciente.menuAberto;
  }

  editarPaciente(paciente: PacienteUI): void {
    paciente.menuAberto = false;
    // Cria uma cópia do paciente para edição
    this.pacienteEditando = { ...paciente };
  }

  cancelarEdicao(): void {
    this.pacienteEditando = null;
    this.salvandoEdicao = false;
  }

  salvarEdicao(): void {
    if (!this.pacienteEditando) return;

    this.salvandoEdicao = true;

    // Primeiro busca os dados atuais do paciente no backend para preservar campos não editados
    this.pacienteService.buscarPacientePorId(this.pacienteEditando.id).subscribe({
      next: (response: any) => {
        const pacienteOriginal = response.dados || response;

        // Mescla os dados editados com os dados originais do backend
        const pacienteParaAPI: Paciente = {
          NOME: this.pacienteEditando!.nome,
          CPF: this.pacienteEditando!.cpf,
          GENERO: pacienteOriginal.genero || pacienteOriginal.GENERO || 'M',
          DATA_NASCIMENTO: this.pacienteEditando!.data,
          TIPO_TRATAMENTO: this.pacienteEditando!.tratamento,
          DIABETES: this.pacienteEditando!.diabetes ? 'Sim' : 'Não',
          PESO: pacienteOriginal.peso || pacienteOriginal.PESO || 70,
          ALTURA: pacienteOriginal.altura || pacienteOriginal.ALTURA || 1.7,
        };

        this.pacienteService
          .atualizarPaciente(this.pacienteEditando!.id, pacienteParaAPI)
          .subscribe({
            next: () => {
              // Atualiza o paciente na lista local
              const index = this.todosPacientes.findIndex((p) => p.id === this.pacienteEditando!.id);
              if (index > -1 && this.pacienteEditando) {
                this.todosPacientes[index] = { ...this.pacienteEditando };
              }

              alert('Paciente atualizado com sucesso!');
              this.cancelarEdicao();
            },
            error: (err: any) => {
              console.error('Erro ao atualizar paciente:', err);
              alert('Erro ao atualizar paciente. Verifique os dados e tente novamente.');
              this.salvandoEdicao = false;
            },
          });
      },
      error: (err: any) => {
        console.error('Erro ao buscar paciente:', err);
        alert('Erro ao buscar dados do paciente. Tente novamente.');
        this.salvandoEdicao = false;
      },
    });
  }

  excluirPaciente(paciente: PacienteUI): void {
    paciente.menuAberto = false;

    if (!confirm(`Tem certeza que deseja excluir o paciente ${paciente.nome}?`)) {
      return;
    }

    // Chama a API de DELETE
    this.pacienteService.excluirPaciente(paciente.id).subscribe({
      next: () => {
        // Remove da lista local
        const index = this.todosPacientes.findIndex((p) => p.id === paciente.id);
        if (index > -1) {
          this.todosPacientes.splice(index, 1);
        }
        // Ajustar página se necessário
        if (this.paginaAtual > this.totalPaginas && this.totalPaginas > 0) {
          this.paginaAtual = this.totalPaginas;
        }
        this.atualizarPaginasVisiveis();
        alert('Paciente excluído com sucesso!');
      },
      error: (err: any) => {
        console.error('Erro ao excluir paciente:', err);
        alert('Erro ao excluir paciente. Tente novamente.');
      },
    });
  }

  removerExame(paciente: PacienteUI, exameIndex: number): void {
    if (!paciente.exames || !paciente.exames[exameIndex]) return;

    // Bloquear remoção se for o último exame
    if (paciente.exames.length === 1) {
      alert('⚠️ O paciente precisa ter pelo menos 1 exame.');
      return;
    }

    const exame = paciente.exames[exameIndex];

    if (!confirm(`Deseja remover o exame "${exame.desC_EXAME}" deste paciente?`)) {
      return;
    }

    // Chamar a API para remover o exame do backend
    this.pacienteService.removerExameDoPaciente(paciente.cpf, exame.iD_EXAME).subscribe({
      next: () => {
        // Remove localmente após sucesso no backend
        paciente.exames!.splice(exameIndex, 1);

        // Atualiza também em todosPacientes
        const indexTodos = this.todosPacientes.findIndex((p) => p.id === paciente.id);
        if (indexTodos > -1 && this.todosPacientes[indexTodos].exames) {
          this.todosPacientes[indexTodos].exames = [...paciente.exames!];
        }
      },
      error: (err: any) => {
        console.error('Erro ao remover exame:', err);
        alert('Erro ao remover exame. Tente novamente.');
      },
    });
  }

  /**
   * Retorna todos os pacientes que correspondem ao filtro de busca (ou todos se não houver busca)
   */
  get pacientesBase(): PacienteUI[] {
    if (this.termoBusca.trim()) {
      const termo = this.termoBusca.toLowerCase();
      return this.todosPacientes.filter(
        (p) => p.nome.toLowerCase().includes(termo) || p.cpf.includes(termo)
      );
    }
    return this.todosPacientes;
  }

  /**
   * Calcula o total de páginas baseado nos pacientes filtrados
   */
  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.pacientesBase.length / this.itensPorPagina));
  }

  /**
   * Retorna os pacientes da página atual (aplicando filtro se houver)
   */
  get pacientesFiltrados(): PacienteUI[] {
    const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
    const fim = inicio + this.itensPorPagina;
    return this.pacientesBase.slice(inicio, fim);
  }

  get estatisticas() {
    const total = this.todosPacientes.length;
    const enviados = this.todosPacientes.filter((p) => p.status === 'enviado').length;
    const pendentes = this.todosPacientes.filter((p) => p.status === 'pendente').length;
    const erros = this.todosPacientes.filter((p) => p.status === 'erro').length;

    return { total, enviados, pendentes, erros };
  }

  transferirTodos(): void {}

  // ==================== MÉTODOS DE BUSCA ====================

  /**
   * Chamado quando o termo de busca muda - reseta para página 1
   */
  onBuscaChange(): void {
    this.paginaAtual = 1;
    this.atualizarPaginasVisiveis();
  }

  // ==================== MÉTODOS DE PAGINAÇÃO ====================

  irParaPagina(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaAtual = pagina;
      this.atualizarPaginasVisiveis();
      this.atualizarPacientesDaPagina();
    }
  }

  proximaPagina(): void {
    if (this.paginaAtual < this.totalPaginas) {
      this.irParaPagina(this.paginaAtual + 1);
    }
  }

  paginaAnterior(): void {
    if (this.paginaAtual > 1) {
      this.irParaPagina(this.paginaAtual - 1);
    }
  }

  private atualizarPaginasVisiveis(): void {
    const paginas: number[] = [];
    const total = this.totalPaginas;
    const atual = this.paginaAtual;

    // Sempre mostra no máximo 5 páginas centradas na atual
    let inicio = Math.max(1, atual - 2);
    let fim = Math.min(total, atual + 2);

    // Ajusta para sempre mostrar 5 páginas se possível
    if (fim - inicio < 4) {
      if (inicio === 1) {
        fim = Math.min(total, inicio + 4);
      } else if (fim === total) {
        inicio = Math.max(1, fim - 4);
      }
    }

    for (let i = inicio; i <= fim; i++) {
      paginas.push(i);
    }

    this.paginasVisiveis = paginas;
  }

  // ==================== MÉTODOS DE SELEÇÃO ====================

  togglePacienteSelecionado(pacienteId: number): void {
    // Verifica se o paciente já foi enviado (não pode ser selecionado)
    const paciente = this.todosPacientes.find(p => p.id === pacienteId);
    if (paciente?.status === 'enviado') {
      return; // Não permite selecionar pacientes já enviados
    }

    if (this.pacientesSelecionados.has(pacienteId)) {
      this.pacientesSelecionados.delete(pacienteId);
    } else {
      this.pacientesSelecionados.add(pacienteId);
    }
  }

  isPacienteSelecionado(pacienteId: number): boolean {
    return this.pacientesSelecionados.has(pacienteId);
  }

  selecionarTodosPacientes(): void {
    // Seleciona apenas os pacientes que estão visíveis e NÃO foram enviados
    this.pacientesBase.forEach((paciente) => {
      if (paciente.status !== 'enviado') {
        this.pacientesSelecionados.add(paciente.id);
      }
    });
  }

  deselecionarTodosPacientes(): void {
    // Deseleciona apenas os pacientes que estão visíveis (respeitando o filtro)
    this.pacientesBase.forEach((paciente) => {
      this.pacientesSelecionados.delete(paciente.id);
    });
  }

  toggleTodosPacientes(): void {
    if (this.todosSelecionados) {
      this.deselecionarTodosPacientes();
    } else {
      this.selecionarTodosPacientes();
    }
  }

  get quantidadeSelecionados(): number {
    return this.pacientesSelecionados.size;
  }

  get todosSelecionados(): boolean {
    // Verifica se todos os pacientes SELECIONÁVEIS (não enviados) do filtro atual estão selecionados
    const pacientesSelecionaveis = this.pacientesBase.filter(p => p.status !== 'enviado');
    return (
      pacientesSelecionaveis.length > 0 &&
      pacientesSelecionaveis.every((p) => this.pacientesSelecionados.has(p.id))
    );
  }

  // ==================== MÉTODOS DE EDIÇÃO DE EXAMES ====================

  editarExamesPaciente(paciente: PacienteUI): void {
    this.pacienteEditandoExames = { ...paciente };
    this.examesEditandoTemp = paciente.exames ? [...paciente.exames] : [];
    this.buscaExame = '';
    this.examesEncontrados = [];
  }

  buscarExamesNoBackend(): void {
    // Limpar timeout anterior
    if (this.timeoutBusca) {
      clearTimeout(this.timeoutBusca);
    }

    const termo = this.buscaExame.trim();

    // Se não tiver busca, limpar resultados
    if (!termo) {
      this.examesEncontrados = [];
      this.carregandoExames = false;
      return;
    }

    // Aguardar 500ms após o usuário parar de digitar
    this.timeoutBusca = setTimeout(() => {
      this.carregandoExames = true;

      // Usar o mesmo parâmetro 'filtro' que o perfil-exame usa
      const params = new HttpParams()
        .set('pagina', '1')
        .set('tamanhoPagina', '10')
        .set('filtro', termo);

      this.http.get<any>(`${environment.apiUrl}/exames`, { params }).subscribe({
        next: (response) => {
          this.examesEncontrados = response.dados || response || [];
          this.carregandoExames = false;
        },
        error: (erro) => {
          console.error('Erro ao buscar exames:', erro);
          this.examesEncontrados = [];
          this.carregandoExames = false;
        },
      });
    }, 500); // Debounce de 500ms
  }

  get examesFiltrados(): any[] {
    return this.examesEncontrados;
  }

  exameJaAdicionado(idExame: number): boolean {
    return this.examesEditandoTemp.some((e) => e.iD_EXAME === idExame);
  }

  adicionarExameTemp(exame: any): void {
    const novoExame: ExameDetalhado = {
      iD_EXAME: exame.iD_EXAME || exame.ID_EXAME,
      desC_EXAME: exame.dS_EXAME || exame.DS_EXAME,
      cD_EXAME_DB: exame.cD_EXAME_DB || exame.CD_EXAME_DB || '',
      sigla: exame.sigla || exame.SIGLA || '',
      material: exame.material || exame.MATERIAL || 'Soro',
    };
    this.examesEditandoTemp.push(novoExame);
  }

  removerExameTemp(index: number): void {
    // Bloquear remoção se for o último exame
    if (this.examesEditandoTemp.length === 1) {
      alert('⚠️ O paciente precisa ter pelo menos 1 exame.');
      return;
    }
    this.examesEditandoTemp.splice(index, 1);
  }

  cancelarEdicaoExames(): void {
    this.pacienteEditandoExames = null;
    this.examesEditandoTemp = [];
    this.examesEncontrados = [];
    this.buscaExame = '';
    if (this.timeoutBusca) {
      clearTimeout(this.timeoutBusca);
    }
  }

  getUnidade(): number | null {
      const raw = localStorage.getItem('unidadeSelecionada');
      if (raw) {
        const u = JSON.parse(raw);
        const id = (u && (u.idUnidade ?? u.IdUnidade ?? u.iD_UNIDADE ?? u.ID_UNIDADE)) ?? null;
        return id
      } else {
        return null
      }
  }

  salvarExamesPaciente(): void {
    if (!this.pacienteEditandoExames) return;

    const cpf = this.pacienteEditandoExames.cpf;
    const examesOriginais = this.pacienteEditandoExames.exames || [];
    const examesNovos = this.examesEditandoTemp;

    // Verificar se está tentando ficar sem nenhum exame
    if (examesNovos.length === 0) {
      alert('⚠️ O paciente precisa ter pelo menos 1 exame.');
      return;
    }

    this.salvandoExames = true;

    // Identificar exames removidos (estavam no original mas não estão no novo)
    const examesRemovidos = examesOriginais.filter(
      (original) => !examesNovos.some((novo) => novo.iD_EXAME === original.iD_EXAME)
    );

    // Identificar exames adicionados (estão no novo mas não no original)
    const examesAdicionados = examesNovos.filter(
      (novo) => !examesOriginais.some((original) => original.iD_EXAME === novo.iD_EXAME)
    );

    // Se não há operações, apenas atualiza localmente
    if (examesRemovidos.length === 0 && examesAdicionados.length === 0) {
      this.finalizarSalvarExames();
      return;
    }

    // Função para processar as operações em série
    const processarOperacoes = async () => {
      try {
        // PRIMEIRO: adicionar exames UM POR VEZ (para garantir que sempre tenha exame)
        for (const exame of examesAdicionados) {
          await this.pacienteService
            .adicionarExameAoPaciente(
              cpf,
              exame.iD_EXAME,
              exame.cD_EXAME_DB || '',
              exame.desC_EXAME || ''
            )
            .toPromise();
        }

        // DEPOIS: remover exames (pode ser em paralelo)
        if (examesRemovidos.length > 0) {
          const remocoes = examesRemovidos.map((exame) =>
            this.pacienteService.removerExameDoPaciente(cpf, exame.iD_EXAME).toPromise()
          );
          await Promise.all(remocoes);
        }

        this.finalizarSalvarExames();
      } catch (erro) {
        console.error('Erro ao salvar exames:', erro);
        alert('❌ Erro ao salvar algumas alterações. Verifique e tente novamente.');
        this.salvandoExames = false;
      }
    };

    processarOperacoes();
  }

  private finalizarSalvarExames(): void {
    // Atualizar os exames do paciente na lista principal
    const index = this.todosPacientes.findIndex(
      (p) => p.id === this.pacienteEditandoExames!.id
    );
    if (index > -1) {
      this.todosPacientes[index].exames = [...this.examesEditandoTemp];
    }

    this.salvandoExames = false;
    alert('✅ Exames atualizados com sucesso!');
    this.cancelarEdicaoExames();
  }
}
