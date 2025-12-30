import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface PerfilExame {
  iD_GRUPO_EXAME: number;
  desC_GRUPO_EXAME: string;
  dIA_DO_MES_QUE_OCORRE: number;
  periodicidade: string;
  meS_REFERENCIA: number;
  inD_REG_ATIVO: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PerfilExameService {
  private readonly apiUrl = environment.apiUrl;
  private perfisSubject = new BehaviorSubject<PerfilExame[]>([]);
  public perfis$ = this.perfisSubject.asObservable();

  constructor(private http: HttpClient) {
    this.carregarPerfis();
  }

  /**
   * Busca todos os perfis de exames da API
   */
  carregarPerfis(): void {
    this.http
      .get<any>(`${this.apiUrl}/grupo-mestre`)
      .pipe(
        map((response) => response.dados || response),
        tap((perfis) => this.perfisSubject.next(perfis))
      )
      .subscribe({
        error: (err) => {
          console.error('Erro ao carregar perfis (perfil-exame.service):', err);
          // Não limpar cache existente para evitar perda da visualização em caso de erro temporário
        },
      });
  }

  /**
   * Retorna perfis em cache
   */
  getPerfisLocal(): PerfilExame[] {
    return this.perfisSubject.value;
  }

  /**
   * Busca perfis como Observable
   */
  getPerfis(): Observable<PerfilExame[]> {
    return this.perfis$;
  }

  /**
   * Busca um perfil específico por ID
   */
  buscarPerfilPorId(id: number): Observable<PerfilExame> {
    return this.http
      .get<any>(`${this.apiUrl}/grupo-mestre/${id}`)
      .pipe(map((response) => response.dados || response));
  }

  /**
   * Formata o perfil para exibição
   */
  formatarPerfilParaExibicao(perfil: PerfilExame): { id: number; nome: string; qtdExames: number } {
    return {
      id: perfil.iD_GRUPO_EXAME,
      nome: perfil.desC_GRUPO_EXAME,
      qtdExames: 0, // TODO: Buscar contagem real de exames associados
    };
  }
}
