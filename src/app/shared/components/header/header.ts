import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UnidadeService, Unidade } from '../../../core/services/unidade.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class HeaderComponent implements OnInit {
  userName = '';
  userRole = '';
  menuAberto = false;

  // clínica ativa
  clinicaNome = '';
  podeTrocar = false;
  seletorAberto = false;
  clinicas: Unidade[] = [];

  constructor(
    public router: Router,
    private authService: AuthService,
    private unidadeService: UnidadeService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userName = user.nome;
      this.userRole = this.getRoleDisplay(user.role);
    }

    const idUn = user?.idUnidade ?? null;
    const consolidador = idUn == null || idUn === 0;
    // admin ou consolidador podem trocar de clínica
    this.podeTrocar = this.authService.isAdmin() || consolidador;

    const ativa = this.authService.getUnidadeAtiva();
    this.clinicaNome = ativa.nome || (consolidador ? 'Todas as clínicas' : '');

    if (this.podeTrocar) {
      this.unidadeService.buscarUnidades().subscribe({
        next: (u) => {
          this.clinicas = u || [];
          if (!this.clinicaNome && ativa.id != null) {
            const achou = this.clinicas.find((c) => c.iD_UNIDADE === ativa.id);
            if (achou) this.clinicaNome = achou.descricao;
          }
        },
        error: () => {},
      });
    }
  }

  toggleSeletor(): void {
    if (this.podeTrocar) this.seletorAberto = !this.seletorAberto;
  }

  trocarClinica(id: number, nome: string): void {
    this.authService.definirUnidadeAtiva(id, nome);
    this.seletorAberto = false;
    // recarrega para todas as telas refletirem a clínica ativa
    if (typeof window !== 'undefined') window.location.reload();
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  toggleMenu(): void {
    this.menuAberto = !this.menuAberto;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  getRoleDisplay(role: string): string {
    const roles: { [key: string]: string } = {
      ADMIN: 'Administrador',
      GESTOR: 'Gestor',
      USER: 'Usuário',
      OPERADOR: 'Operador',
    };
    return roles[role] || role;
  }

  navigateTo(route: string): void {
    this.menuAberto = false;
    this.router.navigate([route]);
  }
}
