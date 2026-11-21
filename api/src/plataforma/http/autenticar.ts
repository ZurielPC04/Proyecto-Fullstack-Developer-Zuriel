import type { RequestHandler } from 'express';
import { contextoPeticion } from '../logging/contexto.js';
import { crearTokens } from '../seguridad/tokens.js';
import { NoAutenticado } from './errores.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- única forma de aumentar Request de Express.
  namespace Express {
    interface Request {
      /** Lo pone `autenticar` a partir del `sub` del access (§5.2). */
      usuarioId?: string;
    }
  }
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

/**
 * Middleware 9 de §2.2 (§5.2): verifica el access sin consultar la base. Fija
 * `Cache-Control: no-store` antes de verificar, así también lo lleva el 401 (DD-38).
 * Cualquier fallo responde el mismo `401 unauthorized` (R-1.11).
 */
export function crearAutenticar(config: { JWT_SECRETO: string }): RequestHandler {
  const tokens = crearTokens(config.JWT_SECRETO);
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const token = BEARER.exec(req.get('authorization') ?? '')?.[1];
    if (token === undefined) {
      next(new NoAutenticado());
      return;
    }
    let usuarioId: string;
    try {
      usuarioId = await tokens.verificarAccess(token);
    } catch (causa) {
      next(new NoAutenticado({ cause: causa }));
      return;
    }
    req.usuarioId = usuarioId;
    // §10.1: los logs y la auditoría de la petición llevan el usuario.
    const contexto = contextoPeticion.getStore();
    if (contexto) contexto.usuarioId = usuarioId;
    next();
  };
}
