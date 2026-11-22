import type { Movimiento, PaginaMovimientos } from '@billetera/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { conCuentas, conSesion, ID_PRINCIPAL } from './api-falsa';
import { problema, servidor } from './servidor';
import { renderizarApp } from './utilidades';

const RUTA = `/cuentas/${ID_PRINCIPAL}`;
const URL_MOVIMIENTOS = `/api/cuentas/${ID_PRINCIPAL}/movimientos`;

function movimiento(parcial: Partial<Movimiento> & Pick<Movimiento, 'id'>): Movimiento {
  return {
    transferenciaId: '2d8b3f0a-6b2e-4d0a-9c73-9f2a2b8c4e33',
    tipo: 'ENVIO',
    montoCentavos: -250,
    fecha: '2026-11-14T16:05:09.123456Z',
    concepto: 'Renta',
    referencia: '1234567',
    contraparte: { etiqueta: 'Beto', clabeTerminacion: '0031' },
    ...parcial,
  };
}

const DEPOSITO = movimiento({
  id: 'm-deposito',
  tipo: 'DEPOSITO',
  montoCentavos: 1000000,
  concepto: 'Bienvenida',
  referencia: null,
  contraparte: { etiqueta: 'Depósito', clabeTerminacion: null },
});

/** Servidor de movimientos: responde la página que corresponde a cada cursor y guarda las URLs. */
function conPaginas(paginas: Record<string, PaginaMovimientos>, pedidas: URL[] = []) {
  servidor.use(
    http.get(URL_MOVIMIENTOS, ({ request }) => {
      const url = new URL(request.url);
      pedidas.push(url);
      const pagina = paginas[url.searchParams.get('cursor') ?? 'inicio'];
      return pagina ? HttpResponse.json(pagina) : problema(400, 'invalid-cursor');
    }),
  );
  return pedidas;
}

function filas() {
  const [, ...cuerpo] = within(screen.getByRole('table')).getAllByRole('row');
  return cuerpo;
}

describe('historial de movimientos (ruta /cuentas/:cuentaId)', () => {
  it('R-5.11 muestra el estado cargando con el nombre de la cuenta', async () => {
    conSesion();
    conCuentas();
    servidor.use(
      http.get(URL_MOVIMIENTOS, async () => {
        await delay(50);
        return HttpResponse.json({ items: [], siguienteCursor: null });
      }),
    );

    renderizarApp(RUTA);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Movimientos de Principal' }),
    ).toBeVisible();
    expect(screen.getByText('Cargando movimientos…')).toBeInTheDocument();
    expect(await screen.findByText('Sin movimientos')).toBeVisible();
  });

  it('R-5.11 sin filtros y sin movimientos dice "Sin movimientos"', async () => {
    conSesion();
    conCuentas();
    conPaginas({ inicio: { items: [], siguienteCursor: null } });

    renderizarApp(RUTA);

    expect(await screen.findByText('Sin movimientos')).toBeVisible();
    expect(screen.queryByText('Sin resultados para estos filtros')).toBeNull();
  });

  it('R-5.11 con filtros y sin movimientos dice "Sin resultados para estos filtros"', async () => {
    conSesion();
    conCuentas();
    const pedidas = conPaginas({
      inicio: { items: [movimiento({ id: 'm1' })], siguienteCursor: null },
    });
    const usuario = userEvent.setup();
    renderizarApp(RUTA);
    await screen.findByRole('table');
    servidor.use(
      http.get(URL_MOVIMIENTOS, ({ request }) => {
        pedidas.push(new URL(request.url));
        return HttpResponse.json({ items: [], siguienteCursor: null });
      }),
    );

    await usuario.selectOptions(screen.getByLabelText('Tipo'), 'RECEPCION');
    await usuario.type(screen.getByLabelText('Desde'), '2026-11-01');
    await usuario.type(screen.getByLabelText('Hasta'), '2026-11-30');
    await usuario.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    expect(await screen.findByText('Sin resultados para estos filtros')).toBeVisible();
    const ultima = pedidas.at(-1);
    expect(ultima?.searchParams.get('tipo')).toBe('RECEPCION');
    expect(ultima?.searchParams.get('desde')).toBe('2026-11-01');
    expect(ultima?.searchParams.get('hasta')).toBe('2026-11-30');
  });

  it('R-5.5 un rango con hasta antes de desde se rechaza con el esquema de shared sin pedir nada', async () => {
    conSesion();
    conCuentas();
    const pedidas = conPaginas({ inicio: { items: [], siguienteCursor: null } });
    const usuario = userEvent.setup();
    renderizarApp(RUTA);
    await screen.findByText('Sin movimientos');

    await usuario.type(screen.getByLabelText('Desde'), '2026-11-30');
    await usuario.type(screen.getByLabelText('Hasta'), '2026-11-01');
    await usuario.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    expect(screen.getByLabelText('Hasta')).toHaveAccessibleDescription(
      'hasta no puede ser anterior a desde.',
    );
    expect(pedidas).toHaveLength(1);
  });

  it('R-5.11 un error muestra el mensaje y "Reintentar" vuelve a pedir la página', async () => {
    conSesion();
    conCuentas();
    let intentos = 0;
    servidor.use(
      http.get(URL_MOVIMIENTOS, () => {
        intentos++;
        return intentos <= 2
          ? problema(500, 'internal-error')
          : HttpResponse.json({ items: [movimiento({ id: 'm1' })], siguienteCursor: null });
      }),
    );
    const usuario = userEvent.setup();
    renderizarApp(RUTA);

    const alerta = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alerta).toHaveTextContent('Ocurrió un error inesperado. Inténtalo más tarde.');
    await usuario.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('R-5.11 "Cargar más" pide la página siguiente con siguienteCursor mientras exista', async () => {
    conSesion();
    conCuentas();
    const pedidas = conPaginas({
      inicio: {
        items: [
          movimiento({ id: 'm1', concepto: 'Uno' }),
          movimiento({ id: 'm2', concepto: 'Dos' }),
        ],
        siguienteCursor: 'cursor-pagina-2',
      },
      'cursor-pagina-2': {
        items: [movimiento({ id: 'm3', concepto: 'Tres' })],
        siguienteCursor: null,
      },
    });
    const usuario = userEvent.setup();
    renderizarApp(RUTA);
    await screen.findByRole('table');
    expect(filas()).toHaveLength(2);

    await usuario.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByText('Tres')).toBeVisible();
    expect(filas()).toHaveLength(3);
    expect(pedidas.at(-1)?.searchParams.get('cursor')).toBe('cursor-pagina-2');
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });

  it('R-5.9 un DEPOSITO se muestra como "Depósito" y nunca dice "transferencia"', async () => {
    conSesion();
    conCuentas();
    conPaginas({ inicio: { items: [DEPOSITO], siguienteCursor: null } });

    renderizarApp(RUTA);

    await screen.findByRole('table');
    const [fila] = filas();
    expect(within(fila!).getAllByText('Depósito').length).toBeGreaterThan(0);
    expect(fila).not.toHaveTextContent(/transferencia/i);
    expect(within(fila!).getByText('$10,000.00')).toBeVisible();
  });

  it('R-2.5 un cargo se muestra con signo y formatearMXN, con la fecha en America/Mexico_City', async () => {
    conSesion();
    conCuentas();
    conPaginas({
      inicio: {
        // 05:59 UTC del 15 de noviembre son las 23:59 del 14 en la Ciudad de México.
        items: [
          movimiento({ id: 'm1', montoCentavos: -250, fecha: '2026-11-15T05:59:59.999999Z' }),
        ],
        siguienteCursor: null,
      },
    });

    renderizarApp(RUTA);

    await screen.findByRole('table');
    const [fila] = filas();
    expect(within(fila!).getByText('-$2.50')).toBeVisible();
    expect(fila).toHaveTextContent('14 nov 2026');
    expect(fila).toHaveTextContent('Envío');
    expect(fila).toHaveTextContent('Beto ···0031');
  });

  it('RNF-19 axe no reporta violaciones en el historial', async () => {
    conSesion();
    conCuentas();
    conPaginas({
      inicio: { items: [movimiento({ id: 'm1' }), DEPOSITO], siguienteCursor: 'c2' },
    });

    renderizarApp(RUTA);

    await screen.findByRole('table');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
