import { describe, expect, it } from 'vitest';
import {
  centavosATextoDecimal,
  formatearMXN,
  montoTextoACentavos,
  TOPE_CENTAVOS,
} from '../src/dinero.js';

describe('centavosATextoDecimal', () => {
  it.each([
    [-5, '-0.05'],
    [0, '0.00'],
    [123456, '1234.56'],
  ])('R-B1.2 %i centavos se escriben como "%s"', (centavos, texto) => {
    expect(centavosATextoDecimal(centavos)).toBe(texto);
  });
});

describe('formatearMXN', () => {
  it.each([
    [5, '$0.05'],
    [100, '$1.00'],
    [123456, '$1,234.56'],
    [0, '$0.00'],
    [-250, '-$2.50'],
    [-5, '-$0.05'],
  ])('R-2.5 %i centavos se muestran como "%s"', (centavos, texto) => {
    expect(formatearMXN(centavos)).toBe(texto);
  });
});

describe('TOPE_CENTAVOS', () => {
  it('D-18 el tope de transporte es 100000000000 centavos', () => {
    expect(TOPE_CENTAVOS).toBe(100_000_000_000);
  });
});

describe('montoTextoACentavos', () => {
  it('R-4.33 "1.15" se convierte en 115 centavos', () => {
    expect(montoTextoACentavos('1.15')).toEqual({ ok: true, centavos: 115 });
  });

  it.each([
    ['0.1', 10],
    ['0.10', 10],
    ['1,000', 100000],
    ['$ 1,234.56', 123456],
    ['00.50', 50],
    ['1,000.5', 100050],
    ['$1,000,000.00', 100000000],
  ])('R-4.33 "%s" se convierte en %i centavos', (texto, centavos) => {
    expect(montoTextoACentavos(texto)).toEqual({ ok: true, centavos });
  });

  it.each(['10.999', '1.005'])(
    'R-4.34 "%s" se rechaza con "Máximo 2 decimales", sin truncar',
    (texto) => {
      expect(montoTextoACentavos(texto)).toEqual({ ok: false, error: 'Máximo 2 decimales' });
    },
  );

  it.each([
    ['-5', 'Monto inválido'],
    ['1e3', 'Monto inválido'],
    ['1,00', 'Monto inválido'],
    ['', 'Monto inválido'],
    ['0', 'El monto debe ser mayor que cero'],
    ['0.00', 'El monto debe ser mayor que cero'],
  ])('R-4.34 "%s" se rechaza con "%s"', (texto, error) => {
    expect(montoTextoACentavos(texto)).toEqual({ ok: false, error });
  });

  it('R-4.34 el tope exacto "1,000,000,000.00" se acepta', () => {
    expect(montoTextoACentavos('1,000,000,000.00')).toEqual({
      ok: true,
      centavos: 100_000_000_000,
    });
  });

  it('R-4.34 "1000000000.01" se rechaza por superar el tope', () => {
    expect(montoTextoACentavos('1000000000.01')).toEqual({
      ok: false,
      error: 'El monto supera el tope',
    });
  });
});
