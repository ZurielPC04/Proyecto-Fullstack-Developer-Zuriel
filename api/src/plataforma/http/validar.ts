import type { RequestHandler } from 'express';
import { z } from 'zod';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- única forma de aumentar Request de Express.
  namespace Express {
    interface Request {
      /** Lo que dejó `validar`, ya transformado. Leer con `DatosValidados<typeof esquemas>`. */
      validado?: unknown;
    }
  }
}

export interface EsquemasPeticion {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  headers?: z.ZodType;
}

export type DatosValidados<E extends EsquemasPeticion> = {
  [K in keyof E]: E[K] extends z.ZodType ? z.output<E[K]> : never;
};

const PARTES = ['params', 'query', 'body', 'headers'] as const;

/**
 * design.md §2.2: valida las partes declaradas con un solo objeto Zod, así cada issue ya
 * trae su ruta prefijada (`body.`, `query.`, `params.`, `headers.`, §7.3). Lo que no se
 * declara no se valida ni llega a `req.validado`. Si falla, el ZodError va al manejador.
 */
export function validar<E extends EsquemasPeticion>(esquemas: E): RequestHandler {
  const forma: Record<string, z.ZodType> = {};
  for (const parte of PARTES) {
    const esquema = esquemas[parte];
    if (esquema) forma[parte] = esquema;
  }
  const esquema = z.object(forma);

  return (req, _res, next) => {
    const resultado = esquema.safeParse({
      params: req.params,
      query: req.query,
      body: req.body,
      headers: req.headers,
    });
    if (!resultado.success) {
      next(resultado.error);
      return;
    }
    req.validado = resultado.data;
    next();
  };
}
