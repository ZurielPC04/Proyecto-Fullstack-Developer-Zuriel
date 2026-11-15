// CLABE (D-19, DD-19, design.md §3.6 y §13.1): solo aritmética de enteros.

const PESOS = [3, 7, 1] as const;

/** R-3.4: dígito verificador de los primeros 17 dígitos de una CLABE. */
export function digitoVerificador(primeros17: string): number {
  if (!/^\d{17}$/.test(primeros17)) {
    throw new RangeError('digitoVerificador espera exactamente 17 dígitos');
  }
  let suma = 0;
  for (let i = 0; i < primeros17.length; i++) {
    suma += (Number(primeros17[i]) * PESOS[i % 3]!) % 10;
  }
  return (10 - (suma % 10)) % 10;
}

export type ResultadoClabe = { ok: true; clabe: string } | { ok: false; error: string };

/** R-3.2: valida una CLABE y reporta el primer fallo (§13.1). Estricta: no quita espacios. */
export function validarClabe(texto: string): ResultadoClabe {
  if (!/^\d*$/.test(texto)) return { ok: false, error: 'La CLABE solo admite números' };
  if (texto.length !== 18) return { ok: false, error: 'La CLABE debe tener 18 dígitos' };
  if (digitoVerificador(texto.slice(0, 17)) !== Number(texto[17])) {
    return { ok: false, error: 'El dígito verificador de la CLABE no es válido' };
  }
  return { ok: true, clabe: texto };
}
