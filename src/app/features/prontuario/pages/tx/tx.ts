// Aba "TX" (NephroSys pag.12): dados de transplante / lista de espera vindos da
// migração NephroSys (GET .../transplante — objeto ou null). V1 somente leitura.
// Quando a origem não envia (null), mostra apenas o aviso; nada é inventado.

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { Transplante } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

@Component({
  selector: 'pr-tx',
  standalone: true,
  imports: [CommonModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './tx.html',
  styleUrl: './tx.scss',
})
export class TxComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);

  readonly transplante = signal<Transplante | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal(false);

  ngOnInit(): void {
    this.carregar();
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
    this.prontuario.obterTransplante(id).subscribe({
      next: (t) => {
        this.transplante.set(t);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  /** Rótulo Sim/Não para os indicadores booleanos. */
  simNao(v: boolean | null | undefined): string {
    return v ? 'Sim' : 'Não';
  }
}
