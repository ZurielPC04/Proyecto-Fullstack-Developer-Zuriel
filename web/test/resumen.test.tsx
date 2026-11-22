import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { AHORRO, conCuentas, conSesion, ID_PRINCIPAL, LIMITES, PRINCIPAL } from './api-falsa';
import { problema, servidor } from './servidor';
import { renderizarApp } from './utilidades';

describe('resumen de cuentas y límite (ruta /)', () => {
  it('R-2.6 muestra el estado cargando mientras llegan cuentas y límite', async () => {
    conSesion();
    servidor.use(
      http.get('/api/cuentas', async () => {
        await delay(50);
        return HttpResponse.json({ items: [PRINCIPAL, AHORRO] });
      }),
      http.get('/api/limites', () => HttpResponse.json(LIMITES)),
    );

    renderizarApp('/');

    expect(await screen.findByText('Cargando cuentas…')).toBeVisible();
    expect(screen.queryByRole('listitem', { name: 'Principal' })).toBeNull();
    expect(await screen.findByRole('listitem', { name: 'Principal' })).toBeVisible();
  });

  it('R-2.6 un error muestra el mensaje y "Reintentar" vuelve a pedir los datos', async () => {
    conSesion();
    let intentos = 0;
    servidor.use(
      http.get('/api/cuentas', () => {
        intentos++;
        return intentos <= 2
          ? problema(500, 'internal-error')
          : HttpResponse.json({ items: [PRINCIPAL, AHORRO] });
      }),
      http.get('/api/limites', () => HttpResponse.json(LIMITES)),
    );
    const usuario = userEvent.setup();

    renderizarApp('/');

    const alerta = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alerta).toHaveTextContent('Ocurrió un error inesperado. Inténtalo más tarde.');
    await usuario.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('listitem', { name: 'Principal' })).toBeVisible();
  });

  it('R-2.5 los saldos y el límite se muestran con formatearMXN como en la tabla de R-2.5', async () => {
    conSesion();
    conCuentas();

    renderizarApp('/');

    const principal = await screen.findByRole('listitem', { name: 'Principal' });
    expect(within(principal).getByText('$1,234.56')).toBeVisible();
    expect(within(principal).getByText('999180000000000015')).toBeVisible();
    const ahorro = screen.getByRole('listitem', { name: 'Ahorro' });
    expect(within(ahorro).getByText('$0.05')).toBeVisible();
    const limite = screen.getByRole('region', { name: 'Límite de hoy' });
    expect(within(limite).getByText('$1.00')).toBeVisible();
    expect(within(limite).getByText('$49,999.00')).toBeVisible();
    expect(within(limite).getByText('$50,000.00')).toBeVisible();
  });

  it('R-2.1 cada tarjeta enlaza al historial de su cuenta', async () => {
    conSesion();
    conCuentas();
    const usuario = userEvent.setup();
    const { router } = renderizarApp('/');

    const principal = await screen.findByRole('listitem', { name: 'Principal' });
    await usuario.click(
      within(principal).getByRole('link', { name: 'Ver movimientos de Principal' }),
    );

    expect(router.state.location.pathname).toBe(`/cuentas/${ID_PRINCIPAL}`);
  });

  it('RNF-19 axe no reporta violaciones en el resumen', async () => {
    conSesion();
    conCuentas();

    renderizarApp('/');

    await screen.findByRole('listitem', { name: 'Principal' });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
