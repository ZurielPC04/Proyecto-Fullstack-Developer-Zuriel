import 'reflect-metadata';
import { DataSource, Entity, PrimaryColumn } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { columnaInstante } from '../../../src/plataforma/db/columnas.js';
import { registrarParsers } from '../../../src/plataforma/db/parsers.js';
import { urlDueno } from '../apoyo/base.js';

// DD-07: entidad de sondeo para probar columnaInstante() antes de usarla en el modelo.
@Entity({ name: 'prueba_columna_instante' })
class Sonda {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @columnaInstante('creado_en')
  creadoEn!: string;
}

let dataSource: DataSource;

beforeAll(async () => {
  registrarParsers();
  dataSource = new DataSource({
    type: 'postgres',
    url: urlDueno(),
    entities: [Sonda],
    synchronize: false,
    extra: { options: '-c TimeZone=UTC' },
  });
  await dataSource.initialize();
  await dataSource.query(
    'CREATE TABLE IF NOT EXISTS prueba_columna_instante (id int PRIMARY KEY, creado_en timestamptz NOT NULL)',
  );
  await dataSource.query('TRUNCATE prueba_columna_instante');
});

afterAll(async () => {
  await dataSource.query('DROP TABLE IF EXISTS prueba_columna_instante');
  await dataSource.destroy();
});

describe('columnaInstante', () => {
  it('DD-07 RNF-10: una entidad leída con TypeORM conserva los microsegundos como texto', async () => {
    await dataSource.query(
      "INSERT INTO prueba_columna_instante VALUES (1, '2026-11-14 10:05:09.123456-06')",
    );
    const leida = await dataSource.getRepository(Sonda).findOneByOrFail({ id: 1 });
    expect(typeof leida.creadoEn).toBe('string');
    expect(leida.creadoEn).toBe('2026-11-14 16:05:09.123456+00');
  });

  it('DD-07: una entidad guardada con TypeORM escribe el texto sin perder los microsegundos', async () => {
    await dataSource
      .getRepository(Sonda)
      .insert({ id: 2, creadoEn: '2026-11-14 23:59:59.999999+00' });
    const filas = (await dataSource.query(
      "SELECT to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS v FROM prueba_columna_instante WHERE id = 2",
    )) as { v: string }[];
    expect(filas[0]?.v).toBe('2026-11-14 23:59:59.999999');
  });
});
