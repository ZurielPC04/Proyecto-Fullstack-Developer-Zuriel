import { mensajeDeProblema } from '@billetera/shared';
import { ErrorApi, ErrorRed } from './errores';

export const MENSAJE_SIN_RED =
  'No pudimos contactar al servidor. Revisa tu conexión e inténtalo de nuevo.';

/** Texto para el usuario de cualquier error de una petición (R-4.12, §13.1). */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorRed) return MENSAJE_SIN_RED;
  if (error instanceof ErrorApi) return mensajeDeProblema(error.problema?.type ?? 'internal-error');
  return mensajeDeProblema('internal-error');
}
