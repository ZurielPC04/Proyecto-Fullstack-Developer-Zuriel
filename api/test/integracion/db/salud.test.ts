import { describe, expect, it } from 'vitest';
import { crearDataSource } from '../../../src/plataforma/db/data-source.js';
import { crearVerificarBase } from '../../../src/plataforma/db/salud.js';
import { crearConTransaccion } from '../../../src/plataforma/db/unidad-de-trabajo.js';
import { Reintentable } from '../../../src/plataforma/http/errores.js';
import { crearLogger } from '../../../src/plataforma/logging/logger.js';
import { abrirDataSource } from '../apoyo/base.js';
import { abrirProxy } from '../apoyo/proxy.js';

describe('verificarBase', () => {
  it('RNF-01: con la base real resuelve (GET /api/health → 200)', async () => {
    const dataSource = await abrirDataSource();
    try {
      await expect(crearVerificarBase(dataSource)()).resolves.toBeUndefined();
    } finally {
      await dataSource.destroy();
    }
  });

  it('RNF-01: con una URL a un puerto cerrado lanza (GET /api/health → 503)', async () => {
    const dataSource = crearDataSource({
      url: 'postgresql://billetera_app:x@127.0.0.1:1/billetera_test',
      poolMax: 1,
    });
    await expect(dataSource.initialize()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    await expect(crearVerificarBase(dataSource)()).rejects.toThrow();
  });
});

describe('base que deja de estar disponible después de conectar', () => {
  it('RNF-01 R-4.19: verificarBase lanza y conTransaccion responde Reintentable', async () => {
    const proxy = await abrirProxy(process.env['PRUEBAS_DATABASE_URL'] ?? '');
    const dataSource = await abrirDataSource(proxy.url, 2);
    const logger = crearLogger({ nivel: 'silent' });
    try {
      const verificarBase = crearVerificarBase(dataSource);
      const conTransaccion = crearConTransaccion({ dataSource, logger });
      await expect(verificarBase()).resolves.toBeUndefined();

      await proxy.cerrar();

      await expect(verificarBase()).rejects.toThrow();
      const error = await conTransaccion(async (tx) => tx.query('SELECT 1')).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Reintentable);
      expect((error as Error).cause).toMatchObject({ code: 'ECONNREFUSED' });
    } finally {
      await proxy.cerrar();
      await dataSource.destroy().catch(() => undefined);
    }
  });
});
