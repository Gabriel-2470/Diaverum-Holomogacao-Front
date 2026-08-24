// pages/imprimir-lote/imprimir-lote.ts
//
// IMPRESSÃO EM LOTE de vários prontuários. Rota:
//   /prontuario/imprimir-lote?ids=1,2,3
// (aberta pela barra de seleção da busca de pacientes.)
//
// Para CADA id carrega, em paralelo, as MESMAS seções que ImprimirProntuario
// carrega (mesma estrutura de forkJoin, replicada aqui) e renderiza o DOCUMENTO
// COMPLETO de cada paciente em sequência, com quebra de página entre pacientes.
// V1 imprime TODAS as 17 seções (sem modal de seleção). Erro num paciente →
// aviso no bloco dele e segue os demais. Dispara window.print() quando TODOS
// carregam (SSR-safe).

import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ProntuarioService } from '../../services/prontuario.service';
import {
  AlergiaLeitura,
  Cadastro,
  DocumentoLeitura,
  EventoTimeline,
  Evolucao,
  ExameLeitura,
  Prescricao,
  ProblemaLeitura,
  Resumo,
  SessaoResumo,
} from '../../models/prontuario.models';
import { SECOES_IMPRESSAO } from '../imprimir/imprimir';
import { idadeAnosMeses } from '../../util/idade.util';
import { BuscaEstadoService } from '../../services/busca-estado.service';

/** Bundle completo de um paciente (todas as seções carregadas de uma vez). */
interface DocumentoPaciente {
  id: number;
  /** true quando o cadastro (cabeçalho) falhou — o bloco mostra aviso e os demais seguem. */
  erro: boolean;
  cadastro: Cadastro | null;
  alergias: AlergiaLeitura[];
  problemas: ProblemaLeitura[];
  evolucoes: Evolucao[];
  exames: ExameLeitura[];
  prescricoes: Prescricao[];
  sessoes: SessaoResumo[];
  documentos: DocumentoLeitura[];
  resumo: Resumo | null;
  timeline: EventoTimeline[];
}

@Component({
  selector: 'pr-imprimir-lote',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './imprimir-lote.html',
  styleUrl: './imprimir-lote.scss',
})
export class ImprimirLote implements OnInit {
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly buscaEstado = inject(BuscaEstadoService);
  private readonly prontuario = inject(ProntuarioService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly carregando = signal(true);
  readonly semIds = signal(false);
  readonly documentos = signal<DocumentoPaciente[]>([]);

  emissao = new Date();

  ngOnInit(): void {
    const idsParam = this.rota.snapshot.queryParamMap.get('ids') ?? '';
    const ids = idsParam
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (ids.length === 0) {
      this.semIds.set(true);
      this.carregando.set(false);
      return;
    }

    // Carrega cada paciente em paralelo. Um erro isolado (cadastro) não derruba o lote.
    forkJoin(ids.map((id) => this.carregarPaciente(id))).subscribe({
      next: (docs) => {
        this.documentos.set(docs);
        this.carregando.set(false);
        this.dispararImpressao();
      },
      error: () => {
        // Não deveria ocorrer (cada paciente já tem catchError próprio), mas é defensivo.
        this.carregando.set(false);
      },
    });
  }

  /** Bundle vazio (usado quando o cadastro do paciente falha). */
  private docVazio(id: number, erro: boolean): DocumentoPaciente {
    return {
      id,
      erro,
      cadastro: null,
      alergias: [],
      problemas: [],
      evolucoes: [],
      exames: [],
      prescricoes: [],
      sessoes: [],
      documentos: [],
      resumo: null,
      timeline: [],
    };
  }

  /**
   * Carrega TODAS as seções de um paciente (mesma estrutura do ImprimirProntuario,
   * porém sem seleção de abas — o lote sempre traz o documento completo).
   * Cada seção secundária tem catchError (vazio) para não derrubar o bloco; se o
   * cadastro (cabeçalho) falhar, o forkJoin erra e o paciente vira um bloco de erro.
   */
  private carregarPaciente(id: number): Observable<DocumentoPaciente> {
    return forkJoin({
      cadastro: this.prontuario.obterCadastro(id),
      alergias: this.prontuario.listarAlergias(id).pipe(catchError(() => of([] as AlergiaLeitura[]))),
      problemas: this.prontuario.listarProblemas(id).pipe(catchError(() => of([] as ProblemaLeitura[]))),
      evolucoes: this.prontuario.listarEvolucoes(id, 1).pipe(catchError(() => of([] as Evolucao[]))),
      exames: this.prontuario.listarExames(id).pipe(catchError(() => of([] as ExameLeitura[]))),
      prescricoes: this.prontuario.listarPrescricoes(id).pipe(catchError(() => of([] as Prescricao[]))),
      sessoes: this.prontuario.listarSessoes(id, 1).pipe(catchError(() => of([] as SessaoResumo[]))),
      documentos: this.prontuario.listarDocumentos(id).pipe(catchError(() => of([] as DocumentoLeitura[]))),
      resumo: this.prontuario.obterResumo(id).pipe(catchError(() => of(null as Resumo | null))),
      timeline: this.prontuario
        .obterLinhaDoTempo(id)
        .pipe(
          map((t) => t.itens),
          catchError(() => of([] as EventoTimeline[]))
        ),
    }).pipe(
      map((r) => ({ id, erro: false, ...r }) as DocumentoPaciente),
      catchError(() => of(this.docVazio(id, true)))
    );
  }

  /** Dispara a impressão após o render (só no browser, quando tudo carregou). */
  private dispararImpressao(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.documentos().length === 0) return;
    setTimeout(() => window.print(), 500);
  }

  imprimir(): void {
    if (isPlatformBrowser(this.platformId)) window.print();
  }

  voltar(): void {
    // Volta para a busca com os filtros/ordenação/página de onde o lote saiu.
    this.router.navigate(['/prontuario'], { queryParams: this.buscaEstado.obter() ?? {} });
  }

  // ------------------------------ helpers de exibição (por paciente) ------------------------------

  idade(doc: DocumentoPaciente): string {
    return idadeAnosMeses(doc.cadastro?.dataNascimento ?? null);
  }

  endereco(doc: DocumentoPaciente): string {
    const raw = doc.cadastro?.enderecoJson;
    if (!raw) return '—';
    try {
      const e = JSON.parse(raw);
      const linha = Array.isArray(e?.line) ? e.line.join(', ') : '';
      const partes = [linha, e?.city, e?.state, e?.postalCode].filter((x: string) => !!x);
      return partes.length ? partes.join(' - ') : '—';
    } catch {
      return '—';
    }
  }

  medicacoes(doc: DocumentoPaciente): Prescricao[] {
    return doc.prescricoes.filter((p) => (p.tipo || '').toUpperCase() !== 'DIALISE');
  }

  prescricoesDialise(doc: DocumentoPaciente): Prescricao[] {
    return doc.prescricoes.filter((p) => (p.tipo || '').toUpperCase() === 'DIALISE');
  }

  ultimaSessao(doc: DocumentoPaciente): SessaoResumo | null {
    return doc.sessoes.length ? doc.sessoes[0] : null;
  }

  posologia(i: {
    dose: string | null;
    unidadeDose: string | null;
    via: string | null;
    frequencia: string | null;
  }): string {
    return [i.dose, i.unidadeDose, i.via, i.frequencia].filter((x) => !!x).join(' · ') || '—';
  }

  data(v: string | null | undefined): string {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }

  dataHora(v: string | null | undefined): string {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime())
      ? '—'
      : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  resultadoExame(e: ExameLeitura): string {
    if (e.valorNumerico != null) return `${e.valorNumerico} ${e.unidade ?? ''}`.trim();
    return e.valorTexto || '—';
  }

  rotulo(chave: string): string {
    return SECOES_IMPRESSAO.find((s) => s.chave === chave)?.rotulo ?? chave;
  }
}
