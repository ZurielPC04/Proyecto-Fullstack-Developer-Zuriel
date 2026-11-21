import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { migraciones } from '../../../src/migraciones/index.js';
import { urlDueno } from '../apoyo/base.js';
import { aplicarTodas, migracionesAplicadas, revertirTodas } from '../apoyo/migraciones.js';
import { truncar } from '../apoyo/limpieza.js';

const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url));
const NOMBRES = migraciones.map((Migracion) => new Migracion().name ?? Migracion.name);

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

afterAll(async () => {
  await aplicarTodas();
});

describe('migrar.ts', () => {
  it('RNF-16 DD-05: npm run db:migrate en una base sin migraciones aplica todas, en orden, y termina con 0', async () => {
    // Sin datos antes de revertir: borrar asientos sin sus saldos descuadraría la base.
    await truncar();
    await revertirTodas();
    expect(await migracionesAplicadas()).toEqual([]);

    const { codigo, salida } = correr('db:migrate', { DATABASE_URL_MIGRACIONES: urlDueno() });
    expect(salida).not.toContain('billetera_owner_dev');
    expect(codigo).toBe(0);
    expect(await migracionesAplicadas()).toEqual(NOMBRES);
  });

  it('DD-05: db:migrate:revertir quita solo la última y db:migrate la vuelve a aplicar', async () => {
    expect(correr('db:migrate:revertir', { DATABASE_URL_MIGRACIONES: urlDueno() }).codigo).toBe(0);
    expect(await migracionesAplicadas()).toEqual(NOMBRES.slice(0, -1));

    expect(correr('db:migrate', { DATABASE_URL_MIGRACIONES: urlDueno() }).codigo).toBe(0);
    expect(await migracionesAplicadas()).toEqual(NOMBRES);
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
