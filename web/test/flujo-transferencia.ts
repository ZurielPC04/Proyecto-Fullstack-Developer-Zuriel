import { cleanup, screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { olvidarAccess } from '../src/auth/sesion';
import { renderizarApp } from './utilidades';

export type Usuario = ReturnType<typeof userEvent.setup>;

/** Llena el formulario hacia Beto desde Principal, pasa a la confirmación y envía. */
export async function enviarABeto(usuario: Usuario, monto = '15,000') {
  await usuario.click(await screen.findByRole('radio', { name: /^Beto/ }));
  await usuario.type(screen.getByLabelText('Monto'), monto);
  await usuario.type(screen.getByLabelText('Concepto'), 'Renta');
  await usuario.type(screen.getByLabelText('Referencia'), '0042');
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
  await usuario.click(await screen.findByRole('button', { name: 'Enviar' }));
}

/** Captura el código y lo confirma. */
export async function confirmarCodigo(usuario: Usuario, codigo: string) {
  const campo = await screen.findByLabelText('Código');
  await usuario.clear(campo);
  await usuario.type(campo, codigo);
  await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));
}

/**
 * Simula recargar la página en `/transferir`: se desmonta la app y se pierde el access en
 * memoria (R-1.13); `sessionStorage` sobrevive, como en el navegador (D-16). Las peticiones
 * que seguían en vuelo se quedan sin respuesta, igual que al recargar.
 */
export function recargar() {
  cleanup();
  olvidarAccess();
  return renderizarApp('/transferir');
}
