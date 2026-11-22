import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/cliente';
import { ErrorApi } from '../src/api/errores';
import { iniciarSesion, obtenerAccess, refrescar } from '../src/auth/sesion';
import { problema, servidor, tokens } from './servidor';

const CUENTAS = { items: [] };

/** GET /cuentas: 200 solo con el access dado; con cualquier otro, 401 unauthorized. */
function cuentasSoloCon(accessValido: string, conteo: { n: number }) {
  return http.get('/api/cuentas', ({ request }) => {
    conteo.n++;
    return request.headers.get('Authorization') === `Bearer ${accessValido}`
      ? HttpResponse.json(CUENTAS)
      : problema(401, 'unauthorized');
  });
}

describe('sesión de la web (design.md §13.2)', () => {
  it('R-1.13 RNF-05 el access nunca se escribe en localStorage ni en sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const conteo = { n: 0 };
    servidor.use(
      http.post('/api/auth/login', () => tokens('access-de-login')),
      http.post('/api/auth/refresh', () => tokens('access-rotado')),
      cuentasSoloCon('access-rotado', conteo),
    );

    await iniciarSesion('ana@demo.mx', 'una contraseña larga');
    await api.get('/cuentas');

    expect(obtenerAccess()).toBe('access-rotado');
    expect(setItem).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
    setItem.mockRestore();
  });

  it('R-1.15 dos peticiones de la misma pestaña que reciben 401 a la vez producen un refresh', async () => {
    let refrescos = 0;
    const conteo = { n: 0 };
    servidor.use(
      http.post('/api/auth/login', () => tokens('access-viejo')),
      http.post('/api/auth/refresh', async () => {
        refrescos++;
        await delay(20);
        return tokens('access-nuevo');
      }),
      cuentasSoloCon('access-nuevo', conteo),
    );
    await iniciarSesion('ana@demo.mx', 'una contraseña larga');

    const resultados = await Promise.all([api.get('/cuentas'), api.get('/cuentas')]);

    expect(refrescos).toBe(1);
    expect(resultados).toEqual([CUENTAS, CUENTAS]);
  });

  it('R-1.15 dos pestañas refrescan sin solaparse y la API nunca ve un reúso', async () => {
    // La cookie es del navegador, compartida por las pestañas; la API la rota en cada refresh.
    const cookie = { actual: 'c0', usadas: new Set<string>(), enVuelo: 0, maxEnVuelo: 0 };
    let reusos = 0;
    let emitidos = 0;
    servidor.use(
      http.post('/api/auth/refresh', async ({ request }) => {
        expect(request.headers.get('X-Requested-With')).toBe('fetch');
        const recibida = cookie.actual;
        cookie.enVuelo++;
        cookie.maxEnVuelo = Math.max(cookie.maxEnVuelo, cookie.enVuelo);
        await delay(20);
        cookie.enVuelo--;
        if (cookie.usadas.has(recibida)) {
          reusos++;
          return problema(401, 'unauthorized');
        }
        cookie.usadas.add(recibida);
        emitidos++;
        cookie.actual = `c${emitidos}`;
        return tokens(`access-${emitidos}`);
      }),
    );
    // Cada pestaña tiene su propia copia del módulo (su access en memoria) y el mismo Web Lock.
    vi.resetModules();
    const pestanaA = await import('../src/auth/sesion');
    vi.resetModules();
    const pestanaB = await import('../src/auth/sesion');

    const resultados = await Promise.all([pestanaA.refrescar(null), pestanaB.refrescar(null)]);

    expect(resultados).toEqual([true, true]);
    expect(reusos).toBe(0);
    expect(cookie.maxEnVuelo).toBe(1);
    expect(pestanaA.obtenerAccess()).not.toBe(pestanaB.obtenerAccess());
  });

  it('R-1.14 un 401 dispara un refresh y la petición se repite una sola vez', async () => {
    let refrescos = 0;
    const conteo = { n: 0 };
    servidor.use(
      http.post('/api/auth/refresh', () => {
        refrescos++;
        return tokens('access-que-tampoco-sirve');
      }),
      cuentasSoloCon('ninguno', conteo),
    );

    const error = await api.get('/cuentas').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).status).toBe(401);
    expect(refrescos).toBe(1);
    expect(conteo.n).toBe(2);
  });

  it('R-1.14 tras el refresh, la repetición devuelve los datos', async () => {
    const conteo = { n: 0 };
    servidor.use(
      http.post('/api/auth/refresh', () => tokens('access-nuevo')),
      cuentasSoloCon('access-nuevo', conteo),
    );

    await expect(api.get('/cuentas')).resolves.toEqual(CUENTAS);
    expect(conteo.n).toBe(2);
  });

  it('R-1.14 si el refresh falla, la sesión queda sin access', async () => {
    servidor.use(
      http.post('/api/auth/login', () => tokens('access-viejo')),
      http.post('/api/auth/refresh', () => problema(401, 'unauthorized')),
    );
    await iniciarSesion('ana@demo.mx', 'una contraseña larga');

    await expect(refrescar('access-viejo')).resolves.toBe(false);
    expect(obtenerAccess()).toBeNull();
  });
});
