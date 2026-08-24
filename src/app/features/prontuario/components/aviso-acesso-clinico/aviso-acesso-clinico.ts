import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Faixa fina, fixa e permanente da area de prontuario reforcando que os dados sao
 * do sistema de origem, somente-leitura, e que os acessos sao registrados (LGPD).
 *
 * Texto fixo (SPEC) — nao recebe input para evitar variacoes acidentais.
 */
@Component({
  selector: 'pr-aviso-acesso-clinico',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pr-aviso" role="note" aria-live="off">
      <span class="pr-aviso__icone" aria-hidden="true">&#9432;</span>
      <span class="pr-aviso__texto">
        Dados do sistema de origem &mdash; somente leitura. Acessos s&atilde;o registrados (LGPD).
      </span>
    </div>
  `,
  styleUrl: './aviso-acesso-clinico.scss',
})
export class AvisoAcessoClinico {}
