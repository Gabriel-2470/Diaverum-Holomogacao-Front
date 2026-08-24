// features/prontuario/prontuario.routes.ts
//
// Rotas LAZY da area de prontuario (carregadas via loadChildren em app.routes.ts,
// atras do prontuarioGuard). SHELL PROPRIO: tudo pendura em ProntuarioLayout, que
// aplica o tema NephroSys e a faixa LGPD, FORA do LayoutComponent operacional.
//
// Estrutura:
//   ''                     -> ProntuarioLayout
//     ''                   -> BuscaPacientesComponent  (busca com filtro minimo)
//     'paciente/:id'       -> PacienteShellComponent   (cabecalho -> contexto)
//         ''               -> redirect 'identificacao'
//         17 abas na ordem NephroSys:
//           identificacao | dados-clinicos | eventos | sae | hc-evolucao |
//           exames | medicacoes | sol-exames | laudos | acessos | presc-hd |
//           tx | social | ver-hd | imagens | resumo | linha-do-tempo
//
// Os componentes de pagina das abas novas sao autorados por outros grupos em
// pages/<kebab>/<kebab>.ts com os exports: Identificacao, DadosClinicos,
// EventosDiagn, Sae, HcEvolucao, Exames, Medicacoes, SolExames, Laudos,
// Acessos, PrescHd, Tx, Social, VerHd, Imagens. Resumo e Linha do tempo
// mantem os componentes existentes (*Component).

import { Routes } from '@angular/router';
import { ProntuarioLayout } from './layout/prontuario-layout';

export const PRONTUARIO_ROUTES: Routes = [
  {
    path: '',
    component: ProntuarioLayout,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/busca-pacientes/busca-pacientes').then((m) => m.BuscaPacientesComponent),
      },
      {
        // Fila de vínculo (AdminOnly). Protegida pelo prontuarioGuard (herdado) e,
        // no próprio componente, redireciona à busca se o papel não for ADMIN.
        path: 'vinculos',
        loadComponent: () => import('./pages/vinculos/vinculos').then((m) => m.VinculosComponent),
      },
      {
        path: 'paciente/:id',
        loadComponent: () =>
          import('./pages/paciente-shell/paciente-shell').then((m) => m.PacienteShellComponent),
        children: [
          { path: '', redirectTo: 'identificacao', pathMatch: 'full' },
          {
            path: 'identificacao',
            loadComponent: () =>
              import('./pages/identificacao/identificacao').then((m) => m.Identificacao),
          },
          {
            path: 'dados-clinicos',
            loadComponent: () =>
              import('./pages/dados-clinicos/dados-clinicos').then((m) => m.DadosClinicos),
          },
          {
            path: 'eventos',
            loadComponent: () =>
              import('./pages/eventos-diagn/eventos-diagn').then((m) => m.EventosDiagn),
          },
          {
            path: 'sae',
            loadComponent: () => import('./pages/sae/sae').then((m) => m.SaeComponent),
          },
          {
            path: 'hc-evolucao',
            loadComponent: () =>
              import('./pages/hc-evolucao/hc-evolucao').then((m) => m.HcEvolucao),
          },
          {
            path: 'exames',
            loadComponent: () => import('./pages/exames/exames').then((m) => m.ExamesComponent),
          },
          {
            path: 'medicacoes',
            loadComponent: () =>
              import('./pages/medicacoes/medicacoes').then((m) => m.MedicacoesComponent),
          },
          {
            path: 'sol-exames',
            loadComponent: () =>
              import('./pages/sol-exames/sol-exames').then((m) => m.SolExamesComponent),
          },
          {
            path: 'laudos',
            loadComponent: () => import('./pages/laudos/laudos').then((m) => m.Laudos),
          },
          {
            path: 'acessos',
            loadComponent: () => import('./pages/acessos/acessos').then((m) => m.AcessosComponent),
          },
          {
            path: 'presc-hd',
            loadComponent: () => import('./pages/presc-hd/presc-hd').then((m) => m.PrescHdComponent),
          },
          {
            path: 'tx',
            loadComponent: () => import('./pages/tx/tx').then((m) => m.TxComponent),
          },
          {
            path: 'social',
            loadComponent: () => import('./pages/social/social').then((m) => m.SocialComponent),
          },
          {
            path: 'ver-hd',
            loadComponent: () => import('./pages/ver-hd/ver-hd').then((m) => m.VerHdComponent),
          },
          {
            path: 'imagens',
            loadComponent: () => import('./pages/imagens/imagens').then((m) => m.Imagens),
          },
          {
            path: 'resumo',
            loadComponent: () => import('./pages/resumo/resumo').then((m) => m.ResumoComponent),
          },
          {
            path: 'linha-do-tempo',
            loadComponent: () =>
              import('./pages/linha-do-tempo/linha-do-tempo').then((m) => m.LinhaDoTempoComponent),
          },
        ],
      },
      {
        // Impressão do prontuário com seleção de abas (?abas=identificacao,exames,...).
        // Fora do PacienteShell (sem as abas): documento único para imprimir.
        path: 'paciente/:id/imprimir',
        loadComponent: () => import('./pages/imprimir/imprimir').then((m) => m.ImprimirProntuario),
      },
      {
        // Impressão EM LOTE (?ids=1,2,3): documento completo de cada paciente em
        // sequência, com quebra de página entre eles. Mesma proteção da rota de
        // impressão acima — herdada do prontuarioGuard aplicado em app.routes.ts.
        path: 'imprimir-lote',
        loadComponent: () => import('./pages/imprimir-lote/imprimir-lote').then((m) => m.ImprimirLote),
      },
    ],
  },
];
