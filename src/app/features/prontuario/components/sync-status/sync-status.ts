import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

/** Saude da ultima sincronizacao vinda do backend. */
export type SyncSaude = 'OK' | 'ATENCAO' | 'CRITICO' | null | undefined;

/**
 * Indicador de sincronizacao: "Sincronizado ha X (data) - origem" com um ponto
 * verde/ambar/vermelho conforme a saude. Nunca comunica so pela cor — sempre ha texto.
 *
 * Consome dados prontos (status + dataUtc + origem); nao faz requisicoes.
 */
@Component({
  selector: 'pr-sync-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pr-sync" [class]="'pr-sync--' + tomClasse()" [attr.title]="tituloAcessivel()">
      <span class="pr-sync__ponto" aria-hidden="true"></span>
      <span class="pr-sync__texto">
        <span class="pr-sync__rotulo">{{ rotulo() }}</span>
        @if (haQuanto()) {
          <span class="pr-sync__ha">h&aacute; {{ haQuanto() }}</span>
        }
        @if (dataFormatada()) {
          <span class="pr-sync__data">({{ dataFormatada() }})</span>
        }
        @if (origem) {
          <span class="pr-sync__origem">&middot; {{ origem }}</span>
        }
      </span>
    </span>
  `,
  styleUrl: './sync-status.scss',
})
export class SyncStatus {
  private readonly _status = signal<SyncSaude>(null);
  private readonly _dataUtc = signal<string | null>(null);

  /** OK | ATENCAO | CRITICO (case-insensitive). */
  @Input() set status(v: SyncSaude) {
    this._status.set(v ?? null);
  }

  /** Data/hora UTC (ISO) da ultima sincronizacao. */
  @Input() set dataUtc(v: string | Date | null | undefined) {
    this._dataUtc.set(v ? (v instanceof Date ? v.toISOString() : v) : null);
  }

  /** Nome do sistema de origem (ex.: "Hygia"). */
  @Input() origem: string | null = null;

  readonly tomClasse = computed(() => {
    switch ((this._status() ?? '').toUpperCase()) {
      case 'OK':
        return 'ok';
      case 'ATENCAO':
        return 'atencao';
      case 'CRITICO':
        return 'critico';
      default:
        return 'desconhecido';
    }
  });

  readonly rotulo = computed(() => {
    switch (this.tomClasse()) {
      case 'ok':
        return 'Sincronizado';
      case 'atencao':
        return 'Sincronização atrasada';
      case 'critico':
        return 'Falha na sincronização';
      default:
        return 'Sincronização desconhecida';
    }
  });

  readonly dataFormatada = computed(() => {
    const iso = this._dataUtc();
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  });

  readonly haQuanto = computed(() => {
    const iso = this._dataUtc();
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return '';
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'menos de 1 min';
    if (min < 60) return `${min} min`;
    const horas = Math.floor(min / 60);
    if (horas < 24) return `${horas} h`;
    const dias = Math.floor(horas / 24);
    return dias === 1 ? '1 dia' : `${dias} dias`;
  });

  readonly tituloAcessivel = computed(() => {
    const partes = [this.rotulo()];
    if (this.haQuanto()) partes.push(`ha ${this.haQuanto()}`);
    if (this.dataFormatada()) partes.push(`(${this.dataFormatada()})`);
    if (this.origem) partes.push(`origem: ${this.origem}`);
    return partes.join(' ');
  });
}
