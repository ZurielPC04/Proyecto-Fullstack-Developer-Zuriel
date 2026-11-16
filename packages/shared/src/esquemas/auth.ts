import { z } from 'zod';
import { CONTRASENAS_COMUNES } from './contrasenas-comunes.js';

// design.md §5.1: la lista ya viene en NFC y minúsculas.
const LISTA_COMUNES: ReadonlySet<string> = new Set(CONTRASENAS_COMUNES);

// DD-16 y §3.2: el correo se recorta y se pasa a minúsculas antes de validar.
const correo = z
  .string()
  .overwrite((s) => s.trim().toLowerCase())
  .pipe(
    z
      .email('Correo inválido.')
      .min(3, 'Debe tener al menos 3 caracteres.')
      .max(254, 'Debe tener como máximo 254 caracteres.'),
  );

const enNfc = () => z.string().overwrite((s) => s.normalize('NFC'));

// DD-28: sin recortar, en NFC, de 12 a 128 code points y fuera de la lista.
const contrasenaNueva = enNfc()
  .min(12, 'Debe tener al menos 12 caracteres.')
  .max(128, 'Debe tener como máximo 128 caracteres.')
  .refine((s) => !LISTA_COMUNES.has(s.toLowerCase()), 'Esta contraseña es demasiado común.');

function pareceAlCorreo(contrasena: string, correoNormalizado: string): boolean {
  const minusculas = contrasena.toLowerCase();
  const parteLocal = correoNormalizado.slice(0, correoNormalizado.lastIndexOf('@'));
  return minusculas === correoNormalizado || minusculas === parteLocal;
}

export const esquemaRegistro = z
  .object({ correo, contrasena: contrasenaNueva })
  .strict()
  .refine((d) => !pareceAlCorreo(d.contrasena, d.correo), {
    message: 'La contraseña no puede ser igual al correo.',
    path: ['contrasena'],
  });

// DD-28: el login no aplica la política, para no bloquear contraseñas creadas con una anterior.
export const esquemaLogin = z
  .object({
    correo,
    contrasena: enNfc()
      .min(1, 'La contraseña es obligatoria.')
      .max(128, 'Debe tener como máximo 128 caracteres.'),
    cliente: z.enum(['web', 'movil']),
  })
  .strict();

// DD-24: 256 bits en base64url sin relleno. Opcional: en la web viaja en la cookie.
export const esquemaRefresh = z
  .object({
    refreshToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, 'Refresh token inválido.')
      .optional(),
  })
  .strict();
