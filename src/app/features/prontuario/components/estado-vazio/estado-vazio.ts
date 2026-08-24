import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Estado vazio reutilizavel por qualquer aba/lista do prontuario: um icone grande
 * (glifo/emoji), um titulo e uma descricao de apoio opcional. Conteudo adicional
 * (ex.: um botao "Tentar novamente") pode ser projetado via <ng-content>.
 *
 * Selector `pr-estado-vazio`; export `EstadoVazioComponent` (nome consumido pelas abas).
 */
@Component({
  selector: 'pr-estado-vazio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pr-vazio" role="status">
      <span class="pr-vazio__icone" aria-hidden="true">{{ icone }}</span>
      <p class="pr-vazio__titulo">{{ titulo }}</p>
      @if (descricao) {
        <p class="pr-vazio__descricao">{{ descricao }}</p>
      }
      <div class="pr-vazio__extra">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styleUrl: './estado-vazio.scss',
})
export class EstadoVazioComponent {
  /** Glifo/emoji do icone. */
  @Input() icone = '\u{1F5C2}'; // 🗂
  /** Titulo curto (obrigatorio). */
  @Input() titulo = 'Nada por aqui';
  /** Texto de apoio opcional. */
  @Input() descricao: string | null = null;
}
