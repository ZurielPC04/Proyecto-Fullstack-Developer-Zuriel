import type { EntityManager } from 'typeorm';
import { describe, expect, it } from 'vitest';
import {
  elegirProveedorOtp,
  ProveedorOtpNoConfigurado,
  ProveedorOtpSimulado,
  type ProveedorOtp,
} from '../../src/plataforma/otp/index.js';
import { RelojFijo, type Reloj } from '../../src/plataforma/reloj/index.js';

const SIN_TRANSACCION = {} as EntityManager;

describe('RelojFijo', () => {
  it('RNF-10 D-15: devuelve siempre el instante fijado por la prueba', async () => {
    const reloj: Reloj = new RelojFijo('2026-11-14 05:59:59.999999+00');
    await expect(reloj.ahora(SIN_TRANSACCION)).resolves.toBe('2026-11-14 05:59:59.999999+00');
    await expect(reloj.ahora(SIN_TRANSACCION)).resolves.toBe('2026-11-14 05:59:59.999999+00');
  });

  it('RNF-10 D-15: se puede mover para probar la medianoche', async () => {
    const reloj = new RelojFijo('2026-11-14 05:59:59.999999+00');
    reloj.fijar('2026-11-14 06:00:00+00');
    const puerto: Reloj = reloj;
    await expect(puerto.ahora(SIN_TRANSACCION)).resolves.toBe('2026-11-14 06:00:00+00');
  });
});

describe('elegirProveedorOtp', () => {
  it('R-6.17 D-07: con OTP_SIMULADO=true usa el simulado', () => {
    expect(elegirProveedorOtp({ OTP_SIMULADO: true })).toBeInstanceOf(ProveedorOtpSimulado);
  });

  it('R-6.17: con OTP_SIMULADO=false usa el no configurado, nunca el simulado', () => {
    expect(elegirProveedorOtp({ OTP_SIMULADO: false })).toBeInstanceOf(ProveedorOtpNoConfigurado);
  });
});

describe('ProveedorOtp', () => {
  it('R-6.17: el simulado devuelve el código en codigoSimulado', async () => {
    await expect(new ProveedorOtpSimulado().enviar('usuario-1', '004271')).resolves.toEqual({
      codigoSimulado: '004271',
    });
  });

  it('R-6.16 R-6.17: el no configurado lanza y su error no lleva el código', async () => {
    const proveedor: ProveedorOtp = new ProveedorOtpNoConfigurado();
    const error = await proveedor.enviar('usuario-1', '004271').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(
      JSON.stringify({ mensaje: (error as Error).message, ...(error as object) }),
    ).not.toContain('004271');
  });
});
