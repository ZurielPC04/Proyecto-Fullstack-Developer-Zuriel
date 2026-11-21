import type { TipoProblema } from '@billetera/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { ErrorDominio, NoEncontrado } from './errores.js';
import { crearProblema, responderProblema, type Problema } from './problemas.js';

/** Middleware 12 de §2.2: cualquier ruta no declarada. */
export function noEncontrado(): RequestHandler {
  return (_req, _res, next) => next(new NoEncontrado());
}

function tipoDeErrorDeCuerpo(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('type' in error)) return undefined;
  return typeof error.type === 'string' ? error.type : undefined;
}

/** `code` y `constraint` del error de pg; TypeORM los deja en `driverError` (DD-35). */
function errorDePg(error: unknown): { code?: unknown; constraint?: unknown } {
  if (typeof error !== 'object' || error === null) return {};
  const { driverError } = error as { driverError?: unknown };
  const origen = typeof driverError === 'object' && driverError !== null ? driverError : error;
  return origen as { code?: unknown; constraint?: unknown };
}

/** §7.3: restricciones `UNIQUE` que el manejador traduce, por nombre y nunca por mensaje. */
const UNICAS: Record<string, TipoProblema> = {
  uq_usuario_correo: 'correo-ya-registrado',
};

/** §7.3, en orden. */
function traducir(error: unknown): Problema {
  if (error instanceof ZodError) {
    return crearProblema('validation-error', {
      errores: error.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensaje: issue.message,
      })),
    });
  }
  const tipoCuerpo = tipoDeErrorDeCuerpo(error);
  if (tipoCuerpo === 'entity.parse.failed') {
    return crearProblema('validation-error', {
      errores: [{ campo: 'body', mensaje: 'El cuerpo no es un JSON válido.' }],
    });
  }
  if (tipoCuerpo === 'entity.too.large') {
    return crearProblema('validation-error', {
      errores: [{ campo: 'body', mensaje: 'El cuerpo pasa de 16 kB.' }],
    });
  }
  if (error instanceof ErrorDominio) return crearProblema(error.tipo, error.extensiones);
  const { code, constraint } = errorDePg(error);
  if (code === '23505' && typeof constraint === 'string' && constraint in UNICAS) {
    return crearProblema(UNICAS[constraint] as TipoProblema);
  }
  return crearProblema('internal-error');
}

/**
 * Middleware 13 de §2.2: el único lugar que produce problems. `title` y `detail` son fijos
 * por `type`; la causa interna de un 500 va solo al log (§7.4).
 */
export function manejadorErrores(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const problema = traducir(error);
    if (problema.type === 'internal-error') logger.error({ err: error }, 'error interno');
    responderProblema(res, problema);
  };
}
