import { ZONA_HORARIA } from '@billetera/shared';

const FORMATO = new Intl.DateTimeFormat('es-MX', {
  timeZone: ZONA_HORARIA,
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * design.md §13.2 "Montos y fechas": el instante de la API en America/Mexico_City. Pasar por
 * `Date` es aceptable porque solo se muestra; el cursor nunca pasa por aquí (D-11).
 */
export function formatearFecha(instante: string): string {
  return FORMATO.format(new Date(instante));
}
