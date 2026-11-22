import { esquemaConfirmacion, formatearMXN } from '@billetera/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Campo } from '../componentes/Campo';
import { formatearFecha } from '../formato/fecha';

type Props = {
  montoCentavos: number;
  destino: string;
  codigoExpiraEn: string;
  codigoSimulado: string | undefined;
  /** ConfirmandoCodigo: "Confirmar" queda deshabilitado con `aria-busy` (R-4.21). */
  ocupado: boolean;
  /** CapturandoCodigo tras un `422 codigo-incorrecto`, con los intentos restantes (R-6.11). */
  errorCodigo: string | null;
  intentosRestantes: number | null;
  /** ErrorConfirmacion: red, timeout, 5xx o 401; se reintenta la confirmación (§13.2). */
  errorConfirmacion: string | null;
  alConfirmar: (codigo: string) => void;
};

/**
 * R-6.18: captura del código de una transferencia pendiente (design.md §13.2). Cubre
 * CapturandoCodigo, ConfirmandoCodigo y ErrorConfirmacion, para que el campo conserve lo
 * capturado entre fases. Los intentos restantes se anuncian en una región `aria-live`.
 */
export function PantallaCodigo({
  montoCentavos,
  destino,
  codigoExpiraEn,
  codigoSimulado,
  ocupado,
  errorCodigo,
  intentosRestantes,
  errorConfirmacion,
  alConfirmar,
}: Props) {
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm({ resolver: zodResolver(esquemaConfirmacion), defaultValues: { codigo: '' } });

  // RNF-19: al fallar el envío, el foco va al campo con error.
  useEffect(() => {
    if (errorCodigo !== null) setFocus('codigo');
  }, [errorCodigo, setFocus]);

  const reintentar = errorConfirmacion !== null;
  const enviar = reintentar
    ? (evento: React.FormEvent<HTMLFormElement>) => {
        evento.preventDefault();
        alConfirmar('');
      }
    : handleSubmit(({ codigo }) => alConfirmar(codigo));

  return (
    <>
      <h1>Código de confirmación</h1>
      <p>
        Para enviar {formatearMXN(montoCentavos)} a {destino}, escribe el código de 6 dígitos que te
        enviamos. Vence el {formatearFecha(codigoExpiraEn)}.
      </p>
      {/* DD-25: solo existe con OTP_SIMULADO=true; nunca en producción. */}
      {codigoSimulado ? (
        <p className="aviso">
          Modo de prueba: tu código es <strong>{codigoSimulado}</strong>
        </p>
      ) : null}
      <form onSubmit={enviar} noValidate aria-label="Confirmación con código">
        <Campo
          id="transferencia-codigo"
          etiqueta="Código"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          registro={register('codigo')}
          error={errors.codigo?.message ?? errorCodigo ?? undefined}
          readOnly={ocupado || reintentar}
        />
        {reintentar ? (
          <p role="alert" className="error">
            {errorConfirmacion} Puedes reintentar con el mismo código.
          </p>
        ) : null}
        <button type="submit" disabled={ocupado} aria-busy={ocupado}>
          {reintentar ? 'Reintentar' : 'Confirmar'}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {intentosRestantes === null
          ? ''
          : intentosRestantes === 1
            ? 'Te queda 1 intento.'
            : `Te quedan ${intentosRestantes} intentos.`}
      </p>
    </>
  );
}
