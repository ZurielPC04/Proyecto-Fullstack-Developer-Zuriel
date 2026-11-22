// T-MOB-03: pantalla Movimientos (design.md §13.3, R-2.5, R-5.9, R-5.12, RNF-17).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LLAVE_REFRESH } from '../src/auth/almacen';
import { ProveedorApp } from '../src/contexto';
import { PantallaMovimientos } from '../src/pantallas/PantallaMovimientos';
import { Raiz } from '../src/Raiz';
import { REFRESH_1, contextoDePrueba, diferido, problema, tokens } from './ayudas';
import { CUENTAS, LIMITES, movimiento } from './datos';

const PAGINA = {
  items: [
    movimiento('m1', 'ENVIO', -250, 'Renta'),
    movimiento('m2', 'DEPOSITO', 5, 'Depósito'),
    movimiento('m3', 'RECEPCION', 123456, 'Transferencia recibida'),
  ],
  siguienteCursor: 'cursor-de-la-pagina-2',
};

async function montar(manejador: Parameters<typeof contextoDePrueba>[0]) {
  const prueba = contextoDePrueba(manejador);
  await render(
    <ProveedorApp value={prueba.contexto}>
      <PantallaMovimientos cuentaId="c1" />
    </ProveedorApp>,
  );
  return prueba;
}

describe('pantalla Movimientos', () => {
  it('R-5.12: pide los últimos 20 de la cuenta elegida, sin cursor', async () => {
    const { peticiones } = await montar(() => Response.json(PAGINA));
    await screen.findByText('Renta');
    expect(peticiones.map((p) => p.ruta)).toEqual(['/cuentas/c1/movimientos?limite=20']);
  });

  it('RNF-17: muestra el indicador mientras carga', async () => {
    const respuesta = diferido<Response>();
    await montar(() => respuesta.promesa);
    expect(screen.getByLabelText('Cargando movimientos')).toBeTruthy();
    respuesta.resolver(Response.json(PAGINA));
    expect(await screen.findByText('Renta')).toBeTruthy();
  });

  it('RNF-17: sin movimientos muestra "Sin movimientos"', async () => {
    await montar(() => Response.json({ items: [], siguienteCursor: null }));
    expect(await screen.findByText('Sin movimientos')).toBeTruthy();
  });

  it('RNF-17: si falla muestra el error con "Reintentar", y reintentar vuelve a cargar', async () => {
    let fallar = true;
    const { peticiones } = await montar(() =>
      fallar ? problema(503, 'service-unavailable') : Response.json(PAGINA),
    );
    expect(await screen.findByText('No pudimos cargar los movimientos.')).toBeTruthy();
    fallar = false;
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(await screen.findByText('Renta')).toBeTruthy();
    expect(peticiones).toHaveLength(2);
  });

  it('R-2.5: los montos con signo se muestran con la tabla de R-2.5', async () => {
    await montar(() => Response.json(PAGINA));
    expect(await screen.findByText('-$2.50')).toBeTruthy();
    expect(screen.getByText('$0.05')).toBeTruthy();
    expect(screen.getByText('$1,234.56')).toBeTruthy();
  });

  it('R-5.9: una entrada desde Fondeo se muestra como "Depósito"', async () => {
    await montar(() => Response.json({ items: [PAGINA.items[1]], siguienteCursor: null }));
    // El tipo y la contraparte dicen "Depósito"; nunca "Recepción" ni "Transferencia".
    expect(await screen.findAllByText('Depósito')).toHaveLength(2);
    expect(screen.queryByText('Recepción')).toBeNull();
  });
});

describe('de Saldo a Movimientos [DD-03]', () => {
  it('R-5.12: con sesión, Saldo navega a los movimientos de la cuenta elegida', async () => {
    const { contexto, peticiones } = contextoDePrueba(
      (p) => {
        if (p.ruta === '/auth/refresh') return tokens('access-2', REFRESH_1);
        if (p.ruta === '/cuentas') return Response.json({ items: CUENTAS });
        if (p.ruta === '/limites') return Response.json(LIMITES);
        if (p.ruta.startsWith('/cuentas/c2/movimientos')) return Response.json(PAGINA);
        return problema(404, 'not-found');
      },
      { [LLAVE_REFRESH]: REFRESH_1 },
    );
    await render(<Raiz contexto={contexto} />);

    await fireEvent.press(await screen.findByLabelText('Ver movimientos de Ahorro'));

    expect(await screen.findByText('Renta')).toBeTruthy();
    expect(peticiones.at(-1)).toMatchObject({
      ruta: '/cuentas/c2/movimientos?limite=20',
      autorizacion: 'Bearer access-2',
    });
  });
});
