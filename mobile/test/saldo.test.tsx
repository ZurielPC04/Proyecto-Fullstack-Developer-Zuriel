// T-MOB-03: pantalla Saldo (design.md §13.3, R-2.5, R-2.6, RNF-17).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProveedorApp } from '../src/contexto';
import { PantallaSaldo } from '../src/pantallas/PantallaSaldo';
import { contextoDePrueba, diferido, problema } from './ayudas';
import { CUENTAS, LIMITES } from './datos';

async function montar(manejador: Parameters<typeof contextoDePrueba>[0]) {
  const prueba = contextoDePrueba(manejador);
  const alVerMovimientos = jest.fn();
  await render(
    <ProveedorApp value={prueba.contexto}>
      <PantallaSaldo alVerMovimientos={alVerMovimientos} alTransferir={jest.fn()} />
    </ProveedorApp>,
  );
  return { ...prueba, alVerMovimientos };
}

describe('pantalla Saldo', () => {
  it('R-2.6: muestra el indicador mientras carga y después las cuentas', async () => {
    const cuentas = diferido<Response>();
    await montar((p) => (p.ruta === '/cuentas' ? cuentas.promesa : Response.json(LIMITES)));
    expect(screen.getByLabelText('Cargando cuentas')).toBeTruthy();
    cuentas.resolver(Response.json({ items: CUENTAS }));
    expect(await screen.findByText('Principal')).toBeTruthy();
    expect(screen.queryByLabelText('Cargando cuentas')).toBeNull();
  });

  it('R-2.5: los saldos y el límite disponible se muestran con la tabla de R-2.5', async () => {
    await montar((p) =>
      p.ruta === '/cuentas' ? Response.json({ items: CUENTAS }) : Response.json(LIMITES),
    );
    expect(await screen.findByText('$1,234.56')).toBeTruthy();
    expect(screen.getByText('$0.05')).toBeTruthy();
    expect(screen.getByText('$49,997.50')).toBeTruthy();
    expect(screen.getByText('Consumido hoy: $2.50')).toBeTruthy();
    expect(screen.getByText('Límite diario: $50,000.00')).toBeTruthy();
  });

  it('R-2.6: si falla muestra el error con "Reintentar", y reintentar vuelve a cargar', async () => {
    let fallar = true;
    const { peticiones } = await montar((p) => {
      if (p.ruta === '/limites') return Response.json(LIMITES);
      return fallar ? problema(500, 'internal-error') : Response.json({ items: CUENTAS });
    });
    expect(await screen.findByText('No pudimos cargar tus cuentas.')).toBeTruthy();

    fallar = false;
    await fireEvent.press(screen.getByText('Reintentar'));

    expect(await screen.findByText('Principal')).toBeTruthy();
    expect(peticiones.filter((p) => p.ruta === '/cuentas')).toHaveLength(2);
  });

  it('R-5.12: "Ver movimientos" abre los movimientos de la cuenta elegida', async () => {
    const { alVerMovimientos } = await montar((p) =>
      p.ruta === '/cuentas' ? Response.json({ items: CUENTAS }) : Response.json(LIMITES),
    );
    await fireEvent.press(await screen.findByLabelText('Ver movimientos de Ahorro'));
    expect(alVerMovimientos).toHaveBeenCalledWith(CUENTAS[1]);
  });
});
