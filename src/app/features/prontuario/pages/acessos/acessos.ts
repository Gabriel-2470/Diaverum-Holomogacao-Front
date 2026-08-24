// Aba "Acessos" (layout NephroSys pag.10 adaptado): o historico e DERIVADO das
// sessoes (listarSessoes pagina 1 + obterSessao por sessao, com teto), porque o
// acessoTipo so existe no detalhe da sessao. V1 somente leitura.

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { AcessoVascular, SessaoDetalhe } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

/** Linha derivada do historico de acessos. */
interface LinhaAcesso {
  tipo: string;
  ativo: boolean;
  primeiroUso: string | null;
  ultimoUso: string | null;
}

/** Teto de detalhes buscados (1 GET por sessao) para derivar o historico. */
const MAX_DETALHES = 24;

@Component({
  selector: 'pr-acessos',
  standalone: true,
  imports: [CommonModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './acessos.html',
  styleUrl: './acessos.scss',
})
export class AcessosComponent implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);

  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly acessoAtual = signal<string | null>(null);
  readonly linhas = signal<LinhaAcesso[]>([]);

  /** Acessos vasculares vindos do cadastro (rota aditiva da migração). */
  readonly acessosVasculares = signal<AcessoVascular[]>([]);

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

    // Seção nova (cadastro): resiliente — um erro aqui não derruba o bloco
    // derivado das sessões, que já funcionava.
    this.prontuario
      .listarAcessosVasculares(id)
      .pipe(catchError(() => of([] as AcessoVascular[])))
      .subscribe({
        next: (lista) => this.acessosVasculares.set(lista ?? []),
      });

    this.prontuario.listarSessoes(id, 1).subscribe({
      next: (lista) => {
        const sessoes = [...(lista ?? [])]
          .sort((a, b) => this.ts(b.dataSessao) - this.ts(a.dataSessao))
          .slice(0, MAX_DETALHES);
        if (sessoes.length === 0) {
          this.acessoAtual.set(null);
          this.linhas.set([]);
          this.carregando.set(false);
          return;
        }
        forkJoin(
          sessoes.map((s) =>
            this.prontuario.obterSessao(id, s.idSessao).pipe(catchError(() => of(null)))
          )
        ).subscribe({
          next: (detalhes) => {
            this.montar(detalhes);
            this.carregando.set(false);
          },
          error: () => {
            this.erro.set(true);
            this.carregando.set(false);
          },
        });
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  private montar(detalhes: (SessaoDetalhe | null)[]): void {
    const validas = detalhes.filter(
      (d): d is SessaoDetalhe => !!d && (d.acessoTipo ?? '').trim().length > 0
    );
    validas.sort((a, b) => this.ts(b.dataSessao) - this.ts(a.dataSessao));
    const atual = validas.length ? validas[0].acessoTipo!.trim() : null;

    const mapa = new Map<string, { primeiro: string | null; ultimo: string | null }>();
    for (const d of validas) {
      const tipo = d.acessoTipo!.trim();
      const reg = mapa.get(tipo) ?? { primeiro: d.dataSessao, ultimo: d.dataSessao };
      if (this.ts(d.dataSessao) < this.ts(reg.primeiro)) reg.primeiro = d.dataSessao;
      if (this.ts(d.dataSessao) > this.ts(reg.ultimo)) reg.ultimo = d.dataSessao;
      mapa.set(tipo, reg);
    }

    const linhas = Array.from(mapa.entries()).map(([tipo, r]) => ({
      tipo,
      ativo: tipo === atual,
      primeiroUso: r.primeiro,
      ultimoUso: r.ultimo,
    }));
    linhas.sort((a, b) => this.ts(b.ultimoUso) - this.ts(a.ultimoUso));

    this.acessoAtual.set(atual);
    this.linhas.set(linhas);
  }

  private ts(v: string | null | undefined): number {
    if (!v) return 0;
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
}
