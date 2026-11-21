import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { urlDueno } from '../apoyo/base.js';

const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url));

/** Corre un script npm de la raíz con un entorno controlado (sin api/.env). */
function correr(script: string, env: Record<string, string | undefined>) {
  // `script` es siempre un literal de esta prueba; el comando va completo para no pasar args sueltos con shell.
  const resultado = spawnSync(`npm run ${script} --silent`, {
    cwd: RAIZ,
    env: { PATH: process.env['PATH'], SystemRoot: process.env['SystemRoot'], ...env },
    encoding: 'utf8',
    shell: true,
    timeout: 60_000,
  });
  return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
}

describe('migrar.ts', () => {
  it('RNF-16 DD-05: npm run db:migrate sin migraciones termina con 0 y deja la tabla migracion', async () => {
    const { codigo, salida } = correr('db:migrate', { DATABASE_URL_MIGRACIONES: urlDueno() });
    expect(salida).not.toContain('billetera_owner_dev');
    expect(codigo).toBe(0);

    const cliente = new pg.Client({ connectionString: urlDueno() });
    await cliente.connect();
    try {
      const { rows } = await cliente.query<{ tabla: string | null }>(
        "SELECT to_regclass('public.migracion')::text AS tabla",
      );
      expect(rows[0]?.tabla).toBe('migracion');
    } finally {
      await cliente.end();
    }
  });

  it('DD-05: npm run db:migrate:revertir sin migraciones aplicadas termina con 0', () => {
    expect(correr('db:migrate:revertir', { DATABASE_URL_MIGRACIONES: urlDueno() }).codigo).toBe(0);
  });

  it('RNF-15: sin DATABASE_URL_MIGRACIONES válida termina con 1 y registra solo el nombre', () => {
    const { codigo, salida } = correr('db:migrate', {
      DATABASE_URL_MIGRACIONES: 'no-es-url-SECRETO',
    });
    expect(codigo).toBe(1);
    expect(salida).toContain('DATABASE_URL_MIGRACIONES');
    expect(salida).not.toContain('SECRETO');
  });
});
