import pg from 'pg';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Reintentable } from '../../../src/plataforma/http/errores.js';
import {
  crearConTransaccion,
  type ConTransaccion,
} from '../../../src/plataforma/db/unidad-de-trabajo.js';
import { crearLogger } from '../../../src/plataforma/logging/logger.js';
import { abrirDataSource, urlApp } from '../apoyo/base.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

function unidadConLog(): {
  conTransaccion: ConTransaccion;
  registros: () => Record<string, unknown>[];
} {
  const lineas: string[] = [];
  const logger = crearLogger({
    nivel: 'info',
    destino: { write: (l: string) => void lineas.push(l) },
  });
  return {
    conTransaccion: crearConTransaccion({ dataSource, logger }),
    registros: () => lineas.map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

function diferido(): { promesa: Promise<void>; resolver: () => void } {
  let resolver = () => {};
  const promesa = new Promise<void>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

async function uno<T>(tx: { query: (sql: string) => Promise<unknown> }, sql: string): Promise<T> {
  const filas = (await tx.query(sql)) as T[];
  return filas[0] as T;
}

describe('conTransaccion', () => {
  it('RNF-08: corre en READ COMMITTED con lock_timeout 5s y statement_timeout 10s', async () => {
    const { conTransaccion } = unidadConLog();
    const ajustes = await conTransaccion(async (tx) => ({
      aislamiento: (
        await uno<{ v: string }>(tx, "SELECT current_setting('transaction_isolation') AS v")
      ).v,
      lockTimeout: (await uno<{ v: string }>(tx, "SELECT current_setting('lock_timeout') AS v")).v,
      statementTimeout: (
        await uno<{ v: string }>(tx, "SELECT current_setting('statement_timeout') AS v")
      ).v,
    }));
    expect(ajustes).toEqual({
      aislamiento: 'read committed',
      lockTimeout: '5s',
      statementTimeout: '10s',
    });
  });

  it('RNF-08: los timeouts son SET LOCAL: fuera de la transacción vuelven a su valor', async () => {
    const { conTransaccion } = unidadConLog();
    await conTransaccion(async () => undefined);
    const filas = (await dataSource.query("SELECT current_setting('lock_timeout') AS v")) as {
      v: string;
    }[];
    expect(filas[0]?.v).toBe('0');
  });

  it('RNF-08: devuelve el resultado de trabajo', async () => {
    const { conTransaccion } = unidadConLog();
    await expect(
      conTransaccion(async (tx) => uno<{ v: number }>(tx, 'SELECT 41 + 1 AS v')),
    ).resolves.toEqual({
      v: 42,
    });
  });

  it('RNF-08: un 23505 se propaga con su código y el nombre de la restricción', async () => {
    const { conTransaccion } = unidadConLog();
    const error = await conTransaccion(async (tx) => {
      await tx.query(
        'CREATE TEMP TABLE prueba_unica (x int CONSTRAINT uq_prueba_x PRIMARY KEY) ON COMMIT DROP',
      );
      await tx.query('INSERT INTO prueba_unica VALUES (1)');
      await tx.query('INSERT INTO prueba_unica VALUES (1)');
    }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(Reintentable);
    expect(error).toMatchObject({ code: '23505', constraint: 'uq_prueba_x' });
  });

  it('R-4.19: statement_timeout agotado (pg_sleep(11)) se traduce a Reintentable', async () => {
    const { conTransaccion } = unidadConLog();
    const error = await conTransaccion(async (tx) => tx.query('SELECT pg_sleep(11)')).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Reintentable);
    expect((error as Error).cause).toMatchObject({ code: '57014' });
  });

  it('R-4.19: lock_timeout agotado (advisory lock retenido por otra conexión) se traduce a Reintentable en unos 5 s', async () => {
    const otra = new pg.Client({ connectionString: urlApp() });
    await otra.connect();
    try {
      await otra.query('SELECT pg_advisory_lock(1)');
      const { conTransaccion } = unidadConLog();
      const inicio = Date.now();
      const error = await conTransaccion(async (tx) =>
        tx.query('SELECT pg_advisory_lock(1)'),
      ).catch((e: unknown) => e);
      const segundos = (Date.now() - inicio) / 1000;
      expect(error).toBeInstanceOf(Reintentable);
      expect((error as Error).cause).toMatchObject({ code: '55P03' });
      expect(segundos).toBeGreaterThanOrEqual(4.5);
      expect(segundos).toBeLessThan(9);
    } finally {
      await otra.query('SELECT pg_advisory_unlock_all()');
      await otra.end();
    }
  });

  it('RNF-08: un deadlock real se reintenta, las dos transacciones terminan y queda un warn', async () => {
    const { conTransaccion, registros } = unidadConLog();
    const aTomoUno = diferido();
    const bTomoDos = diferido();
    let intentosA = 0;
    let intentosB = 0;

    const a = conTransaccion(async (tx) => {
      intentosA++;
      await tx.query('SELECT pg_advisory_xact_lock(1)');
      if (intentosA === 1) {
        aTomoUno.resolver();
        await bTomoDos.promesa;
      }
      await tx.query('SELECT pg_advisory_xact_lock(2)');
      return 'a';
    });
    const b = conTransaccion(async (tx) => {
      intentosB++;
      await tx.query('SELECT pg_advisory_xact_lock(2)');
      if (intentosB === 1) {
        bTomoDos.resolver();
        await aTomoUno.promesa;
      }
      await tx.query('SELECT pg_advisory_xact_lock(1)');
      return 'b';
    });

    await expect(Promise.all([a, b])).resolves.toEqual(['a', 'b']);
    expect(intentosA + intentosB).toBe(3);
    const avisos = registros().filter((r) => r['level'] === 40);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ sqlstate: '40P01', intento: 1 });
  });

  it('RNF-08 R-4.19: un deadlock que persiste tras 3 reintentos se traduce a Reintentable', async () => {
    const { conTransaccion, registros } = unidadConLog();
    let intentos = 0;
    const error = await conTransaccion(async () => {
      intentos++;
      throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Reintentable);
    expect(intentos).toBe(4);
    expect(registros().filter((r) => r['level'] === 40)).toHaveLength(3);
  });

  it('RNF-08: cualquier otro error se propaga tal cual, sin reintento', async () => {
    const { conTransaccion } = unidadConLog();
    let intentos = 0;
    const original = new Error('regla de negocio');
    const error = await conTransaccion(async () => {
      intentos++;
      throw original;
    }).catch((e: unknown) => e);
    expect(error).toBe(original);
    expect(intentos).toBe(1);
  });
});
