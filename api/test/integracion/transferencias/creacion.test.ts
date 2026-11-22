import { randomUUID } from 'node:crypto';
import { instanteIso } from '@billetera/shared';
import pg from 'pg';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registrarParsers } from '../../../src/plataforma/db/parsers.js';
import { appReal, type AppReal } from '../apoyo/app-real.js';
import { abrirDataSource, urlDueno } from '../apoyo/base.js';
import {
  crearUsuarioConCuentas,
  FONDEO_ID,
  fondear,
  type UsuarioDePrueba,
} from '../apoyo/fabricas.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';
import {
  altaBeneficiario,
  asientosDe,
  clabeDe,
  consultar,
  cuerpo,
  eventosDe,
  saldo,
  transferenciasDe,
  transferir,
} from './apoyo.js';

let dataSource: DataSource;
let app: AppReal['app'];

beforeAll(async () => {
  registrarParsers();
  dataSource = await abrirDataSource();
  ({ app } = await appReal(dataSource));
});

afterAll(async () => {
  await dataSource.destroy();
});

async function emisorConSaldo(monto: number): Promise<UsuarioDePrueba> {
  const usuario = await crearUsuarioConCuentas(dataSource);
  await fondear(dataSource, usuario.principalId, monto);
  return usuario;
}

describe('T-API-17 · POST /transferencias aplicada', () => {
  it('R-4.1 R-4.2 a un beneficiario de otro usuario: 201, TERCERO, saldos y dos asientos ENVIO/RECEPCION', async () => {
    const emisor = await emisorConSaldo(10_000);
    const receptor = await crearUsuarioConCuentas(dataSource);
    const beneficiarioId = await altaBeneficiario(
      app,
      emisor.usuarioId,
      receptor.principalId,
      'Juan Pérez',
    );

    const respuesta = await transferir(
      app,
      emisor.usuarioId,
      cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, 2_550),
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      estado: 'APLICADA',
      tipo: 'TERCERO',
      montoCentavos: 2_550,
      concepto: 'Pago de prueba',
      referencia: '1234567',
      origen: {
        cuentaId: emisor.principalId,
        nombre: 'Principal',
        clabeTerminacion: (await clabeDe(emisor.principalId)).slice(-4),
      },
      destino: {
        etiqueta: expect.stringMatching(/^alias-/),
        nombre: 'Juan Pérez',
        clabeTerminacion: (await clabeDe(receptor.principalId)).slice(-4),
      },
    });
    expect(respuesta.body.creadaEn).toBe(respuesta.body.aplicadaEn);
    expect(await saldo(emisor.principalId)).toBe(7_450);
    expect(await saldo(receptor.principalId)).toBe(2_550);
    expect(await asientosDe(respuesta.body.transferenciaId)).toEqual([
      { cuenta_id: emisor.principalId, monto_centavos: -2_550, tipo_movimiento: 'ENVIO' },
      { cuenta_id: receptor.principalId, monto_centavos: 2_550, tipo_movimiento: 'RECEPCION' },
    ]);
    const [fila] = await transferenciasDe(emisor.usuarioId);
    expect(fila).toMatchObject({ estado: 'APLICADA', beneficiario_id: beneficiarioId });
    expect(await eventosDe(emisor.usuarioId, ['transferencia-aplicada'])).toEqual([
      {
        tipo: 'transferencia-aplicada',
        datos: {
          transferenciaId: respuesta.body.transferenciaId,
          tipo: 'TERCERO',
          montoCentavos: 2_550,
          cuentaOrigenId: emisor.principalId,
          cuentaDestinoId: receptor.principalId,
        },
      },
    ]);
  });
});

describe('T-API-17 · rechazos y destinos', () => {
  it('R-4.3 sin saldo: 422 saldo-insuficiente con transferenciaId, fila RECHAZADA sin asientos y sin mover dinero', async () => {
    const emisor = await emisorConSaldo(1_000);
    const receptor = await crearUsuarioConCuentas(dataSource);
    const beneficiarioId = await altaBeneficiario(app, emisor.usuarioId, receptor.principalId);

    const respuesta = await transferir(
      app,
      emisor.usuarioId,
      cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, 1_001),
    );

    expect(respuesta.status).toBe(422);
    expect(respuesta.headers['content-type']).toMatch(/^application\/problem\+json/);
    const [fila] = await transferenciasDe(emisor.usuarioId);
    expect(respuesta.body).toEqual({
      type: 'saldo-insuficiente',
      title: 'Saldo insuficiente',
      status: 422,
      detail: 'La cuenta origen no tiene saldo suficiente para esta transferencia.',
      motivo: 'SALDO_INSUFICIENTE',
      transferenciaId: fila?.id,
    });
    expect(fila).toMatchObject({ estado: 'RECHAZADA', motivo_rechazo: 'SALDO_INSUFICIENTE' });
    expect(await asientosDe(fila?.id ?? '')).toEqual([]);
    expect(await saldo(emisor.principalId)).toBe(1_000);
    expect(await saldo(receptor.principalId)).toBe(0);
    expect(await eventosDe(emisor.usuarioId, ['transferencia-rechazada'])).toEqual([
      {
        tipo: 'transferencia-rechazada',
        datos: { transferenciaId: fila?.id, motivo: 'SALDO_INSUFICIENTE', montoCentavos: 1_001 },
      },
    ]);
  });

  it('R-4.4 origen igual a destino: 422 misma-cuenta sin crear la fila', async () => {
    const emisor = await emisorConSaldo(1_000);
    const respuesta = await transferir(
      app,
      emisor.usuarioId,
      cuerpo(emisor.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: emisor.principalId }, 10),
    );
    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ type: 'misma-cuenta' });
    expect(respuesta.body).not.toHaveProperty('transferenciaId');
    expect(await transferenciasDe(emisor.usuarioId)).toEqual([]);
  });

  it('R-4.4 un beneficiario con la CLABE de la misma cuenta origen también es misma-cuenta', async () => {
    const emisor = await emisorConSaldo(1_000);
    const beneficiarioId = await altaBeneficiario(app, emisor.usuarioId, emisor.principalId);
    const respuesta = await transferir(
      app,
      emisor.usuarioId,
      cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, 10),
    );
    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ type: 'misma-cuenta' });
    expect(await transferenciasDe(emisor.usuarioId)).toEqual([]);
  });

  it('R-4.6 R-4.7 origen ajeno, cuenta ajena, beneficiario ajeno, inexistentes y Fondeo: el mismo 404 sin fila', async () => {
    const emisor = await emisorConSaldo(1_000);
    const otro = await emisorConSaldo(1_000);
    const beneficiarioAjeno = await altaBeneficiario(app, otro.usuarioId, emisor.ahorroId);
    const casos = [
      cuerpo(otro.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: emisor.ahorroId }, 10),
      cuerpo(randomUUID(), { tipo: 'CUENTA_PROPIA', cuentaId: emisor.ahorroId }, 10),
      cuerpo(emisor.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: otro.principalId }, 10),
      cuerpo(emisor.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: randomUUID() }, 10),
      cuerpo(emisor.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: FONDEO_ID }, 10),
      cuerpo(FONDEO_ID, { tipo: 'CUENTA_PROPIA', cuentaId: emisor.ahorroId }, 10),
      cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId: beneficiarioAjeno }, 10),
      cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId: randomUUID() }, 10),
    ];
    const cuerpos: unknown[] = [];
    for (const datos of casos) {
      const respuesta = await transferir(app, emisor.usuarioId, datos);
      expect(respuesta.status).toBe(404);
      cuerpos.push(respuesta.body);
    }
    expect(new Set(cuerpos.map((c) => JSON.stringify(c))).size).toBe(1);
    expect(cuerpos[0]).toMatchObject({ type: 'not-found' });
    expect(await transferenciasDe(emisor.usuarioId)).toEqual([]);
    expect(await saldo(emisor.principalId)).toBe(1_000);
  });

  it('R-4.5 R-4.2 a una cuenta propia: TRASPASO con TRASPASO_SALIDA y TRASPASO_ENTRADA', async () => {
    const emisor = await emisorConSaldo(5_000);
    const respuesta = await transferir(
      app,
      emisor.usuarioId,
      cuerpo(emisor.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: emisor.ahorroId }, 1_200),
    );
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      tipo: 'TRASPASO',
      destino: { etiqueta: 'Ahorro', nombre: 'Ahorro' },
    });
    expect(await asientosDe(respuesta.body.transferenciaId)).toEqual([
      { cuenta_id: emisor.principalId, monto_centavos: -1_200, tipo_movimiento: 'TRASPASO_SALIDA' },
      { cuenta_id: emisor.ahorroId, monto_centavos: 1_200, tipo_movimiento: 'TRASPASO_ENTRADA' },
    ]);
    expect(await saldo(emisor.ahorroId)).toBe(1_200);
  });

  it('R-4.5 DD-17 un beneficiario con CLABE propia es TRASPASO aunque se eligió como beneficiario', async () => {
    const emisor = await emisorConSaldo(5_000);
    const beneficiarioId = await altaBeneficiario(
      app,
      emisor.usuarioId,
      emisor.ahorroId,
      'Mi ahorro',
    );
    const respuesta = await transferir(
      app,
      emisor.usuarioId,
      cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, 700),
    );
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ tipo: 'TRASPASO', destino: { nombre: 'Mi ahorro' } });
    const [fila] = await transferenciasDe(emisor.usuarioId);
    expect(fila).toMatchObject({ tipo: 'TRASPASO', beneficiario_id: beneficiarioId });
  });

  it('R-4.8 R-4.9 R-4.35 monto no entero, cero, texto o sobre el tope, referencia no numérica o sin concepto: 400 sin fila', async () => {
    const emisor = await emisorConSaldo(5_000);
    const valido = cuerpo(
      emisor.principalId,
      { tipo: 'CUENTA_PROPIA', cuentaId: emisor.ahorroId },
      10,
    );
    const casos: [object, string][] = [
      [{ ...valido, montoCentavos: 10.5 }, 'body.montoCentavos'],
      [{ ...valido, montoCentavos: 0 }, 'body.montoCentavos'],
      [{ ...valido, montoCentavos: '10' }, 'body.montoCentavos'],
      [{ ...valido, montoCentavos: 100_000_000_001 }, 'body.montoCentavos'],
      [{ ...valido, referencia: '12a' }, 'body.referencia'],
      [{ ...valido, concepto: '   ' }, 'body.concepto'],
      [{ ...valido, concepto: undefined }, 'body.concepto'],
    ];
    for (const [datos, campo] of casos) {
      const respuesta = await transferir(app, emisor.usuarioId, datos);
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errores).toContainEqual(expect.objectContaining({ campo }));
    }
    expect(await transferenciasDe(emisor.usuarioId)).toEqual([]);
  });
});

describe('T-API-17 · GET /transferencias/{id}', () => {
  it('R-4.10 la propia devuelve su estado real; ajena e inexistente dan el mismo 404', async () => {
    const emisor = await emisorConSaldo(100);
    const otro = await crearUsuarioConCuentas(dataSource);
    const rechazo = await transferir(
      app,
      emisor.usuarioId,
      cuerpo(emisor.principalId, { tipo: 'CUENTA_PROPIA', cuentaId: emisor.ahorroId }, 101),
    );
    const id = rechazo.body.transferenciaId as string;

    const propia = await consultar(app, emisor.usuarioId, id);
    expect(propia.status).toBe(200);
    expect(propia.body).toMatchObject({
      id,
      estado: 'RECHAZADA',
      tipo: 'TRASPASO',
      motivoRechazo: 'SALDO_INSUFICIENTE',
      aplicadaEn: null,
      codigoExpiraEn: null,
      montoCentavos: 101,
    });

    const ajena = await consultar(app, otro.usuarioId, id);
    const inexistente = await consultar(app, emisor.usuarioId, randomUUID());
    expect(ajena.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(ajena.body).toEqual(inexistente.body);
  });
});

describe('T-API-17 · bloqueo de cuentas e instante (D-12, DD-36)', () => {
  it('DD-36 R-4.1 espera el bloqueo de la cuenta destino y lee el instante después de obtenerlo', async () => {
    const emisor = await emisorConSaldo(5_000);
    const receptor = await crearUsuarioConCuentas(dataSource);
    const beneficiarioId = await altaBeneficiario(app, emisor.usuarioId, receptor.principalId);

    // Otra transacción retiene la cuenta destino, como lo haría una transferencia hacia ella.
    const retenedor = new pg.Client({ connectionString: urlDueno() });
    await retenedor.connect();
    let liberadaEn: string;
    let aplicadaEn: string;
    try {
      await retenedor.query('BEGIN');
      await retenedor.query('SELECT id FROM cuenta WHERE id = $1 FOR UPDATE', [
        receptor.principalId,
      ]);
      const enVuelo = transferir(
        app,
        emisor.usuarioId,
        cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, 100),
      );
      await new Promise((resolver) => setTimeout(resolver, 500));
      const { rows } = await retenedor.query<{ ahora: string }>(
        'SELECT clock_timestamp() AS ahora',
      );
      liberadaEn = instanteIso(rows[0]?.ahora ?? '');
      await retenedor.query('COMMIT');
      const respuesta = await enVuelo;
      expect(respuesta.status).toBe(201);
      aplicadaEn = respuesta.body.aplicadaEn as string;
    } finally {
      await retenedor.end();
    }
    // Mismo formato ISO con 6 decimales (DD-22): la comparación de texto ordena en el tiempo.
    expect(aplicadaEn > liberadaEn).toBe(true);
    const [asiento] = await consultarComoDueno<{ creado_en: string }>(
      'SELECT creado_en FROM asiento WHERE cuenta_id = $1',
      [receptor.principalId],
    );
    expect(instanteIso(asiento?.creado_en ?? '')).toBe(aplicadaEn);
  });
});
