// Transporte HTTP de la app móvil (design.md §13.3, D-17).
import { ErrorApi, ErrorRed } from './errores';

/** D-17: timeout de 15 s por petición. */
export const TIMEOUT_MS = 15_000;

/**
 * URL absoluta bajo `apiUrl` (que ya termina en `/api`). Arma la query a mano: el `URL` de
 * React Native no implementa `searchParams`.
 */
export function urlApi(apiUrl: string, ruta: string, query?: Record<string, unknown>): string {
  const pares = Object.entries(query ?? {})
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([nombre, valor]) => `${encodeURIComponent(nombre)}=${encodeURIComponent(String(valor))}`);
  return `${apiUrl}${ruta}${pares.length > 0 ? `?${pares.join('&')}` : ''}`;
}

/** `fetch` con timeout de 15 s. Un fallo de red o el timeout se convierten en `ErrorRed`. */
export async function enviar(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    return await fetchFn(url, { ...init, signal: controlador.signal });
  } catch (causa) {
    throw new ErrorRed(causa);
  } finally {
    clearTimeout(temporizador);
  }
}

/** Lee el problem RFC 7807 de una respuesta no exitosa y lo envuelve en `ErrorApi`. */
export async function errorDeRespuesta(respuesta: Response): Promise<ErrorApi> {
  let problema: ConstructorParameters<typeof ErrorApi>[1] = null;
  try {
    const cuerpo: unknown = await respuesta.json();
    if (cuerpo !== null && typeof cuerpo === 'object' && 'type' in cuerpo) {
      problema = cuerpo as NonNullable<typeof problema>;
    }
  } catch {
    // Sin cuerpo JSON: el error queda solo con el status.
  }
  return new ErrorApi(respuesta.status, problema);
}

export const CABECERAS_JSON = { 'Content-Type': 'application/json' };
