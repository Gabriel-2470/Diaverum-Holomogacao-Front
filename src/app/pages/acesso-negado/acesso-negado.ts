// pages/acesso-negado/acesso-negado.ts
//
// Pagina simples de "Acesso negado" para onde os guards redirecionam quando o
// usuario esta logado mas nao tem permissao (ex.: prontuarioGuard / adminGuard).
// A rota /acesso-negado e registrada em app.routes.ts pelo executor.

import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-acesso-negado',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './acesso-negado.html',
  styleUrl: './acesso-negado.scss',
})
export class AcessoNegado {}
