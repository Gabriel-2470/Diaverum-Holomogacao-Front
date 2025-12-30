import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-recuperar-senha',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './recuperar-senha.html',
  styleUrls: ['./recuperar-senha.scss'],
})
export class RecuperarSenhaComponent {
  recuperarForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(private fb: FormBuilder, private authService: AuthService, private router: Router) {
    this.recuperarForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  onSubmit(): void {
    if (this.recuperarForm.invalid) {
      this.recuperarForm.get('email')?.markAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const email = this.recuperarForm.value.email.trim();

    this.authService.recuperarSenha(email).subscribe({
      next: () => {
        this.isLoading = false;
        this.successMessage = 'Email enviado com sucesso! Verifique sua caixa de entrada.';

        // Redireciona para login após 3 segundos
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 3000);
      },
      error: (error) => {
        this.isLoading = false;

        if (error.status === 404) {
          this.errorMessage = 'Email não encontrado no sistema.';
        } else if (error.status === 400) {
          this.errorMessage = 'Por favor, informe um email válido.';
        } else if (error.status === 0) {
          this.errorMessage = 'Erro de conexão. Verifique sua internet.';
        } else {
          this.errorMessage = 'Erro ao enviar email. Tente novamente.';
        }
      },
    });
  }

  get email() {
    return this.recuperarForm.get('email');
  }

  voltarLogin(): void {
    this.router.navigate(['/login']);
  }
}
