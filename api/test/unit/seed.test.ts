import { describe, expect, it } from 'vitest';
import { revisarEntornoSeed } from '../../src/scripts/seed/guarda.js';
import { evaluarVerificacion, type ReporteSeed } from '../../src/scripts/seed/verificacion.js';

const ENV = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://billetera_app:x@localhost:5433/billetera',
  DATABASE_URL_MIGRACIONES: 'postgresql://billetera_owner:x@localhost:5433/billetera',
  JWT_SECRETO: 'j'.repeat(32),
  OTP_HMAC_SECRETO: 'o'.repeat(32),
  LIMITE_DIARIO_CENTAVOS: '5000000',
  UMBRAL_CODIGO_CENTAVOS: '1000000',
  FONDEO_BIENVENIDA_CENTAVOS: '1000000',
  OTP_SIMULADO: 'true',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('revisarEntornoSeed (design.md §3.7, guarda)', () => {
  it('RNF-27: acepta el entorno de desarrollo y devuelve la configuración y la URL del dueño', () => {
    const resultado = revisarEntornoSeed(ENV);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.urlDueno).toBe(ENV.DATABASE_URL_MIGRACIONES);
      expect(resultado.config.DATABASE_URL).toBe(ENV.DATABASE_URL);
    }
  });

  it('RNF-27 DD-20: se niega con NODE_ENV=production aunque lo demás sea válido para producción', () => {
    const resultado = revisarEntornoSeed({
      ...ENV,
      NODE_ENV: 'production',
      OTP_SIMULADO: 'false',
      FONDEO_BIENVENIDA_CENTAVOS: '0',
      WEB_ORIGIN: 'https://billetera.example',
    });
    expect(resultado).toEqual({ ok: false, motivos: ['NODE_ENV=production'] });
  });

  it.each(['DATABASE_URL', 'DATABASE_URL_MIGRACIONES'] as const)(
    'RNF-27 §14.2: se niega si %s apunta a billetera_test',
    (variable) => {
      const url = ENV[variable].replace(/\/billetera$/, '/billetera_test');
      const resultado = revisarEntornoSeed({ ...ENV, [variable]: url });
      expect(resultado).toEqual({ ok: false, motivos: [`${variable} apunta a billetera_test`] });
    },
  );

  it('RNF-15: configuración inválida o sin DATABASE_URL_MIGRACIONES → solo los nombres, nunca los valores', () => {
    const resultado = revisarEntornoSeed({
      ...ENV,
      DATABASE_URL_MIGRACIONES: undefined,
      JWT_SECRETO: 'corto',
    });
    expect(resultado).toEqual({
      ok: false,
      motivos: ['variables inválidas: DATABASE_URL_MIGRACIONES, JWT_SECRETO'],
    });
    expect(JSON.stringify(resultado)).not.toContain('corto');
  });
});

const SANO: ReporteSeed = {
  asientos: 120_804,
  movimientosCuentaCaliente: 34_001,
  cuentasDescuadradas: [],
  sumaSaldos: 0,
};

describe('evaluarVerificacion (design.md §3.7, verificación final)', () => {
  it('RNF-07 RNF-14: sin fallas cuando cuadra y se alcanzan los umbrales', () => {
    expect(
      evaluarVerificacion(SANO, { asientosMinimos: 100_000, cuentaCalienteMinima: 30_000 }),
    ).toEqual([]);
  });

  it('RNF-07: una cuenta con saldo distinto de SUM(asientos) o SUM(saldo) distinto de 0 es falla', () => {
    const fallas = evaluarVerificacion(
      { ...SANO, cuentasDescuadradas: ['c-1'], sumaSaldos: 5 },
      { asientosMinimos: 0, cuentaCalienteMinima: null },
    );
    expect(fallas).toEqual([
      'saldo distinto de SUM(asientos) en 1 cuenta(s): c-1',
      'SUM(saldo) = 5, no 0',
    ]);
  });

  it('RNF-14: menos asientos o una cuenta caliente más chica que el umbral es falla', () => {
    const fallas = evaluarVerificacion(
      { ...SANO, asientos: 99_999, movimientosCuentaCaliente: 29_999 },
      { asientosMinimos: 100_000, cuentaCalienteMinima: 30_000 },
    );
    expect(fallas).toEqual([
      'asientos = 99999, se esperaban 100000 o más',
      'cuenta caliente con 29999 movimientos, se esperaban 30000 o más',
    ]);
  });

  it('RNF-14: si se exige cuenta caliente y no existe, es falla', () => {
    expect(
      evaluarVerificacion(
        { ...SANO, movimientosCuentaCaliente: null },
        { asientosMinimos: 0, cuentaCalienteMinima: 30_000 },
      ),
    ).toEqual(['no existe la cuenta caliente']);
  });
});
