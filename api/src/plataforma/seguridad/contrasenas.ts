import argon2 from 'argon2';

/** design.md §5.1: hash y verificación de contraseñas. Las pruebas pueden envolverlo. */
export interface Contrasenas {
  hash(contrasena: string): Promise<string>;
  verificar(hash: string, contrasena: string): Promise<boolean>;
}

/** DD-28: argon2id con el mínimo de OWASP (19 MiB, t = 2, p = 1). */
const PARAMETROS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * DD-28: NFC antes de calcular y de verificar, para que la misma contraseña escrita con un
 * acento compuesto o precompuesto dé el mismo resultado. El esquema de shared ya la
 * normaliza; repetirlo aquí deja la regla en el único lugar que toca el hash.
 */
export const contrasenasArgon2: Contrasenas = {
  hash: (contrasena) => argon2.hash(contrasena.normalize('NFC'), PARAMETROS),
  verificar: (hash, contrasena) => argon2.verify(hash, contrasena.normalize('NFC')),
};
