import type { RequestHandler } from 'express';

/**
 * Middleware 11 de §2.2 (D-17): solo de desarrollo; con `NODE_ENV=production` la configuración
 * exige 0 (RNF-15). Se monta antes del controlador y retrasa el envío de la respuesta: el caso
 * de uso ya confirmó su transacción cuando el controlador llama `res.json`, así que la espera
 * queda entre el COMMIT y la respuesta, el momento en que se puede cortar la red en el video.
 */
export function demoLatencia(milisegundos: number): RequestHandler {
  return (_req, res, next) => {
    if (milisegundos > 0) {
      const json = res.json.bind(res);
      res.json = (cuerpo: unknown) => {
        setTimeout(() => json(cuerpo), milisegundos);
        return res;
      };
    }
    next();
  };
}
