import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearTokens } from '../../../src/plataforma/seguridad/tokens.js';
import { configDePrueba } from '../../apoyo/app.js';
import { appReal } from '../apoyo/app-real.js';
import { abrirDataSource } from '../apoyo/base.js';
import { validarRespuesta } from '../apoyo/contrato.js';
import { crearUsuarioConCuentas, fondear, FONDEO_ID } from '../apoyo/fabricas.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

const tokens = crearTokens(configDePrueba().JWT_SECRETO);
const autorizacion = async (usuarioId: string) =>
  `Bearer ${(await tokens.emitirAccess(usuarioId)).token}`;

type App = ReturnType<typeof appReal>['app'];

async function listar(app: App, usuarioId?: string) {
  let peticion = request(app).get('/api/cuentas');
  if (usuarioId !== undefined) peticion = peticion.set('Authorization', await autorizacion(usuarioId));
  const respuesta = await peticion;
  validarRespuesta(respuesta, 'get', '/cuentas');
  return respuesta;
}

async function obtener(app: App, usuarioId: string, cuentaId: string) {
  const respuesta = await request(app)
    .get(`/api/cuentas/${cuentaId}`)
    .set('Authorization', await autorizacion(usuarioId));
  validarRespuesta(respuesta, 'get', '/cuentas/{cuentaId}');
  return respuesta;
}

const clabesDe = async (usuarioId: string) =>
  Object.fromEntries(
    (
      await consultarComoDueno<{ nombre: string; clabe: string }>(
        'SELECT nombre, clabe FROM cuenta WHERE usuario_id = $1',
        [usuarioId],
      )
    ).map((c) => [c.nombre, c.clabe]),
  );

describe('GET /api/cuentas (T-API-15)', () => {
  it('R-2.1 R-2.3: devuelve solo las cuentas propias, Principal y después Ahorro, con saldo en centavos enteros; nunca Fondeo ni cuentas ajenas', async () => {
    const { app } = appReal(dataSource);
    const ana = await crearUsuarioConCuentas(dataSource);
    const beto = await crearUsuarioConCuentas(dataSource);
    await fondear(dataSource, ana.principalId, 123_456);
    await fondear(dataSource, beto.principalId, 999);

    const respuesta = await listar(app, ana.usuarioId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    const clabes = await clabesDe(ana.usuarioId);
    expect(respuesta.body).toEqual({
      items: [
        { id: ana.principalId, nombre: 'Principal', clabe: clabes['Principal'], saldoCentavos: 123_456 },
        { id: ana.ahorroId, nombre: 'Ahorro', clabe: clabes['Ahorro'], saldoCentavos: 0 },
      ],
    });
    for (const cuenta of respuesta.body.items as { saldoCentavos: unknown }[]) {
      expect(Number.isInteger(cuenta.saldoCentavos)).toBe(true);
    }
    const ids = (respuesta.body.items as { id: string }[]).map((c) => c.id);
    expect(ids).not.toContain(FONDEO_ID);
    expect(ids).not.toContain(beto.principalId);
  });

  it('R-1.11: sin access responde 401', async () => {
    const { app } = appReal(dataSource);

    const respuesta = await listar(app);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.type).toBe('unauthorized');
  });
});

describe('GET /api/cuentas/{cuentaId} (T-API-15)', () => {
  it('R-2.1: devuelve una cuenta propia con su saldo en centavos enteros', async () => {
    const { app } = appReal(dataSource);
    const ana = await crearUsuarioConCuentas(dataSource);
    await fondear(dataSource, ana.ahorroId, 50_001);

    const respuesta = await obtener(app, ana.usuarioId, ana.ahorroId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    expect(respuesta.body).toEqual({
      id: ana.ahorroId,
      nombre: 'Ahorro',
      clabe: (await clabesDe(ana.usuarioId))['Ahorro'],
      saldoCentavos: 50_001,
    });
  });

  it('R-2.4 D-10: una cuenta ajena y una inexistente responden el mismo 404 not-found', async () => {
    const { app } = appReal(dataSource);
    const ana = await crearUsuarioConCuentas(dataSource);
    const beto = await crearUsuarioConCuentas(dataSource);

    const ajena = await obtener(app, ana.usuarioId, beto.principalId);
    const inexistente = await obtener(app, ana.usuarioId, randomUUID());

    expect(ajena.status).toBe(404);
    expect(ajena.body).toEqual({
      type: 'not-found',
      title: 'No encontrado',
      status: 404,
      detail: expect.any(String),
    });
    expect(inexistente.status).toBe(404);
    expect(inexistente.body).toEqual(ajena.body);
  });

  it('R-2.3 R-2.4: la cuenta Fondeo responde el mismo 404 not-found', async () => {
    const { app } = appReal(dataSource);
    const ana = await crearUsuarioConCuentas(dataSource);

    const fondeo = await obtener(app, ana.usuarioId, FONDEO_ID);
    const inexistente = await obtener(app, ana.usuarioId, randomUUID());

    expect(fondeo.status).toBe(404);
    expect(fondeo.body).toEqual(inexistente.body);
  });

  it('R-2.4: un cuentaId que no es uuid responde 400 con el campo params.cuentaId', async () => {
    const { app } = appReal(dataSource);
    const ana = await crearUsuarioConCuentas(dataSource);

    const respuesta = await obtener(app, ana.usuarioId, 'no-es-uuid');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.type).toBe('validation-error');
    expect(respuesta.body.errores).toEqual([
      { campo: 'params.cuentaId', mensaje: expect.any(String) },
    ]);
  });
});
