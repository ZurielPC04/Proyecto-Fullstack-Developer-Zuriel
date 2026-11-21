import { setTimeout as dormir } from 'node:timers/promises';
import type { Logger } from 'pino';
import type { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { Reintentable } from '../http/errores.js';

/** design.md §2.3: el único lugar de la API que abre transacciones. */
export type ConTransaccion = <T>(
  trabajo: (tx: EntityManager) => Promise<T>,
  opciones?: { reintentosDeadlock?: number },
) => Promise<T>;

export interface DependenciasUnidadDeTrabajo {
  dataSource: DataSource;
  logger: Logger;
}

const DEADLOCK = '40P01';
const LOCK_TIMEOUT = '55P03';
const STATEMENT_TIMEOUT = '57014';

/** SQLSTATE del error de pg; TypeORM lo copia en QueryFailedError y lo deja en driverError. */
function sqlstate(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, driverError } = error as { code?: unknown; driverError?: { code?: unknown } };
  if (typeof code === 'string') return code;
  return typeof driverError?.code === 'string' ? driverError.code : undefined;
}

/** D-12: espera aleatoria de 10 a 50 ms multiplicada por el número de intento. */
function esperaDeadlock(intento: number): number {
  return (10 + Math.random() * 40) * intento;
}

async function unaVez<T>(
  dataSource: DataSource,
  trabajo: (tx: EntityManager) => Promise<T>,
): Promise<T> {
  const runner: QueryRunner = dataSource.createQueryRunner();
  try {
    await runner.connect();
  } catch (causa) {
    // §2.3: sin conexión no quedó ningún efecto; base no disponible → 503 retryable (§7.2).
    await runner.release().catch(() => undefined);
    throw new Reintentable({ cause: causa });
  }
  try {
    await runner.startTransaction('READ COMMITTED');
    await runner.query("SET LOCAL lock_timeout = '5s'");
    await runner.query("SET LOCAL statement_timeout = '10s'");
    const resultado = await trabajo(runner.manager);
    // El constraint trigger diferido de suma cero se evalúa aquí (D-14).
    await runner.commitTransaction();
    return resultado;
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined);
    throw error;
  } finally {
    await runner.release();
  }
}

export function crearConTransaccion({
  dataSource,
  logger,
}: DependenciasUnidadDeTrabajo): ConTransaccion {
  return async (trabajo, { reintentosDeadlock = 3 } = {}) => {
    for (let intento = 1; ; intento++) {
      try {
        return await unaVez(dataSource, trabajo);
      } catch (error) {
        const codigo = sqlstate(error);
        if (codigo === DEADLOCK) {
          // La transacción completa no dejó efectos: se reintenta toda la función (D-12).
          if (intento > reintentosDeadlock) throw new Reintentable({ cause: error });
          logger.warn({ sqlstate: codigo, intento }, 'deadlock: se reintenta la transacción');
          await dormir(esperaDeadlock(intento));
          continue;
        }
        // DD-10: sin reintento en el servidor; el cliente reintenta con la misma llave.
        if (codigo === LOCK_TIMEOUT || codigo === STATEMENT_TIMEOUT) {
          throw new Reintentable({ cause: error });
        }
        // 23505, 23514, 23503, P0001 y el resto: se propagan con su code y su constraint.
        throw error;
      }
    }
  };
}
