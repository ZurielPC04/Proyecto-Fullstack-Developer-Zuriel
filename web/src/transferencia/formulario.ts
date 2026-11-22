// Formulario de transferencia (design.md §13.2 "Formularios" y "Montos y fechas", DD-03, D-18).
import { esquemaTransferencia, montoTextoACentavos } from '@billetera/shared';
import { z } from 'zod';

/** Lo que el usuario captura, tal cual: el monto es texto y el destino va codificado. */
export type ValoresFormulario = {
  cuentaOrigenId: string;
  destino: string;
  monto: string;
  concepto: string;
  referencia: string;
};

type Destino =
  { tipo: 'BENEFICIARIO'; beneficiarioId: string } | { tipo: 'CUENTA_PROPIA'; cuentaId: string };

/** El valor de un radio de destino: `BENEFICIARIO:<id>` o `CUENTA_PROPIA:<id>`. */
export function codificarDestino(destino: Destino): string {
  return destino.tipo === 'BENEFICIARIO'
    ? `BENEFICIARIO:${destino.beneficiarioId}`
    : `CUENTA_PROPIA:${destino.cuentaId}`;
}

function decodificarDestino(valor: string): Destino | null {
  const [tipo, id] = valor.split(':');
  if (id === undefined) return null;
  if (tipo === 'BENEFICIARIO') return { tipo, beneficiarioId: id };
  if (tipo === 'CUENTA_PROPIA') return { tipo, cuentaId: id };
  return null;
}

/**
 * Convierte la captura en la `SolicitudTransferencia` que valida `esquemaTransferencia` de
 * shared, sin copiarlo (DD-03). El monto pasa por `montoTextoACentavos`, sin multiplicar ni
 * redondear (R-4.33).
 */
export const esquemaFormulario = z
  .object({
    // Un grupo de radios sin elegir llega como null: el mensaje de tipo también es el propio.
    cuentaOrigenId: z
      .string({ error: 'Elige la cuenta de origen.' })
      .min(1, 'Elige la cuenta de origen.'),
    destino: z.string({ error: 'Elige el destino.' }).min(1, 'Elige el destino.'),
    monto: z.string().transform((texto, ctx) => {
      const resultado = montoTextoACentavos(texto);
      if (!resultado.ok) {
        ctx.addIssue({ code: 'custom', message: resultado.error });
        return z.NEVER;
      }
      return resultado.centavos;
    }),
    concepto: esquemaTransferencia.shape.concepto,
    referencia: esquemaTransferencia.shape.referencia,
  })
  .transform(({ cuentaOrigenId, destino, monto, concepto, referencia }, ctx) => {
    const decodificado = decodificarDestino(destino);
    if (decodificado === null) {
      ctx.addIssue({ code: 'custom', path: ['destino'], message: 'Elige el destino.' });
      return z.NEVER;
    }
    // R-4.4: la misma cuenta como origen y destino no se envía.
    if (decodificado.tipo === 'CUENTA_PROPIA' && decodificado.cuentaId === cuentaOrigenId) {
      ctx.addIssue({
        code: 'custom',
        path: ['destino'],
        message: 'La cuenta de origen y la de destino deben ser distintas.',
      });
      return z.NEVER;
    }
    return { cuentaOrigenId, destino: decodificado, montoCentavos: monto, concepto, referencia };
  })
  .pipe(esquemaTransferencia);
