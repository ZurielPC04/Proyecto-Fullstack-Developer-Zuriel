// R-2.5 bajo jest-expo: la app móvil usa formatearMXNSinIntl de @billetera/shared compilado
// (DD-05), porque Hermes no acepta BigInt en formatToParts (D-18 punto 5).
import { formatearMXNSinIntl } from '@billetera/shared';

describe('formatearMXNSinIntl en la app móvil [R-2.5]', () => {
  it.each([
    [5, '$0.05'],
    [100, '$1.00'],
    [123456, '$1,234.56'],
    [-250, '-$2.50'],
  ])('R-2.5: %i centavos se muestran como %s', (centavos, esperado) => {
    expect(formatearMXNSinIntl(centavos)).toBe(esperado);
  });
});
