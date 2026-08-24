import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Intencao visual do badge — nunca depende SO da cor (acessibilidade). */
export type BadgeClinicoTom = 'neutro' | 'info' | 'sucesso' | 'atencao' | 'perigo';

/**
 * Badge clinico reutilizavel: sempre com icone + texto (nunca so cor), respeitando
 * o tema clinico. Usado para alergias, diabetes, criticidade de exames, etc.
 *
 * Uso:
 *   <pr-badge-clinico tom="perigo" icone="!" texto="Alergias"></pr-badge-clinico>
 */
@Component({
  selector: 'pr-badge-clinico',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pr-badge" [class]="'pr-badge--' + tom" [attr.title]="titulo || texto">
      @if (icone) {
        <span class="pr-badge__icone" aria-hidden="true">{{ icone }}</span>
      }
      <span class="pr-badge__texto">{{ texto }}</span>
    </span>
  `,
  styleUrl: './badge-clinico.scss',
})
export class BadgeClinico {
  /** Texto sempre visivel do badge (obrigatorio — nao codificar informacao so na cor). */
  @Input() texto = '';
  /** Glifo/emoji curto exibido antes do texto. Marcado aria-hidden. */
  @Input() icone: string | null = null;
  /** Tom semantico. */
  @Input() tom: BadgeClinicoTom = 'neutro';
  /** Tooltip opcional (default = texto). */
  @Input() titulo: string | null = null;
}
