import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImportacaoPaginacao } from './importacao-pacientes';

describe('ImportacaoPaginacao', () => {
  let component: ImportacaoPaginacao;
  let fixture: ComponentFixture<ImportacaoPaginacao>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImportacaoPaginacao]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImportacaoPaginacao);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
