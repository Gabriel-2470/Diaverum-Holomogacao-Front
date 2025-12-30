export interface User {
  idUser: number;
  nome: string;
  email: string;
  acesso: string;
  role: string;
}

export interface LoginRequest {
  login: string; // Email ou Acesso
  senha: string;
}

export interface Unidade {
  idUnidade: number;
  descricao: string;
  unidadePadrao: boolean;
}

export interface LoginResponse {
  idUser: number;
  nome: string;
  email: string;
  acesso: string;
  role: string;
  unidades: Unidade[];
  requerSelecaoUnidade: boolean;
}
