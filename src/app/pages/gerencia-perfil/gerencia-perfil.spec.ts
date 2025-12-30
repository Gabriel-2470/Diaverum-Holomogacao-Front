import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GerenciaPerfil } from './gerencia-perfil';

describe('GerenciaPerfil', () => {
  let component: GerenciaPerfil;
  let fixture: ComponentFixture<GerenciaPerfil>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GerenciaPerfil]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GerenciaPerfil);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
