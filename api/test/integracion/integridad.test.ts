// T-API-10: la base rechaza dinero incoherente (DD-17 y tabla de RNF-06 de §3.3). Cada caso
// inserta o modifica con SQL directo, sin los casos de uso, espera su SQLSTATE y su constraint,
// y verifica después que no cambió ninguna fila ni saldo.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirDataSource } from './apoyo/base.js';
import { clabeAleatoria } from './apoyo/fabricas.js';
import {
  ahora,
  FONDEO_ID,
  fotografia,
  insertarAsientos,
  insertarTransferencia,
  intentar,
  prepararEscenario,
  type Escenario,
  type Rol,
} from './apoyo/sql-directo.js';

let dataSource: DataSource;
let e: Escenario;

beforeAll(async () => {
  dataSource = await abrirDataSource();
  e = await prepararEscenario(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

interface Esperado {
  code: string;
  constraint: string;
}

/** Corre el intento, compara el error y verifica que la base quedó igual. */
async function rechaza(
  rol: Rol,
  esperado: Esperado,
  trabajo: (c: pg.Client) => Promise<unknown>,
): Promise<void> {
  const antes = await fotografia();
  const error = await intentar(rol, trabajo);
  expect({ code: error.code, constraint: error.constraint }).toEqual(esperado);
  expect(await fotografia()).toEqual(antes);
}

const VALIDAR = { code: 'P0001', constraint: 'tg_transferencia_validar' };
const CUADRA_T = { code: 'P0001', constraint: 'tg_transferencia_cuadra' };
const CUADRA_A = { code: 'P0001', constraint: 'tg_asiento_cuadra' };

describe('DD-17: validar_transferencia (clasificación y pertenencia)', () => {
  it('DD-17 RNF-06: TRASPASO hacia la cuenta de otro usuario', async () => {
    await rechaza('app', VALIDAR, async (c) =>
      insertarTransferencia(c, {
        tipo: 'TRASPASO',
        usuarioId: e.a.usuarioId,
        origen: e.a.principalId,
        destino: e.b.principalId,
        monto: 100,
        instante: await ahora(c),
      }),
    );
  });

  it('DD-17 RNF-06: TERCERO hacia una cuenta propia (evade el límite al revés)', async () => {
    await rechaza('app', VALIDAR, async (c) =>
      insertarTransferencia(c, {
        tipo: 'TERCERO',
        usuarioId: e.a.usuarioId,
        origen: e.a.principalId,
        destino: e.a.ahorroId,
        monto: 100,
        instante: await ahora(c),
      }),
    );
  });

  it('DD-17 RNF-06: transferencia de usuario desde una cuenta ajena', async () => {
    await rechaza('app', VALIDAR, async (c) =>
      insertarTransferencia(c, {
        tipo: 'TERCERO',
        usuarioId: e.a.usuarioId,
        origen: e.b.principalId,
        destino: e.b.ahorroId,
        monto: 100,
        instante: await ahora(c),
      }),
    );
  });

  it('DD-17 RNF-06: FONDEO hacia la cuenta Fondeo', async () => {
    await rechaza('app', VALIDAR, async (c) =>
      insertarTransferencia(c, {
        tipo: 'FONDEO',
        usuarioId: null,
        origen: FONDEO_ID,
        destino: FONDEO_ID,
        monto: 100,
        instante: await ahora(c),
      }),
    );
  });

  it('DD-17 RNF-06: FONDEO con origen de usuario', async () => {
    await rechaza('app', VALIDAR, async (c) =>
      insertarTransferencia(c, {
        tipo: 'FONDEO',
        usuarioId: null,
        origen: e.a.principalId,
        destino: e.b.principalId,
        monto: 100,
        instante: await ahora(c),
      }),
    );
  });

  it('DD-17 RNF-06: beneficiario_id de otro usuario', async () => {
    await rechaza('app', VALIDAR, async (c) =>
      insertarTransferencia(c, {
        tipo: 'TERCERO',
        usuarioId: e.a.usuarioId,
        origen: e.a.principalId,
        destino: e.b.principalId,
        beneficiarioId: e.beneficiarioBaA,
        monto: 100,
        estado: 'PENDIENTE_CONFIRMACION',
        instante: await ahora(c),
      }),
    );
  });

  it('DD-17 RNF-06: beneficiario_id que no apunta a la cuenta destino', async () => {
    await rechaza('app', VALIDAR, async (c) =>
      insertarTransferencia(c, {
        tipo: 'TERCERO',
        usuarioId: e.a.usuarioId,
        origen: e.a.principalId,
        destino: e.b.principalId,
        beneficiarioId: e.beneficiarioAaBAhorro,
        monto: 100,
        estado: 'PENDIENTE_CONFIRMACION',
        instante: await ahora(c),
      }),
    );
  });
});

describe('DD-17: verificación diferida al COMMIT', () => {
  async function terceroAplicada(c: pg.Client, monto = 1_000) {
    const t = await ahora(c);
    const id = await insertarTransferencia(c, {
      tipo: 'TERCERO',
      usuarioId: e.a.usuarioId,
      origen: e.a.principalId,
      destino: e.b.principalId,
      monto,
      instante: t,
    });
    return { id, t };
  }

  it('DD-17 RNF-06: APLICADA sin asientos', async () => {
    await rechaza('app', CUADRA_T, async (c) => terceroAplicada(c));
  });

  it('DD-17 RNF-06: APLICADA con un solo asiento', async () => {
    await rechaza('app', CUADRA_T, async (c) => {
      const { id, t } = await terceroAplicada(c);
      await insertarAsientos(c, id, [
        { cuenta: e.a.principalId, monto: -1_000, tipo: 'ENVIO', instante: t },
      ]);
    });
  });

  it('DD-17 RNF-06: APLICADA con dos asientos que no suman cero', async () => {
    await rechaza('app', CUADRA_T, async (c) => {
      const { id, t } = await terceroAplicada(c);
      await insertarAsientos(c, id, [
        { cuenta: e.a.principalId, monto: -1_000, tipo: 'ENVIO', instante: t },
        { cuenta: e.b.principalId, monto: 1_500, tipo: 'RECEPCION', instante: t },
      ]);
    });
  });

  it('DD-17 RNF-06: dos asientos que suman cero pero invertidos (abono en origen, cargo en destino)', async () => {
    await rechaza('app', CUADRA_T, async (c) => {
      const { id, t } = await terceroAplicada(c);
      await insertarAsientos(c, id, [
        { cuenta: e.a.principalId, monto: 1_000, tipo: 'RECEPCION', instante: t },
        { cuenta: e.b.principalId, monto: -1_000, tipo: 'ENVIO', instante: t },
      ]);
    });
  });

  it('DD-17 RNF-06: asientos con tipo de movimiento equivocado (ENVIO en un TRASPASO)', async () => {
    await rechaza('app', CUADRA_T, async (c) => {
      const t = await ahora(c);
      const id = await insertarTransferencia(c, {
        tipo: 'TRASPASO',
        usuarioId: e.a.usuarioId,
        origen: e.a.principalId,
        destino: e.a.ahorroId,
        monto: 1_000,
        instante: t,
      });
      await insertarAsientos(c, id, [
        { cuenta: e.a.principalId, monto: -1_000, tipo: 'ENVIO', instante: t },
        { cuenta: e.a.ahorroId, monto: 1_000, tipo: 'RECEPCION', instante: t },
      ]);
    });
  });

  it('DD-17 RNF-06: asientos con creado_en distinto de aplicada_en', async () => {
    await rechaza('app', CUADRA_T, async (c) => {
      const { id, t } = await terceroAplicada(c);
      const despues = await ahora(c);
      await insertarAsientos(c, id, [
        { cuenta: e.a.principalId, monto: -1_000, tipo: 'ENVIO', instante: t },
        { cuenta: e.b.principalId, monto: 1_000, tipo: 'RECEPCION', instante: despues },
      ]);
    });
  });

  it.each(['rechazada', 'pendiente'] as const)(
    'DD-17 RNF-06: asientos en una transferencia %s ya confirmada',
    async (cual) => {
      await rechaza('app', CUADRA_A, async (c) => {
        const t = await ahora(c);
        await insertarAsientos(c, e[cual], [
          { cuenta: e.a.principalId, monto: -1_000, tipo: 'ENVIO', instante: t },
          { cuenta: e.b.principalId, monto: 1_000, tipo: 'RECEPCION', instante: t },
        ]);
      });
    },
  );
});

describe('RNF-06: invariantes de §3.3 y quién las garantiza', () => {
  it('RNF-06 RNF-07: saldo negativo en cuenta de usuario (CHECK al aplicar el asiento)', async () => {
    await rechaza(
      'app',
      { code: '23514', constraint: 'ck_cuenta_saldo_no_negativo' },
      async (c) => {
        const t = await ahora(c);
        const id = await insertarTransferencia(c, {
          tipo: 'TERCERO',
          usuarioId: e.b.usuarioId,
          origen: e.b.principalId,
          destino: e.a.principalId,
          monto: 600_000,
          instante: t,
        });
        await insertarAsientos(c, id, [
          { cuenta: e.b.principalId, monto: -600_000, tipo: 'ENVIO', instante: t },
          { cuenta: e.a.principalId, monto: 600_000, tipo: 'RECEPCION', instante: t },
        ]);
      },
    );
  });

  it('RNF-06 R-4.16: llave de idempotencia repetida para el mismo usuario', async () => {
    const llave = randomUUID();
    await rechaza(
      'app',
      { code: '23505', constraint: 'uq_transferencia_usuario_llave' },
      async (c) => {
        for (let i = 0; i < 2; i++) {
          await insertarTransferencia(c, {
            tipo: 'TERCERO',
            usuarioId: e.a.usuarioId,
            origen: e.a.principalId,
            destino: e.b.principalId,
            monto: 100,
            estado: 'PENDIENTE_CONFIRMACION',
            llave,
            instante: await ahora(c),
          });
        }
      },
    );
  });

  it('RNF-06: transición APLICADA → RECHAZADA', async () => {
    await rechaza('app', { code: 'P0001', constraint: 'tg_transferencia_transicion' }, (c) =>
      c.query(
        `UPDATE transferencia SET estado = 'RECHAZADA', motivo_rechazo = 'CODIGO_AGOTADO', aplicada_en = NULL
          WHERE id = $1`,
        [e.aplicada],
      ),
    );
  });

  it('RNF-06: transición RECHAZADA → APLICADA', async () => {
    await rechaza('app', { code: 'P0001', constraint: 'tg_transferencia_transicion' }, (c) =>
      c.query(
        `UPDATE transferencia SET estado = 'APLICADA', motivo_rechazo = NULL, aplicada_en = now()
          WHERE id = $1`,
        [e.rechazada],
      ),
    );
  });

  it.each([
    ['monto', 'monto_centavos = monto_centavos + 1'],
    ['origen', 'cuenta_origen_id = cuenta_destino_id'],
    ['tipo', "tipo = 'TRASPASO'"],
    ['llave', 'llave_idempotencia = gen_random_uuid()'],
    ['hash', "hash_peticion = repeat('a', 64)"],
  ])(
    'RNF-06: cambiar %s al resolver una pendiente (rol dueño, para llegar al trigger)',
    async (_campo, cambio) => {
      await rechaza('dueno', { code: 'P0001', constraint: 'tg_transferencia_transicion' }, (c) =>
        c.query(
          `UPDATE transferencia SET estado = 'RECHAZADA', motivo_rechazo = 'CODIGO_EXPIRADO', ${cambio}
            WHERE id = $1`,
          [e.pendiente],
        ),
      );
    },
  );

  it('RNF-06: borrar una transferencia (rol dueño)', async () => {
    await rechaza('dueno', { code: 'P0001', constraint: 'tg_transferencia_transicion' }, (c) =>
      c.query('DELETE FROM transferencia WHERE id = $1', [e.rechazada]),
    );
  });

  it.each([
    ['UPDATE', 'UPDATE asiento SET monto_centavos = monto_centavos WHERE transferencia_id = $1'],
    ['DELETE', 'DELETE FROM asiento WHERE transferencia_id = $1'],
  ])('RNF-06: %s de asientos (rol dueño, asiento_inmutable)', async (_op, sql) => {
    await rechaza('dueno', { code: 'P0001', constraint: 'tg_asiento_inmutable' }, (c) =>
      c.query(sql, [e.aplicada]),
    );
  });

  it('RNF-06 R-4.4: origen igual a destino', async () => {
    await rechaza(
      'app',
      { code: '23514', constraint: 'ck_transferencia_cuentas_distintas' },
      async (c) =>
        insertarTransferencia(c, {
          tipo: 'TRASPASO',
          usuarioId: e.a.usuarioId,
          origen: e.a.principalId,
          destino: e.a.principalId,
          monto: 100,
          instante: await ahora(c),
        }),
    );
  });

  it('RNF-06: monto ≤ 0 en la transferencia', async () => {
    await rechaza('app', { code: '23514', constraint: 'ck_transferencia_monto' }, async (c) =>
      insertarTransferencia(c, {
        tipo: 'TERCERO',
        usuarioId: e.a.usuarioId,
        origen: e.a.principalId,
        destino: e.b.principalId,
        monto: 0,
        estado: 'PENDIENTE_CONFIRMACION',
        instante: await ahora(c),
      }),
    );
  });

  it('RNF-06: monto 0 en un asiento', async () => {
    await rechaza('app', { code: '23514', constraint: 'ck_asiento_monto' }, async (c) =>
      insertarAsientos(c, e.aplicada, [
        { cuenta: e.a.ahorroId, monto: 0, tipo: 'DEPOSITO', instante: await ahora(c) },
      ]),
    );
  });

  it('RNF-06: signo contrario al tipo de movimiento', async () => {
    await rechaza('app', { code: '23514', constraint: 'ck_asiento_signo' }, async (c) =>
      insertarAsientos(c, e.aplicada, [
        { cuenta: e.a.ahorroId, monto: -100, tipo: 'DEPOSITO', instante: await ahora(c) },
      ]),
    );
  });

  it('RNF-07 DD-18: saldo escrito directamente (rol dueño, cuenta_protegida)', async () => {
    await rechaza('dueno', { code: 'P0001', constraint: 'tg_cuenta_protegida' }, (c) =>
      c.query('UPDATE cuenta SET saldo_centavos = saldo_centavos + 1 WHERE id = $1', [
        e.a.principalId,
      ]),
    );
  });
});

describe('RNF-06: referencias rotas (FK)', () => {
  const NADIE = randomUUID();

  it.each([
    [
      'cuenta.usuario_id',
      'fk_cuenta_usuario_id',
      (c: pg.Client) =>
        c.query(
          "INSERT INTO cuenta (usuario_id, tipo, nombre, clabe) VALUES ($1, 'USUARIO', 'Principal', $2)",
          [NADIE, clabeAleatoria()],
        ),
    ],
    [
      'beneficiario.usuario_id',
      'fk_beneficiario_usuario_id',
      (c: pg.Client) =>
        c.query(
          `INSERT INTO beneficiario (usuario_id, cuenta_id, nombre, alias, clabe)
           SELECT $1, id, 'Nadie', 'Nadie', clabe FROM cuenta WHERE id = $2`,
          [NADIE, e.b.principalId],
        ),
    ],
    [
      'transferencia.cuenta_destino_id',
      'fk_transferencia_cuenta_destino_id',
      async (c: pg.Client) =>
        insertarTransferencia(c, {
          tipo: 'TERCERO',
          usuarioId: e.a.usuarioId,
          origen: e.a.principalId,
          destino: NADIE,
          monto: 100,
          estado: 'PENDIENTE_CONFIRMACION',
          instante: await ahora(c),
        }),
    ],
    [
      'asiento.cuenta_id',
      'fk_asiento_cuenta_id',
      async (c: pg.Client) =>
        insertarAsientos(c, e.aplicada, [
          { cuenta: NADIE, monto: 100, tipo: 'DEPOSITO', instante: await ahora(c) },
        ]),
    ],
    [
      'codigo_confirmacion.transferencia_id',
      'fk_codigo_confirmacion_transferencia_id',
      (c: pg.Client) =>
        c.query(
          "INSERT INTO codigo_confirmacion (transferencia_id, codigo_hmac, expira_en) VALUES ($1, repeat('a', 64), now())",
          [NADIE],
        ),
    ],
    [
      'sesion.usuario_id',
      'fk_sesion_usuario_id',
      (c: pg.Client) =>
        c.query(
          "INSERT INTO sesion (usuario_id, familia_id, refresh_hash, expira_en) VALUES ($1, gen_random_uuid(), repeat('b', 64), now() + interval '1 day')",
          [NADIE],
        ),
    ],
  ] as const)('RNF-06: %s inexistente', async (_columna, constraint, trabajo) => {
    await rechaza('app', { code: '23503', constraint }, trabajo);
  });
});
