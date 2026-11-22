import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App } from '../src/app/App';
import { crearQueryClient } from '../src/app/query-client';
import { rutas } from '../src/app/rutas';

/** Monta la app completa en una ruta, con un QueryClient nuevo por prueba. */
export function renderizarApp(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  const queryClient = crearQueryClient();
  return { ...render(<App router={router} queryClient={queryClient} />), router, queryClient };
}
