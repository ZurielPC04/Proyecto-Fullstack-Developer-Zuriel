import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderizarApp } from './utilidades';

describe('esqueleto de la web', () => {
  it('RNF-19 cada pantalla tiene su h1 dentro del layout y axe no reporta violaciones', async () => {
    const { container } = renderizarApp('/');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('una ruta inexistente muestra su propio h1', async () => {
    renderizarApp('/no-existe');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' }),
    ).toBeInTheDocument();
  });
});
