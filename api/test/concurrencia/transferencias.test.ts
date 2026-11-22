// design.md §14.3: escenarios de concurrencia contra billetera_test, con un pool de 10
// conexiones (RNF-24) y un servidor HTTP real. Las invariantes de §14.2 (saldo = SUM(asientos),
// SUM(saldos) = 0, transferencias coherentes) las verifica el afterEach global.
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appReal, type AppReal } from '../integracion/apoyo/app-real.js';
import { abrirDataSource, urlApp } from '../integracion/apoyo/base.js';
import {
  crearUsuarioConCuentas,
  fondear,
  type UsuarioDePrueba,
} from '../integracion/apoyo/fabricas.js';
import { consultarComoDueno } from '../integracion/apoyo/migraciones.js';
import {
  altaBeneficiario,
  autorizacion,
  cuerpo,
  saldo,
  transferenciasDe,
  transferir,
} from '../integracion/transferencias/apoyo.js';

const POOL = 10;

let dataSource: DataSource;
let real: AppReal;
let servidor: Server;

beforeAll(async () => {
  dataSource = await abrirDataSource(urlApp(), POOL);
  real = await appReal(dataSource, { config: { DB_POOL_MAX: POOL } });
  servidor = real.app.listen(0);
});

afterAll(async () => {
  await new Promise<void>((resolver) => servidor.close(() => resolver()));
  await dataSource.destroy();
});

/** RNF-24: cuántos deadlocks se reintentaron, según los `warn` del log capturado (§2.3). */
function deadlocksEnLog(app: AppReal = real): number {
  return app
    .salidaLog()
    .split('\n')
    .filter((linea) => linea.trim() !== '')
    .map((linea) => JSON.parse(linea) as { level?: number; sqlstate?: string })
    .filter((registro) => registro.level === 40 && registro.sqlstate === '40P01').length;
}

async function usuarioConSaldo(monto: number): Promise<UsuarioDePrueba> {
  const usuario = await crearUsuarioConCuentas(dataSource);
  await fondear(dataSource, usuario.principalId, monto);
  return usuario;
}

describe('T-API-21 · concurrencia (§14.3)', () => {
  it('RNF-24 R-4.18 100 transferencias simultáneas desde una cuenta cuadran al centavo y sin deadlocks', async () => {
    const MONTO = 10_000;
    const INICIAL = 60 * MONTO;
    // El límite diario alto para la prueba (§14.3): aquí solo se mide el saldo.
    const conLimiteAlto = await appReal(dataSource, {
      config: { DB_POOL_MAX: POOL, LIMITE_DIARIO_CENTAVOS: 100_000_000_000 },
    });
    const servidorAlto = conLimiteAlto.app.listen(0);
    try {
      const emisor = await usuarioConSaldo(INICIAL);
      const receptor = await crearUsuarioConCuentas(dataSource);
      const beneficiarioId = await altaBeneficiario(
        servidorAlto,
        emisor.usuarioId,
        receptor.principalId,
      );
      const datos = cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, MONTO);

      const respuestas = await Promise.all(
        Array.from({ length: 100 }, () => transferir(servidorAlto, emisor.usuarioId, datos)),
      );

      const aplicadas = respuestas.filter((r) => r.status === 201).length;
      const rechazadas = respuestas.filter((r) => r.status === 422);
      expect(aplicadas + rechazadas.length).toBe(100);
      expect(rechazadas.every((r) => r.body.motivo === 'SALDO_INSUFICIENTE')).toBe(true);
      const saldoFinal = await saldo(emisor.principalId);
      expect(aplicadas * MONTO + saldoFinal).toBe(INICIAL);
      expect(aplicadas).toBe(60);
      expect(saldoFinal).toBe(0);
      expect(await saldo(receptor.principalId)).toBe(aplicadas * MONTO);
      expect(await transferenciasDe(emisor.usuarioId)).toHaveLength(100);
      expect(deadlocksEnLog(conLimiteAlto)).toBe(0);
    } finally {
      await new Promise<void>((resolver) => servidorAlto.close(() => resolver()));
    }
  });

  it('D-12 RNF-08 cruzadas: A envía a B y B a A, 50 de cada lado al mismo tiempo, sin deadlocks', async () => {
    const MONTO = 1_000;
    const a = await usuarioConSaldo(1_000_000);
    const b = await usuarioConSaldo(1_000_000);
    const haciaB = await altaBeneficiario(servidor, a.usuarioId, b.principalId);
    const haciaA = await altaBeneficiario(servidor, b.usuarioId, a.principalId);
    const deA = cuerpo(a.principalId, { tipo: 'BENEFICIARIO', beneficiarioId: haciaB }, MONTO);
    const deB = cuerpo(b.principalId, { tipo: 'BENEFICIARIO', beneficiarioId: haciaA }, MONTO);
    const antes = deadlocksEnLog();

    const respuestas = await Promise.all(
      Array.from({ length: 50 }, () => [
        transferir(servidor, a.usuarioId, deA),
        transferir(servidor, b.usuarioId, deB),
      ]).flat(),
    );

    expect(respuestas.map((r) => r.status)).toEqual(Array(100).fill(201));
    expect(await saldo(a.principalId)).toBe(1_000_000);
    expect(await saldo(b.principalId)).toBe(1_000_000);
    expect(deadlocksEnLog() - antes).toBe(0);
  });

  it('R-6.4 R-4.18 desde Principal y Ahorro a la vez, lo aplicado a tercero nunca supera el límite', async () => {
    const MONTO = 1_000_000; // el umbral exacto: sin código
    const emisor = await usuarioConSaldo(10_000_000);
    await fondear(dataSource, emisor.ahorroId, 10_000_000);
    const receptor = await crearUsuarioConCuentas(dataSource);
    const beneficiarioId = await altaBeneficiario(servidor, emisor.usuarioId, receptor.principalId);
    const desde = (cuentaId: string) =>
      cuerpo(cuentaId, { tipo: 'BENEFICIARIO', beneficiarioId }, MONTO);

    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => [
        transferir(servidor, emisor.usuarioId, desde(emisor.principalId)),
        transferir(servidor, emisor.usuarioId, desde(emisor.ahorroId)),
      ]).flat(),
    );

    const aplicadas = respuestas.filter((r) => r.status === 201).length;
    const rechazadas = respuestas.filter((r) => r.status === 422);
    expect(aplicadas).toBe(5);
    expect(rechazadas).toHaveLength(15);
    expect(rechazadas.every((r) => r.body.motivo === 'LIMITE_DIARIO_EXCEDIDO')).toBe(true);
    expect(await saldo(receptor.principalId)).toBe(5_000_000);
  });

  it('R-4.16 10 peticiones simultáneas con la misma llave: una sola transferencia y 10 respuestas idénticas', async () => {
    const emisor = await usuarioConSaldo(1_000_000);
    const receptor = await crearUsuarioConCuentas(dataSource);
    const beneficiarioId = await altaBeneficiario(servidor, emisor.usuarioId, receptor.principalId);
    const datos = cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, 12_345);
    const llave = randomUUID();

    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => transferir(servidor, emisor.usuarioId, datos, llave)),
    );

    expect(respuestas.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect(new Set(respuestas.map((r) => JSON.stringify(r.body))).size).toBe(1);
    expect(await transferenciasDe(emisor.usuarioId)).toHaveLength(1);
    expect(await saldo(receptor.principalId)).toBe(12_345);
  });

  it('R-5.4 DD-36 transferencias concurrentes hacia una cuenta mientras se recorre su historial: sin huecos ni repetidos', async () => {
    const receptor = await crearUsuarioConCuentas(dataSource);
    for (let i = 0; i < 60; i++) await fondear(dataSource, receptor.principalId, 100 + i);
    const previos = (
      await consultarComoDueno<{ id: number }>('SELECT id FROM asiento WHERE cuenta_id = $1', [
        receptor.principalId,
      ])
    ).map((fila) => String(fila.id));
    expect(previos).toHaveLength(60);

    const emisores = await Promise.all(Array.from({ length: 5 }, () => usuarioConSaldo(1_000_000)));
    const envios = await Promise.all(
      emisores.map(async (emisor) => {
        const beneficiarioId = await altaBeneficiario(
          servidor,
          emisor.usuarioId,
          receptor.principalId,
        );
        return cuerpo(emisor.principalId, { tipo: 'BENEFICIARIO', beneficiarioId }, 1_000);
      }),
    );
    const token = await autorizacion(receptor.usuarioId);

    /** Recorre el historial página por página mientras entran transferencias. */
    async function recorrer(): Promise<string[]> {
      const vistos: string[] = [];
      let cursor: string | null = null;
      do {
        const respuesta = await request(servidor)
          .get(`/api/cuentas/${receptor.principalId}/movimientos`)
          .query({ limite: 7, ...(cursor === null ? {} : { cursor }) })
          .set('Authorization', token);
        expect(respuesta.status).toBe(200);
        const pagina = respuesta.body as {
          items: { id: string }[];
          siguienteCursor: string | null;
        };
        vistos.push(...pagina.items.map((m) => m.id));
        cursor = pagina.siguienteCursor;
      } while (cursor !== null);
      return vistos;
    }

    const [vistos, ...respuestas] = await Promise.all([
      recorrer(),
      ...Array.from({ length: 30 }, (_, i) =>
        transferir(servidor, emisores[i % 5]?.usuarioId ?? '', envios[i % 5] ?? {}),
      ),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual(Array(30).fill(201));
    expect(new Set(vistos).size).toBe(vistos.length);
    for (const id of previos) expect(vistos.filter((v) => v === id)).toHaveLength(1);
    expect(await saldo(receptor.principalId)).toBe(60 * 100 + (59 * 60) / 2 + 30 * 1_000);
  });
});
