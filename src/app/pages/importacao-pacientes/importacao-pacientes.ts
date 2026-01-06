import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
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
  cD_EXAME?: string; // Código principal do exame (ex: CRE, HIV)
  cD_EXAME_DB?: string; // Código interno do banco
  iD_GRUPO_EXAME?: number | null;
  sigla?: string;
  material?: string;
}

interface PacienteUI {
  id: number;
  idAgendamento?: number; // ID do agendamento específico deste registro
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
  nomePerfil?: string; // Nome do perfil de exames
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

  // Filtros avançados
  filtroStatus: 'todos' | 'enviados' | 'pendentes' = 'todos';
  filtroTipoData: 'cadastro' | 'coleta' = 'cadastro';
  filtroDataInicio: string = '';
  filtroDataFim: string = '';
  mostrarFiltrosAvancados = false;

  perfisExames: PerfilExameUI[] = [];
  unidades: Unidade[] = [];
  // Se definido, mostrará apenas pacientes relacionados a essa unidade (definido pela unidade do usuário)
  mostrarApenasUnidadeId: number | null = null;
  pacientes: PacienteUI[] = [];
  todosPacientes: PacienteUI[] = []; // Todos os pacientes sem paginação
  pacientesSelecionados: Set<string> = new Set(); // Chaves compostas "idAgendamento-cpf" dos pacientes selecionados

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

  // Observable destroy for subscriptions
  private destroy$ = new Subject<void>();
  salvandoEdicao = false;

  // Edição de Exames
  pacienteEditandoExames: PacienteUI | null = null;
  examesEditandoTemp: ExameDetalhado[] = [];
  examesEncontrados: any[] = [];
  buscaExame = ''; // mantido para compatibilidade
  buscaExameCodigo = '';
  buscaExameNome = '';
  carregandoExames = false;
  salvandoExames = false;
  timeoutBusca: any = null;
  
  // Paginação de exames no modal (scroll infinito)
  paginaExames = 1;
  tamanhoPaginaExames = 20;
  totalExamesDisponiveis = 0;
  carregandoMaisExames = false;

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

    // ❌ REMOVIDO: Subscribe que recarregava tudo e fechava áreas expandidas
    // this.pacienteService.pacienteExamesAtualizados$.pipe(takeUntil(this.destroy$)).subscribe(...)

    // Listener para fechar menu ao clicar fora
    document.addEventListener('click', this.fecharMenusAbertos.bind(this));
  }

  ngOnDestroy(): void {
    // Remove o listener ao destruir o componente
    document.removeEventListener('click', this.fecharMenusAbertos.bind(this));

    // Completa o subject para cancelar subscriptions
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fecharMenusAbertos(): void {
    // Fecha menus de TODOS os pacientes, não apenas os da página atual
    this.todosPacientes.forEach((p) => (p.menuAberto = false));
  }

  /**
   * Carrega as unidades disponíveis
   */
  carregarUnidades(): void {
    console.log('🔄 [carregarUnidades] Iniciando busca de unidades...');
    this.unidadeService.buscarUnidades().subscribe({
      next: (unidades: Unidade[]) => {
        this.unidades = unidades;
        console.log('✅ [carregarUnidades] Unidades carregadas:', unidades.length);
      },
      error: (erro: any) => {
        this.unidades = [];
        console.error('❌ [carregarUnidades] Erro ao carregar unidades:', {
          status: erro?.status,
          statusText: erro?.statusText,
          message: erro?.message,
          error: erro?.error,
          url: erro?.url
        });
        if (erro?.status === 502) {
          console.error('🚨 ERRO 502: O servidor backend não está respondendo corretamente');
          console.error('   - Verifique se a API .NET está rodando');
          console.error('   - Verifique os logs do backend');
          console.error('   - Verifique a configuração do proxy/nginx');
        }
      },
    });
  }

  /**
   * Carrega pacientes usando o método legado (3 chamadas: pacientes, agendamentos, detalhes)
   * Este método usa endpoints que não requerem autenticação extra
   */
  carregarPacientesComAgendamentos(): void {
    // Usar diretamente o método legado que funciona
    this.carregarPacientesLegado();
  }

  /**
   * Processa os dados vindos da VIEW e agrupa por paciente
   * @deprecated Mantido para uso futuro quando VIEW estiver funcionando
   */
  private processarDadosDaView(dados: any[]): void {
    // Agrupar por CPF do paciente
    const pacientesPorCpf = new Map<string, any[]>();
    
    dados.forEach((registro: any) => {
      const cpf = registro.cpF_PACIENTE || registro.CPF_PACIENTE || '';
      if (!cpf) return;
      
      if (!pacientesPorCpf.has(cpf)) {
        pacientesPorCpf.set(cpf, []);
      }
      pacientesPorCpf.get(cpf)!.push(registro);
    });


    // Transformar em PacienteUI[]
    const pacientesUI: PacienteUI[] = [];
    let idContador = 1; // Contador para garantir IDs únicos
    
    pacientesPorCpf.forEach((registros, cpf) => {
      const primeiro = registros[0];
      
      // Mapear todos os exames do paciente
      const examesDetalhados: ExameDetalhado[] = registros.map((reg: any) => ({
        iD_EXAME: reg.iD_EXAME || reg.ID_EXAME,
        desC_EXAME: reg.desC_EXAME || reg.DESC_EXAME || reg.dS_EXAME || reg.DS_EXAME || `Exame ${reg.iD_EXAME}`,
        cD_EXAME_DB: reg.cD_EXAME_DB || reg.CD_EXAME_DB || reg.cD_EXAME || reg.CD_EXAME || '',
        iD_GRUPO_EXAME: reg.iD_GRUPO_EXAME || reg.ID_GRUPO_EXAME || null,
        sigla: reg.sigla || reg.SIGLA || '',
        material: reg.material || reg.MATERIAL || 'Soro',
      })).filter((ex: ExameDetalhado, index: number, self: ExameDetalhado[]) => 
        // Remove duplicados por ID_EXAME
        index === self.findIndex(e => e.iD_EXAME === ex.iD_EXAME)
      );

      // Verificar se todos exames foram enviados
      const todosEnviados = registros.every((reg: any) => {
        const enviado = reg.inD_REG_ENVIADO ?? reg.IND_REG_ENVIADO ?? false;
        return enviado === true || enviado === 1;
      });

      // Normalizar diabetes
      let diabetesBoolean = false;
      const diabetesValue = primeiro.diabetes || primeiro.DIABETES;
      if (typeof diabetesValue === 'boolean') {
        diabetesBoolean = diabetesValue;
      } else if (typeof diabetesValue === 'string') {
        diabetesBoolean = ['sim', 's', 'true', '1', 'yes', 'y'].includes(diabetesValue.toLowerCase().trim());
      } else if (typeof diabetesValue === 'number') {
        diabetesBoolean = diabetesValue === 1;
      }

      // Data do agendamento
      const dataAgendamento = (
        primeiro.datA_AGENDAMENTO || 
        primeiro.DATA_AGENDAMENTO || 
        primeiro.dataAgendamento ||
        ''
      ).split('T')[0];

      // Data de cadastro do agendamento (criação)
      const dataCadastroRawView =
        primeiro.datA_CADASTRO_AGENDAMENTO ||
        primeiro.DATA_CADASTRO_AGENDAMENTO ||
        primeiro.datA_CADASTRO ||
        primeiro.DATA_CADASTRO ||
        primeiro.dataCadastroAgendamento ||
        primeiro.data_cadastro_agendamento ||
        '';
      const dataCadastroView = dataCadastroRawView ? dataCadastroRawView.split('T')[0] : '';

      // Extrair tratamento dos dados do paciente - debug dos campos disponíveis
      console.log('🔍 Campos disponíveis para tratamento na view:', {
        TIPO_TRATAMENTO: primeiro.TIPO_TRATAMENTO,
        tipO_TRATAMENTO: primeiro.tipO_TRATAMENTO,
        tipoTratamento: primeiro.tipoTratamento,
        TRATAMENTO: primeiro.TRATAMENTO,
        tratamento: primeiro.tratamento,
        'tipo tratamento': primeiro['tipo tratamento'],
        'Tipo Tratamento': primeiro['Tipo Tratamento'],
        'TIPO TRATAMENTO': primeiro['TIPO TRATAMENTO'],
        allKeys: Object.keys(primeiro).filter(key => key.toLowerCase().includes('tratamento'))
      });

      // Extrair tratamento dos dados do paciente
      const tratamento = 
        primeiro.TIPO_TRATAMENTO ||
        primeiro.tipO_TRATAMENTO ||
        primeiro.tipoTratamento ||
        primeiro.TRATAMENTO ||
        primeiro.tratamento ||
        primeiro['tipo tratamento'] ||
        primeiro['Tipo Tratamento'] ||
        primeiro['TIPO TRATAMENTO'] ||
        primeiro['Tipo de Tratamento'] ||
        primeiro['TIPO DE TRATAMENTO'] ||
        primeiro['tipo_tratamento'] ||
        '';

      // Obter nome do perfil baseado no ID_GRUPO_EXAME do primeiro exame
      const idGrupoPerfil = examesDetalhados[0]?.iD_GRUPO_EXAME;
      const nomePerfil = idGrupoPerfil 
        ? (this.perfisExames.find(p => p.iD_GRUPO_EXAME === idGrupoPerfil)?.desC_GRUPO_EXAME || 
           primeiro.desC_GRUPO_EXAME || primeiro.DESC_GRUPO_EXAME || '')
        : (primeiro.desC_GRUPO_EXAME || primeiro.DESC_GRUPO_EXAME || '');

      pacientesUI.push({
        id: primeiro.iD_AGENDAMENTO || primeiro.ID_AGENDAMENTO || primeiro.iD_PACIENTE || primeiro.ID_PACIENTE || idContador++,
        data: dataCadastroView || dataAgendamento,
        nome: primeiro.nomE_PACIENTE || primeiro.NOME_PACIENTE || '',
        cpf: cpf,
        diabetes: diabetesBoolean,
        tratamento: tratamento, // Extraído dos dados do backend
        horarioColeta: dataAgendamento,
        status: todosEnviados ? 'enviado' : 'correto',
        expandido: false,
        exames: examesDetalhados,
        podeEditar: !todosEnviados,
        nomePerfil: nomePerfil,
      });
    });

    // Ordenar por nome do paciente (alfabético A→Z, case-insensitive)
    pacientesUI.sort((a, b) => {
      const na = a.nome || '';
      const nb = b.nome || '';
      return na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
    });

    this.todosPacientes = pacientesUI;
    this.pacientes = this.todosPacientes.slice(0, this.itensPorPagina);
    
    // Debug: mostrar todos os CPFs carregados (processarDadosDaView)
    console.log('📋 [processarDadosDaView] CPFs carregados:', this.todosPacientes.map(p => ({ cpf: p.cpf, nome: p.nome, status: p.status })));
    
    this.pacientesSelecionados.clear();
    this.paginaAtual = 1;
    this.atualizarPaginasVisiveis();
    this.atualizarPacientesDaPagina();

    console.log('✅ Pacientes processados:', this.todosPacientes.length);
  }

  /**
   * Carrega pacientes usando o endpoint /api/agenda-detalhe que já traz tudo consolidado
   * (paciente, agendamento, exames em uma única query JOIN)
   */
  carregarPacientesLegado(): void {
    this.carregando = true;
    const timestamp = new Date().toISOString();
    console.log(`🔄 [${timestamp}] [carregarPacientesLegado] Iniciando...`);
    console.log('📍 [carregarPacientesLegado] idUnidade:', this.mostrarApenasUnidadeId);

    // O endpoint /api/agenda-detalhe já traz tudo junto (paciente + agendamento + exames)
    this.pacienteService.buscarAgendaDetalhes(this.mostrarApenasUnidadeId).subscribe({
      next: (response: any) => {
        const detalhes = response?.dados || response || [];
        console.log('✅ [carregarPacientesLegado] Detalhes retornados:', detalhes.length);
        
        if (detalhes.length > 0) {
          console.log('📋 [carregarPacientesLegado] Exemplo de registro:', JSON.stringify(detalhes[0], null, 2));
        }
        
        this.processarDetalhesConsolidados(detalhes);
        this.carregando = false;
        console.log(`✅ [${new Date().toISOString()}] [carregarPacientesLegado] Concluído com sucesso`);
      },
      error: (erro: any) => {
        this.carregando = false;
        this.pacientes = [];
        this.todosPacientes = [];
        console.error(`❌ [${new Date().toISOString()}] [carregarPacientesLegado] Erro:`, {
          status: erro?.status,
          statusText: erro?.statusText,
          message: erro?.message,
          error: erro?.error,
          url: erro?.url,
          headers: erro?.headers
        });
        
        if (erro?.status === 502) {
          console.error('🚨 ERRO 502 (Bad Gateway): Problemas na comunicação com o servidor');
          console.error('   📌 Possíveis causas:');
          console.error('      1. API .NET não está rodando ou crashou');
          console.error('      2. Timeout na comunicação (requisição muito lenta)');
          console.error('      3. Erro não tratado na API que causou falha');
          console.error('      4. Problemas de configuração de proxy/nginx/IIS');
          console.error('   🔧 Ações recomendadas:');
          console.error('      1. Verifique se o backend está rodando (F:\\Projetos_Vlt\\Prod\\DiaverumApi)');
          console.error('      2. Verifique os logs do servidor .NET');
          console.error('      3. Teste o endpoint diretamente: ' + erro?.url);
          alert('❌ Erro 502: O servidor não está respondendo.\n\nO backend pode estar offline ou com problemas.\n\nVerifique o console (F12) para mais detalhes.');
        } else if (erro?.status === 403) {
          alert('Você não tem permissão para ver os pacientes desta unidade.');
        } else if (erro?.status === 0) {
          console.error('🚨 ERRO 0: Falha na conexão de rede');
          console.error('   - O backend pode não estar acessível');
          console.error('   - Verifique se a API está rodando');
          console.error('   - Verifique configurações de CORS');
          alert('❌ Erro de conexão: Não foi possível conectar ao servidor.\n\nVerifique se o backend está rodando.');
        } else {
          alert(`❌ Erro ${erro?.status || 'desconhecido'}: ${erro?.message || 'Erro ao carregar dados'}.\n\nVerifique o console (F12) para mais detalhes.`);
        }
      }
    });
  }

  /**
   * Processa os detalhes consolidados do endpoint /api/agenda-detalhe
   * Agrupa por (ID_AGENDAMENTO + CPF) e monta a estrutura PacienteUI
   * IMPORTANTE: Cada agendamento aparece como linha separada, mesmo para o mesmo paciente
   */
  private processarDetalhesConsolidados(detalhes: any[]): void {
    // Agrupar por ID_AGENDAMENTO + CPF (chave composta)
    const pacientesPorAgendamentoCpf = new Map<string, any[]>();
    
    detalhes.forEach((registro: any) => {
      const cpf = registro.cpF_PACIENTE || registro.CPF_PACIENTE || '';
      const idAgendamento = registro.iD_AGENDAMENTO || registro.ID_AGENDAMENTO;
      
      if (!cpf || !idAgendamento) return;
      
      // Chave composta: "idAgendamento-cpf"
      const chave = `${idAgendamento}-${cpf}`;
      
      if (!pacientesPorAgendamentoCpf.has(chave)) {
        pacientesPorAgendamentoCpf.set(chave, []);
      }
      pacientesPorAgendamentoCpf.get(chave)!.push(registro);
    });

    // Transformar em PacienteUI[]
    const pacientesUI: PacienteUI[] = [];
    let idContador = 1; // Contador para garantir IDs únicos
    
    pacientesPorAgendamentoCpf.forEach((registros, chave) => {
      const primeiro = registros[0];
      
      // Extrair idAgendamento e CPF da chave composta
      const [idAgendamentoStr, cpf] = chave.split('-');
      const idAgendamento = Number(idAgendamentoStr);
      
      // Mapear todos os exames do paciente (sem duplicatas)
      const examesDetalhados: ExameDetalhado[] = [];
      registros.forEach((reg: any) => {
        const idExame = reg.iD_EXAME || reg.ID_EXAME;
        if (!idExame) return;
        
        // Verificar se já foi adicionado
        if (examesDetalhados.some(e => e.iD_EXAME === idExame)) return;
        
        examesDetalhados.push({
          iD_EXAME: idExame,
          desC_EXAME: reg.desC_EXAME || reg.DESC_EXAME || reg.dS_EXAME || reg.DS_EXAME || '',
          cD_EXAME: reg.cD_EXAME || reg.CD_EXAME || '', // Código principal (ex: CRE, HIV)
          cD_EXAME_DB: reg.cD_EXAME_DB || reg.CD_EXAME_DB || '', // Código interno do banco
          iD_GRUPO_EXAME: reg.iD_GRUPO_EXAME || reg.ID_GRUPO_EXAME || null,
          sigla: reg.sigla || reg.SIGLA || '',
          material: reg.material || reg.MATERIAL || 'Soro',
        });
      });

      // Verificar se todos exames foram enviados
      const todosEnviados = registros.every((reg: any) => {
        const enviado = reg.inD_REG_ENVIADO ?? reg.IND_REG_ENVIADO ?? false;
        return enviado === true || enviado === 1;
      });

      // Normalizar diabetes
      let diabetesBoolean = false;
      const diabetesValue = primeiro.diabetes || primeiro.DIABETES;
      if (typeof diabetesValue === 'boolean') {
        diabetesBoolean = diabetesValue;
      } else if (typeof diabetesValue === 'string') {
        diabetesBoolean = ['sim', 's', 'true', '1', 'yes', 'y'].includes(diabetesValue.toLowerCase().trim());
      } else if (typeof diabetesValue === 'number') {
        diabetesBoolean = diabetesValue === 1;
      }

      // Data do agendamento (já vem no JOIN)
      const dataAgendamentoRaw = primeiro.datA_AGENDAMENTO || primeiro.DATA_AGENDAMENTO || primeiro.dataAgendamento || '';
      const dataAgendamento = dataAgendamentoRaw ? dataAgendamentoRaw.split('T')[0] : '';

      // Data de cadastro do agendamento (criação) - preferir esta para o campo `data`
      const dataCadastroRaw =
        primeiro.datA_CADASTRO_AGENDAMENTO ||
        primeiro.DATA_CADASTRO_AGENDAMENTO ||
        primeiro.datA_CADASTRO ||
        primeiro.DATA_CADASTRO ||
        primeiro.dataCadastroAgendamento ||
        primeiro.data_cadastro_agendamento ||
        '';
      const dataCadastro = dataCadastroRaw ? dataCadastroRaw.split('T')[0] : '';

      // Extrair tratamento dos dados do paciente - debug dos campos disponíveis
      console.log('🔍 Campos disponíveis para tratamento no primeiro registro:', {
        TIPO_TRATAMENTO: primeiro.TIPO_TRATAMENTO,
        tipO_TRATAMENTO: primeiro.tipO_TRATAMENTO,
        tipoTratamento: primeiro.tipoTratamento,
        TRATAMENTO: primeiro.TRATAMENTO,
        tratamento: primeiro.tratamento,
        'tipo tratamento': primeiro['tipo tratamento'],
        'Tipo Tratamento': primeiro['Tipo Tratamento'],
        'TIPO TRATAMENTO': primeiro['TIPO TRATAMENTO'],
        allKeys: Object.keys(primeiro).filter(key => key.toLowerCase().includes('tratamento'))
      });

      const tratamento = 
        primeiro.TIPO_TRATAMENTO ||
        primeiro.tipO_TRATAMENTO ||
        primeiro.tipoTratamento ||
        primeiro.TRATAMENTO ||
        primeiro.tratamento ||
        primeiro['tipo tratamento'] ||
        primeiro['Tipo Tratamento'] ||
        primeiro['TIPO TRATAMENTO'] ||
        primeiro['Tipo de Tratamento'] ||
        primeiro['TIPO DE TRATAMENTO'] ||
        primeiro['tipo_tratamento'] ||
        '';

      // Obter nome do perfil baseado no ID_GRUPO_EXAME do primeiro exame
      const idGrupoPerfil = examesDetalhados[0]?.iD_GRUPO_EXAME;
      const nomePerfil = idGrupoPerfil 
        ? (this.perfisExames.find(p => p.iD_GRUPO_EXAME === idGrupoPerfil)?.desC_GRUPO_EXAME || 
           primeiro.desC_GRUPO_EXAME || primeiro.DESC_GRUPO_EXAME || '')
        : (primeiro.desC_GRUPO_EXAME || primeiro.DESC_GRUPO_EXAME || '');

      pacientesUI.push({
        id: idContador++, // ✅ ID único sequencial para cada linha (independente de agendamento/cpf)
        idAgendamento: idAgendamento, // ID do agendamento para operações com chave composta
        data: dataCadastro || dataAgendamento,
        nome: primeiro.nomE_PACIENTE || primeiro.NOME_PACIENTE || '',
        cpf: cpf,
        diabetes: diabetesBoolean,
        tratamento: tratamento,
        horarioColeta: dataAgendamento,
        status: todosEnviados ? 'enviado' : 'correto',
        expandido: false,
        exames: examesDetalhados,
        podeEditar: !todosEnviados,
        nomePerfil: nomePerfil,
      });
    });

    // Ordenar por nome do paciente (alfabético A→Z, case-insensitive)
    pacientesUI.sort((a, b) => {
      const na = a.nome || '';
      const nb = b.nome || '';
      return na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
    });

    this.todosPacientes = pacientesUI;
    this.pacientes = this.todosPacientes.slice(0, this.itensPorPagina);
    
    // Debug: mostrar todos os agendamentos carregados (processarDetalhesConsolidados)
    console.log('📋 [processarDetalhesConsolidados] Agendamentos carregados:', this.todosPacientes.map(p => ({ 
      idAgendamento: p.idAgendamento, 
      cpf: p.cpf, 
      nome: p.nome, 
      status: p.status 
    })));
    
    this.pacientesSelecionados.clear();
    this.paginaAtual = 1;
    this.atualizarPaginasVisiveis();
    this.atualizarPacientesDaPagina();

    console.log('✅ Pacientes processados:', this.todosPacientes.length, 'com total de exames:', 
      this.todosPacientes.reduce((acc, p) => acc + (p.exames?.length || 0), 0));
  }

  /**
   * Busca exames específicos pelo ID (usando endpoint direto /exames/{id})
   * @deprecated Não mais necessário - dados já vêm do JOIN
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
            '';

          // Código principal do exame (ex: CRE, HIV) - agora vem da TBL_AGENDA_DETALHE
          const cdExame =
            ex.cD_EXAME ||
            ex.CD_EXAME ||
            ex.cdExame ||
            exameCatalogo?.cD_EXAME ||
            exameCatalogo?.CD_EXAME ||
            '';

          // Capturar ID_GRUPO_EXAME da TBL_AGENDA_DETALHE
          const idGrupoExame = ex.iD_GRUPO_EXAME || ex.ID_GRUPO_EXAME || ex.idGrupoExame || null;

          const novoExame = {
            iD_EXAME: idExame,
            desC_EXAME: descExame,
            cD_EXAME: cdExame, // Código principal (ex: CRE)
            cD_EXAME_DB: cdExameDB, // Código interno do banco
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

          // Preferir data de cadastro (criação) quando disponível
          const dataCadastroRaw =
            agendamentoEncontrado.datA_CADASTRO_AGENDAMENTO ||
            agendamentoEncontrado.DATA_CADASTRO_AGENDAMENTO ||
            agendamentoEncontrado.datA_CADASTRO ||
            agendamentoEncontrado.DATA_CADASTRO ||
            agendamentoEncontrado.dataCadastroAgendamento ||
            agendamentoEncontrado.data_cadastro_agendamento ||
            '';
          var dataCadastroAg = dataCadastroRaw ? dataCadastroRaw.split('T')[0] : '';
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

        const dataCadastroRaw =
          primeiroAgendamento.datA_CADASTRO_AGENDAMENTO ||
          primeiroAgendamento.DATA_CADASTRO_AGENDAMENTO ||
          primeiroAgendamento.datA_CADASTRO ||
          primeiroAgendamento.DATA_CADASTRO ||
          primeiroAgendamento.dataCadastroAgendamento ||
          primeiroAgendamento.data_cadastro_agendamento ||
          '';
        var dataCadastroAg = dataCadastroRaw ? dataCadastroRaw.split('T')[0] : '';
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
        data: dataCadastroAg || dataAgendamento,
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

    // Ordenar por nome do paciente (alfabético A→Z, case-insensitive) antes de armazenar
    const ordenadoPorNome = Array.isArray(pacientesFiltradosPorUnidade)
      ? [...pacientesFiltradosPorUnidade].sort((a, b) => {
          const na = a.nome || '';
          const nb = b.nome || '';
          return na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
        })
      : [];

    this.todosPacientes = ordenadoPorNome;

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
    
    console.log('📄 [ATUALIZAR PÁGINA] Atualizando lista paginada:', {
      paginaAtual: this.paginaAtual,
      itensPorPagina: this.itensPorPagina,
      inicio,
      fim,
      totalPacientes: this.todosPacientes.length
    });
    
    this.pacientes = this.todosPacientes.slice(inicio, fim);
    
    console.log('📄 [ATUALIZAR PÁGINA] Lista atualizada. Pacientes na página:', this.pacientes.length);
  }

  /**
   * Carrega os perfis de exames da API
   */
  carregarPerfis(): void {
    this.carregando = true;
    this.gruposExamesService.getPerfis().subscribe({
      next: async (perfis: GrupoExamePerfilExame[]) => {
        try {
          // Determinar unidades do usuário para filtro
          let allowedUnits: number[] | null = null; // null = mostrar todos

          if (this.mostrarApenasUnidadeId != null) {
            if (this.mostrarApenasUnidadeId === 0) {
              // Usuário consolidador: ver todos os perfis
              allowedUnits = null;
            } else {
              allowedUnits = [this.mostrarApenasUnidadeId];
            }
          } else {
            const unidadesRaw = localStorage.getItem('unidadesUsuario');
            if (unidadesRaw) {
              try {
                const arr = JSON.parse(unidadesRaw) as any[];
                const ids = arr
                  .map((u) => u.IdUnidade ?? u.idUnidade ?? u.iD_UNIDADE ?? u.ID_UNIDADE ?? u.id)
                  .filter((x) => x != null)
                  .map(Number);
                if (ids.length > 0) {
                  // Se o usuário tiver a unidade 0 entre as unidades, ele é consolidador -> mostrar todos
                  if (ids.includes(0)) {
                    allowedUnits = null;
                  } else {
                    allowedUnits = ids;
                  }
                } else {
                  allowedUnits = null;
                }
              } catch (e) {
                allowedUnits = null;
              }
            } else {
              allowedUnits = null;
            }
          }

          const mapped = perfis.map((p) => ({
            id: p.iD_GRUPO_EXAME,
            nome: p.desC_GRUPO_EXAME,
            qtdExames: 0,
            iD_GRUPO_EXAME: p.iD_GRUPO_EXAME,
            desC_GRUPO_EXAME: p.desC_GRUPO_EXAME,
          }));

          if (allowedUnits === null) {
            // Sem filtro: carregar todos os perfis
            this.perfisExames = mapped;
          } else {
            // Filtrar perfis por associação em UnidadeGrupoMestre
            const checks = await Promise.all(
              mapped.map(async (perfil) => {
                try {
                  const res = await this.http
                    .get<any>(`${environment.apiUrl}/unidade-grupo-mestre?idGrupo=${perfil.id}`)
                    .toPromise();
                  const unidadesAssoc = (res.dados || [])
                    .map((u: any) => u.iD_UNIDADE || u.ID_UNIDADE)
                    .filter((x: any) => x != null)
                    .map(Number);
                  const has = unidadesAssoc.some((u: number) => allowedUnits!.includes(u));
                  return has ? perfil : null;
                } catch (e) {
                  return null;
                }
              })
            );

            this.perfisExames = checks.filter((p): p is PerfilExameUI => p !== null);
          }

          // Carregar quantidade de exames para cada perfil visível
          this.perfisExames.forEach((perfil) => {
            this.carregarQtdExames(perfil);
          });
        } catch (e) {
          // Ignora erros neste fluxo
        } finally {
          this.carregando = false;
        }
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
      
      // Resetar o input para permitir selecionar o mesmo arquivo novamente
      event.target.value = '';
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
    this.mostrarPreview = false;
  }

  abrirTransferencia(): void {
    const pacientes = this.getPacientesSelecionados();

    if (pacientes.length === 0) {
      alert('Nenhum paciente selecionado para transferência.');
      return;
    }

    // Validar que todos os pacientes têm idAgendamento
    const semIdAgendamento = pacientes.filter(p => !p.idAgendamento);
    if (semIdAgendamento.length > 0) {
      console.error('❌ Pacientes sem idAgendamento:', semIdAgendamento);
      alert('Erro: Alguns pacientes não têm ID de agendamento. Recarregue a página e tente novamente.');
      return;
    }

    // Ativar estado de loading
    this.transferindo = true;
    this.progressoTransferencia = { atual: 0, total: pacientes.length };

    // Marcar todos como pendente (amarelo) durante o processamento da transferência
    pacientes.forEach((paciente) => {
      paciente.status = 'pendente';
    });

    // Montar lista de agendamentos com chave composta (idAgendamento + cpf)
    const agendamentos = pacientes.map((p) => ({
      idAgendamento: p.idAgendamento!,
      cpf: p.cpf
    }));

    // Chamar endpoint de transferência REAL (SOAP DBSync)
    console.log('🚀 [abrirTransferencia] Iniciando TRANSFERÊNCIA REAL via DBSync de', agendamentos.length, 'agendamentos');
    console.log('📋 [abrirTransferencia] Agendamentos:', agendamentos);
    
    this.pacienteService.processarPendentesV2(agendamentos).subscribe({
      next: (res: any) => {
        console.log('✅ [abrirTransferencia] Resposta recebida:', res);
        
        // Verificar resposta do backend
        if (res.sucesso) {
          console.log('✅ [abrirTransferencia] Todos marcados como enviados com sucesso');
          
          // Marcar todos como enviado
          pacientes.forEach((paciente) => {
            paciente.status = 'enviado';
            paciente.podeEditar = false;
          });
          
          this.progressoTransferencia.atual = pacientes.length;
          alert(`✅ ${pacientes.length} agendamento(s) marcado(s) como enviado(s) com sucesso!`);
        } else {
          // Resposta indica erro geral
          console.error('❌ [abrirTransferencia] Erro:', res.mensagem || 'Desconhecido');
          pacientes.forEach((paciente) => {
            paciente.status = 'erro';
          });
          alert(`❌ Erro ao marcar agendamentos: ${res.mensagem || 'Erro desconhecido'}`);
        }

        // Desativar loading e limpar seleção
        this.transferindo = false;
        this.progressoTransferencia = { atual: 0, total: 0 };
        this.pacientesSelecionados.clear();
      },
      error: (err: any) => {
        // Marcar todos como erro (vermelho = Erro(s))
        pacientes.forEach((paciente) => {
          paciente.status = 'erro';
        });
        console.error('❌ [abrirTransferencia] Erro na requisição:', {
          status: err?.status,
          statusText: err?.statusText,
          message: err?.message,
          error: err?.error,
          url: err?.url
        });
        
        let mensagemErro = 'Erro ao marcar agendamentos.';
        if (err?.status === 502) {
          mensagemErro = 'Erro 502: O servidor não está respondendo.\nO backend pode estar offline ou com problemas.';
          console.error('🚨 ERRO 502: Verifique se a API está rodando e os logs do servidor');
        } else if (err?.status === 0) {
          mensagemErro = 'Erro de conexão: Não foi possível conectar ao servidor.';
          console.error('🚨 ERRO 0: Falha na conexão de rede');
        } else if (err?.status === 500) {
          mensagemErro = 'Erro 500: Erro interno no servidor.\nVerifique os logs do backend.';
          console.error('🚨 ERRO 500: Erro interno do servidor');
        }
        
        alert(`❌ ${mensagemErro}\n\nVerifique o console (F12) para mais detalhes.`);

        // Desativar loading
        this.transferindo = false;
        this.progressoTransferencia = { atual: 0, total: 0 };
      },
    });
  }

  getPacientesSelecionados() {
    return this.todosPacientes.filter((p) => {
      const chave = `${p.idAgendamento}-${p.cpf}`;
      return this.pacientesSelecionados.has(chave);
    });
  }

  excluirPacientesSelecionados(): void {
    if (this.quantidadeSelecionados === 0) {
      return;
    }

    const qtdAntes = this.quantidadeSelecionados;
    const confirmacao = confirm(
      `Deseja realmente remover os exames de ${qtdAntes} agendamento${qtdAntes > 1 ? 's' : ''} selecionado${
        qtdAntes > 1 ? 's' : ''
      }?\n\nOs agendamentos sem exames não aparecerão mais na listagem.`
    );

    if (confirmacao) {
      // Obter lista de agendamentos selecionados
      const pacientesSelecionados = this.getPacientesSelecionados();
      const agendamentosParaRemover = pacientesSelecionados.map(p => ({
        idAgendamento: p.idAgendamento!,
        cpf: p.cpf
      }));

      // Validar que todos têm idAgendamento
      if (agendamentosParaRemover.some(a => !a.idAgendamento)) {
        alert('Erro: Alguns agendamentos não têm ID. Recarregue a página e tente novamente.');
        return;
      }

      // Ativar estado de carregamento
      this.excluindoEmMassa = true;
      this.progressoExclusao = { atual: 0, total: agendamentosParaRemover.length };

      // Remover agendamentos (soft delete usando chave composta)
      console.log('🔄 [excluirPacientesSelecionados] Iniciando exclusão de', agendamentosParaRemover.length, 'agendamentos');
      console.log('📋 [excluirPacientesSelecionados] Agendamentos:', agendamentosParaRemover);
      
      this.pacienteService.removerPorAgendamentos(agendamentosParaRemover).subscribe({
        next: (resultado: any) => {
          console.log('✅ [excluirPacientesSelecionados] Exclusão concluída:', resultado);
          
          // Remover da lista local usando chave composta
          const chavesRemovidas = agendamentosParaRemover.map(a => `${a.idAgendamento}-${a.cpf}`);
          this.todosPacientes = this.todosPacientes.filter((paciente) => {
            const chave = `${paciente.idAgendamento}-${paciente.cpf}`;
            return !chavesRemovidas.includes(chave);
          });

          // Limpar seleção
          this.pacientesSelecionados.clear();

          // Recalcular paginação se necessário
          if (this.paginaAtual > this.totalPaginas && this.totalPaginas > 0) {
            this.paginaAtual = this.totalPaginas;
          }

          // Desativar estado de carregamento
          this.excluindoEmMassa = false;
          this.progressoExclusao = { atual: 0, total: 0 };

          alert(`✅ Agendamento(s) removido(s) com sucesso!\n${agendamentosParaRemover.length} agendamento(s) não aparecerão mais na listagem.`);
        },
        error: (erro: any) => {
          console.error('Erro ao remover agendamentos:', erro);
          this.excluindoEmMassa = false;
          this.progressoExclusao = { atual: 0, total: 0 };
          alert('Erro ao remover agendamentos. Tente novamente.');
        },
      });
    }
  }

  // Fallback caso o endpoint em lote não funcione (não mais usado, mantido para compatibilidade)
  private excluirPacientesUmPorUm(idsParaRemover: number[], cpfsParaRemover: string[]): void {
    let excluidos = 0;
    let erros = 0;

    idsParaRemover.forEach((idPaciente) => {
      this.pacienteService.excluirPaciente(idPaciente).subscribe({
        next: () => {
          excluidos++;
          this.progressoExclusao.atual = excluidos + erros;

          if (excluidos + erros === idsParaRemover.length) {
            this.finalizarExclusao(cpfsParaRemover, excluidos, erros);
          }
        },
        error: () => {
          erros++;
          this.progressoExclusao.atual = excluidos + erros;

          if (excluidos + erros === idsParaRemover.length) {
            this.finalizarExclusao(cpfsParaRemover, excluidos, erros);
          }
        },
      });
    });
  }

  private finalizarExclusao(cpfsRemovidos: string[], excluidos: number, erros: number): void {
    // Filtrar todosPacientes pelo CPF removendo os selecionados
    this.todosPacientes = this.todosPacientes.filter(
      (paciente) => !cpfsRemovidos.includes(paciente.cpf)
    );

    // Também remover de dadosExcelParsed pelo CPF (usa CPF maiúsculo)
    this.dadosExcelParsed = this.dadosExcelParsed.filter(
      (paciente) => !cpfsRemovidos.includes(paciente.CPF || '')
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
      alert(`Paciente(s) removidos com alguns erros.\n${erros} erro(s) ao remover.`);
    } else {
      alert(`✅ Paciente(s) removidos com sucesso!\n${excluidos} exame(s) não aparecerão mais na listagem.`);
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
    const perfilSelecionadoNome = this.perfisExames.find(p => p.id === this.perfilSelecionado)?.desC_GRUPO_EXAME || '';
    
    this.pacientes = this.dadosExcelParsed.map((paciente: any, index: number) => ({
      id: index + 1,
      // Data de cadastro prevista (hoje) — será o valor mostrado após import
      data: new Date().toISOString().split('T')[0],
      nome: paciente.NOME || paciente.nome || '',
      cpf: paciente.CPF || paciente.cpf || '',
      diabetes:
        typeof (paciente.DIABETES || paciente.diabetes) === 'string'
          ? ['sim', 's', 'Sim'].includes(paciente.DIABETES || paciente.diabetes)
          : (paciente.DIABETES || paciente.diabetes),
      tratamento: paciente.TIPO_TRATAMENTO || paciente.tipO_TRATAMENTO,
      // Horário/data de coleta deve refletir o agendamento
      horarioColeta: this.dataColetaGlobal,
      status: null, // Ainda não foi transferido
      expandido: false,
      podeEditar: true,
      nomePerfil: perfilSelecionadoNome,
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
              const idUnidade = unidadesParaProcessar[0];
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

              } else {
                // Se não houve sucessos mas ainda assim queremos recarregar a lista
                this.carregarPacientesComAgendamentos();
              }

              // Mostrar modal de erros se houver falhas, senão mostrar alerta de sucesso
              if (this.errosImportacao.length > 0) {
                this.mostrarModalErros = true;
              } else {
                alert(
                  `✅ Importação concluída!\n${resultado.sucessos} paciente(s) importado(s) com sucesso para ${unidadesParaProcessar.length} unidade(s)`
                );
              }

              // Resetar estado do modal e arquivo após a importação
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
              
              // Resetar estado do modal e arquivo após erro (usa removerArquivo)
              this.removerArquivo();
              
              // Atualizar a lista mesmo em caso de erro
              this.carregarPacientesComAgendamentos();
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

    if (!confirm(`Tem certeza que deseja excluir este agendamento do paciente ${paciente.nome}?`)) {
      return;
    }

    console.log('🗑️ [EXCLUIR AGENDAMENTO] Removendo agendamento específico:', {
      id: paciente.id,
      idAgendamento: paciente.idAgendamento,
      cpf: paciente.cpf,
      nome: paciente.nome
    });

    // Validar que temos idAgendamento
    if (!paciente.idAgendamento) {
      console.error('❌ [EXCLUIR AGENDAMENTO] idAgendamento não definido');
      alert('Erro: ID do agendamento não encontrado. Recarregue a página e tente novamente.');
      return;
    }

    // Usar a remoção por agendamentos (chave composta)
    const agendamentosParaRemover = [{ idAgendamento: paciente.idAgendamento, cpf: paciente.cpf }];
    
    this.pacienteService.removerPorAgendamentos(agendamentosParaRemover).subscribe({
      next: (resultado: any) => {
        console.log('✅ [EXCLUIR AGENDAMENTO] Removido com sucesso:', resultado);
        
        // Remover localmente apenas ESTE agendamento específico (por ID único)
        this.todosPacientes = this.todosPacientes.filter((p) => p.id !== paciente.id);

        // Ajustar pagina se necessário
        if (this.paginaAtual > this.totalPaginas && this.totalPaginas > 0) {
          this.paginaAtual = this.totalPaginas;
        }
        this.atualizarPaginasVisiveis();

        alert('Agendamento removido da listagem com sucesso!');
      },
      error: (err: any) => {
        console.error('❌ [EXCLUIR AGENDAMENTO] Erro:', err);
        alert('Erro ao remover agendamento. Verifique o console para mais detalhes.');
      },
    });
  }

  removerExame(paciente: PacienteUI, exameIndex: number): void {
    console.log('🔍 [REMOVER EXAME] ENTRADA:', {
      paciente_id: paciente.id,
      paciente_idAgendamento: paciente.idAgendamento,
      paciente_cpf: paciente.cpf,
      exameIndex: exameIndex,
      totalExames: paciente.exames?.length
    });
    
    if (!paciente.exames || !paciente.exames[exameIndex]) return;

    // Bloquear remoção se for o último exame
    if (paciente.exames.length === 1) {
      alert('⚠️ O paciente precisa ter pelo menos 1 exame.');
      return;
    }

    const exame = paciente.exames[exameIndex];

    console.log('🗑️ [REMOVER EXAME] Dados completos:', {
      pacienteId: paciente.id,
      cpf: paciente.cpf,
      exameId: exame.iD_EXAME,
      exameNome: exame.desC_EXAME,
      exameIndex: exameIndex,
      totalExamesAntes: paciente.exames.length,
      idAgendamento: paciente.idAgendamento,
      urlAPI: `/api/agenda-detalhe/agendamento/${paciente.idAgendamento}/paciente/${paciente.cpf}/exame/${exame.iD_EXAME}`
    });

    if (!confirm(`Deseja remover o exame "${exame.desC_EXAME}" deste paciente?`)) {
      console.log('🗑️ [REMOVER EXAME] Cancelado pelo usuário');
      return;
    }

    // Validar que temos idAgendamento
    if (!paciente.idAgendamento) {
      console.error('❌ [REMOVER EXAME] idAgendamento não definido para o paciente');
      alert('Erro: ID do agendamento não encontrado. Recarregue a página e tente novamente.');
      return;
    }

    // Chamar a API para remover o exame do backend (usa idAgendamento + cpf + idExame)
    this.pacienteService.removerExameDoPaciente(paciente.idAgendamento, paciente.cpf, exame.iD_EXAME).subscribe({
      next: () => {
        console.log('✅ [REMOVER EXAME] API respondeu com sucesso');
        
        // Remove localmente após sucesso no backend
        console.log('🔄 [REMOVER EXAME] Exames antes do splice:', [...paciente.exames!]);
        paciente.exames!.splice(exameIndex, 1);
        console.log('🔄 [REMOVER EXAME] Exames depois do splice:', [...paciente.exames!]);

        // Atualiza também em todosPacientes
        const indexTodos = this.todosPacientes.findIndex((p) => p.id === paciente.id);
        console.log('🔍 [REMOVER EXAME] Index em todosPacientes:', indexTodos);
        
        if (indexTodos > -1 && this.todosPacientes[indexTodos].exames) {
          console.log('🔄 [REMOVER EXAME] todosPacientes antes:', [...this.todosPacientes[indexTodos].exames!]);
          this.todosPacientes[indexTodos].exames = [...paciente.exames!];
          console.log('🔄 [REMOVER EXAME] todosPacientes depois:', [...this.todosPacientes[indexTodos].exames!]);
        }
        
        console.log('✅ [REMOVER EXAME] Remoção concluída com sucesso');
      },
      error: (err: any) => {
        console.error('❌ [REMOVER EXAME] Erro ao remover exame:', {
          status: err?.status,
          statusText: err?.statusText,
          message: err?.message,
          error: err?.error,
          url: err?.url
        });
        let mensagemErro = 'Erro ao remover exame.';
        if (err?.status === 401) {
          mensagemErro = 'Erro 401: Você não está autorizado. Faça login novamente.';
        } else if (err?.status === 404) {
          mensagemErro = 'Erro 404: Exame não encontrado neste agendamento.';
        } else if (err?.status === 0) {
          mensagemErro = 'Erro de conexão: Backend não está respondendo.';
        }
        alert(mensagemErro + '\n\nVerifique o console (F12) para mais detalhes.');
      },
    });
  }

  /**
   * Retorna todos os pacientes que correspondem aos filtros aplicados
   */
  get pacientesBase(): PacienteUI[] {
    let resultado = this.todosPacientes;

    // Filtro por termo de busca (nome ou CPF)
    if (this.termoBusca.trim()) {
      const termo = this.termoBusca.toLowerCase();
      resultado = resultado.filter(
        (p) => p.nome.toLowerCase().includes(termo) || p.cpf.includes(termo)
      );
    }

    // Filtro por status de envio
    if (this.filtroStatus === 'enviados') {
      resultado = resultado.filter((p) => p.status === 'enviado');
    } else if (this.filtroStatus === 'pendentes') {
      resultado = resultado.filter((p) => p.status !== 'enviado');
    }

    // Filtro por data (cadastro OU coleta, conforme selecionado)
    if (this.filtroDataInicio || this.filtroDataFim) {
      resultado = resultado.filter((p) => {
        // Usar o campo correto baseado no tipo selecionado
        const dataPaciente = this.filtroTipoData === 'cadastro' ? p.data : p.horarioColeta;
        if (!dataPaciente) return false;
        
        const passaInicio = !this.filtroDataInicio || dataPaciente >= this.filtroDataInicio;
        const passaFim = !this.filtroDataFim || dataPaciente <= this.filtroDataFim;
        
        return passaInicio && passaFim;
      });
    }

    return resultado;
  }

  /**
   * Verifica se há algum filtro ativo além da busca
   */
  get temFiltroAtivo(): boolean {
    // Considera também a busca por termo (nome ou CPF) como um filtro ativo
    return this.filtroStatus !== 'todos' || !!this.filtroDataInicio || !!this.filtroDataFim || this.termoBusca.trim().length > 0;
  }

  /**
   * Retorna a descrição do filtro de status ativo
   */
  get descricaoFiltroStatus(): string {
    switch (this.filtroStatus) {
      case 'enviados': return 'Transferidos';
      case 'pendentes': return 'Pendentes';
      default: return 'Todos';
    }
  }

  /**
   * Alterna a exibição dos filtros avançados
   */
  toggleFiltrosAvancados(): void {
    this.mostrarFiltrosAvancados = !this.mostrarFiltrosAvancados;
  }

  /**
   * Aplica filtro de status e reseta a paginação
   */
  aplicarFiltroStatus(status: 'todos' | 'enviados' | 'pendentes'): void {
    this.filtroStatus = status;
    this.paginaAtual = 1;
    this.atualizarPaginasVisiveis();
  }

  /**
   * Aplica filtro de data e reseta a paginação
   */
  aplicarFiltroData(): void {
    this.paginaAtual = 1;
    this.atualizarPaginasVisiveis();
  }

  /**
   * Limpa todos os filtros
   */
  limparFiltros(): void {
    this.filtroStatus = 'todos';
    this.filtroTipoData = 'cadastro';
    this.filtroDataInicio = '';
    this.filtroDataFim = '';
    this.termoBusca = '';
    this.paginaAtual = 1;
    this.atualizarPaginasVisiveis();
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
    const erros = this.todosPacientes.filter((p) => p.status === 'erro').length;
    // Pendentes = pacientes que ainda não foram transferidos E não têm erros
    const pendentes = this.todosPacientes.filter((p) => p.status === null || p.status === 'correto').length;

    return { total, enviados, pendentes, erros };
  }

  transferirTodos(): void {}

  // ==================== MÉTODOS DE BUSCA ====================

  /**
   * Chamado quando o termo de busca muda - reseta para página 1
   */
  onBuscaChange(): void {
    // Se a busca de pacientes estiver bloqueada por busca de exames, não permitir alteração
    if (this.isSearchBlocked('paciente')) {
      return;
    }

    this.paginaAtual = 1;
    this.atualizarPaginasVisiveis();
  }

  /**
   * Retorna se um tipo de busca está bloqueando o outro.
   * Legado: anteriormente uma busca bloqueava a outra; agora permitimos buscas simultâneas.
   */
  isSearchBlocked(tipo: 'paciente' | 'exame'): boolean {
    // Não bloqueia mais — ambas as buscas podem ser usadas simultaneamente
    return false;
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

  togglePacienteSelecionado(paciente: PacienteUI): void {
    // Verifica se o paciente já foi enviado (não pode ser selecionado)
    if (paciente.status === 'enviado') {
      return; // Não permite selecionar pacientes já enviados
    }

    const chave = `${paciente.idAgendamento}-${paciente.cpf}`;
    if (this.pacientesSelecionados.has(chave)) {
      this.pacientesSelecionados.delete(chave);
    } else {
      this.pacientesSelecionados.add(chave);
    }
  }

  isPacienteSelecionado(paciente: PacienteUI): boolean {
    const chave = `${paciente.idAgendamento}-${paciente.cpf}`;
    return this.pacientesSelecionados.has(chave);
  }

  selecionarTodosPacientes(): void {
    // Debug: verificar dados
    console.log('🔍 DEBUG selecionarTodos:');
    console.log('  - todosPacientes.length:', this.todosPacientes.length);
    console.log('  - pacientesBase.length:', this.pacientesBase.length);
    console.log('  - Primeiro paciente:', this.pacientesBase[0]);
    
    // Seleciona apenas os pacientes que estão visíveis e NÃO foram enviados
    this.pacientesBase.forEach((paciente) => {
      if (paciente.status !== 'enviado' && paciente.cpf && paciente.idAgendamento) {
        const chave = `${paciente.idAgendamento}-${paciente.cpf}`;
        console.log('  - Adicionando chave:', chave);
        this.pacientesSelecionados.add(chave);
      }
    });
    
    console.log('  - Total selecionados:', this.pacientesSelecionados.size);
    console.log('  - Chaves selecionadas:', Array.from(this.pacientesSelecionados));
  }

  deselecionarTodosPacientes(): void {
    console.log('🔍 DEBUG deselecionarTodos:');
    console.log('  - pacientesBase.length:', this.pacientesBase.length);
    
    // Deseleciona apenas os pacientes que estão visíveis (respeitando o filtro)
    this.pacientesBase.forEach((paciente) => {
      if (paciente.cpf && paciente.idAgendamento) {
        const chave = `${paciente.idAgendamento}-${paciente.cpf}`;
        console.log('  - Removendo chave:', chave);
        this.pacientesSelecionados.delete(chave);
      }
    });
    
    console.log('  - Total selecionados após remoção:', this.pacientesSelecionados.size);
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
    const pacientesSelecionaveis = this.pacientesBase.filter(p => p.status !== 'enviado' && p.cpf && p.idAgendamento);
    return (
      pacientesSelecionaveis.length > 0 &&
      pacientesSelecionaveis.every((p) => {
        const chave = `${p.idAgendamento}-${p.cpf}`;
        return this.pacientesSelecionados.has(chave);
      })
    );
  }

  // ==================== MÉTODOS DE EDIÇÃO DE EXAMES ====================

  editarExamesPaciente(paciente: PacienteUI): void {
    this.pacienteEditandoExames = { ...paciente };
    this.examesEditandoTemp = paciente.exames ? [...paciente.exames] : [];
    this.buscaExame = '';
    this.examesEncontrados = [];
  }

  // Ao digitar no campo de código, limpa o campo de nome e aciona a busca
  onBuscaExameCodigoChange(valor: string): void {
    this.buscaExameCodigo = valor || '';
    if (this.buscaExameNome) {
      this.buscaExameNome = '';
    }
    // Reinicia paginação e resultados, a função buscarExamesNoBackend fará debounce e requisição
    this.paginaExames = 1;
    this.buscarExamesNoBackend(true);
  }

  // Ao digitar no campo de nome, limpa o campo de código e aciona a busca
  onBuscaExameNomeChange(valor: string): void {
    this.buscaExameNome = valor || '';
    if (this.buscaExameCodigo) {
      this.buscaExameCodigo = '';
    }
    this.paginaExames = 1;
    this.buscarExamesNoBackend(true);
  }

  buscarExamesNoBackend(resetPagina: boolean = true): void {
    // Limpar timeout anterior
    if (this.timeoutBusca) {
      clearTimeout(this.timeoutBusca);
    }

    const termoCodigo = this.buscaExameCodigo?.trim() || '';
    const termoNome = this.buscaExameNome?.trim() || '';

    // Se a busca de exames estiver bloqueada por busca de pacientes, não executar
    if (this.isSearchBlocked('exame')) {
      this.examesEncontrados = [];
      this.carregandoExames = false;
      this.paginaExames = 1;
      this.totalExamesDisponiveis = 0;
      return;
    }

    // Se não tiver busca, limpar resultados
    if (!termoCodigo && !termoNome) {
      this.examesEncontrados = [];
      this.carregandoExames = false;
      this.paginaExames = 1;
      this.totalExamesDisponiveis = 0;
      return;
    }

    // Resetar paginação quando o termo muda
    if (resetPagina) {
      this.paginaExames = 1;
      this.examesEncontrados = [];
    }

    // Aguardar 500ms após o usuário parar de digitar
    this.timeoutBusca = setTimeout(() => {
      this.carregandoExames = true;

      let params = new HttpParams()
        .set('pagina', this.paginaExames.toString())
        .set('tamanhoPagina', this.tamanhoPaginaExames.toString());
      
      if (termoCodigo) {
        params = params.set('filtroCodigo', termoCodigo);
      }
      if (termoNome) {
        params = params.set('filtroNome', termoNome);
      }

      this.http.get<any>(`${environment.apiUrl}/exames`, { params }).subscribe({
        next: (response) => {
          const novosExames = response.dados || response || [];
          if (resetPagina || this.paginaExames === 1) {
            this.examesEncontrados = novosExames;
          } else {
            this.examesEncontrados = [...this.examesEncontrados, ...novosExames];
          }
          this.totalExamesDisponiveis = response.paginacao?.totalRegistros || novosExames.length;
          this.carregandoExames = false;
          this.carregandoMaisExames = false;
        },
        error: (erro) => {
          console.error('Erro ao buscar exames:', erro);
          this.examesEncontrados = [];
          this.carregandoExames = false;
          this.carregandoMaisExames = false;
        },
      });
    }, resetPagina ? 500 : 0); // Debounce apenas na primeira busca
  }

  carregarMaisExames(): void {
    if (this.carregandoMaisExames || this.carregandoExames) return;
    
    // Verificar se há mais exames para carregar
    if (this.examesEncontrados.length >= this.totalExamesDisponiveis) return;
    
    this.carregandoMaisExames = true;
    this.paginaExames++;
    this.buscarExamesNoBackend(false);
  }

  onScrollExames(event: Event): void {
    const element = event.target as HTMLElement;
    const threshold = 100; // pixels antes do fim para carregar
    
    if (element.scrollHeight - element.scrollTop - element.clientHeight < threshold) {
      this.carregarMaisExames();
    }
  }

  get examesFiltrados(): any[] {
    return this.examesEncontrados;
  }

  exameJaAdicionado(idExame: number): boolean {
    if (!idExame) return false;
    return this.examesEditandoTemp.some((e) => (e.iD_EXAME || (e as any).ID_EXAME) === idExame);
  }

  adicionarExameTemp(exame: any): void {
    const idExame = exame.iD_EXAME || exame.ID_EXAME;
    if (!idExame) {
      console.warn('Exame sem ID válido:', exame);
      return;
    }
    
    const novoExame: ExameDetalhado = {
      iD_EXAME: idExame,
      desC_EXAME: exame.dS_EXAME || exame.DS_EXAME || '',
      cD_EXAME: exame.cD_EXAME || exame.CD_EXAME || '', // Código principal (ex: CRE)
      cD_EXAME_DB: exame.cD_EXAME_DB || exame.CD_EXAME_DB || '', // Código interno do banco
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
    this.buscaExameCodigo = '';
    this.buscaExameNome = '';
    this.paginaExames = 1;
    this.totalExamesDisponiveis = 0;
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
    const idAgendamento = this.pacienteEditandoExames.idAgendamento;
    const examesOriginais = this.pacienteEditandoExames.exames || [];
    const examesNovos = this.examesEditandoTemp;

    // Validar que temos idAgendamento
    if (!idAgendamento) {
      console.error('❌ [SALVAR EXAMES] idAgendamento não definido');
      alert('Erro: ID do agendamento não encontrado. Recarregue a página e tente novamente.');
      return;
    }

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

    // Obter idUnidade do localStorage
    const idUnidade = this.getUnidade() || 0;

    // Função para processar as operações em série
    const processarOperacoes = async () => {
      try {
        // PRIMEIRO: adicionar exames UM POR VEZ (para garantir que sempre tenha exame)
        for (const exame of examesAdicionados) {
          await this.pacienteService
            .adicionarExameAoPaciente(
              idAgendamento,
              cpf,
              exame.iD_EXAME,
              exame.cD_EXAME || '', // Código principal (ex: CRE)
              exame.cD_EXAME_DB || '', // Código interno do banco
              exame.desC_EXAME || '',
              idUnidade
            )
            .toPromise();
        }

        // DEPOIS: remover exames (pode ser em paralelo)
        if (examesRemovidos.length > 0) {
          const remocoes = examesRemovidos.map((exame) =>
            this.pacienteService.removerExameDoPaciente(idAgendamento, cpf, exame.iD_EXAME).toPromise()
          );
          await Promise.all(remocoes);
        }

        this.finalizarSalvarExames();
      } catch (erro: any) {
        console.error('❌ [SALVAR EXAMES] Erro detalhado:', {
          erro: erro,
          status: erro?.status,
          statusText: erro?.statusText,
          message: erro?.message,
          error: erro?.error,
          url: erro?.url
        });
        let mensagemErro = 'Erro ao salvar algumas alterações.';
        if (erro?.status === 401) {
          mensagemErro = 'Erro 401: Você não está autorizado. Faça login novamente.';
        } else if (erro?.status === 404) {
          mensagemErro = 'Erro 404: Agendamento não encontrado.';
        } else if (erro?.status === 0) {
          mensagemErro = 'Erro de conexão: Backend não está respondendo.';
        }
        alert('❌ ' + mensagemErro + '\n\nVerifique o console (F12) para mais detalhes.');
        this.salvandoExames = false;
      }
    };

    processarOperacoes();
  }

  private finalizarSalvarExames(): void {
    console.log('💾 [FINALIZAR SALVAR] Iniciando finalização');
    
    // ✅ Atualizar APENAS o paciente específico na lista (sem recarregar tudo)
    const index = this.todosPacientes.findIndex(
      (p) => p.id === this.pacienteEditandoExames!.id
    );
    
    if (index > -1) {
      console.log('🔄 [FINALIZAR SALVAR] Atualizando exames do paciente index:', index);
      
      // Atualizar diretamente o objeto (referência) - NÃO recria a lista
      this.todosPacientes[index].exames = [...this.examesEditandoTemp];
      
      console.log('✅ [FINALIZAR SALVAR] Exames atualizados:', this.todosPacientes[index].exames);
    }

    this.salvandoExames = false;
    alert('✅ Exames atualizados com sucesso!');
    console.log('✅ [FINALIZAR SALVAR] Concluído');
    this.cancelarEdicaoExames();
  }

  /**
   * Atualiza os exames de um paciente na lista local buscando do backend pelo CPF
   */
  private atualizarExamesPacienteEmLista(cpf: string): void {
    if (!cpf) return;
    
    console.log('🔄 [ATUALIZAR EXAMES] Buscando exames do backend para CPF:', cpf);
    
    this.pacienteService.buscarExamesDoPaciente(cpf).subscribe({
      next: (res: any) => {
        const exames = res?.dados || res || [];
        console.log('📥 [ATUALIZAR EXAMES] Resposta da API:', { totalExames: exames.length, exames });
        
        const index = this.todosPacientes.findIndex((p) => p.cpf === cpf);
        console.log('🔍 [ATUALIZAR EXAMES] Index do paciente em todosPacientes:', index);
        
        if (index > -1) {
          console.log('🔄 [ATUALIZAR EXAMES] Exames ANTES da atualização:', [...(this.todosPacientes[index].exames || [])]);
          
          // Criar um novo array de exames para garantir que não haja duplicação
          const examesAtualizados: ExameDetalhado[] = [];
          
          // Mapear para o formato local garantindo que cada exame aparece apenas uma vez
          const examesUnicos = new Map<number, any>();
          (exames || []).forEach((e: any) => {
            const idExame = e.iD_EXAME || e.ID_EXAME;
            if (idExame && !examesUnicos.has(idExame)) {
              examesUnicos.set(idExame, e);
            } else if (idExame) {
              console.warn('⚠️ [ATUALIZAR EXAMES] Exame duplicado detectado (ignorado):', idExame, e.desC_EXAME || e.DESC_EXAME);
            }
          });
          
          console.log('🔢 [ATUALIZAR EXAMES] Exames únicos mapeados:', examesUnicos.size);
          
          examesUnicos.forEach((e: any) => {
            examesAtualizados.push({
              iD_EXAME: e.iD_EXAME || e.ID_EXAME,
              desC_EXAME: e.desC_EXAME || e.DESC_EXAME || '',
              cD_EXAME: e.cD_EXAME || e.CD_EXAME || '', // Código principal (ex: CRE)
              cD_EXAME_DB: e.cD_EXAME_DB || e.CD_EXAME_DB || '', // Código interno do banco
              iD_GRUPO_EXAME: e.iD_GRUPO_EXAME || e.ID_GRUPO_EXAME || null,
              sigla: e.sigla || e.SIGLA || '',
              material: e.material || e.MATERIAL || 'Soro',
            });
          });
          
          // Substituir completamente o array de exames
          this.todosPacientes[index].exames = examesAtualizados;
          console.log('✅ [ATUALIZAR EXAMES] Exames DEPOIS da atualização:', [...examesAtualizados]);

          // Atualiza view
          this.atualizarPacientesDaPagina();
          console.log('🔄 [ATUALIZAR EXAMES] View atualizada (atualizarPacientesDaPagina chamado)');
        } else {
          console.warn('⚠️ [ATUALIZAR EXAMES] Paciente não encontrado em todosPacientes');
        }
      },
      error: (err: any) => {
        console.error('❌ [ATUALIZAR EXAMES] Erro ao buscar exames do paciente:', err);
      }
    });
  }
}
