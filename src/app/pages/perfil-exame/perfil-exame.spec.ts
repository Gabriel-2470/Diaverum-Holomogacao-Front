import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PerfilExame } from './perfil-exame';

describe('PerfilExame', () => {
  let component: PerfilExame;
  let fixture: ComponentFixture<PerfilExame>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PerfilExame]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PerfilExame);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
