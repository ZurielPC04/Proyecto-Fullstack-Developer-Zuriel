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

/** `401 unauthorized`: access o refresh inválido, el mismo problem para cualquier causa (R-1.10, R-1.11). */
export class NoAutenticado extends ErrorDominio {
  constructor(opciones?: ErrorOptions) {
    super('unauthorized', {}, opciones);
  }
}

/** `401 credenciales-invalidas`: correo inexistente o contraseña incorrecta, sin distinguirlos (R-1.7). */
export class CredencialesInvalidas extends ErrorDominio {
  constructor(opciones?: ErrorOptions) {
    super('credenciales-invalidas', {}, opciones);
  }
}

/** `422 clabe-not-found`: CLABE válida que no es de ninguna cuenta de usuario, Fondeo incluida (R-3.5). */
export class ClabeNoEncontrada extends ErrorDominio {
  constructor(opciones?: ErrorOptions) {
    super('clabe-not-found', {}, opciones);
  }
}

/** `422 misma-cuenta`: origen igual a destino, antes de crear la transferencia (R-4.4). */
export class MismaCuenta extends ErrorDominio {
  constructor(opciones?: ErrorOptions) {
    super('misma-cuenta', {}, opciones);
  }
}

/** `429 too-many-requests`: rate limit excedido; el limitador ya fijó `Retry-After` (§11). */
export class DemasiadasPeticiones extends ErrorDominio {
  constructor(opciones?: ErrorOptions) {
    super('too-many-requests', {}, opciones);
  }
}

/** `503 retryable` con `Retry-After: 1` (DD-10, §10.3). */
export class Reintentable extends ErrorDominio {
  constructor(opciones?: ErrorOptions) {
    super('retryable', {}, opciones);
  }
}
