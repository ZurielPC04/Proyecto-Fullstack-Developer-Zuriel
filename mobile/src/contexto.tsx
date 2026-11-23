// Dependencias de la app para las pantallas: la sesión, el cliente de la API, su URL y el motor
// de la transferencia.
import { createContext, useContext } from 'react';
import type { Cliente } from './api/cliente';
import type { Sesion } from './auth/sesion';
import type { Motor } from './transferencia/motor';

export type ContextoApp = { apiUrl: string; sesion: Sesion; cliente: Cliente; motor: Motor };

const Contexto = createContext<ContextoApp | null>(null);

export const ProveedorApp = Contexto.Provider;

export function useApp(): ContextoApp {
  const valor = useContext(Contexto);
  if (valor === null) throw new Error('useApp fuera de ProveedorApp');
  return valor;
}
