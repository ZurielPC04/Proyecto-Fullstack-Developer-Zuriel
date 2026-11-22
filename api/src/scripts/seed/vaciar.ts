// design.md §3.7: vacía las tablas de datos como billetera_owner y repone Fondeo con saldo 0,
// igual que la migración 1. TRUNCATE no dispara los triggers de fila de inmutabilidad (§3.3).
import type pg from 'pg';

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

export async function vaciar(dueno: pg.Client): Promise<void> {
  await dueno.query('BEGIN');
  try {
    // RESTART IDENTITY: los ids de asiento vuelven a empezar y dos corridas coinciden.
    await dueno.query(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE`);
    await dueno.query(`
      INSERT INTO cuenta (id, usuario_id, tipo, nombre, clabe)
      VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'SISTEMA', 'Fondeo', '999000000000000001')`);
    await dueno.query('COMMIT');
  } catch (error) {
    await dueno.query('ROLLBACK');
    throw error;
  }
}
