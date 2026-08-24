// Aba "SAE" (Sistematizacao da Assistencia de Enfermagem, NephroSys pag.4).
// Duas sub-abas estruturais — "Diagnostico de Enfermagem" e "Prescricao de
// Enfermagem para HD" — alimentadas pela MESMA fonte (listarSae). Cada linha do
// plano traz diagnostico + prescricao; a sub-aba escolhe qual coluna destacar.
// O aviso "origem ainda nao envia" so aparece quando NAO ha dados.
// V1 somente leitura; SSR-safe (sem window/localStorage). Null-safe.

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { SaePlano } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

/** Sub-aba ativa da pagina de SAE. */
type SubAba = 'diagnostico' | 'prescricao';

@Component({
  selector: 'pr-sae',
  standalone: true,
  imports: [CommonModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './sae.html',
  styleUrl: './sae.scss',
})
export class SaeComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);

  readonly planos = signal<SaePlano[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly subAba = signal<SubAba>('diagnostico');

  /** Ordena por `ordem` asc; empate pela data de inicio mais recente. */
  readonly ordenados = computed<SaePlano[]>(() => {
    const arr = [...this.planos()];
    arr.sort(
      (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || this.ts(b.dataInicio) - this.ts(a.dataInicio)
    );
    return arr;
  });

  /** Vazio => mostra o aviso "origem ainda nao envia" + estado vazio. */
  readonly vazio = computed(() => this.ordenados().length === 0);

  ngOnInit(): void {
    this.carregar();
  }

  definirSubAba(aba: SubAba): void {
    this.subAba.set(aba);
  }

  carregar(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      return;
    }
    this.carregando.set(true);
    this.erro.set(false);
    this.prontuario.listarSae(id).subscribe({
      next: (lista) => {
        this.planos.set(lista ?? []);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  /** "Vigente" quando dataFim e nula; senao "Encerrada". */
  situacao(p: SaePlano): 'Vigente' | 'Encerrada' {
    return p.dataFim ? 'Encerrada' : 'Vigente';
  }

  private ts(v: string | null | undefined): number {
    if (!v) return 0;
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
}
