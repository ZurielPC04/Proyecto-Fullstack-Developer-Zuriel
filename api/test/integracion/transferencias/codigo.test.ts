import { createHmac, randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RelojFijo } from '../../../src/plataforma/reloj/index.js';
import { configDePrueba } from '../../apoyo/app.js';
import { appReal, type AppReal } from '../apoyo/app-real.js';
import { abrirDataSource } from '../apoyo/base.js';
import { crearUsuarioConCuentas, fondear, type UsuarioDePrueba } from '../apoyo/fabricas.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';
import {
  altaBeneficiario,
  asientosDe,
  confirmar,
  consultar,
  cuerpo,
  eventosDe,
  limites,
  saldo,
  transferenciasDe,
  transferir,
} from './apoyo.js';

// America/Mexico_City es UTC-6 todo el año (sin horario de verano desde 2022).
const T0 = '2026-12-01 18:00:00+00'; // 12:00 local
const T0_MAS_1 = '2026-12-01 18:01:00+00';
const T0_MAS_5 = '2026-12-01 18:05:00+00'; // vence exactamente aquí
const SECRETO = configDePrueba().OTP_HMAC_SECRETO;

const reloj = new RelojFijo(T0);
let dataSource: DataSource;
let real: AppReal;
let app: AppReal['app'];

beforeAll(async () => {
  dataSource = await abrirDataSource();
  real = await appReal(dataSource, { reloj });
  app = real.app;
});

afterAll(async () => {
  await dataSource.destroy();
});

interface Escenario {
  emisor: UsuarioDePrueba;
  receptor: UsuarioDePrueba;
  aTercero: (monto: number) => ReturnType<typeof cuerpo>;
}

async function escenario(saldoInicial = 20_000_000): Promise<Escenario> {
  reloj.fijar(T0);
  const emisor = await crearUsuarioConCuentas(dataSource);
  const receptor = await crearUsuarioConCuentas(dataSource);
  await fondear(dataSource, emisor.principalId, saldoInicial);
  const beneficiarioId = await altaBeneficiario(app, emisor.usuarioId, receptor.principalId);
  return {
    emisor,
    receptor,
    aTercero: (monto) =>
      cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, monto),
  };
}

/** Crea una pendiente de `monto` y devuelve su id y el código simulado. */
async function pendiente(e: Escenario, monto = 1_500_000) {
  const respuesta = await transferir(app, e.emisor.usuarioId, e.aTercero(monto));
  expect(respuesta.status).toBe(202);
  return {
    id: respuesta.body.transferenciaId as string,
    codigo: respuesta.body.codigoSimulado as string,
  };
}

/** Un código de 6 dígitos distinto del correcto. */
const otroCodigo = (codigo: string) => String((Number(codigo) + 1) % 1_000_000).padStart(6, '0');

const intentosDe = async (id: string) =>
  (
    await consultarComoDueno<{ intentos: number }>(
      'SELECT intentos FROM codigo_confirmacion WHERE transferencia_id = $1',
      [id],
    )
  )[0]?.intentos;

describe('T-API-20 · creación con código', () => {
  it('R-6.8 a tercero por exactamente 1000000 no pide código', async () => {
    const e = await escenario();
    expect((await transferir(app, e.emisor.usuarioId, e.aTercero(1_000_000))).status).toBe(201);
  });

  it('R-6.8 R-6.17 sobre el umbral: 202 con codigoSimulado y vencimiento a 5 minutos, sin mover dinero', async () => {
    const e = await escenario();
    const llave = randomUUID();
    const respuesta = await transferir(app, e.emisor.usuarioId, e.aTercero(1_000_001), llave);

    expect(respuesta.status).toBe(202);
    expect(respuesta.body).toEqual({
      transferenciaId: expect.any(String),
      estado: 'PENDIENTE_CONFIRMACION',
      montoCentavos: 1_000_001,
      codigoExpiraEn: '2026-12-01T18:05:00.000000Z',
      codigoSimulado: expect.stringMatching(/^[0-9]{6}$/),
    });
    const id = respuesta.body.transferenciaId as string;
    expect(await saldo(e.emisor.principalId)).toBe(20_000_000);
    expect(await saldo(e.receptor.principalId)).toBe(0);
    expect(await asientosDe(id)).toEqual([]);
    const [fila] = await transferenciasDe(e.emisor.usuarioId);
    expect(fila).toMatchObject({ id, estado: 'PENDIENTE_CONFIRMACION', tipo: 'TERCERO' });
    expect(await eventosDe(e.emisor.usuarioId, ['transferencia-pendiente'])).toEqual([
      {
        tipo: 'transferencia-pendiente',
        datos: {
          transferenciaId: id,
          montoCentavos: 1_000_001,
          codigoExpiraEn: '2026-12-01T18:05:00.000000Z',
        },
      },
    ]);
    // R-6.3 D-14: la pendiente no reserva límite.
    expect((await limites(app, e.emisor.usuarioId)).body).toMatchObject({ consumidoCentavos: 0 });
  });

  it('R-6.9 un traspaso por encima del umbral no pide código', async () => {
    const e = await escenario();
    const traspaso = cuerpo(
      e.emisor.principalId,
      { tipo: 'CUENTA_PROPIA', cuentaId: e.emisor.ahorroId },
      3_000_000,
    );
    expect((await transferir(app, e.emisor.usuarioId, traspaso)).status).toBe(201);
  });

  it('DD-31 sin saldo para la pendiente: se rechaza de inmediato y no se genera código', async () => {
    const e = await escenario(1_000);
    const respuesta = await transferir(app, e.emisor.usuarioId, e.aTercero(1_500_000));
    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ type: 'saldo-insuficiente' });
    expect(
      await consultarComoDueno('SELECT 1 FROM codigo_confirmacion WHERE transferencia_id = $1', [
        respuesta.body.transferenciaId,
      ]),
    ).toEqual([]);
  });

  it('R-4.14 DD-25 DD-32 la repetición del 202 es idéntica salvo codigoSimulado, también después de aplicarla', async () => {
    const e = await escenario();
    const llave = randomUUID();
    const primera = await transferir(app, e.emisor.usuarioId, e.aTercero(1_500_000), llave);
    const { codigoSimulado, ...sinCodigo } = primera.body as Record<string, unknown>;
    expect(codigoSimulado).toMatch(/^[0-9]{6}$/);

    const repeticion = await transferir(app, e.emisor.usuarioId, e.aTercero(1_500_000), llave);
    expect(repeticion.status).toBe(202);
    expect(repeticion.body).toEqual(sinCodigo);
    expect(repeticion.body).not.toHaveProperty('codigoSimulado');

    expect(
      (
        await confirmar(
          app,
          e.emisor.usuarioId,
          sinCodigo['transferenciaId'] as string,
          codigoSimulado as string,
        )
      ).status,
    ).toBe(201);
    const trasAplicar = await transferir(app, e.emisor.usuarioId, e.aTercero(1_500_000), llave);
    expect(trasAplicar.status).toBe(202);
    expect(trasAplicar.body).toEqual(sinCodigo);
  });

  it('R-6.16 el código no se guarda en claro: solo su HMAC con el id, y no aparece en auditoría ni logs', async () => {
    const e = await escenario();
    const { id, codigo } = await pendiente(e);
    const [fila] = await consultarComoDueno<{ codigo_hmac: string }>(
      'SELECT codigo_hmac FROM codigo_confirmacion WHERE transferencia_id = $1',
      [id],
    );
    expect(fila?.codigo_hmac).toBe(
      createHmac('sha256', SECRETO).update(`${id}:${codigo}`).digest('hex'),
    );
    const eventos = await consultarComoDueno<{ datos: unknown }>(
      'SELECT datos FROM evento_auditoria',
    );
    expect(JSON.stringify(eventos)).not.toContain(codigo);
    expect(real.salidaLog()).not.toContain(codigo);
  });
});

describe('T-API-20 · POST /transferencias/{id}/confirmar', () => {
  it('R-6.10 con el código correcto y vigente: 201 con comprobante, dinero movido y aplicadaEn de la confirmación', async () => {
    const e = await escenario();
    const { id, codigo } = await pendiente(e);
    reloj.fijar(T0_MAS_1);

    const respuesta = await confirmar(app, e.emisor.usuarioId, id, codigo);
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      transferenciaId: id,
      estado: 'APLICADA',
      tipo: 'TERCERO',
      montoCentavos: 1_500_000,
      creadaEn: '2026-12-01T18:00:00.000000Z',
      aplicadaEn: '2026-12-01T18:01:00.000000Z',
    });
    expect(await saldo(e.emisor.principalId)).toBe(18_500_000);
    expect(await saldo(e.receptor.principalId)).toBe(1_500_000);
    expect(await eventosDe(e.emisor.usuarioId, ['transferencia-aplicada'])).toHaveLength(1);
  });

  it('R-6.13 confirmar una ya aplicada repite el mismo 201 sin consumir intentos', async () => {
    const e = await escenario();
    const { id, codigo } = await pendiente(e);
    const primera = await confirmar(app, e.emisor.usuarioId, id, codigo);
    const segunda = await confirmar(app, e.emisor.usuarioId, id, otroCodigo(codigo));
    expect(segunda.status).toBe(201);
    expect(segunda.body).toEqual(primera.body);
    expect(await intentosDe(id)).toBe(0);
    expect(await saldo(e.receptor.principalId)).toBe(1_500_000);
  });

  it('R-6.10 DD-31 código correcto pero ya sin saldo al confirmar: 422 saldo-insuficiente', async () => {
    const e = await escenario(2_000_000);
    const { id, codigo } = await pendiente(e);
    const vaciar = cuerpo(
      e.emisor.principalId,
      { tipo: 'CUENTA_PROPIA', cuentaId: e.emisor.ahorroId },
      1_000_000,
    );
    expect((await transferir(app, e.emisor.usuarioId, vaciar)).status).toBe(201);

    const respuesta = await confirmar(app, e.emisor.usuarioId, id, codigo);
    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({
      type: 'saldo-insuficiente',
      motivo: 'SALDO_INSUFICIENTE',
      transferenciaId: id,
    });
    expect(await asientosDe(id)).toEqual([]);
    expect((await consultar(app, e.emisor.usuarioId, id)).body).toMatchObject({
      estado: 'RECHAZADA',
    });
  });

  it('R-6.10 código correcto pero el límite se agotó mientras tanto: 422 limite-diario-excedido', async () => {
    const e = await escenario();
    const { id, codigo } = await pendiente(e, 1_500_000);
    for (let i = 0; i < 4; i++) {
      expect((await transferir(app, e.emisor.usuarioId, e.aTercero(1_000_000))).status).toBe(201);
    }
    const respuesta = await confirmar(app, e.emisor.usuarioId, id, codigo);
    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ type: 'limite-diario-excedido', transferenciaId: id });
  });

  it('R-6.11 cada fallo cuenta de forma persistente con intentosRestantes, se audita y el tercero agota', async () => {
    const e = await escenario();
    const { id, codigo } = await pendiente(e);
    const malo = otroCodigo(codigo);

    const primero = await confirmar(app, e.emisor.usuarioId, id, malo);
    expect(primero.status).toBe(422);
    expect(primero.body).toEqual({
      type: 'codigo-incorrecto',
      title: 'Código incorrecto',
      status: 422,
      detail: 'El código es incorrecto. Inténtalo de nuevo.',
      transferenciaId: id,
      intentosRestantes: 2,
    });
    expect(await intentosDe(id)).toBe(1);

    const segundo = await confirmar(app, e.emisor.usuarioId, id, malo);
    expect(segundo.body).toMatchObject({ type: 'codigo-incorrecto', intentosRestantes: 1 });
    expect(await intentosDe(id)).toBe(2);

    const tercero = await confirmar(app, e.emisor.usuarioId, id, malo);
    expect(tercero.status).toBe(422);
    expect(tercero.body).toMatchObject({
      type: 'codigo-agotado',
      motivo: 'CODIGO_AGOTADO',
      transferenciaId: id,
    });
    expect(await intentosDe(id)).toBe(3);

    expect(
      await eventosDe(e.emisor.usuarioId, ['codigo-incorrecto', 'transferencia-rechazada']),
    ).toEqual([
      { tipo: 'codigo-incorrecto', datos: { transferenciaId: id, intentos: 1 } },
      { tipo: 'codigo-incorrecto', datos: { transferenciaId: id, intentos: 2 } },
      { tipo: 'codigo-incorrecto', datos: { transferenciaId: id, intentos: 3 } },
      {
        tipo: 'transferencia-rechazada',
        datos: { transferenciaId: id, motivo: 'CODIGO_AGOTADO', montoCentavos: 1_500_000 },
      },
    ]);

    // R-6.15: rechazada por código, ni el código correcto la revive.
    const despues = await confirmar(app, e.emisor.usuarioId, id, codigo);
    expect(despues.body).toEqual(tercero.body);
    expect(await saldo(e.receptor.principalId)).toBe(0);
  });

  it('R-6.12 vencido (expira_en = ahora): confirmar la rechaza con 422 codigo-expirado', async () => {
    const e = await escenario();
    const { id, codigo } = await pendiente(e);
    reloj.fijar(T0_MAS_5);
    const respuesta = await confirmar(app, e.emisor.usuarioId, id, codigo);
    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({
      type: 'codigo-expirado',
      motivo: 'CODIGO_EXPIRADO',
      transferenciaId: id,
    });
    expect(await intentosDe(id)).toBe(0);
    expect(await saldo(e.receptor.principalId)).toBe(0);
  });

  it('R-6.12 vencido: la primera consulta por GET la deja RECHAZADA/CODIGO_EXPIRADO y lo audita', async () => {
    const e = await escenario();
    const { id } = await pendiente(e);
    expect((await consultar(app, e.emisor.usuarioId, id)).body).toMatchObject({
      estado: 'PENDIENTE_CONFIRMACION',
      codigoExpiraEn: '2026-12-01T18:05:00.000000Z',
    });

    reloj.fijar(T0_MAS_5);
    const vencida = await consultar(app, e.emisor.usuarioId, id);
    expect(vencida.status).toBe(200);
    expect(vencida.body).toMatchObject({
      estado: 'RECHAZADA',
      motivoRechazo: 'CODIGO_EXPIRADO',
      codigoExpiraEn: null,
    });
    expect(await eventosDe(e.emisor.usuarioId, ['transferencia-rechazada'])).toEqual([
      {
        tipo: 'transferencia-rechazada',
        datos: { transferenciaId: id, motivo: 'CODIGO_EXPIRADO', montoCentavos: 1_500_000 },
      },
    ]);
    // Idempotente en su efecto: una segunda consulta no cambia ni audita nada más.
    await consultar(app, e.emisor.usuarioId, id);
    expect(await eventosDe(e.emisor.usuarioId, ['transferencia-rechazada'])).toHaveLength(1);
  });

  it('R-6.14 confirmar una ajena o inexistente: el mismo 404', async () => {
    const e = await escenario();
    const otro = await crearUsuarioConCuentas(dataSource);
    const { id, codigo } = await pendiente(e);
    const ajena = await confirmar(app, otro.usuarioId, id, codigo);
    const inexistente = await confirmar(app, e.emisor.usuarioId, randomUUID(), codigo);
    expect(ajena.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(ajena.body).toEqual(inexistente.body);
    expect(await intentosDe(id)).toBe(0);
  });

  it('R-6.6 una pendiente creada a las 23:58 y confirmada a las 00:01 cuenta en el día nuevo', async () => {
    const e = await escenario();
    reloj.fijar('2026-12-02 05:58:00+00'); // 23:58 del 1, hora local
    const { id, codigo } = await pendiente(e, 1_500_000);
    reloj.fijar('2026-12-02 05:59:00+00');
    for (let i = 0; i < 5; i++) {
      expect((await transferir(app, e.emisor.usuarioId, e.aTercero(1_000_000))).status).toBe(201);
    }

    reloj.fijar('2026-12-02 06:01:00+00'); // 00:01 del 2, hora local
    const respuesta = await confirmar(app, e.emisor.usuarioId, id, codigo);
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.aplicadaEn).toBe('2026-12-02T06:01:00.000000Z');
    expect((await limites(app, e.emisor.usuarioId)).body).toMatchObject({
      consumidoCentavos: 1_500_000,
      dia: '2026-12-02',
    });
    reloj.fijar('2026-12-02 05:59:59.999999+00');
    expect((await limites(app, e.emisor.usuarioId)).body).toMatchObject({
      consumidoCentavos: 5_000_000,
      dia: '2026-12-01',
    });
  });

  it('R-6.11 el código debe ser de 6 dígitos: otro formato es 400 y no consume intentos', async () => {
    const e = await escenario();
    const { id } = await pendiente(e);
    const respuesta = await confirmar(app, e.emisor.usuarioId, id, '12345');
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toContainEqual(
      expect.objectContaining({ campo: 'body.codigo' }),
    );
    expect(await intentosDe(id)).toBe(0);
  });
});
