import { mensajeDeError } from '../api/mensaje-error';

/** RNF-17: estado de error de una pantalla, con su mensaje y el botón "Reintentar". */
export function ErrorConReintento({
  titulo,
  error,
  alReintentar,
}: {
  titulo: string;
  error: unknown;
  alReintentar: () => void;
}) {
  return (
    <div role="alert" className="error">
      <p>
        {titulo} {mensajeDeError(error)}
      </p>
      <button type="button" onClick={alReintentar}>
        Reintentar
      </button>
    </div>
  );
}
