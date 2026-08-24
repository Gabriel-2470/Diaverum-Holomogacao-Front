import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Blocos cinza pulsantes para estados de carregamento SEM layout shift.
 * Renderiza `linhas` barras; a ultima sai mais curta para simular texto/paragrafo.
 * Puramente decorativo (aria-hidden) — o texto "carregando" fica a cargo do container.
 *
 * Uso:
 *   <pr-skeleton-bloco [linhas]="3" />
 *   <pr-skeleton-bloco largura="180px" altura="14px" [linhas]="1" />
 */
@Component({
  selector: 'pr-skeleton-bloco',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pr-skel" aria-hidden="true">
      @for (l of contagem(); track $index) {
        <span
          class="pr-skel__linha"
          [class.pr-skel__linha--curta]="ultimaCurta && $index === contagem().length - 1 && contagem().length > 1"
          [style.width]="$index === contagem().length - 1 ? null : largura"
          [style.height]="altura"
        ></span>
      }
    </div>
  `,
  styleUrl: './skeleton-bloco.scss',
})
export class SkeletonBlocoComponent {
  private _linhas = 3;

  /** Quantidade de barras. */
  @Input() set linhas(v: number) {
    this._linhas = Math.max(1, Number(v) || 1);
  }
  get linhas(): number {
    return this._linhas;
  }

  /** Largura de cada barra (CSS). */
  @Input() largura = '100%';
  /** Altura de cada barra (CSS). */
  @Input() altura = '12px';
  /** Encurta a ultima barra (aspecto de paragrafo). */
  @Input() ultimaCurta = true;

  contagem(): number[] {
    return Array.from({ length: this._linhas }, (_, i) => i);
  }
}
