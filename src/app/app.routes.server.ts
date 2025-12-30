import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'perfil/editar/**',
    renderMode: RenderMode.Client, // Rotas dinâmicas não podem ser prerendered
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
