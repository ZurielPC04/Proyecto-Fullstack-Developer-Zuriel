import { randomInt } from 'node:crypto';
import { digitoVerificador, validarClabe } from '@billetera/shared';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { urlDueno } from '../apoyo/base.js';
import {
  aplicarTodas,
  consultarComoDueno,
  migracionesAplicadas,
  revertirHasta,
} from '../apoyo/migraciones.js';
import { truncar } from '../apoyo/limpieza.js';

const FONDEO_ID = '00000000-0000-0000-0000-000000000001';

function digitos(n: number): string {
  let texto = '';
  for (let i = 0; i < n; i++) texto += String(randomInt(0, 10));
  return texto;
}

function clabeValidaAleatoria(): string {
  const primeros = `999180${digitos(11)}`;
  return `${primeros}${digitoVerificador(primeros)}`;
}

/** Un prefijo cuya suma ponderada termina en 0: el dígito verificador es 0, no 10. */
function clabeConDigitoCero(): string {
  for (;;) {
    const primeros = digitos(17);
    if (digitoVerificador(primeros) === 0) return `${primeros}0`;
  }
}

let cliente: pg.Client;

beforeAll(async () => {
  await aplicarTodas();
  cliente = new pg.Client({ connectionString: urlDueno() });
  await cliente.connect();
});

afterAll(async () => {
  await cliente.end();
  await aplicarTodas();
});

describe('migración Base: clabe_valida', () => {
  it('R-3.12 DD-19: coincide con validarClabe en 10,000 CLABEs aleatorias', async () => {
    const clabes = Array.from({ length: 10_000 }, (_, i) =>
      i % 2 === 0 ? clabeValidaAleatoria() : digitos(18),
    );
    const { rows } = await cliente.query<{ clabe: string; valida: boolean }>(
      'SELECT x AS clabe, clabe_valida(x) AS valida FROM unnest($1::text[]) AS x',
      [clabes],
    );
    const distintas = rows.filter((r) => r.valida !== validarClabe(r.clabe).ok);
    expect(distintas).toEqual([]);
    // La mitad aleatoria pura también trae CLABEs inválidas: la comparación cubre los dos lados.
    expect(rows.filter((r) => !r.valida).length).toBeGreaterThan(1000);
  });

  it('R-3.12 DD-19: coincide en los casos borde', async () => {
    const casos = [
      clabeConDigitoCero(),
      '999000000000000001', // Fondeo (§3.6)
      '999000000000000002',
      '99900000000000000', // 17 dígitos
      '9990000000000000011', // 19 dígitos
      'abcdefghijklmnopqr',
      '99900000000000000a',
      '99900000000000000 1',
      ' 999000000000000001',
      '999000000000000001\n',
      '９９９０００００００００００００１'.slice(0, 18), // dígitos de ancho completo
      '',
    ];
    const { rows } = await cliente.query<{ clabe: string; valida: boolean | null }>(
      'SELECT x AS clabe, clabe_valida(x) AS valida FROM unnest($1::text[]) AS x',
      [casos],
    );
    for (const { clabe, valida } of rows)
      expect([clabe, valida]).toEqual([clabe, validarClabe(clabe).ok]);
    expect(rows.find((r) => r.clabe === '999000000000000001')?.valida).toBe(true);
  });
});

describe('migración Base: tablas y Fondeo', () => {
  it('R-2.3 D-02: la migración crea la cuenta Fondeo de sistema con su CLABE fija', async () => {
    const filas = await consultarComoDueno<Record<string, unknown>>(
      'SELECT tipo, nombre, clabe, usuario_id FROM cuenta WHERE id = $1',
      [FONDEO_ID],
    );
    expect(filas).toEqual([
      { tipo: 'SISTEMA', nombre: 'Fondeo', clabe: '999000000000000001', usuario_id: null },
    ]);
  });

  it('RNF-07 DD-18 DD-35: un UPDATE directo del saldo falla con P0001 y constraint tg_cuenta_protegida', async () => {
    const error = await cliente
      .query('UPDATE cuenta SET saldo_centavos = saldo_centavos + 1 WHERE id = $1', [FONDEO_ID])
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'P0001', constraint: 'tg_cuenta_protegida' });
  });

  it('DD-35: borrar una cuenta falla con constraint tg_cuenta_protegida', async () => {
    const error = await cliente
      .query('DELETE FROM cuenta WHERE id = $1', [FONDEO_ID])
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'P0001', constraint: 'tg_cuenta_protegida' });
  });
});

describe('migración Base: ida y vuelta', () => {
  it('DD-05 RNF-16: revertir quita tablas, funciones y triggers, y reaplicar los recrea', async () => {
    const objetos = async () =>
      (
        await consultarComoDueno<{
          usuario: string | null;
          cuenta: string | null;
          funciones: number;
        }>(
          `SELECT to_regclass('public.usuario')::text AS usuario,
                  to_regclass('public.cuenta')::text AS cuenta,
                  (SELECT count(*)::int FROM pg_proc
                    WHERE proname IN ('clabe_valida', 'cuenta_protegida')
                      AND pronamespace = 'public'::regnamespace) AS funciones`,
        )
      )[0];

    expect(await migracionesAplicadas()).toContain('Base1000000000001');
    // Sin datos antes de revertir: borrar asientos sin sus saldos descuadraría la base.
    await truncar();
    await revertirHasta('Base1000000000001');
    expect(await objetos()).toEqual({ usuario: null, cuenta: null, funciones: 0 });

    await aplicarTodas();
    expect(await objetos()).toEqual({ usuario: 'usuario', cuenta: 'cuenta', funciones: 2 });
  });
});
