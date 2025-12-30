import { Routes } from '@angular/router';
import { GerenciaPerfil } from './pages/gerencia-perfil/gerencia-perfil';
import { PerfilExame } from './pages/perfil-exame/perfil-exame';
import { ImportacaoPacientes } from './pages/importacao-pacientes/importacao-pacientes';
import { Home } from './pages/home/home';
import { LoginComponent } from './pages/login/login';
import { RecuperarSenhaComponent } from './pages/login/recuperar-senha/recuperar-senha';
import { RedefinirSenhaComponent } from './pages/login/recuperar-senha/redefinir-senha/redefinir-senha';
import { authGuard } from './core/guards/auth.guard';
import { LayoutComponent } from './shared/components/layout/layout';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'recuperar-senha', component: RecuperarSenhaComponent },
  { path: 'redefinir-senha', component: RedefinirSenhaComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'home', component: Home },
      { path: 'perfis', component: GerenciaPerfil },
      { path: 'perfil/novo', component: PerfilExame },
      { path: 'perfil/editar/:id', component: PerfilExame },
      { path: 'importacao', component: ImportacaoPacientes },
    ],
  },
  { path: '**', redirectTo: '/login' },
];
