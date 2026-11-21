import pg from 'pg';

// design.md §2.3 (D-18, DD-07): OID de los tipos que la API lee de PostgreSQL.
const OID_INT8 = 20;
const OID_NUMERIC = 1700;
const OID_TIMESTAMPTZ = 1184;

/**
 * `int8` y `numeric` llegan como texto. Se convierten a number solo si el resultado es un
 * entero seguro; si no, se lanza en vez de perder precisión en silencio (RNF-09). El error
 * no lleva el valor: puede ser un monto.
 */
function enteroSeguro(texto: string): number {
  const numero = Number(texto);
  if (!Number.isSafeInteger(numero)) {
    throw new RangeError('Valor numérico de PostgreSQL fuera del rango de enteros seguros');
  }
  return numero;
}

/** DD-07: el texto de timestamptz tal cual, con sus microsegundos; nunca Date. */
function textoSinCambios(texto: string): string {
  return texto;
}

/** Registra los parsers en el módulo pg que comparten TypeORM y la API. Idempotente. */
export function registrarParsers(): void {
  pg.types.setTypeParser(OID_INT8, enteroSeguro);
  pg.types.setTypeParser(OID_NUMERIC, enteroSeguro);
  pg.types.setTypeParser(OID_TIMESTAMPTZ, textoSinCambios);
}
