import { digitoVerificador } from '@billetera/shared';

/** design.md §3.6: banco ficticio 999 y plaza 180 para las cuentas de usuario. */
const PREFIJO_USUARIO = '999180';

/** §3.6: CLABE de usuario a partir de sus 11 dígitos de cuenta, con dígito verificador. */
export function clabeDeUsuario(cuenta11: string): string {
  if (!/^\d{11}$/.test(cuenta11)) throw new RangeError('La cuenta de la CLABE lleva 11 dígitos');
  const primeros = `${PREFIJO_USUARIO}${cuenta11}`;
  return `${primeros}${digitoVerificador(primeros)}`;
}
