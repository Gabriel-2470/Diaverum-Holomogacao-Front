import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface GrupoExamePerfilExame {
  iD_GRUPO_EXAME: number;
  desC_GRUPO_EXAME: string;
  dIA_DO_MES_QUE_OCORRE?: number;
  periodicidade?: string;
  meS_REFERENCIA?: number;
  inD_REG_ATIVO?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class GruposExamesService {
  private readonly apiUrl = environment.apiUrl;
  private perfisSubject = new BehaviorSubject<GrupoExamePerfilExame[]>([]);
  public perfis$ = this.perfisSubject.asObservable();

  constructor(private http: HttpClient) {
    this.carregarPerfis();
  }

  /**
   * Carrega todos os perfis de exames da API
   */
  carregarPerfis(): void {
    this.http
      .get<any>(`${this.apiUrl}/grupo-mestre`)
      .pipe(
        map((response) => response.dados || response),
        tap((perfis) => {
          this.perfisSubject.next(perfis);
        })
      )
      .subscribe({
        error: (err) => {
          console.error('Erro ao carregar perfis (grupos-exames.service):', err);
          // Manter o cache atual em caso de erro para não perder a visualização
        },
      });
  }

  /**
   * Retorna perfis em cache como Observable
   */
  getPerfis(): Observable<GrupoExamePerfilExame[]> {
    return this.perfis$;
  }

  /**
   * Retorna perfis locais sem fazer nova requisição
   */
  getPerfisLocal(): GrupoExamePerfilExame[] {
    return this.perfisSubject.value;
  }

  /**
   * Busca um perfil específico por ID
   */
  buscarPerfilPorId(id: number): Observable<GrupoExamePerfilExame> {
    return this.http
      .get<any>(`${this.apiUrl}/grupo-mestre/${id}`)
      .pipe(map((response) => response.dados || response));
  }

  /**
   * Busca os exames de um grupo específico
   */
  buscarExamesDoGrupo(idGrupo: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/grupos-exames/${idGrupo}`);
  }

  /**
   * Associa um exame a um grupo
   */
  associarExameAoGrupo(idGrupo: number, idExame: number): Observable<any> {
    const payload = {
      ID_GRUPO_EXAME: idGrupo,
      ID_EXAME: idExame,
    };
    return this.http.post<any>(`${this.apiUrl}/grupos-exames`, payload);
  }

  /**
   * Remove um exame de um grupo
   */
  removerExameDoGrupo(idGrupo: number, idExame: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/grupos-exames/${idGrupo}/${idExame}`);
  }

  /**
   * Formata perfil para exibição
   */
  formatarParaExibicao(perfil: GrupoExamePerfilExame): { id: number; nome: string } {
    return {
      id: perfil.iD_GRUPO_EXAME,
      nome: perfil.desC_GRUPO_EXAME,
    };
  }
}
