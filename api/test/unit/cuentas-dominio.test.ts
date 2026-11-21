import { describe, expect, it } from 'vitest';
import { clabeDeUsuario } from '../../src/modulos/cuentas/cuentas.dominio.js';

describe('clabeDeUsuario (design.md §3.6, DD-19)', () => {
  it('R-1.1 DD-19: banco 999, plaza 180, 11 dígitos de cuenta y dígito verificador', () => {
    // 9·3=27→7, 9·7=63→3, 9·1=9, 1·3=3, 8·7=56→6, 0…, 1·7=7 → suma 35 → (10 − 5) % 10 = 5.
    expect(clabeDeUsuario('00000000001')).toBe('999180000000000015');
  });

  it('DD-19: rechaza una cuenta que no sean exactamente 11 dígitos', () => {
    expect(() => clabeDeUsuario('1234567890')).toThrow(RangeError);
    expect(() => clabeDeUsuario('1234567890a')).toThrow(RangeError);
  });
});
