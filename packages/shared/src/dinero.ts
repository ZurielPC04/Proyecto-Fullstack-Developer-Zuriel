// Montos sin redondeo (D-18, design.md §13.1): todo se procesa sobre el texto,
// sin aritmética de punto flotante.

/** Tope de monto en transporte (D-18, R-4.8). Cabe en Number.MAX_SAFE_INTEGER. */
export const TOPE_CENTAVOS = 100_000_000_000;

const FORMATO_MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Separa signo, pesos y centavos sobre el texto del entero, sin aritmética (§13.1). */
function separar(centavos: number): { signo: string; pesos: string; fraccion: string } {
  const texto = String(centavos);
  const signo = texto.startsWith('-') ? '-' : '';
  const digitos = texto.replace(/^-/, '').padStart(3, '0');
  return { signo, pesos: digitos.slice(0, -2), fraccion: digitos.slice(-2) };
}

/** R-2.5: los pesos (entero) se formatean con Intl como BigInt y la fracción se reemplaza por los centavos exactos. */
export function formatearMXN(centavos: number): string {
  const { signo, pesos, fraccion } = separar(centavos);
  const formateado = FORMATO_MXN.formatToParts(BigInt(pesos))
    .map((parte) => (parte.type === 'fraction' ? fraccion : parte.value))
    .join('');
  return signo + formateado;
}

/** R-B1.2: pesos con dos decimales para el CSV, sin Intl (DD-38). */
export function centavosATextoDecimal(centavos: number): string {
  const { signo, pesos, fraccion } = separar(centavos);
  return `${signo}${pesos}.${fraccion}`;
}

export type ResultadoMonto = { ok: true; centavos: number } | { ok: false; error: string };

// §13.1 paso 2. La fracción admite cualquier longitud aquí para poder distinguir
// el error "Máximo 2 decimales" del formato inválido.
const FORMATO_MONTO = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

export function montoTextoACentavos(texto: string): ResultadoMonto {
  const limpio = texto.replace(/^\$/, '').replaceAll(' ', '');
  const partes = FORMATO_MONTO.exec(limpio);
  if (!partes) return { ok: false, error: 'Monto inválido' };
  const [, entera = '', fraccion = ''] = partes;
  if (fraccion.length > 2) return { ok: false, error: 'Máximo 2 decimales' };
  const centavos = Number(entera.replaceAll(',', '') + fraccion.padEnd(2, '0'));
  if (centavos === 0) return { ok: false, error: 'El monto debe ser mayor que cero' };
  // Un texto más largo que el tope puede perder precisión al convertirse, pero
  // sigue siendo mayor que el tope, así que se rechaza igual.
  if (centavos > TOPE_CENTAVOS) return { ok: false, error: 'El monto supera el tope' };
  return { ok: true, centavos };
}
