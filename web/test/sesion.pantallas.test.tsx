import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { CLAVE_INTENTO } from '../src/transferencia/almacen-intento';
import { problema, servidor, tokens } from './servidor';
import { renderizarApp } from './utilidades';

const CONTRASENA = 'una frase larga y segura';

function sesionValida() {
  servidor.use(
    http.post('/api/auth/refresh', () => tokens('access-1')),
    http.get('/api/cuentas', () => HttpResponse.json({ items: [] })),
    http.get('/api/limites', () =>
      HttpResponse.json({
        limiteCentavos: 5000000,
        consumidoCentavos: 0,
        disponibleCentavos: 5000000,
        dia: '2026-11-22',
        reiniciaEn: '2026-11-23T06:00:00.000000Z',
      }),
    ),
  );
}

describe('pantallas de sesión (design.md §13.2)', () => {
  it('R-1.14 una recarga sin cookie válida lleva al login', async () => {
    servidor.use(http.post('/api/auth/refresh', () => problema(401, 'unauthorized')));

    const { router } = renderizarApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('R-1.14 una recarga con cookie válida espera el refresh antes de pintar datos protegidos', async () => {
    sesionValida();
    servidor.use(
      http.post('/api/auth/refresh', async () => {
        await delay(30);
        return tokens('access-1');
      }),
    );

    renderizarApp('/');

    expect(screen.getByRole('status')).toHaveTextContent('Verificando sesión…');
    expect(screen.queryByRole('heading', { level: 1, name: 'Resumen' })).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible();
  });

  it('R-1.6 el login exitoso lleva al resumen', async () => {
    servidor.use(http.post('/api/auth/refresh', () => problema(401, 'unauthorized')));
    renderizarApp('/login');
    sesionValida();
    servidor.use(http.post('/api/auth/login', () => tokens('access-1')));
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Correo'), 'ana@demo.mx');
    await usuario.type(screen.getByLabelText('Contraseña'), CONTRASENA);
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible();
  });

  it('RNF-17 el login muestra el botón ocupado mientras espera y el error de credenciales sin intentar un refresh', async () => {
    let refrescos = 0;
    servidor.use(
      http.post('/api/auth/refresh', () => {
        refrescos++;
        return problema(401, 'unauthorized');
      }),
      http.post('/api/auth/login', async () => {
        await delay(30);
        return problema(401, 'credenciales-invalidas');
      }),
    );
    renderizarApp('/login');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Correo'), 'ana@demo.mx');
    await usuario.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveAttribute('aria-busy', 'false');
    expect(refrescos).toBe(0);
  });

  it('RNF-19 axe no reporta violaciones en el login con un error de campo', async () => {
    renderizarApp('/login');
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole('button', { name: 'Entrar' }));

    const correo = screen.getByLabelText('Correo');
    expect(correo).toHaveAttribute('aria-invalid', 'true');
    expect(correo).toHaveAccessibleDescription('Correo inválido.');
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('RNF-18 el registro valida la política de contraseñas de shared sin llamar a la API', async () => {
    let registros = 0;
    servidor.use(
      http.post('/api/auth/registro', () => {
        registros++;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderizarApp('/registro');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Correo'), 'ana@demo.mx');
    await usuario.type(screen.getByLabelText('Contraseña'), 'corta');
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Debe tener al menos 12 caracteres.')).toBeVisible();
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
    expect(registros).toBe(0);
  });

  it('DD-24 el registro exitoso lleva al login con un aviso', async () => {
    let cuerpo: unknown;
    servidor.use(
      http.post('/api/auth/registro', async ({ request }) => {
        cuerpo = await request.json();
        return HttpResponse.json(
          { id: crypto.randomUUID(), correo: 'ana@demo.mx' },
          { status: 201 },
        );
      }),
    );
    const { router } = renderizarApp('/registro');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Correo'), '  Ana@Demo.mx ');
    await usuario.type(screen.getByLabelText('Contraseña'), CONTRASENA);
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('status')).toHaveTextContent('Tu cuenta está lista. Inicia sesión.');
    expect(cuerpo).toEqual({ correo: 'ana@demo.mx', contrasena: CONTRASENA });
  });

  it('RNF-17 el registro muestra el botón ocupado y el correo duplicado junto al campo', async () => {
    servidor.use(
      http.post('/api/auth/registro', async () => {
        await delay(30);
        return problema(409, 'correo-ya-registrado');
      }),
    );
    renderizarApp('/registro');
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Correo'), 'ana@demo.mx');
    await usuario.type(screen.getByLabelText('Contraseña'), CONTRASENA);
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Correo')).toHaveAccessibleDescription(
        'Ese correo ya está registrado. Inicia sesión o usa otro correo.',
      ),
    );
    expect(screen.getByLabelText('Correo')).toHaveFocus();
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('R-1.12 cerrar sesión revoca en la API, borra el intento guardado y la caché, y lleva al login', async () => {
    sesionValida();
    let logout: Request | undefined;
    servidor.use(
      http.post('/api/auth/logout', ({ request }) => {
        logout = request;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    sessionStorage.setItem(CLAVE_INTENTO, JSON.stringify({ llave: 'x', fase: 'creacion' }));
    const { queryClient, router } = renderizarApp('/');
    const usuario = userEvent.setup();
    await screen.findByRole('heading', { level: 1, name: 'Resumen' });

    await usuario.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Cerrar sesión' }),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(logout?.headers.get('X-Requested-With')).toBe('fetch');
    expect(sessionStorage.getItem(CLAVE_INTENTO)).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
