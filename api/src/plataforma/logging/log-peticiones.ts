import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

interface PeticionSerializada {
  method?: string;
  url?: string;
}

interface RespuestaSerializada {
  statusCode?: number;
}

/**
 * Middleware 2 de §2.2 (design.md §10.1, DD-39): una línea de cierre por petición.
 * Los serializadores solo emiten método, URL y código: ni headers ni cuerpos. El reqId
 * lo pone el mixin del logger desde el contexto que abrió `requestId`.
 */
export function logPeticiones(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req) => req.id,
    serializers: {
      req: ({ method, url }: PeticionSerializada) => ({ method, url }),
      res: ({ statusCode }: RespuestaSerializada) => ({ statusCode }),
    },
  });
}
