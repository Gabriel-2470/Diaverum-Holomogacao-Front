import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { SkeletonBlocoComponent } from '../skeleton-bloco/skeleton-bloco';

/**
 * Alias fino de <pr-skeleton-bloco> exposto como <pr-skeleton> / SkeletonComponent.
 * Existe porque outras abas (ex.: resumo) ja consomem `pr-skeleton` com `[linhas]`.
 * Mantem uma unica implementacao visual (skeleton-bloco) e evita divergencia.
 */
@Component({
  selector: 'pr-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkeletonBlocoComponent],
  template: `<pr-skeleton-bloco [linhas]="linhas" [largura]="largura" [altura]="altura" />`,
})
export class SkeletonComponent {
  /** Quantidade de barras. */
  @Input() linhas = 3;
  /** Largura de cada barra (CSS). */
  @Input() largura = '100%';
  /** Altura de cada barra (CSS). */
  @Input() altura = '12px';
}
