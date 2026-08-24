// Aba "Exames" (layout NephroSys pag.6): lista densa a esquerda + painel
// "Resultado Texto" a direita. Usa ProntuarioService.listarExames como esta.
// V1 somente leitura; SSR-safe (sem window/localStorage).

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { Exame } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

/** Flag normalizada da origem (H alto / L baixo). */
type Flag = 'H' | 'L' | null;

/** Sub-aba ativa da pagina de exames. */
type SubAba = 'lista' | 'flow';

/** Coluna do pivot "Flow de Exames": uma data de coleta. */
interface FlowColuna {
  /** Chave ISO (yyyy-MM-dd) usada no cruzamento. */
  iso: string;
}

/** Celula do pivot (valor + flag) no cruzamento exame x data. */
interface FlowCelula {
  valor: string;
  flag: Flag;
}

/** Linha do pivot: um exame (nome + LOINC) com uma celula por coluna. */
interface FlowLinha {
  chave: string;
  nome: string;
  loinc: string | null;
  celulas: FlowCelula[];
}

@Component({
  selector: 'pr-exames',
  standalone: true,
  imports: [CommonModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './exames.html',
  styleUrl: './exames.scss',
})
export class ExamesComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);

  readonly exames = signal<Exame[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly idSelecionado = signal<number | null>(null);
  readonly subAba = signal<SubAba>('lista');

  /** Ordenados por data de coleta desc (sem data por ultimo). */
  readonly ordenados = computed<Exame[]>(() => {
    const arr = [...this.exames()];
    arr.sort((a, b) => this.ts(b.dataColeta) - this.ts(a.dataColeta));
    return arr;
  });

  /** Exame da linha selecionada (painel "Resultado Texto"). */
  readonly selecionado = computed<Exame | null>(() => {
    const id = this.idSelecionado();
    if (id == null) return null;
    return this.ordenados().find((e) => e.idExame === id) ?? null;
  });

  /** Datas de coleta distintas, ordenadas cronologicamente (colunas do pivot). */
  readonly flowColunas = computed<FlowColuna[]>(() => {
    const isos = new Set<string>();
    for (const e of this.exames()) {
      const iso = this.isoData(e.dataColeta);
      if (iso) isos.add(iso);
    }
    return [...isos].sort().map((iso) => ({ iso }));
  });

  /** Linhas do pivot (exame x data), agrupadas por exame e ordenadas por nome. */
  readonly flowLinhas = computed<FlowLinha[]>(() => {
    const colunas = this.flowColunas();
    const grupos = new Map<string, { nome: string; loinc: string | null }>();
    // celulas[chaveGrupo][iso] = Exame representativo daquele cruzamento.
    const celulas = new Map<string, Map<string, Exame>>();

    for (const e of this.exames()) {
      const iso = this.isoData(e.dataColeta);
      if (!iso) continue;
      const chave = this.chaveGrupo(e);
      if (!grupos.has(chave)) {
        grupos.set(chave, {
          nome: e.nomeExame || e.codigoLocal || e.codigoLoinc || '—',
          loinc: e.codigoLoinc || null,
        });
      }
      let porData = celulas.get(chave);
      if (!porData) {
        porData = new Map<string, Exame>();
        celulas.set(chave, porData);
      }
      porData.set(iso, e);
    }

    const linhas: FlowLinha[] = [];
    for (const [chave, meta] of grupos) {
      const porData = celulas.get(chave);
      const cells = colunas.map<FlowCelula>((col) => {
        const ex = porData?.get(col.iso);
        return ex
          ? { valor: this.valorGrid(ex), flag: this.flag(ex) }
          : { valor: '—', flag: null };
      });
      linhas.push({ chave, nome: meta.nome, loinc: meta.loinc, celulas: cells });
    }
    linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return linhas;
  });

  ngOnInit(): void {
    this.carregar();
  }

  definirSubAba(aba: SubAba): void {
    this.subAba.set(aba);
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
    this.prontuario.listarExames(id).subscribe({
      next: (lista) => {
        this.exames.set(lista ?? []);
        const primeiro = this.ordenados()[0];
        this.idSelecionado.set(primeiro ? primeiro.idExame : null);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  selecionar(e: Exame): void {
    this.idSelecionado.set(e.idExame);
  }

  flag(e: Exame): Flag {
    const f = (e.flagInterpretacao ?? '').trim().toUpperCase();
    if (f === 'H' || f === 'HIGH' || f === 'ALTO') return 'H';
    if (f === 'L' || f === 'LOW' || f === 'BAIXO') return 'L';
    return null;
  }

  /** Resultado curto para a coluna do grid. */
  valorGrid(e: Exame): string {
    if (e.valorNumerico != null) {
      return `${e.valorNumerico}${e.unidade ? ' ' + e.unidade : ''}`;
    }
    const t = (e.valorTexto ?? '').trim();
    if (!t) return '—';
    return t.length > 40 ? t.slice(0, 40) + '…' : t;
  }

  private ts(v: string | null | undefined): number {
    if (!v) return 0;
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  /** Chave de agrupamento de um exame no pivot: LOINC, senao nome/codigo local. */
  private chaveGrupo(e: Exame): string {
    const loinc = (e.codigoLoinc ?? '').trim();
    if (loinc) return `loinc:${loinc.toUpperCase()}`;
    const nome = (e.nomeExame ?? e.codigoLocal ?? '').trim().toUpperCase();
    return `nome:${nome}`;
  }

  /** Normaliza a data de coleta para ISO yyyy-MM-dd (chave de coluna do pivot). */
  private isoData(v: string | null | undefined): string | null {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
