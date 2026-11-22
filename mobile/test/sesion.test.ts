// T-MOB-02: sesión móvil (design.md §13.3 "Sesión", R-1.12, R-1.17, RNF-20, DD-24, DD-45).
import { crearCliente } from '../src/api/cliente';
import { ErrorApi } from '../src/api/errores';
import { LLAVE_INTENTO, LLAVE_REFRESH } from '../src/auth/almacen';
import { crearSesion } from '../src/auth/sesion';
import {
  API,
  REFRESH_1,
  REFRESH_2,
  type Registro,
  almacenEnMemoria,
  diferido,
  fetchSimulado,
  problema,
  tokens,
} from './ayudas';

const CUENTAS = { items: [] };

/** Sesión ya iniciada con `access-1` y `REFRESH_1`; la API acepta solo `access-2`. */
async function preparar(respuestaRefresh: () => Promise<Response> | Response) {
  const registro: Registro = [];
  const almacen = almacenEnMemoria(registro);
  const { fetchFn, peticiones } = fetchSimulado(registro, (p) => {
    if (p.ruta === '/auth/login') return tokens('access-1', REFRESH_1);
    if (p.ruta === '/auth/refresh') return respuestaRefresh();
    if (p.ruta === '/auth/logout') return new Response(null, { status: 204 });
    if (p.autorizacion === 'Bearer access-2') return Response.json(CUENTAS);
    return problema(401, 'unauthorized');
  });
  const sesion = crearSesion({ apiUrl: API, almacen, fetchFn });
  const cliente = crearCliente({ apiUrl: API, sesion, fetchFn });
  await sesion.iniciarSesion('ana@example.com', 'una contraseña larga');
  registro.length = 0;
  return { registro, almacen, peticiones, sesion, cliente };
}

describe('sesión móvil', () => {
  it('DD-24: el login manda cliente "movil" y guarda el refresh del cuerpo en el almacén', async () => {
    const { almacen, peticiones, sesion } = await preparar(() => tokens('x', REFRESH_2));
    expect(peticiones[0]).toMatchObject({
      metodo: 'POST',
      ruta: '/auth/login',
      cuerpo: { correo: 'ana@example.com', contrasena: 'una contraseña larga', cliente: 'movil' },
    });
    expect(almacen.datos.get(LLAVE_REFRESH)).toBe(REFRESH_1);
    expect(sesion.obtenerAccess()).toBe('access-1');
    expect(sesion.obtenerEstado()).toBe('con-sesion');
  });

  it('R-1.17: tres peticiones con 401 simultáneas producen un solo refresh', async () => {
    const respuesta = diferido<Response>();
    const { peticiones, cliente } = await preparar(() => respuesta.promesa);

    const tres = Promise.all([
      cliente.get('/cuentas'),
      cliente.get('/cuentas'),
      cliente.get('/cuentas'),
    ]);
    await new Promise((r) => setTimeout(r, 0));
    respuesta.resolver(tokens('access-2', REFRESH_2));

    await expect(tres).resolves.toEqual([CUENTAS, CUENTAS, CUENTAS]);
    expect(peticiones.filter((p) => p.ruta === '/auth/refresh')).toHaveLength(1);
  });

  it('R-1.17: el refresh manda el refresh guardado en el cuerpo', async () => {
    const { peticiones, cliente } = await preparar(() => tokens('access-2', REFRESH_2));
    await cliente.get('/cuentas');
    expect(peticiones.find((p) => p.ruta === '/auth/refresh')?.cuerpo).toEqual({
      refreshToken: REFRESH_1,
    });
  });

  it('DD-45: el refresh nuevo se escribe en el almacén antes de repetir la petición', async () => {
    const { registro, cliente } = await preparar(() => tokens('access-2', REFRESH_2));
    await cliente.get('/cuentas');
    const escritura = registro.indexOf(`almacen.set ${LLAVE_REFRESH}=${REFRESH_2}`);
    const repeticion = registro.indexOf('fetch GET /cuentas Bearer access-2');
    expect(escritura).toBeGreaterThanOrEqual(0);
    expect(repeticion).toBeGreaterThan(escritura);
  });

  it('R-1.12: logout revoca en la API y borra billetera.refresh y billetera.intento', async () => {
    const { almacen, peticiones, sesion } = await preparar(() => tokens('x', REFRESH_2));
    await almacen.setItemAsync(LLAVE_INTENTO, '{"llave":"k"}');

    await sesion.cerrarSesion();

    expect(peticiones.at(-1)).toMatchObject({
      ruta: '/auth/logout',
      cuerpo: { refreshToken: REFRESH_1 },
    });
    expect(almacen.datos.has(LLAVE_REFRESH)).toBe(false);
    expect(almacen.datos.has(LLAVE_INTENTO)).toBe(false);
    expect(sesion.obtenerAccess()).toBeNull();
    expect(sesion.obtenerEstado()).toBe('sin-sesion');
  });

  it('R-1.12: logout limpia el almacén aunque la API no responda', async () => {
    const registro: Registro = [];
    const almacen = almacenEnMemoria(registro, {
      [LLAVE_REFRESH]: REFRESH_1,
      [LLAVE_INTENTO]: '{}',
    });
    const { fetchFn } = fetchSimulado(registro, () => {
      throw new TypeError('Network request failed');
    });
    const sesion = crearSesion({ apiUrl: API, almacen, fetchFn });
    await sesion.cerrarSesion();
    expect(almacen.datos.size).toBe(0);
  });

  it('DD-45: si el refresh falla con 401 pide login, borra el refresh y conserva el intento', async () => {
    const { almacen, sesion, cliente } = await preparar(() => problema(401, 'unauthorized'));
    await almacen.setItemAsync(LLAVE_INTENTO, '{"llave":"k"}');

    await expect(cliente.get('/cuentas')).rejects.toBeInstanceOf(ErrorApi);

    expect(sesion.obtenerEstado()).toBe('sin-sesion');
    expect(almacen.datos.has(LLAVE_REFRESH)).toBe(false);
    expect(almacen.datos.get(LLAVE_INTENTO)).toBe('{"llave":"k"}');
  });

  it('R-1.7: un 401 credenciales-invalidas en el login no dispara el refresh', async () => {
    const registro: Registro = [];
    const { fetchFn, peticiones } = fetchSimulado(registro, () =>
      problema(401, 'credenciales-invalidas'),
    );
    const sesion = crearSesion({ apiUrl: API, almacen: almacenEnMemoria(registro), fetchFn });
    await expect(sesion.iniciarSesion('ana@example.com', 'x')).rejects.toBeInstanceOf(ErrorApi);
    expect(peticiones.map((p) => p.ruta)).toEqual(['/auth/login']);
  });

  it('R-1.17: al abrir la app, un refresh guardado se rota y deja la sesión iniciada', async () => {
    const registro: Registro = [];
    const almacen = almacenEnMemoria(registro, { [LLAVE_REFRESH]: REFRESH_1 });
    const { fetchFn } = fetchSimulado(registro, () => tokens('access-2', REFRESH_2));
    const sesion = crearSesion({ apiUrl: API, almacen, fetchFn });

    await sesion.restaurar();

    expect(sesion.obtenerEstado()).toBe('con-sesion');
    expect(almacen.datos.get(LLAVE_REFRESH)).toBe(REFRESH_2);
  });

  it('R-1.17: al abrir la app sin refresh guardado pide login sin llamar a la API', async () => {
    const registro: Registro = [];
    const { fetchFn, peticiones } = fetchSimulado(registro, () => tokens('x', REFRESH_2));
    const sesion = crearSesion({ apiUrl: API, almacen: almacenEnMemoria(registro), fetchFn });
    await sesion.restaurar();
    expect(sesion.obtenerEstado()).toBe('sin-sesion');
    expect(peticiones).toHaveLength(0);
  });
});
