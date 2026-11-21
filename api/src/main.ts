import type { Server } from 'node:http';
import { pino } from 'pino';
import { arrancar } from './arranque.js';

// Solo cablea los objetos reales; la secuencia y sus reglas viven en arranque.ts (design.md §2.4).
// El nivel inicial es info: LOG_LEVEL todavía no está validado.
const logger = pino({ level: 'info' });

await arrancar({
  env: process.env,
  logger,
  proceso: process,
  // T-API-04 reemplaza este stub por el DataSource con sus parsers de pg y la unidad de trabajo.
  conectarBase: async () => {},
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
