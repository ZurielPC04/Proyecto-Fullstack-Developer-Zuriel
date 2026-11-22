import { randomInt, randomUUID } from 'node:crypto';
import { digitoVerificador } from '@billetera/shared';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearTokens } from '../../../src/plataforma/seguridad/tokens.js';
import { configDePrueba } from '../../apoyo/app.js';
import { appReal, type AppReal } from '../apoyo/app-real.js';
import { abrirDataSource } from '../apoyo/base.js';
import { validarRespuesta } from '../apoyo/contrato.js';
import { crearUsuarioConCuentas, type UsuarioDePrueba } from '../apoyo/fabricas.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

const CLABE_FONDEO = '999000000000000001';
const tokens = crearTokens(configDePrueba().JWT_SECRETO);
const autorizacion = async (usuarioId: string) =>
  `Bearer ${(await tokens.emitirAccess(usuarioId)).token}`;

type App = AppReal['app'];

async function alta(app: App, usuarioId: string | undefined, cuerpo: object) {
  let peticion = request(app).post('/api/beneficiarios');
  if (usuarioId !== undefined) peticion = peticion.set('Authorization', await autorizacion(usuarioId));
  const respuesta = await peticion.send(cuerpo);
  validarRespuesta(respuesta, 'post', '/beneficiarios');
  return respuesta;
}

async function listar(app: App, usuarioId: string) {
  const respuesta = await request(app)
    .get('/api/beneficiarios')
    .set('Authorization', await autorizacion(usuarioId));
  validarRespuesta(respuesta, 'get', '/beneficiarios');
  return respuesta;
}

async function obtener(app: App, usuarioId: string, beneficiarioId: string) {
  const respuesta = await request(app)
    .get(`/api/beneficiarios/${beneficiarioId}`)
    .set('Authorization', await autorizacion(usuarioId));
  validarRespuesta(respuesta, 'get', '/beneficiarios/{beneficiarioId}');
  return respuesta;
}

async function clabeDe(cuentaId: string): Promise<string> {
  const [fila] = await consultarComoDueno<{ clabe: string }>(
    'SELECT clabe FROM cuenta WHERE id = $1',
    [cuentaId],
  );
  if (!fila) throw new Error('cuenta inexistente');
  return fila.clabe;
}

const beneficiariosDe = (usuarioId: string) =>
  consultarComoDueno<{ id: string; cuenta_id: string; nombre: string; alias: string; clabe: string }>(
    'SELECT id, cuenta_id, nombre, alias, clabe FROM beneficiario WHERE usuario_id = $1 ORDER BY creado_en',
    [usuarioId],
  );

const eventosDe = (usuarioId: string) =>
  consultarComoDueno<{ tipo: string; datos: Record<string, unknown> }>(
    "SELECT tipo, datos FROM evento_auditoria WHERE usuario_id = $1 AND tipo = 'beneficiario-creado' ORDER BY id",
    [usuarioId],
  );

/**
 * CLABE válida en forma (18 dígitos y dígito verificador) que no es de ninguna cuenta: plaza
 * 999, mientras que las cuentas de usuario usan 180 y Fondeo 000 (§3.6).
 */
function clabeLibre(): string {
  let primeros = '999999';
  for (let i = 0; i < 11; i++) primeros += String(randomInt(0, 10));
  return `${primeros}${digitoVerificador(primeros)}`;
}

describe('POST /api/beneficiarios (T-API-16)', () => {
  let ana: UsuarioDePrueba;
  let beto: UsuarioDePrueba;

  beforeAll(async () => {
    ana = await crearUsuarioConCuentas(dataSource);
    beto = await crearUsuarioConCuentas(dataSource);
  });

  it('R-3.1 R-3.6 D-19: crea el beneficiario ligado a la cuenta de la CLABE; la respuesta solo trae lo que capturó el usuario, sin datos del titular, y se audita', async () => {
    const { app } = await appReal(dataSource);
    const usuario = await crearUsuarioConCuentas(dataSource);
    const clabe = await clabeDe(beto.principalId);

    const respuesta = await alta(app, usuario.usuarioId, {
      nombre: '  Roberto Pérez ',
      alias: 'Beto',
      clabe,
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({
      id: expect.any(String),
      nombre: 'Roberto Pérez',
      alias: 'Beto',
      clabe,
      esCuentaPropia: false,
    });
    expect(JSON.stringify(respuesta.body)).not.toContain(beto.correo);
    expect(JSON.stringify(respuesta.body)).not.toContain(beto.usuarioId);
    expect(JSON.stringify(respuesta.body)).not.toContain(beto.principalId);

    const id = respuesta.body.id as string;
    expect(await beneficiariosDe(usuario.usuarioId)).toEqual([
      { id, cuenta_id: beto.principalId, nombre: 'Roberto Pérez', alias: 'Beto', clabe },
    ]);
    expect(await eventosDe(usuario.usuarioId)).toEqual([
      {
        tipo: 'beneficiario-creado',
        datos: { beneficiarioId: id, clabe: `**************${clabe.slice(-4)}` },
      },
    ]);
  });

  it('R-3.2 R-3.3 R-3.4 R-3.5: valida la CLABE en orden (18 dígitos, dígito verificador, pertenencia) y reporta el primer fallo', async () => {
    const { app } = await appReal(dataSource);
    const usuario = await crearUsuarioConCuentas(dataSource);
    const deBeto = await clabeDe(beto.principalId);
    // Los 17 primeros dígitos son de una cuenta real: el dígito verificador falla antes que la pertenencia.
    const digitoMalo = `${deBeto.slice(0, 17)}${(Number(deBeto[17]) + 1) % 10}`;
    const campo = (mensaje: string) => ({
      type: 'validation-error',
      title: 'Datos inválidos',
      status: 400,
      detail: expect.any(String),
      errores: [{ campo: 'body.clabe', mensaje }],
    });

    const corta = await alta(app, usuario.usuarioId, {
      nombre: 'X',
      alias: 'corta',
      clabe: deBeto.slice(0, 17),
    });
    const conLetras = await alta(app, usuario.usuarioId, {
      nombre: 'X',
      alias: 'letras',
      clabe: `${deBeto.slice(0, 17)}A`,
    });
    const verificador = await alta(app, usuario.usuarioId, {
      nombre: 'X',
      alias: 'verificador',
      clabe: digitoMalo,
    });
    const ajenaALaPlataforma = await alta(app, usuario.usuarioId, {
      nombre: 'X',
      alias: 'libre',
      clabe: clabeLibre(),
    });

    expect(corta.status).toBe(400);
    expect(corta.body).toEqual(campo('La CLABE debe tener 18 dígitos'));
    expect(conLetras.status).toBe(400);
    expect(conLetras.body).toEqual(campo('La CLABE solo admite números'));
    expect(verificador.status).toBe(400);
    expect(verificador.body).toEqual(campo('El dígito verificador de la CLABE no es válido'));
    expect(ajenaALaPlataforma.status).toBe(422);
    expect(ajenaALaPlataforma.body).toEqual({
      type: 'clabe-not-found',
      title: 'CLABE no encontrada',
      status: 422,
      detail: expect.any(String),
    });
    expect(await beneficiariosDe(usuario.usuarioId)).toEqual([]);
  });

  it('R-3.5 R-2.3 D-02: la CLABE de Fondeo responde 422 clabe-not-found, igual que una inexistente, y no crea nada', async () => {
    const { app } = await appReal(dataSource);
    const usuario = await crearUsuarioConCuentas(dataSource);

    const fondeo = await alta(app, usuario.usuarioId, {
      nombre: 'Plataforma',
      alias: 'fondeo',
      clabe: CLABE_FONDEO,
    });
    const inexistente = await alta(app, usuario.usuarioId, {
      nombre: 'Nadie',
      alias: 'nadie',
      clabe: clabeLibre(),
    });

    expect(fondeo.status).toBe(422);
    expect(fondeo.body).toEqual(inexistente.body);
    expect(fondeo.body.type).toBe('clabe-not-found');
    expect(await beneficiariosDe(usuario.usuarioId)).toEqual([]);
  });

  it('R-3.7 DD-23: la misma CLABE o el mismo alias (sin distinguir mayúsculas) responden 409 beneficiario-duplicado con su campo', async () => {
    const { app } = await appReal(dataSource);
    const usuario = await crearUsuarioConCuentas(dataSource);
    const clabeBeto = await clabeDe(beto.principalId);
    const clabeAna = await clabeDe(ana.principalId);
    expect(
      (await alta(app, usuario.usuarioId, { nombre: 'Beto', alias: 'Beto', clabe: clabeBeto }))
        .status,
    ).toBe(201);

    const mismaClabe = await alta(app, usuario.usuarioId, {
      nombre: 'Beto otra vez',
      alias: 'Roberto',
      clabe: clabeBeto,
    });
    const mismoAlias = await alta(app, usuario.usuarioId, {
      nombre: 'Ana',
      alias: 'bETO',
      clabe: clabeAna,
    });

    const duplicado = (campo: string) => ({
      type: 'beneficiario-duplicado',
      title: 'Beneficiario duplicado',
      status: 409,
      detail: expect.any(String),
      errores: [{ campo, mensaje: expect.any(String) }],
    });
    expect(mismaClabe.status).toBe(409);
    expect(mismaClabe.body).toEqual(duplicado('body.clabe'));
    expect(mismoAlias.status).toBe(409);
    expect(mismoAlias.body).toEqual(duplicado('body.alias'));
    expect((await beneficiariosDe(usuario.usuarioId)).map((b) => b.alias)).toEqual(['Beto']);
  });

  it('R-3.7: la unicidad es por usuario; otro usuario puede registrar la misma CLABE y el mismo alias', async () => {
    const { app } = await appReal(dataSource);
    const [uno, dos] = [
      await crearUsuarioConCuentas(dataSource),
      await crearUsuarioConCuentas(dataSource),
    ];
    const clabe = await clabeDe(beto.ahorroId);

    for (const usuario of [uno, dos]) {
      const respuesta = await alta(app, usuario.usuarioId, { nombre: 'Beto', alias: 'beto', clabe });
      expect(respuesta.status).toBe(201);
    }
  });

  it('R-3.8 DD-26: una CLABE propia se permite y responde esCuentaPropia: true', async () => {
    const { app } = await appReal(dataSource);
    const clabe = await clabeDe(ana.ahorroId);

    const respuesta = await alta(app, ana.usuarioId, { nombre: 'Mi ahorro', alias: 'ahorro', clabe });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({
      id: expect.any(String),
      nombre: 'Mi ahorro',
      alias: 'ahorro',
      clabe,
      esCuentaPropia: true,
    });
  });

  it('R-1.11: sin access responde 401 y no crea nada', async () => {
    const { app } = await appReal(dataSource);

    const respuesta = await alta(app, undefined, {
      nombre: 'Beto',
      alias: 'beto',
      clabe: await clabeDe(beto.principalId),
    });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.type).toBe('unauthorized');
  });

  it('R-3.9 RNF-04: la 11.ª alta del mismo usuario en la hora responde 429 y no crea el beneficiario', async () => {
    const { app } = await appReal(dataSource);
    const usuario = await crearUsuarioConCuentas(dataSource);
    // Toda petición cuenta (§11), también las que no pasan la validación.
    for (let i = 0; i < 10; i++) {
      expect((await alta(app, usuario.usuarioId, {})).status).toBe(400);
    }

    const undecima = await alta(app, usuario.usuarioId, {
      nombre: 'Beto',
      alias: 'beto',
      clabe: await clabeDe(beto.principalId),
    });

    expect(undecima.status).toBe(429);
    expect(undecima.body.type).toBe('too-many-requests');
    expect(Number(undecima.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(await beneficiariosDe(usuario.usuarioId)).toEqual([]);
  });
});

describe('GET /api/beneficiarios y /api/beneficiarios/{beneficiarioId} (T-API-16)', () => {
  it('R-3.11 DD-26: lista solo los propios, ordenados por alias sin distinguir mayúsculas, con esCuentaPropia', async () => {
    const { app } = await appReal(dataSource);
    const ana = await crearUsuarioConCuentas(dataSource);
    const beto = await crearUsuarioConCuentas(dataSource);
    const [clabeBeto, clabeAhorroAna, clabeAna] = await Promise.all([
      clabeDe(beto.principalId),
      clabeDe(ana.ahorroId),
      clabeDe(ana.principalId),
    ]);
    const deAna = [
      { nombre: 'Roberto', alias: 'zeta', clabe: clabeBeto },
      { nombre: 'Mi ahorro', alias: 'Ahorro', clabe: clabeAhorroAna },
    ];
    for (const cuerpo of deAna) expect((await alta(app, ana.usuarioId, cuerpo)).status).toBe(201);
    expect(
      (await alta(app, beto.usuarioId, { nombre: 'Ana', alias: 'ana', clabe: clabeAna })).status,
    ).toBe(201);

    const respuesta = await listar(app, ana.usuarioId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    expect(respuesta.body).toEqual({
      items: [
        { id: expect.any(String), nombre: 'Mi ahorro', alias: 'Ahorro', clabe: clabeAhorroAna, esCuentaPropia: true },
        { id: expect.any(String), nombre: 'Roberto', alias: 'zeta', clabe: clabeBeto, esCuentaPropia: false },
      ],
    });
  });

  it('R-3.11 D-10: un beneficiario propio se consulta; uno ajeno y uno inexistente responden el mismo 404', async () => {
    const { app } = await appReal(dataSource);
    const ana = await crearUsuarioConCuentas(dataSource);
    const beto = await crearUsuarioConCuentas(dataSource);
    const creado = await alta(app, ana.usuarioId, {
      nombre: 'Roberto',
      alias: 'beto',
      clabe: await clabeDe(beto.principalId),
    });
    expect(creado.status).toBe(201);
    const id = creado.body.id as string;

    const propio = await obtener(app, ana.usuarioId, id);
    const ajeno = await obtener(app, beto.usuarioId, id);
    const inexistente = await obtener(app, beto.usuarioId, randomUUID());

    expect(propio.status).toBe(200);
    expect(propio.body).toEqual(creado.body);
    expect(ajeno.status).toBe(404);
    expect(ajeno.body).toEqual({
      type: 'not-found',
      title: 'No encontrado',
      status: 404,
      detail: expect.any(String),
    });
    expect(inexistente.body).toEqual(ajeno.body);
  });

  it('R-3.11: un beneficiarioId que no es uuid responde 400 con el campo params.beneficiarioId', async () => {
    const { app } = await appReal(dataSource);
    const ana = await crearUsuarioConCuentas(dataSource);

    const respuesta = await obtener(app, ana.usuarioId, 'no-es-uuid');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual([
      { campo: 'params.beneficiarioId', mensaje: expect.any(String) },
    ]);
  });
});
