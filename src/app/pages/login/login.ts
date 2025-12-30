import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  laboratorio: string | null = '';

  constructor(private fb: FormBuilder, private authService: AuthService, private router: Router) {
    // Login agora é email
    this.loginForm = this.fb.group({
      login: ['', [Validators.required]],
      senha: ['', [Validators.required]],
    });

    if (typeof window !== 'undefined') {
      this.laboratorio = sessionStorage.getItem('laboratorio');
    }
  }

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched(this.loginForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const credentials = {
      login: this.loginForm.value.login.trim(),
      senha: this.loginForm.value.senha,
    };

    this.authService.login(credentials).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/home']);
      },
      error: (error) => {
        this.isLoading = false;

        if (error.status === 401) {
          this.errorMessage = 'Email ou senha incorretos.';
        } else if (error.status === 400) {
          this.errorMessage = 'Por favor, preencha todos os campos corretamente.';
        } else if (error.status === 500) {
          this.errorMessage = error.error?.message || 'Erro no servidor. Tente novamente.';
        } else if (error.status === 0) {
          this.errorMessage = 'Erro de conexão. Verifique sua internet.';
        } else {
          this.errorMessage = 'Erro inesperado. Tente novamente.';
        }
      },
    });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  get login() {
    return this.loginForm.get('login');
  }

  get senha() {
    return this.loginForm.get('senha');
  }

  voltarLaboratorio(): void {
    this.router.navigate(['/']);
  }
}
