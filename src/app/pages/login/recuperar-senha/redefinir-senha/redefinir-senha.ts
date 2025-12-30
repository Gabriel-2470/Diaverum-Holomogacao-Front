import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-redefinir-senha',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './redefinir-senha.html',
  styleUrls: ['./redefinir-senha.scss'],
})
export class RedefinirSenhaComponent implements OnInit {
  redefinirForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  token = '';
  tokenValido = false;
  verificandoToken = true;

  // Controle de visibilidade das senhas
  mostrarSenha = false;
  mostrarConfirmacao = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.redefinirForm = this.fb.group(
      {
        novaSenha: ['', [Validators.required, Validators.minLength(6)]],
        confirmarSenha: ['', [Validators.required]],
      },
      { validators: this.senhasIguais }
    );
  }

  ngOnInit(): void {
    // Pega o token da URL (?token=xxxx)
    this.token = this.route.snapshot.queryParams['token'] || '';

    if (!this.token) {
      this.errorMessage = 'Token não encontrado na URL';
      this.verificandoToken = false;
      return;
    }

    // Valida o token com o backend
    this.authService.validarToken(this.token).subscribe({
      next: (response) => {
        this.tokenValido = response.valido;
        this.verificandoToken = false;

        if (!response.valido) {
          this.errorMessage = response.message || 'Token inválido ou expirado';
        }
      },
      error: (error) => {
        this.verificandoToken = false;
        this.tokenValido = false;

        if (error.status === 400) {
          this.errorMessage = 'Token inválido ou expirado';
        } else {
          this.errorMessage = 'Erro ao validar token. Tente novamente.';
        }
      },
    });
  }

  onSubmit(): void {
    if (this.redefinirForm.invalid) {
      this.redefinirForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const novaSenha = this.redefinirForm.value.novaSenha;

    this.authService.redefinirSenha(this.token, novaSenha).subscribe({
      next: () => {
        this.isLoading = false;
        this.successMessage = 'Senha redefinida com sucesso! Redirecionando...';

        // Redireciona para login após 2 segundos
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      },
      error: (error) => {
        this.isLoading = false;

        if (error.status === 400) {
          this.errorMessage = error.error?.message || 'Token inválido ou expirado';
        } else if (error.status === 0) {
          this.errorMessage = 'Erro de conexão. Verifique sua internet.';
        } else {
          this.errorMessage = 'Erro ao redefinir senha. Tente novamente.';
        }
      },
    });
  }

  // Validador customizado: verifica se as senhas são iguais
  senhasIguais(group: FormGroup): { [key: string]: boolean } | null {
    const senha = group.get('novaSenha')?.value;
    const confirmacao = group.get('confirmarSenha')?.value;

    if (senha && confirmacao && senha !== confirmacao) {
      return { senhasDiferentes: true };
    }

    return null;
  }

  get novaSenha() {
    return this.redefinirForm.get('novaSenha');
  }

  get confirmarSenha() {
    return this.redefinirForm.get('confirmarSenha');
  }

  toggleMostrarSenha(): void {
    this.mostrarSenha = !this.mostrarSenha;
  }

  toggleMostrarConfirmacao(): void {
    this.mostrarConfirmacao = !this.mostrarConfirmacao;
  }

  voltarLogin(): void {
    this.router.navigate(['/login']);
  }
}
