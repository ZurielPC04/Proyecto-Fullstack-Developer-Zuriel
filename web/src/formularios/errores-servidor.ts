import { mensajeDeProblema } from '@billetera/shared';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ErrorApi } from '../api/errores';
import { mensajeDeError } from '../api/mensaje-error';

type ErrorDeCampo = { campo: string; mensaje: string };

function erroresDeCampo(error: ErrorApi): ErrorDeCampo[] {
  const errores = error.problema?.errores;
  return Array.isArray(errores) ? (errores as ErrorDeCampo[]) : [];
}

/**
 * design.md §13.2: los errores del servidor van junto a su campo. Usa `errores[].campo`
 * (`body.<campo>`, §7.3) o, si el problem no trae `errores`, el campo que `porTipo` asigna a su
 * `type`. Pone el foco en el primer campo con error (RNF-19). Devuelve el mensaje para el
 * formulario cuando el error no es de ningún campo, o null si quedó en un campo.
 */
export function aplicarErrorDelServidor<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  campos: readonly Path<T>[],
  porTipo: Partial<Record<string, Path<T>>> = {},
): string | null {
  if (!(error instanceof ErrorApi)) return mensajeDeError(error);

  let enCampo = false;
  for (const { campo, mensaje } of erroresDeCampo(error)) {
    const nombre = campo.replace(/^body\./, '') as Path<T>;
    if (!campos.includes(nombre)) continue;
    setError(nombre, { type: 'servidor', message: mensaje }, { shouldFocus: !enCampo });
    enCampo = true;
  }
  if (enCampo) return null;

  const type = error.problema?.type ?? 'internal-error';
  const campo = porTipo[type];
  if (campo !== undefined) {
    setError(campo, { type: 'servidor', message: mensajeDeProblema(type) }, { shouldFocus: true });
    return null;
  }
  return mensajeDeError(error);
}
