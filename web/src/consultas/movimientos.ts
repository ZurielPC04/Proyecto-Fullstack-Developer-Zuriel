import type { TipoMovimiento } from '@billetera/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api/cliente';

export type FiltrosMovimientos = {
  desde?: string | undefined;
  hasta?: string | undefined;
  tipo?: TipoMovimiento | undefined;
};

/**
 * design.md §13.2: `['movimientos', cuentaId, filtros]` con `useInfiniteQuery`. La página
 * siguiente se pide con el `siguienteCursor` opaco de la anterior (R-5.3, R-5.4); con `null`
 * ya no hay más.
 */
export function useMovimientos(cuentaId: string, filtros: FiltrosMovimientos) {
  return useInfiniteQuery({
    queryKey: ['movimientos', cuentaId, filtros],
    queryFn: ({ pageParam }) =>
      api.get('/cuentas/{cuentaId}/movimientos', {
        path: { cuentaId },
        query: { ...filtros, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.siguienteCursor ?? undefined,
  });
}
