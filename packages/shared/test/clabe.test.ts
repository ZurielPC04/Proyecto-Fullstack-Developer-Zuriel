import { describe, expect, it } from 'vitest';
import { digitoVerificador, validarClabe } from '../src/clabe.js';

describe('digitoVerificador', () => {
  it('R-3.4 D-19 aplica pesos 3-7-1 con cada producto módulo 10', () => {
    // Productos módulo 10: 0,1,2,3,6,0,0,0,0,3,7,8,9,5,9,1,7 → suma 61 → (10 - 1) % 10 = 9.
    expect(digitoVerificador('03218000011835971')).toBe(9);
  });

  it('R-3.4 D-19 el dígito es 0 y no 10 cuando la suma ponderada termina en 0', () => {
    // Productos módulo 10: 7,3,9,3,6,0,2 y ceros → suma 30 → (10 - 0) % 10 = 0.
    expect(digitoVerificador('99918040000000000')).toBe(0);
  });

  it('R-3.12 DD-19 los primeros 17 dígitos de Fondeo dan el dígito 1', () => {
    // design.md §3.6: 7 + 3 + 9 = 19 → (10 - 9) % 10 = 1.
    expect(digitoVerificador('99900000000000000')).toBe(1);
  });

  it.each(['0321800001183597', '032180000118359719', '0321800001183597a'])(
    'D-19 lanza RangeError si no recibe 17 dígitos: "%s"',
    (entrada) => {
      expect(() => digitoVerificador(entrada)).toThrow(RangeError);
    },
  );
});

describe('validarClabe', () => {
  it('R-3.12 DD-19 la CLABE de Fondeo 999000000000000001 es válida', () => {
    expect(validarClabe('999000000000000001')).toEqual({ ok: true, clabe: '999000000000000001' });
  });

  it.each(['03218000011835971a', '032 180 000118359719', 'abc'])(
    'R-3.2 R-3.3 rechaza caracteres no numéricos: "%s"',
    (texto) => {
      expect(validarClabe(texto)).toEqual({ ok: false, error: 'La CLABE solo admite números' });
    },
  );

  it.each([
    ['17 dígitos', '03218000011835971'],
    ['19 dígitos', '0321800001183597190'],
    ['vacío', ''],
  ])('R-3.2 R-3.3 rechaza una longitud distinta de 18 (%s)', (_caso, texto) => {
    expect(validarClabe(texto)).toEqual({ ok: false, error: 'La CLABE debe tener 18 dígitos' });
  });

  it('R-3.2 reporta primero los caracteres no numéricos aunque también falle la longitud', () => {
    expect(validarClabe('12345a')).toEqual({ ok: false, error: 'La CLABE solo admite números' });
  });

  it.each(['032180000118359718', '999000000000000000'])(
    'R-3.2 R-3.4 rechaza un dígito verificador incorrecto: "%s"',
    (texto) => {
      expect(validarClabe(texto)).toEqual({
        ok: false,
        error: 'El dígito verificador de la CLABE no es válido',
      });
    },
  );

  it.each(['032180000118359719', '999180400000000000'])(
    'R-3.4 acepta una CLABE con dígito verificador correcto: "%s"',
    (texto) => {
      expect(validarClabe(texto)).toEqual({ ok: true, clabe: texto });
    },
  );

  it('R-3.2 reporta la longitud antes que el dígito verificador', () => {
    // Una CLABE válida con un dígito de más: el fallo es de longitud, no de dígito.
    expect(validarClabe('0321800001183597190')).toEqual({
      ok: false,
      error: 'La CLABE debe tener 18 dígitos',
    });
  });
});
