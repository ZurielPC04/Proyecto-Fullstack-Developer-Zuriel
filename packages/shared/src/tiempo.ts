// Instantes (DD-07, DD-22, design.md §13.1): se opera sobre el texto, nunca con Date,
// para conservar los microsegundos de PostgreSQL.

/** R-6.5, R-5.5: la única zona para calcular ventanas; todo se guarda en UTC (RNF-10). */
export const ZONA_HORARIA = 'America/Mexico_City';

/** DD-22: texto de timestamptz de pg (TimeZone=UTC) → ISO 8601 con 6 decimales y Z. */
const TIMESTAMPTZ_UTC = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?\+00$/;

export function instanteIso(textoPg: string): string {
  const partes = TIMESTAMPTZ_UTC.exec(textoPg);
  if (!partes) {
    // DD-07 fija TimeZone=UTC en la conexión; otro sufijo es un error de configuración.
    throw new Error(`instanteIso espera un timestamptz en UTC (sufijo +00); llegó "${textoPg}"`);
  }
  const [, fecha = '', hora = '', fraccion = ''] = partes;
  return `${fecha}T${hora}.${fraccion.padEnd(6, '0')}Z`;
}
