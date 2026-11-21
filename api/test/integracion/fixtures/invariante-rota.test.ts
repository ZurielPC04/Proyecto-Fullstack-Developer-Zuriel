// Casos que rompen A PROPÓSITO una sola invariante cada uno (T-API-09). Solo corren como
// subproceso con PRUEBAS_FIXTURE=1, desde test/integracion/arnes/invariantes.test.ts: las
// pruebas no afirman nada; lo que debe fallar es el afterEach global de por-archivo.ts.
// Con el rol dueño se desactiva un trigger dentro de la transacción para poder romperla.
import { randomInt, randomUUID } from 'node:crypto';
import { digitoVerificador } from '@billetera/shared';
import pg from 'pg';
import { afterAll, it } from 'vitest';
import { urlDueno } from '../apoyo/base.js';
import { truncar } from '../apoyo/limpieza.js';

const FONDEO_ID = '00000000-0000-0000-0000-000000000001';

afterAll(async () => {
  // El proceso principal sigue con la base abierta: se deja vacía y cuadrada.
  await truncar();
});

function clabeAleatoria(): string {
  let primeros = '999180';
  for (let i = 0; i < 11; i++) primeros += String(randomInt(0, 10));
  return `${primeros}${digitoVerificador(primeros)}`;
}

async function enTransaccion(trabajo: (c: pg.Client) => Promise<void>): Promise<void> {
  const cliente = new pg.Client({ connectionString: urlDueno() });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    await trabajo(cliente);
    await cliente.query('COMMIT');
  } finally {
    await cliente.end();
  }
}

async function cuentaNueva(c: pg.Client, saldo = 0): Promise<string> {
  const {
    rows: [usuario],
  } = await c.query<{ id: string }>(
    'INSERT INTO usuario (correo, hash_contrasena) VALUES ($1, $2) RETURNING id',
    [`roto-${randomUUID()}@prueba.mx`, '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'],
  );
  const {
    rows: [cuenta],
  } = await c.query<{ id: string }>(
    `INSERT INTO cuenta (usuario_id, tipo, nombre, clabe, saldo_centavos)
     VALUES ($1, 'USUARIO', 'Principal', $2, $3) RETURNING id`,
    [usuario?.id, clabeAleatoria(), saldo],
  );
  return cuenta?.id ?? '';
}

it('rompe solo saldo = SUM(asientos)', async () => {
  // +500 en una cuenta y −500 en Fondeo, sin asientos: la suma global sigue en 0.
  await enTransaccion(async (c) => {
    await cuentaNueva(c, 500);
    await c.query('ALTER TABLE cuenta DISABLE TRIGGER tg_cuenta_protegida');
    await c.query('UPDATE cuenta SET saldo_centavos = saldo_centavos - 500 WHERE id = $1', [
      FONDEO_ID,
    ]);
    await c.query('ALTER TABLE cuenta ENABLE TRIGGER tg_cuenta_protegida');
  });
});

it('rompe solo SUM(saldo) = 0', async () => {
  // Una APLICADA con 2 asientos que no suman 0 (−500 y +600): cada saldo es la suma de sus
  // asientos, pero el total queda en +100.
  await enTransaccion(async (c) => {
    const destino = await cuentaNueva(c);
    await c.query('ALTER TABLE transferencia DISABLE TRIGGER tg_transferencia_cuadra');
    await c.query('ALTER TABLE asiento DISABLE TRIGGER tg_asiento_cuadra');
    const {
      rows: [t],
    } = await c.query<{ id: string; ahora: string }>(
      `INSERT INTO transferencia (tipo, cuenta_origen_id, cuenta_destino_id, monto_centavos, concepto,
                                  estado, creado_en, aplicada_en)
       VALUES ('FONDEO', $1, $2, 500, 'Depósito', 'APLICADA', clock_timestamp(), clock_timestamp())
       RETURNING id, aplicada_en AS ahora`,
      [FONDEO_ID, destino],
    );
    await c.query(
      `INSERT INTO asiento (transferencia_id, cuenta_id, monto_centavos, tipo_movimiento, creado_en)
       VALUES ($1, $2, -500, 'FONDEO_SALIDA', $4), ($1, $3, 600, 'DEPOSITO', $4)`,
      [t?.id, FONDEO_ID, destino, t?.ahora],
    );
    await c.query('ALTER TABLE asiento ENABLE TRIGGER tg_asiento_cuadra');
    await c.query('ALTER TABLE transferencia ENABLE TRIGGER tg_transferencia_cuadra');
  });
});

it('rompe solo APLICADA con exactamente 2 asientos', async () => {
  // Una APLICADA sin asientos: los saldos no se movieron, así que las otras dos se cumplen.
  await enTransaccion(async (c) => {
    const destino = await cuentaNueva(c);
    await c.query('ALTER TABLE transferencia DISABLE TRIGGER tg_transferencia_cuadra');
    await c.query(
      `INSERT INTO transferencia (tipo, cuenta_origen_id, cuenta_destino_id, monto_centavos, concepto,
                                  estado, creado_en, aplicada_en)
       VALUES ('FONDEO', $1, $2, 500, 'Depósito', 'APLICADA', clock_timestamp(), clock_timestamp())`,
      [FONDEO_ID, destino],
    );
    await c.query('ALTER TABLE transferencia ENABLE TRIGGER tg_transferencia_cuadra');
  });
});
