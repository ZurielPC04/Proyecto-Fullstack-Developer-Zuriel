import { QueryClient } from '@tanstack/react-query';
import { ErrorApi } from '../api/errores';

/** design.md §13.2: un reintento para las consultas, salvo respuestas 4xx. */
export function debeReintentar(fallos: number, error: unknown): boolean {
  if (error instanceof ErrorApi && error.status >= 400 && error.status < 500) return false;
  return fallos < 1;
}

/** design.md §13.2: staleTime de 30 s y ningún reintento automático en mutaciones. */
export function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: debeReintentar },
      mutations: { retry: false },
    },
  });
}
