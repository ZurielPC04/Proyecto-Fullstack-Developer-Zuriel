// Sesión de la web (design.md §13.2, D-05, D-06, DD-24, DD-43).
// El access vive solo en esta variable de módulo: nunca en localStorage ni sessionStorage
// (R-1.13, RNF-05). El refresh viaja solo en la cookie HttpOnly que pone la API.
import type { QueryClient } from '@tanstack/react-query';
import type { Tokens } from '@billetera/shared';
import { enviar, errorDeRespuesta, urlApi } from '../api/http';
import { borrarIntento } from '../transferencia/almacen-intento';

let access: string | null = null;
const suscriptores = new Set<() => void>();

function establecerAccess(nuevo: string | null): void {
  if (nuevo === access) return;
  access = nuevo;
  for (const avisar of suscriptores) avisar();
}

export function obtenerAccess(): string | null {
  return access;
}

/**
 * R-1.12 y §13.2: el `sub` del access actual (§5.2), o null si no hay access o no se puede
 * leer. Lee el payload sin verificar la firma: solo decide de quién es el intento guardado en
 * esta pestaña; la API vuelve a autenticar cada petición.
 */
export function usuarioActual(): string | null {
  const payload = access?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as {
      sub?: unknown;
    };
    return typeof claims.sub === 'string' && claims.sub !== '' ? claims.sub : null;
  } catch {
    return null;
  }
}

export function haySesion(): boolean {
  return access !== null;
}

/** Para `useSyncExternalStore`: avisa cada vez que se obtiene o se pierde el access. */
export function suscribirSesion(avisar: () => void): () => void {
  suscriptores.add(avisar);
  return () => suscriptores.delete(avisar);
}

/** Borra el access en memoria (logout, refresh fallido). */
export function olvidarAccess(): void {
  establecerAccess(null);
}

// R-1.16 y DD-24: el refresh y el logout por cookie exigen este header.
const CABECERAS_COOKIE = { 'X-Requested-With': 'fetch' };

/**
 * R-1.14 y R-1.15: obtiene un access nuevo con la cookie, dentro del Web Lock, para que solo
 * una pestaña rote a la vez. `accessFallido` es el access con el que falló la petición (o null
 * al cargar): si dentro del lock el access ya es otro, otra petición de esta pestaña ya rotó y
 * no se vuelve a rotar (§13.2, "Alcance de la revisión previa").
 * Devuelve true si hay un access válido al salir.
 */
export async function refrescar(accessFallido: string | null): Promise<boolean> {
  return await navigator.locks.request('billetera-refresh', async () => {
    if (access !== null && access !== accessFallido) return true;
    const respuesta = await enviar(urlApi('/auth/refresh'), {
      method: 'POST',
      headers: CABECERAS_COOKIE,
      credentials: 'same-origin',
    });
    if (!respuesta.ok) {
      establecerAccess(null);
      return false;
    }
    const cuerpo = (await respuesta.json()) as Tokens;
    establecerAccess(cuerpo.accessToken);
    return true;
  });
}

/**
 * R-1.6 y DD-24: login con `cliente: "web"`; la API pone el refresh en la cookie y devuelve
 * solo el access. Un 401 credenciales-invalidas se lanza tal cual, sin intentar un refresh.
 */
export async function iniciarSesion(correo: string, contrasena: string): Promise<void> {
  const respuesta = await enviar(urlApi('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ correo, contrasena, cliente: 'web' }),
  });
  if (!respuesta.ok) throw await errorDeRespuesta(respuesta);
  const cuerpo = (await respuesta.json()) as Tokens;
  establecerAccess(cuerpo.accessToken);
}

/**
 * R-1.12: revoca la familia en la API (que borra la cookie), y en el cliente borra el
 * intento guardado, la caché de TanStack Query y el access. El cliente se limpia aunque
 * la API no responda.
 */
export async function cerrarSesion(queryClient: QueryClient): Promise<void> {
  try {
    await enviar(urlApi('/auth/logout'), {
      method: 'POST',
      headers: CABECERAS_COOKIE,
      credentials: 'same-origin',
    });
  } catch {
    // Sin red: la familia vence sola (DD-30); el cliente se limpia igual.
  }
  borrarIntento();
  queryClient.clear();
  establecerAccess(null);
}
