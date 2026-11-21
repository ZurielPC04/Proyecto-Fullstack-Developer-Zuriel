import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirDataSource } from '../apoyo/base.js';
import { crearUsuarioConCuentas, fondear } from '../apoyo/fabricas.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('fábricas de datos', () => {
  it('RNF-07 D-02 D-20: crea un usuario con Principal y Ahorro, y fondear mueve el saldo por los triggers', async () => {
    const usuario = await crearUsuarioConCuentas(dataSource);
    await fondear(dataSource, usuario.principalId, 1_000_000);
    await fondear(dataSource, usuario.principalId, 250_000);

    const filas = (await dataSource.query(
      `SELECT nombre, saldo_centavos AS saldo,
              (SELECT count(*)::int FROM asiento a WHERE a.cuenta_id = c.id) AS asientos
         FROM cuenta c WHERE usuario_id = $1 ORDER BY nombre`,
      [usuario.usuarioId],
    )) as { nombre: string; saldo: number; asientos: number }[];
    expect(filas).toEqual([
      { nombre: 'Ahorro', saldo: 0, asientos: 0 },
      { nombre: 'Principal', saldo: 1_250_000, asientos: 2 },
    ]);
    // El afterEach global verifica además las tres invariantes.
  });
});
