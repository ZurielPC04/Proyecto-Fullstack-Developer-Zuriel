import { z } from 'zod';

// R-5.2: el query string llega como texto; solo dígitos sin ceros a la izquierda ni exponente.
const limite = z
  .string()
  .regex(/^[1-9][0-9]{0,2}$/, 'Debe ser un entero de 1 a 100.')
  .transform(Number)
  .pipe(z.number().int().min(1, 'Debe ser al menos 1.').max(100, 'Debe ser como máximo 100.'))
  .default(20);

// R-5.5 y D-15: días de calendario AAAA-MM-DD; z.iso.date() rechaza días inexistentes.
const dia = z.iso.date('Debe ser una fecha AAAA-MM-DD válida.');

// R-5.6 y DD-13: solo los cinco tipos de usuario; FONDEO_SALIDA no se expone.
const tipo = z.enum(['DEPOSITO', 'ENVIO', 'RECEPCION', 'TRASPASO_SALIDA', 'TRASPASO_ENTRADA']);

// Ningún campo admite arreglos: un parámetro repetido da 400.
export const esquemaQueryMovimientos = z
  .object({
    limite,
    // R-5.7: la forma del cursor es un error de validación; su contenido, invalid-cursor.
    cursor: z
      .string()
      .min(1, 'El cursor no puede ir vacío.')
      .max(512, 'Cursor demasiado largo.')
      .optional(),
    desde: dia.optional(),
    hasta: dia.optional(),
    tipo: tipo.optional(),
  })
  .strict()
  // R-5.5: AAAA-MM-DD se compara bien como texto.
  .refine((q) => q.desde === undefined || q.hasta === undefined || q.desde <= q.hasta, {
    message: 'hasta no puede ser anterior a desde.',
    path: ['hasta'],
  });

// R-B1.5: AAAA-MM con un mes de 01 a 12.
export const esquemaQueryEstadoCuenta = z
  .object({
    mes: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, 'Debe ser un mes AAAA-MM válido.'),
  })
  .strict();
