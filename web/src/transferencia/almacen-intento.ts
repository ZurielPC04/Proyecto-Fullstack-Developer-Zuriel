// D-16 y DD-25: el intento de transferencia vive en sessionStorage con esta llave.
// T-WEB-06 y T-WEB-07 lo escriben y lo leen; aquí solo se define la llave y el borrado.

export const CLAVE_INTENTO = 'billetera:intento';

/** R-1.12: se borra al cerrar sesión y cuando la transferencia se resuelve. */
export function borrarIntento(): void {
  try {
    sessionStorage.removeItem(CLAVE_INTENTO);
  } catch {
    // Almacenamiento bloqueado por el navegador: no hay intento que borrar.
  }
}
