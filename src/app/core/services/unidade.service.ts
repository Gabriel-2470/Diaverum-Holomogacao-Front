import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Unidade {
  iD_UNIDADE: number;
  ID_UNIDADE?: number;
  descricao: string;
  DESCRICAO?: string;
}

@Injectable({
  providedIn: 'root',
})
export class UnidadeService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Busca todas as unidades cadastradas
   */
  buscarUnidades(): Observable<Unidade[]> {
    return this.http.get<any>(`${this.apiUrl}/unidade-envio`).pipe(
      map((response) => {
        const dados = response.dados || response || [];

        // Normalizar os nomes das propriedades
        return dados.map((unidade: any) => ({
          iD_UNIDADE: unidade.iD_UNIDADE || unidade.ID_UNIDADE,
          descricao:
            unidade.descricao ||
            unidade.DESCRICAO ||
            `Unidade ${unidade.iD_UNIDADE || unidade.ID_UNIDADE}`,
        }));
      })
    );
  }

  /**
   * Busca uma unidade por ID
   */
  buscarUnidadePorId(id: number): Observable<Unidade> {
    return this.http.get<any>(`${this.apiUrl}/unidade-envio/${id}`).pipe(
      map((unidade: any) => ({
        iD_UNIDADE: unidade.iD_UNIDADE || unidade.ID_UNIDADE,
        descricao:
          unidade.descricao ||
          unidade.DESCRICAO ||
          `Unidade ${unidade.iD_UNIDADE || unidade.ID_UNIDADE}`,
      }))
    );
  }
}
