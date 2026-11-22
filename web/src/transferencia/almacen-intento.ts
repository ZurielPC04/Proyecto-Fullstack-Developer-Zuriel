// D-16, DD-25 y DD-32: el intento de transferencia vive en sessionStorage con esta llave, con su
// fase (design.md §6.2, "Reanudación en los clientes"). Nunca lleva tokens (R-4.25).
import { esquemaTransferencia } from '@billetera/shared';
import { z } from 'zod';

export const CLAVE_INTENTO = 'billetera:intento';

const texto = z.string();

const base = {
  // R-1.12: el `sub` del access con el que se creó; el intento es solo de ese usuario.
  usuarioId: texto.min(1),
  llave: z.guid(),
  datos: z.object({ solicitud: esquemaTransferencia, origen: texto, destino: texto }),
  valores: z.object({
    cuentaOrigenId: texto,
    destino: texto,
    monto: texto,
    concepto: texto,
    referencia: texto,
  }),
};

const esquemaIntento = z.discriminatedUnion('fase', [
  z.object({ fase: z.literal('creacion'), ...base }),
  z.object({
    fase: z.literal('confirmacion'),
    ...base,
    transferenciaId: z.guid(),
    codigoExpiraEn: texto,
    // DD-25: solo si vino en la primera respuesta 202.
    codigoSimulado: texto.optional(),
    // §6.2: el código capturado, solo mientras la confirmación no tiene respuesta definitiva.
    codigoEnVuelo: texto.optional(),
  }),
]);

export type IntentoGuardado = z.infer<typeof esquemaIntento>;

/** El intento sin su dueño: `guardarIntento` le pone el usuario de la sesión. */
export type IntentoSinUsuario = IntentoGuardado extends infer I
  ? I extends IntentoGuardado
    ? Omit<I, 'usuarioId'>
    : never
  : never;

/**
 * Guarda el intento a nombre de `usuarioId` (R-1.12). Sin usuario conocido no se guarda: un
 * intento sin dueño no se podría reanudar con seguridad.
 */
export function guardarIntento(usuarioId: string | null, intento: IntentoSinUsuario): void {
  if (usuarioId === null) {
    borrarIntento();
    return;
  }
  try {
    sessionStorage.setItem(CLAVE_INTENTO, JSON.stringify({ ...intento, usuarioId }));
  } catch {
    // Almacenamiento bloqueado: el intento sigue en memoria, solo no sobrevive a una recarga.
  }
}

/**
 * El intento guardado del usuario dado, o null si no hay. Un intento irreconocible, o de otro
 * usuario (o si no se sabe quién es el usuario actual), se borra sin devolverlo: no se envía
 * ni se muestra (R-1.12, §13.2).
 */
export function leerIntento(usuarioId: string | null): IntentoGuardado | null {
  let crudo: string | null;
  try {
    crudo = sessionStorage.getItem(CLAVE_INTENTO);
  } catch {
    return null;
  }
  if (crudo === null) return null;
  try {
    const resultado = esquemaIntento.safeParse(JSON.parse(crudo));
    if (resultado.success && usuarioId !== null && resultado.data.usuarioId === usuarioId) {
      return resultado.data;
    }
  } catch {
    // JSON dañado: se trata igual que un intento irreconocible o ajeno.
  }
  borrarIntento();
  return null;
}

/** R-1.12: se borra al cerrar sesión y cuando la transferencia se resuelve. */
export function borrarIntento(): void {
  try {
    sessionStorage.removeItem(CLAVE_INTENTO);
  } catch {
    // Almacenamiento bloqueado por el navegador: no hay intento que borrar.
  }
}
