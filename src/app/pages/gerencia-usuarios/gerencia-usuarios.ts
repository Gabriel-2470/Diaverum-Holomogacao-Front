import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UsuarioService, UnidadeUsuario } from '../../core/services/usuario.service';
import { AuthService } from '../../core/services/auth.service';
import { UnidadeService, Unidade } from '../../core/services/unidade.service';

interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: string;
  acesso?: string;
  ativo?: boolean;
  qtdUnidades?: number;
}

interface FormularioUsuario {
  nomeUser: string;
  acesso: string;
  senha: string;
  email: string;
  role: string;
}

@Component({
  selector: 'app-gerencia-usuarios',
  imports: [CommonModule, FormsModule],
  templateUrl: './gerencia-usuarios.html',
  styleUrl: './gerencia-usuarios.scss',
})
export class GerenciaUsuarios implements OnInit {
  usuarios: Usuario[] = [];
  unidades: Unidade[] = [];
  carregando = false;
  erro = '';
  sucesso = '';

  // Modal criação/edição
  mostrarModal = false;
  modoEdicao = false;
  usuarioEditando: Usuario | null = null;
  formulario: FormularioUsuario = { nomeUser: '', acesso: '', senha: '', email: '', role: 'USER' };

  // Modal exclusão
  mostrarModalExclusao = false;
  usuarioParaExcluir: Usuario | null = null;

  // Expand inline de clínicas
  expandidos = new Set<number>();
  clinicasCacheadas = new Map<number, UnidadeUsuario[]>();
  carregandoExpand = new Set<number>();

  // Modal clínicas
  mostrarModalClinicas = false;
  usuarioClinicas: Usuario | null = null;
  unidadesDoUsuario: UnidadeUsuario[] = [];
  carregandoClinicas = false;
  novaClinicaId?: number;
  erroClinica = '';

  constructor(
    private usuarioService: UsuarioService,
    private authService: AuthService,
    private unidadeService: UnidadeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.authService.isAdmin()) {
      this.router.navigate(['/home']);
      return;
    }
    this.carregarUsuarios();
    this.unidadeService.buscarUnidades().subscribe({
      next: (unidades) => (this.unidades = unidades),
      error: () => {},
    });
  }

  carregarUsuarios(): void {
    this.carregando = true;
    this.erro = '';
    this.sucesso = '';
    this.usuarioService.buscarUsuariosAdmin().subscribe({
      next: (usuarios) => {
        this.usuarios = usuarios;
        this.carregando = false;
      },
      error: () => {
        this.erro = 'Erro ao carregar usuários. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  // ── Modal criação/edição ──────────────────────────────────────────────────

  abrirModalNovo(): void {
    this.modoEdicao = false;
    this.usuarioEditando = null;
    this.formulario = { nomeUser: '', acesso: '', senha: '', email: '', role: 'USER' };
    this.mostrarModal = true;
    this.erro = '';
    this.sucesso = '';
  }

  abrirModalNovoAcesso(usuario: Usuario): void {
    this.modoEdicao = false;
    this.usuarioEditando = null;
    this.formulario = { nomeUser: usuario.nome, acesso: '', senha: '', email: usuario.email, role: usuario.role };
    this.mostrarModal = true;
    this.erro = '';
    this.sucesso = '';
  }

  abrirModalEdicao(usuario: Usuario): void {
    this.modoEdicao = true;
    this.usuarioEditando = usuario;
    this.formulario = { nomeUser: usuario.nome, acesso: usuario.acesso || '', senha: '', email: usuario.email, role: usuario.role };
    this.mostrarModal = true;
    this.erro = '';
    this.sucesso = '';
  }

  fecharModal(): void {
    this.mostrarModal = false;
    this.modoEdicao = false;
    this.usuarioEditando = null;
    this.formulario = { nomeUser: '', acesso: '', senha: '', email: '', role: 'USER' };
  }

  salvarUsuario(): void {
    if (!this.formulario.nomeUser.trim()) { this.erro = 'Nome é obrigatório'; return; }
    if (!this.formulario.email.trim()) { this.erro = 'Email é obrigatório'; return; }
    if (!this.formulario.acesso.trim()) { this.erro = 'Acesso é obrigatório'; return; }
    if (!this.modoEdicao && !this.formulario.senha.trim()) { this.erro = 'Senha é obrigatória'; return; }
    if (this.formulario.senha && this.formulario.senha.length < 6) { this.erro = 'Senha deve ter mínimo 6 caracteres'; return; }

    this.modoEdicao ? this.atualizarUsuario() : this.criarUsuario();
  }

  criarUsuario(): void {
    this.carregando = true;
    this.erro = '';
    this.usuarioService.criarUsuario({
      nomeUser: this.formulario.nomeUser,
      acesso: this.formulario.acesso,
      senha: this.formulario.senha,
      email: this.formulario.email,
      role: this.formulario.role,
    }).subscribe({
      next: () => {
        this.sucesso = 'Usuário criado com sucesso!';
        this.carregando = false;
        this.fecharModal();
        this.carregarUsuarios();
        setTimeout(() => (this.sucesso = ''), 3000);
      },
      error: (err) => {
        this.erro = err.error?.erros?.join(', ') || 'Erro ao criar usuário.';
        this.carregando = false;
      },
    });
  }

  atualizarUsuario(): void {
    if (!this.usuarioEditando) return;
    this.carregando = true;
    this.erro = '';
    this.usuarioService.atualizarUsuario(this.usuarioEditando.id, {
      nomeUser: this.formulario.nomeUser,
      acesso: this.formulario.acesso,
      email: this.formulario.email,
      role: this.formulario.role,
      senha: this.formulario.senha,
    }).subscribe({
      next: () => {
        this.sucesso = 'Usuário atualizado com sucesso!';
        this.carregando = false;
        this.fecharModal();
        this.carregarUsuarios();
        setTimeout(() => (this.sucesso = ''), 3000);
      },
      error: (err) => {
        this.erro = err.error?.erros?.join(', ') || 'Erro ao atualizar usuário.';
        this.carregando = false;
      },
    });
  }

  // ── Modal exclusão ────────────────────────────────────────────────────────

  abrirModalExclusao(usuario: Usuario): void {
    this.usuarioParaExcluir = usuario;
    this.mostrarModalExclusao = true;
    this.erro = '';
  }

  fecharModalExclusao(): void {
    this.mostrarModalExclusao = false;
    this.usuarioParaExcluir = null;
  }

  confirmarExclusao(): void {
    if (!this.usuarioParaExcluir) return;
    this.carregando = true;
    this.usuarioService.deletarUsuario(this.usuarioParaExcluir.id).subscribe({
      next: () => {
        this.sucesso = 'Usuário excluído com sucesso!';
        this.carregando = false;
        this.fecharModalExclusao();
        this.carregarUsuarios();
        setTimeout(() => (this.sucesso = ''), 3000);
      },
      error: () => {
        this.erro = 'Erro ao excluir usuário.';
        this.carregando = false;
        this.fecharModalExclusao();
      },
    });
  }

  // ── Expand inline de clínicas ─────────────────────────────────────────────

  toggleExpandir(usuario: Usuario): void {
    if (this.expandidos.has(usuario.id)) {
      this.expandidos.delete(usuario.id);
      return;
    }
    this.expandidos.add(usuario.id);
    if (!this.clinicasCacheadas.has(usuario.id)) {
      this.carregandoExpand.add(usuario.id);
      this.usuarioService.buscarUsuarioDetalhe(usuario.id).subscribe({
        next: (detalhe) => {
          this.clinicasCacheadas.set(usuario.id, detalhe?.unidades || []);
          this.carregandoExpand.delete(usuario.id);
        },
        error: () => this.carregandoExpand.delete(usuario.id),
      });
    }
  }

  getClinicasExpandidas(id: number): UnidadeUsuario[] {
    return this.clinicasCacheadas.get(id) || [];
  }

  // ── Modal clínicas ────────────────────────────────────────────────────────

  abrirModalClinicas(usuario: Usuario): void {
    this.usuarioClinicas = usuario;
    this.mostrarModalClinicas = true;
    this.erroClinica = '';
    this.novaClinicaId = undefined;
    this.carregarClinicasDoUsuario(usuario.id);
  }

  fecharModalClinicas(): void {
    this.mostrarModalClinicas = false;
    this.usuarioClinicas = null;
    this.unidadesDoUsuario = [];
    this.erroClinica = '';
    this.novaClinicaId = undefined;
  }

  carregarClinicasDoUsuario(id: number): void {
    this.carregandoClinicas = true;
    this.usuarioService.buscarUsuarioDetalhe(id).subscribe({
      next: (usuario) => {
        const unidades = usuario?.unidades || [];
        this.unidadesDoUsuario = unidades;
        this.clinicasCacheadas.set(id, unidades);
        this.carregandoClinicas = false;
      },
      error: () => {
        this.erroClinica = 'Erro ao carregar clínicas.';
        this.carregandoClinicas = false;
      },
    });
  }

  vincularClinica(): void {
    if (!this.novaClinicaId || !this.usuarioClinicas) return;
    const jaVinculada = this.unidadesDoUsuario.some(u => u.idUnidade === this.novaClinicaId);
    if (jaVinculada) { this.erroClinica = 'Esta clínica já está vinculada.'; return; }

    this.carregandoClinicas = true;
    this.erroClinica = '';
    this.usuarioService.vincularClinica(this.usuarioClinicas.id, this.novaClinicaId).subscribe({
      next: () => {
        this.novaClinicaId = undefined;
        this.clinicasCacheadas.delete(this.usuarioClinicas!.id);
        this.carregarClinicasDoUsuario(this.usuarioClinicas!.id);
        this.carregarUsuarios();
      },
      error: (err) => {
        this.erroClinica = err.error?.mensagem || 'Erro ao vincular clínica.';
        this.carregandoClinicas = false;
      },
    });
  }

  desvincularClinica(idUnidade: number): void {
    if (!this.usuarioClinicas) return;
    this.carregandoClinicas = true;
    this.usuarioService.desvincularClinica(this.usuarioClinicas.id, idUnidade).subscribe({
      next: () => {
        this.clinicasCacheadas.delete(this.usuarioClinicas!.id);
        this.carregarClinicasDoUsuario(this.usuarioClinicas!.id);
        this.carregarUsuarios();
      },
      error: () => {
        this.erroClinica = 'Erro ao desvincular clínica.';
        this.carregandoClinicas = false;
      },
    });
  }

  clinicasDisponiveis(): Unidade[] {
    return this.unidades.filter(u => !this.unidadesDoUsuario.some(uu => uu.idUnidade === u.iD_UNIDADE));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getRoleName(role: string): string {
    const roles: { [key: string]: string } = { ADMIN: 'Administrador', USER: 'Usuário' };
    return roles[role] || role;
  }
}
