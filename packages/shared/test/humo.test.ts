import { describe, expect, it } from 'vitest';

describe('paquete compartido', () => {
  it('RNF-18 @billetera/shared se resuelve por su nombre desde dist/', async () => {
    const shared: unknown = await import('@billetera/shared');
    expect(shared).toBeTypeOf('object');
  });
});
