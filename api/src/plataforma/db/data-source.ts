import { DataSource } from 'typeorm';
import { migraciones } from '../../migraciones/index.js';
import { registrarParsers } from './parsers.js';

export interface OpcionesDataSource {
  url: string;
  /** RNF-24: DB_POOL_MAX de la configuración. */
  poolMax: number;
}

/**
 * design.md §2.3 y §3.5. `synchronize` fijo en false (RNF-16); las migraciones son una
 * lista explícita; cada conexión del pool trabaja en UTC (DD-07, RNF-10).
 */
export function crearDataSource({ url, poolMax }: OpcionesDataSource): DataSource {
  registrarParsers();
  return new DataSource({
    type: 'postgres',
    url,
    synchronize: false,
    migrationsRun: false,
    migrations: migraciones,
    migrationsTableName: 'migracion',
    migrationsTransactionMode: 'each',
    poolSize: poolMax,
    extra: { options: '-c TimeZone=UTC' },
    logging: false,
  });
}
