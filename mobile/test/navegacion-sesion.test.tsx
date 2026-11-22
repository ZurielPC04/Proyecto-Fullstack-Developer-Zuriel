// T-MOB-02: stacks condicionales sin sesión / con sesión (design.md §13.3, DD-03).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { crearCliente } from '../src/api/cliente';
import { LLAVE_REFRESH } from '../src/auth/almacen';
import { crearSesion } from '../src/auth/sesion';
import { Raiz } from '../src/Raiz';
import {
  API,
  REFRESH_1,
  type Registro,
  almacenEnMemoria,
  fetchSimulado,
  problema,
  tokens,
} from './ayudas';

function montar(inicial: Record<string, string> = {}) {
  const registro: Registro = [];
  const almacen = almacenEnMemoria(registro, inicial);
  const { fetchFn, peticiones } = fetchSimulado(registro, (p) => {
    if (p.ruta === '/auth/login') {
      const { contrasena } = p.cuerpo as { contrasena: string };
      return contrasena === 'una contraseña larga'
        ? tokens('access-1', REFRESH_1)
        : problema(401, 'credenciales-invalidas');
    }
    if (p.ruta === '/auth/refresh') return tokens('access-2', REFRESH_1);
    if (p.ruta === '/auth/logout') return new Response(null, { status: 204 });
    return problema(404, 'not-found');
  });
  const sesion = crearSesion({ apiUrl: API, almacen, fetchFn });
  const contexto = { apiUrl: API, sesion, cliente: crearCliente({ apiUrl: API, sesion, fetchFn }) };
  return { almacen, peticiones, contexto };
}

async function iniciarSesion(contrasena: string) {
  // RNTL 14: los eventos son asíncronos.
  await fireEvent.changeText(screen.getByLabelText('Correo'), 'ana@example.com');
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), contrasena);
  await fireEvent.press(screen.getByText('Entrar'));
}

describe('navegación según la sesión [DD-03]', () => {
  it('R-1.17: sin refresh guardado muestra el login', async () => {
    const { contexto } = montar();
    await render(<Raiz contexto={contexto} />);
    expect(await screen.findByText('Entrar')).toBeTruthy();
  });

  it('R-1.17: con un refresh guardado entra directo al stack con sesión', async () => {
    const { contexto } = montar({ [LLAVE_REFRESH]: REFRESH_1 });
    await render(<Raiz contexto={contexto} />);
    expect(await screen.findByText('Cerrar sesión')).toBeTruthy();
  });

  it('DD-24: el login correcto cambia al stack con sesión', async () => {
    const { contexto, peticiones } = montar();
    await render(<Raiz contexto={contexto} />);
    await screen.findByText('Entrar');
    await iniciarSesion('una contraseña larga');
    expect(await screen.findByText('Cerrar sesión')).toBeTruthy();
    expect(peticiones.find((p) => p.ruta === '/auth/login')?.cuerpo).toMatchObject({
      cliente: 'movil',
    });
  });

  it('R-1.7: con credenciales incorrectas muestra el mensaje del formulario', async () => {
    const { contexto } = montar();
    await render(<Raiz contexto={contexto} />);
    await screen.findByText('Entrar');
    await iniciarSesion('otra contraseña');
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeTruthy();
  });

  it('R-1.12: cerrar sesión vuelve al login y borra el refresh', async () => {
    const { contexto, almacen } = montar({ [LLAVE_REFRESH]: REFRESH_1 });
    await render(<Raiz contexto={contexto} />);
    await fireEvent.press(await screen.findByText('Cerrar sesión'));
    expect(await screen.findByText('Entrar')).toBeTruthy();
    expect(almacen.datos.has(LLAVE_REFRESH)).toBe(false);
  });
});
