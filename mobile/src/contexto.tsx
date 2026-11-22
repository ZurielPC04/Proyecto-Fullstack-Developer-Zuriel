// Dependencias de la app para las pantallas: la sesión, el cliente de la API y su URL.
import { createContext, useContext } from 'react';
import type { Cliente } from './api/cliente';
import type { Sesion } from './auth/sesion';

export type ContextoApp = { apiUrl: string; sesion: Sesion; cliente: Cliente };

const Contexto = createContext<ContextoApp | null>(null);

export const ProveedorApp = Contexto.Provider;

export function useApp(): ContextoApp {
  const valor = useContext(Contexto);
  if (valor === null) throw new Error('useApp fuera de ProveedorApp');
  return valor;
}
