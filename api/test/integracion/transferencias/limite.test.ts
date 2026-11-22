import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RelojFijo } from '../../../src/plataforma/reloj/index.js';
import { appReal, type AppReal } from '../apoyo/app-real.js';
import { abrirDataSource } from '../apoyo/base.js';
import { crearUsuarioConCuentas, fondear, type UsuarioDePrueba } from '../apoyo/fabricas.js';
import {
  altaBeneficiario,
  asientosDe,
  cuerpo,
  limites,
  saldo,
  transferenciasDe,
  transferir,
} from './apoyo.js';

// America/Mexico_City está en UTC-6 todo el año desde 2022 (sin horario de verano).
const DIA_1_TARDE = '2026-12-01 18:00:00+00'; // 12:00 del 1 de diciembre, hora local
const DIA_1_ULTIMO = '2026-12-02 05:59:59.999999+00'; // 23:59:59.999999 del 1, hora local
const DIA_2_INICIO = '2026-12-02 06:00:00+00'; // 00:00:00 del 2, hora local

const reloj = new RelojFijo(DIA_1_TARDE);
let dataSource: DataSource;
let app: AppReal['app'];

beforeAll(async () => {
  dataSource = await abrirDataSource();
  ({ app } = await appReal(dataSource, { reloj }));
});

afterAll(async () => {
  await dataSource.destroy();
});

interface Escenario {
  emisor: UsuarioDePrueba;
  receptor: UsuarioDePrueba;
  aTercero: (monto: number) => ReturnType<typeof cuerpo>;
}

/** Emisor con saldo de sobra y un beneficiario de otro usuario. */
async function escenario(): Promise<Escenario> {
  reloj.fijar(DIA_1_TARDE);
  const emisor = await crearUsuarioConCuentas(dataSource);
  const receptor = await crearUsuarioConCuentas(dataSource);
  await fondear(dataSource, emisor.principalId, 20_000_000);
  const beneficiarioId = await altaBeneficiario(app, emisor.usuarioId, receptor.principalId);
  return {
    emisor,
    receptor,
    aTercero: (monto) =>
      cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, monto),
  };
}

/** Cuatro envíos de 1000000 (el umbral exacto, sin código): consumido 4000000. */
async function consumirCuatroMillones(e: Escenario): Promise<void> {
  for (let i = 0; i < 4; i++) {
    expect((await transferir(app, e.emisor.usuarioId, e.aTercero(1_000_000))).status).toBe(201);
  }
}

describe('T-API-19 · límite diario', () => {
  it('R-6.1 R-6.7 con consumido 4000000, un envío de 1000000 se aplica y el disponible queda en 0', async () => {
    const e = await escenario();
    await consumirCuatroMillones(e);

    const respuesta = await transferir(app, e.emisor.usuarioId, e.aTercero(1_000_000));
    expect(respuesta.status).toBe(201);
    const limite = await limites(app, e.emisor.usuarioId);
    expect(limite.status).toBe(200);
    expect(limite.body).toEqual({
      limiteCentavos: 5_000_000,
      consumidoCentavos: 5_000_000,
      disponibleCentavos: 0,
      dia: '2026-12-01',
      reiniciaEn: '2026-12-02T06:00:00.000000Z',
    });
  });

  it('R-6.2 un centavo más que el disponible: 422 limite-diario-excedido, fila RECHAZADA y sin mover dinero', async () => {
    const e = await escenario();
    await consumirCuatroMillones(e);
    const saldoAntes = await saldo(e.emisor.principalId);

    const respuesta = await transferir(app, e.emisor.usuarioId, e.aTercero(1_000_001));
    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({
      type: 'limite-diario-excedido',
      title: 'Límite diario excedido',
      motivo: 'LIMITE_DIARIO_EXCEDIDO',
      transferenciaId: expect.any(String),
    });
    expect(await asientosDe(respuesta.body.transferenciaId)).toEqual([]);
    expect(await saldo(e.emisor.principalId)).toBe(saldoAntes);
    // Con RelojFijo todas comparten creado_en: se busca por id, no por orden.
    const filas = await transferenciasDe(e.emisor.usuarioId);
    expect(filas.find((f) => f.id === respuesta.body.transferenciaId)).toMatchObject({
      estado: 'RECHAZADA',
      motivo_rechazo: 'LIMITE_DIARIO_EXCEDIDO',
    });
  });

  it('R-6.3 R-4.5 traspasos, depósitos y rechazadas no cuentan para el límite', async () => {
    const e = await escenario();
    const traspaso = cuerpo(
      e.emisor.principalId,
      { tipo: 'CUENTA_PROPIA', cuentaId: e.emisor.ahorroId },
      6_000_000,
    );
    expect((await transferir(app, e.emisor.usuarioId, traspaso)).status).toBe(201);
    await fondear(dataSource, e.emisor.principalId, 1_000);
    const sinSaldo = cuerpo(
      e.emisor.ahorroId,
      { tipo: 'CUENTA_PROPIA', cuentaId: e.emisor.principalId },
      9_000_000,
    );
    expect((await transferir(app, e.emisor.usuarioId, sinSaldo)).status).toBe(422);
    expect((await transferir(app, e.emisor.usuarioId, e.aTercero(30_000_000))).status).toBe(422);

    expect((await limites(app, e.emisor.usuarioId)).body).toMatchObject({
      consumidoCentavos: 0,
      disponibleCentavos: 5_000_000,
    });
  });

  it('R-6.1 el consumido es por usuario: lo de otro usuario no cuenta', async () => {
    const a = await escenario();
    const b = await escenario();
    await consumirCuatroMillones(a);
    expect((await limites(app, b.emisor.usuarioId)).body).toMatchObject({ consumidoCentavos: 0 });
  });
});

describe('T-API-19 · medianoche en America/Mexico_City (§6.4)', () => {
  it('R-6.5 R-6.6 agotado a las 23:59:59.999999, otro envío ese día se rechaza y a las 00:00:00 del siguiente se aplica', async () => {
    const e = await escenario();
    reloj.fijar(DIA_1_ULTIMO);
    for (let i = 0; i < 5; i++) {
      expect((await transferir(app, e.emisor.usuarioId, e.aTercero(1_000_000))).status).toBe(201);
    }
    const mismoDia = await transferir(app, e.emisor.usuarioId, e.aTercero(1));
    expect(mismoDia.status).toBe(422);
    expect(mismoDia.body).toMatchObject({ motivo: 'LIMITE_DIARIO_EXCEDIDO' });

    reloj.fijar(DIA_2_INICIO);
    expect((await limites(app, e.emisor.usuarioId)).body).toEqual({
      limiteCentavos: 5_000_000,
      consumidoCentavos: 0,
      disponibleCentavos: 5_000_000,
      dia: '2026-12-02',
      reiniciaEn: '2026-12-03T06:00:00.000000Z',
    });
    const diaSiguiente = await transferir(app, e.emisor.usuarioId, e.aTercero(1_000_000));
    expect(diaSiguiente.status).toBe(201);
    expect(diaSiguiente.body.aplicadaEn).toBe('2026-12-02T06:00:00.000000Z');
  });

  it('R-6.5 lo aplicado exactamente a las 00:00:00 cuenta para el día nuevo y no para el anterior', async () => {
    const e = await escenario();
    reloj.fijar(DIA_1_ULTIMO);
    expect((await transferir(app, e.emisor.usuarioId, e.aTercero(300_000))).status).toBe(201);
    reloj.fijar(DIA_2_INICIO);
    expect((await transferir(app, e.emisor.usuarioId, e.aTercero(700_000))).status).toBe(201);

    expect((await limites(app, e.emisor.usuarioId)).body).toMatchObject({
      consumidoCentavos: 700_000,
    });
    reloj.fijar(DIA_1_ULTIMO);
    expect((await limites(app, e.emisor.usuarioId)).body).toMatchObject({
      consumidoCentavos: 300_000,
      dia: '2026-12-01',
    });
  });
});
