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

  it('RNF-18 @billetera/shared exporta el módulo clabe', async () => {
    const shared = await import('@billetera/shared');
    expect(shared.digitoVerificador('99900000000000000')).toBe(1);
    expect(shared.validarClabe('999000000000000001')).toEqual({
      ok: true,
      clabe: '999000000000000001',
    });
  });

  it('RNF-18 @billetera/shared exporta los módulos tiempo y problemas', async () => {
    const shared = await import('@billetera/shared');
    expect(shared.ZONA_HORARIA).toBe('America/Mexico_City');
    expect(shared.instanteIso('2026-11-14 16:05:09.5+00')).toBe('2026-11-14T16:05:09.500000Z');
    expect(shared.mensajeDeProblema('credenciales-invalidas')).toBe(
      'Correo o contraseña incorrectos.',
    );
    expect(shared.TIPOS_PROBLEMA).toHaveLength(18);
  });
});
