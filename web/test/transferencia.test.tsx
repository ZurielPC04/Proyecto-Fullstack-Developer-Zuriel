import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AHORRO,
  BETO,
  COMPROBANTE,
  conDatosDeTransferencia,
  ID_PRINCIPAL,
  ID_TRANSFERENCIA,
  LIMITES,
  PRINCIPAL,
  puerta,
  transferenciasResponden,
} from './api-falsa';
import { problema, servidor } from './servidor';
import { renderizarApp } from './utilidades';

afterEach(() => {
  vi.restoreAllMocks();
});

type Usuario = ReturnType<typeof userEvent.setup>;
type Captura = { monto?: string; concepto?: string; referencia?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Llena el formulario hacia Beto desde Principal y pasa a la confirmación. */
async function capturar(usuario: Usuario, datos: Captura = {}) {
  const { monto = '1.15', concepto = 'Renta', referencia = '0042' } = datos;
  await usuario.click(await screen.findByRole('radio', { name: /^Beto/ }));
  await usuario.type(screen.getByLabelText('Monto'), monto);
  await usuario.type(screen.getByLabelText('Concepto'), concepto);
  await usuario.type(screen.getByLabelText('Referencia'), referencia);
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
}

const rechazoPorSaldo = () =>
  problema(422, 'saldo-insuficiente', {
    motivo: 'SALDO_INSUFICIENTE',
    transferenciaId: ID_TRANSFERENCIA,
  });

const aplicada = () => HttpResponse.json(COMPROBANTE, { status: 201 });

describe('transferencia (ruta /transferir)', () => {
  it('R-4.11 R-4.20 RNF-25 el envío lleva una llave UUID y los datos congelados, y muestra el comprobante', async () => {
    conDatosDeTransferencia();
    const peticiones = transferenciasResponden(aplicada);
    const usuario = userEvent.setup();
    renderizarApp('/transferir');

    await capturar(usuario);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confirma la transferencia' }),
    ).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' }),
    ).toBeVisible();
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]?.llave).toMatch(UUID);
    expect(peticiones[0]?.cuerpo).toEqual({
      cuentaOrigenId: ID_PRINCIPAL,
      destino: { tipo: 'BENEFICIARIO', beneficiarioId: BETO.id },
      montoCentavos: 115,
      concepto: 'Renta',
      referencia: '0042',
    });
    const comprobante = screen.getByRole('region', { name: 'Transferencia aplicada' });
    expect(comprobante).toHaveTextContent(COMPROBANTE.transferenciaId);
    expect(comprobante).toHaveTextContent('$1.15');
    expect(comprobante).toHaveTextContent('Renta');
    expect(comprobante).toHaveTextContent('0042');
    expect(comprobante).toHaveTextContent('Beto Pérez');
    expect(comprobante).toHaveTextContent('···0031');
    expect(comprobante).toHaveTextContent('···0015');
  });

  it('R-4.33 un monto con más de 2 decimales se rechaza en el campo sin enviar nada', async () => {
    conDatosDeTransferencia();
    const peticiones = transferenciasResponden(aplicada);
    const usuario = userEvent.setup();
    renderizarApp('/transferir');

    await capturar(usuario, { monto: '10.999' });

    const monto = screen.getByLabelText('Monto');
    expect(monto).toHaveAccessibleDescription('Máximo 2 decimales');
    expect(monto).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Transferir' })).toBeVisible();
    expect(peticiones).toHaveLength(0);
  });

  it('R-4.33 el monto con separador de miles se convierte a centavos sin redondeo', async () => {
    conDatosDeTransferencia();
    const peticiones = transferenciasResponden(aplicada);
    const usuario = userEvent.setup();
    renderizarApp('/transferir');

    await capturar(usuario, { monto: '$ 1,234.56' });
    expect(await screen.findByText('$1,234.56')).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(peticiones[0]?.cuerpo).toMatchObject({ montoCentavos: 123456 });
  });

  it('R-4.12 RNF-25 un 422 saldo-insuficiente muestra el motivo y ningún comprobante', async () => {
    conDatosDeTransferencia();
    transferenciasResponden(rechazoPorSaldo);
    const usuario = userEvent.setup();
    renderizarApp('/transferir');

    await capturar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Transferencia rechazada' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La cuenta origen no tiene saldo suficiente para esta transferencia.',
    );
    expect(screen.queryByText('Transferencia aplicada')).toBeNull();
    expect(screen.queryByText(ID_TRANSFERENCIA)).toBeNull();
    expect(screen.getByRole('button', { name: 'Nueva transferencia' })).toBeVisible();
  });

  it('R-4.21 RNF-25 un doble clic en "Enviar" produce una sola petición, con el botón ocupado', async () => {
    conDatosDeTransferencia();
    const respuesta = puerta();
    const peticiones = transferenciasResponden(async () => {
      await respuesta.abierta;
      return aplicada();
    });
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await capturar(usuario);

    const enviar = await screen.findByRole('button', { name: 'Enviar' });
    // DD-43: los dos clics caen en el mismo ciclo, antes de que React vuelva a pintar el botón
    // deshabilitado. Dentro de un solo act no hay render entre ambos; solo la bandera los separa.
    // (user-event envuelve cada evento en su propio act, así que ahí el disabled ya bastaría.)
    act(() => {
      enviar.click();
      enviar.click();
    });

    await waitFor(() => expect(peticiones).toHaveLength(1));
    expect(enviar).toBeDisabled();
    expect(enviar).toHaveAttribute('aria-busy', 'true');
    respuesta.abrir();
    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(peticiones).toHaveLength(1);
  });

  it('R-4.21 RNF-25 un doble Enter en "Enviar" produce una sola petición', async () => {
    conDatosDeTransferencia();
    const respuesta = puerta();
    const peticiones = transferenciasResponden(async () => {
      await respuesta.abierta;
      return aplicada();
    });
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await capturar(usuario);

    const enviar = await screen.findByRole('button', { name: 'Enviar' });
    act(() => enviar.focus());
    await usuario.keyboard('{Enter}{Enter}');

    await waitFor(() => expect(peticiones).toHaveLength(1));
    respuesta.abrir();
    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(peticiones).toHaveLength(1);
  });

  it('R-4.22 tras un error de red y un 500, "Reintentar" reenvía la misma llave y los mismos datos', async () => {
    conDatosDeTransferencia();
    const peticiones = transferenciasResponden((n) =>
      n === 1 ? HttpResponse.error() : n === 2 ? problema(500, 'internal-error') : aplicada(),
    );
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await capturar(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos contactar al servidor.');
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Ocurrió un error inesperado/)).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(peticiones).toHaveLength(3);
    const [primera, segunda, tercera] = peticiones;
    expect(segunda?.llave).toBe(primera?.llave);
    expect(tercera?.llave).toBe(primera?.llave);
    expect(segunda?.cuerpo).toEqual(primera?.cuerpo);
    expect(tercera?.cuerpo).toEqual(primera?.cuerpo);
  });

  it('R-4.22 un 503 también ofrece "Reintentar" con la misma llave', async () => {
    conDatosDeTransferencia();
    const peticiones = transferenciasResponden((n) =>
      n === 1 ? problema(503, 'retryable') : aplicada(),
    );
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await capturar(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Enviar' }));
    await usuario.click(await screen.findByRole('button', { name: 'Reintentar' }));

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(peticiones[1]?.llave).toBe(peticiones[0]?.llave);
  });

  it('R-4.24 editar un dato descarta la llave: el envío usa la del nuevo paso a confirmación', async () => {
    conDatosDeTransferencia();
    const llaves = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ] as const;
    let siguiente = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => llaves[siguiente++] ?? llaves[1]);
    const peticiones = transferenciasResponden(aplicada);
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await capturar(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));
    const monto = await screen.findByLabelText('Monto');
    expect(monto).toHaveValue('1.15');
    await usuario.clear(monto);
    await usuario.type(monto, '2.50');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('$2.50')).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]?.llave).toBe(llaves[1]);
    expect(peticiones[0]?.cuerpo).toMatchObject({ montoCentavos: 250 });
  });

  it('R-4.23 R-6.15 "Nueva transferencia" después de un rechazo genera otra llave', async () => {
    conDatosDeTransferencia();
    const peticiones = transferenciasResponden((n) => (n === 1 ? rechazoPorSaldo() : aplicada()));
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await capturar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Enviar' }));

    await usuario.click(await screen.findByRole('button', { name: 'Nueva transferencia' }));
    await capturar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Enviar' }));

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(peticiones).toHaveLength(2);
    expect(peticiones[1]?.llave).toMatch(UUID);
    expect(peticiones[1]?.llave).not.toBe(peticiones[0]?.llave);
  });

  it.each([
    ['aplicada', aplicada],
    ['rechazada', rechazoPorSaldo],
  ])(
    'DD-43 al terminar %s se vuelven a pedir cuentas, movimientos y límites',
    async (_, responder) => {
      conDatosDeTransferencia();
      const pedidas = { cuentas: 0, limites: 0, movimientos: 0 };
      servidor.use(
        http.get('/api/cuentas', () => {
          pedidas.cuentas++;
          return HttpResponse.json({ items: [PRINCIPAL, AHORRO] });
        }),
        http.get('/api/limites', () => {
          pedidas.limites++;
          return HttpResponse.json(LIMITES);
        }),
        http.get('/api/cuentas/:cuentaId/movimientos', () => {
          pedidas.movimientos++;
          return HttpResponse.json({ items: [], siguienteCursor: null });
        }),
      );
      transferenciasResponden(responder);
      const usuario = userEvent.setup();
      const { router } = renderizarApp('/');
      await screen.findByRole('listitem', { name: 'Principal' });
      await act(() => router.navigate(`/cuentas/${ID_PRINCIPAL}`));
      await screen.findByText('Sin movimientos');
      await act(() => router.navigate('/transferir'));
      await capturar(usuario);
      await usuario.click(await screen.findByRole('button', { name: 'Enviar' }));
      await screen.findByRole('button', { name: 'Nueva transferencia' });

      // Dentro de los 30 s de staleTime, solo una invalidación hace que se vuelvan a pedir.
      await act(() => router.navigate('/'));
      await waitFor(() => expect(pedidas.cuentas).toBe(2));
      await waitFor(() => expect(pedidas.limites).toBe(2));
      await act(() => router.navigate(`/cuentas/${ID_PRINCIPAL}`));
      await waitFor(() => expect(pedidas.movimientos).toBe(2));
    },
  );
});
