import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClinicaService, ClinicaDetalhe, Laboratorio } from '../../core/services/clinica.service';
import { MedicoService, Medico } from '../../core/services/medico.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-clinicas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clinicas.html',
  styleUrl: './clinicas.scss',
})
export class Clinicas implements OnInit {
  clinicas: ClinicaDetalhe[] = [];
  laboratorios: Laboratorio[] = [];
  medicos: Medico[] = [];

  // laboratório escolhido no seletor "adicionar", por clínica
  novoLabPorClinica: Record<number, number | null> = {};

  carregando = false;
  salvando = false;
  erro = '';
  ehAdmin = false;

  constructor(
    private clinicaService: ClinicaService,
    private medicoService: MedicoService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.ehAdmin = this.authService.isAdmin();
    this.medicoService.listar(true).subscribe({ next: (m) => (this.medicos = m || []), error: () => {} });
    this.clinicaService.listarLaboratorios().subscribe({ next: (l) => (this.laboratorios = l || []), error: () => {} });
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.clinicaService.listarClinicas().subscribe({
      next: (c) => {
        this.clinicas = c || [];
        this.carregando = false;
      },
      error: () => {
        this.erro = 'Erro ao carregar clínicas.';
        this.carregando = false;
      },
    });
  }

  /** Laboratórios ainda não vinculados a esta clínica (para o seletor "adicionar"). */
  labsDisponiveis(c: ClinicaDetalhe): Laboratorio[] {
    const jaVinculados = new Set(c.laboratorios.map((l) => l.idLaboratorio));
    return this.laboratorios.filter((l) => !jaVinculados.has(l.id));
  }

  adicionarLaboratorio(c: ClinicaDetalhe): void {
    const idLab = this.novoLabPorClinica[c.idUnidade];
    if (!idLab) return;
    // primeiro laboratório da clínica já entra como padrão
    const padrao = c.laboratorios.length === 0;
    this.salvando = true;
    this.clinicaService.vincularLaboratorio(c.idUnidade, idLab, padrao).subscribe({
      next: () => {
        this.novoLabPorClinica[c.idUnidade] = null;
        this.salvando = false;
        this.carregar();
      },
      error: (e) => {
        this.salvando = false;
        alert(this.extrairErro(e));
      },
    });
  }

  definirPadrao(c: ClinicaDetalhe, idLaboratorio: number): void {
    this.salvando = true;
    this.clinicaService.vincularLaboratorio(c.idUnidade, idLaboratorio, true).subscribe({
      next: () => {
        this.salvando = false;
        this.carregar();
      },
      error: (e) => {
        this.salvando = false;
        alert(this.extrairErro(e));
      },
    });
  }

  removerLaboratorio(c: ClinicaDetalhe, idLaboratorio: number): void {
    if (!confirm('Desvincular este laboratório da clínica?')) return;
    this.salvando = true;
    this.clinicaService.desvincularLaboratorio(c.idUnidade, idLaboratorio).subscribe({
      next: () => {
        this.salvando = false;
        this.carregar();
      },
      error: (e) => {
        this.salvando = false;
        alert(this.extrairErro(e));
      },
    });
  }

  onMudarMedicoPadrao(c: ClinicaDetalhe, novoId: number | null): void {
    if (!novoId) return;
    const anterior = c.idMedicoPadrao;
    c.idMedicoPadrao = novoId;
    this.medicoService.vincularUnidade(c.idUnidade, novoId, true).subscribe({
      next: () => this.carregar(),
      error: (e) => {
        c.idMedicoPadrao = anterior;
        alert(this.extrairErro(e));
      },
    });
  }

  rotuloIntegracao(tipo: string | null): string {
    if (tipo === 'SOAP_DB') return 'SOAP (Diagnósticos do Brasil)';
    if (tipo === 'FHIR_HYGIA') return 'FHIR (Hygia)';
    return '—';
  }

  private extrairErro(err: any): string {
    return err?.error?.mensagem || err?.error?.detail || 'Erro ao salvar.';
  }
}
