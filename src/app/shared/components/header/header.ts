import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

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

  constructor(public router: Router, private authService: AuthService) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userName = user.nome;
      this.userRole = this.getRoleDisplay(user.role);
    }
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
