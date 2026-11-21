// design.md §14.2: limpieza por archivo e invariantes después de cada prueba, como dueño.
import pg from 'pg';
import { exigirBaseDePruebas } from '../../apoyo/guarda-base-pruebas.js';
import { urlDueno } from './base.js';

/** Tablas de datos; TRUNCATE no dispara los triggers de fila de inmutabilidad (§3.3). */
const TABLAS = [
  'evento_auditoria',
  'sesion',
  'codigo_confirmacion',
  'asiento',
  'transferencia',
  'beneficiario',
  'cuenta',
  'usuario',
];

async function conDueno<T>(trabajo: (cliente: pg.Client) => Promise<T>): Promise<T> {
  const url = urlDueno();
  exigirBaseDePruebas(url);
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return await trabajo(cliente);
  } finally {
    await cliente.end();
  }
}

/** Vacía las tablas de datos y vuelve a poner Fondeo con saldo 0, igual que la migración 1. */
export async function truncar(): Promise<void> {
  await conDueno(async (cliente) => {
    await cliente.query('BEGIN');
    try {
      await cliente.query(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE`);
      await cliente.query(`
        INSERT INTO cuenta (id, usuario_id, tipo, nombre, clabe)
        VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'SISTEMA', 'Fondeo', '999000000000000001')
      `);
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    }
  });
}

export const INVARIANTES = {
  saldo: 'invariante saldo = SUM(asientos) por cuenta (D-01)',
  suma: 'invariante SUM(saldo) = 0 (D-02)',
  asientos: 'invariante APLICADA con exactamente 2 asientos y ninguna otra con asientos (DD-17)',
} as const;

/** §14.2: lanza con la lista de invariantes rotas, si hay alguna. */
export async function verificarInvariantes(): Promise<void> {
  const rotas = await conDueno(async (cliente) => {
    const errores: string[] = [];
    const saldo = await cliente.query<{ id: string }>(`
      SELECT c.id FROM cuenta c LEFT JOIN asiento a ON a.cuenta_id = c.id
       GROUP BY c.id
      HAVING c.saldo_centavos <> coalesce(sum(a.monto_centavos), 0)`);
    if (saldo.rowCount)
      errores.push(`${INVARIANTES.saldo}: ${saldo.rows.map((r) => r.id).join(', ')}`);

    const suma = await cliente.query<{ cuadra: boolean }>(
      'SELECT coalesce(sum(saldo_centavos), 0) = 0 AS cuadra FROM cuenta',
    );
    if (!suma.rows[0]?.cuadra) errores.push(INVARIANTES.suma);

    const asientos = await cliente.query<{ id: string }>(`
      SELECT t.id FROM transferencia t LEFT JOIN asiento a ON a.transferencia_id = t.id
       GROUP BY t.id
      HAVING (t.estado = 'APLICADA' AND count(a.id) <> 2)
          OR (t.estado <> 'APLICADA' AND count(a.id) > 0)`);
    if (asientos.rowCount) {
      errores.push(`${INVARIANTES.asientos}: ${asientos.rows.map((r) => r.id).join(', ')}`);
    }
    return errores;
  });
  if (rotas.length > 0) throw new Error(`La base no cuadra:\n- ${rotas.join('\n- ')}`);
}
