import type { UseFormRegisterReturn } from 'react-hook-form';

export type Opcion = { valor: string; etiqueta: string };

type Props = {
  id: string;
  leyenda: string;
  opciones: readonly Opcion[];
  error?: string | undefined;
  registro: UseFormRegisterReturn;
  disabled?: boolean;
};

/**
 * RNF-19: grupo de radios con `<legend>`, que se recorre con Tab y flechas. Cada radio tiene su
 * `<label>`; el error se enlaza con `aria-describedby` y los radios se marcan con `aria-invalid`.
 */
export function CampoOpciones({ id, leyenda, opciones, error, registro, disabled }: Props) {
  const idError = `${id}-error`;
  return (
    <fieldset className="campo opciones" disabled={disabled}>
      <legend>{leyenda}</legend>
      {opciones.map((opcion, i) => (
        <div key={opcion.valor} className="opcion">
          <input
            type="radio"
            id={`${id}-${i}`}
            value={opcion.valor}
            {...registro}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? idError : undefined}
          />
          <label htmlFor={`${id}-${i}`}>{opcion.etiqueta}</label>
        </div>
      ))}
      {error ? (
        <p id={idError} className="error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
