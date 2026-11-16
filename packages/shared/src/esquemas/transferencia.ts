import { z } from 'zod';
import { TOPE_CENTAVOS } from '../dinero.js';
import { textoCorto, uuid } from './texto.js';

// DD-26: cada rama es estricta, así que no admite "ninguno" ni "los dos".
const destino = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('BENEFICIARIO'), beneficiarioId: uuid() }).strict(),
  z.object({ tipo: z.literal('CUENTA_PROPIA'), cuentaId: uuid() }).strict(),
]);

// R-4.8 y D-18: entero JSON en centavos; .int() también rechaza NaN e Infinity.
const montoCentavos = z
  .number()
  .int('Debe ser un entero en centavos.')
  .min(1, 'Debe ser mayor que 0.')
  .max(TOPE_CENTAVOS, 'Supera el tope.');

export const esquemaTransferencia = z
  .object({
    cuentaOrigenId: uuid(),
    destino,
    montoCentavos,
    concepto: textoCorto(1, 40),
    // DD-16: de 1 a 7 dígitos, como texto para conservar los ceros a la izquierda.
    referencia: z.string().regex(/^[0-9]{1,7}$/, 'Debe tener de 1 a 7 dígitos.'),
  })
  .strict();

export const esquemaConfirmacion = z
  .object({ codigo: z.string().regex(/^[0-9]{6}$/, 'Debe tener 6 dígitos.') })
  .strict();

// R-4.13 y D-03: el header Idempotency-Key es un UUID.
export const esquemaIdempotencyKey = uuid();
