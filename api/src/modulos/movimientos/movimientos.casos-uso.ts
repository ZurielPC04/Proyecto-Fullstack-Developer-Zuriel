import { ZONA_HORARIA } from '@billetera/shared';
import type { ConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { CursorInvalido, NoEncontrado } from '../../plataforma/http/errores.js';
import { buscarCuentaDeUsuario } from '../cuentas/cuentas.repositorio.js';
import {
  aMovimiento,
  codificarCursor,
  decodificarCursor,
  filtrosHash,
  type Movimiento,
  type TipoMovimiento,
} from './movimientos.dominio.js';
import { consultarMovimientos } from './movimientos.repositorio.js';

/** Query ya validada por el esquema de shared (R-5.2, R-5.5, R-5.6, R-5.7 en su forma). */
export interface ConsultaHistorial {
  limite: number;
  cursor?: string | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
  tipo?: TipoMovimiento | undefined;
}

export interface PaginaMovimientos {
  items: Movimiento[];
  siguienteCursor: string | null;
}

/** HU-5: historial de una cuenta propia, sin transacción de escritura (§8.1). */
export function crearConsultasMovimientos({ conTransaccion }: { conTransaccion: ConTransaccion }) {
  return {
    listar(
      usuarioId: string,
      cuentaId: string,
      consulta: ConsultaHistorial,
    ): Promise<PaginaMovimientos> {
      return conTransaccion(async (tx) => {
        // §8.1 paso 1: ajena o inexistente, el mismo 404 (R-5.10, D-10). Va antes del cursor:
        // un cursor no revela nada de una cuenta que no es del usuario.
        if (!(await buscarCuentaDeUsuario(tx, usuarioId, cuentaId))) throw new NoEncontrado();

        const { limite, desde, hasta, tipo } = consulta;
        const hash = filtrosHash({ cuentaId, tipo, desde, hasta });
        let cursor;
        if (consulta.cursor !== undefined) {
          // §8.1 paso 3 y R-5.7.
          cursor = decodificarCursor(consulta.cursor, hash);
          if (!cursor) throw new CursorInvalido();
        }

        const filas = await consultarMovimientos(tx, {
          cuentaId,
          limite,
          zona: ZONA_HORARIA,
          ...(tipo !== undefined ? { tipo } : {}),
          ...(desde !== undefined ? { desde } : {}),
          ...(hasta !== undefined ? { hasta } : {}),
          ...(cursor ? { cursor } : {}),
        });
        // D-11: la fila de más solo indica que hay página siguiente.
        const pagina = filas.slice(0, limite);
        const ultima = pagina.at(-1);
        return {
          items: pagina.map(aMovimiento),
          siguienteCursor:
            filas.length > limite && ultima
              ? codificarCursor({ creadoEn: ultima.creado_en, id: String(ultima.id) }, hash)
              : null,
        };
      });
    },
  };
}

export type ConsultasMovimientos = ReturnType<typeof crearConsultasMovimientos>;
