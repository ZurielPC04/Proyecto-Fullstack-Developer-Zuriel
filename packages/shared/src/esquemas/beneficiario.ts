import { z } from 'zod';
import { validarClabe } from '../clabe.js';
import { textoCorto } from './texto.js';

// R-3.2 a R-3.4: la misma validación que el formulario. Estricta: no quita espacios.
export const clabe = z.string().check((ctx) => {
  const resultado = validarClabe(ctx.value);
  if (!resultado.ok) {
    ctx.issues.push({ code: 'custom', message: resultado.error, input: ctx.value });
  }
});

export const esquemaBeneficiario = z
  .object({
    nombre: textoCorto(1, 100),
    alias: textoCorto(1, 40),
    clabe,
  })
  .strict();
