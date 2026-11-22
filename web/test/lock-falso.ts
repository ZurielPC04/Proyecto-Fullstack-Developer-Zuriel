/**
 * Web Locks falso: serializa los callbacks de un mismo nombre, como hace el navegador entre
 * pestañas. Todas las "pestañas" de una prueba comparten la instancia de `navigator.locks`.
 */
export function crearLockFalso() {
  const colas = new Map<string, Promise<unknown>>();
  return {
    request<T>(nombre: string, callback: (lock: { name: string }) => Promise<T>): Promise<T> {
      const anterior = colas.get(nombre) ?? Promise.resolve();
      const turno = anterior.then(() => callback({ name: nombre }));
      colas.set(
        nombre,
        turno.catch(() => undefined),
      );
      return turno;
    },
  };
}

export function instalarLockFalso() {
  Object.defineProperty(navigator, 'locks', { value: crearLockFalso(), configurable: true });
}
