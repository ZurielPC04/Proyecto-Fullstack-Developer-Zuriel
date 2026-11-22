import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  clasificar,
  decidir,
  hashPeticion,
} from '../../src/modulos/transferencias/transferencias.dominio.js';

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
  const base = { tipo: 'TERCERO' as const, montoCentavos: 100, saldoOrigenCentavos: 100 };

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
