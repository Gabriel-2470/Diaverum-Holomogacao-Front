import { Injectable, computed, signal } from '@angular/core';
import { Cabecalho, EstadoSincronizacao, StatusSync } from '../models/prontuario.models';

/**
 * Estado compartilhado do paciente ativo dentro da area de prontuario.
 *
 * O paciente-shell carrega o cabecalho UMA vez (ProntuarioService.obterCabecalho)
 * e popula este servico via `definirCabecalho`. Os componentes de apresentacao
 * (paciente-header, abas, indicador sync-status, etc.) consomem os signals
 * derivados — nunca refazem o GET.
 *
 * Escopo: providido no proprio paciente-shell (ver `providers` do componente),
 * de modo que cada instancia de paciente tenha seu proprio contexto e ele seja
 * descartado ao sair da rota do paciente.
 */
@Injectable()
export class ProntuarioContextoService {
  /** Cabecalho cru (fonte de verdade). Null enquanto carrega ou apos erro. */
  private readonly _cabecalho = signal<Cabecalho | null>(null);
  /** Id do paciente atualmente em contexto (mesmo antes do cabecalho chegar). */
  private readonly _idProntPaciente = signal<number | null>(null);
  /** Se o CPF completo esta revelado (botao "revelar" no header). Reset por paciente. */
  private readonly _cpfRevelado = signal(false);
  /** Estado da ultima sincronizacao do par (fonte, unidade). */
  private readonly _sincronizacao = signal<EstadoSincronizacao>({
    status: null,
    dataUltimaSyncUtc: null,
  });

  readonly cabecalho = this._cabecalho.asReadonly();
  readonly idProntPaciente = this._idProntPaciente.asReadonly();
  /** Alias do id em contexto usado pelas abas (mesmo valor de `idProntPaciente`). */
  readonly idPacienteAtual = this._idProntPaciente.asReadonly();
  readonly cpfRevelado = this._cpfRevelado.asReadonly();
  readonly sincronizacao = this._sincronizacao.asReadonly();

  /**
   * Alias semantico exigido pelo SPEC: o "paciente atual" e o proprio cabecalho.
   * Mantido como signal derivado para leitura direta pelas abas/header.
   */
  readonly pacienteAtual = computed(() => this._cabecalho());

  /** Nome do paciente ou string vazia. */
  readonly nome = computed(() => this._cabecalho()?.nome ?? '');

  /** Ha ao menos uma alergia ativa registrada. */
  readonly temAlergias = computed(() => (this._cabecalho()?.alergiasAtivas ?? 0) > 0);

  /** Quantidade de alergias ativas. */
  readonly alergiasAtivas = computed(() => this._cabecalho()?.alergiasAtivas ?? 0);

  /** Paciente marcado como diabetico no espelho. */
  readonly diabetes = computed(() => this._cabecalho()?.indDiabetes === true);

  /** Idade do paciente (calculada na origem). */
  readonly idade = computed(() => this._cabecalho()?.idade ?? null);

  /** Saude da ultima sincronizacao do par (fonte, unidade): OK | ATENCAO | CRITICO. */
  readonly statusSync = computed(() => this._sincronizacao().status);

  /** Data/hora (ISO) da ultima sincronizacao do espelho. */
  readonly ultimaSyncUtc = computed(() => this._sincronizacao().dataUltimaSyncUtc);

  /** True quando a sync exige atencao/aviso (ATENCAO ou CRITICO) -> banner de atraso. */
  readonly syncEmAlerta = computed(() => {
    const s = this._sincronizacao().status;
    return s === 'ATENCAO' || s === 'CRITICO';
  });

  definirIdPaciente(id: number | null): void {
    this._idProntPaciente.set(id);
  }

  definirCabecalho(cabecalho: Cabecalho | null): void {
    this._cabecalho.set(cabecalho);
    if (cabecalho) {
      this._idProntPaciente.set(cabecalho.idProntPaciente);
      this._sincronizacao.set({
        status: this.normalizarStatus(cabecalho.statusUltimaSync),
        dataUltimaSyncUtc: cabecalho.dataUltimaSyncUtc,
      });
    }
    // Novo paciente sempre entra com o CPF mascarado.
    this._cpfRevelado.set(false);
  }

  /** Alias semantico do SPEC para `definirCabecalho`. */
  definirPacienteAtual(cabecalho: Cabecalho | null): void {
    this.definirCabecalho(cabecalho);
  }

  /** Atualiza somente o estado de sincronizacao (ex.: re-checagem periodica). */
  definirSincronizacao(status: StatusSync, dataUltimaSyncUtc: string | null): void {
    this._sincronizacao.set({ status: this.normalizarStatus(status), dataUltimaSyncUtc });
  }

  alternarCpfRevelado(): void {
    this._cpfRevelado.update((v) => !v);
  }

  limpar(): void {
    this._cabecalho.set(null);
    this._idProntPaciente.set(null);
    this._cpfRevelado.set(false);
    this._sincronizacao.set({ status: null, dataUltimaSyncUtc: null });
  }

  private normalizarStatus(valor: string | null | undefined): StatusSync {
    const v = (valor ?? '').toString().trim().toUpperCase();
    if (v === 'OK' || v === 'ATENCAO' || v === 'CRITICO') {
      return v as StatusSync;
    }
    return null;
  }
}
