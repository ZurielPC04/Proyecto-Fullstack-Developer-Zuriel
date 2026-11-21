import type { EntityManager } from 'typeorm';

/**
 * design.md §2.1 y DD-07: única fuente del instante de negocio. Texto de timestamptz en UTC
 * con microsegundos, tal como lo entrega pg (§2.3); nunca Date.
 */
export interface Reloj {
  ahora(tx: EntityManager): Promise<string>;
}

/**
 * DD-36: `clock_timestamp()` y no `now()`, para que el instante se lea después de tomar
 * los bloqueos que protegen la decisión, no al inicio de la transacción.
 */
export class RelojBaseDatos implements Reloj {
  async ahora(tx: EntityManager): Promise<string> {
    const filas = (await tx.query('SELECT clock_timestamp() AS ahora')) as { ahora: string }[];
    const ahora = filas[0]?.ahora;
    if (ahora === undefined) throw new Error('clock_timestamp() no devolvió filas');
    return ahora;
  }
}

/** D-15: instante controlado por la prueba (23:59:59.999999, 00:00:00…). */
export class RelojFijo implements Reloj {
  constructor(private instante: string) {}

  fijar(instante: string): void {
    this.instante = instante;
  }

  async ahora(): Promise<string> {
    return this.instante;
  }
}
