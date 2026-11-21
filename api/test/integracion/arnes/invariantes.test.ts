import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INVARIANTES } from '../apoyo/limpieza.js';

const API = fileURLToPath(new URL('../../../', import.meta.url));
const VITEST = fileURLToPath(
  new URL('../../../../node_modules/vitest/vitest.mjs', import.meta.url),
);

/** Corre un caso de fixtures/invariante-rota.test.ts como subproceso (sin shell). */
function correrCaso(caso: string) {
  const resultado = spawnSync(
    process.execPath,
    [
      VITEST,
      'run',
      '--config',
      'vitest.integracion.config.ts',
      'test/integracion/fixtures/invariante-rota.test.ts',
      '-t',
      // -t es una expresión regular: los paréntesis de "SUM(…)" van escapados.
      caso.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ],
    {
      cwd: API,
      env: { ...process.env, PRUEBAS_FIXTURE: '1' },
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
}

describe('afterEach global de invariantes', () => {
  it.each([
    ['rompe solo saldo = SUM(asientos)', INVARIANTES.saldo],
    ['rompe solo SUM(saldo) = 0', INVARIANTES.suma],
    ['rompe solo APLICADA con exactamente 2 asientos', INVARIANTES.asientos],
  ])(
    'RNF-23 RNF-07 DD-46: una prueba que %s hace fallar el afterEach con esa invariante',
    (caso, invariante) => {
      const { codigo, salida } = correrCaso(caso);
      expect(salida).toContain(invariante);
      expect(codigo).toBe(1);
      // Solo esa invariante: las otras dos no aparecen como rotas.
      const otras = Object.values(INVARIANTES).filter((i) => i !== invariante);
      for (const otra of otras) expect(salida).not.toContain(otra);
    },
  );
});
