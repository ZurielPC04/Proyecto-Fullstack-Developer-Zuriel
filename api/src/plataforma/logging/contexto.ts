import { AsyncLocalStorage } from 'node:async_hooks';

/** design.md §10.1: contexto de la petición, sin pasarlo por parámetro (DD-39). */
export interface ContextoPeticion {
  reqId: string;
  /** Lo fija `autenticar` (T-API-10 en adelante). */
  usuarioId?: string;
}

export const contextoPeticion = new AsyncLocalStorage<ContextoPeticion>();
