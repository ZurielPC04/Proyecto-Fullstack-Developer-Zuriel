import type { TipoProblema } from '@billetera/shared';
import type { ErrorCampo, ExtensionesProblema } from './problemas.js';

/**
 * design.md §2.1 y §7.3: errores que sí son excepciones. Llevan su `type` del catálogo;
 * solo `manejadorErrores` los traduce a HTTP. Cada tarea agrega las subclases que use.
 */
export class ErrorDominio extends Error {
  constructor(
    readonly tipo: TipoProblema,
    readonly extensiones: ExtensionesProblema = {},
    opciones?: ErrorOptions,
  ) {
    super(tipo, opciones);
    this.name = new.target.name;
  }
}

export class NoEncontrado extends ErrorDominio {
  constructor(opciones?: ErrorOptions) {
    super('not-found', {}, opciones);
  }
}

export class ValidacionFallida extends ErrorDominio {
  constructor(errores: ErrorCampo[], opciones?: ErrorOptions) {
    super('validation-error', { errores }, opciones);
  }
}

/** `503 retryable` con `Retry-After: 1` (DD-10, §10.3). */
export class Reintentable extends ErrorDominio {
  constructor(opciones?: ErrorOptions) {
    super('retryable', {}, opciones);
  }
}
