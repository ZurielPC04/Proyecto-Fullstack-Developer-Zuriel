import { randomInt, randomUUID } from 'node:crypto';
import { digitoVerificador } from '@billetera/shared';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registrarParsers } from '../../../src/plataforma/db/parsers.js';
import { urlDueno } from '../apoyo/base.js';
import {
  aplicarTodas,
  consultarComoDueno,
  migracionesAplicadas,
  revertirHasta,
} from '../apoyo/migraciones.js';

const MIGRACION = 'TransferenciaAsiento1000000000003';
const FONDEO_ID = '00000000-0000-0000-0000-000000000001';
const MONTO = 1_000_000;

function clabeAleatoria(): string {
  let primeros = '999180';
  for (let i = 0; i < 11; i++) primeros += String(randomInt(0, 10));
  return `${primeros}${digitoVerificador(primeros)}`;
}

const FUNCIONES = [
  'aplicar_asiento',
  'asiento_inmutable',
  'validar_transferencia',
  'transferencia_transicion',
  'comprobar_transferencia',
  'transferencia_cuadra',
  'asiento_cuadra',
  'codigo_protegido',
];

async function objetos() {
  const [fila] = await consultarComoDueno<{
    tablas: string[];
    funciones: number;
    indices: string[];
  }>(
    `SELECT ARRAY[to_regclass('public.transferencia')::text, to_regclass('public.asiento')::text,
                  to_regclass('public.codigo_confirmacion')::text] AS tablas,
            (SELECT count(*)::int FROM pg_proc
              WHERE proname = ANY($1) AND pronamespace = 'public'::regnamespace) AS funciones,
            ARRAY[to_regclass('public.ix_asiento_historial')::text,
                  to_regclass('public.ix_asiento_historial_tipo')::text,
                  to_regclass('public.ix_transferencia_limite')::text] AS indices`,
    [FUNCIONES],
  );
  return fila;
}

let cliente: pg.Client;

beforeAll(async () => {
  registrarParsers();
  await aplicarTodas();
  cliente = new pg.Client({ connectionString: urlDueno() });
  await cliente.connect();
});

afterAll(async () => {
  await cliente.end();
  await aplicarTodas();
});

describe('migración TransferenciaAsiento: humo', () => {
  it('RNF-07 D-01 D-02: un FONDEO correcto deja el saldo esperado y los asientos suman cero', async () => {
    await cliente.query('BEGIN');
    const {
      rows: [usuario],
    } = await cliente.query<{ id: string }>(
      'INSERT INTO usuario (correo, hash_contrasena) VALUES ($1, $2) RETURNING id',
      [`humo-${randomUUID()}@prueba.mx`, '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'],
    );
    const {
      rows: [cuenta],
    } = await cliente.query<{ id: string }>(
      "INSERT INTO cuenta (usuario_id, tipo, nombre, clabe) VALUES ($1, 'USUARIO', 'Principal', $2) RETURNING id",
      [usuario?.id, clabeAleatoria()],
    );
    const {
      rows: [antes],
    } = await cliente.query<{ saldo: number; t: string }>(
      'SELECT saldo_centavos AS saldo, clock_timestamp() AS t FROM cuenta WHERE id = $1',
      [FONDEO_ID],
    );
    const {
      rows: [transferencia],
    } = await cliente.query<{ id: string }>(
      `INSERT INTO transferencia (tipo, cuenta_origen_id, cuenta_destino_id, monto_centavos, concepto,
                                  estado, creado_en, aplicada_en)
       VALUES ('FONDEO', $1, $2, $3, 'Depósito de bienvenida', 'APLICADA', $4, $4) RETURNING id`,
      [FONDEO_ID, cuenta?.id, MONTO, antes?.t],
    );
    await cliente.query(
      `INSERT INTO asiento (transferencia_id, cuenta_id, monto_centavos, tipo_movimiento, creado_en)
       VALUES ($1, $2, $3, 'FONDEO_SALIDA', $5), ($1, $4, $6, 'DEPOSITO', $5)`,
      [transferencia?.id, FONDEO_ID, -MONTO, cuenta?.id, antes?.t, MONTO],
    );
    // Aquí se evalúan transferencia_cuadra y asiento_cuadra (diferidos).
    await cliente.query('COMMIT');

    const { rows } = await cliente.query<{
      saldo_usuario: number;
      asientos_usuario: number;
      saldo_fondeo: number;
      suma_transferencia: number;
      asientos_transferencia: number;
      suma_saldos: number;
    }>(
      `SELECT (SELECT saldo_centavos FROM cuenta WHERE id = $1) AS saldo_usuario,
              (SELECT sum(monto_centavos)::bigint FROM asiento WHERE cuenta_id = $1) AS asientos_usuario,
              (SELECT saldo_centavos FROM cuenta WHERE id = $2) AS saldo_fondeo,
              (SELECT sum(monto_centavos)::bigint FROM asiento WHERE transferencia_id = $3) AS suma_transferencia,
              (SELECT count(*)::int FROM asiento WHERE transferencia_id = $3) AS asientos_transferencia,
              (SELECT sum(saldo_centavos)::bigint FROM cuenta) AS suma_saldos`,
      [cuenta?.id, FONDEO_ID, transferencia?.id],
    );
    expect(rows[0]).toEqual({
      saldo_usuario: MONTO,
      asientos_usuario: MONTO,
      saldo_fondeo: (antes?.saldo ?? 0) - MONTO,
      suma_transferencia: 0,
      asientos_transferencia: 2,
      suma_saldos: 0,
    });
  });
});

describe('migración TransferenciaAsiento: ida y vuelta', () => {
  it('DD-05: revertir quita tablas, funciones e índices sin tocar Beneficiario, y reaplicar los recrea', async () => {
    expect(await migracionesAplicadas()).toContain(MIGRACION);
    await revertirHasta(MIGRACION);
    expect(await objetos()).toEqual({
      tablas: [null, null, null],
      funciones: 0,
      indices: [null, null, null],
    });
    const [previas] = await consultarComoDueno<{ beneficiario: string | null }>(
      "SELECT to_regclass('public.beneficiario')::text AS beneficiario",
    );
    expect(previas?.beneficiario).toBe('beneficiario');

    await aplicarTodas();
    expect(await objetos()).toEqual({
      tablas: ['transferencia', 'asiento', 'codigo_confirmacion'],
      funciones: FUNCIONES.length,
      indices: ['ix_asiento_historial', 'ix_asiento_historial_tipo', 'ix_transferencia_limite'],
    });
  });
});
