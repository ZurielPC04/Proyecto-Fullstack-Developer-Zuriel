import { createHash, randomInt, randomUUID } from 'node:crypto';
import { digitoVerificador } from '@billetera/shared';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registrarParsers } from '../../../src/plataforma/db/parsers.js';
import { urlApp } from '../apoyo/base.js';
import {
  aplicarTodas,
  consultarComoDueno,
  migracionesAplicadas,
  revertirHasta,
} from '../apoyo/migraciones.js';
import { truncar } from '../apoyo/limpieza.js';

const PERMISOS = 'Permisos1000000000006';
const FONDEO_ID = '00000000-0000-0000-0000-000000000001';
const APP = 'billetera_app';

type Columnas = 'todas' | string[];
interface PermisosTabla {
  select: boolean;
  insert: Columnas;
  update: string[];
}

/** design.md §3.4, celda por celda. */
const ESPERADO: Record<string, PermisosTabla> = {
  usuario: { select: true, insert: 'todas', update: ['id'] },
  cuenta: { select: true, insert: ['clabe', 'id', 'nombre', 'tipo', 'usuario_id'], update: ['id'] },
  beneficiario: { select: true, insert: 'todas', update: [] },
  transferencia: {
    select: true,
    insert: 'todas',
    update: ['aplicada_en', 'estado', 'motivo_rechazo'],
  },
  asiento: { select: true, insert: 'todas', update: [] },
  codigo_confirmacion: { select: true, insert: 'todas', update: ['intentos'] },
  sesion: { select: true, insert: 'todas', update: ['revocada_en', 'usada_en'] },
  evento_auditoria: { select: false, insert: [], update: [] },
};
// evento_auditoria: solo INSERT (RNF-11).
ESPERADO['evento_auditoria']!.insert = 'todas';

async function permisosReales(): Promise<Record<string, PermisosTabla & { prohibidos: string[] }>> {
  const filas = await consultarComoDueno<{
    tabla: string;
    columna: string;
    puede_select: boolean;
    puede_insert: boolean;
    puede_update: boolean;
  }>(
    `SELECT table_name AS tabla, column_name AS columna,
            has_column_privilege($1, format('public.%I', table_name), column_name, 'SELECT') AS puede_select,
            has_column_privilege($1, format('public.%I', table_name), column_name, 'INSERT') AS puede_insert,
            has_column_privilege($1, format('public.%I', table_name), column_name, 'UPDATE') AS puede_update
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($2)
      ORDER BY table_name, column_name`,
    [APP, Object.keys(ESPERADO)],
  );
  const prohibidos = await consultarComoDueno<{ tabla: string; privilegio: string }>(
    `SELECT t AS tabla, p AS privilegio
       FROM unnest($2::text[]) AS t,
            unnest(ARRAY['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'UPDATE', 'SELECT']) AS p
      WHERE has_table_privilege($1, format('public.%I', t), p)`,
    [APP, Object.keys(ESPERADO)],
  );

  const resultado: Record<string, PermisosTabla & { prohibidos: string[] }> = {};
  for (const tabla of Object.keys(ESPERADO)) {
    const columnas = filas.filter((f) => f.tabla === tabla);
    const insert = columnas.filter((c) => c.puede_insert).map((c) => c.columna);
    resultado[tabla] = {
      select: columnas.every((c) => c.puede_select),
      insert: insert.length === columnas.length ? 'todas' : insert,
      update: columnas.filter((c) => c.puede_update).map((c) => c.columna),
      // De la tabla completa, solo puede haber SELECT; nunca DELETE, TRUNCATE ni UPDATE de tabla.
      prohibidos: prohibidos
        .filter((p) => p.tabla === tabla && p.privilegio !== 'SELECT')
        .map((p) => p.privilegio),
    };
  }
  return resultado;
}

function clabeAleatoria(): string {
  let primeros = '999180';
  for (let i = 0; i < 11; i++) primeros += String(randomInt(0, 10));
  return `${primeros}${digitoVerificador(primeros)}`;
}

let app: pg.Client;

beforeAll(async () => {
  registrarParsers();
  await aplicarTodas();
  app = new pg.Client({ connectionString: urlApp() });
  await app.connect();
});

afterAll(async () => {
  await app.end();
  await aplicarTodas();
});

describe('migraciones Sesion y Auditoria', () => {
  it('RNF-02 RNF-11 DD-15: crean sesion y evento_auditoria (sin FK) con su trigger de inmutabilidad', async () => {
    const [fila] = await consultarComoDueno<Record<string, unknown>>(
      `SELECT to_regclass('public.sesion')::text AS sesion,
              to_regclass('public.ix_sesion_familia')::text AS indice_familia,
              to_regclass('public.evento_auditoria')::text AS auditoria,
              (SELECT count(*)::int FROM pg_constraint
                WHERE conrelid = to_regclass('public.evento_auditoria') AND contype = 'f') AS fk_auditoria,
              (SELECT tgname::text FROM pg_trigger
                WHERE tgrelid = to_regclass('public.evento_auditoria') AND NOT tgisinternal) AS trigger_auditoria`,
    );
    expect(fila).toEqual({
      sesion: 'sesion',
      indice_familia: 'ix_sesion_familia',
      auditoria: 'evento_auditoria',
      fk_auditoria: 0,
      trigger_auditoria: 'tg_evento_auditoria_inmutable',
    });
  });
});

describe('migración Permisos', () => {
  it('RNF-11 DD-18: billetera_app tiene exactamente los permisos de §3.4, sin DELETE ni TRUNCATE', async () => {
    const esperado = Object.fromEntries(
      Object.entries(ESPERADO).map(([tabla, p]) => [tabla, { ...p, prohibidos: [] }]),
    );
    expect(await permisosReales()).toEqual(esperado);
  });

  it('RNF-11: billetera_app no puede crear objetos en el esquema', async () => {
    const [fila] = await consultarComoDueno<{ puede: boolean }>(
      "SELECT has_schema_privilege($1, 'public', 'CREATE') AS puede",
      [APP],
    );
    expect(fila?.puede).toBe(false);
  });

  it('RNF-11 DD-18: EXECUTE solo sobre clabe_valida y comprobar_transferencia', async () => {
    const filas = await consultarComoDueno<{ funcion: string; puede: boolean }>(
      `SELECT p.oid::regprocedure::text AS funcion, has_function_privilege($1, p.oid, 'EXECUTE') AS puede
         FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1`,
      [APP],
    );
    expect(filas.filter((f) => f.puede).map((f) => f.funcion)).toEqual([
      'clabe_valida(text)',
      'comprobar_transferencia(uuid,text)',
    ]);
    expect(filas.map((f) => f.funcion)).toContain('aplicar_asiento()');
  });

  it('DD-18: billetera_app no puede invocar aplicar_asiento directamente (42501)', async () => {
    const error = await app.query('SELECT aplicar_asiento()').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: '42501' });
  });

  it('RNF-07 RNF-11: como billetera_app, el camino real funciona: usuario, cuenta, bloqueos, FONDEO, sesión y auditoría', async () => {
    const monto = 250_000;
    await app.query('BEGIN');
    try {
      const {
        rows: [usuario],
      } = await app.query<{ id: string }>(
        'INSERT INTO usuario (correo, hash_contrasena) VALUES ($1, $2) RETURNING id',
        [`app-${randomUUID()}@prueba.mx`, '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'],
      );
      const {
        rows: [cuenta],
      } = await app.query<{ id: string }>(
        "INSERT INTO cuenta (usuario_id, tipo, nombre, clabe) VALUES ($1, 'USUARIO', 'Principal', $2) RETURNING id",
        [usuario?.id, clabeAleatoria()],
      );
      // §3.4: UPDATE (id) existe solo para poder bloquear.
      await app.query('SELECT id FROM usuario WHERE id = $1 FOR UPDATE', [usuario?.id]);
      const {
        rows: [ahora],
      } = await app.query<{ t: string }>(
        'SELECT clock_timestamp() AS t FROM cuenta WHERE id = ANY($1) ORDER BY id LIMIT 1 FOR UPDATE',
        [[FONDEO_ID, cuenta?.id]],
      );
      const {
        rows: [transferencia],
      } = await app.query<{ id: string }>(
        `INSERT INTO transferencia (tipo, cuenta_origen_id, cuenta_destino_id, monto_centavos, concepto,
                                    estado, creado_en, aplicada_en)
         VALUES ('FONDEO', $1, $2, $3, 'Depósito', 'APLICADA', $4, $4) RETURNING id`,
        [FONDEO_ID, cuenta?.id, monto, ahora?.t],
      );
      await app.query(
        `INSERT INTO asiento (transferencia_id, cuenta_id, monto_centavos, tipo_movimiento, creado_en)
         VALUES ($1, $2, $3, 'FONDEO_SALIDA', $5), ($1, $4, $6, 'DEPOSITO', $5)`,
        [transferencia?.id, FONDEO_ID, -monto, cuenta?.id, ahora?.t, monto],
      );
      // Sin RETURNING: billetera_app no puede leer la auditoría.
      await app.query(
        `INSERT INTO evento_auditoria (tipo, usuario_id, request_id, datos)
         VALUES ('fondeo-aplicado', $1, 'prueba', $2)`,
        [usuario?.id, { transferenciaId: transferencia?.id, montoCentavos: monto }],
      );
      await app.query(
        `INSERT INTO sesion (usuario_id, familia_id, refresh_hash, expira_en)
         VALUES ($1, $2, $3, now() + interval '7 days')`,
        [usuario?.id, randomUUID(), createHash('sha256').update(randomUUID()).digest('hex')],
      );
      await app.query('COMMIT');

      const { rows } = await app.query<{ saldo: number }>(
        'SELECT saldo_centavos AS saldo FROM cuenta WHERE id = $1',
        [cuenta?.id],
      );
      expect(rows[0]?.saldo).toBe(monto);
    } catch (error) {
      await app.query('ROLLBACK');
      throw error;
    }
  });

  it('DD-05: ida y vuelta: revertir Permisos deja a billetera_app sin permisos de tabla, y reaplicar los devuelve', async () => {
    expect(await migracionesAplicadas()).toContain(PERMISOS);
    // Sin datos antes de revertir: borrar asientos sin sus saldos descuadraría la base.
    await truncar();
    await revertirHasta(PERMISOS);
    const [sin] = await consultarComoDueno<{ select: boolean; insert: boolean }>(
      `SELECT has_table_privilege($1, 'public.usuario', 'SELECT') AS select,
              has_table_privilege($1, 'public.sesion', 'INSERT') AS insert`,
      [APP],
    );
    expect(sin).toEqual({ select: false, insert: false });

    await aplicarTodas();
    expect((await permisosReales())['usuario']).toEqual({ ...ESPERADO['usuario'], prohibidos: [] });
  });
});
