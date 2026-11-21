// Apoyo de las pruebas de integridad y permisos con SQL directo (T-API-10, DD-17, DD-18).
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import type { DataSource } from 'typeorm';
import { registrarParsers } from '../../../src/plataforma/db/parsers.js';
import { urlApp, urlDueno } from './base.js';
import { crearUsuarioConCuentas, FONDEO_ID, fondear, type UsuarioDePrueba } from './fabricas.js';

registrarParsers();

export { FONDEO_ID };

export const TABLAS = [
  'usuario',
  'cuenta',
  'beneficiario',
  'transferencia',
  'asiento',
  'codigo_confirmacion',
  'sesion',
  'evento_auditoria',
] as const;

/** Conteo de filas por tabla y saldo de cada cuenta, leídos como dueño. */
export interface Fotografia {
  filas: Record<string, number>;
  saldos: Record<string, number>;
}

async function conCliente<T>(url: string, trabajo: (c: pg.Client) => Promise<T>): Promise<T> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return await trabajo(cliente);
  } finally {
    await cliente.end();
  }
}

export async function fotografia(): Promise<Fotografia> {
  return conCliente(urlDueno(), async (c) => {
    const filas: Record<string, number> = {};
    for (const tabla of TABLAS) {
      const { rows } = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabla}`);
      filas[tabla] = rows[0]?.n ?? -1;
    }
    const { rows } = await c.query<{ id: string; saldo: number }>(
      'SELECT id, saldo_centavos AS saldo FROM cuenta ORDER BY id',
    );
    return { filas, saldos: Object.fromEntries(rows.map((r) => [r.id, r.saldo])) };
  });
}

export type Rol = 'app' | 'dueno';

/**
 * Corre `trabajo` en una transacción con el rol indicado y la confirma. Devuelve el error de
 * PostgreSQL (al ejecutar o al hacer COMMIT, donde corren los triggers diferidos). Si la base
 * acepta todo, lanza: el caso esperaba un rechazo.
 */
export async function intentar(
  rol: Rol,
  trabajo: (c: pg.Client) => Promise<unknown>,
): Promise<pg.DatabaseError> {
  return conCliente(rol === 'app' ? urlApp() : urlDueno(), async (c) => {
    await c.query('BEGIN');
    try {
      await trabajo(c);
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK').catch(() => undefined);
      return error as pg.DatabaseError;
    }
    throw new Error('La base aceptó una operación que debía rechazar');
  });
}

/** Ejecuta en una transacción confirmada (para preparar datos). */
export async function ejecutar<T>(rol: Rol, trabajo: (c: pg.Client) => Promise<T>): Promise<T> {
  return conCliente(rol === 'app' ? urlApp() : urlDueno(), async (c) => {
    await c.query('BEGIN');
    try {
      const resultado = await trabajo(c);
      await c.query('COMMIT');
      return resultado;
    } catch (error) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });
}

export async function ahora(c: pg.Client): Promise<string> {
  const { rows } = await c.query<{ t: string }>('SELECT clock_timestamp() AS t');
  return rows[0]?.t ?? '';
}

export interface DatosTransferencia {
  tipo: 'FONDEO' | 'TRASPASO' | 'TERCERO';
  usuarioId: string | null;
  origen: string;
  destino: string;
  monto: number;
  estado?: 'PENDIENTE_CONFIRMACION' | 'APLICADA' | 'RECHAZADA';
  motivo?: string | null;
  beneficiarioId?: string | null;
  llave?: string;
  instante: string;
}

/** INSERT de una transferencia con columnas coherentes por omisión (DD-12). */
export async function insertarTransferencia(c: pg.Client, t: DatosTransferencia): Promise<string> {
  const estado = t.estado ?? 'APLICADA';
  const deUsuario = t.tipo !== 'FONDEO';
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO transferencia (usuario_id, tipo, cuenta_origen_id, cuenta_destino_id, beneficiario_id,
                                monto_centavos, concepto, referencia, estado, motivo_rechazo,
                                llave_idempotencia, hash_peticion, creado_en, aplicada_en)
     VALUES ($1, $2, $3, $4, $5, $6, 'Prueba', $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [
      t.usuarioId,
      t.tipo,
      t.origen,
      t.destino,
      t.beneficiarioId ?? null,
      t.monto,
      deUsuario ? '1234567' : null,
      estado,
      t.motivo ?? (estado === 'RECHAZADA' ? 'SALDO_INSUFICIENTE' : null),
      deUsuario ? (t.llave ?? randomUUID()) : null,
      deUsuario ? createHash('sha256').update(randomUUID()).digest('hex') : null,
      t.instante,
      estado === 'APLICADA' ? t.instante : null,
    ],
  );
  return rows[0]?.id ?? '';
}

export interface DatosAsiento {
  cuenta: string;
  monto: number;
  tipo: string;
  instante: string;
}

export async function insertarAsientos(
  c: pg.Client,
  transferenciaId: string,
  asientos: DatosAsiento[],
): Promise<void> {
  for (const a of asientos) {
    await c.query(
      `INSERT INTO asiento (transferencia_id, cuenta_id, monto_centavos, tipo_movimiento, creado_en)
       VALUES ($1, $2, $3, $4, $5)`,
      [transferenciaId, a.cuenta, a.monto, a.tipo, a.instante],
    );
  }
}

export interface Escenario {
  a: UsuarioDePrueba;
  b: UsuarioDePrueba;
  /** Beneficiarios: de A hacia la Principal y la Ahorro de B; de B hacia la Principal de A. */
  beneficiarioAaB: string;
  beneficiarioAaBAhorro: string;
  beneficiarioBaA: string;
  /** TERCERO A → B aplicada, con sus dos asientos. */
  aplicada: string;
  rechazada: string;
  pendiente: string;
}

/**
 * A con $10,000.00 y B con $5,000.00 por FONDEO; beneficiarios cruzados; una transferencia
 * aplicada, una rechazada y una pendiente con su código; una sesión y un evento de auditoría.
 * Todo como billetera_app, por el camino real de los triggers.
 */
export async function prepararEscenario(dataSource: DataSource): Promise<Escenario> {
  const a = await crearUsuarioConCuentas(dataSource);
  const b = await crearUsuarioConCuentas(dataSource);
  await fondear(dataSource, a.principalId, 1_000_000);
  await fondear(dataSource, b.principalId, 500_000);

  return ejecutar('app', async (c) => {
    const clabe = async (cuenta: string) =>
      (await c.query<{ clabe: string }>('SELECT clabe FROM cuenta WHERE id = $1', [cuenta])).rows[0]
        ?.clabe;
    const beneficiario = async (usuario: string, cuenta: string, alias: string) =>
      (
        await c.query<{ id: string }>(
          `INSERT INTO beneficiario (usuario_id, cuenta_id, nombre, alias, clabe)
           VALUES ($1, $2, 'Persona de prueba', $3, $4) RETURNING id`,
          [usuario, cuenta, alias, await clabe(cuenta)],
        )
      ).rows[0]?.id ?? '';

    const beneficiarioAaB = await beneficiario(a.usuarioId, b.principalId, 'B principal');
    const beneficiarioAaBAhorro = await beneficiario(a.usuarioId, b.ahorroId, 'B ahorro');
    const beneficiarioBaA = await beneficiario(b.usuarioId, a.principalId, 'A principal');

    const t = await ahora(c);
    const aplicada = await insertarTransferencia(c, {
      tipo: 'TERCERO',
      usuarioId: a.usuarioId,
      origen: a.principalId,
      destino: b.principalId,
      beneficiarioId: beneficiarioAaB,
      monto: 10_000,
      instante: t,
    });
    await insertarAsientos(c, aplicada, [
      { cuenta: a.principalId, monto: -10_000, tipo: 'ENVIO', instante: t },
      { cuenta: b.principalId, monto: 10_000, tipo: 'RECEPCION', instante: t },
    ]);
    const rechazada = await insertarTransferencia(c, {
      tipo: 'TERCERO',
      usuarioId: a.usuarioId,
      origen: a.principalId,
      destino: b.principalId,
      monto: 20_000,
      estado: 'RECHAZADA',
      instante: t,
    });
    const pendiente = await insertarTransferencia(c, {
      tipo: 'TERCERO',
      usuarioId: a.usuarioId,
      origen: a.principalId,
      destino: b.principalId,
      monto: 2_000_000,
      estado: 'PENDIENTE_CONFIRMACION',
      instante: t,
    });
    await c.query(
      `INSERT INTO codigo_confirmacion (transferencia_id, codigo_hmac, expira_en)
       VALUES ($1, $2, now() + interval '5 minutes')`,
      [pendiente, createHash('sha256').update(randomUUID()).digest('hex')],
    );
    await c.query(
      `INSERT INTO sesion (usuario_id, familia_id, refresh_hash, expira_en)
       VALUES ($1, $2, $3, now() + interval '7 days')`,
      [a.usuarioId, randomUUID(), createHash('sha256').update(randomUUID()).digest('hex')],
    );
    await c.query(
      `INSERT INTO evento_auditoria (tipo, usuario_id, request_id, datos)
       VALUES ('transferencia-aplicada', $1, 'prueba', $2)`,
      [a.usuarioId, { transferenciaId: aplicada }],
    );
    return {
      a,
      b,
      beneficiarioAaB,
      beneficiarioAaBAhorro,
      beneficiarioBaA,
      aplicada,
      rechazada,
      pendiente,
    };
  });
}
