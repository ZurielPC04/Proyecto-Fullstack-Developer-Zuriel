import type { EntityManager } from 'typeorm';
import type { ConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { MismaCuenta, NoEncontrado } from '../../plataforma/http/errores.js';
import type { Reloj } from '../../plataforma/reloj/index.js';
import { registrarEvento } from '../auditoria/auditoria.casos-uso.js';
import {
  clasificar,
  decidir,
  hashPeticion,
  type SolicitudTransferencia,
  type TipoTransferencia,
} from './transferencias.dominio.js';
import {
  beneficiarioPropio,
  bloquearCuentas,
  bloquearUsuario,
  cuentaPropia,
  duenoDeCuenta,
  FONDEO_ID,
  insertarAsientos,
  insertarFondeo,
  insertarTransferencia,
  leerTransferencia,
} from './transferencias.repositorio.js';
import type { FilaTransferencia } from './transferencias.respuesta.js';

export type { SolicitudTransferencia };

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

interface DestinoResuelto {
  cuentaDestinoId: string;
  beneficiarioId: string | null;
  tipo: TipoTransferencia;
}

/**
 * §6.1 paso 2, fuera de la transacción: las cuentas no cambian de dueño (DD-17). Origen o
 * destino inexistentes o ajenos dan el mismo `404` (R-4.6); Fondeo nunca pasa (R-4.7).
 */
async function resolverDestino(
  tx: EntityManager,
  usuarioId: string,
  solicitud: SolicitudTransferencia,
): Promise<DestinoResuelto> {
  const origen = await cuentaPropia(tx, usuarioId, solicitud.cuentaOrigenId);
  const { destino } = solicitud;
  let resuelto: { cuentaId: string; duenoId: string; beneficiarioId: string | null } | undefined;
  if (destino.tipo === 'CUENTA_PROPIA') {
    const cuenta = await cuentaPropia(tx, usuarioId, destino.cuentaId);
    if (cuenta) resuelto = { cuentaId: cuenta.id, duenoId: usuarioId, beneficiarioId: null };
  } else {
    const beneficiario = await beneficiarioPropio(tx, usuarioId, destino.beneficiarioId);
    if (beneficiario) resuelto = { ...beneficiario, beneficiarioId: destino.beneficiarioId };
  }
  if (!origen || !resuelto) throw new NoEncontrado();
  if (origen.id === resuelto.cuentaId) throw new MismaCuenta(); // R-4.4, sin crear la fila
  return {
    cuentaDestinoId: resuelto.cuentaId,
    beneficiarioId: resuelto.beneficiarioId,
    tipo: clasificar(usuarioId, resuelto.duenoId),
  };
}

export interface DependenciasCasosUsoTransferencias {
  conTransaccion: ConTransaccion;
  reloj: Reloj;
}

/** HU-4: crear y consultar transferencias del `usuarioId` autenticado (§6.1). */
export function crearCasosUsoTransferencias({
  conTransaccion,
  reloj,
}: DependenciasCasosUsoTransferencias) {
  return {
    /**
     * §6.1. Devuelve la fila: un rechazo de negocio es un resultado guardado y confirmado, no
     * una excepción (§2.1, D-03). `respuestaDeTransferencia` la traduce a HTTP.
     */
    async crear(
      usuarioId: string,
      llave: string,
      solicitud: SolicitudTransferencia,
    ): Promise<FilaTransferencia> {
      const hash = hashPeticion(solicitud);
      const destino = await conTransaccion((tx) => resolverDestino(tx, usuarioId, solicitud));
      const { cuentaOrigenId, montoCentavos } = solicitud;

      const fila = await conTransaccion(async (tx) => {
        await bloquearUsuario(tx, usuarioId); // 3.1 (D-04)
        const saldos = await bloquearCuentas(tx, [cuentaOrigenId, destino.cuentaDestinoId]); // 3.3 (D-12)
        const ahora = await reloj.ahora(tx); // 3.4, después de los bloqueos (DD-36)
        const decision = decidir({
          tipo: destino.tipo,
          montoCentavos,
          saldoOrigenCentavos: saldos.get(cuentaOrigenId) ?? 0,
        });
        const transferenciaId = await insertarTransferencia(tx, {
          usuarioId,
          tipo: destino.tipo,
          cuentaOrigenId,
          cuentaDestinoId: destino.cuentaDestinoId,
          beneficiarioId: destino.beneficiarioId,
          montoCentavos,
          concepto: solicitud.concepto,
          referencia: solicitud.referencia,
          estado: decision.estado,
          motivoRechazo: decision.estado === 'RECHAZADA' ? decision.motivo : null,
          llave,
          hash,
          ahora,
        });
        if (decision.estado === 'APLICADA') {
          await insertarAsientos(tx, {
            transferenciaId,
            tipo: destino.tipo,
            cuentaOrigenId,
            cuentaDestinoId: destino.cuentaDestinoId,
            montoCentavos,
            ahora,
          });
          await registrarEvento(tx, {
            tipo: 'transferencia-aplicada',
            usuarioId,
            datos: {
              transferenciaId,
              tipo: destino.tipo,
              montoCentavos,
              cuentaOrigenId,
              cuentaDestinoId: destino.cuentaDestinoId,
            },
          });
        } else {
          await registrarEvento(tx, {
            tipo: 'transferencia-rechazada',
            usuarioId,
            datos: { transferenciaId, motivo: decision.motivo, montoCentavos },
          });
        }
        return leerTransferencia(tx, usuarioId, transferenciaId);
      });
      if (!fila) throw new Error('La transferencia recién creada no se pudo leer');
      return fila;
    },

    /** R-4.10 y D-10: ajena o inexistente lanzan el mismo `NoEncontrado`. */
    async obtener(usuarioId: string, transferenciaId: string): Promise<FilaTransferencia> {
      const fila = await conTransaccion((tx) => leerTransferencia(tx, usuarioId, transferenciaId));
      if (!fila) throw new NoEncontrado();
      return fila;
    },
  };
}

export type CasosUsoTransferencias = ReturnType<typeof crearCasosUsoTransferencias>;
