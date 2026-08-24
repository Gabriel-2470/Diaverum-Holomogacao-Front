// Aba "Identificação" (NephroSys pag.1): Dados Cadastrais + Convênio/Plano +
// Programas de Tratamento. Usa ProntuarioService.obterCadastro. Endereço parseado
// de enderecoJson. V1 somente leitura; SSR-safe.

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProntuarioService } from '../../services/prontuario.service';
import { ProntuarioContextoService } from '../../services/prontuario-contexto.service';
import { Cadastro } from '../../models/prontuario.models';
import { EstadoVazioComponent } from '../../components/estado-vazio/estado-vazio';
import { SkeletonComponent } from '../../components/skeleton/skeleton';

interface Endereco {
  rua: string;
  bairro: string;
  cidade: string;
  cep: string;
}

/** Recorte do JSON_EXTRA (migracao NephroSys) usado nesta aba: convenio/plano. */
interface JsonExtra {
  convenio?: string | null;
  plano?: string | null;
}

@Component({
  selector: 'pr-identificacao',
  standalone: true,
  imports: [CommonModule, EstadoVazioComponent, SkeletonComponent],
  templateUrl: './identificacao.html',
  styleUrl: './identificacao.scss',
})
export class Identificacao implements OnInit {
  private readonly prontuario = inject(ProntuarioService);
  private readonly contexto = inject(ProntuarioContextoService);

  readonly cadastro = signal<Cadastro | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal(false);

  readonly endereco = computed<Endereco>(() => this.parseEndereco(this.cadastro()?.enderecoJson ?? null));

  /** Convenio/plano do espelho migrado (JSON_EXTRA), parse seguro. */
  readonly extra = computed<JsonExtra | null>(() => this.parseExtra(this.cadastro()?.jsonExtra ?? null));
  /** Ha convenio ou plano no espelho -> esconde o aviso "origem nao envia". */
  readonly temConvenio = computed(() => {
    const e = this.extra();
    return !!(e && ((e.convenio ?? '').trim() || (e.plano ?? '').trim()));
  });

  /** Divergências espelho × cadastro local (só se houver vínculo). */
  readonly divergencias = computed(() => {
    const c = this.cadastro();
    if (!c || c.idPaciente == null) return [];
    const linhas: { campo: string; espelho: string | null; local: string | null }[] = [];
    if (c.divergeNome) linhas.push({ campo: 'Nome', espelho: c.nome, local: c.nomeLocal });
    if (c.divergeDataNascimento)
      linhas.push({ campo: 'Nascimento', espelho: c.dataNascimento, local: c.dataNascimentoLocal });
    if (c.divergeGenero) linhas.push({ campo: 'Sexo', espelho: c.genero, local: c.generoLocal });
    if (c.divergeCpf) linhas.push({ campo: 'CPF', espelho: c.cpf, local: c.cpfLocal });
    return linhas;
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

  private parseExtra(raw: string | null): JsonExtra | null {
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? (obj as JsonExtra) : null;
    } catch {
      return null;
    }
  }

  private parseEndereco(raw: string | null): Endereco {
    const vazio: Endereco = { rua: '—', bairro: '—', cidade: '—', cep: '—' };
    if (!raw) return vazio;
    try {
      const e = JSON.parse(raw);
      const rua = Array.isArray(e?.line) ? e.line.join(', ') : e?.line || '';
      const cidade = [e?.city, e?.state].filter((x: string) => !!x).join(' - ');
      return {
        rua: rua || '—',
        bairro: e?.district || e?.neighborhood || '—',
        cidade: cidade || '—',
        cep: e?.postalCode || '—',
      };
    } catch {
      return vazio;
    }
  }
}
