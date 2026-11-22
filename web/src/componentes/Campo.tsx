import type { InputHTMLAttributes } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  etiqueta: string;
  error?: string | undefined;
  registro: UseFormRegisterReturn;
};

/**
 * RNF-19 (§13.2 "Accesibilidad"): `<label>` asociado; el error va en un elemento enlazado con
 * `aria-describedby` y el campo se marca con `aria-invalid`.
 */
export function Campo({ id, etiqueta, error, registro, ...resto }: Props) {
  const idError = `${id}-error`;
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        {...resto}
        {...registro}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? idError : undefined}
      />
      {error ? (
        <p id={idError} className="error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
