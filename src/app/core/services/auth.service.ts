import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, throwError, of, map } from 'rxjs';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';

// Interfaces
interface User {
  idUser: number;
  nome: string;
  email: string;
  acesso: string;
  role: string;
  idUnidade?: number | null;
}

interface LoginRequest {
  login: string;
  senha: string;
}

interface Unidade {
  idUnidade: number;
  descricao: string;
  unidadePadrao: boolean;
}

interface LoginResponse {
  idUser: number;
  nome: string;
  email: string;
  acesso: string;
  role: string;
  token: string;
  unidades: Unidade[];
  requerSelecaoUnidade: boolean;
}

interface SessionValidationResponse {
  authenticated: boolean;
  user?: {
    id: number;
    login: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private platformId = inject(PLATFORM_ID);
  private sessionChecked = false;

  constructor(private http: HttpClient, private router: Router) {
    if (isPlatformBrowser(this.platformId)) {
      this.loadUserFromStorage();
      this.validateSession().subscribe();
    }
  }

  private loadUserFromStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const userJson = localStorage.getItem('currentUser');
      if (userJson) {
        try {
          const user = JSON.parse(userJson);
          this.currentUserSubject.next(user);
        } catch (e) {
          localStorage.removeItem('currentUser');
        }
      }
    }
  }

  validateSession(): Observable<boolean> {
    if (!isPlatformBrowser(this.platformId)) {
      return of(false);
    }

    // Se já tem um usuário em cache, validar silenciosamente
    const token = localStorage.getItem('token');
    if (!token) {
      return of(false);
    }

    return this.http
      .get<SessionValidationResponse>(`${this.apiUrl}/auth/me`, {
        withCredentials: true,
        headers: this.getAuthHeaders(),
      })
      .pipe(
        map((response) => {
          this.sessionChecked = true;
          if (response.authenticated) {
            return true;
          }
          // Se a resposta disser que não está autenticado, aí sim limpa
          this.clearUserData();
          return false;
        }),
        catchError((error) => {
          this.sessionChecked = true;
          // Se for erro de rede, assume que está ok (não deslogar)
          // Se for 401, aí sim deslogar
          if (error.status === 401) {
            this.clearUserData();
            return of(false);
          }
          // Para outros erros, assume que está logado (mantém a sessão)
          return of(true);
        })
      );
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, credentials).pipe(
      tap((response) => {
        if (isPlatformBrowser(this.platformId)) {
          const idUnidadeRespUser = (response as any).idUnidade ?? (response as any).IdUnidade ?? (response as any).ID_UNIDADE ?? null;

          const userData: User = {
            idUser: response.idUser,
            nome: response.nome,
            email: response.email,
            acesso: response.acesso,
            role: response.role,
            idUnidade: idUnidadeRespUser != null ? Number(idUnidadeRespUser) : null,
          };

          localStorage.setItem('currentUser', JSON.stringify(userData));
          localStorage.setItem('token', response.token); // Salvar token JWT
          this.currentUserSubject.next(userData);
          this.sessionChecked = true;

          // Salvar unidade padrão (backend pode retornar propriedades em PascalCase)
          const unidadesResp = (response as any).unidades ?? (response as any).Unidades ?? [];
          const tokenResp = (response as any).token ?? (response as any).Token ?? null;

          if (tokenResp) {
            localStorage.setItem('token', tokenResp);
          }

          const requerSelecao = (response as any).requerSelecaoUnidade ?? (response as any).RequerSelecaoUnidade ?? false;

          if (Array.isArray(unidadesResp) && unidadesResp.length > 0) {
            try {
              localStorage.setItem('unidadesUsuario', JSON.stringify(unidadesResp));
            } catch (e) {
              console.warn('Não foi possível salvar unidadesUsuario no localStorage', e);
            }
            // Só auto-seleciona se o usuário tem apenas uma clínica
            if (!requerSelecao) {
              const unidadePadrao =
                unidadesResp.find((u: any) => u.unidadePadrao || u.UnidadePadrao) || unidadesResp[0];
              localStorage.setItem('unidadeSelecionada', JSON.stringify(unidadePadrao));
            }
          } else {
            // Fallback: backend may return single user unit in other property names (IdUnidade / ID_UNIDADE)
            const idUnidadeResp = (response as any).idUnidade ?? (response as any).IdUnidade ?? (response as any).ID_UNIDADE ?? (response as any).Id_Unidade ?? null;
            if (idUnidadeResp != null) {
              const unidadeObj = {
                IdUnidade: idUnidadeResp,
                idUnidade: idUnidadeResp,
                iD_UNIDADE: idUnidadeResp,
                Descricao: `Unidade ${idUnidadeResp}`,
                descricao: `Unidade ${idUnidadeResp}`,
                UnidadePadrao: true,
                unidadePadrao: true,
              };

              try {
                localStorage.setItem('unidadeSelecionada', JSON.stringify(unidadeObj));
                localStorage.setItem('unidadesUsuario', JSON.stringify([unidadeObj]));
              } catch (e) {
                console.warn('Não foi possível salvar unidade fallback no localStorage', e);
              }
            }
          }
        }
      }),
      catchError((error: HttpErrorResponse) => {
        return throwError(() => error);
      })
    );
  }

  recuperarSenha(email: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/recuperar-senha`, { email }).pipe(
      catchError((error: HttpErrorResponse) => {
        return throwError(() => error);
      })
    );
  }

  validarToken(token: string): Observable<{ valido: boolean; message?: string }> {
    return this.http
      .get<{ valido: boolean; message?: string }>(`${this.apiUrl}/auth/validar-token/${token}`)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          return throwError(() => error);
        })
      );
  }

  redefinirSenha(token: string, novaSenha: string): Observable<any> {
    return this.http
      .post<any>(`${this.apiUrl}/auth/redefinir-senha`, {
        token,
        novaSenha,
      })
      .pipe(
        catchError((error: HttpErrorResponse) => {
          return throwError(() => error);
        })
      );
  }

  logout(): void {
    this.http
      .post(
        `${this.apiUrl}/auth/logout`,
        {},
        {
          withCredentials: true,
          headers: this.getAuthHeaders(),
        }
      )
      .pipe(catchError(() => of(null)))
      .subscribe({
        complete: () => {
          this.clearUserData();
          this.router.navigate(['/login']);
        },
      });
  }

  // ==========================================
  // MÉTODOS DE VERIFICAÇÃO DE ROLE
  // ==========================================

  isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  isAdmin(): boolean {
    const user = this.currentUserSubject.value;
    return user?.role === 'ADMIN';
  }

  isUser(): boolean {
    const user = this.currentUserSubject.value;
    return user?.role === 'USER';
  }

  hasRole(role: string): boolean {
    const user = this.currentUserSubject.value;
    return user?.role === role;
  }

  /** Permissão de acesso à área clínica de prontuário: ADMIN ou CLINICO. */
  podeAcessarProntuario(): boolean {
    const r = this.getRole();
    return r === 'ADMIN' || r === 'CLINICO';
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  getRole(): string | null {
    return this.currentUserSubject.value?.role || null;
  }

  // ==========================================
  // CLÍNICA ATIVA (contexto) + PERFIL
  // ==========================================

  /** Define a clínica ativa (0 = todas/consolidador) e alinha o currentUser. */
  definirUnidadeAtiva(idUnidade: number, descricao: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const user = this.currentUserSubject.value;
    if (user) {
      const atualizado = { ...user, idUnidade };
      localStorage.setItem('currentUser', JSON.stringify(atualizado));
      this.currentUserSubject.next(atualizado);
    }
    localStorage.setItem(
      'unidadeSelecionada',
      JSON.stringify({ idUnidade, iD_UNIDADE: idUnidade, descricao, Descricao: descricao })
    );
  }

  getUnidadeAtiva(): { id: number | null; nome: string } {
    if (!isPlatformBrowser(this.platformId)) return { id: null, nome: '' };
    const raw = localStorage.getItem('unidadeSelecionada');
    if (raw) {
      try {
        const u = JSON.parse(raw);
        return {
          id: u.idUnidade ?? u.iD_UNIDADE ?? u.ID_UNIDADE ?? null,
          nome: u.descricao ?? u.Descricao ?? u.DESCRICAO ?? '',
        };
      } catch {}
    }
    return { id: this.currentUserSubject.value?.idUnidade ?? null, nome: '' };
  }

  /** Troca a própria senha (Meu Perfil). */
  alterarSenha(senhaAtual: string, novaSenha: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/usuarios/alterar-senha`, {
      SenhaAtual: senhaAtual,
      NovaSenha: novaSenha,
    });
  }

  isSessionChecked(): boolean {
    return this.sessionChecked;
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private getAuthHeaders(): { [header: string]: string } {
    const token = isPlatformBrowser(this.platformId) ? localStorage.getItem('token') : null;

    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  selecionarUnidade(unidade: any): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('unidadeSelecionada', JSON.stringify(unidade));
    }
  }

  hasUnidadeSelecionada(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return !!localStorage.getItem('unidadeSelecionada');
  }

  getUnidadesUsuario(): any[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    try {
      const json = localStorage.getItem('unidadesUsuario');
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  }

  private clearUserData(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('unidadeSelecionada');
      localStorage.removeItem('unidadesUsuario');
      localStorage.removeItem('token');
    }
    this.currentUserSubject.next(null);
    this.sessionChecked = false;
  }
}
