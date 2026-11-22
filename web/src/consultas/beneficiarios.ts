import type { SolicitudBeneficiario } from '@billetera/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/cliente';

export function useBeneficiarios() {
  return useQuery({ queryKey: ['beneficiarios'], queryFn: () => api.get('/beneficiarios') });
}

/** R-3.1: el alta vuelve a pedir `['beneficiarios']` al servidor; la lista no se edita a mano. */
export function useAltaBeneficiario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (solicitud: SolicitudBeneficiario) =>
      api.post('/beneficiarios', { body: solicitud }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['beneficiarios'] }),
  });
}
