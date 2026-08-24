import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Ponto de uma serie do mini-chart.
 * - x: rotulo do eixo (data/hora ou indice); usado no tooltip.
 * - y: valor numerico; null = ponto ausente (quebra a linha).
 */
export interface MiniChartPonto {
  x: string;
  y: number | null;
}

/**
 * Serie do mini-chart (sparkline).
 * - nome: legenda.
 * - cor: sobrescreve a cor padrao (senao herda tokens do tema: 1a serie --pr-primary, 2a --pr-accent).
 * - unidade: sufixo exibido no tooltip (ex 'kg', 'mmHg').
 */
export interface MiniChartSerie {
  nome: string;
  pontos: MiniChartPonto[];
  cor?: string;
  unidade?: string;
}

interface PontoRender {
  cx: number;
  cy: number;
  ponto: MiniChartPonto;
  ultimo: boolean;
}

interface SerieRender {
  nome: string;
  cor: string;
  unidade: string;
  linha: string;
  pontos: PontoRender[];
}

/**
 * Mini-chart SVG inline (sparkline de 1-2 series), SEM biblioteca externa.
 * Herda tokens do tema clinico (.prontuario-theme). Tooltip no hover; ultimo valor destacado.
 * Somente-leitura, sem interacao de edicao. Acessivel (role img + aria-label textual).
 */
@Component({
  selector: 'pr-mini-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mini-chart.html',
  styleUrl: './mini-chart.scss',
})
export class MiniChartComponent {
  /** Series a plotar (1 ou 2). */
  @Input({ required: true })
  set series(valor: MiniChartSerie[]) {
    this._series.set(valor ?? []);
  }
  get series(): MiniChartSerie[] {
    return this._series();
  }
  private readonly _series = signal<MiniChartSerie[]>([]);

  /** Titulo acessivel do grafico. */
  @Input() titulo = 'Grafico';

  /** Altura em px da area de plotagem. */
  @Input() altura = 64;

  private readonly _largura = 320;
  private readonly _padX = 6;
  private readonly _padY = 8;
  private readonly _hover = signal<{ serie: number; ponto: number } | null>(null);

  readonly largura = this._largura;
  get alturaViewBox(): number {
    return this.altura;
  }

  /** Cores padrao herdadas do tema (fallback quando serie.cor ausente). */
  private readonly coresPadrao = ['var(--pr-primary)', 'var(--pr-accent)'];

  /** Existe ao menos um ponto plotavel? */
  readonly temDados = computed(() =>
    this._series().some((s) => s.pontos.some((p) => p.y !== null && p.y !== undefined))
  );

  /** Series prontas para render (coordenadas SVG calculadas). */
  readonly seriesRender = computed<SerieRender[]>(() => {
    const series = this._series();
    const todos = series.flatMap((s) => s.pontos.map((p) => p.y).filter((y): y is number => y !== null && y !== undefined));
    if (todos.length === 0) return [];

    let min = Math.min(...todos);
    let max = Math.max(...todos);
    if (min === max) {
      // serie constante: cria uma folga para nao colapsar a linha no meio
      min -= 1;
      max += 1;
    }

    const w = this._largura;
    const h = this.altura;
    const px = this._padX;
    const py = this._padY;

    const maxLen = Math.max(...series.map((s) => s.pontos.length), 1);
    const escalaX = (i: number): number =>
      maxLen <= 1 ? w / 2 : px + (i * (w - 2 * px)) / (maxLen - 1);
    const escalaY = (y: number): number =>
      h - py - ((y - min) / (max - min)) * (h - 2 * py);

    return series.map((s, si) => {
      const cor = s.cor ?? this.coresPadrao[si % this.coresPadrao.length];
      const pontos: PontoRender[] = [];
      const segmentos: string[] = [];
      let comandoAberto = false;

      s.pontos.forEach((p, i) => {
        if (p.y === null || p.y === undefined) {
          comandoAberto = false;
          return;
        }
        const cx = escalaX(i);
        const cy = escalaY(p.y);
        segmentos.push(`${comandoAberto ? 'L' : 'M'} ${cx.toFixed(2)} ${cy.toFixed(2)}`);
        comandoAberto = true;
        pontos.push({ cx, cy, ponto: p, ultimo: false });
      });

      if (pontos.length > 0) pontos[pontos.length - 1].ultimo = true;

      return {
        nome: s.nome,
        cor,
        unidade: s.unidade ?? '',
        linha: segmentos.join(' '),
        pontos,
      };
    });
  });

  /** Resumo textual para leitores de tela. */
  readonly descricaoAcessivel = computed(() => {
    const series = this._series();
    const partes = series.map((s) => {
      const validos = s.pontos.filter((p) => p.y !== null && p.y !== undefined);
      const ultimo = validos.length ? validos[validos.length - 1] : null;
      return ultimo ? `${s.nome}: ultimo valor ${ultimo.y}${s.unidade ?? ''}` : `${s.nome}: sem dados`;
    });
    return `${this.titulo}. ${partes.join('; ')}.`;
  });

  hoverEm(serie: number, ponto: number): void {
    this._hover.set({ serie, ponto });
  }

  hoverSair(): void {
    this._hover.set(null);
  }

  hoverAtivo(serie: number, ponto: number): boolean {
    const h = this._hover();
    return !!h && h.serie === serie && h.ponto === ponto;
  }

  tooltipTexto(sr: SerieRender, pr: PontoRender): string {
    const valor = pr.ponto.y ?? '';
    return `${sr.nome} ${valor}${sr.unidade} (${pr.ponto.x})`;
  }
}
