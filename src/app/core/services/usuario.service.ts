import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface UsuarioDTO {
  iD_USER?: number;
  id_USER?: number;
  ID_USER?: number;
  nomE_USER?: string;
  nome_USER?: string;
  NOME_USER?: string;
  acesso?: string;
  aCESSO?: string;
  ACESSO?: string;
  email?: string;
  eMAIL?: string;
  EMAIL?: string;
  role?: string;
  rOLE?: string;
  ROLE?: string;
  ativo?: number;
  aTIVO?: number;
  ATIVO?: number;
  idUnidade?: number;
  iD_UNIDADE?: number;
  id_UNIDADE?: number;
  ID_UNIDADE?: number;
}

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: string;
  acesso?: string;
  ativo?: boolean;
  qtdUnidades?: number;
  dataCriacao?: string;
}

export interface UnidadeUsuario {
  idUnidade: number;
  descricao: string;
  unidadePadrao: boolean;
  dataVinculo?: string;
}

export interface UsuarioDetalhes extends Usuario {
  unidades: UnidadeUsuario[];
}

@Injectable({
  providedIn: 'root',
})
export class UsuarioService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Admin endpoints (TBL_USUARIO_UNIDADES)
  buscarUsuariosAdmin(): Observable<Usuario[]> {
    return this.http.get<any>(`${this.apiUrl}/admin/usuarios`).pipe(
      map((response) => {
        const dados = response.dados || [];
        return dados.map((u: any) => ({
          id: u.idUser || u.id,
          nome: u.nome,
          email: u.email,
          role: u.role,
          acesso: u.acesso,
          ativo: u.ativo,
          qtdUnidades: u.qtdUnidades,
          dataCriacao: u.dataCriacao,
        }));
      })
    );
  }

  buscarUsuarioDetalhe(id: number): Observable<UsuarioDetalhes | null> {
    return this.http.get<any>(`${this.apiUrl}/admin/usuarios/${id}`).pipe(
      map((response) => {
        const u = response.dados || response;
        if (!u) return null;
        return {
          id: u.idUser,
          nome: u.nome,
          email: u.email,
          role: u.role,
          acesso: u.acesso,
          ativo: u.ativo,
          unidades: u.unidades || [],
        };
      })
    );
  }

  vincularClinica(idUsuario: number, idUnidade: number, unidadePadrao = false): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/admin/usuarios/${idUsuario}/unidades`, {
      idUnidade,
      unidadePadrao,
    });
  }

  desvincularClinica(idUsuario: number, idUnidade: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/admin/usuarios/${idUsuario}/unidades/${idUnidade}`);
  }

  buscarUsuarioPorId(id: number): Observable<Usuario | null> {
    return this.http.get<any>(`${this.apiUrl}/usuarios/${id}`).pipe(
      map((response) => {
        const usuario = response.dados || response;
        if (!usuario) return null;
        return {
          id: usuario.iD_USER || usuario.ID_USER || id,
          nome: usuario.nomE_USER || usuario.NOME_USER || 'N/A',
          email: usuario.email || '',
          role: usuario.role || usuario.ROLE || '',
        };
      })
    );
  }

  buscarUsuarios(): Observable<Usuario[]> {
    return this.http.get<any>(`${this.apiUrl}/usuarios`).pipe(
      map((response) => {
        const usuarios = response.dados || response || [];
        return usuarios.map((u: UsuarioDTO) => ({
          id: u.iD_USER || u.id_USER || u.ID_USER || 0,
          nome: u.nomE_USER || u.nome_USER || u.NOME_USER || 'N/A',
          email: u.email || u.eMAIL || u.EMAIL || '',
          role: u.role || u.rOLE || u.ROLE || '',
          acesso: u.acesso || u.aCESSO || u.ACESSO || '',
          ativo: u.ativo ?? u.aTIVO ?? u.ATIVO,
        }));
      })
    );
  }

  criarUsuario(usuario: {
    nomeUser: string;
    acesso: string;
    senha: string;
    email: string;
    role: string;
    idUnidade?: number;
  }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/usuarios`, {
      NOME_USER: usuario.nomeUser,
      ACESSO: usuario.acesso,
      PWD: usuario.senha,
      EMAIL: usuario.email,
      ROLE: usuario.role,
      ATIVO: true,
      ID_UNIDADE: usuario.idUnidade || null,
    });
  }

  atualizarUsuario(id: number, usuario: {
    nomeUser?: string;
    acesso?: string;
    email?: string;
    role?: string;
    senha?: string;
    idUnidade?: number;
  }): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/usuarios/${id}`, {
      NOME_USER: usuario.nomeUser,
      ACESSO: usuario.acesso,
      ...(usuario.senha ? { PWD: usuario.senha } : {}),
      EMAIL: usuario.email,
      ROLE: usuario.role,
      ID_UNIDADE: usuario.idUnidade || null,
    });
  }

  deletarUsuario(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/usuarios/${id}`);
  }
}
