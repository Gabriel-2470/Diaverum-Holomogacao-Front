import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './perfil.html',
  styleUrl: './perfil.scss',
})
export class Perfil implements OnInit {
  nome = '';
  email = '';
  role = '';
  clinica = '';

  form = { senhaAtual: '', novaSenha: '', confirmar: '' };
  salvando = false;
  msgOk = '';
  msgErro = '';

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    const u = this.authService.getCurrentUser();
    if (u) {
      this.nome = u.nome;
      this.email = u.email;
      this.role = this.roleLabel(u.role);
    }
    this.clinica = this.authService.getUnidadeAtiva().nome || 'Todas as clínicas';
  }

  private roleLabel(r: string): string {
    const m: { [k: string]: string } = {
      ADMIN: 'Administrador',
      GESTOR: 'Gestor',
      USER: 'Usuário',
      OPERADOR: 'Operador',
    };
    return m[r] || r;
  }

  alterarSenha(): void {
    this.msgOk = '';
    this.msgErro = '';

    if (!this.form.senhaAtual) {
      this.msgErro = 'Informe a senha atual.';
      return;
    }
    if (this.form.novaSenha.length < 6) {
      this.msgErro = 'A nova senha deve ter no mínimo 6 caracteres.';
      return;
    }
    if (this.form.novaSenha !== this.form.confirmar) {
      this.msgErro = 'A confirmação da nova senha não confere.';
      return;
    }

    this.salvando = true;
    this.authService.alterarSenha(this.form.senhaAtual, this.form.novaSenha).subscribe({
      next: () => {
        this.salvando = false;
        this.msgOk = 'Senha alterada com sucesso.';
        this.form = { senhaAtual: '', novaSenha: '', confirmar: '' };
      },
      error: (e) => {
        this.salvando = false;
        this.msgErro = e?.error?.mensagem || 'Não foi possível alterar a senha.';
      },
    });
  }
}
