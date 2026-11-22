import { ErrorApi, ErrorRed } from './errores';

/** design.md §13.2: AbortController de 15 s por petición, igual que en móvil (D-17). */
export const TIMEOUT_MS = 15_000;

/** URL absoluta bajo `/api` del mismo origen (en local, el proxy de Vite, D-06). */
export function urlApi(ruta: string, query?: Record<string, unknown>): URL {
  const url = new URL(`/api${ruta}`, globalThis.location.origin);
  for (const [nombre, valor] of Object.entries(query ?? {})) {
    if (valor !== undefined && valor !== null && valor !== '') {
      url.searchParams.set(nombre, String(valor));
    }
  }
  return url;
}

/** `fetch` con timeout de 15 s. Un fallo de red o el timeout se convierten en `ErrorRed`. */
export async function enviar(url: URL, init: RequestInit): Promise<Response> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controlador.signal });
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
