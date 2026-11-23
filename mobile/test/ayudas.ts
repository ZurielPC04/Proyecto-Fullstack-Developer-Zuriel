// Dobles de prueba: almacén en memoria y fetch simulado que registran el orden de las llamadas.
import { crearCliente } from '../src/api/cliente';
import type { Almacen } from '../src/auth/almacen';
import { crearSesion } from '../src/auth/sesion';
import type { ContextoApp } from '../src/contexto';
import type { Conexion } from '../src/transferencia/conexion';
import { crearMotor } from '../src/transferencia/motor';

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
    // Como SecureStore, la escritura termina después, en otra tarea del event loop; se anota al
    // terminar, así el registro distingue una escritura esperada de una que no se espera. Usa
    // `setImmediate`, que las pruebas con temporizadores falsos dejan real (ayudas-transferencia).
    async setItemAsync(llave, valor) {
      await new Promise<void>((r) => setImmediate(r));
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
  llave: string | null;
  cuerpo: unknown;
  signal: AbortSignal | undefined;
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
      llave: cabeceras['Idempotency-Key'] ?? null,
      cuerpo: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      signal: init.signal ?? undefined,
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

/** NetInfo simulado: `volver()` avisa que regresó la conexión a quien esté esperando. */
export function conexionSimulada(): Conexion & { volver: () => void } {
  const oyentes = new Set<() => void>();
  return {
    suscribir(alVolver) {
      oyentes.add(alVolver);
      return () => {
        oyentes.delete(alVolver);
      };
    },
    volver() {
      for (const oyente of [...oyentes]) oyente();
    },
  };
}

/** Llaves UUID v4 distintas en cada llamada, como `Crypto.randomUUID()`. */
export function generadorDeLlaves() {
  let n = 0;
  return jest.fn(() => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  });
}

/** Arma el contexto completo (sesión, cliente y motor) sobre un almacén y un fetch dados. */
export function armarContexto(almacen: Almacen, fetchFn: typeof fetch) {
  const sesion = crearSesion({ apiUrl: API, almacen, fetchFn });
  const cliente = crearCliente({ apiUrl: API, sesion, fetchFn });
  const conexion = conexionSimulada();
  const generarLlave = generadorDeLlaves();
  const motor = crearMotor({ cliente, sesion, almacen, conexion, generarLlave });
  const contexto: ContextoApp = { apiUrl: API, sesion, cliente, motor };
  return { contexto, conexion, generarLlave };
}

/** Contexto de la app con dobles: la API responde con `manejador`. */
export function contextoDePrueba(
  manejador: Manejador,
  almacenInicial: Record<string, string> = {},
) {
  const registro: Registro = [];
  const almacen = almacenEnMemoria(registro, almacenInicial);
  const { fetchFn, peticiones } = fetchSimulado(registro, manejador);
  return { ...armarContexto(almacen, fetchFn), almacen, peticiones, registro };
}

/** Un access con forma de JWT cuyo `sub` es `usuarioId` (§5.2); la firma no se verifica. */
export function accessDe(usuarioId: string, version = 1): string {
  const base64url = (texto: string) =>
    btoa(texto).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const carga = base64url(JSON.stringify({ sub: usuarioId, v: version }));
  return `${base64url('{"alg":"HS256"}')}.${carga}.firma`;
}

/** Una promesa que se resuelve a mano, para controlar cuándo responde el refresh. */
export function diferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}
