import { instanteIso, type TipoProblema } from '@billetera/shared';
import { crearProblema, type Problema } from '../../plataforma/http/problemas.js';
import type { MotivoRechazo, TipoTransferencia } from './transferencias.dominio.js';

/**
 * La transferencia tal como la lee el repositorio, con los datos del comprobante (§6.6).
 * Los instantes son el texto de pg (DD-07); las CLABE van completas y aquí se recortan.
 */
export interface FilaTransferencia {
  id: string;
  estado: 'PENDIENTE_CONFIRMACION' | 'APLICADA' | 'RECHAZADA';
  tipo: TipoTransferencia;
  montoCentavos: number;
  concepto: string;
  referencia: string;
  origen: { cuentaId: string; nombre: string; clabe: string };
  /** `cuentaId` es interno: sirve para bloquear al confirmar y nunca sale en la respuesta. */
  destino: { cuentaId: string; etiqueta: string; nombre: string; clabe: string };
  creadoEn: string;
  aplicadaEn: string | null;
  motivoRechazo: MotivoRechazo | null;
  /** Solo si la transferencia se creó como pendiente (§6.2): tiene `codigo_confirmacion`. */
  codigo: { expiraEn: string; intentos: number } | null;
}

export type RespuestaTransferencia =
  | { status: 201; cuerpo: ReturnType<typeof comprobante> }
  | { status: 202; cuerpo: Record<string, unknown> }
  | { status: 422; cuerpo: Problema };

/** DD-34: las CLABE solo con sus últimos 4 dígitos. */
const terminacion = (clabe: string) => clabe.slice(-4);

/** DD-23: el `type` de un rechazo es su motivo en kebab-case. */
export function tipoDeMotivo(motivo: MotivoRechazo): TipoProblema {
  return motivo.toLowerCase().replaceAll('_', '-') as TipoProblema;
}

function resumen(fila: FilaTransferencia) {
  return {
    origen: {
      cuentaId: fila.origen.cuentaId,
      nombre: fila.origen.nombre,
      clabeTerminacion: terminacion(fila.origen.clabe),
    },
    destino: {
      etiqueta: fila.destino.etiqueta,
      nombre: fila.destino.nombre,
      clabeTerminacion: terminacion(fila.destino.clabe),
    },
  };
}

function comprobante(fila: FilaTransferencia, aplicadaEn: string) {
  return {
    transferenciaId: fila.id,
    estado: 'APLICADA' as const,
    tipo: fila.tipo,
    montoCentavos: fila.montoCentavos,
    concepto: fila.concepto,
    referencia: fila.referencia,
    ...resumen(fila),
    creadaEn: instanteIso(fila.creadoEn),
    aplicadaEn: instanteIso(aplicadaEn),
  };
}

/** Contrato `Comprobante` de una transferencia aplicada. */
export function comprobanteDe(fila: FilaTransferencia) {
  if (fila.aplicadaEn === null)
    throw new Error('Solo una transferencia aplicada tiene comprobante');
  return comprobante(fila, fila.aplicadaEn);
}

/** Problem del rechazo guardado: `type` del motivo, `motivo` y `transferenciaId` (§7.2). */
export function problemaDeRechazo(fila: FilaTransferencia): Problema {
  if (fila.motivoRechazo === null) throw new Error('La transferencia rechazada no tiene motivo');
  return crearProblema(tipoDeMotivo(fila.motivoRechazo), {
    motivo: fila.motivoRechazo,
    transferenciaId: fila.id,
  });
}

/**
 * §2.1 y §6.2: única traducción de la fila a la respuesta de `POST /transferencias`. La usan la
 * primera respuesta y su repetición, así que son idénticas por construcción (R-4.14).
 */
export function respuestaDeTransferencia(fila: FilaTransferencia): RespuestaTransferencia {
  // DD-32: creada como pendiente (tiene código) → siempre el 202 original, sin codigoSimulado
  // (DD-25), aunque después se haya aplicado, rechazado o vencido.
  if (fila.codigo) {
    return {
      status: 202,
      cuerpo: {
        transferenciaId: fila.id,
        estado: 'PENDIENTE_CONFIRMACION',
        montoCentavos: fila.montoCentavos,
        codigoExpiraEn: instanteIso(fila.codigo.expiraEn),
      },
    };
  }
  return respuestaDeConfirmacion(fila);
}

/**
 * Respuesta según el estado actual: la de confirmar (R-6.10, R-6.13) y la de una transferencia
 * sin código. Una pendiente no tiene respuesta aquí: confirmar siempre la resuelve.
 */
export function respuestaDeConfirmacion(fila: FilaTransferencia): RespuestaTransferencia {
  if (fila.estado === 'APLICADA') return { status: 201, cuerpo: comprobanteDe(fila) };
  if (fila.estado === 'RECHAZADA') return { status: 422, cuerpo: problemaDeRechazo(fila) };
  throw new Error('Una transferencia pendiente no tiene respuesta de confirmación');
}

/** Contrato `Transferencia` (R-4.10): el estado real, con el mismo origen y destino. */
export function aTransferencia(fila: FilaTransferencia) {
  return {
    id: fila.id,
    estado: fila.estado,
    tipo: fila.tipo,
    montoCentavos: fila.montoCentavos,
    concepto: fila.concepto,
    referencia: fila.referencia,
    ...resumen(fila),
    creadaEn: instanteIso(fila.creadoEn),
    aplicadaEn: fila.aplicadaEn === null ? null : instanteIso(fila.aplicadaEn),
    motivoRechazo: fila.motivoRechazo,
    codigoExpiraEn:
      fila.estado === 'PENDIENTE_CONFIRMACION' && fila.codigo
        ? instanteIso(fila.codigo.expiraEn)
        : null,
  };
}
