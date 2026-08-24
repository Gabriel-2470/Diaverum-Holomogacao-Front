// pages/imprimir/imprimir.ts
//
// IMPRESSÃO do prontuário com SELEÇÃO DE ABAS (estilo "Imprimir Prontuário" do
// NephroSys). Rota: /prontuario/paciente/:id/imprimir?abas=identificacao,exames,...
// (aberta pelo modal de impressão do PacienteShell; sem ?abas imprime tudo).
//
// Carrega em paralelo apenas as seções selecionadas, monta um documento único
// (cabeçalho do paciente + seções) e dispara window.print() quando tudo carregar.
// V1 somente leitura — o documento espelha o que as abas exibem.

import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
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
import { idadeAnosMeses } from '../../util/idade.util';

/**
 * Seções imprimíveis (chave = mesma nomenclatura das abas). Espelha, na MESMA
 * ordem e com os MESMOS rótulos, as 17 abas do PacienteShell — o modal de
 * impressão consome esta lista e marca todas por padrão. Abas cujo sistema de
 * origem ainda não envia dados aparecem mesmo assim (estrutura + aviso), na
 * mesma regra já adotada nas telas.
 */
export const SECOES_IMPRESSAO: ReadonlyArray<{ chave: string; rotulo: string }> = [
  { chave: 'identificacao', rotulo: 'Identificação' },
  { chave: 'dados-clinicos', rotulo: 'Dados Clínicos' },
  { chave: 'eventos', rotulo: 'Eventos e Diagn.' },
  { chave: 'sae', rotulo: 'SAE' },
  { chave: 'hc-evolucao', rotulo: 'HC / Evolução' },
  { chave: 'exames', rotulo: 'Exames' },
  { chave: 'medicacoes', rotulo: 'Medicações' },
  { chave: 'sol-exames', rotulo: 'Sol. Exames' },
  { chave: 'laudos', rotulo: 'Laudos' },
  { chave: 'acessos', rotulo: 'Acessos' },
  { chave: 'presc-hd', rotulo: 'Presc. HD/DP' },
  { chave: 'tx', rotulo: 'TX' },
  { chave: 'social', rotulo: 'Social' },
  { chave: 'ver-hd', rotulo: 'Ver HD/DP' },
  { chave: 'imagens', rotulo: 'Imagens' },
  { chave: 'resumo', rotulo: 'Resumo' },
  { chave: 'linha-do-tempo', rotulo: 'Linha do tempo' },
];

@Component({
  selector: 'pr-imprimir',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './imprimir.html',
  styleUrl: './imprimir.scss',
})
export class ImprimirProntuario implements OnInit {
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly prontuario = inject(ProntuarioService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly carregando = signal(true);
  readonly erro = signal(false);

  id = 0;
  selecionadas: string[] = [];
  emissao = new Date();

  cadastro: Cadastro | null = null;
  alergias: AlergiaLeitura[] = [];
  problemas: ProblemaLeitura[] = [];
  evolucoes: Evolucao[] = [];
  exames: ExameLeitura[] = [];
  prescricoes: Prescricao[] = [];
  sessoes: SessaoResumo[] = [];
  documentos: DocumentoLeitura[] = [];
  resumo: Resumo | null = null;
  timeline: EventoTimeline[] = [];

  ngOnInit(): void {
    this.id = Number(this.rota.snapshot.paramMap.get('id') ?? 0);
    const abasParam = this.rota.snapshot.queryParamMap.get('abas');
    const todas = SECOES_IMPRESSAO.map((s) => s.chave);
    this.selecionadas = abasParam
      ? abasParam.split(',').map((s) => s.trim()).filter((s) => todas.includes(s))
      : todas;
    if (this.selecionadas.length === 0) this.selecionadas = todas;

    this.carregar();
  }

  tem(chave: string): boolean {
    return this.selecionadas.includes(chave);
  }

  private carregar(): void {
    // O cadastro sempre entra (cabeçalho do documento). Demais cargas só se selecionadas.
    const precisaPrescricoes = this.tem('medicacoes') || this.tem('presc-hd');
    const precisaSessoes = this.tem('ver-hd') || this.tem('presc-hd');

    // Problemas/CID abastecem TANTO a aba "eventos" quanto (historicamente)
    // a "dados-clinicos"; carrega quando qualquer uma delas está selecionada.
    const precisaProblemas = this.tem('dados-clinicos') || this.tem('eventos');

    forkJoin({
      cadastro: this.prontuario.obterCadastro(this.id),
      alergias: this.tem('dados-clinicos')
        ? this.prontuario.listarAlergias(this.id).pipe(catchError(() => of([] as AlergiaLeitura[])))
        : of([] as AlergiaLeitura[]),
      problemas: precisaProblemas
        ? this.prontuario.listarProblemas(this.id).pipe(catchError(() => of([] as ProblemaLeitura[])))
        : of([] as ProblemaLeitura[]),
      evolucoes: this.tem('hc-evolucao')
        ? this.prontuario.listarEvolucoes(this.id, 1).pipe(catchError(() => of([] as Evolucao[])))
        : of([] as Evolucao[]),
      exames: this.tem('exames')
        ? this.prontuario.listarExames(this.id).pipe(catchError(() => of([] as ExameLeitura[])))
        : of([] as ExameLeitura[]),
      prescricoes: precisaPrescricoes
        ? this.prontuario.listarPrescricoes(this.id).pipe(catchError(() => of([] as Prescricao[])))
        : of([] as Prescricao[]),
      sessoes: precisaSessoes
        ? this.prontuario.listarSessoes(this.id, 1).pipe(catchError(() => of([] as SessaoResumo[])))
        : of([] as SessaoResumo[]),
      documentos: this.tem('laudos')
        ? this.prontuario.listarDocumentos(this.id).pipe(catchError(() => of([] as DocumentoLeitura[])))
        : of([] as DocumentoLeitura[]),
      resumo: this.tem('resumo')
        ? this.prontuario.obterResumo(this.id).pipe(catchError(() => of(null as Resumo | null)))
        : of(null as Resumo | null),
      timeline: this.tem('linha-do-tempo')
        ? this.prontuario
            .obterLinhaDoTempo(this.id)
            .pipe(
              map((t) => t.itens),
              catchError(() => of([] as EventoTimeline[]))
            )
        : of([] as EventoTimeline[]),
    }).subscribe({
      next: (r) => {
        this.cadastro = r.cadastro;
        this.alergias = r.alergias;
        this.problemas = r.problemas;
        this.evolucoes = r.evolucoes;
        this.exames = r.exames;
        this.prescricoes = r.prescricoes;
        this.sessoes = r.sessoes;
        this.documentos = r.documentos;
        this.resumo = r.resumo;
        this.timeline = r.timeline;
        this.carregando.set(false);
        this.dispararImpressao();
      },
      error: () => {
        this.carregando.set(false);
        this.erro.set(true);
      },
    });
  }

  /** Dispara a impressão após o render (só no browser). */
  private dispararImpressao(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => window.print(), 400);
  }

  imprimir(): void {
    if (isPlatformBrowser(this.platformId)) window.print();
  }

  voltar(): void {
    this.router.navigate(['/prontuario', 'paciente', this.id]);
  }

  // ------------------------------ helpers de exibição ------------------------------

  idade(): string {
    return idadeAnosMeses(this.cadastro?.dataNascimento ?? null);
  }

  endereco(): string {
    const raw = this.cadastro?.enderecoJson;
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

  medicacoes(): Prescricao[] {
    return this.prescricoes.filter((p) => (p.tipo || '').toUpperCase() !== 'DIALISE');
  }

  prescricoesDialise(): Prescricao[] {
    return this.prescricoes.filter((p) => (p.tipo || '').toUpperCase() === 'DIALISE');
  }

  ultimaSessao(): SessaoResumo | null {
    return this.sessoes.length ? this.sessoes[0] : null;
  }

  posologia(i: { dose: string | null; unidadeDose: string | null; via: string | null; frequencia: string | null }): string {
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
