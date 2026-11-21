import { describe, expect, it } from 'vitest';
import { crearConTransaccion } from '../../../src/plataforma/db/unidad-de-trabajo.js';
import { crearLogger } from '../../../src/plataforma/logging/logger.js';
import { RelojBaseDatos } from '../../../src/plataforma/reloj/index.js';
import { abrirDataSource } from '../apoyo/base.js';

// Texto de timestamptz en UTC con la fracción opcional que PostgreSQL emite (1 a 6 dígitos).
const TEXTO_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?\+00$/;

describe('RelojBaseDatos', () => {
  it('RNF-10 DD-07 DD-36: lee clock_timestamp() de la transacción como texto UTC, y avanza dentro de ella', async () => {
    const dataSource = await abrirDataSource();
    try {
      const conTransaccion = crearConTransaccion({
        dataSource,
        logger: crearLogger({ nivel: 'silent' }),
      });
      const reloj = new RelojBaseDatos();
      const [antes, despues] = await conTransaccion(async (tx) => {
        const primero = await reloj.ahora(tx);
        await tx.query('SELECT pg_sleep(0.01)');
        return [primero, await reloj.ahora(tx)];
      });
      expect(antes).toMatch(TEXTO_UTC);
      expect(despues).toMatch(TEXTO_UTC);
      // clock_timestamp(), no now(): dentro de la misma transacción el instante avanza (DD-36).
      expect(despues > antes).toBe(true);
    } finally {
      await dataSource.destroy();
    }
  });
});
