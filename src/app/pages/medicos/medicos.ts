import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MedicoService, Medico, MedicoInput } from '../../core/services/medico.service';
import { UnidadeService, Unidade } from '../../core/services/unidade.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-medicos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './medicos.html',
  styleUrl: './medicos.scss',
})
export class Medicos implements OnInit {
  medicos: Medico[] = [];
  carregando = false;
  erroLista = '';

  mostrarForm = false;
  editando = false;
  salvando = false;
  erro = '';
  form: MedicoInput = this.formVazio();

  // vínculo médico <-> clínica
  unidades: Unidade[] = [];
  unidadeSelId: number | null = null;
  medicosDaUnidade: Medico[] = [];
  medicoAddId: number | null = null;
  carregandoVinculo = false;
  erroVinculo = '';

  // controle de acesso
  ehAdmin = false;
  ehConsolidador = false;
  idUnidadeUsuario: number | null = null;

  constructor(
    private medicoService: MedicoService,
    private unidadeService: UnidadeService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.ehAdmin = this.authService.isAdmin();
    this.idUnidadeUsuario = user?.idUnidade ?? null;
    // consolidador (unidade 0/nula) enxerga todas as clínicas
    this.ehConsolidador = this.idUnidadeUsuario == null || this.idUnidadeUsuario === 0;

    this.carregar();
    this.carregarUnidades();

    // Atendente preso a uma clínica: já trava e carrega a própria unidade
    if (!this.ehConsolidador && this.idUnidadeUsuario != null) {
      this.unidadeSelId = this.idUnidadeUsuario;
      this.carregarMedicosDaUnidade();
    }
  }

  private formVazio(): MedicoInput {
    return { ID_MEDICO: 0, NOME: '', CPF: '', CRM: '', UF_CRM: '', IND_ATIVO: true };
  }

  carregar(): void {
    this.carregando = true;
    this.erroLista = '';
    this.medicoService.listar(false).subscribe({
      next: (dados) => {
        this.medicos = dados || [];
        this.carregando = false;
      },
      error: () => {
        this.erroLista = 'Erro ao carregar médicos.';
        this.carregando = false;
      },
    });
  }

  novo(): void {
    this.form = this.formVazio();
    this.editando = false;
    this.erro = '';
    this.mostrarForm = true;
  }

  editar(m: Medico): void {
    this.form = {
      ID_MEDICO: m.iD_MEDICO,
      NOME: m.nome,
      CPF: m.cpf,
      CRM: m.crm ?? '',
      UF_CRM: m.uF_CRM ?? '',
      IND_ATIVO: m.inD_ATIVO,
    };
    this.editando = true;
    this.erro = '';
    this.mostrarForm = true;
  }

  cancelar(): void {
    this.mostrarForm = false;
    this.erro = '';
  }

  salvar(): void {
    this.erro = '';

    const errosLocais = this.validar();
    if (errosLocais.length) {
      this.erro = errosLocais.join(', ');
      return;
    }

    this.salvando = true;
    const req = this.editando
      ? this.medicoService.atualizar(this.form.ID_MEDICO!, this.form)
      : this.medicoService.criar(this.form);

    req.subscribe({
      next: () => {
        this.salvando = false;
        this.mostrarForm = false;
        this.carregar();
      },
      error: (err) => {
        this.salvando = false;
        this.erro = this.extrairErro(err);
      },
    });
  }

  excluir(m: Medico): void {
    if (!confirm(`Desativar o médico "${m.nome}"?`)) return;
    this.medicoService.desativar(m.iD_MEDICO).subscribe({
      next: () => this.carregar(),
      error: () => alert('Erro ao desativar médico.'),
    });
  }

  private validar(): string[] {
    const erros: string[] = [];
    if (!this.form.NOME || this.form.NOME.trim().length < 3) erros.push('Nome inválido');
    const cpf = (this.form.CPF || '').replace(/\D/g, '');
    if (cpf.length !== 11) erros.push('CPF deve ter 11 dígitos');
    if (this.form.UF_CRM && this.form.UF_CRM.trim().length !== 2) erros.push('UF do CRM deve ter 2 letras');
    return erros;
  }

  private extrairErro(err: any): string {
    return (
      err?.error?.erros?.join?.(', ') ||
      err?.error?.mensagem ||
      err?.error?.detail ||
      'Erro ao salvar médico.'
    );
  }

  formatarCpf(cpf: string): string {
    const d = (cpf || '').replace(/\D/g, '');
    if (d.length !== 11) return cpf || '—';
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  /** Admin vê o CPF completo; demais veem mascarado (LGPD) — identificam por nome/CRM */
  cpfExibicao(cpf: string): string {
    if (this.ehAdmin) return this.formatarCpf(cpf);
    const d = (cpf || '').replace(/\D/g, '');
    if (d.length !== 11) return '—';
    return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
  }

  // ============ vínculo médico <-> clínica ============

  carregarUnidades(): void {
    this.unidadeService.buscarUnidades().subscribe({
      next: (u) => {
        let lista = u || [];
        // Não-consolidador só enxerga a própria clínica
        if (!this.ehConsolidador && this.idUnidadeUsuario != null) {
          lista = lista.filter((x) => x.iD_UNIDADE === this.idUnidadeUsuario);
        }
        this.unidades = lista;
      },
      error: () => {},
    });
  }

  onSelecionarUnidade(): void {
    this.medicoAddId = null;
    this.erroVinculo = '';
    if (this.unidadeSelId == null) {
      this.medicosDaUnidade = [];
      return;
    }
    this.carregarMedicosDaUnidade();
  }

  carregarMedicosDaUnidade(): void {
    if (this.unidadeSelId == null) return;
    this.carregandoVinculo = true;
    this.medicoService.listarPorUnidade(this.unidadeSelId).subscribe({
      next: (m) => {
        this.medicosDaUnidade = m || [];
        this.carregandoVinculo = false;
      },
      error: () => {
        this.erroVinculo = 'Erro ao carregar médicos da clínica.';
        this.carregandoVinculo = false;
      },
    });
  }

  adicionarMedicoNaUnidade(comoPadrao: boolean): void {
    if (this.unidadeSelId == null || this.medicoAddId == null) return;
    this.medicoService.vincularUnidade(this.unidadeSelId, this.medicoAddId, comoPadrao).subscribe({
      next: () => {
        this.medicoAddId = null;
        this.carregarMedicosDaUnidade();
      },
      error: (e) => alert(this.extrairErro(e)),
    });
  }

  definirPadrao(m: Medico): void {
    if (this.unidadeSelId == null) return;
    this.medicoService.vincularUnidade(this.unidadeSelId, m.iD_MEDICO, true).subscribe({
      next: () => this.carregarMedicosDaUnidade(),
      error: (e) => alert(this.extrairErro(e)),
    });
  }

  removerDaUnidade(m: Medico): void {
    if (this.unidadeSelId == null) return;
    if (!confirm(`Remover "${m.nome}" desta clínica?`)) return;
    this.medicoService.desvincularUnidade(this.unidadeSelId, m.iD_MEDICO).subscribe({
      next: () => this.carregarMedicosDaUnidade(),
      error: () => alert('Erro ao remover vínculo.'),
    });
  }

  get medicosDisponiveis(): Medico[] {
    const vinculados = new Set(this.medicosDaUnidade.map((m) => m.iD_MEDICO));
    return this.medicos.filter((m) => m.inD_ATIVO && !vinculados.has(m.iD_MEDICO));
  }
}
