import { describe, expect, it } from 'vitest';
import {
  esquemaConfirmacion,
  esquemaIdempotencyKey,
  esquemaTransferencia,
} from '../src/esquemas/transferencia.js';

const ORIGEN = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const BENEFICIARIO = '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d';
const CUENTA = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
// Cuenta Fondeo (§3.2): no es un UUID RFC 9562 (versión 0), pero sí cumple format: uuid (§6.7).
const FONDEO = '00000000-0000-0000-0000-000000000001';
const ACENTO = String.fromCodePoint(0x0301);
const E_PRECOMPUESTA = String.fromCodePoint(0x00e9);

// §6.7: casos que no cumplen 8-4-4-4-12 hexadecimal.
const UUID_INVALIDOS = [
  ['"no-es-uuid"', 'no-es-uuid'],
  ['sin guiones', ORIGEN.replaceAll('-', '')],
  ['de 35 caracteres', ORIGEN.slice(0, -1)],
] as const;

const valido = {
  cuentaOrigenId: ORIGEN,
  destino: { tipo: 'BENEFICIARIO' as const, beneficiarioId: BENEFICIARIO },
  montoCentavos: 12345,
  concepto: 'Renta',
  referencia: '1234567',
};

function sin(objeto: object, campo: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(objeto).filter(([clave]) => clave !== campo));
}

function campos(entrada: unknown) {
  const r = esquemaTransferencia.safeParse(entrada);
  return r.error?.issues.map((i) => i.path.join('.')) ?? [];
}

describe('esquemaTransferencia', () => {
  it('R-4.1 DD-26 acepta un destino BENEFICIARIO', () => {
    expect(esquemaTransferencia.parse(valido)).toEqual(valido);
  });

  it('R-4.6 DD-26 acepta un destino CUENTA_PROPIA', () => {
    const entrada = { ...valido, destino: { tipo: 'CUENTA_PROPIA' as const, cuentaId: CUENTA } };
    expect(esquemaTransferencia.parse(entrada)).toEqual(entrada);
  });

  it('R-4.14 §6.2 los uuid salen en minúsculas', () => {
    const r = esquemaTransferencia.parse({
      ...valido,
      cuentaOrigenId: ORIGEN.toUpperCase(),
      destino: { tipo: 'BENEFICIARIO', beneficiarioId: BENEFICIARIO.toUpperCase() },
    });
    expect(r.cuentaOrigenId).toBe(ORIGEN);
    expect(r.destino).toEqual({ tipo: 'BENEFICIARIO', beneficiarioId: BENEFICIARIO });

    const propia = esquemaTransferencia.parse({
      ...valido,
      destino: { tipo: 'CUENTA_PROPIA', cuentaId: CUENTA.toUpperCase() },
    });
    expect(propia.destino).toEqual({ tipo: 'CUENTA_PROPIA', cuentaId: CUENTA });
  });

  it('RNF-18 §6.7 acepta el id de Fondeo, sin exigir versión de UUID', () => {
    expect(esquemaTransferencia.parse({ ...valido, cuentaOrigenId: FONDEO }).cuentaOrigenId).toBe(
      FONDEO,
    );
    const destino = { tipo: 'CUENTA_PROPIA' as const, cuentaId: FONDEO };
    expect(esquemaTransferencia.parse({ ...valido, destino }).destino).toEqual(destino);
  });

  it.each(UUID_INVALIDOS)(
    'RNF-01 §6.7 rechaza un uuid %s en cuentaOrigenId',
    (_, cuentaOrigenId) => {
      expect(campos({ ...valido, cuentaOrigenId })).toEqual(['cuentaOrigenId']);
    },
  );

  it.each(UUID_INVALIDOS)('RNF-01 §6.7 rechaza un uuid %s en destino.cuentaId', (_, cuentaId) => {
    expect(campos({ ...valido, destino: { tipo: 'CUENTA_PROPIA', cuentaId } })).toEqual([
      'destino.cuentaId',
    ]);
  });

  describe('campos desconocidos', () => {
    it('RNF-01 rechaza un campo desconocido en el cuerpo', () => {
      expect(esquemaTransferencia.safeParse({ ...valido, tipo: 'TERCERO' }).success).toBe(false);
    });

    it('RNF-01 DD-26 rechaza un campo desconocido en el destino BENEFICIARIO', () => {
      const destino = { tipo: 'BENEFICIARIO', beneficiarioId: BENEFICIARIO, cuentaId: CUENTA };
      expect(esquemaTransferencia.safeParse({ ...valido, destino }).success).toBe(false);
    });

    it('RNF-01 DD-26 rechaza un campo desconocido en el destino CUENTA_PROPIA', () => {
      const destino = { tipo: 'CUENTA_PROPIA', cuentaId: CUENTA, alias: 'Ahorro' };
      expect(esquemaTransferencia.safeParse({ ...valido, destino }).success).toBe(false);
    });
  });

  describe('destino', () => {
    it.each([
      ['un tipo desconocido', { tipo: 'CLABE', clabe: '032180000118359719' }],
      ['BENEFICIARIO sin beneficiarioId', { tipo: 'BENEFICIARIO' }],
      ['BENEFICIARIO con cuentaId', { tipo: 'BENEFICIARIO', cuentaId: CUENTA }],
      ['CUENTA_PROPIA con beneficiarioId', { tipo: 'CUENTA_PROPIA', beneficiarioId: BENEFICIARIO }],
      ['sin tipo', { beneficiarioId: BENEFICIARIO }],
    ])('R-4.6 DD-26 rechaza %s', (_, destino) => {
      expect(esquemaTransferencia.safeParse({ ...valido, destino }).success).toBe(false);
    });
  });

  describe('montoCentavos', () => {
    it.each([1, 100_000_000_000])('R-4.8 acepta %d', (montoCentavos) => {
      expect(esquemaTransferencia.parse({ ...valido, montoCentavos }).montoCentavos).toBe(
        montoCentavos,
      );
    });

    it.each([
      ['1.5', 1.5],
      ['0', 0],
      ['-1', -1],
      ['100000000001', 100_000_000_001],
      ['"100" como texto', '100'],
      ['NaN', NaN],
      ['Infinity', Infinity],
    ])('R-4.8 R-4.35 rechaza %s', (_, montoCentavos) => {
      expect(campos({ ...valido, montoCentavos })).toEqual(['montoCentavos']);
    });
  });

  describe('concepto', () => {
    it('R-4.9 DD-16 acepta 40 caracteres y rechaza 41', () => {
      expect(esquemaTransferencia.safeParse({ ...valido, concepto: 'c'.repeat(40) }).success).toBe(
        true,
      );
      expect(campos({ ...valido, concepto: 'c'.repeat(41) })).toEqual(['concepto']);
    });

    it('R-4.9 DD-16 recorta y normaliza a NFC', () => {
      const concepto = ` Cafe${ACENTO} `;
      expect(esquemaTransferencia.parse({ ...valido, concepto }).concepto).toBe(
        `Caf${E_PRECOMPUESTA}`,
      );
    });

    // El carácter de control va en medio: al inicio o al final lo quitaría el trim.
    it.each([
      ['vacío', ''],
      ['solo espacios', '   '],
      ['con salto de línea en medio', 'pago\nrenta'],
      ['con tabulador en medio', 'pago\trenta'],
    ])('R-4.9 DD-16 rechaza un concepto %s', (_, concepto) => {
      expect(campos({ ...valido, concepto })).toEqual(['concepto']);
    });

    it('R-4.9 rechaza la petición sin concepto', () => {
      expect(campos(sin(valido, 'concepto'))).toEqual(['concepto']);
    });
  });

  describe('referencia', () => {
    it.each(['1', '0012345'])('R-4.9 DD-16 acepta %s y conserva los ceros', (referencia) => {
      expect(esquemaTransferencia.parse({ ...valido, referencia }).referencia).toBe(referencia);
    });

    it.each([
      ['"12a"', '12a'],
      ['8 dígitos', '12345678'],
      ['vacía', ''],
      ['con espacios', ' 123 '],
      ['un número JSON', 123],
    ])('R-4.9 DD-16 rechaza %s', (_, referencia) => {
      expect(campos({ ...valido, referencia })).toEqual(['referencia']);
    });

    it('R-4.9 DD-12 la referencia es obligatoria', () => {
      expect(campos(sin(valido, 'referencia'))).toEqual(['referencia']);
    });
  });
});

describe('esquemaConfirmacion', () => {
  it('R-6.8 RNF-01 acepta un código de 6 dígitos', () => {
    expect(esquemaConfirmacion.parse({ codigo: '012345' })).toEqual({ codigo: '012345' });
  });

  it.each([
    ['5 dígitos', '12345'],
    ['7 dígitos', '1234567'],
    ['letras', '12345a'],
    ['un número JSON', 123456],
  ])('R-6.8 RNF-01 rechaza un código con %s', (_, codigo) => {
    const r = esquemaConfirmacion.safeParse({ codigo });
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(['codigo']);
  });

  it('RNF-01 rechaza un campo desconocido', () => {
    expect(esquemaConfirmacion.safeParse({ codigo: '123456', intento: 1 }).success).toBe(false);
  });
});

describe('esquemaIdempotencyKey', () => {
  const LLAVE = '9b2f6c1e-3d4a-4f5b-8e7c-6d5a4b3c2d1e';

  it('R-4.13 acepta un UUID', () => {
    expect(esquemaIdempotencyKey.parse(LLAVE)).toBe(LLAVE);
  });

  it('R-4.13 §6.2 un UUID en mayúsculas sale en minúsculas', () => {
    expect(esquemaIdempotencyKey.parse(LLAVE.toUpperCase())).toBe(LLAVE);
  });

  it('R-4.13 §6.7 acepta una llave sin versión de UUID, como el id de Fondeo', () => {
    expect(esquemaIdempotencyKey.parse(FONDEO)).toBe(FONDEO);
  });

  it.each<readonly [string, string | undefined]>([
    ...UUID_INVALIDOS,
    ['vacía', ''],
    ['ausente', undefined],
  ])('R-4.13 §6.7 rechaza una llave %s', (_, llave) => {
    expect(esquemaIdempotencyKey.safeParse(llave).success).toBe(false);
  });
});
