// RNF-32: la URL de la API sale de EXPO_PUBLIC_API_URL y nunca se supone localhost.
import { validarConfig } from '../src/config';

describe('validarConfig [RNF-32]', () => {
  it('RNF-32: rechaza la URL ausente con un error de configuración', () => {
    const resultado = validarConfig({});
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain('EXPO_PUBLIC_API_URL');
  });

  it.each(['', '   '])('RNF-32: rechaza la URL vacía (%j)', (valor) => {
    expect(validarConfig({ EXPO_PUBLIC_API_URL: valor }).ok).toBe(false);
  });

  it.each([
    'http://<IP-de-la-LAN>:3000/api',
    '192.168.1.50:3000/api',
    'ftp://192.168.1.50/api',
    'http://192.168.1.50:3000/api con espacio',
  ])('RNF-32: rechaza lo que no es una URL http(s) (%s)', (valor) => {
    expect(validarConfig({ EXPO_PUBLIC_API_URL: valor }).ok).toBe(false);
  });

  it('RNF-32: acepta la IP de la LAN y quita la diagonal final', () => {
    expect(validarConfig({ EXPO_PUBLIC_API_URL: ' http://192.168.1.50:3000/api/ ' })).toEqual({
      ok: true,
      config: { apiUrl: 'http://192.168.1.50:3000/api' },
    });
  });

  it('RNF-32: no rechaza localhost (la prueba manual confirma que falla en el teléfono)', () => {
    expect(validarConfig({ EXPO_PUBLIC_API_URL: 'http://localhost:3000/api' }).ok).toBe(true);
  });
});
