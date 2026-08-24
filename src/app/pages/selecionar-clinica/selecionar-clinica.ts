import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-selecionar-clinica',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './selecionar-clinica.html',
  styleUrl: './selecionar-clinica.scss',
})
export class SelecionarClinica implements OnInit {
  unidades: any[] = [];
  nomeUsuario = '';

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    if (this.authService.hasUnidadeSelecionada()) {
      this.router.navigate(['/home']);
      return;
    }
    this.unidades = this.authService.getUnidadesUsuario();
    this.nomeUsuario = this.authService.getCurrentUser()?.nome || '';
    console.log('%c🏥 SELETOR — unidades disponíveis:', 'background:#1a1a2e;color:#00ff88;font-size:14px;font-weight:bold;padding:4px 8px;border-radius:4px', this.unidades);
    if (this.unidades.length === 0) {
      this.router.navigate(['/home']);
    }
  }

  selecionar(unidade: any): void {
    console.log('%c✅ SELETOR — clínica selecionada:', 'background:#1a1a2e;color:#ffcc00;font-size:14px;font-weight:bold;padding:4px 8px;border-radius:4px', unidade);
    this.authService.selecionarUnidade(unidade);
    this.router.navigate(['/home']);
  }

  getNome(unidade: any): string {
    return unidade.descricao || unidade.Descricao || `Unidade ${unidade.idUnidade || unidade.IdUnidade}`;
  }

  logout(): void {
    this.authService.logout();
  }
}
