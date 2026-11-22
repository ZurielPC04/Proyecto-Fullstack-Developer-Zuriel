import { pino } from 'pino';
import type { DataSource } from 'typeorm';
import { expect, it, vi } from 'vitest';
import { arrancar } from '../../src/arranque.js';

// argon2 simulado y lento: registra cuándo termina el hash para comparar con listen.
const registro = vi.hoisted(() => ({ llamadas: [] as string[] }));
vi.mock('../../src/plataforma/seguridad/contrasenas.js', () => ({
  contrasenasArgon2: {
    hash: async () => {
      await new Promise((resolver) => setTimeout(resolver, 20));
      registro.llamadas.push('hash-ficticio');
      return '$argon2id$simulado';
    },
    verificar: async () => false,
  },
}));

it('R-1.7 RNF-23: arrancar escucha solo después de que el hash ficticio del login terminó', async () => {
  await arrancar({
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://billetera_app:clave@localhost:5433/billetera_test',
      JWT_SECRETO: 'j'.repeat(32),
      OTP_HMAC_SECRETO: 'o'.repeat(32),
      LIMITE_DIARIO_CENTAVOS: '5000000',
      UMBRAL_CODIGO_CENTAVOS: '1000000',
      FONDEO_BIENVENIDA_CENTAVOS: '0',
      OTP_SIMULADO: 'true',
      WEB_ORIGIN: 'http://localhost:5173',
    },
    logger: pino({ level: 'silent' }),
    proceso: {},
    conectarBase: async () => {
      registro.llamadas.push('conectarBase');
      return { dataSource: {} as DataSource, verificarBase: async () => {} };
    },
    escuchar: async () => {
      registro.llamadas.push('escuchar');
    },
  });

  expect(registro.llamadas).toEqual(['conectarBase', 'hash-ficticio', 'escuchar']);
});
