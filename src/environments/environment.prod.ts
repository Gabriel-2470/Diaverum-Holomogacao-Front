export const environment = {
  production: true,
  apiUrl: '/api',
  // Acesso à FICHA do prontuário sem login (hyperlink por CPF vindo de outro sistema).
  // Deve espelhar Prontuario:AcessoAnonimo do backend; a busca continua exigindo login.
  prontuarioAcessoAnonimo: true,
  // Escrita nativa de SESSÕES de HD na aba Ver HD/DP (registro assistencial manual).
  // A sessão normalmente vem da máquina; esta UI só aparece com a flag ligada E logado.
  // Deve espelhar a flag backend correspondente. Default FALSE (fica atrás da flag).
  prontuarioSessaoNativa: false,
};
