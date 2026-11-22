// Peticiones de la máquina del intento (design.md §13.2, D-16, DD-43). Sin useMutation: la
// máquina decide qué reintentar y con qué llave.
import type {
  Comprobante,
  MotivoRechazo,
  PendienteConfirmacion,
  SolicitudTransferencia,
  Transferencia,
} from '@billetera/shared';
import { mensajeDeProblema } from '@billetera/shared';
import { api } from '../api/cliente';
import { ErrorApi, ErrorRed } from '../api/errores';

export type ResultadoCreacion =
  { status: 201; comprobante: Comprobante } | { status: 202; pendiente: PendienteConfirmacion };

/** `POST /transferencias` con la llave del intento (R-4.20, D-03). */
export async function crearTransferencia(
  llave: string,
  cuerpo: SolicitudTransferencia,
): Promise<ResultadoCreacion> {
  const respuesta = await api.postConEstado('/transferencias', {
    body: cuerpo,
    headers: { 'Idempotency-Key': llave },
  });
  if (respuesta.status === 202) {
    return { status: 202, pendiente: respuesta.cuerpo as PendienteConfirmacion };
  }
  return { status: 201, comprobante: respuesta.cuerpo as Comprobante };
}

/** `POST /transferencias/{id}/confirmar`: idempotente por el id (R-6.13, D-07). */
export async function confirmarTransferencia(
  transferenciaId: string,
  codigo: string,
): Promise<Comprobante> {
  return api.post('/transferencias/{transferenciaId}/confirmar', {
    path: { transferenciaId },
    body: { codigo },
  });
}

/** `GET /transferencias/{id}`: el estado real, con la expiración perezosa (DD-32, R-6.12). */
export async function obtenerTransferencia(transferenciaId: string): Promise<Transferencia> {
  return api.get('/transferencias/{transferenciaId}', { path: { transferenciaId } });
}

/** §6.2: el comprobante de una transferencia aplicada, armado con la respuesta del `GET`. */
export function comprobanteDeTransferencia(t: Transferencia): Comprobante {
  return {
    transferenciaId: t.id,
    estado: 'APLICADA',
    tipo: t.tipo,
    montoCentavos: t.montoCentavos,
    concepto: t.concepto,
    referencia: t.referencia,
    origen: t.origen,
    destino: t.destino,
    creadaEn: t.creadaEn,
    aplicadaEn: t.aplicadaEn ?? t.creadaEn,
  };
}

/** El `type` del problem de cada motivo es el motivo en kebab-case (design.md §7.2). */
export function mensajeDeMotivo(motivo: MotivoRechazo | null): string {
  return mensajeDeProblema(
    motivo === null ? 'internal-error' : motivo.toLowerCase().replaceAll('_', '-'),
  );
}

/**
 * design.md §13.2 "Respuestas fuera del caso feliz": la red, el timeout, cualquier `5xx` y un
 * `401` que el refresh no resolvió dejan el resultado incierto, así que el intento se conserva
 * y se reintenta con la misma llave. Los demás `4xx` cierran el intento.
 */
export function esResultadoIncierto(error: unknown): boolean {
  if (error instanceof ErrorRed) return true;
  if (error instanceof ErrorApi) return error.status >= 500 || error.status === 401;
  return true;
}
