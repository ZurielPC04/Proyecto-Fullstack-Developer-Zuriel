import { describe, expect, it } from 'vitest';
import { cargarConfiguracion } from '../../src/config/index.js';

const JWT = 'j'.repeat(32);
const OTP = 'o'.repeat(32);

function entornoValido(): Record<string, string | undefined> {
  return {
    NODE_ENV: 'development',
    PORT: '3000',
    DATABASE_URL: 'postgresql://billetera_app:clave@localhost:5433/billetera',
    DB_POOL_MAX: '10',
    JWT_SECRETO: JWT,
    OTP_HMAC_SECRETO: OTP,
    LIMITE_DIARIO_CENTAVOS: '5000000',
    UMBRAL_CODIGO_CENTAVOS: '1000000',
    FONDEO_BIENVENIDA_CENTAVOS: '1000000',
    OTP_SIMULADO: 'true',
    DEMO_LATENCIA_MS: '0',
    WEB_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'info',
    TRUST_PROXY: '0',
  };
}

/** Aplica `cambios` sobre el entorno válido (undefined borra la variable) y devuelve el resultado. */
function cargarCon(cambios: Record<string, string | undefined>) {
  const env = { ...entornoValido(), ...cambios };
  for (const [nombre, valor] of Object.entries(cambios))
    if (valor === undefined) delete env[nombre];
  return cargarConfiguracion(env);
}

describe('cargarConfiguracion', () => {
  it('RNF-15: una configuración válida completa pasa con los tipos convertidos', () => {
    expect(cargarConfiguracion(entornoValido())).toEqual({
      ok: true,
      config: {
        NODE_ENV: 'development',
        PORT: 3000,
        DATABASE_URL: 'postgresql://billetera_app:clave@localhost:5433/billetera',
        DB_POOL_MAX: 10,
        JWT_SECRETO: JWT,
        OTP_HMAC_SECRETO: OTP,
        LIMITE_DIARIO_CENTAVOS: 5_000_000,
        UMBRAL_CODIGO_CENTAVOS: 1_000_000,
        FONDEO_BIENVENIDA_CENTAVOS: 1_000_000,
        OTP_SIMULADO: true,
        DEMO_LATENCIA_MS: 0,
        WEB_ORIGIN: 'http://localhost:5173',
        LOG_LEVEL: 'info',
        TRUST_PROXY: 0,
      },
    });
  });

  it.each([
    ['igual al', '5000000'],
    ['mayor que el', '5000001'],
  ])('RNF-15: UMBRAL_CODIGO_CENTAVOS %s límite falla y reporta el umbral', (_caso, umbral) => {
    expect(cargarCon({ UMBRAL_CODIGO_CENTAVOS: umbral })).toEqual({
      ok: false,
      variablesInvalidas: ['UMBRAL_CODIGO_CENTAVOS'],
    });
  });

  it.each(['1.5', '1e6', ' 10', '', '-1', '010', '0x10'])(
    'RNF-15: el entero %j en TRUST_PROXY falla (sin z.coerce)',
    (valor) => {
      expect(cargarCon({ TRUST_PROXY: valor })).toEqual({
        ok: false,
        variablesInvalidas: ['TRUST_PROXY'],
      });
    },
  );

  it('RNF-15: 9007199254740992 (2^53) falla por no ser entero seguro', () => {
    expect(cargarCon({ TRUST_PROXY: '9007199254740992' })).toEqual({
      ok: false,
      variablesInvalidas: ['TRUST_PROXY'],
    });
  });

  it.each([
    ['PORT', '0'],
    ['PORT', '65536'],
    ['LIMITE_DIARIO_CENTAVOS', '0'],
    ['UMBRAL_CODIGO_CENTAVOS', '0'],
    ['DB_POOL_MAX', '0'],
    ['DB_POOL_MAX', '51'],
    ['DEMO_LATENCIA_MS', '30001'],
  ])('RNF-15: %s=%s fuera de su rango falla', (variable, valor) => {
    expect(cargarCon({ [variable]: valor })).toEqual({ ok: false, variablesInvalidas: [variable] });
  });

  it.each([
    ['PORT', '1', 1],
    ['PORT', '65535', 65535],
    ['DB_POOL_MAX', '1', 1],
    ['DB_POOL_MAX', '50', 50],
    ['DEMO_LATENCIA_MS', '30000', 30000],
    ['FONDEO_BIENVENIDA_CENTAVOS', '0', 0],
    ['UMBRAL_CODIGO_CENTAVOS', '4999999', 4999999],
  ] as const)('RNF-15: %s=%s en el borde de su rango pasa', (variable, valor, esperado) => {
    const resultado = cargarCon({ [variable]: valor });
    expect(resultado.ok && resultado.config[variable]).toBe(esperado);
  });

  it.each(['1', 'TRUE', 'yes', '0', 'False', ''])(
    'RNF-15: OTP_SIMULADO=%j falla; solo true o false',
    (valor) => {
      expect(cargarCon({ OTP_SIMULADO: valor })).toEqual({
        ok: false,
        variablesInvalidas: ['OTP_SIMULADO'],
      });
    },
  );

  it('RNF-15: OTP_SIMULADO=false se lee como false', () => {
    const resultado = cargarCon({ OTP_SIMULADO: 'false' });
    expect(resultado.ok && resultado.config.OTP_SIMULADO).toBe(false);
  });

  describe('en producción', () => {
    const produccion = {
      NODE_ENV: 'production',
      OTP_SIMULADO: 'false',
      DEMO_LATENCIA_MS: '0',
      FONDEO_BIENVENIDA_CENTAVOS: '0',
      WEB_ORIGIN: 'https://billetera.example',
    };

    it('RNF-15 R-6.17: una configuración de producción correcta pasa', () => {
      expect(cargarCon(produccion).ok).toBe(true);
    });

    it.each([
      ['OTP_SIMULADO', 'true'],
      ['DEMO_LATENCIA_MS', '1'],
      ['FONDEO_BIENVENIDA_CENTAVOS', '1'],
      ['WEB_ORIGIN', 'http://billetera.example'],
    ])('RNF-15 R-6.17: %s=%s falla por sí sola y la reporta', (variable, valor) => {
      expect(cargarCon({ ...produccion, [variable]: valor })).toEqual({
        ok: false,
        variablesInvalidas: [variable],
      });
    });
  });

  describe('secretos', () => {
    it('RNF-15: OTP_HMAC_SECRETO igual a JWT_SECRETO falla y reporta OTP_HMAC_SECRETO', () => {
      expect(cargarCon({ OTP_HMAC_SECRETO: JWT })).toEqual({
        ok: false,
        variablesInvalidas: ['OTP_HMAC_SECRETO'],
      });
    });

    it.each(['JWT_SECRETO', 'OTP_HMAC_SECRETO'])('RNF-15: %s de 31 bytes falla', (variable) => {
      expect(cargarCon({ [variable]: 's'.repeat(31) })).toEqual({
        ok: false,
        variablesInvalidas: [variable],
      });
    });

    it.each(['JWT_SECRETO', 'OTP_HMAC_SECRETO'])('RNF-15: %s de 32 bytes pasa', (variable) => {
      expect(cargarCon({ [variable]: 's'.repeat(32) }).ok).toBe(true);
    });

    it('RNF-15: 16 caracteres de 2 bytes ("ñ") suman 32 bytes y pasan', () => {
      const secreto = 'ñ'.repeat(16);
      expect(secreto.length).toBe(16);
      expect(cargarCon({ JWT_SECRETO: secreto }).ok).toBe(true);
    });

    it('RNF-15: 15 caracteres de 2 bytes ("ñ") suman 30 bytes y fallan', () => {
      expect(cargarCon({ JWT_SECRETO: 'ñ'.repeat(15) })).toEqual({
        ok: false,
        variablesInvalidas: ['JWT_SECRETO'],
      });
    });
  });

  it.each([
    'http://localhost:5173/',
    'http://localhost:5173/app',
    'http://localhost:5173?x=1',
    'http://localhost:5173#x',
    'ftp://localhost:5173',
    'localhost:5173',
    '',
  ])('RNF-15: WEB_ORIGIN=%j no es solo un origen http(s) y falla', (valor) => {
    expect(cargarCon({ WEB_ORIGIN: valor })).toEqual({
      ok: false,
      variablesInvalidas: ['WEB_ORIGIN'],
    });
  });

  it.each(['mysql://u:p@localhost/billetera', 'no es una url', ''])(
    'RNF-15: DATABASE_URL=%j sin protocolo postgres falla',
    (valor) => {
      expect(cargarCon({ DATABASE_URL: valor })).toEqual({
        ok: false,
        variablesInvalidas: ['DATABASE_URL'],
      });
    },
  );

  it('RNF-15: DATABASE_URL con protocolo postgres: también pasa', () => {
    expect(cargarCon({ DATABASE_URL: 'postgres://billetera_app:clave@db:5432/billetera' }).ok).toBe(
      true,
    );
  });

  it.each(['verbose', 'INFO', ''])('RNF-15: LOG_LEVEL=%j falla', (valor) => {
    expect(cargarCon({ LOG_LEVEL: valor })).toEqual({
      ok: false,
      variablesInvalidas: ['LOG_LEVEL'],
    });
  });

  it.each([
    'NODE_ENV',
    'DATABASE_URL',
    'JWT_SECRETO',
    'OTP_HMAC_SECRETO',
    'LIMITE_DIARIO_CENTAVOS',
    'UMBRAL_CODIGO_CENTAVOS',
    'FONDEO_BIENVENIDA_CENTAVOS',
    'OTP_SIMULADO',
    'WEB_ORIGIN',
  ])('RNF-15: si falta la obligatoria %s, falla con su nombre', (variable) => {
    expect(cargarCon({ [variable]: undefined })).toEqual({
      ok: false,
      variablesInvalidas: [variable],
    });
  });

  it('RNF-15: sin PORT, DB_POOL_MAX, DEMO_LATENCIA_MS, LOG_LEVEL ni TRUST_PROXY usa los defaults de §2.4', () => {
    const resultado = cargarCon({
      PORT: undefined,
      DB_POOL_MAX: undefined,
      DEMO_LATENCIA_MS: undefined,
      LOG_LEVEL: undefined,
      TRUST_PROXY: undefined,
    });
    expect(resultado.ok && resultado.config).toMatchObject({
      PORT: 3000,
      DB_POOL_MAX: 10,
      DEMO_LATENCIA_MS: 0,
      LOG_LEVEL: 'info',
      TRUST_PROXY: 0,
    });
  });

  it('RNF-15: un entorno vacío reporta todas las obligatorias, sin repetidos y en orden', () => {
    expect(cargarConfiguracion({})).toEqual({
      ok: false,
      variablesInvalidas: [
        'DATABASE_URL',
        'FONDEO_BIENVENIDA_CENTAVOS',
        'JWT_SECRETO',
        'LIMITE_DIARIO_CENTAVOS',
        'NODE_ENV',
        'OTP_HMAC_SECRETO',
        'OTP_SIMULADO',
        'UMBRAL_CODIGO_CENTAVOS',
        'WEB_ORIGIN',
      ],
    });
  });

  it('RNF-15: una variable con varios problemas aparece una sola vez', () => {
    // "ftp://x/" rompe dos reglas de WEB_ORIGIN (protocolo y origen): Zod da dos issues, un solo nombre.
    expect(cargarCon({ WEB_ORIGIN: 'ftp://x/', NODE_ENV: 'prod' })).toEqual({
      ok: false,
      variablesInvalidas: ['NODE_ENV', 'WEB_ORIGIN'],
    });
  });

  it('RNF-15: DATABASE_URL_MIGRACIONES y las variables ajenas no entran en config', () => {
    const resultado = cargarCon({
      DATABASE_URL_MIGRACIONES: 'postgresql://billetera_owner:clave@localhost:5433/billetera',
      PATH: '/usr/bin',
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.ok && Object.keys(resultado.config)).not.toContain('DATABASE_URL_MIGRACIONES');
    expect(resultado.ok && Object.keys(resultado.config)).not.toContain('PATH');
  });

  it.each(['JWT_SECRETO', 'OTP_HMAC_SECRETO'])(
    'RNF-15: el valor inválido de %s no sale en el resultado serializado',
    (variable) => {
      const resultado = cargarCon({
        [variable]: 'SECRETO-QUE-NO-DEBE-SALIR',
        PORT: 'SECRETO-QUE-NO-DEBE-SALIR',
      });
      expect(resultado.ok).toBe(false);
      expect(JSON.stringify(resultado)).not.toContain('SECRETO-QUE-NO-DEBE-SALIR');
    },
  );

  it('RNF-15: 9007199254740991 (2^53 − 1) sí es entero seguro', () => {
    const resultado = cargarCon({ TRUST_PROXY: '9007199254740991' });
    expect(resultado.ok && resultado.config.TRUST_PROXY).toBe(9007199254740991);
  });
});
