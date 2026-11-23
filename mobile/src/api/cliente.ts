// Cliente fetch tipado con `paths` de openapi.yaml (design.md §4.3, §13.3, RNF-18).
import type { paths } from '@billetera/shared';
import type { Sesion } from '../auth/sesion';
import { enviar, errorDeRespuesta, urlApi } from './http';

type Metodo = 'get' | 'post';
type Operacion<P extends keyof paths, M extends Metodo> = NonNullable<paths[P][M]>;
type RutaDe<M extends Metodo> = {
  [P in keyof paths]: [Operacion<P, M>] extends [never] ? never : P;
}[keyof paths];

type Json<R> = R extends { content: { 'application/json': infer C } } ? C : undefined;
type Exito<O> = O extends { responses: infer R }
  ? 200 extends keyof R
    ? Json<R[200]>
    : 201 extends keyof R
      ? Json<R[201]>
      : undefined
  : never;

type Opciones<O> = {
  path?: O extends { parameters: { path: infer X } } ? X : never;
  query?: O extends { parameters: { query?: infer Q } } ? Q : never;
  body?: O extends { requestBody: { content: { 'application/json': infer B } } } ? B : never;
};

type OpcionesPeticion = {
  path?: unknown;
  query?: unknown;
  body?: unknown;
  headers?: Record<string, string>;
};

function sustituirRuta(ruta: string, path: Record<string, string> | undefined): string {
  return ruta.replace(/\{(\w+)\}/g, (_, nombre: string) => {
    const valor = path?.[nombre];
    if (valor === undefined) throw new Error(`Falta el parámetro de ruta ${nombre}`);
    return encodeURIComponent(valor);
  });
}

async function esUnauthorized(respuesta: Response): Promise<boolean> {
  if (respuesta.status !== 401) return false;
  try {
    const cuerpo = (await respuesta.clone().json()) as { type?: unknown };
    return cuerpo.type === 'unauthorized';
  } catch {
    return true;
  }
}

export type DependenciasCliente = { apiUrl: string; sesion: Sesion; fetchFn?: typeof fetch };

export type Cliente = ReturnType<typeof crearCliente>;

export function crearCliente({ apiUrl, sesion, fetchFn = fetch }: DependenciasCliente) {
  function una(
    metodo: Metodo,
    url: string,
    opciones: OpcionesPeticion,
    accessUsado: string | null,
  ): Promise<Response> {
    const cabeceras: Record<string, string> = { ...opciones.headers };
    if (accessUsado !== null) cabeceras.Authorization = `Bearer ${accessUsado}`;
    if (opciones.body !== undefined) cabeceras['Content-Type'] = 'application/json';
    return enviar(fetchFn, url, {
      method: metodo.toUpperCase(),
      headers: cabeceras,
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
    });
  }

  /**
   * R-1.17: ante un `401 unauthorized` espera la única promesa de refresh y repite una vez,
   * con los mismos encabezados. Un `401 credenciales-invalidas` no dispara el refresh.
   */
  async function peticion(metodo: Metodo, ruta: string, opciones: OpcionesPeticion = {}) {
    const url = urlApi(
      apiUrl,
      sustituirRuta(ruta, opciones.path as Record<string, string> | undefined),
      opciones.query as Record<string, unknown> | undefined,
    );
    const accessUsado = sesion.obtenerAccess();
    let respuesta = await una(metodo, url, opciones, accessUsado);
    if (await esUnauthorized(respuesta)) {
      if (await sesion.refrescar(accessUsado)) {
        respuesta = await una(metodo, url, opciones, sesion.obtenerAccess());
      }
    }
    if (!respuesta.ok) throw await errorDeRespuesta(respuesta);
    if (respuesta.status === 204) return undefined;
    return (await respuesta.json()) as unknown;
  }

  return {
    /**
     * Una sola petición, sin refresh ni lectura del cuerpo: el motor de transferencias decide
     * qué hacer con cada status, incluido el `401` (design.md §13.3, DD-45). Devuelve también el
     * access con el que salió, para que el refresh no rote dos veces (R-1.17).
     */
    async cruda(
      metodo: Metodo,
      ruta: keyof paths,
      opciones: OpcionesPeticion = {},
    ): Promise<{ respuesta: Response; accessUsado: string | null }> {
      const url = urlApi(
        apiUrl,
        sustituirRuta(ruta, opciones.path as Record<string, string> | undefined),
      );
      const accessUsado = sesion.obtenerAccess();
      return { respuesta: await una(metodo, url, opciones, accessUsado), accessUsado };
    },

    get<P extends RutaDe<'get'>>(
      ruta: P,
      opciones?: Opciones<Operacion<P, 'get'>>,
    ): Promise<Exito<Operacion<P, 'get'>>> {
      return peticion('get', ruta, opciones) as Promise<Exito<Operacion<P, 'get'>>>;
    },
    post<P extends RutaDe<'post'>>(
      ruta: P,
      opciones?: Opciones<Operacion<P, 'post'>>,
    ): Promise<Exito<Operacion<P, 'post'>>> {
      return peticion('post', ruta, opciones) as Promise<Exito<Operacion<P, 'post'>>>;
    },
  };
}
