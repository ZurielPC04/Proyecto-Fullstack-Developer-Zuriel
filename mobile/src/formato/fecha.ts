import { ZONA_HORARIA } from '@billetera/shared';

let formato: Intl.DateTimeFormat | null | undefined;

function obtenerFormato(): Intl.DateTimeFormat | null {
  if (formato === undefined) {
    try {
      formato = new Intl.DateTimeFormat('es-MX', {
        timeZone: ZONA_HORARIA,
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      formato = null;
    }
  }
  return formato;
}

/**
 * El instante de la API en America/Mexico_City, como en la web (§13.2). Pasar por `Date` es
 * aceptable porque solo se muestra (D-11). Si el motor no soporta la zona, muestra el instante
 * tal cual en lugar de lanzar (Hermes, como con `formatToParts`, D-18 punto 5).
 */
export function formatearFecha(instante: string): string {
  const f = obtenerFormato();
  if (f === null) return instante;
  try {
    return f.format(new Date(instante));
  } catch {
    return instante;
  }
}
