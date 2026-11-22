// T-MOB-01: la pantalla muestra GET /health y los montos de R-2.5.
import { render, screen } from '@testing-library/react-native';
import { PantallaSalud } from '../src/pantallas/PantallaSalud';

const API = 'http://192.168.1.50:3000/api';

describe('PantallaSalud [RNF-32, R-2.5]', () => {
  it('RNF-32: consulta /health en la URL configurada y muestra el estado', async () => {
    const fetchFn = jest.fn(async () => Response.json({ estado: 'ok' })) as unknown as typeof fetch;
    await render(<PantallaSalud apiUrl={API} fetchFn={fetchFn} />);
    expect(await screen.findByText('Estado: ok')).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledWith(`${API}/health`, expect.anything());
    expect(screen.getByText('123456 → $1,234.56')).toBeTruthy();
  });

  it('RNF-32: si no hay conexión muestra el error con "Reintentar"', async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await render(<PantallaSalud apiUrl={API} fetchFn={fetchFn} />);
    expect(await screen.findByText(/No se pudo conectar/)).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });
});
