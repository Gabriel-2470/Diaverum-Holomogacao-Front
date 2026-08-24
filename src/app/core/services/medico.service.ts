import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Medico {
  iD_MEDICO: number;
  nome: string;
  cpf: string;
  crm?: string;
  uF_CRM?: string;
  inD_ATIVO: boolean;
  datA_CADASTRO?: string;
  inD_PADRAO?: boolean; // presente quando listado dentro de uma unidade
}

export interface MedicoInput {
  ID_MEDICO?: number;
  NOME: string;
  CPF: string;
  CRM?: string;
  UF_CRM?: string;
  IND_ATIVO: boolean;
}

@Injectable({ providedIn: 'root' })
export class MedicoService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  listar(somenteAtivos = true): Observable<Medico[]> {
    const params = new HttpParams().set('somenteAtivos', somenteAtivos);
    return this.http
      .get<any>(`${this.apiUrl}/medicos`, { params })
      .pipe(map((r) => r.dados || r));
  }

  buscarPorId(id: number): Observable<Medico> {
    return this.http.get<any>(`${this.apiUrl}/medicos/${id}`).pipe(map((r) => r.dados || r));
  }

  criar(dto: MedicoInput): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/medicos`, dto);
  }

  atualizar(id: number, dto: MedicoInput): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/medicos/${id}`, dto);
  }

  desativar(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/medicos/${id}`);
  }

  // ---- vínculo médico <-> unidade ----

  listarPorUnidade(idUnidade: number): Observable<Medico[]> {
    return this.http
      .get<any>(`${this.apiUrl}/unidade-medico/${idUnidade}`)
      .pipe(map((r) => r.dados || r));
  }

  buscarPadraoUnidade(idUnidade: number): Observable<Medico> {
    return this.http
      .get<any>(`${this.apiUrl}/unidade-medico/${idUnidade}/padrao`)
      .pipe(map((r) => r.dados || r));
  }

  vincularUnidade(idUnidade: number, idMedico: number, indPadrao: boolean): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/unidade-medico`, {
      ID_UNIDADE: idUnidade,
      ID_MEDICO: idMedico,
      IND_PADRAO: indPadrao,
    });
  }

  desvincularUnidade(idUnidade: number, idMedico: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/unidade-medico/${idUnidade}/${idMedico}`);
  }
}
