import type { DataSource } from 'typeorm';

const LIMITE_MS = 2000;

/**
 * design.md §10.3: `SELECT 1` con un timeout corto, para GET /api/health. Lanza si la base
 * no contesta a tiempo o no está disponible; la ruta lo traduce a 503 retryable.
 */
export function crearVerificarBase(
  dataSource: DataSource,
  limiteMs = LIMITE_MS,
): () => Promise<void> {
  return async () => {
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_resolver, rechazar) => {
      temporizador = setTimeout(
        () => rechazar(new Error(`La base no contestó en ${limiteMs} ms`)),
        limiteMs,
      );
    });
    try {
      await Promise.race([dataSource.query('SELECT 1'), limite]);
    } finally {
      clearTimeout(temporizador);
    }
  };
}
