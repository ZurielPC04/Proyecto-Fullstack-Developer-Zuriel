import { pino, type DestinationStream, type Level, type Logger } from 'pino';
import { contextoPeticion } from './contexto.js';

// design.md §10.1: propiedades censuradas en cualquier objeto registrado.
const CAMPOS_SENSIBLES = [
  'contrasena',
  'hash_contrasena',
  'accessToken',
  'refreshToken',
  'refresh_hash',
  'codigo',
  'codigoSimulado',
  'codigo_hmac',
];

/**
 * Segunda barrera (DD-39): los serializadores de pino-http no emiten headers ni cuerpos,
 * pero si alguien los agrega, estas rutas los siguen censurando. La ruta simple `campo`
 * cubre el nivel superior, que `*.campo` no alcanza.
 */
export const RUTAS_REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...CAMPOS_SENSIBLES.flatMap((campo) => [campo, `*.${campo}`, `*.*.${campo}`]),
];

export interface OpcionesLogger {
  nivel?: Level | 'silent';
  /** Por defecto, stdout. Las pruebas pasan un destino en memoria. */
  destino?: DestinationStream;
}

export function crearLogger({ nivel = 'info', destino }: OpcionesLogger = {}): Logger {
  const opciones = {
    level: nivel,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: RUTAS_REDACT,
    // reqId y usuarioId en cada línea emitida durante una petición (§10.1).
    mixin: () => ({ ...contextoPeticion.getStore() }),
  };
  return destino ? pino(opciones, destino) : pino(opciones);
}
