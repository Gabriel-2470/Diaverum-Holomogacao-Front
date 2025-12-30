import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-laboratorio',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './laboratorio.html',
  styleUrls: ['./laboratorio.scss'],
})
export class LaboratorioComponent {
  laboratorioForm: FormGroup;

  constructor(private fb: FormBuilder, private router: Router) {
    this.laboratorioForm = this.fb.group({
      laboratorio: ['', [Validators.required]],
    });
  }

  onSubmit(): void {
    if (this.laboratorioForm.invalid) {
      this.laboratorioForm.get('laboratorio')?.markAsTouched();
      return;
    }

    const laboratorio = this.laboratorioForm.get('laboratorio')?.value.trim();

    // Armazenar laboratório selecionado no sessionStorage
    sessionStorage.setItem('laboratorio', laboratorio);

    // Redirecionar para login (sem delay)
    this.router.navigateByUrl('/login');
  }

  get laboratorio() {
    return this.laboratorioForm.get('laboratorio');
  }
}
