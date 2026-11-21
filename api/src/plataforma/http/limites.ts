import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { DemasiadasPeticiones } from './errores.js';

// design.md §11 y DD-41. Cada llamada crea un limitador con su propio almacén en memoria:
// los módulos los crean dentro de su función de rutas, que corre en cada crearApp, así que
// cada app (y cada prueba) tiene sus contadores.

const QUINCE_MINUTOS_MS = 15 * 60 * 1000;
const UNA_HORA_MS = 60 * 60 * 1000;

function limitador(opciones: Partial<Options>): RequestHandler {
  return rateLimit({
    // §11: RateLimit-Limit, RateLimit-Remaining y RateLimit-Reset; Retry-After en el 429.
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    // El 429 lo produce manejadorErrores con responderProblema, como cualquier otro type (§7.3).
    handler: (_req, _res, next) => next(new DemasiadasPeticiones()),
    ...opciones,
  });
}

/**
 * §11: IP de req.ip, que Express calcula con `trust proxy` = TRUST_PROXY (nunca `true`).
 * Una IPv6 cuenta por su subred /56, con el ayudante de la librería.
 */
const porIp = (req: Request): string => ipKeyGenerator(req.ip ?? '');

/** §11: el correo del cuerpo, normalizado como en el esquema de login (trim y minúsculas). */
function correoDelCuerpo(req: Request): string | undefined {
  const correo: unknown = (req.body as { correo?: unknown } | undefined)?.correo;
  return typeof correo === 'string' ? correo.trim().toLowerCase() : undefined;
}

/** `POST /auth/login`: 20 por IP y 5 fallos por correo, en 15 minutos (R-1.18). */
export function limitesLogin(): RequestHandler[] {
  return [
    limitador({ windowMs: QUINCE_MINUTOS_MS, limit: 20, keyGenerator: porIp }),
    limitador({
      windowMs: QUINCE_MINUTOS_MS,
      limit: 5,
      // Solo cuentan los fallos (respuesta >= 400): el dueño no se bloquea a sí mismo.
      skipSuccessfulRequests: true,
      // Sin correo, la petición solo cuenta en el límite por IP.
      skip: (req) => correoDelCuerpo(req) === undefined,
      keyGenerator: (req) => correoDelCuerpo(req) ?? '',
    }),
  ];
}

/** `POST /auth/registro`: 5 por IP en una hora (R-1.18, D-20). */
export function limiteRegistro(): RequestHandler {
  return limitador({ windowMs: UNA_HORA_MS, limit: 5, keyGenerator: porIp });
}

/** `POST /beneficiarios`: 10 por usuario en una hora (R-3.9, D-19). Va después de `autenticar`. */
export function limiteAltaBeneficiarios(): RequestHandler {
  return limitador({
    windowMs: UNA_HORA_MS,
    limit: 10,
    keyGenerator: (req) => {
      if (req.usuarioId === undefined) {
        throw new Error('limiteAltaBeneficiarios va después de autenticar');
      }
      return req.usuarioId;
    },
  });
}
