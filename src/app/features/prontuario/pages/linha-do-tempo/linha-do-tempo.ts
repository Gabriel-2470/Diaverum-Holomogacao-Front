import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ProntuarioService, TimelinePagina } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { EventoTimeline } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';
import { TimelineItemComponent } from '../../components/timeline-item/timeline-item';

/** Grupo de eventos de um mesmo dia. */
interface GrupoDia {
  chave: string;
  rotulo: string;
  eventos: EventoTimeline[];
}

/** Chip de filtro por tipo de evento. */
interface ChipTipo {
  valor: string;
  rotulo: string;
}

@Component({
  selector: 'pr-linha-do-tempo',
  standalone: true,
  imports: [CommonModule, FormsModule, EstadoVazioComponent, SkeletonComponent, TimelineItemComponent],
  templateUrl: './linha-do-tempo.html',
  styleUrl: './linha-do-tempo.scss',
})
export class LinhaDoTempoComponent implements OnInit, OnDestroy {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destruir$ = new Subject<void>();

  readonly chips: ChipTipo[] = [
    { valor: 'EVOLUCAO', rotulo: 'Evolucoes' },
    { valor: 'PRESCRICAO', rotulo: 'Prescricoes' },
    { valor: 'SESSAO', rotulo: 'Sessoes' },
    { valor: 'EXAME', rotulo: 'Exames' },
    { valor: 'ALERGIA', rotulo: 'Alergias' },
    { valor: 'PROBLEMA', rotulo: 'Problemas' },
    { valor: 'DOCUMENTO', rotulo: 'Documentos' },
  ];

  // estado dos filtros (espelhado em queryParams)
  readonly tiposSelecionados = signal<Set<string>>(new Set());
  readonly de = signal<string>('');
  readonly ate = signal<string>('');

  readonly eventos = signal<EventoTimeline[]>([]);
  readonly carregando = signal(true);
  readonly carregandoMais = signal(false);
  readonly erro = signal(false);
  private readonly cursor = signal<string | null>(null);
  readonly temMais = signal(false);

  readonly grupos = computed<GrupoDia[]>(() => this.agrupar(this.eventos()));
  readonly temFiltro = computed(() => this.tiposSelecionados().size > 0 || !!this.de() || !!this.ate());

  ngOnInit(): void {
    // le filtros iniciais dos queryParams (deep-linkable)
    this.route.queryParamMap.pipe(takeUntil(this.destruir$)).subscribe((params) => {
      const tipos = params.get('tipos');
      this.tiposSelecionados.set(new Set(tipos ? tipos.split(',').filter(Boolean) : []));
      this.de.set(params.get('de') ?? '');
      this.ate.set(params.get('ate') ?? '');
      this.recarregar();
    });
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  alternarTipo(valor: string): void {
    const atual = new Set(this.tiposSelecionados());
    if (atual.has(valor)) {
      atual.delete(valor);
    } else {
      atual.add(valor);
    }
    this.aplicarNaUrl({ tipos: Array.from(atual) });
  }

  tipoAtivo(valor: string): boolean {
    return this.tiposSelecionados().has(valor);
  }

  aplicarIntervalo(): void {
    this.aplicarNaUrl({});
  }

  limparFiltros(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tipos: null, de: null, ate: null },
      queryParamsHandling: 'merge',
    });
  }

  /** Escreve o estado atual (mais overrides) nos queryParams; o subscribe recarrega. */
  private aplicarNaUrl(over: { tipos?: string[] }): void {
    const tipos = (over.tipos ?? Array.from(this.tiposSelecionados())).join(',');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tipos: tipos || null,
        de: this.de() || null,
        ate: this.ate() || null,
      },
      queryParamsHandling: 'merge',
    });
  }

  private recarregar(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      return;
    }
    this.carregando.set(true);
    this.erro.set(false);
    this.cursor.set(null);
    this.eventos.set([]);
    this.buscar(id, false);
  }

  carregarMais(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null || this.carregandoMais() || !this.temMais()) return;
    this.buscar(id, true);
  }

  private buscar(id: number, anexar: boolean): void {
    if (anexar) {
      this.carregandoMais.set(true);
    }
    const tipos = Array.from(this.tiposSelecionados());
    this.prontuario
      .obterLinhaDoTempo(id, {
        tipos: tipos.length ? tipos : undefined,
        de: this.de() || undefined,
        ate: this.ate() || undefined,
        cursor: anexar ? this.cursor() ?? undefined : undefined,
      })
      .subscribe({
        next: (pagina: TimelinePagina) => {
          const itens = pagina.itens ?? [];
          this.eventos.update((prev) => (anexar ? [...prev, ...itens] : itens));
          this.temMais.set(!!pagina.temMais);
          this.cursor.set(pagina.proximoCursor ?? null);
          this.carregando.set(false);
          this.carregandoMais.set(false);
        },
        error: () => {
          this.erro.set(!anexar);
          this.carregando.set(false);
          this.carregandoMais.set(false);
        },
      });
  }

  // ---- agrupamento por dia ----
  private agrupar(eventos: EventoTimeline[]): GrupoDia[] {
    const mapa = new Map<string, GrupoDia>();
    for (const ev of eventos) {
      const d = ev.dataHora ? new Date(ev.dataHora) : null;
      const chave = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : 'sem-data';
      if (!mapa.has(chave)) {
        mapa.set(chave, { chave, rotulo: this.rotuloDia(d), eventos: [] });
      }
      mapa.get(chave)!.eventos.push(ev);
    }
    // a API ja devolve DESC; preservamos a ordem de insercao dos grupos
    return Array.from(mapa.values());
  }

  private rotuloDia(d: Date | null): string {
    if (!d || isNaN(d.getTime())) return 'Sem data';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  onDeChange(v: string): void {
    this.de.set(v);
  }
  onAteChange(v: string): void {
    this.ate.set(v);
  }
}
