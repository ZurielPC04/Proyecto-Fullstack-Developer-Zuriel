import type { EntityManager } from 'typeorm';
import type { Reloj } from '../../plataforma/reloj/index.js';
import { registrarEvento } from '../auditoria/auditoria.casos-uso.js';
import {
  bloquearCuentas,
  bloquearUsuario,
  duenoDeCuenta,
  FONDEO_ID,
  insertarFondeo,
} from './transferencias.repositorio.js';

export interface DependenciasTransferencias {
  reloj: Reloj;
}

export interface Transferencias {
  /**
   * D-02: deposita `montoCentavos` desde Fondeo. Recibe la transacción abierta de quien lo
   * compone (registro, seed) y no abre otra (§2.1, R-1.3). Devuelve el id de la transferencia.
   */
  fondear(
    tx: EntityManager,
    cuentaDestinoId: string,
    montoCentavos: number,
    concepto?: string,
  ): Promise<string>;
}

export function crearTransferencias({ reloj }: DependenciasTransferencias): Transferencias {
  return {
    async fondear(tx, cuentaDestinoId, montoCentavos, concepto = 'Depósito') {
      const usuarioId = await duenoDeCuenta(tx, cuentaDestinoId);
      // D-12: usuario → cuentas por id ascendente, Fondeo incluida (§6.3).
      if (usuarioId !== null) await bloquearUsuario(tx, usuarioId);
      await bloquearCuentas(tx, [FONDEO_ID, cuentaDestinoId]);
      // DD-36: el instante se lee después de tener los bloqueos.
      const ahora = await reloj.ahora(tx);
      const transferenciaId = await insertarFondeo(tx, {
        cuentaDestinoId,
        montoCentavos,
        concepto,
        ahora,
      });
      // DD-40: en la misma transacción; sin evento no hay dinero movido.
      await registrarEvento(tx, {
        tipo: 'fondeo-aplicado',
        usuarioId,
        datos: { transferenciaId, cuentaDestinoId, montoCentavos },
      });
      return transferenciaId;
    },
  };
}
