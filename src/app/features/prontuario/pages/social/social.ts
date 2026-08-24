// Aba "Social" (estrutura NephroSys pag.13). Preenchida com os dados MIGRADOS do
// legado (pront.TBL_PRONT_PACIENTE.JSON_EXTRA), lidos via ProntuarioService.obterCadastro
// e parseados com seguranca (try/catch) no front. V1 somente leitura; SSR-safe.

import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { Cadastro } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

/** Bloco socioeconomico do JSON_EXTRA (todos string/null; campos podem faltar). */
interface SocialExtra {
  cor?: string | null;
  estCivil?: string | null;
  religiao?: string | null;
  grauInstru?: string | null;
  profissao?: string | null;
  moradia?: string | null;
  tipoMoradia?: string | null;
  saneamento?: string | null;
  renda?: string | null;
  classeSocial?: string | null;
  beneficios?: string | null;
  cras?: string | null;
  unidadeRefSaude?: string | null;
  transporte?: string | null;
}

/** Bloco de nutricao do JSON_EXTRA. */
interface NutricaoExtra {
  apetite?: string | null;
  obsApetite?: string | null;
  restrHidr?: string | null;
  obsNutri?: string | null;
}

/** Bloco de habitos do JSON_EXTRA (0 -> Nega, 1 -> Sim). */
interface HabitosExtra {
  tabagismo?: string | null;
  etilismo?: string | null;
  drogadicao?: string | null;
}

/** Estrutura completa do JSON_EXTRA (migracao NephroSys). */
interface JsonExtra {
  convenio?: string | null;
  plano?: string | null;
  locdial?: string | null;
  tipoOriginal?: string | null;
  social?: SocialExtra | null;
  nutricao?: NutricaoExtra | null;
  habitos?: HabitosExtra | null;
  observacoes?: string | null;
  pendenciaHd?: string | null;
}

@Component({
  selector: 'pr-social',
  standalone: true,
  imports: [EstadoVazioComponent, SkeletonComponent],
  templateUrl: './social.html',
  styleUrl: './social.scss',
})
export class SocialComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);

  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly cadastro = signal<Cadastro | null>(null);

  /** Parse seguro do JSON_EXTRA (null quando ausente/invalido). */
  readonly extra = computed<JsonExtra | null>(() =>
    this.parseExtra(this.cadastro()?.jsonExtra ?? null)
  );
  readonly social = computed<SocialExtra | null>(() => this.extra()?.social ?? null);
  readonly nutricao = computed<NutricaoExtra | null>(() => this.extra()?.nutricao ?? null);
  readonly habitos = computed<HabitosExtra | null>(() => this.extra()?.habitos ?? null);

  /** Sem nenhum bloco util no espelho -> mostra o aviso "origem nao envia". */
  readonly semDados = computed(() => {
    const e = this.extra();
    return (
      !e ||
      (!e.social && !e.nutricao && !e.habitos && !e.observacoes && !e.pendenciaHd)
    );
  });

  ngOnInit(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      return;
    }
    this.prontuario.obterCadastro(id).subscribe({
      next: (c) => {
        this.cadastro.set(c);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  /** Valor null-safe: valor bruto ou "—". */
  val(v: string | null | undefined): string {
    return v == null || String(v).trim() === '' ? '—' : String(v);
  }

  /** Habito: '0' -> "Nega", '1' -> "Sim", outro -> valor bruto, ausente -> "—". */
  habito(v: string | null | undefined): string {
    if (v == null || String(v).trim() === '') return '—';
    const s = String(v).trim();
    if (s === '0') return 'Nega';
    if (s === '1') return 'Sim';
    return s;
  }

  private parseExtra(raw: string | null): JsonExtra | null {
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? (obj as JsonExtra) : null;
    } catch {
      return null;
    }
  }
}
