import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { Resumo, SessaoResumo } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';
import { MiniChartComponent, MiniChartSerie } from '../../components/mini-chart/mini-chart';

/** Evento curto derivado do resumo para o cartao "ultimos eventos". */
interface EventoResumo {
  tipo: string;
  cor: string;
  titulo: string;
  data: Date | null;
}

@Component({
  selector: 'pr-resumo',
  standalone: true,
  imports: [CommonModule, RouterLink, EstadoVazioComponent, SkeletonComponent, MiniChartComponent],
  templateUrl: './resumo.html',
  styleUrl: './resumo.scss',
})
export class ResumoComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);

  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly resumo = signal<Resumo | null>(null);
  private readonly sessoes = signal<SessaoResumo[]>([]);

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

    forkJoin({
      resumo: this.prontuario.obterResumo(id).pipe(catchError(() => of(null))),
      // ultimas sessoes p/ o mini-chart (ordem cronologica reversa da API)
      sessoes: this.prontuario.listarSessoes(id, 1).pipe(catchError(() => of([] as SessaoResumo[]))),
    }).subscribe({
      next: ({ resumo, sessoes }) => {
        if (resumo == null) {
          this.erro.set(true);
        } else {
          this.resumo.set(resumo);
          this.sessoes.set(sessoes ?? []);
        }
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  // ---- Ultimos eventos (5) ----
  readonly ultimosEventos = computed<EventoResumo[]>(() => {
    const r = this.resumo();
    if (!r) return [];
    const eventos: EventoResumo[] = [];

    if (r.ultimaSessao?.dataSessao) {
      eventos.push({
        tipo: 'Sessao',
        cor: 'var(--pr-primary)',
        titulo: 'Sessao de hemodialise',
        data: this.paraData(r.ultimaSessao.dataSessao),
      });
    }
    if (r.prescricaoVigente?.dataPrescricao) {
      eventos.push({
        tipo: 'Prescricao',
        cor: 'var(--pr-accent)',
        titulo: r.prescricaoVigente.tipo || 'Prescricao vigente',
        data: this.paraData(r.prescricaoVigente.dataPrescricao),
      });
    }
    for (const p of r.problemasAtivos ?? []) {
      eventos.push({
        tipo: 'Problema',
        cor: 'var(--pr-warning)',
        titulo: `${p.cid10 ?? ''} ${p.descricao ?? ''}`.trim() || 'Problema ativo',
        data: null,
      });
    }
    for (const a of r.alergias ?? []) {
      eventos.push({
        tipo: 'Alergia',
        cor: 'var(--pr-danger)',
        titulo: a.substancia || 'Alergia',
        data: null,
      });
    }

    // eventos com data primeiro (desc), depois os sem data
    return eventos
      .sort((x, y) => (y.data?.getTime() ?? -Infinity) - (x.data?.getTime() ?? -Infinity))
      .slice(0, 5);
  });

  // ---- Mini-chart: peso pre/pos e PA das ultimas sessoes ----
  readonly seriesPeso = computed<MiniChartSerie[]>(() => {
    const ordenadas = this.sessoesOrdenadas();
    if (ordenadas.length === 0) return [];
    return [
      {
        nome: 'Peso pre',
        unidade: 'kg',
        pontos: ordenadas.map((s) => ({ x: this.rotuloData(s.dataSessao), y: this.numero(s.pesoPre) })),
      },
      {
        nome: 'Peso pos',
        unidade: 'kg',
        pontos: ordenadas.map((s) => ({ x: this.rotuloData(s.dataSessao), y: this.numero(s.pesoPos) })),
      },
    ];
  });

  readonly temGraficoPeso = computed(() =>
    this.seriesPeso().some((s) => s.pontos.some((p) => p.y !== null))
  );

  /** Sessoes em ordem cronologica crescente (a API devolve desc), ultimas 8. */
  private sessoesOrdenadas(): SessaoResumo[] {
    const arr = [...this.sessoes()];
    arr.sort((a, b) => (this.paraData(a.dataSessao)?.getTime() ?? 0) - (this.paraData(b.dataSessao)?.getTime() ?? 0));
    return arr.slice(-8);
  }

  // ---- helpers ----
  private numero(v: number | null | undefined): number | null {
    return v === null || v === undefined ? null : Number(v);
  }

  private paraData(v: string | Date | null | undefined): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  private rotuloData(v: string | Date | null | undefined): string {
    const d = this.paraData(v);
    return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-';
  }

  formatarData(v: string | Date | null | undefined): string {
    const d = this.paraData(v);
    return d ? d.toLocaleDateString('pt-BR') : '-';
  }
}
