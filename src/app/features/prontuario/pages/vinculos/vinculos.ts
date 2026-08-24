// Pagina "Fila de vínculo" (AdminOnly). Registros do espelho ainda nao casados
// com um paciente local aguardam decisao do admin: vincular a um candidato
// sugerido ou marcar como sem correspondencia. Protegida NO PROPRIO componente
// (redireciona à busca se o papel nao for ADMIN) alem do prontuarioGuard da rota.
// SSR-safe (window.confirm guardado por isPlatformBrowser). Null-safe.

import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Params, Router, RouterLink } from '@angular/router';

import { ProntuarioService } from '../../services/prontuario.service';
import { AuthService } from '../../../../core/services/auth.service';
import { BuscaEstadoService } from '../../services/busca-estado.service';
import { VinculoFilaItem } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

@Component({
  selector: 'pr-vinculos',
  standalone: true,
  imports: [CommonModule, RouterLink, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './vinculos.html',
  styleUrl: './vinculos.scss',
})
export class VinculosComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly buscaEstado = inject(BuscaEstadoService);

  /** "Voltar à busca" preservando filtros/ordenação/página da última busca. */
  get paramsVoltarBusca(): Params {
    return this.buscaEstado.obter() ?? {};
  }

  readonly fila = signal<VinculoFilaItem[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);

  /**
   * Aba ativa. "Sem correspondência" NÃO é pendência: significa que o CPF do paciente
   * foi procurado no cadastro operacional (dbo.TBL_PACIENTE) e NINGUÉM lá tem esse CPF
   * — a pessoa só existe no histórico migrado (ex.: óbitos antigos). Nada a fazer.
   * Por isso a fila padrão mostra APENAS o que exige decisão (sem CPF / conflito),
   * e os sem-correspondência ficam em aba separada, só consulta.
   */
  readonly aba = signal<'decisao' | 'sem'>('decisao');

  /** Itens que exigem decisão humana: pendentes (sem CPF) e conflitos. */
  readonly filaDecisao = computed(() =>
    this.fila().filter((i) => this.statusRotulo(i) !== 'Sem correspondência')
  );
  /** Só consulta: CPF não encontrado no cadastro operacional (histórico). */
  readonly filaSem = computed(() =>
    this.fila().filter((i) => this.statusRotulo(i) === 'Sem correspondência')
  );
  /** Itens exibidos conforme a aba. */
  readonly itens = computed(() => (this.aba() === 'decisao' ? this.filaDecisao() : this.filaSem()));

  /** Linha expandida (idProntPaciente) — revela os candidatos. null = nenhuma. */
  readonly expandidoId = signal<number | null>(null);
  /** Candidato local escolhido por item (idProntPaciente -> idPaciente local). */
  readonly selecaoPorItem = signal<Map<number, number>>(new Map());
  /** Item em processamento (vincular / sem-correspondencia). */
  readonly processandoId = signal<number | null>(null);
  readonly erroAcao = signal<string | null>(null);

  ngOnInit(): void {
    // Proteção de papel além do prontuarioGuard: só ADMIN acessa a fila.
    if (this.auth.getRole() !== 'ADMIN') {
      this.router.navigate(['/prontuario']);
      return;
    }
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(false);
    this.erroAcao.set(null);
    this.prontuario.listarFilaVinculo().subscribe({
      next: (lista) => {
        this.fila.set(lista ?? []);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  // --- Status (Pendente sem CPF / Conflito / Sem correspondência) -------------

  /** Rótulo do status. Usa statusMatch (texto/numérico) e, em fallback, os dados. */
  statusRotulo(item: VinculoFilaItem): string {
    const s = String(item.statusMatch ?? '').trim().toUpperCase();
    if (s.includes('CONFLIT')) return 'Conflito';
    if (s.includes('SEM')) return 'Sem correspondência';
    if (s.includes('PEND')) return 'Pendente sem CPF';
    // statusMatch numérico/desconhecido: deduz pelos dados disponíveis.
    if (item.motivoConflito && item.motivoConflito.trim()) return 'Conflito';
    if (!item.cpf || !item.cpf.trim()) return 'Pendente sem CPF';
    return 'Sem correspondência';
  }

  statusClasse(item: VinculoFilaItem): string {
    switch (this.statusRotulo(item)) {
      case 'Conflito':
        return 'vinc-status--conflito';
      case 'Pendente sem CPF':
        return 'vinc-status--pendente';
      default:
        return 'vinc-status--sem';
    }
  }

  // --- Expandir / selecionar candidato ---------------------------------------

  expandido(item: VinculoFilaItem): boolean {
    return this.expandidoId() === item.idProntPaciente;
  }

  alternarExpandir(item: VinculoFilaItem): void {
    this.expandidoId.update((atual) =>
      atual === item.idProntPaciente ? null : item.idProntPaciente
    );
    this.erroAcao.set(null);
  }

  selecionado(item: VinculoFilaItem): number | null {
    return this.selecaoPorItem().get(item.idProntPaciente) ?? null;
  }

  selecionarCandidato(item: VinculoFilaItem, idPaciente: number): void {
    this.selecaoPorItem.update((mapa) => {
      const novo = new Map(mapa);
      novo.set(item.idProntPaciente, idPaciente);
      return novo;
    });
  }

  // --- Ações -----------------------------------------------------------------

  vincular(item: VinculoFilaItem): void {
    const idLocal = this.selecionado(item);
    if (idLocal == null || this.processandoId() != null) return;
    if (!this.confirmar(`Vincular "${item.nome ?? 'paciente'}" ao paciente local selecionado?`)) {
      return;
    }
    this.processandoId.set(item.idProntPaciente);
    this.erroAcao.set(null);
    this.prontuario.vincularPaciente(item.idProntPaciente, idLocal).subscribe({
      next: () => {
        this.processandoId.set(null);
        this.carregar();
      },
      error: (e) => {
        this.processandoId.set(null);
        this.erroAcao.set(this.mensagemErro(e, 'Não foi possível vincular o paciente.'));
      },
    });
  }

  marcarSem(item: VinculoFilaItem): void {
    if (this.processandoId() != null) return;
    if (!this.confirmar(`Marcar "${item.nome ?? 'paciente'}" como SEM correspondência local?`)) {
      return;
    }
    this.processandoId.set(item.idProntPaciente);
    this.erroAcao.set(null);
    this.prontuario.marcarSemCorrespondencia(item.idProntPaciente).subscribe({
      next: () => {
        this.processandoId.set(null);
        this.carregar();
      },
      error: (e) => {
        this.processandoId.set(null);
        this.erroAcao.set(this.mensagemErro(e, 'Não foi possível marcar sem correspondência.'));
      },
    });
  }

  // --- Helpers ---------------------------------------------------------------

  private confirmar(msg: string): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return window.confirm(msg);
  }

  private mensagemErro(e: unknown, padrao: string): string {
    const err = e as {
      error?: { mensagem?: string; erros?: string[]; detail?: string; message?: string };
      message?: string;
    };
    return (
      err?.error?.mensagem ||
      err?.error?.erros?.join?.(', ') ||
      err?.error?.detail ||
      err?.error?.message ||
      err?.message ||
      padrao
    );
  }
}
