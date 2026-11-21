import { setTimeout as dormir } from 'node:timers/promises';
import pg from 'pg';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearTransferencias } from '../../../src/modulos/transferencias/transferencias.casos-uso.js';
import { crearConTransaccion } from '../../../src/plataforma/db/unidad-de-trabajo.js';
import { contextoPeticion } from '../../../src/plataforma/logging/contexto.js';
import { crearLogger } from '../../../src/plataforma/logging/logger.js';
import { RelojBaseDatos } from '../../../src/plataforma/reloj/index.js';
import { abrirDataSource, urlApp } from '../apoyo/base.js';
import { crearUsuarioConCuentas, FONDEO_ID } from '../apoyo/fabricas.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';

let dataSource: DataSource;
const transferencias = crearTransferencias({ reloj: new RelojBaseDatos() });
const conTransaccion = () =>
  crearConTransaccion({ dataSource, logger: crearLogger({ nivel: 'silent' }) });

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

interface Evento {
  tipo: string;
  usuario_id: string | null;
  request_id: string | null;
  datos: Record<string, unknown>;
}

const eventosDe = (usuarioId: string) =>
  consultarComoDueno<Evento>(
    'SELECT tipo, usuario_id, request_id, datos FROM evento_auditoria WHERE usuario_id = $1 ORDER BY id',
    [usuarioId],
  );

describe('fondeo interno (T-API-11)', () => {
  it('R-1.2 D-02 RNF-07: un fondeo deja el saldo, dos asientos, la transferencia APLICADA y un movimiento DEPOSITO', async () => {
    const usuario = await crearUsuarioConCuentas(dataSource);

    const transferenciaId = await conTransaccion()((tx) =>
      transferencias.fondear(tx, usuario.principalId, 1_000_000),
    );

    const [transferencia] = await consultarComoDueno<Record<string, unknown>>(
      `SELECT tipo, estado, usuario_id, cuenta_origen_id, cuenta_destino_id, monto_centavos,
              concepto, llave_idempotencia, referencia, aplicada_en = creado_en AS mismo_instante
         FROM transferencia WHERE id = $1`,
      [transferenciaId],
    );
    expect(transferencia).toEqual({
      tipo: 'FONDEO',
      estado: 'APLICADA',
      usuario_id: null,
      cuenta_origen_id: FONDEO_ID,
      cuenta_destino_id: usuario.principalId,
      monto_centavos: 1_000_000,
      concepto: 'Depósito',
      llave_idempotencia: null,
      referencia: null,
      mismo_instante: true,
    });

    const asientos = await consultarComoDueno<Record<string, unknown>>(
      `SELECT cuenta_id, monto_centavos, tipo_movimiento FROM asiento
        WHERE transferencia_id = $1 ORDER BY monto_centavos`,
      [transferenciaId],
    );
    expect(asientos).toEqual([
      { cuenta_id: FONDEO_ID, monto_centavos: -1_000_000, tipo_movimiento: 'FONDEO_SALIDA' },
      { cuenta_id: usuario.principalId, monto_centavos: 1_000_000, tipo_movimiento: 'DEPOSITO' },
    ]);

    const saldos = await consultarComoDueno<{ id: string; saldo: number }>(
      'SELECT id, saldo_centavos AS saldo FROM cuenta WHERE id = ANY($1) ORDER BY saldo_centavos',
      [[FONDEO_ID, usuario.principalId, usuario.ahorroId]],
    );
    expect(saldos).toEqual([
      { id: FONDEO_ID, saldo: -1_000_000 },
      { id: usuario.ahorroId, saldo: 0 },
      { id: usuario.principalId, saldo: 1_000_000 },
    ]);
  });

  it('RNF-11 DD-40 R-5.9: el fondeo registra fondeo-aplicado del que recibe, con el request ID del contexto', async () => {
    const usuario = await crearUsuarioConCuentas(dataSource);

    const transferenciaId = await contextoPeticion.run({ reqId: 'req-fondeo-1' }, () =>
      conTransaccion()((tx) =>
        transferencias.fondear(tx, usuario.principalId, 250_000, 'Depósito de bienvenida'),
      ),
    );

    expect(await eventosDe(usuario.usuarioId)).toEqual([
      {
        tipo: 'fondeo-aplicado',
        usuario_id: usuario.usuarioId,
        request_id: 'req-fondeo-1',
        datos: { transferenciaId, cuentaDestinoId: usuario.principalId, montoCentavos: 250_000 },
      },
    ]);
    const [{ concepto }] = (await consultarComoDueno<{ concepto: string }>(
      'SELECT concepto FROM transferencia WHERE id = $1',
      [transferenciaId],
    )) as [{ concepto: string }];
    expect(concepto).toBe('Depósito de bienvenida');
  });

  it('DD-40 RNF-11: si la transacción del fondeo se revierte, no queda ni el dinero ni su evento', async () => {
    const usuario = await crearUsuarioConCuentas(dataSource);

    await expect(
      conTransaccion()(async (tx) => {
        await transferencias.fondear(tx, usuario.principalId, 1_000);
        throw new Error('falla después del fondeo');
      }),
    ).rejects.toThrow('falla después del fondeo');

    expect(await eventosDe(usuario.usuarioId)).toEqual([]);
    const [{ n }] = (await consultarComoDueno<{ n: number }>(
      'SELECT count(*)::int AS n FROM transferencia WHERE cuenta_destino_id = $1',
      [usuario.principalId],
    )) as [{ n: number }];
    expect(n).toBe(0);
  });

  it('D-12 DD-36: bloquea al usuario antes que las cuentas y lee el instante después de los bloqueos', async () => {
    const usuario = await crearUsuarioConCuentas(dataSource);
    const bloqueador = new pg.Client({ connectionString: urlApp() });
    const sonda = new pg.Client({ connectionString: urlApp() });
    await bloqueador.connect();
    await sonda.connect();
    try {
      await bloqueador.query('BEGIN');
      await bloqueador.query('SELECT id FROM usuario WHERE id = $1 FOR UPDATE', [
        usuario.usuarioId,
      ]);

      const fondeo = conTransaccion()((tx) =>
        transferencias.fondear(tx, usuario.principalId, 5_000),
      );
      // Espera a que el fondeo quede detenido en el bloqueo del usuario.
      for (let i = 0; i < 100; i++) {
        const { rows } = await sonda.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND datname = current_database()`,
        );
        if ((rows[0]?.n ?? 0) > 0) break;
        await dormir(20);
      }

      // Con el usuario tomado, ninguna cuenta está bloqueada todavía (orden usuario → cuentas).
      await sonda.query('BEGIN');
      const libres = await sonda.query(
        'SELECT id FROM cuenta WHERE id = ANY($1) ORDER BY id FOR UPDATE NOWAIT',
        [[FONDEO_ID, usuario.principalId]],
      );
      expect(libres.rowCount).toBe(2);
      await sonda.query('ROLLBACK');

      const { rows } = await bloqueador.query<{ t: string }>('SELECT clock_timestamp() AS t');
      await bloqueador.query('COMMIT');
      const transferenciaId = await fondeo;

      const [{ despues }] = (await consultarComoDueno<{ despues: boolean }>(
        'SELECT aplicada_en > $2::timestamptz AS despues FROM transferencia WHERE id = $1',
        [transferenciaId, rows[0]?.t],
      )) as [{ despues: boolean }];
      expect(despues).toBe(true);
    } finally {
      await bloqueador.query('ROLLBACK').catch(() => undefined);
      await bloqueador.end();
      await sonda.end();
    }
  });
});
