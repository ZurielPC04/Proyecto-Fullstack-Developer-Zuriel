import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  COMPROBANTE,
  confirmacionesResponden,
  conDatosDeTransferencia,
  estadoResponde,
  ID_TRANSFERENCIA,
  PENDIENTE,
  PENDIENTE_REPETIDA,
  puerta,
  transferenciaEnEstado,
  transferenciasResponden,
} from './api-falsa';
import { confirmarCodigo, enviarABeto } from './flujo-transferencia';
import { problema } from './servidor';
import { renderizarApp } from './utilidades';

const pendiente = () => HttpResponse.json(PENDIENTE, { status: 202 });
const aplicada = () => HttpResponse.json(COMPROBANTE, { status: 201 });
const incorrecto = (intentosRestantes: number) =>
  problema(422, 'codigo-incorrecto', { transferenciaId: ID_TRANSFERENCIA, intentosRestantes });

describe('código de confirmación (R-6.18, DD-25, DD-32)', () => {
  it('R-6.18 un 202 muestra la captura con el código de prueba, y el código correcto da el comprobante', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden(pendiente);
    const codigos = confirmacionesResponden(aplicada);
    const usuario = userEvent.setup();
    renderizarApp('/transferir');

    await enviarABeto(usuario);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Código de confirmación' }),
    ).toBeVisible();
    expect(screen.getByText(/Modo de prueba/)).toHaveTextContent('123456');
    await confirmarCodigo(usuario, '123456');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' }),
    ).toBeVisible();
    expect(codigos).toEqual(['123456']);
    expect(creaciones).toHaveLength(1);
  });

  it('R-6.11 un código incorrecto vuelve a la captura y anuncia los intentos restantes', async () => {
    conDatosDeTransferencia();
    transferenciasResponden(pendiente);
    const codigos = confirmacionesResponden((n) => (n === 1 ? incorrecto(2) : aplicada()));
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);

    await confirmarCodigo(usuario, '000000');

    const campo = await screen.findByLabelText('Código');
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'));
    expect(campo).toHaveAccessibleDescription(
      'El código es incorrecto. Inténtalo de nuevo. Te quedan 2 intentos.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Te quedan 2 intentos.');
    expect(campo).toHaveFocus();
    await confirmarCodigo(usuario, '123456');

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(codigos).toEqual(['000000', '123456']);
  });

  it('R-6.15 CODIGO_AGOTADO cierra el intento y "Nueva transferencia" exige otra llave', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden((n) => (n === 1 ? pendiente() : aplicada()));
    confirmacionesResponden(() =>
      problema(422, 'codigo-agotado', {
        motivo: 'CODIGO_AGOTADO',
        transferenciaId: ID_TRANSFERENCIA,
      }),
    );
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);

    await confirmarCodigo(usuario, '000000');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Transferencia rechazada' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Agotaste los intentos del código. La transferencia fue rechazada.',
    );
    expect(screen.queryByLabelText('Código')).toBeNull();
    await usuario.click(screen.getByRole('button', { name: 'Nueva transferencia' }));
    await enviarABeto(usuario, '10');

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(creaciones).toHaveLength(2);
    expect(creaciones[1]?.llave).not.toBe(creaciones[0]?.llave);
  });

  it('R-6.12 un código expirado muestra el rechazo', async () => {
    conDatosDeTransferencia();
    transferenciasResponden(pendiente);
    confirmacionesResponden(() =>
      problema(422, 'codigo-expirado', {
        motivo: 'CODIGO_EXPIRADO',
        transferenciaId: ID_TRANSFERENCIA,
      }),
    );
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);

    await confirmarCodigo(usuario, '123456');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El código expiró. La transferencia fue rechazada.',
    );
  });

  it('R-6.13 un error de red al confirmar ofrece "Reintentar" con el mismo código, sin volver a crear', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden(pendiente);
    const codigos = confirmacionesResponden((n) => (n === 1 ? HttpResponse.error() : aplicada()));
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);

    await confirmarCodigo(usuario, '123456');
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos contactar al servidor.');
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(codigos).toEqual(['123456', '123456']);
    expect(creaciones).toHaveLength(1);
  });

  it('R-6.13 un doble clic en "Confirmar" produce una sola confirmación', async () => {
    conDatosDeTransferencia();
    transferenciasResponden(pendiente);
    const respuesta = puerta();
    const codigos = confirmacionesResponden(async () => {
      await respuesta.abierta;
      return aplicada();
    });
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);
    await usuario.type(await screen.findByLabelText('Código'), '123456');

    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    act(() => {
      confirmar.click();
      confirmar.click();
    });

    await waitFor(() => expect(codigos).toHaveLength(1));
    expect(confirmar).toHaveAttribute('aria-busy', 'true');
    respuesta.abrir();
    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(codigos).toHaveLength(1);
  });

  it('DD-32 un 202 que llega por reintento se contrasta con el estado real: si ya se aplicó, comprobante', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden((n) =>
      n === 1 ? HttpResponse.error() : HttpResponse.json(PENDIENTE_REPETIDA, { status: 202 }),
    );
    const consultas = estadoResponde(() => HttpResponse.json(transferenciaEnEstado('APLICADA')));
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Reintentar' }));

    const comprobante = await screen.findByRole('region', { name: 'Transferencia aplicada' });
    expect(comprobante).toHaveTextContent(ID_TRANSFERENCIA);
    expect(comprobante).toHaveTextContent('$15,000.00');
    expect(consultas.n).toBe(1);
    expect(creaciones[1]?.llave).toBe(creaciones[0]?.llave);
    expect(screen.queryByLabelText('Código')).toBeNull();
  });

  it('DD-32 un 202 por reintento con la transferencia aún pendiente lleva a la captura', async () => {
    conDatosDeTransferencia();
    transferenciasResponden((n) =>
      n === 1 ? problema(503, 'retryable') : HttpResponse.json(PENDIENTE_REPETIDA, { status: 202 }),
    );
    const consultas = estadoResponde(() =>
      HttpResponse.json(transferenciaEnEstado('PENDIENTE_CONFIRMACION')),
    );
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Código de confirmación' }),
    ).toBeVisible();
    expect(consultas.n).toBe(1);
    expect(screen.queryByText(/Modo de prueba/)).toBeNull();
  });

  it('DD-32 un 202 por reintento de una transferencia ya rechazada muestra su motivo', async () => {
    conDatosDeTransferencia();
    transferenciasResponden((n) =>
      n === 1 ? HttpResponse.error() : HttpResponse.json(PENDIENTE_REPETIDA, { status: 202 }),
    );
    estadoResponde(() => HttpResponse.json(transferenciaEnEstado('RECHAZADA', 'CODIGO_EXPIRADO')));
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Transferencia rechazada' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('El código expiró.');
  });

  it('H3 si falla la consulta del estado real, "Reintentar" repite la consulta', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden((n) =>
      n === 1 ? HttpResponse.error() : HttpResponse.json(PENDIENTE_REPETIDA, { status: 202 }),
    );
    const consultas = estadoResponde((n) =>
      n === 1 ? HttpResponse.error() : HttpResponse.json(transferenciaEnEstado('APLICADA')),
    );
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos contactar al servidor.');
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(consultas.n).toBe(2);
    expect(creaciones).toHaveLength(2);
  });
});
