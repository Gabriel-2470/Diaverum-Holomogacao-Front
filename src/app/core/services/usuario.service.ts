import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface UsuarioDTO {
  iD_USER?: number;
  ID_USER?: number;
  nomE_USER?: string;
  NOME_USER?: string;
  email?: string;
}

interface Usuario {
  id: number;
  nome: string;
  email: string;
}

@Injectable({
  providedIn: 'root',
})
export class UsuarioService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Busca usuário por ID
   */
  buscarUsuarioPorId(id: number): Observable<Usuario | null> {
    return this.http.get<any>(`${this.apiUrl}/usuarios/${id}`).pipe(
      map((response) => {
        const usuario = response.dados || response;
        if (!usuario) return null;

        return {
          id: usuario.iD_USER || usuario.ID_USER || id,
          nome: usuario.nomE_USER || usuario.NOME_USER || 'N/A',
          email: usuario.email || '',
        };
      })
    );
  }

  /**
   * Busca todos os usuários
   */
  buscarUsuarios(): Observable<Usuario[]> {
    return this.http.get<any>(`${this.apiUrl}/usuarios`).pipe(
      map((response) => {
        const usuarios = response.dados || response || [];
        return usuarios.map((u: UsuarioDTO) => ({
          id: u.iD_USER || u.ID_USER || 0,
          nome: u.nomE_USER || u.NOME_USER || 'N/A',
          email: u.email || '',
        }));
      })
    );
  }
}
