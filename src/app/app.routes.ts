import { Routes } from '@angular/router';
import { GerenciaPerfil } from './pages/gerencia-perfil/gerencia-perfil';
import { PerfilExame } from './pages/perfil-exame/perfil-exame';
import { ImportacaoPacientes } from './pages/importacao-pacientes/importacao-pacientes';
import { ImportacaoPaginacao } from './pages/importacao-paginacao/importacao-paginacao';
import { Medicos } from './pages/medicos/medicos';
import { Clinicas } from './pages/clinicas/clinicas';
import { Perfil } from './pages/perfil/perfil';
import { Home } from './pages/home/home';
import { LoginComponent } from './pages/login/login';
import { RecuperarSenhaComponent } from './pages/login/recuperar-senha/recuperar-senha';
import { RedefinirSenhaComponent } from './pages/login/recuperar-senha/redefinir-senha/redefinir-senha';
import { GerenciaUsuarios } from './pages/gerencia-usuarios/gerencia-usuarios';
import { SelecionarClinica } from './pages/selecionar-clinica/selecionar-clinica';
import { authGuard } from './core/guards/auth.guard';
import { prontuarioGuard } from './core/guards/prontuario.guard';
import { adminGuard } from './core/guards/admin.guards';
import { LayoutComponent } from './shared/components/layout/layout';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'recuperar-senha', component: RecuperarSenhaComponent },
  { path: 'redefinir-senha', component: RedefinirSenhaComponent },
  { path: 'selecionar-clinica', component: SelecionarClinica, canActivate: [authGuard] },
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
      { path: 'importacao-paginacao', component: ImportacaoPaginacao },
      { path: 'medicos', component: Medicos },
      { path: 'clinicas', component: Clinicas },
      { path: 'perfil', component: Perfil },
      { path: 'usuarios', component: GerenciaUsuarios, canActivate: [adminGuard] },
    ],
  },
  // Área clínica LAZY, com shell próprio (ProntuarioLayout), fora do LayoutComponent operacional:
  {
    // Só o prontuarioGuard: no modo hyperlink (acesso anônimo por CPF) ele libera;
    // fora dele, ele mesmo exige login. NÃO usar authGuard aqui, senão o fluxo
    // anônimo do hyperlink é barrado antes de chegar no prontuarioGuard.
    path: 'prontuario',
    canActivate: [prontuarioGuard],
    loadChildren: () =>
      import('./features/prontuario/prontuario.routes').then((m) => m.PRONTUARIO_ROUTES),
  },
  // Página de acesso negado (destino dos guards quando logado sem permissão):
  {
    path: 'acesso-negado',
    loadComponent: () => import('./pages/acesso-negado/acesso-negado').then((m) => m.AcessoNegado),
  },
  { path: '**', redirectTo: '/login' },
];
