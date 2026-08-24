import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ClinicaLaboratorio {
  idLaboratorio: number;
  nomeLab: string;
  tipoIntegracao: string | null;
  indPadrao: boolean;
}

export interface ClinicaDetalhe {
  idUnidade: number;
  descricao: string;
  cnes: string | null;
  // laboratório PADRÃO (resumo)
  idLaboratorio: number | null;
  nomeLab: string | null;
  tipoIntegracao: string | null;
  idMedicoPadrao: number | null;
  nomeMedicoPadrao: string | null;
  // todos os laboratórios vinculados (N:N)
  laboratorios: ClinicaLaboratorio[];
}

export interface Laboratorio {
  id: number;
  nome: string;
  tipoIntegracao: string | null;
}

@Injectable({ providedIn: 'root' })
export class ClinicaService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private mapLab(l: any): ClinicaLaboratorio {
    return {
      idLaboratorio: l.iD_LABORATORIO ?? l.ID_LABORATORIO,
      nomeLab: l.nomE_LAB ?? l.NOME_LAB ?? '',
      tipoIntegracao: l.tipO_INTEGRACAO ?? l.TIPO_INTEGRACAO ?? null,
      indPadrao: l.inD_PADRAO ?? l.IND_PADRAO ?? false,
    };
  }

  listarClinicas(): Observable<ClinicaDetalhe[]> {
    return this.http.get<any>(`${this.apiUrl}/clinicas`).pipe(
      map((r) => {
        const dados = r?.dados ?? r ?? [];
        // normaliza o casing "estranho" da serialização .NET (camelCase)
        return dados.map((c: any) => ({
          idUnidade: c.iD_UNIDADE ?? c.ID_UNIDADE,
          descricao: c.descricao ?? c.DESCRICAO ?? '',
          cnes: c.cliniC_CODE ?? c.cLINIC_CODE ?? c.CLINIC_CODE ?? c.clinic_code ?? null,
          idLaboratorio: c.iD_LABORATORIO ?? c.ID_LABORATORIO ?? null,
          nomeLab: c.nomE_LAB ?? c.NOME_LAB ?? null,
          tipoIntegracao: c.tipO_INTEGRACAO ?? c.TIPO_INTEGRACAO ?? null,
          idMedicoPadrao: c.iD_MEDICO_PADRAO ?? c.ID_MEDICO_PADRAO ?? null,
          nomeMedicoPadrao: c.nomE_MEDICO_PADRAO ?? c.NOME_MEDICO_PADRAO ?? null,
          laboratorios: (c.laboratorios ?? c.LABORATORIOS ?? []).map((l: any) => this.mapLab(l)),
        })) as ClinicaDetalhe[];
      })
    );
  }

  listarLaboratorios(): Observable<Laboratorio[]> {
    return this.http.get<any>(`${this.apiUrl}/laboratorios`).pipe(
      map((r) => {
        const dados = r?.dados ?? r ?? [];
        return dados.map((l: any) => ({
          id: l.iD_LABORATORIO ?? l.ID_LABORATORIO,
          nome: l.nomE_LAB ?? l.NOME_LAB ?? '',
          tipoIntegracao: l.tipO_INTEGRACAO ?? l.TIPO_INTEGRACAO ?? null,
        })) as Laboratorio[];
      })
    );
  }

  /** Vincula (ou atualiza) um laboratório à clínica. indPadrao troca o destino padrão. */
  vincularLaboratorio(idUnidade: number, idLaboratorio: number, indPadrao: boolean): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/clinicas/${idUnidade}/laboratorios`, {
      ID_LABORATORIO: idLaboratorio,
      IND_PADRAO: indPadrao,
    });
  }

  /** Desvincula (soft) um laboratório da clínica. */
  desvincularLaboratorio(idUnidade: number, idLaboratorio: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/clinicas/${idUnidade}/laboratorios/${idLaboratorio}`);
  }
}
