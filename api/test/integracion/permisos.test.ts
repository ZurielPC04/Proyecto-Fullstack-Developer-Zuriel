// T-API-10: escrituras prohibidas (DD-18, §3.4). Cada caso espera su SQLSTATE (42501 sin
// permiso, P0001 del trigger con su constraint), confirma el permiso con has_*_privilege y
// verifica después que no cambió ninguna fila ni saldo.
import type pg from 'pg';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirDataSource } from './apoyo/base.js';
import { clabeAleatoria } from './apoyo/fabricas.js';
import { consultarComoDueno } from './apoyo/migraciones.js';
import {
  fotografia,
  intentar,
  prepararEscenario,
  TABLAS,
  type Escenario,
  type Rol,
} from './apoyo/sql-directo.js';

const APP = 'billetera_app';
const SEARCH_PATH = 'search_path=pg_catalog, public, pg_temp';

let dataSource: DataSource;
let e: Escenario;

beforeAll(async () => {
  dataSource = await abrirDataSource();
  e = await prepararEscenario(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

async function rechaza(
  rol: Rol,
  esperado: { code: string; constraint?: string },
  trabajo: (c: pg.Client) => Promise<unknown>,
): Promise<void> {
  const antes = await fotografia();
  const error = await intentar(rol, trabajo);
  expect({ code: error.code, constraint: error.constraint }).toEqual({
    code: esperado.code,
    constraint: esperado.constraint,
  });
  expect(await fotografia()).toEqual(antes);
}

async function puedeTabla(tabla: string, privilegio: string): Promise<boolean> {
  const [fila] = await consultarComoDueno<{ puede: boolean }>(
    `SELECT has_table_privilege($1, format('public.%I', $2::text), $3) AS puede`,
    [APP, tabla, privilegio],
  );
  return fila?.puede ?? true;
}

async function puedeColumna(tabla: string, columna: string, privilegio: string): Promise<boolean> {
  const [fila] = await consultarComoDueno<{ puede: boolean }>(
    `SELECT has_column_privilege($1, format('public.%I', $2::text), $3, $4) AS puede`,
    [APP, tabla, columna, privilegio],
  );
  return fila?.puede ?? true;
}

const SIN_PERMISO = { code: '42501' };

describe('DD-18: saldos', () => {
  it('DD-18 RNF-07 RNF-11: billetera_app no puede hacer UPDATE de cuenta.saldo_centavos (42501)', async () => {
    expect(await puedeColumna('cuenta', 'saldo_centavos', 'UPDATE')).toBe(false);
    await rechaza('app', SIN_PERMISO, (c) =>
      c.query('UPDATE cuenta SET saldo_centavos = 999999 WHERE id = $1', [e.a.principalId]),
    );
  });

  it('DD-18 RNF-07: billetera_app no puede insertar una cuenta con saldo (42501)', async () => {
    expect(await puedeColumna('cuenta', 'saldo_centavos', 'INSERT')).toBe(false);
    await rechaza('app', SIN_PERMISO, (c) =>
      c.query(
        `INSERT INTO cuenta (usuario_id, tipo, nombre, clabe, saldo_centavos)
         VALUES ($1, 'USUARIO', 'Principal', $2, 500000)`,
        [e.a.usuarioId, clabeAleatoria()],
      ),
    );
  });

  it('DD-18 RNF-07: el rol dueño tampoco puede escribir el saldo directo (P0001 de cuenta_protegida)', async () => {
    await rechaza('dueno', { code: 'P0001', constraint: 'tg_cuenta_protegida' }, (c) =>
      c.query('UPDATE cuenta SET saldo_centavos = 999999 WHERE id = $1', [e.a.principalId]),
    );
  });
});

describe('DD-18: asientos', () => {
  it.each([
    ['UPDATE', 'UPDATE asiento SET monto_centavos = monto_centavos WHERE transferencia_id = $1'],
    ['DELETE', 'DELETE FROM asiento WHERE transferencia_id = $1'],
  ])('DD-18 RNF-06: billetera_app no puede hacer %s de asientos (42501)', async (op, sql) => {
    expect(await puedeTabla('asiento', op)).toBe(false);
    await rechaza('app', SIN_PERMISO, (c) => c.query(sql, [e.aplicada]));
  });

  it.each([
    ['UPDATE', 'UPDATE asiento SET monto_centavos = monto_centavos WHERE transferencia_id = $1'],
    ['DELETE', 'DELETE FROM asiento WHERE transferencia_id = $1'],
  ])(
    'DD-18 RNF-06: el rol dueño no puede hacer %s de asientos (P0001 de asiento_inmutable)',
    async (_op, sql) => {
      await rechaza('dueno', { code: 'P0001', constraint: 'tg_asiento_inmutable' }, (c) =>
        c.query(sql, [e.aplicada]),
      );
    },
  );
});

describe('DD-18: auditoría', () => {
  it.each([
    ['UPDATE', "UPDATE evento_auditoria SET tipo = 'login-fallido'"],
    ['DELETE', 'DELETE FROM evento_auditoria'],
  ])(
    'DD-18 RNF-11: billetera_app no puede hacer %s de evento_auditoria (42501)',
    async (op, sql) => {
      expect(await puedeTabla('evento_auditoria', op)).toBe(false);
      await rechaza('app', SIN_PERMISO, (c) => c.query(sql));
    },
  );

  it.each([
    ['UPDATE', "UPDATE evento_auditoria SET tipo = 'login-fallido'"],
    ['DELETE', 'DELETE FROM evento_auditoria'],
  ])(
    'DD-18 RNF-11: el rol dueño no puede hacer %s de evento_auditoria (P0001 de auditoria_inmutable)',
    async (_op, sql) => {
      await rechaza('dueno', { code: 'P0001', constraint: 'tg_evento_auditoria_inmutable' }, (c) =>
        c.query(sql),
      );
    },
  );
});

describe('DD-18: billetera_app no borra nada', () => {
  it.each(TABLAS)('DD-18 RNF-11: DELETE de %s da 42501', async (tabla) => {
    expect(await puedeTabla(tabla, 'DELETE')).toBe(false);
    await rechaza('app', SIN_PERMISO, (c) => c.query(`DELETE FROM ${tabla}`));
  });

  it.each(TABLAS)('DD-18 RNF-11: TRUNCATE de %s da 42501', async (tabla) => {
    expect(await puedeTabla(tabla, 'TRUNCATE')).toBe(false);
    await rechaza('app', SIN_PERMISO, (c) => c.query(`TRUNCATE ${tabla}`));
  });
});

describe('DD-18: funciones SECURITY DEFINER', () => {
  it('DD-18 RNF-11: toda función SECURITY DEFINER fija search_path = pg_catalog, public, pg_temp y no da EXECUTE a PUBLIC', async () => {
    const funciones = await consultarComoDueno<{
      funcion: string;
      config: string[] | null;
      publico: boolean;
    }>(
      `SELECT p.oid::regprocedure::text AS funcion, p.proconfig AS config,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
                       WHERE grantee = 0 AND privilege_type = 'EXECUTE') AS publico
         FROM pg_proc p
        WHERE p.prosecdef AND p.pronamespace = 'public'::regnamespace
        ORDER BY 1`,
    );
    // Hoy existe exactamente una (§3.4): la revisión no puede pasar en vacío.
    expect(funciones.map((f) => f.funcion)).toEqual(['aplicar_asiento()']);
    for (const f of funciones) {
      expect({ funcion: f.funcion, config: f.config, publico: f.publico }).toEqual({
        funcion: f.funcion,
        config: [SEARCH_PATH],
        publico: false,
      });
    }
  });
});
