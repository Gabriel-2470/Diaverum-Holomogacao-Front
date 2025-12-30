import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '../../core/services/auth.service';

interface MenuItem {
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  menuItems: MenuItem[] = [
    {
      title: 'Gerenciar Perfis',
      description: 'Crie e gerencie perfis de exames para facilitar a importação de rotinas',
      icon: 'clipboard',
      route: '/perfis',
      color: 'blue',
    },
    {
      title: 'Importar Pacientes',
      description: 'Importe planilhas com dados de pacientes e seus exames de rotina',
      icon: 'upload',
      route: '/importacao',
      color: 'green',
    },
  ];

  quickStats = [
    { label: 'Perfis Cadastrados', value: '12', icon: 'clipboard', color: 'blue' },
    { label: 'Importações Hoje', value: '8', icon: 'upload', color: 'green' },
    { label: 'Pacientes Ativos', value: '245', icon: 'users', color: 'purple' },
    { label: 'Exames Pendentes', value: '23', icon: 'clock', color: 'orange' },
  ];

  constructor(
    private router: Router, 
    private authService: AuthService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {}

  // Mostrar no console o ID da unidade selecionada (se houver)
  ngAfterViewInit(): void {
    try {
      const raw = localStorage.getItem('unidadeSelecionada');
      if (raw) {
        const u = JSON.parse(raw);
        const id = (u && (u.idUnidade ?? u.IdUnidade ?? u.iD_UNIDADE ?? u.ID_UNIDADE)) ?? null;
        console.log('Unidade selecionada ID:', id);
      } else {
        console.log('Unidade selecionada: nenhum');
      }
    } catch (e) {
      console.log('Erro ao ler unidadeSelecionada do localStorage', e);
    }
  }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  getIcon(iconName: string): SafeHtml {
    const icons: { [key: string]: string } = {
      // Tubo de ensaio / Frasco de laboratório para Perfis de Exames
      flask: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3h6v2H9z"></path>
              <path d="M10 5v4.5l-4.5 6.8A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.7-3.7L14 9.5V5"></path>
              <path d="M8.5 14h7"></path>
             </svg>`,
      // Planilha / Arquivo Excel para Importação
      'file-spreadsheet': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                           <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                           <polyline points="14 2 14 8 20 8"></polyline>
                           <line x1="8" y1="13" x2="16" y2="13"></line>
                           <line x1="8" y1="17" x2="16" y2="17"></line>
                           <line x1="10" y1="9" x2="10" y2="21"></line>
                          </svg>`,
      clipboard: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                 <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                 </svg>`,
      upload: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>`,
      users: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
             <circle cx="9" cy="7" r="4"></circle>
             <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
             <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
             </svg>`,
      clock: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <circle cx="12" cy="12" r="10"></circle>
             <polyline points="12 6 12 12 16 14"></polyline>
             </svg>`,
    };
    return this.sanitizer.bypassSecurityTrustHtml(icons[iconName] || '');
  }
}
