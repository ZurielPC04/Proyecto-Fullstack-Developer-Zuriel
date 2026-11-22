// design.md §13.2 "Datos del servidor": los saldos y el límite solo llegan por TanStack Query;
// la web nunca los recalcula ni los actualiza a mano (DD-43, R-6.7).
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/cliente';

export function useCuentas() {
  return useQuery({ queryKey: ['cuentas'], queryFn: () => api.get('/cuentas') });
}

export function useLimites() {
  return useQuery({ queryKey: ['limites'], queryFn: () => api.get('/limites') });
}
