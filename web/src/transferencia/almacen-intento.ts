// D-16, DD-25 y DD-32: el intento de transferencia vive en sessionStorage con esta llave, con su
// fase (design.md §6.2, "Reanudación en los clientes"). Nunca lleva tokens (R-4.25).
import { esquemaTransferencia } from '@billetera/shared';
import { z } from 'zod';

export const CLAVE_INTENTO = 'billetera:intento';

const texto = z.string();

const base = {
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

export function guardarIntento(intento: IntentoGuardado): void {
  try {
    sessionStorage.setItem(CLAVE_INTENTO, JSON.stringify(intento));
  } catch {
    // Almacenamiento bloqueado: el intento sigue en memoria, solo no sobrevive a una recarga.
  }
}

/** El intento guardado, o null si no hay o no se reconoce (en ese caso se descarta). */
export function leerIntento(): IntentoGuardado | null {
  let crudo: string | null;
  try {
    crudo = sessionStorage.getItem(CLAVE_INTENTO);
  } catch {
    return null;
  }
  if (crudo === null) return null;
  try {
    const resultado = esquemaIntento.safeParse(JSON.parse(crudo));
    if (resultado.success) return resultado.data;
  } catch {
    // JSON dañado: se trata igual que un intento irreconocible.
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
