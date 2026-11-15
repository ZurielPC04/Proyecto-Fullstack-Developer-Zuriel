import { describe, expect, it } from 'vitest';
import { instanteIso, ZONA_HORARIA } from '../src/tiempo.js';

describe('instanteIso', () => {
  it('DD-22 RNF-10 convierte un timestamptz con 6 decimales sin perder microsegundos', () => {
    expect(instanteIso('2026-11-14 16:05:09.123456+00')).toBe('2026-11-14T16:05:09.123456Z');
  });

  it.each([
    ['sin fracción', '2026-11-14 16:05:09+00', '2026-11-14T16:05:09.000000Z'],
    ['fracción de 3 dígitos', '2026-11-14 16:05:09.123+00', '2026-11-14T16:05:09.123000Z'],
    ['fracción de 1 dígito', '2026-11-14 16:05:09.5+00', '2026-11-14T16:05:09.500000Z'],
    ['microsegundo final', '2026-11-14 16:05:09.000001+00', '2026-11-14T16:05:09.000001Z'],
  ])('DD-22 completa la fracción a 6 dígitos (%s)', (_caso, textoPg, iso) => {
    expect(instanteIso(textoPg)).toBe(iso);
  });

  it.each([
    ['desfase -06', '2026-11-14 10:05:09.123456-06'],
    ['desfase +00:00', '2026-11-14 16:05:09.123456+00:00'],
    ['desfase +05:30', '2026-11-14 21:35:09.123456+05:30'],
    ['más de 6 decimales', '2026-11-14 16:05:09.1234567+00'],
    ['ya en ISO', '2026-11-14T16:05:09.123456Z'],
    ['infinity', 'infinity'],
    ['vacío', ''],
  ])('DD-22 DD-07 lanza un error si no es un timestamptz en UTC (%s)', (_caso, textoPg) => {
    expect(() => instanteIso(textoPg)).toThrow(/timestamptz en UTC/);
  });
});

describe('ZONA_HORARIA', () => {
  it('RNF-10 D-15 la zona de las ventanas es America/Mexico_City', () => {
    expect(ZONA_HORARIA).toBe('America/Mexico_City');
  });
});
