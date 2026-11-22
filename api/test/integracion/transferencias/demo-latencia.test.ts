// T-API-24, D-17: con DEMO_LATENCIA_MS la API espera después de confirmar la transacción y antes
// de responder. La prueba consulta la base mientras la petición sigue en vuelo.
import type { Server } from 'node:http';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appReal } from '../apoyo/app-real.js';
import { abrirDataSource } from '../apoyo/base.js';
import { crearUsuarioConCuentas, fondear } from '../apoyo/fabricas.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';
import { altaBeneficiario, confirmar, cuerpo, transferir } from './apoyo.js';

const LATENCIA = 200;

let dataSource: DataSource;
let servidor: Server;

beforeAll(async () => {
  dataSource = await abrirDataSource();
  const { app } = await appReal(dataSource, { config: { DEMO_LATENCIA_MS: LATENCIA } });
  servidor = app.listen(0);
});

afterAll(async () => {
  await new Promise<void>((resolver) => servidor.close(() => resolver()));
  await dataSource.destroy();
});

const aplicada = async (transferenciaId: string | undefined, usuarioId: string) =>
  (
    await consultarComoDueno<{ n: number }>(
      `SELECT count(*)::int AS n FROM transferencia
        WHERE usuario_id = $1 AND estado = 'APLICADA' AND ($2::uuid IS NULL OR id = $2)`,
      [usuarioId, transferenciaId ?? null],
    )
  )[0]?.n === 1;

/**
 * Lanza la petición y consulta la base cada 10 ms. Devuelve cuántos milisegundos antes de la
 * respuesta la transferencia ya estaba aplicada (negativo o nulo si no lo estaba).
 */
async function ventajaDeLaBase<T>(
  peticion: Promise<T>,
  estaAplicada: () => Promise<boolean>,
): Promise<{ respuesta: T; ventajaMs: number | null }> {
  let respondidaEn: number | null = null;
  const enVuelo = peticion.then((r) => {
    respondidaEn = performance.now();
    return r;
  });
  let vistaEn: number | null = null;
  while (respondidaEn === null) {
    if (vistaEn === null && (await estaAplicada())) vistaEn = performance.now();
    await new Promise((resolver) => setTimeout(resolver, 10));
  }
  const respuesta = await enVuelo;
  return { respuesta, ventajaMs: vistaEn === null ? null : (respondidaEn as number) - vistaEn };
}

describe('demoLatencia (T-API-24)', () => {
  it('RNF-15 D-17: con DEMO_LATENCIA_MS=200, la transferencia queda aplicada en la base antes de que llegue la respuesta', async () => {
    const emisor = await crearUsuarioConCuentas(dataSource);
    const receptor = await crearUsuarioConCuentas(dataSource);
    await fondear(dataSource, emisor.principalId, 5_000_000);
    const beneficiarioId = await altaBeneficiario(servidor, emisor.usuarioId, receptor.principalId);
    const destino = { tipo: 'BENEFICIARIO', beneficiarioId } as const;

    const creacion = await ventajaDeLaBase(
      transferir(servidor, emisor.usuarioId, cuerpo(emisor.principalId, destino, 1_000)),
      () => aplicada(undefined, emisor.usuarioId),
    );
    expect(creacion.respuesta.status).toBe(201);
    expect(creacion.ventajaMs).not.toBeNull();
    expect(creacion.ventajaMs ?? 0).toBeGreaterThanOrEqual(LATENCIA * 0.75);

    const pendiente = await transferir(
      servidor,
      emisor.usuarioId,
      cuerpo(emisor.principalId, destino, 1_500_000),
    );
    expect(pendiente.status).toBe(202);
    const { transferenciaId, codigoSimulado } = pendiente.body as {
      transferenciaId: string;
      codigoSimulado: string;
    };
    const confirmacion = await ventajaDeLaBase(
      confirmar(servidor, emisor.usuarioId, transferenciaId, codigoSimulado),
      () => aplicada(transferenciaId, emisor.usuarioId),
    );
    expect(confirmacion.respuesta.status).toBe(201);
    expect(confirmacion.ventajaMs ?? 0).toBeGreaterThanOrEqual(LATENCIA * 0.75);
  });
});
