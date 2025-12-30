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

      const grupos = resGrupo.dados;

      if (grupos.length === 0) {
        this.carregando = false;
        return;
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
          this.perfis = perfisCarregados;
          this.carregando = false;
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
    this.router.navigate(['/perfil/editar', perfil.id]);
  }

  excluirPerfil(perfil: Perfil): void {
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
