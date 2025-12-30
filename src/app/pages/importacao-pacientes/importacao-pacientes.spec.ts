import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImportacaoPacientes } from './importacao-pacientes';

describe('ImportacaoPacientes', () => {
  let component: ImportacaoPacientes;
  let fixture: ComponentFixture<ImportacaoPacientes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImportacaoPacientes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImportacaoPacientes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
