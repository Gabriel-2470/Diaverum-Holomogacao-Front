import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventoTimeline } from '../../models/prontuario.models';

/** Configuracao visual (icone + cor de token) por tipo de evento da linha do tempo. */
interface EstiloTipo {
  icone: string;
  cor: string;
  rotulo: string;
}

/**
 * Item da linha do tempo: icone + cor por tipo (EVOLUCAO/PRESCRICAO/SESSAO/EXAME/ALERGIA/
 * PROBLEMA/DOCUMENTO), hora, titulo e autor/origem. Expandivel (mostra o resumo).
 * Somente-leitura; nenhuma affordance de edicao.
 */
@Component({
  selector: 'pr-timeline-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeline-item.html',
  styleUrl: './timeline-item.scss',
})
export class TimelineItemComponent {
  @Input({ required: true }) evento!: EventoTimeline;

  /** Quando true, ja inicia expandido. */
  @Input()
  set expandidoInicial(v: boolean) {
    this._expandido.set(!!v);
  }

  private readonly _expandido = signal(false);
  readonly expandido = this._expandido.asReadonly();

  private static readonly ESTILOS: Record<string, EstiloTipo> = {
    EVOLUCAO: { icone: 'E', cor: 'var(--pr-primary)', rotulo: 'Evolucao' },
    PRESCRICAO: { icone: 'P', cor: 'var(--pr-accent)', rotulo: 'Prescricao' },
    SESSAO: { icone: 'S', cor: 'var(--pr-primary)', rotulo: 'Sessao' },
    EXAME: { icone: 'L', cor: '#5b6b9e', rotulo: 'Exame' },
    ALERGIA: { icone: 'A', cor: 'var(--pr-danger)', rotulo: 'Alergia' },
    PROBLEMA: { icone: '!', cor: 'var(--pr-warning)', rotulo: 'Problema' },
    DOCUMENTO: { icone: 'D', cor: '#6b7a82', rotulo: 'Documento' },
  };

  private static readonly PADRAO: EstiloTipo = { icone: '?', cor: 'var(--pr-border)', rotulo: 'Evento' };

  readonly estilo = computed<EstiloTipo>(() => {
    const tipo = (this.evento?.tipo ?? '').toUpperCase();
    return TimelineItemComponent.ESTILOS[tipo] ?? TimelineItemComponent.PADRAO;
  });

  /** Ha conteudo adicional para expandir? */
  get temDetalhe(): boolean {
    return !!(this.evento?.resumo && this.evento.resumo.trim().length > 0);
  }

  /** Hora do evento (HH:mm) a partir de dataHora. */
  get hora(): string {
    const d = this.evento?.dataHora;
    if (!d) return '';
    const data = new Date(d);
    if (isNaN(data.getTime())) return '';
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  alternar(): void {
    if (!this.temDetalhe) return;
    this._expandido.update((v) => !v);
  }
}
