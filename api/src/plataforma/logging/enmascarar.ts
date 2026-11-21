// design.md §10.1 y DD-39: enmascarado compartido por el logger y la auditoría.

const OCULTO_CORREO = '***';
const CLABE = /^\d{18}$/;

/** `ana@dominio.mx` → `a***@dominio.mx`: primera letra y dominio. */
export function enmascararCorreo(correo: string): string {
  const arroba = correo.lastIndexOf('@');
  if (arroba <= 0) return OCULTO_CORREO;
  // Primer code point, para no partir una letra fuera del BMP.
  const [primera] = correo.slice(0, arroba);
  return `${primera}${OCULTO_CORREO}${correo.slice(arroba)}`;
}

/** `012180001234561234` → `**************1234`: solo los últimos 4 dígitos. */
export function enmascararClabe(clabe: string): string {
  if (!CLABE.test(clabe)) return '*'.repeat(18);
  return `${'*'.repeat(14)}${clabe.slice(-4)}`;
}
