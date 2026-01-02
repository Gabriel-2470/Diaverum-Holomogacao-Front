import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { UsuarioService } from '../../core/services/usuario.service';
import { environment } from '../../../environments/environment';

interface Exame {
  id: number;
  nome: string;
  codigo: string;
  material: string;
}

interface Perfil {
  id: number;
  nome: string;
  responsavel?: string;
  responsavelRole?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  exames: Exame[];
}

@Component({
  selector: 'app-gerencia-perfil',
  imports: [CommonModule],
  templateUrl: './gerencia-perfil.html',
  styleUrl: './gerencia-perfil.scss',
})
export class GerenciaPerfil implements OnInit {
  private readonly apiUrl = environment.apiUrl;

  perfis: Perfil[] = [];
  examesSistema: any[] = [];
  examesExpandidos: { [key: number]: boolean } = {};

  carregando = false;
  erro = '';

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
    private usuarioService: UsuarioService
  ) {}

  ngOnInit(): void {
    this.carregarTudo();
  }

  // ---------------------------------------------
  // CARREGAMENTO DOS DADOS - CORRIGIDO
  // ---------------------------------------------
  async carregarTudo(): Promise<void> {
    this.carregando = true;
    this.erro = '';
    this.perfis = [];

    try {
      // 1. Carrega grupos (perfis) primeiro
      const resGrupo = await this.http.get<any>(`${this.apiUrl}/grupo-mestre`).toPromise();

      if (!resGrupo.sucesso || !Array.isArray(resGrupo.dados)) {
        this.erro = 'Retorno inesperado da API de grupos.';
        this.carregando = false;
        return;
      }

      let grupos = resGrupo.dados;

      if (!Array.isArray(grupos) || grupos.length === 0) {
        this.carregando = false;
        return;
      }

      // Determinar unidades do usuário para filtro (null = mostrar todos)
      let allowedUnits: number[] | null = null;
      const currentUser = this.authService.getCurrentUser();
      if (currentUser) {
        // usar cast para any para lidar com variações legacy de propriedade sem quebrar o tipo User
        const idUnidade = (currentUser as any).idUnidade ?? (currentUser as any).IdUnidade ?? (currentUser as any).ID_UNIDADE ?? null;
        if (idUnidade === 0) {
          allowedUnits = null; // consolidador
        } else if (idUnidade != null) {
          allowedUnits = [Number(idUnidade)];
        }
      }

      if (allowedUnits === null) {
        const unidadesRaw = localStorage.getItem('unidadesUsuario');
        if (unidadesRaw) {
          try {
            const arr = JSON.parse(unidadesRaw) as any[];
            const ids = arr
              .map((u) => u.IdUnidade ?? u.idUnidade ?? u.iD_UNIDADE ?? u.ID_UNIDADE ?? u.id)
              .filter((x) => x != null)
              .map(Number);
            if (ids.length > 0) {
              // se a lista de unidades do usuário contém 0, ele é consolidador -> mostrar todos
              if (ids.includes(0)) {
                allowedUnits = null;
              } else {
                allowedUnits = ids;
              }
            }
          } catch (e) {
            // manter null -> mostrar todos
          }
        }
      }

      // Se allowedUnits for não-nulo, filtrar grupos que possuem associação com as unidades do usuário
      if (allowedUnits !== null) {
        const filtrados = await Promise.all(
          grupos.map(async (grupo: any) => {
            const idGrupo = grupo.iD_GRUPO_EXAME || grupo.ID_GRUPO_EXAME;
            try {
              const res = await this.http
                .get<any>(`${this.apiUrl}/unidade-grupo-mestre?idGrupo=${idGrupo}`)
                .toPromise();
              const unidadesAssoc = (res.dados || [])
                .map((u: any) => u.iD_UNIDADE || u.ID_UNIDADE)
                .filter((x: any) => x != null)
                .map(Number);
              const has = unidadesAssoc.some((u: number) => allowedUnits!.includes(u));
              return has ? grupo : null;
            } catch (e) {
              return null;
            }
          })
        );
        grupos = filtrados.filter((g: any) => g !== null);
      }

      // 2. Busca IDs únicos de exames de todos os grupos
      const todosIdsExames = new Set<number>();

      for (const grupo of grupos) {
        const idGrupo = grupo.iD_GRUPO_EXAME || grupo.ID_GRUPO_EXAME;
        const resGE = await this.http
          .get<any>(`${this.apiUrl}/grupos-exames/${idGrupo}`)
          .toPromise();

        (resGE.dados || []).forEach((item: any) => {
          const idExame = item.iD_EXAME || item.ID_EXAME;
          todosIdsExames.add(idExame);
        });
      }

      const idsUnicos = Array.from(todosIdsExames);

      // 3. Carrega apenas os exames necessários
      await this.carregarExamesPorIds(idsUnicos);

      // 3. Carrega exames de TODOS os grupos usando forkJoin
      const requests = grupos.map((grupo: any) => {
        const idGrupo = grupo.iD_GRUPO_EXAME || grupo.ID_GRUPO_EXAME;

        return this.http.get<any>(`${this.apiUrl}/grupos-exames/${idGrupo}`).pipe(
          switchMap((resGE) => {
            const idsExames = (resGE.dados || []).map(
              (item: any) => item.iD_EXAME || item.ID_EXAME
            );

            if (idsExames.length === 0) {
              const descGrupo = grupo.desC_GRUPO_EXAME || grupo.DESC_GRUPO_EXAME || 'Sem nome';
              const match = descGrupo.match(/^(.+?)\s*\((.+?)\)$/);
              const nomeGrupo = match ? match[1].trim() : descGrupo;
              const responsavelNome = match ? match[2].trim() : 'N/A';

              return of({
                id: idGrupo,
                nome: nomeGrupo,
                responsavel: responsavelNome,
                exames: [],
              } as Perfil);
            }

            // Buscar exames da lista já carregada (this.examesSistema)
            const examesDoGrupo = idsExames
              .map((idExame: number) => {
                const exameEncontrado = this.examesSistema.find(
                  (ex: any) => (ex.iD_EXAME || ex.ID_EXAME) === idExame
                );

                if (!exameEncontrado) {
                  return null;
                }

                const exameObj = {
                  id: exameEncontrado.iD_EXAME || exameEncontrado.ID_EXAME,
                  codigo: exameEncontrado.cD_EXAME || exameEncontrado.CD_EXAME || 'N/A',
                  nome: exameEncontrado.dS_EXAME || exameEncontrado.DS_EXAME || 'N/A',
                  material: exameEncontrado.material || exameEncontrado.MATERIAL || 'N/A',
                } as Exame;

                return exameObj;
              })
              .filter((x: any) => x !== null);

            // Buscar DESC_GRUPO_EXAME do grupo mestre com fallback
            const descGrupo = grupo.desC_GRUPO_EXAME || grupo.DESC_GRUPO_EXAME || 'Sem nome';

            // Extrair nome do perfil e responsável de DESC_GRUPO_EXAME
            // Formato: "Nome do Perfil (Responsável)"
            const match = descGrupo.match(/^(.+?)\s*\((.+?)\)$/);
            const nomeGrupo = match ? match[1].trim() : descGrupo;
            const responsavelNome = match ? match[2].trim() : 'N/A';

            return of({
              id: idGrupo,
              nome: nomeGrupo,
              responsavel: responsavelNome,
              exames: examesDoGrupo,
            } as Perfil);
          }),
          catchError((err) => {
            // Retorna um perfil vazio em caso de erro com fallback para nome do grupo
            const descGrupo = grupo.desC_GRUPO_EXAME || grupo.DESC_GRUPO_EXAME || 'Sem nome';

            // Extrair nome do perfil e responsável de DESC_GRUPO_EXAME
            const match = descGrupo.match(/^(.+?)\s*\((.+?)\)$/);
            const nomeGrupo = match ? match[1].trim() : descGrupo;
            const responsavelNome = match ? match[2].trim() : 'N/A';

            return of({
              id: idGrupo,
              nome: nomeGrupo,
              responsavel: responsavelNome,
              exames: [],
            } as Perfil);
          })
        );
      });

      // Aguarda TODAS as requisições terminarem
      forkJoin<Perfil[]>(requests).subscribe({
        next: (perfisCarregados: Perfil[]) => {
          // Initialize defaults (permissive until we resolve owner roles)
          this.perfis = perfisCarregados.map(p => ({ ...p, responsavelRole: '', canEdit: undefined as any as boolean | undefined, canDelete: undefined as any as boolean | undefined }));
          this.carregando = false;

          // Fetch usuarios to try to determine responsavel roles by name AND consult UnidadeGrupoMestre as fallback
          this.usuarioService.buscarUsuarios().subscribe({
            next: (usuarios) => {
              const map = new Map<string, string>();
              usuarios.forEach(u => map.set((u.nome || '').toLowerCase().trim(), (u.role || '').toUpperCase()));

              const currentRole = (this.authService.getRole() || '').toUpperCase();

              // For each perfil, try to determine creator role from UnidadeGrupoMestre first, then fallback to name mapping
              this.perfis.forEach(p => {
                // default
                let respRole = '';

                // 1) try UnidadeGrupoMestre -> API returns dados array, we take first with USUARIO_CRIACAO
                this.http.get<any>(`${this.apiUrl}/unidade-grupo-mestre?idGrupo=${p.id}`).subscribe({
                  next: (resUGM) => {
                    const arr = (resUGM.dados || []);
                    const first = arr.find((x: any) => x && (x.USUARIO_CRIACAO || x.usuarioCriacao));
                    const creatorId = first ? (first.USUARIO_CRIACAO || first.usuarioCriacao) : null;

                    if (creatorId) {
                      // fetch user by id to get role
                      this.usuarioService.buscarUsuarioPorId(Number(creatorId)).subscribe({
                        next: (u) => {
                          respRole = (u?.role || '').toUpperCase() || '';
                          p.responsavelRole = respRole;
                          // Apply rule: USERS cannot edit/delete profiles created by ADMIN
                          if (currentRole === 'USER' && respRole === 'ADMIN') {
                            p.canEdit = false;
                            p.canDelete = false;
                          } else {
                            p.canEdit = true;
                            p.canDelete = true;
                          }
                        },
                        error: () => {
                          // fallback to name-mapping below if user fetch fails
                          const respName = (p.responsavel || '').toLowerCase().trim();
                          respRole = map.get(respName) || '';
                          p.responsavelRole = respRole;
                          if (currentRole === 'USER' && respRole === 'ADMIN') {
                            p.canEdit = false;
                            p.canDelete = false;
                          } else {
                            p.canEdit = true;
                            p.canDelete = true;
                          }
                        }
                      });
                    } else {
                      // No creator info in UnidadeGrupoMestre, fallback to name-based mapping
                      const respName = (p.responsavel || '').toLowerCase().trim();
                      respRole = map.get(respName) || '';
                      p.responsavelRole = respRole;
                      if (currentRole === 'USER' && respRole === 'ADMIN') {
                        p.canEdit = false;
                        p.canDelete = false;
                      } else {
                        p.canEdit = true;
                        p.canDelete = true;
                      }
                    }
                  },
                  error: () => {
                    // On error, fallback to name-based mapping
                    const respName = (p.responsavel || '').toLowerCase().trim();
                    respRole = map.get(respName) || '';
                    p.responsavelRole = respRole;
                    if (currentRole === 'USER' && respRole === 'ADMIN') {
                      p.canEdit = false;
                      p.canDelete = false;
                    } else {
                      p.canEdit = true;
                      p.canDelete = true;
                    }
                  }
                });

              });

            },
            error: () => {
              // If we can't determine roles, keep permissive defaults
            }
          });
        },
        error: () => {
          this.erro = 'Erro ao carregar perfis completos.';
          this.carregando = false;
        },
      });
    } catch (err) {
      this.erro = 'Erro ao carregar dados.';
      this.carregando = false;
    }
  }

  // Carrega exames por IDs usando endpoint otimizado (1 requisição única!)
  private async carregarExamesPorIds(ids: number[]): Promise<void> {
    if (ids.length === 0) {
      this.examesSistema = [];
      return;
    }

    const inicio = Date.now();

    try {
      const res = await this.http
        .post<any>(`${this.apiUrl}/exames/buscar-multiplos`, { ids })
        .toPromise();

      if (res.sucesso && res.dados) {
        this.examesSistema = res.dados;
      } else {
        this.examesSistema = [];
      }
    } catch (error) {
      this.examesSistema = [];
    }
  }

  // ---------------------------------------------
  // EXPANDIR / RECOLHER
  // ---------------------------------------------
  toggleExames(perfilId: number): void {
    this.examesExpandidos[perfilId] = !this.examesExpandidos[perfilId];
  }

  isExpandido(perfilId: number): boolean {
    return this.examesExpandidos[perfilId] || false;
  }

  // ---------------------------------------------
  // AÇÕES: NOVO / EDITAR / EXCLUIR
  // ---------------------------------------------
  novoPerfil(): void {
    this.router.navigate(['/perfil/novo']);
  }

  editarPerfil(perfil: Perfil): void {
    if (perfil.canEdit === false) {
      alert('Você não tem permissão para editar este perfil.');
      return;
    }
    this.router.navigate(['/perfil/editar', perfil.id]);
  }

  excluirPerfil(perfil: Perfil): void {
    if (perfil.canDelete === false) {
      alert('Você não tem permissão para excluir este perfil.');
      return;
    }

    if (!confirm(`Deseja realmente excluir o perfil "${perfil.nome}"?`)) {
      return;
    }

    this.http.delete(`${this.apiUrl}/grupo-mestre/${perfil.id}`).subscribe({
      next: () => {
        this.perfis = this.perfis.filter((p) => p.id !== perfil.id);
        alert('Perfil excluído com sucesso!');
      },
      error: (err) => {
        alert('Erro ao excluir o perfil.');
      },
    });
  }
}
