// Estado de las migraciones en billetera_test, con el rol dueño (design.md §14.2).
// Hasta T-API-09, cada archivo que las necesita llama aplicarTodas() en su beforeAll.
import type { DataSource } from 'typeorm';
import { abrirDataSource, urlDueno } from './base.js';

async function conDueno<T>(trabajo: (dataSource: DataSource) => Promise<T>): Promise<T> {
  const dataSource = await abrirDataSource(urlDueno(), 1);
  try {
    return await trabajo(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

export async function migracionesAplicadas(): Promise<string[]> {
  return conDueno(async (dataSource) => {
    const [{ existe }] = (await dataSource.query(
      "SELECT to_regclass('public.migracion') IS NOT NULL AS existe",
    )) as [{ existe: boolean }];
    if (!existe) return [];
    const filas = (await dataSource.query('SELECT name FROM migracion ORDER BY id')) as {
      name: string;
    }[];
    return filas.map((f) => f.name);
  });
}

export async function aplicarTodas(): Promise<void> {
  await conDueno((dataSource) => dataSource.runMigrations({ transaction: 'each' }));
}

export async function revertirTodas(): Promise<void> {
  const pendientes = (await migracionesAplicadas()).length;
  await conDueno(async (dataSource) => {
    for (let i = 0; i < pendientes; i++)
      await dataSource.undoLastMigration({ transaction: 'each' });
  });
}

/** Revierte desde la última hasta `nombre` incluida (deja aplicadas las anteriores). */
export async function revertirHasta(nombre: string): Promise<void> {
  const aplicadas = await migracionesAplicadas();
  const indice = aplicadas.indexOf(nombre);
  if (indice < 0) throw new Error(`La migración ${nombre} no está aplicada`);
  await conDueno(async (dataSource) => {
    for (let i = aplicadas.length - 1; i >= indice; i--) {
      await dataSource.undoLastMigration({ transaction: 'each' });
    }
  });
}

/** Ejecuta SQL como el rol dueño y devuelve las filas. */
export async function consultarComoDueno<T>(sql: string, parametros: unknown[] = []): Promise<T[]> {
  return conDueno(async (dataSource) => (await dataSource.query(sql, parametros)) as T[]);
}
