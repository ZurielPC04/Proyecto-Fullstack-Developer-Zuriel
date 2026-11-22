import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { instanteIso } from '@billetera/shared';

/** design.md §2.1: reglas puras de las transferencias, sin E/S. */

export type TipoTransferencia = 'TRASPASO' | 'TERCERO';
export type MotivoRechazo =
  'SALDO_INSUFICIENTE' | 'LIMITE_DIARIO_EXCEDIDO' | 'CODIGO_AGOTADO' | 'CODIGO_EXPIRADO';

/** D-04 y DD-17: por el dueño real de la cuenta destino, nunca por `destino.tipo` (DD-26). */
export function clasificar(usuarioId: string, duenoDestinoId: string): TipoTransferencia {
  return duenoDestinoId === usuarioId ? 'TRASPASO' : 'TERCERO';
}

export interface EntradaDecision {
  tipo: TipoTransferencia;
  montoCentavos: number;
  saldoOrigenCentavos: number;
  /** Envíos a tercero aplicados hoy (§6.4); solo cuenta para un TERCERO. */
  consumidoCentavos: number;
  limiteCentavos: number;
  /**
   * UMBRAL_CODIGO_CENTAVOS al crear; `null` al confirmar, porque el código ya se pidió y solo
   * se vuelven a validar saldo y límite (R-6.10).
   */
  umbralCentavos: number | null;
}

export type Decision =
  | { estado: 'APLICADA' }
  | { estado: 'PENDIENTE_CONFIRMACION' }
  | { estado: 'RECHAZADA'; motivo: MotivoRechazo };

/** §6.1 pasos 3.5 a 3.7 y DD-31: orden fijo saldo → límite → umbral. */
export function decidir(entrada: EntradaDecision): Decision {
  if (entrada.saldoOrigenCentavos < entrada.montoCentavos) {
    return { estado: 'RECHAZADA', motivo: 'SALDO_INSUFICIENTE' };
  }
  // R-6.1: llegar exactamente al límite está permitido; los traspasos no cuentan (R-6.3).
  if (
    entrada.tipo === 'TERCERO' &&
    entrada.consumidoCentavos + entrada.montoCentavos > entrada.limiteCentavos
  ) {
    return { estado: 'RECHAZADA', motivo: 'LIMITE_DIARIO_EXCEDIDO' };
  }
  // R-6.8 y R-6.9: solo a tercero y estrictamente por encima del umbral.
  if (
    entrada.tipo === 'TERCERO' &&
    entrada.umbralCentavos !== null &&
    entrada.montoCentavos > entrada.umbralCentavos
  ) {
    return { estado: 'PENDIENTE_CONFIRMACION' };
  }
  return { estado: 'APLICADA' };
}

/**
 * §6.5 y DD-33: HMAC-SHA256 hexadecimal de `transferenciaId:codigo`. Con el id en el mensaje, el
 * mismo código en dos transferencias da dos HMAC distintos. El código nunca se guarda (R-6.16).
 */
export function codigoHmac(secreto: string, transferenciaId: string, codigo: string): string {
  return createHmac('sha256', secreto).update(`${transferenciaId}:${codigo}`).digest('hex');
}

/** R-6.16: comparación de tiempo constante sobre los dos HMAC como Buffer de 32 bytes. */
export function codigoCoincide(guardadoHex: string, calculadoHex: string): boolean {
  const guardado = Buffer.from(guardadoHex, 'hex');
  const calculado = Buffer.from(calculadoHex, 'hex');
  if (guardado.length !== 32 || calculado.length !== 32) return false;
  return timingSafeEqual(guardado, calculado);
}

/**
 * §6.5: vencido si `expira_en <= ahora`. Los dos son texto de timestamptz en UTC (DD-07); en
 * ISO con 6 decimales (DD-22) el orden del texto es el del tiempo, sin pasar por Date.
 */
export function codigoVencido(expiraEn: string, ahora: string): boolean {
  return instanteIso(expiraEn) <= instanteIso(ahora);
}

export interface SolicitudTransferencia {
  cuentaOrigenId: string;
  destino:
    { tipo: 'BENEFICIARIO'; beneficiarioId: string } | { tipo: 'CUENTA_PROPIA'; cuentaId: string };
  montoCentavos: number;
  concepto: string;
  referencia: string;
}

/**
 * §6.2 y D-03: SHA-256 hexadecimal del arreglo canónico, calculado sobre la solicitud ya
 * normalizada por Zod (trim, NFC, uuid en minúsculas). Arreglo y no objeto: el orden de las
 * claves del cliente no importa; "v1" versiona el formato.
 */
export function hashPeticion(solicitud: SolicitudTransferencia): string {
  const { destino } = solicitud;
  const canonico = JSON.stringify([
    'v1',
    solicitud.cuentaOrigenId,
    destino.tipo,
    destino.tipo === 'BENEFICIARIO' ? destino.beneficiarioId : destino.cuentaId,
    solicitud.montoCentavos,
    solicitud.concepto,
    solicitud.referencia,
  ]);
  return createHash('sha256').update(canonico).digest('hex');
}
