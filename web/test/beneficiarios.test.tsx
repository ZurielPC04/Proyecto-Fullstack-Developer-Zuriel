import type { Beneficiario } from '@billetera/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { conBeneficiarios, conSesion } from './api-falsa';
import { problema, servidor } from './servidor';
import { renderizarApp } from './utilidades';

const BETO: Beneficiario = {
  id: '3e9c4a1b-7c3f-4e1b-8d84-a03b3c9d5f44',
  nombre: 'Beto Pérez',
  alias: 'Beto',
  clabe: '999180000000000031',
  esCuentaPropia: false,
};

const MI_AHORRO: Beneficiario = {
  id: '4fad5b2c-8d4a-4f2c-9e95-b14c4dae6055',
  nombre: 'Ana López',
  alias: 'Mi ahorro',
  clabe: '999180000000000028',
  esCuentaPropia: true,
};

type Captura = { nombre?: string; alias?: string; clabe?: string };

async function capturar(usuario: ReturnType<typeof userEvent.setup>, datos: Captura) {
  if (datos.nombre) await usuario.type(screen.getByLabelText('Nombre'), datos.nombre);
  if (datos.alias) await usuario.type(screen.getByLabelText('Alias'), datos.alias);
  if (datos.clabe) await usuario.type(screen.getByLabelText('CLABE'), datos.clabe);
  await usuario.click(screen.getByRole('button', { name: 'Agregar beneficiario' }));
}

const VALIDO: Captura = { nombre: 'Beto Pérez', alias: 'Beto', clabe: '999180000000000031' };

/** POST /beneficiarios con la respuesta dada; cuenta las peticiones. */
function altaResponde(respuesta: () => Response | Promise<Response>) {
  const conteo = { n: 0, cuerpo: undefined as unknown };
  servidor.use(
    http.post('/api/beneficiarios', async ({ request }) => {
      conteo.n++;
      conteo.cuerpo = await request.json();
      return respuesta();
    }),
  );
  return conteo;
}

describe('beneficiarios (ruta /beneficiarios)', () => {
  it('RNF-17 muestra el estado cargando', async () => {
    conSesion();
    servidor.use(
      http.get('/api/beneficiarios', async () => {
        await delay(50);
        return HttpResponse.json({ items: [BETO] });
      }),
    );

    renderizarApp('/beneficiarios');

    expect(await screen.findByText('Cargando beneficiarios…')).toBeInTheDocument();
    expect(await screen.findByRole('listitem', { name: 'Beto' })).toBeVisible();
  });

  it('RNF-17 sin beneficiarios muestra el vacío con el formulario visible', async () => {
    conSesion();
    conBeneficiarios([]);

    renderizarApp('/beneficiarios');

    expect(await screen.findByText('Aún no tienes beneficiarios')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Agregar beneficiario' })).toBeVisible();
  });

  it('RNF-17 un error de la lista muestra "Reintentar" y vuelve a pedirla', async () => {
    conSesion();
    let intentos = 0;
    servidor.use(
      http.get('/api/beneficiarios', () => {
        intentos++;
        return intentos <= 2
          ? problema(500, 'internal-error')
          : HttpResponse.json({ items: [BETO] });
      }),
    );
    const usuario = userEvent.setup();
    renderizarApp('/beneficiarios');

    const alerta = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alerta).toHaveTextContent('Ocurrió un error inesperado. Inténtalo más tarde.');
    await usuario.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('listitem', { name: 'Beto' })).toBeVisible();
  });

  it('R-3.8 la lista marca el beneficiario que es una cuenta propia', async () => {
    conSesion();
    conBeneficiarios([BETO, MI_AHORRO]);

    renderizarApp('/beneficiarios');

    const propio = await screen.findByRole('listitem', { name: 'Mi ahorro' });
    expect(propio).toHaveTextContent('Cuenta propia: enviarle es un traspaso');
    expect(propio).toHaveTextContent('999180000000000028');
    expect(screen.getByRole('listitem', { name: 'Beto' })).not.toHaveTextContent('Cuenta propia');
  });

  it('R-3.10 una CLABE con dígito verificador incorrecto no dispara la petición', async () => {
    conSesion();
    conBeneficiarios([]);
    const alta = altaResponde(() => HttpResponse.json(BETO, { status: 201 }));
    const usuario = userEvent.setup();
    renderizarApp('/beneficiarios');
    await screen.findByText('Aún no tienes beneficiarios');

    await capturar(usuario, { ...VALIDO, clabe: '999180000000000032' });

    const clabe = screen.getByLabelText('CLABE');
    expect(clabe).toHaveAccessibleDescription('El dígito verificador de la CLABE no es válido');
    expect(clabe).toHaveAttribute('aria-invalid', 'true');
    expect(clabe).toHaveFocus();
    expect(alta.n).toBe(0);
  });

  it('R-3.10 una CLABE corta se rechaza con el mensaje de longitud de shared', async () => {
    conSesion();
    conBeneficiarios([]);
    const alta = altaResponde(() => HttpResponse.json(BETO, { status: 201 }));
    const usuario = userEvent.setup();
    renderizarApp('/beneficiarios');
    await screen.findByText('Aún no tienes beneficiarios');

    await capturar(usuario, { ...VALIDO, clabe: '99918000000000003' });

    expect(screen.getByLabelText('CLABE')).toHaveAccessibleDescription(
      'La CLABE debe tener 18 dígitos',
    );
    expect(alta.n).toBe(0);
  });

  it('R-3.1 el alta envía los datos normalizados, sin espacios en la CLABE, y refresca la lista', async () => {
    conSesion();
    conBeneficiarios([]);
    const alta = altaResponde(() => {
      conBeneficiarios([BETO]);
      return HttpResponse.json(BETO, { status: 201 });
    });
    const usuario = userEvent.setup();
    renderizarApp('/beneficiarios');
    await screen.findByText('Aún no tienes beneficiarios');

    await capturar(usuario, {
      nombre: '  Beto Pérez ',
      alias: 'Beto',
      clabe: '9991 8000 0000 0000 31',
    });

    expect(await screen.findByRole('listitem', { name: 'Beto' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Agregaste a Beto.');
    expect(alta.cuerpo).toEqual({
      nombre: 'Beto Pérez',
      alias: 'Beto',
      clabe: '999180000000000031',
    });
    expect(screen.getByLabelText('CLABE')).toHaveValue('');
  });

  it('R-3.7 el 409 con body.clabe se muestra en el campo CLABE', async () => {
    conSesion();
    conBeneficiarios([BETO]);
    altaResponde(() =>
      problema(409, 'beneficiario-duplicado', {
        errores: [{ campo: 'body.clabe', mensaje: 'Ya tienes un beneficiario con esa CLABE.' }],
      }),
    );
    const usuario = userEvent.setup();
    renderizarApp('/beneficiarios');
    await screen.findByRole('listitem', { name: 'Beto' });

    await capturar(usuario, { ...VALIDO, alias: 'Otro alias' });

    const clabe = screen.getByLabelText('CLABE');
    expect(await screen.findByText('Ya tienes un beneficiario con esa CLABE.')).toBeVisible();
    expect(clabe).toHaveAccessibleDescription('Ya tienes un beneficiario con esa CLABE.');
    expect(clabe).toHaveFocus();
    expect(screen.getByLabelText('Alias')).toHaveAttribute('aria-invalid', 'false');
  });

  it('R-3.7 el 409 con body.alias se muestra en el campo Alias', async () => {
    conSesion();
    conBeneficiarios([BETO]);
    altaResponde(() =>
      problema(409, 'beneficiario-duplicado', {
        errores: [{ campo: 'body.alias', mensaje: 'Ya tienes un beneficiario con ese alias.' }],
      }),
    );
    const usuario = userEvent.setup();
    renderizarApp('/beneficiarios');
    await screen.findByRole('listitem', { name: 'Beto' });

    await capturar(usuario, { ...VALIDO, clabe: '999180000000000044' });

    const alias = screen.getByLabelText('Alias');
    expect(await screen.findByText('Ya tienes un beneficiario con ese alias.')).toBeVisible();
    expect(alias).toHaveAccessibleDescription('Ya tienes un beneficiario con ese alias.');
    expect(alias).toHaveFocus();
  });

  it('R-3.5 el 422 clabe-not-found se muestra en el campo CLABE', async () => {
    conSesion();
    conBeneficiarios([]);
    altaResponde(() => problema(422, 'clabe-not-found'));
    const usuario = userEvent.setup();
    renderizarApp('/beneficiarios');
    await screen.findByText('Aún no tienes beneficiarios');

    await capturar(usuario, VALIDO);

    expect(
      await screen.findByText('La CLABE no corresponde a ninguna cuenta de la plataforma.'),
    ).toBeVisible();
    expect(screen.getByLabelText('CLABE')).toHaveAccessibleDescription(
      'La CLABE no corresponde a ninguna cuenta de la plataforma.',
    );
  });

  it('R-3.9 el 429 se muestra como error del formulario', async () => {
    conSesion();
    conBeneficiarios([]);
    altaResponde(() => problema(429, 'too-many-requests'));
    const usuario = userEvent.setup();
    renderizarApp('/beneficiarios');
    await screen.findByText('Aún no tienes beneficiarios');

    await capturar(usuario, VALIDO);

    const formulario = screen.getByRole('form', { name: 'Nuevo beneficiario' });
    expect(await within(formulario).findByRole('alert')).toHaveTextContent(
      'Demasiados intentos. Espera un momento y vuelve a intentarlo.',
    );
  });

  it('RNF-19 axe no reporta violaciones con la lista y errores de campo', async () => {
    conSesion();
    conBeneficiarios([BETO, MI_AHORRO]);
    const usuario = userEvent.setup();
    renderizarApp('/beneficiarios');
    await screen.findByRole('listitem', { name: 'Beto' });

    await capturar(usuario, {});

    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
