import { describe, expect, it } from 'vitest';
import { esquemaBeneficiario } from '../src/esquemas/beneficiario.js';

// Code points explícitos: Prettier convierte los escapes \u en caracteres y las dos é se ven iguales.
const ACENTO = String.fromCodePoint(0x0301);
const E_PRECOMPUESTA = String.fromCodePoint(0x00e9);

const valido = { nombre: 'Ana Martínez', alias: 'Ana', clabe: '032180000118359719' };

function errores(entrada: unknown) {
  const r = esquemaBeneficiario.safeParse(entrada);
  return r.error?.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })) ?? [];
}

describe('esquemaBeneficiario', () => {
  it('R-3.1 acepta un beneficiario válido', () => {
    expect(esquemaBeneficiario.parse(valido)).toEqual(valido);
  });

  it('RNF-01 rechaza un campo desconocido', () => {
    expect(esquemaBeneficiario.safeParse({ ...valido, esCuentaPropia: true }).success).toBe(false);
  });

  it('R-3.1 DD-16 recorta y normaliza a NFC el nombre y el alias', () => {
    const r = esquemaBeneficiario.parse({
      ...valido,
      nombre: `  Jose${ACENTO} Pe${ACENTO}rez `,
      alias: ` Pepe${ACENTO} `,
    });
    expect(r.nombre).toBe(`Jos${E_PRECOMPUESTA} P${E_PRECOMPUESTA}rez`);
    expect(r.alias).toBe(`Pep${E_PRECOMPUESTA}`);
  });

  describe('nombre', () => {
    it('R-3.1 DD-16 acepta 1 y 100 caracteres, rechaza 101', () => {
      expect(esquemaBeneficiario.safeParse({ ...valido, nombre: 'A' }).success).toBe(true);
      expect(esquemaBeneficiario.safeParse({ ...valido, nombre: 'a'.repeat(100) }).success).toBe(
        true,
      );
      expect(errores({ ...valido, nombre: 'a'.repeat(101) }).map((e) => e.campo)).toEqual([
        'nombre',
      ]);
    });

    it.each([
      ['vacío', ''],
      ['solo espacios', '   '],
      // El carácter de control va en medio: al inicio o al final lo quitaría el trim.
      ['con salto de línea en medio', 'pago\nrenta'],
      ['con tabulador en medio', 'pago\trenta'],
    ])('R-3.1 DD-16 rechaza un nombre %s', (_, nombre) => {
      expect(errores({ ...valido, nombre }).map((e) => e.campo)).toEqual(['nombre']);
    });
  });

  describe('alias', () => {
    it('R-3.1 DD-16 acepta 40 caracteres y rechaza 41', () => {
      expect(esquemaBeneficiario.safeParse({ ...valido, alias: 'a'.repeat(40) }).success).toBe(
        true,
      );
      expect(errores({ ...valido, alias: 'a'.repeat(41) }).map((e) => e.campo)).toEqual(['alias']);
    });

    it('R-3.1 DD-16 cuenta los emojis en code points: 40 pasan y 41 fallan', () => {
      expect(esquemaBeneficiario.safeParse({ ...valido, alias: '😀'.repeat(40) }).success).toBe(
        true,
      );
      expect(errores({ ...valido, alias: '😀'.repeat(41) }).map((e) => e.campo)).toEqual(['alias']);
    });

    it.each([
      ['vacío', ''],
      ['solo espacios', '   '],
      ['con salto de línea en medio', 'pago\nrenta'],
      ['con tabulador en medio', 'pago\trenta'],
    ])('R-3.1 DD-16 rechaza un alias %s', (_, alias) => {
      expect(errores({ ...valido, alias }).map((e) => e.campo)).toEqual(['alias']);
    });
  });

  describe('clabe', () => {
    it('R-3.12 acepta la CLABE de Fondeo, con dígito verificador válido', () => {
      expect(
        esquemaBeneficiario.safeParse({ ...valido, clabe: '999000000000000001' }).success,
      ).toBe(true);
    });

    it.each([
      ['032180000118359718', 'El dígito verificador de la CLABE no es válido'],
      ['03218000011835971', 'La CLABE debe tener 18 dígitos'],
      ['0321800001183597190', 'La CLABE debe tener 18 dígitos'],
      ['03218000011835971a', 'La CLABE solo admite números'],
      ['032 180 000118359719', 'La CLABE solo admite números'],
    ])('R-3.3 R-3.4 rechaza %s con el mensaje de validarClabe', (clabe, mensaje) => {
      expect(errores({ ...valido, clabe })).toEqual([{ campo: 'clabe', mensaje }]);
    });
  });
});
