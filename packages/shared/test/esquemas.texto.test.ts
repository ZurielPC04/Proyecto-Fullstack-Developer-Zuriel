import { describe, expect, it } from 'vitest';
import { normalizarTexto } from '../src/esquemas/texto.js';

// Code points explícitos: Prettier convierte los escapes \u en caracteres y las dos é se ven iguales.
const ACENTO = String.fromCodePoint(0x0301);
const E_PRECOMPUESTA = String.fromCodePoint(0x00e9);

describe('normalizarTexto', () => {
  it('DD-16 recorta los espacios al inicio y al final', () => {
    expect(normalizarTexto('  Renta \t')).toBe('Renta');
  });

  it('DD-16 normaliza a NFC: é compuesta y precompuesta quedan iguales', () => {
    const compuesta = `cafe${ACENTO}`;
    const precompuesta = `caf${E_PRECOMPUESTA}`;
    expect(compuesta).not.toBe(precompuesta);
    expect(normalizarTexto(compuesta)).toBe(precompuesta);
    expect(normalizarTexto(precompuesta)).toBe(precompuesta);
  });

  it('DD-16 conserva los espacios internos', () => {
    expect(normalizarTexto(' pago  de renta ')).toBe('pago  de renta');
  });
});
