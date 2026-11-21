import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  aplicarTodas,
  consultarComoDueno,
  migracionesAplicadas,
  revertirHasta,
} from '../apoyo/migraciones.js';

const MIGRACION = 'Beneficiario1000000000002';

/** Objetos que crea la migración 2, con los nombres de §7.3. */
async function objetos() {
  const [fila] = await consultarComoDueno<{
    tabla: string | null;
    restricciones: string[] | null;
    indice: string | null;
    trigger: string | null;
    funcion: number;
  }>(
    `SELECT to_regclass('public.beneficiario')::text AS tabla,
            (SELECT array_agg(conname::text ORDER BY conname) FROM pg_constraint
              WHERE conrelid = to_regclass('public.beneficiario')) AS restricciones,
            to_regclass('public.uq_beneficiario_usuario_alias')::text AS indice,
            (SELECT tgname::text FROM pg_trigger
              WHERE tgrelid = to_regclass('public.beneficiario') AND NOT tgisinternal) AS trigger,
            (SELECT count(*)::int FROM pg_proc
              WHERE proname = 'validar_beneficiario' AND pronamespace = 'public'::regnamespace) AS funcion`,
  );
  return fila;
}

beforeAll(async () => {
  await aplicarTodas();
});

afterAll(async () => {
  await aplicarTodas();
});

describe('migración Beneficiario', () => {
  it('R-3.7 RNF-06 DD-16: crea la tabla con sus restricciones con nombre, el índice de alias y el trigger', async () => {
    expect(await objetos()).toEqual({
      tabla: 'beneficiario',
      restricciones: [
        'ck_beneficiario_alias',
        'ck_beneficiario_clabe',
        'ck_beneficiario_nombre',
        'fk_beneficiario_cuenta_id',
        'fk_beneficiario_usuario_id',
        'pk_beneficiario',
        'uq_beneficiario_usuario_clabe',
      ],
      indice: 'uq_beneficiario_usuario_alias',
      trigger: 'tg_beneficiario_validar',
      funcion: 1,
    });
  });

  it('DD-05: ida y vuelta: revertir la quita entera sin tocar Base, y reaplicar la recrea', async () => {
    expect(await migracionesAplicadas()).toContain(MIGRACION);
    await revertirHasta(MIGRACION);
    expect(await objetos()).toEqual({
      tabla: null,
      restricciones: null,
      indice: null,
      trigger: null,
      funcion: 0,
    });
    const [base] = await consultarComoDueno<{ cuenta: string | null }>(
      "SELECT to_regclass('public.cuenta')::text AS cuenta",
    );
    expect(base?.cuenta).toBe('cuenta');

    await aplicarTodas();
    expect((await objetos())?.tabla).toBe('beneficiario');
  });
});
