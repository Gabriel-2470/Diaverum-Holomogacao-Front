import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { HasRoleDirective } from '../../shared/directives/has-role.direcrive';

interface MenuItem {
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
  roles?: string[];
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, HasRoleDirective],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent implements OnInit {
  userName = '';
  userRole = '';

  menuItems: MenuItem[] = [
    {
      title: 'Gerenciar Perfis',
      description: 'Crie e gerencie perfis de exames para facilitar a importação',
      icon: 'clipboard',
      route: '/perfis',
      color: 'blue',
      roles: ['admin', 'gestor'],
    },
    {
      title: 'Importar Pacientes',
      description: 'Importe planilhas com dados de pacientes e seus exames',
      icon: 'upload',
      route: '/importacao',
      color: 'green',
      roles: ['admin', 'gestor', 'operador'],
    },
    {
      title: 'Relatórios',
      description: 'Visualize relatórios e estatísticas do sistema',
      icon: 'chart',
      route: '/relatorios',
      color: 'purple',
      roles: ['admin', 'gestor'],
    },
    {
      title: 'Configurações',
      description: 'Gerencie configurações do sistema e usuários',
      icon: 'settings',
      route: '/configuracoes',
      color: 'orange',
      roles: ['admin'],
    },
  ];

  quickStats = [
    { label: 'Perfis Cadastrados', value: '12', icon: 'clipboard', color: 'blue' },
    { label: 'Importações Hoje', value: '8', icon: 'upload', color: 'green' },
    { label: 'Pacientes Ativos', value: '245', icon: 'users', color: 'purple' },
    { label: 'Exames Pendentes', value: '23', icon: 'clock', color: 'orange' },
  ];

  constructor(private router: Router, private authService: AuthService) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userName = user.name;
      this.userRole = this.getRoleDisplay(user.role);
    }
  }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  getRoleDisplay(role: string): string {
    const roles: { [key: string]: string } = {
      admin: 'Administrador',
      gestor: 'Gestor',
      operador: 'Operador',
    };
    return roles[role] || role;
  }

  getIcon(iconName: string): string {
    const icons: { [key: string]: string } = {
      clipboard: `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                 <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>`,
      upload: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>`,
      chart: `<line x1="18" y1="20" x2="18" y2="10"></line>
             <line x1="12" y1="20" x2="12" y2="4"></line>
             <line x1="6" y1="20" x2="6" y2="14"></line>`,
      settings: `<circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6m5.5-13v6m0 6v6M18 9h-6m0 6h6"></path>`,
      users: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
             <circle cx="9" cy="7" r="4"></circle>
             <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
             <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>`,
      clock: `<circle cx="12" cy="12" r="10"></circle>
             <polyline points="12 6 12 12 16 14"></polyline>`,
    };
    return icons[iconName] || '';
  }

  hasRole(roles?: string[]): boolean {
    if (!roles || roles.length === 0) return true;
    const userRole = this.authService.getRole();
    return userRole ? roles.includes(userRole) : false;
  }
}
