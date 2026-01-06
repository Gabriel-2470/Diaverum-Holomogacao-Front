import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, catchError } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface ExameDTO {
  iD_EXAME: number;
  cD_EXAME: string;
  dS_EXAME: string;
  material: string;
}

interface Exame {
  id: string;
  codigo: string;
  nome: string;
  material: string;
}

interface ExamesResponse {
  sucesso: boolean;
  dados: ExameDTO[];
  paginacao: {
    paginaAtual: number;
    tamanhoPagina: number;
    totalRegistros: number;
    totalPaginas: number;
  };
}

@Component({
  selector: 'app-perfil-exame',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './perfil-exame.html',
  styleUrls: ['./perfil-exame.scss'],
})
export class PerfilExame implements OnInit {
  @ViewChild('listaExames') listaExamesRef?: ElementRef;

  private readonly apiUrl = environment.apiUrl;

  isEdicao = false;
  perfilId?: number;

  nomePerfil = '';
  responsavel = '';
  buscaExameCodigo = '';
  buscaExameNome = '';

  examesDisponiveis: Exame[] = [];
  examesSelecionados: Exame[] = [];

  unidades: any[] = [];
  unidadesSelecionadas: number[] = [];

  paginaAtual = 1;
  tamanhoPagina = 50;
  totalPaginas = 1;
  totalRegistros = 0;

  carregandoExames = false;
  carregandoMais = false;
  erroCarregamento = '';

  private timeoutBusca: any;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    // Preencher responsável com nome do usuário logado
    const usuarioLogado = this.authService.getCurrentUser();
    if (usuarioLogado) {
      this.responsavel = usuarioLogado.nome;
    }

    this.carregarExames();
    this.carregarUnidades();

    this.route.params.subscribe((params) => {
      if (params['id']) {
        this.isEdicao = true;
        this.perfilId = +params['id'];
        this.carregarPerfil(this.perfilId);
      }
    });
  }

  carregarUnidades(): void {
    this.http.get<any>(`${this.apiUrl}/unidade-envio`).subscribe({
      next: (response) => {
        const todasUnidades = response.dados || response || [];
        // Filtrar "Coligada Global"
        const filtradas = todasUnidades.filter((u: any) => {
          const nomeUnidade = (u.noM_UNIDADE || u.NOM_UNIDADE || u.descricao || '').toLowerCase();
          return !nomeUnidade.includes('coligada global');
        });

        // Se for ADMIN, mostra todas as unidades (acesso completo)
        if (this.authService.isAdmin()) {
          this.unidades = filtradas;
          return;
        }

        // Para USERS: mostrar apenas as unidades vinculadas ao usuário
        let allowedIds: number[] = [];
        const unidadesUsuarioRaw = localStorage.getItem('unidadesUsuario');
        if (unidadesUsuarioRaw) {
          try {
            const arr = JSON.parse(unidadesUsuarioRaw) as any[];
            allowedIds = arr.map((u: any) => u.idUnidade || u.IdUnidade || u.iD_UNIDADE || u.ID_UNIDADE);
          } catch (e) {
            // ignore parse errors
          }
        }

        // fallback: usar currentUser.idUnidade
        const usuarioLogado = this.authService.getCurrentUser();
        if ((!allowedIds || allowedIds.length === 0) && usuarioLogado && usuarioLogado.idUnidade) {
          allowedIds = [usuarioLogado.idUnidade];
        }

        // Se allowedIds contém 0 -> consolidador (acesso a todas)
        if (allowedIds.includes(0)) {
          this.unidades = filtradas;
        } else {
          this.unidades = filtradas.filter((u: any) =>
            allowedIds.includes(u.iD_UNIDADE || u.ID_UNIDADE || u.idUnidade || u.IdUnidade)
          );

          // Pré-selecionar a(s) unidade(s) do usuário
          this.unidadesSelecionadas = this.unidades.map((u: any) => u.iD_UNIDADE || u.ID_UNIDADE || u.idUnidade || u.IdUnidade);
        }
      },
      error: (erro) => {},
    });
  }

  selecionarTodasUnidades(): void {
    this.unidadesSelecionadas = this.unidades.map((u) => u.iD_UNIDADE || u.ID_UNIDADE);
  }

  deselecionarTodasUnidades(): void {
    this.unidadesSelecionadas = [];
  }

  toggleUnidade(idUnidade: number): void {
    const index = this.unidadesSelecionadas.indexOf(idUnidade);
    if (index === -1) {
      this.unidadesSelecionadas.push(idUnidade);
    } else {
      this.unidadesSelecionadas.splice(index, 1);
    }
  }

  unidadeEstaSelecionada(idUnidade: number): boolean {
    return this.unidadesSelecionadas.includes(idUnidade);
  }

  resetarPaginacao(): void {
    this.paginaAtual = 1;
    this.examesDisponiveis = [];
  }

  carregarExames(): void {
    if (this.paginaAtual === 1) {
      this.carregandoExames = true;
    } else {
      this.carregandoMais = true;
    }

    this.erroCarregamento = '';

    const params = new HttpParams().set('pagina', '1').set('tamanhoPagina', '50');

    this.http.get<ExamesResponse>(`${this.apiUrl}/exames`, { params }).subscribe({
      next: (response) => {
        if (!response.sucesso) {
          throw new Error('Erro ao buscar exames');
        }

        this.examesDisponiveis = response.dados.map((dto) => ({
          id: dto.iD_EXAME.toString(),
          codigo: dto.cD_EXAME,
          nome: dto.dS_EXAME,
          material: dto.material || 'Não especificado',
        }));

        this.totalRegistros = response.paginacao.totalRegistros;
        this.totalPaginas = response.paginacao.totalPaginas;
        this.paginaAtual = 1;
        this.carregandoExames = false;
      },
      error: () => {
        this.erroCarregamento = 'Não foi possível carregar os exames.';
        this.carregandoExames = false;
      },
    });
  }

  buscarExames(resetPagina: boolean = true): void {
    // Se resetar, limpar lista e voltar à página 1
    if (resetPagina) {
      this.paginaAtual = 1;
      this.examesDisponiveis = [];
      this.carregandoExames = true;
    } else {
      this.carregandoMais = true;
    }

    this.erroCarregamento = '';

    const termoCodigo = this.buscaExameCodigo?.trim() || '';
    const termoNome = this.buscaExameNome?.trim() || '';

    // Se não tiver busca, limpar resultados
    if (!termoCodigo && !termoNome) {
      this.examesDisponiveis = [];
      this.carregandoExames = false;
      this.totalRegistros = 0;
      this.totalPaginas = 0;
      return;
    }

    let params = new HttpParams()
      .set('pagina', this.paginaAtual.toString())
      .set('tamanhoPagina', '50');

    if (termoCodigo) {
      params = params.set('filtroCodigo', termoCodigo);
    }
    if (termoNome) {
      params = params.set('filtroNome', termoNome);
    }

    this.http.get<ExamesResponse>(`${this.apiUrl}/exames`, { params }).subscribe({
      next: (response) => {
        if (!response.sucesso) {
          throw new Error('Erro ao buscar exames');
        }

        const novosExames = response.dados.map((dto) => ({
          id: dto.iD_EXAME.toString(),
          codigo: dto.cD_EXAME,
          nome: dto.dS_EXAME,
          material: dto.material || 'Não especificado',
        }));

        if (resetPagina) {
          this.examesDisponiveis = novosExames;
        } else {
          this.examesDisponiveis = [...this.examesDisponiveis, ...novosExames];
        }

        this.totalRegistros = response.paginacao.totalRegistros;
        this.totalPaginas = response.paginacao.totalPaginas;
        this.carregandoExames = false;
        this.carregandoMais = false;
      },
      error: (erro) => {
        this.erroCarregamento = 'Não foi possível buscar os exames.';
        this.carregandoExames = false;
        this.carregandoMais = false;
      },
    });
  }

  carregarProximaPagina(): void {
    this.carregandoMais = true;

    const params = new HttpParams()
      .set('pagina', (this.paginaAtual + 1).toString())
      .set('tamanhoPagina', '50');

    this.http.get<ExamesResponse>(`${this.apiUrl}/exames`, { params }).subscribe({
      next: (response) => {
        if (!response.sucesso) {
          throw new Error('Erro ao buscar exames');
        }

        const novosExames = response.dados.map((dto) => ({
          id: dto.iD_EXAME.toString(),
          codigo: dto.cD_EXAME,
          nome: dto.dS_EXAME,
          material: dto.material || 'Não especificado',
        }));

        this.examesDisponiveis = [...this.examesDisponiveis, ...novosExames];
        this.paginaAtual = response.paginacao.paginaAtual;
        this.carregandoMais = false;
      },
      error: () => {
        this.carregandoMais = false;
      },
    });
  }

  onScroll(event: Event): void {
    const elemento = event.target as HTMLElement;
    const scrollTop = elemento.scrollTop;
    const scrollHeight = elemento.scrollHeight;
    const clientHeight = elemento.clientHeight;
    const scrollPercent = (scrollTop + clientHeight) / scrollHeight;

    // Quando chegar a 80% do scroll e tiver mais páginas
    if (scrollPercent > 0.8 && !this.carregandoMais && this.paginaAtual < this.totalPaginas) {
      const termoCodigo = this.buscaExameCodigo?.trim() || '';
      const termoNome = this.buscaExameNome?.trim() || '';
      
      if (termoCodigo || termoNome) {
        this.paginaAtual++;
        this.buscarExames(false);
      } else {
        this.carregarProximaPagina();
      }
    }
  }

  onBuscaExameCodigoChange(valor: string): void {
    this.buscaExameCodigo = valor || '';
    if (this.buscaExameNome) {
      this.buscaExameNome = '';
    }
    this.resetarPaginacao();
    
    // Limpar timeout anterior
    if (this.timeoutBusca) {
      clearTimeout(this.timeoutBusca);
    }
    
    // Debounce de 500ms
    this.timeoutBusca = setTimeout(() => {
      this.buscarExames(true);
    }, 500);
  }

  onBuscaExameNomeChange(valor: string): void {
    this.buscaExameNome = valor || '';
    if (this.buscaExameCodigo) {
      this.buscaExameCodigo = '';
    }
    this.resetarPaginacao();
    
    // Limpar timeout anterior
    if (this.timeoutBusca) {
      clearTimeout(this.timeoutBusca);
    }
    
    // Debounce de 500ms
    this.timeoutBusca = setTimeout(() => {
      this.buscarExames(true);
    }, 500);
  }

  carregarPerfil(id: number): void {
    this.http.get<any>(`${this.apiUrl}/grupo-mestre/${id}`).subscribe({
      next: (resGrupo: any) => {
        const grupo = resGrupo.dados || resGrupo;

        // Extrair nome do perfil de DESC_GRUPO_EXAME (pode conter " (Responsável)")
        const descCompleta =
          grupo.desC_GRUPO_EXAME || grupo.DESC_GRUPO_EXAME || grupo.descGrupoExame || '';
        const match = descCompleta.match(/^(.+?)\s*\((.+?)\)$/);
        this.nomePerfil = match ? match[1].trim() : descCompleta;

        // Manter o responsável como nome do usuário logado (bloqueado)
        // O backend armazena USUARIO_CRIACAO como INT

        forkJoin({
          examesGrupo: this.http.get<any>(`${this.apiUrl}/grupos-exames/${id}`),
          unidadesGrupo: this.http.get<any>(`${this.apiUrl}/unidade-grupo-mestre?idGrupo=${id}`),
        }).subscribe({
          next: ({ examesGrupo, unidadesGrupo }: any) => {
            // Pega os IDs dos exames do grupo
            const idsExamesGrupo = (examesGrupo.dados || []).map(
              (item: any) => item.iD_EXAME || item.ID_EXAME
            );

            if (idsExamesGrupo.length > 0) {
              // Usa o endpoint otimizado para buscar múltiplos exames de uma vez
              this.http
                .post<any>(`${this.apiUrl}/exames/buscar-multiplos`, { ids: idsExamesGrupo })
                .subscribe({
                  next: (resExames: any) => {
                    this.examesSelecionados = (resExames.dados || []).map((dto: any) => ({
                      id: (dto.iD_EXAME || dto.ID_EXAME)?.toString(),
                      codigo: dto.cD_EXAME || dto.CD_EXAME,
                      nome: dto.dS_EXAME || dto.DS_EXAME,
                      material: dto.material || dto.MATERIAL || 'Não especificado',
                    }));
                  },
                  error: (erro) => {
                    // Fallback: deixa vazio se não conseguir carregar
                    this.examesSelecionados = [];
                  },
                });
            } else {
              this.examesSelecionados = [];
            }

            // Carregar unidades selecionadas
            this.unidadesSelecionadas = (unidadesGrupo.dados || []).map(
              (item: any) => item.iD_UNIDADE || item.ID_UNIDADE
            );

            // Se o usuário não for ADMIN, garantir que só veja/edite as unidades vinculadas a ele
            if (!this.authService.isAdmin()) {
              const unidadesUsuarioRaw = localStorage.getItem('unidadesUsuario');
              let allowedIds: number[] = [];
              if (unidadesUsuarioRaw) {
                try {
                  const arr = JSON.parse(unidadesUsuarioRaw) as any[];
                  allowedIds = arr.map((u: any) => u.idUnidade || u.IdUnidade || u.iD_UNIDADE || u.ID_UNIDADE);
                } catch (e) {
                  // ignore
                }
              }

              // Fallback para currentUser.idUnidade
              const usuarioLogado = this.authService.getCurrentUser();
              if ((!allowedIds || allowedIds.length === 0) && usuarioLogado && usuarioLogado.idUnidade) {
                allowedIds = [usuarioLogado.idUnidade];
              }

              // Se não for consolidador (0), filtrar seleções
              if (!allowedIds.includes(0)) {
                this.unidadesSelecionadas = this.unidadesSelecionadas.filter((id: number) => allowedIds.includes(id));
              }
            }
          },
          error: (erro) => {},
        });
      },
      error: (erro) => {},
    });
  }

  exameEstaSelecionado(exame: Exame): boolean {
    return this.examesSelecionados.some((e: Exame) => e.id === exame.id);
  }

  toggleExame(exame: Exame): void {
    const index = this.examesSelecionados.findIndex((e: Exame) => e.id === exame.id);
    if (index > -1) {
      this.examesSelecionados.splice(index, 1);
    } else {
      this.examesSelecionados.push(exame);
    }
  }

  selecionarTodos(): void {
    this.examesDisponiveis.forEach((exame: Exame) => {
      if (!this.exameEstaSelecionado(exame)) {
        this.examesSelecionados.push(exame);
      }
    });
  }

  deselecionarTodos(): void {
    this.examesSelecionados = [];
  }

  voltar(): void {
    this.router.navigate(['/perfis']);
  }

  salvar(): void {
    if (!this.nomePerfil.trim()) {
      alert('Preencha o nome do perfil');
      return;
    }

    if (this.unidadesSelecionadas.length === 0) {
      alert('Selecione pelo menos uma unidade');
      return;
    }

    if (this.examesSelecionados.length === 0) {
      alert('Selecione pelo menos um exame');
      return;
    }

    const usuarioLogado = this.authService.getCurrentUser();
    const idUsuario = usuarioLogado?.idUser || 0;
    const nomeUsuario = this.responsavel || usuarioLogado?.nome || 'N/A';

    // TBL_GRUPO_MESTRE não tem campo USUARIO_CRIACAO
    // Vamos salvar o responsável concatenado com o nome do perfil
    const descricaoCompleta = `${this.nomePerfil} (${nomeUsuario})`;

    const payloadGrupo = {
      DIA_DO_MES_QUE_OCORRE: 0,
      PERIODICIDADE: 'M',
      MES_REFERENCIA: 0,
      DESC_GRUPO_EXAME: descricaoCompleta,
      IND_REG_ATIVO: true,
    };

    if (this.isEdicao && this.perfilId) {
      this.http.put<any>(`${this.apiUrl}/grupo-mestre/${this.perfilId}`, payloadGrupo).subscribe({
        next: () => {
          this.atualizarExamesDoGrupoEdicao(this.perfilId!, idUsuario);
        },
        error: (err: any) => {
          alert('Erro ao atualizar grupo');
        },
      });
    } else {
      this.http.post<any>(`${this.apiUrl}/grupo-mestre`, payloadGrupo).subscribe({
        next: (responseGrupo: any) => {
          // Criar associação na TBL_UNIDADE_GRUPO_MESTRE com USUARIO_CRIACAO
          this.criarAssociacaoUnidadeGrupo(responseGrupo.id, idUsuario).then(() => {
            this.associarExamesAoGrupo(responseGrupo.id);
          });
        },
        error: (err: any) => {
          alert('Erro ao criar grupo');
        },
      });
    }
  }

  /**
   * Cria associação na TBL_UNIDADE_GRUPO_MESTRE quando um novo perfil é criado
   * Cria para TODAS as unidades disponíveis no sistema
   */
  private async criarAssociacaoUnidadeGrupo(grupoId: number, idUsuario: number): Promise<void> {
    try {
      // USUARIO_CRIACAO e USUARIO_ALTERACAO são INT (ID do usuário), não VARCHAR
      if (!idUsuario || idUsuario === 0) {
        return;
      }

      // Usar apenas as unidades selecionadas pelo usuário
      if (this.unidadesSelecionadas.length === 0) {
        return;
      }

      // Criar associação apenas para as unidades selecionadas
      const requests = this.unidadesSelecionadas.map((idUnidade: number) => {
        const payload = {
          ID_UNIDADE: idUnidade,
          ID_GRUPO_EXAME: grupoId,
          IND_REG_ATIVO: true,
          USUARIO_CRIACAO: idUsuario, // Enviar ID (INT) não nome
          USUARIO_ALTERACAO: idUsuario, // Enviar ID (INT) não nome
          DATA_ALTERACAO: new Date().toISOString(),
        };
        return this.http.post(`${this.apiUrl}/unidade-grupo-mestre`, payload).toPromise();
      });

      await Promise.all(requests);
    } catch (erro) {}
  }

  private atualizarExamesDoGrupoEdicao(grupoId: number, idUsuario?: number): void {
    this.http.get<any>(`${this.apiUrl}/grupos-exames/${grupoId}`).subscribe({
      next: (resExistentes: any) => {
        const existentes = (resExistentes.dados || []).map((e: any) => ({
          id: e.iD_EXAME?.toString() || e.ID_EXAME?.toString(),
          idGrupoExameExame:
            e.iD_GRUPO_EXAME_X_EXAME || e.ID_GRUPO_EXAME_X_EXAME || e.idGrupoExameExame || e.id,
        }));

        const idsSelecionados = this.examesSelecionados.map((e: Exame) => e.id);

        // Exames que devem ser removidos
        const paraRemover = existentes.filter((e: any) => !idsSelecionados.includes(e.id));

        // Exames que devem ser adicionados
        const idsExistentes = existentes.map((e: any) => e.id);
        const paraAdicionar = this.examesSelecionados.filter(
          (e: Exame) => !idsExistentes.includes(e.id)
        );

        const requestsRemocao = paraRemover.map((e: any) =>
          this.http.delete(`${this.apiUrl}/grupos-exames/${grupoId}/${e.id}`)
        );

        const requestsAdicao = paraAdicionar.map((exame: Exame) => {
          const payload = {
            ID_GRUPO_EXAME: grupoId,
            ID_EXAME: parseInt(exame.id),
          };
          return this.http.post(`${this.apiUrl}/grupos-exames`, payload);
        });

        const todasRequisicoes = [...requestsRemocao, ...requestsAdicao];

        forkJoin(todasRequisicoes.length > 0 ? todasRequisicoes : [of(null)]).subscribe({
          next: () => {
            // Atualizar associações de unidades
            if (idUsuario) {
              this.atualizarUnidadesDoGrupo(grupoId, idUsuario);
            } else {
              alert('Perfil atualizado com sucesso!');
              this.router.navigate(['/perfis']);
            }
          },
          error: (err: any) => {
            alert('Erro ao atualizar exames do perfil');
          },
        });
      },
      error: (err: any) => {
        alert('Erro ao verificar exames já associados');
      },
    });
  }

  /**
   * Atualiza as associações de unidades do grupo (adiciona/remove conforme seleção)
   */
  private atualizarUnidadesDoGrupo(grupoId: number, idUsuario: number): void {
    // Buscar unidades atualmente associadas ao grupo
    this.http.get<any>(`${this.apiUrl}/unidade-grupo-mestre?idGrupo=${grupoId}`).subscribe({
      next: (resUnidadesAtuais: any) => {
        const unidadesAtuais = (resUnidadesAtuais.dados || []).map(
          (item: any) => item.iD_UNIDADE || item.ID_UNIDADE
        );

        // Unidades que devem ser removidas (estavam associadas mas não estão mais selecionadas)
        const paraRemover = unidadesAtuais.filter(
          (id: number) => !this.unidadesSelecionadas.includes(id)
        );

        // Unidades que devem ser adicionadas (estão selecionadas mas não estavam associadas)
        const paraAdicionar = this.unidadesSelecionadas.filter(
          (id: number) => !unidadesAtuais.includes(id)
        );

        // Usar catchError para ignorar erros individuais (ex: tentar deletar algo que não existe)
        const requestsRemocao = paraRemover.map((idUnidade: number) =>
          this.http.delete(`${this.apiUrl}/unidade-grupo-mestre/${idUnidade}/${grupoId}`).pipe(
            catchError(() => of(null)) // Ignora erro se não encontrar
          )
        );

        const requestsAdicao = paraAdicionar.map((idUnidade: number) => {
          const payload = {
            ID_UNIDADE: idUnidade,
            ID_GRUPO_EXAME: grupoId,
            IND_REG_ATIVO: true,
            USUARIO_CRIACAO: idUsuario,
            USUARIO_ALTERACAO: idUsuario,
            DATA_ALTERACAO: new Date().toISOString(),
          };
          return this.http.post(`${this.apiUrl}/unidade-grupo-mestre`, payload).pipe(
            catchError(() => of(null)) // Ignora erro se já existir
          );
        });

        const todasRequisicoes = [...requestsRemocao, ...requestsAdicao];

        if (todasRequisicoes.length > 0) {
          forkJoin(todasRequisicoes).subscribe({
            next: () => {
              alert('Perfil atualizado com sucesso!');
              this.router.navigate(['/perfis']);
            },
            error: (err: any) => {
              console.error('Erro ao atualizar unidades:', err);
              alert('Perfil atualizado com sucesso!');
              this.router.navigate(['/perfis']);
            },
          });
        } else {
          alert('Perfil atualizado com sucesso!');
          this.router.navigate(['/perfis']);
        }
      },
      error: (err: any) => {
        console.error('Erro ao buscar unidades atuais:', err);
        alert('Perfil atualizado, mas houve erro ao verificar unidades.');
        this.router.navigate(['/perfis']);
      },
    });
  }

  private associarExamesAoGrupo(grupoId: number): void {
    const requests = this.examesSelecionados.map((exame: Exame) => {
      const payload = {
        ID_GRUPO_EXAME: grupoId,
        ID_EXAME: parseInt(exame.id),
      };
      return this.http.post(`${this.apiUrl}/grupos-exames`, payload);
    });

    forkJoin(requests).subscribe({
      next: () => {
        alert(this.isEdicao ? 'Perfil atualizado com sucesso!' : 'Perfil criado com sucesso!');
        this.router.navigate(['/perfis']);
      },
      error: (err: any) => {
        alert('Erro ao associar exames: ' + JSON.stringify(err.error?.detail || err.message));
      },
    });
  }
}
