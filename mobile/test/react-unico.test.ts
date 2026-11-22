// DD-01: una sola copia de React en el monorepo; react-native resuelve la misma que mobile.
import { version } from 'react';

// `require.resolve` de Jest; mobile no lleva tipos de Node.
type RequireConResolve = { resolve(id: string, opciones?: { paths?: string[] }): string };
const requerir = require as unknown as RequireConResolve;

describe('una sola copia de React [DD-01]', () => {
  it('DD-01: react-native y mobile resuelven el mismo react', () => {
    const desdeMobile = requerir.resolve('react');
    const dirReactNative = requerir
      .resolve('react-native/package.json')
      .replace(/[\\/]package\.json$/, '');
    const desdeReactNative = requerir.resolve('react', { paths: [dirReactNative] });
    expect(desdeReactNative).toBe(desdeMobile);
  });

  it('DD-01: es la misma versión exacta que la web (19.3.0)', () => {
    expect(version).toBe('19.3.0');
  });
});
