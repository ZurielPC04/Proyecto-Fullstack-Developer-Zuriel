import type { Problema } from '@billetera/shared';

/** Respuesta no exitosa de la API, con su problem RFC 7807 si vino (design.md §7). */
export class ErrorApi extends Error {
  readonly status: number;
  readonly problema: (Problema & Record<string, unknown>) | null;

  constructor(status: number, problema: (Problema & Record<string, unknown>) | null) {
    super(problema?.title ?? `HTTP ${status}`);
    this.name = 'ErrorApi';
    this.status = status;
    this.problema = problema;
  }
}

/** Error de red o timeout de 15 s: no llegó respuesta de la API (D-17). */
export class ErrorRed extends Error {
  constructor(causa: unknown) {
    super('No se pudo contactar al servidor', { cause: causa });
    this.name = 'ErrorRed';
  }
}
