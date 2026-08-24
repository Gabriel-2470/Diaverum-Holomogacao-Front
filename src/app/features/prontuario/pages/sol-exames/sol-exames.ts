// Aba "Sol. Exames" (NephroSys pag.8): solicitações de exame vindas da migração
// NephroSys (GET .../sol-exames). V1 somente leitura. A tabela é agrupada por
// competência; o aviso "origem não envia" só aparece quando não há registros.

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { SolExame } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

/** Solicitações de uma mesma competência (mês de referência). */
interface GrupoSolExame {
  competencia: string;
  chaveOrdenacao: string;
  itens: SolExame[];
}

@Component({
  selector: 'pr-sol-exames',
  standalone: true,
  imports: [CommonModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './sol-exames.html',
  styleUrl: './sol-exames.scss',
})
export class SolExamesComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);

  readonly solExames = signal<SolExame[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);

  /** Solicitações agrupadas por competência, mais recentes primeiro. */
  readonly grupos = computed<GrupoSolExame[]>(() => {
    const mapa = new Map<string, GrupoSolExame>();
    for (const e of this.solExames()) {
      const { rotulo, chave } = this.normalizarCompetencia(e.competencia);
      const g = mapa.get(chave) ?? { competencia: rotulo, chaveOrdenacao: chave, itens: [] };
      g.itens.push(e);
      mapa.set(chave, g);
    }
    return Array.from(mapa.values()).sort((a, b) =>
      b.chaveOrdenacao.localeCompare(a.chaveOrdenacao)
    );
  });

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      return;
    }
    this.carregando.set(true);
    this.erro.set(false);
    this.prontuario.listarSolExames(id).subscribe({
      next: (lista) => {
        this.solExames.set(lista ?? []);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  /** Normaliza 'YYYY/MM' ou 'YYYYMM' para rótulo 'YYYY/MM' + chave 'YYYYMM'. */
  private normalizarCompetencia(c: string | null): { rotulo: string; chave: string } {
    const raw = (c ?? '').trim();
    if (!raw) return { rotulo: 'Sem competência', chave: '000000' };
    const digitos = raw.replace(/\D/g, '');
    if (digitos.length >= 6) {
      const ano = digitos.slice(0, 4);
      const mes = digitos.slice(4, 6);
      return { rotulo: `${ano}/${mes}`, chave: `${ano}${mes}` };
    }
    return { rotulo: raw, chave: raw };
  }
}
