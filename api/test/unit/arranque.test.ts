import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { arrancar } from '../../src/arranque.js';

const SECRETO = 'SECRETO-QUE-NO-DEBE-SALIR';

function entornoValido(): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    PORT: '4321',
    DATABASE_URL: 'postgresql://billetera_app:clave@localhost:5433/billetera_test',
    JWT_SECRETO: 'j'.repeat(32),
    OTP_HMAC_SECRETO: 'o'.repeat(32),
    LIMITE_DIARIO_CENTAVOS: '5000000',
    UMBRAL_CODIGO_CENTAVOS: '1000000',
    FONDEO_BIENVENIDA_CENTAVOS: '0',
    OTP_SIMULADO: 'true',
    WEB_ORIGIN: 'http://localhost:5173',
  };
}

/** Dobles de las dependencias: un pino real que escribe en memoria, base y servidor falsos. */
function dobles(env: Record<string, string | undefined>) {
  const lineas: string[] = [];
  const llamadas: string[] = [];
  const proceso: { exitCode?: number | string | null } = {};
  const dependencias = {
    env,
    logger: pino({ level: 'info' }, { write: (linea: string) => void lineas.push(linea) }),
    proceso,
    conectarBase: async () => {
      llamadas.push('conectarBase');
    },
    escuchar: async (_app: unknown, puerto: number) => {
      llamadas.push(`escuchar:${puerto}`);
    },
  };
  return { dependencias, lineas, llamadas, proceso };
}

describe('arrancar', () => {
  it('RNF-15: con configuración inválida termina con código 1 sin conectar ni escuchar y registra solo nombres', async () => {
    const { dependencias, lineas, llamadas, proceso } = dobles({
      ...entornoValido(),
      JWT_SECRETO: SECRETO,
      NODE_ENV: undefined,
    });

    await arrancar(dependencias);

    expect(proceso.exitCode).toBe(1);
    expect(llamadas).toEqual([]);
    expect(lineas).toHaveLength(1);
    const registro = JSON.parse(lineas[0] ?? '{}') as Record<string, unknown>;
    expect(registro['level']).toBe(50); // error de pino
    expect(registro['variablesInvalidas']).toEqual(['JWT_SECRETO', 'NODE_ENV']);
    expect(lineas[0]).not.toContain(SECRETO);
  });

  it('RNF-15: con configuración válida conecta la base y después escucha en PORT, sin tocar el código de salida', async () => {
    const { dependencias, llamadas, proceso } = dobles(entornoValido());

    await arrancar(dependencias);

    expect(llamadas).toEqual(['conectarBase', 'escuchar:4321']);
    expect(proceso.exitCode).toBeUndefined();
  });
});
