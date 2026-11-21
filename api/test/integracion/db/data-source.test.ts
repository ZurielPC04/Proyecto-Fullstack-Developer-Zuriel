import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirDataSource, urlDueno } from '../apoyo/base.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

async function valor(sql: string): Promise<unknown> {
  const filas = (await dataSource.query(sql)) as { v: unknown }[];
  return filas[0]?.v;
}

describe('crearDataSource: parsers de pg', () => {
  it.each(['int8', 'numeric'])('RNF-09: %s con 2^53 − 1 llega como number exacto', async (tipo) => {
    await expect(valor(`SELECT 9007199254740991::${tipo} AS v`)).resolves.toBe(9007199254740991);
  });

  it.each(['int8', 'numeric'])(
    'RNF-09: %s con 2^53 lanza en vez de perder precisión',
    async (tipo) => {
      await expect(valor(`SELECT 9007199254740992::${tipo} AS v`)).rejects.toThrow();
    },
  );

  it('RNF-09: un numeric con decimales lanza: los montos son enteros', async () => {
    await expect(valor('SELECT 1.5::numeric AS v')).rejects.toThrow();
  });

  it('RNF-09: SUM(bigint), que devuelve numeric, llega como number', async () => {
    await expect(
      valor('SELECT SUM(x) AS v FROM (VALUES (5000000::int8), (-250::int8)) t(x)'),
    ).resolves.toBe(4999750);
  });

  it('RNF-09: un int8 NULL sigue siendo null', async () => {
    await expect(valor('SELECT NULL::int8 AS v')).resolves.toBeNull();
  });

  it('DD-07 RNF-10: un timestamptz llega como texto en UTC y conserva los microsegundos', async () => {
    await expect(valor("SELECT '2026-11-14 10:05:09.123456-06'::timestamptz AS v")).resolves.toBe(
      '2026-11-14 16:05:09.123456+00',
    );
  });

  it('RNF-10: la sesión corre con TimeZone=UTC', async () => {
    await expect(valor("SELECT current_setting('TimeZone') AS v")).resolves.toBe('UTC');
  });

  it('RNF-16: synchronize es false y las migraciones van en la tabla migracion', () => {
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrationsTableName).toBe('migracion');
    expect(dataSource.options.migrationsTransactionMode).toBe('each');
  });

  // DD-05: solo las migraciones cambian el esquema. TypeORM instala por su cuenta "uuid-ossp"
  // al inicializar si una entidad usa @PrimaryGeneratedColumn('uuid'); los uuid los genera
  // gen_random_uuid() del núcleo (DD-11), así que no hace falta ninguna extensión.
  it('DD-05 RNF-16: inicializar el DataSource y correr las migraciones no instala uuid-ossp ni otras extensiones', async () => {
    const dueno = await abrirDataSource(urlDueno(), 1);
    try {
      await dueno.runMigrations({ transaction: 'each' });
      const filas = (await dueno.query(
        "SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY extname",
      )) as { extname: string }[];
      expect(filas).toEqual([]);
    } finally {
      await dueno.destroy();
    }
  });
});
