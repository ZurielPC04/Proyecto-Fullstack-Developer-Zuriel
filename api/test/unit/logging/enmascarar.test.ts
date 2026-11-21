import { describe, expect, it } from 'vitest';
import { enmascararClabe, enmascararCorreo } from '../../../src/plataforma/logging/enmascarar.js';

describe('enmascararCorreo', () => {
  it.each([
    ['ana@dominio.mx', 'a***@dominio.mx'],
    ['alberto.perez@dominio.mx', 'a***@dominio.mx'],
    ['ñandu@correo.com.mx', 'ñ***@correo.com.mx'],
    ['x@y.mx', 'x***@y.mx'],
  ])('DD-39 RNF-12: %s → %s (primera letra y dominio)', (correo, esperado) => {
    expect(enmascararCorreo(correo)).toBe(esperado);
  });

  it.each(['sin-arroba', '@dominio.mx', ''])(
    'DD-39 RNF-12: %j sin parte local reconocible se oculta completo',
    (texto) => {
      expect(enmascararCorreo(texto)).toBe('***');
    },
  );
});

describe('enmascararClabe', () => {
  it('DD-39 RNF-12: deja solo los últimos 4 dígitos (**************1234)', () => {
    expect(enmascararClabe('012180001234561234')).toBe('**************1234');
  });

  it.each(['12345', '0121800012345612345', 'abcdefghijklmnopqr', ''])(
    'DD-39 RNF-12: %j, que no es una CLABE de 18 dígitos, se oculta completa',
    (texto) => {
      expect(enmascararClabe(texto)).toBe('******************');
    },
  );
});
