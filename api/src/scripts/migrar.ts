// design.md §3.5 y DD-05: ejecuta las migraciones de TypeORM con el rol dueño, sin el CLI.
//   npm run db:migrate            → runMigrations({ transaction: 'each' })
//   npm run db:migrate:revertir   → undoLastMigration({ transaction: 'each' })
// Lee solo DATABASE_URL_MIGRACIONES, que no forma parte del esquema de la API (§2.4).
import { crearDataSource } from '../plataforma/db/data-source.js';
import { crearLogger } from '../plataforma/logging/logger.js';

const logger = crearLogger();
const url = process.env['DATABASE_URL_MIGRACIONES'];
const protocolo = url === undefined ? undefined : URL.parse(url)?.protocol;

if (url === undefined || (protocolo !== 'postgres:' && protocolo !== 'postgresql:')) {
  // Igual que §2.4: solo el nombre, nunca el valor.
  logger.error({ variablesInvalidas: ['DATABASE_URL_MIGRACIONES'] }, 'configuración inválida');
  process.exitCode = 1;
} else {
  const revertir = process.argv.includes('--revertir');
  const dataSource = crearDataSource({ url, poolMax: 1 });
  try {
    await dataSource.initialize();
    if (revertir) {
      await dataSource.undoLastMigration({ transaction: 'each' });
      logger.info('última migración revertida (si había alguna)');
    } else {
      const aplicadas = await dataSource.runMigrations({ transaction: 'each' });
      logger.info({ aplicadas: aplicadas.map((m) => m.name) }, 'migraciones aplicadas');
    }
  } catch (error) {
    logger.error({ err: error }, revertir ? 'falló la reversión' : 'falló la migración');
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}
