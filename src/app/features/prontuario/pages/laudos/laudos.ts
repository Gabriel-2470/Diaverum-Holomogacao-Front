// Aba "Laudos" (NephroSys pag.9, adaptada a leitura): lista de documentos à
// esquerda + detalhe do selecionado à direita, com botão Baixar. Usa
// listarDocumentos + urlDownloadDocumento.
//
// Etapa 5 (prontuário como sistema de registro): quando o usuário está logado com
// papel de escrita (isLoggedIn && podeAcessarProntuario), a aba ganha escrita
// NATIVA de DOCUMENTOS/LAUDOS — UPLOAD (arquivo + metadados, multipart) e
// cancelamento lógico. No fluxo anônimo (hyperlink RM = consulta) nada de escrita
// aparece (podeEscrever === false). SSR-safe.

import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { AuthService } from '../../../../core/services/auth.service';
import { DocumentoLeitura } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

const TIPO_DOCUMENTO = ['LAUDO', 'EXAME_IMAGEM', 'RECEITA', 'OUTRO'];
const TITULO_MIN = 2;
const MOTIVO_MIN = 5;

@Component({
  selector: 'pr-laudos',
  standalone: true,
  imports: [CommonModule, FormsModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './laudos.html',
  styleUrl: './laudos.scss',
})
export class Laudos implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly documentos = signal<DocumentoLeitura[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly idSelecionado = signal<number | null>(null);

  /** Toggle "Ver canceladas" — recarrega os documentos com verCanceladas. */
  readonly verCanceladas = signal(false);

  /**
   * Escrita nativa habilitada SÓ para autenticado com papel de escrita. No fluxo
   * anônimo (hyperlink RM) fica false → todos os controles de escrita invisíveis.
   */
  readonly podeEscrever = computed(
    () => this.auth.isLoggedIn() && this.auth.podeAcessarProntuario()
  );

  // --- Form: novo documento (arquivo + metadados) ----------------------------
  readonly novoAberto = signal(false);
  readonly salvando = signal(false);
  readonly erroSalvar = signal<string | null>(null);

  /** Arquivo escolhido no <input type=file> (null enquanto nada selecionado). */
  readonly arquivoSelecionado = signal<File | null>(null);
  novoTipo = 'LAUDO';
  novoTitulo = '';
  novoData = '';

  /** MIMEs aceitos no seletor de arquivo. */
  readonly accept = '.pdf,.png,.jpg,.jpeg';

  // --- Ação: cancelar (inline por documento) ---------------------------------
  /** id do documento com ação aberta; null = nenhuma. */
  readonly acaoAbertaId = signal<number | null>(null);
  readonly processandoAcao = signal(false);
  readonly erroAcao = signal<string | null>(null);
  acaoMotivo = '';

  readonly tipoOpcoes = TIPO_DOCUMENTO;
  readonly TITULO_MIN = TITULO_MIN;
  readonly MOTIVO_MIN = MOTIVO_MIN;

  private idPaciente = 0;

  readonly selecionado = computed<DocumentoLeitura | null>(() => {
    const id = this.idSelecionado();
    return id == null ? null : this.documentos().find((d) => d.idDocumento === id) ?? null;
  });

  ngOnInit(): void {
    const id = this.contexto.idPacienteAtual();
    if (id == null) {
      this.erro.set(true);
      this.carregando.set(false);
      return;
    }
    this.idPaciente = id;
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(false);
    this.prontuario.listarDocumentos(this.idPaciente, this.verCanceladas()).subscribe({
      next: (lista) => {
        const itens = lista ?? [];
        this.documentos.set(itens);
        // Preserva a seleção se ainda existir; senão cai no primeiro.
        const atual = this.idSelecionado();
        const existe = atual != null && itens.some((d) => d.idDocumento === atual);
        this.idSelecionado.set(existe ? atual : itens[0]?.idDocumento ?? null);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  alternarCanceladas(): void {
    this.verCanceladas.update((v) => !v);
    this.carregar();
  }

  selecionar(d: DocumentoLeitura): void {
    this.idSelecionado.set(d.idDocumento);
  }

  urlDownload(d: DocumentoLeitura): string {
    return this.prontuario.urlDownloadDocumento(this.idPaciente, d.idDocumento);
  }

  tamanhoKb(bytes: number | null): string {
    if (bytes == null) return '—';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  // ---------------------------------------------------------------------------
  // ESCRITA nativa de documento (Etapa 5) — upload + cancelamento. Só logado.
  // ---------------------------------------------------------------------------

  abrirNovo(): void {
    this.arquivoSelecionado.set(null);
    this.novoTipo = 'LAUDO';
    this.novoTitulo = '';
    this.novoData = '';
    this.erroSalvar.set(null);
    this.novoAberto.set(true);
  }

  cancelarNovo(): void {
    this.novoAberto.set(false);
    this.erroSalvar.set(null);
  }

  /** (change) do <input type=file>: guarda o arquivo e pré-preenche o título. */
  onArquivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const arquivo = input.files && input.files.length > 0 ? input.files[0] : null;
    this.arquivoSelecionado.set(arquivo);
    if (arquivo && this.novoTitulo.trim().length === 0) {
      this.novoTitulo = arquivo.name;
    }
  }

  get tituloValido(): boolean {
    return this.novoTitulo.trim().length >= TITULO_MIN;
  }

  get novoValido(): boolean {
    return this.arquivoSelecionado() != null && this.tituloValido;
  }

  salvarNovo(): void {
    const arquivo = this.arquivoSelecionado();
    if (!this.novoValido || arquivo == null || this.salvando()) return;
    this.salvando.set(true);
    this.erroSalvar.set(null);
    this.prontuario
      .criarDocumento(this.idPaciente, arquivo, {
        tipo: this.novoTipo,
        titulo: this.novoTitulo.trim(),
        dataDocumento: this.novoData || null,
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.novoAberto.set(false);
          this.carregar();
        },
        error: (e) => {
          this.salvando.set(false);
          this.erroSalvar.set(this.mensagemErro(e, 'Não foi possível enviar o documento.'));
        },
      });
  }

  // --- Cancelar documento ----------------------------------------------------

  /** true se o documento aceita ação de cancelamento (nativo e não cancelado). */
  podeAgir(d: DocumentoLeitura): boolean {
    return this.podeEscrever() && d.ehNativa && !d.cancelado;
  }

  acaoAberta(d: DocumentoLeitura): boolean {
    return this.acaoAbertaId() === d.idDocumento;
  }

  abrirCancelar(d: DocumentoLeitura): void {
    this.acaoAbertaId.set(d.idDocumento);
    this.acaoMotivo = '';
    this.erroAcao.set(null);
  }

  fecharAcao(): void {
    this.acaoAbertaId.set(null);
    this.erroAcao.set(null);
  }

  get acaoMotivoValido(): boolean {
    return this.acaoMotivo.trim().length >= MOTIVO_MIN;
  }

  confirmarCancelar(d: DocumentoLeitura): void {
    if (!this.acaoMotivoValido || this.processandoAcao()) return;
    if (!this.confirmar('Confirmar o cancelamento deste documento? Esta ação é registrada e não pode ser desfeita.')) {
      return;
    }
    this.processandoAcao.set(true);
    this.erroAcao.set(null);
    this.prontuario
      .cancelarDocumento(this.idPaciente, d.idDocumento, { motivo: this.acaoMotivo.trim() })
      .subscribe({
        next: () => {
          this.processandoAcao.set(false);
          this.fecharAcao();
          this.carregar();
        },
        error: (err) => {
          this.processandoAcao.set(false);
          this.erroAcao.set(this.mensagemErro(err, 'Não foi possível cancelar o documento.'));
        },
      });
  }

  // --- Helpers ---------------------------------------------------------------

  private confirmar(msg: string): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return window.confirm(msg);
  }

  private mensagemErro(e: unknown, padrao: string): string {
    const err = e as { error?: { mensagem?: string; erros?: string[]; detail?: string; message?: string }; message?: string };
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
