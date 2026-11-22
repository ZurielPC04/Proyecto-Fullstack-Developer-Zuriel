// Cliente fetch tipado con `paths` de openapi.yaml (design.md §4.3, §13.2, RNF-18).
import type { paths } from '@billetera/shared';
import { obtenerAccess, refrescar } from '../auth/sesion';
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

function sustituirRuta(ruta: string, path: Record<string, string> | undefined): string {
  return ruta.replace(/\{(\w+)\}/g, (_, nombre: string) => {
    const valor = path?.[nombre];
    if (valor === undefined) throw new Error(`Falta el parámetro de ruta ${nombre}`);
    return encodeURIComponent(valor);
  });
}

async function una(
  metodo: Metodo,
  url: URL,
  body: unknown,
  accessUsado: string | null,
  extra: Record<string, string> = {},
): Promise<Response> {
  const cabeceras: Record<string, string> = { ...extra };
  if (accessUsado !== null) cabeceras.Authorization = `Bearer ${accessUsado}`;
  if (body !== undefined) cabeceras['Content-Type'] = 'application/json';
  return enviar(url, {
    method: metodo.toUpperCase(),
    headers: cabeceras,
    body: body === undefined ? undefined : JSON.stringify(body),
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

type OpcionesPeticion = {
  path?: unknown;
  query?: unknown;
  body?: unknown;
  headers?: Record<string, string>;
};

/** Respuesta exitosa con su status: la transferencia distingue el `201` del `202` (§13.2). */
export type RespuestaConEstado = { status: number; cuerpo: unknown };

/**
 * DD-43: ante un `401 unauthorized` refresca una vez (dentro del Web Lock) y repite la
 * petición una sola vez, con los mismos encabezados (un `POST /transferencias` repite su
 * llave). Un `401 credenciales-invalidas` no dispara el refresh.
 */
async function peticion(
  metodo: Metodo,
  ruta: string,
  opciones: OpcionesPeticion = {},
): Promise<RespuestaConEstado> {
  const url = urlApi(
    sustituirRuta(ruta, opciones.path as Record<string, string> | undefined),
    opciones.query as Record<string, unknown> | undefined,
  );
  const accessUsado = obtenerAccess();
  let respuesta = await una(metodo, url, opciones.body, accessUsado, opciones.headers);
  if (await esUnauthorized(respuesta)) {
    if (await refrescar(accessUsado)) {
      respuesta = await una(metodo, url, opciones.body, obtenerAccess(), opciones.headers);
    }
  }
  if (!respuesta.ok) throw await errorDeRespuesta(respuesta);
  if (respuesta.status === 204) return { status: 204, cuerpo: undefined };
  return { status: respuesta.status, cuerpo: await respuesta.json() };
}

export const api = {
  get<P extends RutaDe<'get'>>(
    ruta: P,
    opciones?: Opciones<Operacion<P, 'get'>>,
  ): Promise<Exito<Operacion<P, 'get'>>> {
    return peticion('get', ruta, opciones).then((r) => r.cuerpo) as Promise<
      Exito<Operacion<P, 'get'>>
    >;
  },
  post<P extends RutaDe<'post'>>(
    ruta: P,
    opciones?: Opciones<Operacion<P, 'post'>>,
  ): Promise<Exito<Operacion<P, 'post'>>> {
    return peticion('post', ruta, opciones).then((r) => r.cuerpo) as Promise<
      Exito<Operacion<P, 'post'>>
    >;
  },
  /**
   * POST que devuelve también el status y acepta encabezados propios (`Idempotency-Key`).
   * El cuerpo queda sin tipo: quien llama lo interpreta según el status.
   */
  postConEstado<P extends RutaDe<'post'>>(
    ruta: P,
    opciones: Opciones<Operacion<P, 'post'>> & { headers?: Record<string, string> },
  ): Promise<RespuestaConEstado> {
    return peticion('post', ruta, opciones);
  },
};
