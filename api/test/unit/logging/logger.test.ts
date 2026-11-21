import { describe, expect, it } from 'vitest';
import { contextoPeticion } from '../../../src/plataforma/logging/contexto.js';
import { crearLogger } from '../../../src/plataforma/logging/logger.js';

function loggerEnMemoria() {
  const lineas: string[] = [];
  const logger = crearLogger({
    nivel: 'info',
    destino: { write: (l: string) => void lineas.push(l) },
  });
  return { logger, salida: () => lineas.join('') };
}

const CAMPOS_SENSIBLES = [
  'contrasena',
  'hash_contrasena',
  'accessToken',
  'refreshToken',
  'refresh_hash',
  'codigo',
  'codigoSimulado',
  'codigo_hmac',
] as const;

describe('crearLogger', () => {
  it('RNF-12 DD-39: censura authorization, cookie y set-cookie aunque alguien registre los headers', () => {
    const { logger, salida } = loggerEnMemoria();
    logger.info({
      req: {
        headers: { authorization: 'Bearer TOKEN-ACCESO', cookie: 'billetera_refresh=TOKEN-COOKIE' },
      },
      res: { headers: { 'set-cookie': 'billetera_refresh=TOKEN-SET-COOKIE' } },
    });
    expect(salida()).not.toContain('TOKEN-ACCESO');
    expect(salida()).not.toContain('TOKEN-COOKIE');
    expect(salida()).not.toContain('TOKEN-SET-COOKIE');
    expect(salida()).toContain('[Redacted]');
  });

  it.each(CAMPOS_SENSIBLES)(
    'RNF-12 DD-39: %s se censura en el nivel superior, en el 1 y en el 2',
    (campo) => {
      const { logger, salida } = loggerEnMemoria();
      logger.info({ [campo]: 'VALOR-NIVEL-0' });
      logger.info({ usuario: { [campo]: 'VALOR-NIVEL-1' } });
      logger.info({ a: { b: { [campo]: 'VALOR-NIVEL-2' } } });
      expect(salida()).not.toMatch(/VALOR-NIVEL-\d/);
    },
  );

  it('RNF-12: cada línea lleva el reqId y el usuarioId del contexto de la petición', () => {
    const { logger, salida } = loggerEnMemoria();
    contextoPeticion.run(
      { reqId: '6f0c2a1e-0000-4000-8000-000000000001', usuarioId: 'u-1' },
      () => {
        logger.info('dentro');
      },
    );
    logger.info('fuera');
    const [dentro, fuera] = salida()
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(dentro).toMatchObject({
      reqId: '6f0c2a1e-0000-4000-8000-000000000001',
      usuarioId: 'u-1',
    });
    expect(fuera).not.toHaveProperty('reqId');
  });
});
