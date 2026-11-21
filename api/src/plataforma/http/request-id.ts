import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { contextoPeticion } from '../logging/contexto.js';

// DD-09: forma de UUID (8-4-4-4-12 hexadecimal), sin distinguir mayúsculas ni exigir versión.
const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Middleware 1 de §2.2: request ID en el header (nunca en el cuerpo) y en el contexto del log. */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const entrante = req.get('x-request-id');
    const reqId =
      entrante !== undefined && FORMA_UUID.test(entrante) ? entrante.toLowerCase() : randomUUID();
    req.id = reqId;
    res.set('X-Request-Id', reqId);
    contextoPeticion.run({ reqId }, next);
  };
}
