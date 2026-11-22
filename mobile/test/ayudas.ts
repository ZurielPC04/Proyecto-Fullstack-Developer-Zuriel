// Dobles de prueba: almacén en memoria y fetch simulado que registran el orden de las llamadas.
import type { Almacen } from '../src/auth/almacen';

export const API = 'http://192.168.1.50:3000/api';

/** Refresh tokens con el formato del contrato: 43 caracteres base64url. */
export const REFRESH_1 = 'a'.repeat(43);
export const REFRESH_2 = 'b'.repeat(43);

export type Registro = string[];

export function almacenEnMemoria(
  registro: Registro,
  inicial: Record<string, string> = {},
): Almacen & { datos: Map<string, string> } {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    async getItemAsync(llave) {
      return datos.get(llave) ?? null;
    },
    // Como SecureStore, la escritura termina después; se anota al terminar, así el registro
    // distingue una escritura esperada de una que no se espera.
    async setItemAsync(llave, valor) {
      await new Promise((r) => setTimeout(r, 0));
      registro.push(`almacen.set ${llave}=${valor}`);
      datos.set(llave, valor);
    },
    async deleteItemAsync(llave) {
      registro.push(`almacen.delete ${llave}`);
      datos.delete(llave);
    },
  };
}

export type Peticion = {
  metodo: string;
  ruta: string;
  autorizacion: string | null;
  cuerpo: unknown;
};

type Manejador = (peticion: Peticion) => Response | Promise<Response>;

/** `fetch` que delega en `manejador` y anota `fetch METODO ruta autorizacion` en el registro. */
export function fetchSimulado(registro: Registro, manejador: Manejador) {
  const peticiones: Peticion[] = [];
  const fn = jest.fn(async (url: string, init: RequestInit = {}) => {
    const cabeceras = (init.headers ?? {}) as Record<string, string>;
    const peticion: Peticion = {
      metodo: init.method ?? 'GET',
      ruta: url.slice(API.length),
      autorizacion: cabeceras.Authorization ?? null,
      cuerpo: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    peticiones.push(peticion);
    registro.push(`fetch ${peticion.metodo} ${peticion.ruta} ${peticion.autorizacion ?? '-'}`);
    return manejador(peticion);
  });
  return { fetchFn: fn as unknown as typeof fetch, peticiones };
}

export function problema(status: number, type: string): Response {
  return Response.json({ type, title: type, status }, { status });
}

export function tokens(access: string, refresh: string): Response {
  return Response.json({
    accessToken: access,
    accessExpiraEn: '2026-11-22T12:15:00.000Z',
    refreshToken: refresh,
    refreshExpiraEn: '2026-11-29T12:00:00.000Z',
  });
}

/** Una promesa que se resuelve a mano, para controlar cuándo responde el refresh. */
export function diferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}
