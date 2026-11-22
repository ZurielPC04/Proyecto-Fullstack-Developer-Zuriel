import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  clasificar,
  codigoCoincide,
  codigoHmac,
  codigoVencido,
  decidir,
  hashPeticion,
} from '../../src/modulos/transferencias/transferencias.dominio.js';

describe('transferencias.dominio · código (§6.5)', () => {
  const ID = '0b6f1f8e-4f0c-4b8e-9a51-7d0e0f6a2c11';
  const SECRETO = 's'.repeat(32);

  it('DD-33 R-6.16 el HMAC es SHA-256 hexadecimal de "transferenciaId:codigo" con el secreto', () => {
    const esperado = createHmac('sha256', SECRETO).update(`${ID}:004217`).digest('hex');
    expect(codigoHmac(SECRETO, ID, '004217')).toBe(esperado);
  });

  it('DD-33 el mismo código en otra transferencia da otro HMAC', () => {
    const otro = '9b6f1f8e-4f0c-4b8e-9a51-7d0e0f6a2c11';
    expect(codigoHmac(SECRETO, ID, '004217')).not.toBe(codigoHmac(SECRETO, otro, '004217'));
  });

  it('R-6.16 codigoCoincide acepta el HMAC igual y rechaza uno distinto o de otra longitud', () => {
    const guardado = codigoHmac(SECRETO, ID, '004217');
    expect(codigoCoincide(guardado, codigoHmac(SECRETO, ID, '004217'))).toBe(true);
    expect(codigoCoincide(guardado, codigoHmac(SECRETO, ID, '004218'))).toBe(false);
    expect(codigoCoincide(guardado, 'abcd')).toBe(false);
  });

  it('R-6.12 el código vence cuando expira_en <= ahora', () => {
    const expira = '2026-12-01 18:05:00+00';
    expect(codigoVencido(expira, '2026-12-01 18:04:59.999999+00')).toBe(false);
    expect(codigoVencido(expira, '2026-12-01 18:05:00+00')).toBe(true);
    expect(codigoVencido(expira, '2026-12-01 18:05:00.000001+00')).toBe(true);
  });
});

const USUARIO = '11111111-1111-4111-8111-111111111111';
const OTRO = '22222222-2222-4222-8222-222222222222';

describe('transferencias.dominio · clasificar', () => {
  it('R-4.2 TRASPASO si el dueño real del destino es el usuario', () => {
    expect(clasificar(USUARIO, USUARIO)).toBe('TRASPASO');
  });

  it('R-4.2 TERCERO si el dueño real del destino es otro usuario', () => {
    expect(clasificar(USUARIO, OTRO)).toBe('TERCERO');
  });
});

describe('transferencias.dominio · decidir', () => {
  const base = {
    tipo: 'TERCERO' as const,
    montoCentavos: 100,
    saldoOrigenCentavos: 100,
    consumidoCentavos: 0,
    limiteCentavos: 5_000_000,
    umbralCentavos: 1_000_000 as number | null,
  };

  it('R-6.8 a tercero exactamente en el umbral no pide código', () => {
    expect(decidir({ ...base, montoCentavos: 1_000_000, saldoOrigenCentavos: 2_000_000 })).toEqual({
      estado: 'APLICADA',
    });
  });

  it('R-6.8 a tercero un centavo sobre el umbral queda pendiente de código', () => {
    expect(decidir({ ...base, montoCentavos: 1_000_001, saldoOrigenCentavos: 2_000_000 })).toEqual({
      estado: 'PENDIENTE_CONFIRMACION',
    });
  });

  it('R-6.9 un traspaso sobre el umbral no pide código', () => {
    expect(
      decidir({
        ...base,
        tipo: 'TRASPASO',
        montoCentavos: 3_000_000,
        saldoOrigenCentavos: 3_000_000,
      }),
    ).toEqual({ estado: 'APLICADA' });
  });

  it('DD-31 sobre el umbral pero sin límite: se rechaza por límite y no se pide código', () => {
    expect(
      decidir({
        ...base,
        montoCentavos: 1_500_000,
        saldoOrigenCentavos: 9_000_000,
        consumidoCentavos: 4_000_000,
      }),
    ).toEqual({ estado: 'RECHAZADA', motivo: 'LIMITE_DIARIO_EXCEDIDO' });
  });

  it('R-6.10 al confirmar (umbral nulo) se aplica aunque supere el umbral', () => {
    expect(
      decidir({
        ...base,
        montoCentavos: 1_500_000,
        saldoOrigenCentavos: 2_000_000,
        umbralCentavos: null,
      }),
    ).toEqual({ estado: 'APLICADA' });
  });

  it('R-6.1 consumido + monto igual al límite se aplica', () => {
    expect(
      decidir({
        ...base,
        montoCentavos: 1_000_000,
        saldoOrigenCentavos: 9_000_000,
        consumidoCentavos: 4_000_000,
      }),
    ).toEqual({ estado: 'APLICADA' });
  });

  it('R-6.2 un centavo sobre el límite se rechaza por LIMITE_DIARIO_EXCEDIDO', () => {
    expect(
      decidir({
        ...base,
        montoCentavos: 1_000_001,
        saldoOrigenCentavos: 9_000_000,
        consumidoCentavos: 4_000_000,
      }),
    ).toEqual({ estado: 'RECHAZADA', motivo: 'LIMITE_DIARIO_EXCEDIDO' });
  });

  it('R-6.3 R-4.5 un traspaso no se evalúa contra el límite', () => {
    expect(
      decidir({
        ...base,
        tipo: 'TRASPASO',
        montoCentavos: 9_000_000,
        saldoOrigenCentavos: 9_000_000,
        consumidoCentavos: 5_000_000,
      }),
    ).toEqual({ estado: 'APLICADA' });
  });

  it('DD-31 si fallan saldo y límite a la vez, el motivo es SALDO_INSUFICIENTE', () => {
    expect(
      decidir({
        ...base,
        montoCentavos: 2_000_000,
        saldoOrigenCentavos: 10,
        consumidoCentavos: 4_000_000,
      }),
    ).toEqual({ estado: 'RECHAZADA', motivo: 'SALDO_INSUFICIENTE' });
  });

  it('R-4.1 con saldo exacto se aplica', () => {
    expect(decidir(base)).toEqual({ estado: 'APLICADA' });
  });

  it('R-4.3 un centavo más que el saldo se rechaza por SALDO_INSUFICIENTE', () => {
    expect(decidir({ ...base, montoCentavos: 101 })).toEqual({
      estado: 'RECHAZADA',
      motivo: 'SALDO_INSUFICIENTE',
    });
  });

  it('R-4.5 un traspaso sin saldo también se rechaza por saldo', () => {
    expect(decidir({ ...base, tipo: 'TRASPASO', saldoOrigenCentavos: 0 })).toEqual({
      estado: 'RECHAZADA',
      motivo: 'SALDO_INSUFICIENTE',
    });
  });
});

describe('transferencias.dominio · hashPeticion (§6.2)', () => {
  const solicitud = {
    cuentaOrigenId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    destino: { tipo: 'CUENTA_PROPIA' as const, cuentaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    montoCentavos: 150,
    concepto: 'Renta',
    referencia: '0012',
  };

  it('D-03 es el SHA-256 hexadecimal del arreglo canónico con prefijo v1', () => {
    // Texto escrito a mano con la forma de §6.2; no se arma con el código bajo prueba.
    const canonico =
      '["v1","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","CUENTA_PROPIA","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",150,"Renta","0012"]';
    expect(hashPeticion(solicitud)).toBe(createHash('sha256').update(canonico).digest('hex'));
  });

  it('D-03 con beneficiario usa beneficiarioId y el orden de las claves no importa', () => {
    const canonico =
      '["v1","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","BENEFICIARIO","cccccccc-cccc-4ccc-8ccc-cccccccccccc",150,"Renta","0012"]';
    const desordenada = {
      referencia: '0012',
      concepto: 'Renta',
      montoCentavos: 150,
      destino: {
        beneficiarioId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        tipo: 'BENEFICIARIO' as const,
      },
      cuentaOrigenId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    expect(hashPeticion(desordenada)).toBe(createHash('sha256').update(canonico).digest('hex'));
  });

  it('D-03 un cambio en cualquier campo cambia el hash', () => {
    const original = hashPeticion(solicitud);
    expect(hashPeticion({ ...solicitud, montoCentavos: 151 })).not.toBe(original);
    expect(hashPeticion({ ...solicitud, referencia: '12' })).not.toBe(original);
  });
});
