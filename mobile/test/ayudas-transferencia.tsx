// Escenario de transferencia: sesión restaurada como USUARIO, pantalla Estado montada y
// temporizadores falsos para el motor de reintentos (design.md §13.3).
import { act, render } from '@testing-library/react-native';
import { LLAVE_INTENTO, LLAVE_REFRESH } from '../src/auth/almacen';
import { ProveedorApp } from '../src/contexto';
import { PantallaEstado } from '../src/pantallas/PantallaEstado';
import type { Intento } from '../src/transferencia/intento';
import { REFRESH_1, REFRESH_2, accessDe, contextoDePrueba, type Peticion, tokens } from './ayudas';
import { USUARIO } from './datos';

/** Lo que responde la API a una petición de transferencias: `'red'` simula un fallo de red. */
export type Respuesta = Response | 'red' | Promise<Response>;

/**
 * Monta el escenario. `/auth/refresh` siempre entrega un access nuevo de USUARIO; el resto de las
 * rutas las responde `manejador`.
 */
export async function escenario(
  manejador: (p: Peticion) => Respuesta,
  almacenInicial: Record<string, string> = {},
) {
  let refrescos = 0;
  const prueba = contextoDePrueba(
    (p) => {
      if (p.ruta === '/auth/refresh') {
        refrescos += 1;
        return tokens(accessDe(USUARIO, refrescos), refrescos % 2 ? REFRESH_2 : REFRESH_1);
      }
      const r = manejador(p);
      if (r === 'red') throw new TypeError('Network request failed');
      return r;
    },
    { [LLAVE_REFRESH]: REFRESH_1, ...almacenInicial },
  );
  await prueba.contexto.sesion.restaurar();
  // Solo se falsean los temporizadores (las esperas del motor y el timeout de 15 s); el almacén
  // simulado y los cuerpos de `Response` siguen con `setImmediate` y `nextTick` reales.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  await render(
    <ProveedorApp value={prueba.contexto}>
      <PantallaEstado />
    </ProveedorApp>,
  );
  return {
    ...prueba,
    refrescos: () => refrescos,
    /** Peticiones a una ruta, sin contar el refresh. */
    a: (metodo: string, ruta: string) =>
      prueba.peticiones.filter((p) => p.metodo === metodo && p.ruta === ruta),
    intentoGuardado: (): Intento | null => {
      const crudo = prueba.almacen.datos.get(LLAVE_INTENTO);
      return crudo === undefined ? null : (JSON.parse(crudo) as Intento);
    },
  };
}

/**
 * Cede el event loop real varias veces para que terminen las escrituras del almacén simulado
 * (`setImmediate`) y las respuestas, sin mover el reloj falso: ninguna espera del motor se cumple.
 */
async function vaciar(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((r) => setImmediate(r));
    await jest.advanceTimersByTimeAsync(0);
  }
}

/** Avanza el reloj falso y deja correr las promesas pendientes. */
export async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
    await vaciar();
  });
}

/** Corre `accion` dentro de `act` y deja correr las escrituras del almacén y las respuestas. */
export async function hacer(accion: () => unknown): Promise<void> {
  await act(async () => {
    const resultado = accion();
    await vaciar();
    await resultado;
    await vaciar();
  });
}

/** Fallo de red hasta que `abort` dispare, como un servidor que no responde en 15 s. */
export function sinRespuesta(p: Peticion): Promise<Response> {
  return new Promise((_, rechazar) => {
    p.signal?.addEventListener('abort', () => rechazar(new Error('aborted')));
  });
}

export function respuestas(...cola: Array<Respuesta | number>) {
  return () => {
    const siguiente = cola.shift();
    if (siguiente === undefined) throw new Error('No hay más respuestas en la cola');
    return typeof siguiente === 'number' ? new Response(null, { status: siguiente }) : siguiente;
  };
}
