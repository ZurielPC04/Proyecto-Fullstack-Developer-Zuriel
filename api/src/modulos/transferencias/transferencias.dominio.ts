import { createHash } from 'node:crypto';

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
}

export type Decision = { estado: 'APLICADA' } | { estado: 'RECHAZADA'; motivo: MotivoRechazo };

/** §6.1 pasos 3.5 a 3.7 y DD-31: orden fijo saldo → límite → umbral. */
export function decidir(entrada: EntradaDecision): Decision {
  if (entrada.saldoOrigenCentavos < entrada.montoCentavos) {
    return { estado: 'RECHAZADA', motivo: 'SALDO_INSUFICIENTE' };
  }
  return { estado: 'APLICADA' };
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
