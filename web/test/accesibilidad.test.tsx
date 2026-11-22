import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
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
import { confirmarCodigo, enviarABeto, recargar } from './flujo-transferencia';
import { problema } from './servidor';
import { renderizarApp } from './utilidades';

const pendiente = () => HttpResponse.json(PENDIENTE, { status: 202 });
const aplicada = () => HttpResponse.json(COMPROBANTE, { status: 201 });

/** RNF-19 (§13.2): al cambiar de pantalla o de fase, el foco va al h1 de la nueva. */
async function enfocaElTitulo(nombre: string) {
  const titulo = await screen.findByRole('heading', { level: 1, name: nombre });
  await waitFor(() => expect(titulo).toHaveFocus());
  return titulo;
}

async function sinViolaciones() {
  expect(await axe(document.body)).toHaveNoViolations();
}

describe('accesibilidad de la web (RNF-19, DD-43)', () => {
  it('RNF-19 la transferencia completa, con código, se hace solo con el teclado', async () => {
    conDatosDeTransferencia();
    const creaciones = transferenciasResponden(pendiente);
    const codigos = confirmacionesResponden(aplicada);
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enfocaElTitulo('Transferir');
    await screen.findByRole('radio', { name: /^Beto/ });

    // Tab: la cuenta de origen (ya elegida) → el destino → Monto. Enter sin destino ni monto.
    await usuario.tab();
    expect(screen.getByRole('radio', { name: /^Principal/ })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole('radio', { name: /^Beto/ })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByLabelText('Monto')).toHaveFocus();
    await usuario.keyboard('{Enter}');

    // Al fallar el envío, el foco va al primer campo con error, marcado y descrito.
    const beto = screen.getByRole('radio', { name: /^Beto/ });
    await waitFor(() => expect(beto).toHaveFocus());
    expect(beto).toHaveAttribute('aria-invalid', 'true');
    expect(beto).toHaveAccessibleDescription('Elige el destino.');
    const monto = screen.getByLabelText('Monto');
    expect(monto).toHaveAttribute('aria-invalid', 'true');
    expect(monto).toHaveAccessibleDescription('Monto inválido');
    await sinViolaciones();

    // Espacio elige el destino; Tab y escritura llenan el resto; Enter continúa.
    await usuario.keyboard(' ');
    expect(beto).toBeChecked();
    await usuario.tab();
    await usuario.keyboard('15,000');
    await usuario.tab();
    await usuario.keyboard('Renta');
    await usuario.tab();
    await usuario.keyboard('0042{Enter}');

    await enfocaElTitulo('Confirma la transferencia');
    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveFocus();
    await usuario.keyboard('{Enter}');

    await enfocaElTitulo('Código de confirmación');
    await usuario.tab();
    expect(screen.getByLabelText('Código')).toHaveFocus();
    await usuario.keyboard('123456{Enter}');

    await enfocaElTitulo('Transferencia aplicada');
    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Nueva transferencia' })).toHaveFocus();
    await usuario.keyboard('{Enter}');

    await enfocaElTitulo('Transferir');
    expect(creaciones).toHaveLength(1);
    expect(codigos).toEqual(['123456']);
  }, 15_000); // recorre el flujo completo tecla por tecla

  it('RNF-19 al cambiar de pantalla por la navegación, el foco va al h1', async () => {
    conDatosDeTransferencia();
    const { router } = renderizarApp('/');
    await enfocaElTitulo('Resumen');

    await act(() => router.navigate('/transferir'));

    await enfocaElTitulo('Transferir');
  });

  it('RNF-19 axe sin violaciones en confirmación, envío en vuelo, error reintentable y rechazo', async () => {
    conDatosDeTransferencia();
    const segunda = puerta();
    transferenciasResponden(async (n) => {
      if (n === 1) return HttpResponse.error();
      await segunda.abierta;
      return problema(422, 'saldo-insuficiente', {
        motivo: 'SALDO_INSUFICIENTE',
        transferenciaId: ID_TRANSFERENCIA,
      });
    });
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await usuario.click(await screen.findByRole('radio', { name: /^Beto/ }));
    await usuario.type(screen.getByLabelText('Monto'), '1.15');
    await usuario.type(screen.getByLabelText('Concepto'), 'Renta');
    await usuario.type(screen.getByLabelText('Referencia'), '0042');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));

    await enfocaElTitulo('Confirma la transferencia');
    await sinViolaciones();
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    // El botón deshabilitado pierde el foco; "Reintentar" lo recupera para seguir con teclado.
    const reintentar = await screen.findByRole('button', { name: 'Reintentar' });
    await waitFor(() => expect(reintentar).toHaveFocus());
    await sinViolaciones();
    await usuario.click(reintentar);
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('aria-busy', 'true');
    await sinViolaciones();
    segunda.abrir();

    await enfocaElTitulo('Transferencia rechazada');
    await sinViolaciones();
  });

  it('RNF-19 axe sin violaciones en la captura del código, con error, y en el comprobante', async () => {
    conDatosDeTransferencia();
    transferenciasResponden(pendiente);
    confirmacionesResponden((n) =>
      n === 1
        ? problema(422, 'codigo-incorrecto', {
            transferenciaId: ID_TRANSFERENCIA,
            intentosRestantes: 2,
          })
        : n === 2
          ? HttpResponse.error()
          : aplicada(),
    );
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario);

    await enfocaElTitulo('Código de confirmación');
    await sinViolaciones();
    await confirmarCodigo(usuario, '000000');
    await waitFor(() => expect(screen.getByLabelText('Código')).toHaveFocus());
    expect(screen.getByLabelText('Código')).toHaveAttribute('aria-invalid', 'true');
    await sinViolaciones();
    await confirmarCodigo(usuario, '123456');

    const reintentar = await screen.findByRole('button', { name: 'Reintentar' });
    await waitFor(() => expect(reintentar).toHaveFocus());
    await sinViolaciones();
    await usuario.keyboard('{Enter}');

    await enfocaElTitulo('Transferencia aplicada');
    await sinViolaciones();
  });

  it('RNF-19 axe sin violaciones al verificar la operación anterior y el estado real', async () => {
    conDatosDeTransferencia();
    const reenvio = puerta();
    const creaciones = transferenciasResponden(async (n) => {
      if (n === 1) await new Promise(() => undefined); // la recarga corta esta petición
      await reenvio.abierta;
      return HttpResponse.json(PENDIENTE_REPETIDA, { status: 202 });
    });
    estadoResponde((n) =>
      n === 1 ? HttpResponse.error() : HttpResponse.json(transferenciaEnEstado('APLICADA')),
    );
    const usuario = userEvent.setup();
    renderizarApp('/transferir');
    await enviarABeto(usuario, '1.15');
    await waitFor(() => expect(creaciones).toHaveLength(1));

    recargar();

    await enfocaElTitulo('Verificando operación anterior');
    expect(screen.getByRole('status')).toHaveTextContent('Verificando operación anterior…');
    await sinViolaciones();
    reenvio.abrir();

    // El 202 de la reanudación pasa por el GET (DD-32); el primero falla (H3).
    const reintentar = await screen.findByRole('button', { name: 'Reintentar' });
    await sinViolaciones();
    await usuario.click(reintentar);

    await enfocaElTitulo('Transferencia aplicada');
  });
});
