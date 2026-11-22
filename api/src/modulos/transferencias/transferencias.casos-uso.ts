import { randomInt } from 'node:crypto';
import { instanteIso } from '@billetera/shared';
import type { Logger } from 'pino';
import type { EntityManager } from 'typeorm';
import type { ConTransaccion } from '../../plataforma/db/unidad-de-trabajo.js';
import { LlaveReutilizada, MismaCuenta, NoEncontrado } from '../../plataforma/http/errores.js';
import type { ProveedorOtp } from '../../plataforma/otp/index.js';
import type { Reloj } from '../../plataforma/reloj/index.js';
import { registrarEvento } from '../auditoria/auditoria.casos-uso.js';
import { consumidoDelDia } from '../limites/limites.repositorio.js';
import {
  clasificar,
  codigoCoincide,
  codigoHmac,
  codigoVencido,
  decidir,
  hashPeticion,
  type MotivoRechazo,
  type SolicitudTransferencia,
  type TipoTransferencia,
} from './transferencias.dominio.js';
import {
  beneficiarioPropio,
  bloquearCodigo,
  bloquearCuentas,
  bloquearUsuario,
  cuentaPropia,
  duenoDeCuenta,
  FONDEO_ID,
  insertarAsientos,
  insertarCodigo,
  insertarFondeo,
  insertarTransferencia,
  leerPorLlave,
  leerTransferencia,
  resolverPendiente,
  sumarIntento,
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

/** §6.2: misma llave y mismo hash → la fila original; hash distinto → `422` (R-4.15). */
function repeticion(fila: FilaTransferencia & { hash: string }, hash: string): FilaTransferencia {
  if (fila.hash !== hash) throw new LlaveReutilizada();
  return fila;
}

/** `23505` en `uq_transferencia_usuario_llave` (§7.3); TypeORM deja el error de pg en `driverError`. */
function esLlaveDuplicada(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { driverError } = error as { driverError?: unknown };
  const pg = (typeof driverError === 'object' && driverError !== null ? driverError : error) as {
    code?: unknown;
    constraint?: unknown;
  };
  return pg.code === '23505' && pg.constraint === 'uq_transferencia_usuario_llave';
}

/** D-07: máximo de intentos fallidos del código. */
const MAX_INTENTOS = 3;

/** §6.5: 6 dígitos con ceros a la izquierda. */
const generarCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export interface DependenciasCasosUsoTransferencias {
  conTransaccion: ConTransaccion;
  reloj: Reloj;
  logger: Logger;
  proveedorOtp: ProveedorOtp;
  /** LIMITE_DIARIO_CENTAVOS y UMBRAL_CODIGO_CENTAVOS (D-13). */
  limiteCentavos: number;
  umbralCentavos: number;
  /** OTP_HMAC_SECRETO (§6.5). */
  secretoOtp: string;
}

/** Lo que devuelve crear: la fila y, solo en la primera respuesta de una pendiente, el código simulado. */
export interface TransferenciaCreada {
  fila: FilaTransferencia;
  codigoSimulado?: string;
}

/** Resultado de confirmar: la fila resuelta, o un intento fallido ya confirmado (R-6.11). */
export type ResultadoConfirmacion =
  | { tipo: 'transferencia'; fila: FilaTransferencia }
  | { tipo: 'codigo-incorrecto'; transferenciaId: string; intentosRestantes: number };

/** HU-4 y HU-6: crear, confirmar y consultar transferencias del `usuarioId` autenticado. */
export function crearCasosUsoTransferencias({
  conTransaccion,
  reloj,
  logger,
  proveedorOtp,
  limiteCentavos,
  umbralCentavos,
  secretoOtp,
}: DependenciasCasosUsoTransferencias) {
  async function auditarRechazo(
    tx: EntityManager,
    usuarioId: string,
    transferenciaId: string,
    motivo: MotivoRechazo,
    montoCentavos: number,
  ): Promise<void> {
    await registrarEvento(tx, {
      tipo: 'transferencia-rechazada',
      usuarioId,
      datos: { transferenciaId, motivo, montoCentavos },
    });
  }

  async function auditarAplicada(
    tx: EntityManager,
    usuarioId: string,
    t: {
      transferenciaId: string;
      tipo: TipoTransferencia;
      montoCentavos: number;
      cuentaOrigenId: string;
      cuentaDestinoId: string;
    },
  ): Promise<void> {
    await registrarEvento(tx, { tipo: 'transferencia-aplicada', usuarioId, datos: { ...t } });
  }

  async function releer(tx: EntityManager, usuarioId: string, id: string) {
    const fila = await leerTransferencia(tx, usuarioId, id);
    if (!fila) throw new Error('La transferencia no se pudo volver a leer');
    return fila;
  }

  /** §6.1 paso 3: la transacción de escritura, con el orden de bloqueo de D-12. */
  async function escribir(
    tx: EntityManager,
    usuarioId: string,
    llave: string,
    hash: string,
    solicitud: SolicitudTransferencia,
    destino: DestinoResuelto,
  ): Promise<TransferenciaCreada & { codigo?: string }> {
    const { cuentaOrigenId, montoCentavos } = solicitud;
    const { cuentaDestinoId, tipo } = destino;
    await bloquearUsuario(tx, usuarioId); // 3.1 (D-04)
    // 3.2: con el usuario bloqueado, una petición simultánea con la misma llave ya confirmó o
    // todavía no empieza; si confirmó, su fila está aquí (R-4.16).
    const enEspera = await leerPorLlave(tx, usuarioId, llave);
    if (enEspera) return { fila: repeticion(enEspera, hash) };
    const saldos = await bloquearCuentas(tx, [cuentaOrigenId, cuentaDestinoId]); // 3.3 (D-12)
    const ahora = await reloj.ahora(tx); // 3.4, después de los bloqueos (DD-36)
    // 3.6: lo consumido solo importa a un TERCERO; con el usuario bloqueado no cambia (R-4.18).
    const consumido = tipo === 'TERCERO' ? await consumidoDelDia(tx, usuarioId, ahora) : 0;
    // 3.5 a 3.7 en el orden de DD-31: saldo, límite y umbral.
    const decision = decidir({
      tipo,
      montoCentavos,
      saldoOrigenCentavos: saldos.get(cuentaOrigenId) ?? 0,
      consumidoCentavos: consumido,
      limiteCentavos,
      umbralCentavos,
    });
    const transferenciaId = await insertarTransferencia(tx, {
      usuarioId,
      tipo,
      cuentaOrigenId,
      cuentaDestinoId,
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
    let codigo: string | undefined;
    if (decision.estado === 'APLICADA') {
      await insertarAsientos(tx, {
        transferenciaId,
        tipo,
        cuentaOrigenId,
        cuentaDestinoId,
        montoCentavos,
        ahora,
      });
      await auditarAplicada(tx, usuarioId, {
        transferenciaId,
        tipo,
        montoCentavos,
        cuentaOrigenId,
        cuentaDestinoId,
      });
    } else if (decision.estado === 'PENDIENTE_CONFIRMACION') {
      // 3.7 (§6.5): el código solo existe en memoria hasta que el proveedor lo entrega.
      codigo = generarCodigo();
      await insertarCodigo(
        tx,
        transferenciaId,
        codigoHmac(secretoOtp, transferenciaId, codigo),
        ahora,
      );
    } else {
      await auditarRechazo(tx, usuarioId, transferenciaId, decision.motivo, montoCentavos);
    }
    const fila = await releer(tx, usuarioId, transferenciaId);
    if (fila.codigo) {
      await registrarEvento(tx, {
        tipo: 'transferencia-pendiente',
        usuarioId,
        datos: {
          transferenciaId,
          montoCentavos,
          codigoExpiraEn: instanteIso(fila.codigo.expiraEn),
        },
      });
    }
    return codigo === undefined ? { fila } : { fila, codigo };
  }

  /**
   * §6.5: la pendiente vencida pasa a `RECHAZADA/CODIGO_EXPIRADO` y se audita. Recibe la
   * transferencia y el código ya bloqueados.
   */
  async function expirar(
    tx: EntityManager,
    usuarioId: string,
    fila: FilaTransferencia,
    ahora: string,
  ) {
    await resolverPendiente(tx, fila.id, { estado: 'RECHAZADA', motivo: 'CODIGO_EXPIRADO' }, ahora);
    await auditarRechazo(tx, usuarioId, fila.id, 'CODIGO_EXPIRADO', fila.montoCentavos);
    return releer(tx, usuarioId, fila.id);
  }

  return {
    /**
     * §6.1. Devuelve la fila: un rechazo de negocio es un resultado guardado y confirmado, no
     * una excepción (§2.1, D-03). `respuestaDeTransferencia` la traduce a HTTP, igual en la
     * primera respuesta y en la repetición (R-4.14).
     */
    async crear(
      usuarioId: string,
      llave: string,
      solicitud: SolicitudTransferencia,
    ): Promise<TransferenciaCreada> {
      const hash = hashPeticion(solicitud);
      // 1. Búsqueda rápida, sin bloqueo: una repetición no abre la transacción de escritura.
      const previa = await conTransaccion((tx) => leerPorLlave(tx, usuarioId, llave));
      if (previa) return { fila: repeticion(previa, hash) };

      const destino = await conTransaccion((tx) => resolverDestino(tx, usuarioId, solicitud));
      let creada: TransferenciaCreada & { codigo?: string };
      try {
        creada = await conTransaccion((tx) =>
          escribir(tx, usuarioId, llave, hash, solicitud, destino),
        );
      } catch (error) {
        // §6.2, red del 23505: la transacción quedó abortada; la ganadora se lee en otra.
        if (!esLlaveDuplicada(error)) throw error;
        logger.warn({ usuarioId, llave }, 'idempotencia: 23505 en la llave; se lee la ganadora');
        const ganadora = await conTransaccion((tx) => leerPorLlave(tx, usuarioId, llave));
        if (!ganadora) throw error;
        return { fila: repeticion(ganadora, hash) };
      }
      if (creada.codigo === undefined) return { fila: creada.fila };
      // §6.5: el envío va después del COMMIT, nunca con bloqueos tomados. Si falla, la
      // pendiente queda y vence sola; la API responde 500 (§2.1).
      const { codigoSimulado } = await proveedorOtp.enviar(usuarioId, creada.codigo);
      return codigoSimulado === undefined
        ? { fila: creada.fila }
        : { fila: creada.fila, codigoSimulado };
    },

    /**
     * §6.5: usuario → transferencia y código → cuentas (D-12), en una sola transacción. Un
     * intento fallido es un resultado: se confirma con su evento antes de responder (R-6.11).
     */
    confirmar(
      usuarioId: string,
      transferenciaId: string,
      codigo: string,
    ): Promise<ResultadoConfirmacion> {
      return conTransaccion(async (tx): Promise<ResultadoConfirmacion> => {
        await bloquearUsuario(tx, usuarioId); // 1
        const fila = await leerTransferencia(tx, usuarioId, transferenciaId, { bloquear: true }); // 2
        if (!fila) throw new NoEncontrado(); // R-6.14
        // R-6.13: aplicada o rechazada devuelve lo mismo, sin consumir intentos.
        if (fila.estado !== 'PENDIENTE_CONFIRMACION') return { tipo: 'transferencia', fila };
        const guardado = await bloquearCodigo(tx, transferenciaId);
        if (!guardado) throw new Error('Una pendiente sin código viola §3.2');
        const ahora = await reloj.ahora(tx); // después del último bloqueo del flujo (DD-36)

        if (codigoVencido(guardado.expiraEn, ahora)) {
          return { tipo: 'transferencia', fila: await expirar(tx, usuarioId, fila, ahora) }; // R-6.12
        }

        if (!codigoCoincide(guardado.codigoHmac, codigoHmac(secretoOtp, transferenciaId, codigo))) {
          const intentos = await sumarIntento(tx, transferenciaId);
          await registrarEvento(tx, {
            tipo: 'codigo-incorrecto',
            usuarioId,
            datos: { transferenciaId, intentos },
          });
          if (intentos < MAX_INTENTOS) {
            return {
              tipo: 'codigo-incorrecto',
              transferenciaId,
              intentosRestantes: MAX_INTENTOS - intentos,
            };
          }
          await resolverPendiente(
            tx,
            transferenciaId,
            { estado: 'RECHAZADA', motivo: 'CODIGO_AGOTADO' },
            ahora,
          );
          await auditarRechazo(
            tx,
            usuarioId,
            transferenciaId,
            'CODIGO_AGOTADO',
            fila.montoCentavos,
          );
          return { tipo: 'transferencia', fila: await releer(tx, usuarioId, transferenciaId) };
        }

        // Código correcto: cuentas por id ascendente y el instante otra vez (DD-36, R-6.10).
        const cuentaOrigenId = fila.origen.cuentaId;
        const cuentaDestinoId = fila.destino.cuentaId;
        const saldos = await bloquearCuentas(tx, [cuentaOrigenId, cuentaDestinoId]);
        const aplicadaEn = await reloj.ahora(tx);
        const decision = decidir({
          tipo: fila.tipo,
          montoCentavos: fila.montoCentavos,
          saldoOrigenCentavos: saldos.get(cuentaOrigenId) ?? 0,
          consumidoCentavos: await consumidoDelDia(tx, usuarioId, aplicadaEn),
          limiteCentavos,
          umbralCentavos: null,
        });
        if (decision.estado === 'RECHAZADA') {
          await resolverPendiente(tx, transferenciaId, decision, aplicadaEn);
          await auditarRechazo(tx, usuarioId, transferenciaId, decision.motivo, fila.montoCentavos);
        } else {
          await resolverPendiente(tx, transferenciaId, { estado: 'APLICADA' }, aplicadaEn);
          const t = {
            transferenciaId,
            tipo: fila.tipo,
            cuentaOrigenId,
            cuentaDestinoId,
            montoCentavos: fila.montoCentavos,
          };
          await insertarAsientos(tx, { ...t, ahora: aplicadaEn });
          await auditarAplicada(tx, usuarioId, t);
        }
        return { tipo: 'transferencia', fila: await releer(tx, usuarioId, transferenciaId) };
      });
    },

    /**
     * R-4.10 y D-10: ajena o inexistente lanzan el mismo `NoEncontrado`. Expiración perezosa
     * (R-6.12): solo si está pendiente y vencida abre la transacción que la rechaza (§6.5).
     */
    async obtener(usuarioId: string, transferenciaId: string): Promise<FilaTransferencia> {
      const { fila, vencida } = await conTransaccion(async (tx) => {
        const leida = await leerTransferencia(tx, usuarioId, transferenciaId);
        if (!leida?.codigo || leida.estado !== 'PENDIENTE_CONFIRMACION') {
          return { fila: leida, vencida: false };
        }
        return {
          fila: leida,
          vencida: codigoVencido(leida.codigo.expiraEn, await reloj.ahora(tx)),
        };
      });
      if (!fila) throw new NoEncontrado();
      if (!vencida) return fila;
      return conTransaccion(async (tx) => {
        await bloquearUsuario(tx, usuarioId);
        const bloqueada = await leerTransferencia(tx, usuarioId, transferenciaId, {
          bloquear: true,
        });
        if (!bloqueada) throw new NoEncontrado();
        const guardado = await bloquearCodigo(tx, transferenciaId);
        const ahora = await reloj.ahora(tx);
        // Otra petición pudo resolverla mientras tanto: se vuelve a comprobar con los bloqueos.
        if (
          bloqueada.estado !== 'PENDIENTE_CONFIRMACION' ||
          !guardado ||
          !codigoVencido(guardado.expiraEn, ahora)
        ) {
          return bloqueada;
        }
        return expirar(tx, usuarioId, bloqueada, ahora);
      });
    },
  };
}

export type CasosUsoTransferencias = ReturnType<typeof crearCasosUsoTransferencias>;
