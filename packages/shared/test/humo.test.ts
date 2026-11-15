import { describe, expect, it } from 'vitest';

describe('paquete compartido', () => {
  it('RNF-18 @billetera/shared se resuelve por su nombre desde dist/', async () => {
    const shared: unknown = await import('@billetera/shared');
    expect(shared).toBeTypeOf('object');
  });

  it('RNF-18 @billetera/shared exporta el módulo dinero', async () => {
    const shared = await import('@billetera/shared');
    expect(shared.formatearMXN(123456)).toBe('$1,234.56');
    expect(shared.centavosATextoDecimal(-5)).toBe('-0.05');
    expect(shared.montoTextoACentavos('1.15')).toEqual({ ok: true, centavos: 115 });
    expect(shared.TOPE_CENTAVOS).toBe(100_000_000_000);
  });
});
