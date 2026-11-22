import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  COMPROBANTE,
  confirmacionesResponden,
  conDatosDeTransferencia,
  estadoResponde,
  PENDIENTE,
  puerta,
  transferenciaEnEstado,
  transferenciasResponden,
} from './api-falsa';
import { confirmarCodigo, enviarABeto, recargar } from './flujo-transferencia';
import { servidor, tokens } from './servidor';
import { renderizarApp } from './utilidades';

const aplicada = () => HttpResponse.json(COMPROBANTE, { status: 201 });

describe('reanudación tras recarga (R-4.25, DD-25, DD-32)', () => {
  it('R-4.25 una recarga con el intento en fase creacion muestra "Verificando operación anterior…" y lo reenvía con la misma llave', async () => {
    conDatosDeTransferencia();
    const enVuelo = puerta();
    const creaciones = transferenciasResponden(async (n) => {
      if (n === 1) await new Promise(() => undefined); // la recarga corta esta petición
      await enVuelo.abierta;
      return aplicada();
    });
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario, '1.15');
    await waitFor(() => expect(creaciones).toHaveLength(1));

    recargar();

    expect(await screen.findByText('Verificando operación anterior…')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    await waitFor(() => expect(creaciones).toHaveLength(2));
    enVuelo.abrir();
    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(creaciones[1]?.llave).toBe(creaciones[0]?.llave);
    expect(creaciones[1]?.cuerpo).toEqual(creaciones[0]?.cuerpo);
  });

  it('R-4.25 DD-32 una recarga con la confirmación en vuelo reintenta la confirmación, nunca la creación', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden(() => HttpResponse.json(PENDIENTE, { status: 202 }));
    const codigos = confirmacionesResponden(async (n) => {
      if (n === 1) await new Promise(() => undefined); // la recarga corta esta petición
      return aplicada();
    });
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);
    await confirmarCodigo(usuario, '654321');
    await waitFor(() => expect(codigos).toHaveLength(1));

    recargar();

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(codigos).toEqual(['654321', '654321']);
    expect(creaciones).toHaveLength(1);
  });

  it('DD-25 una recarga en la pantalla del código recupera el codigoSimulado guardado y la confirmación funciona', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden(() => HttpResponse.json(PENDIENTE, { status: 202 }));
    const consultas = estadoResponde(() =>
      HttpResponse.json(transferenciaEnEstado('PENDIENTE_CONFIRMACION')),
    );
    const codigos = confirmacionesResponden(aplicada);
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);
    await screen.findByRole('heading', { level: 1, name: 'Código de confirmación' });

    recargar();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Código de confirmación' }),
    ).toBeVisible();
    expect(screen.getByText(/Modo de prueba/)).toHaveTextContent('123456');
    expect(consultas.n).toBe(1);
    expect(creaciones).toHaveLength(1);
    await confirmarCodigo(usuario, '123456');

    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });
    expect(codigos).toEqual(['123456']);
  });

  it('R-4.25 una transferencia ya resuelta no deja intento: la recarga muestra el formulario', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden(aplicada);
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario, '1.15');
    await screen.findByRole('heading', { level: 1, name: 'Transferencia aplicada' });

    recargar();

    expect(await screen.findByRole('heading', { level: 1, name: 'Transferir' })).toBeVisible();
    expect(screen.queryByText('Verificando operación anterior…')).toBeNull();
    expect(creaciones).toHaveLength(1);
  });

  it('R-1.12 cerrar sesión borra el intento pendiente: al volver no se reanuda', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden(() => HttpResponse.json(PENDIENTE, { status: 202 }));
    servidor.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);
    await screen.findByRole('heading', { level: 1, name: 'Código de confirmación' });

    const encabezado = screen.getByRole('banner');
    await usuario.click(within(encabezado).getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' });
    servidor.use(http.post('/api/auth/refresh', () => tokens('access-2')));
    recargar();

    expect(await screen.findByRole('heading', { level: 1, name: 'Transferir' })).toBeVisible();
    expect(screen.queryByText(/Modo de prueba/)).toBeNull();
    expect(creaciones).toHaveLength(1);
  });
});
