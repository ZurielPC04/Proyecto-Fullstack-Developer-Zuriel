import type { Server } from 'node:http';
import { arrancar } from './arranque.js';
import { crearDataSource } from './plataforma/db/data-source.js';
import { crearVerificarBase } from './plataforma/db/salud.js';
import { crearLogger } from './plataforma/logging/logger.js';

// Solo cablea los objetos reales; la secuencia y sus reglas viven en arranque.ts (design.md §2.4).
// El nivel inicial es info: LOG_LEVEL todavía no está validado. El logger ya lleva redact (§10.1).
const logger = crearLogger({ nivel: 'info' });

try {
  await arrancar({
    env: process.env,
    logger,
    proceso: process,
    // §2.3: DataSource con los parsers de pg; initialize() falla si la base no contesta.
    conectarBase: async (config) => {
      const dataSource = crearDataSource({ url: config.DATABASE_URL, poolMax: config.DB_POOL_MAX });
      await dataSource.initialize();
      return { dataSource, verificarBase: crearVerificarBase(dataSource) };
    },
    escuchar: (app, puerto) =>
      new Promise<Server>((resolver, rechazar) => {
        const servidor = app.listen(puerto, (error) => {
          if (error) {
            rechazar(error);
            return;
          }
          logger.info({ puerto }, 'API escuchando');
          resolver(servidor);
        });
      }),
  });
} catch (error) {
  // Base no disponible al arrancar o puerto ocupado: se registra y no se abre el puerto.
  logger.fatal({ err: error }, 'no se pudo arrancar la API');
  process.exitCode = 1;
}
