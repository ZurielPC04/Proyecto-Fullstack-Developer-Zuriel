import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DependenciasApp } from '../../../src/app.js';
import { crearAutenticar } from '../../../src/plataforma/http/autenticar.js';
import { limiteAltaBeneficiarios } from '../../../src/plataforma/http/limites.js';
import { crearTokens } from '../../../src/plataforma/seguridad/tokens.js';
import { configDePrueba } from '../../apoyo/app.js';
import { appReal, type AppReal } from '../apoyo/app-real.js';
import { abrirDataSource } from '../apoyo/base.js';
import { validarRespuesta } from '../apoyo/contrato.js';
import { clabeAleatoria } from '../apoyo/fabricas.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

const CONTRASENA = 'una frase larga y propia';
let contador = 0;
const correoNuevo = () => `limite-${Date.now()}-${contador++}@prueba.mx`;

type App = AppReal['app'];

async function registrar(app: App, cuerpo: object, xff?: string) {
  let peticion = request(app).post('/api/auth/registro');
  if (xff !== undefined) peticion = peticion.set('X-Forwarded-For', xff);
  const respuesta = await peticion.send(cuerpo);
  validarRespuesta(respuesta, 'post', '/auth/registro');
  return respuesta;
}

async function login(app: App, cuerpo: object) {
  const respuesta = await request(app).post('/api/auth/login').send(cuerpo);
  validarRespuesta(respuesta, 'post', '/auth/login');
  return respuesta;
}

/** §11 y §7.2: 429 too-many-requests con Retry-After y los headers RateLimit-* (draft-6). */
function esperarDemasiadas(respuesta: request.Response, limite: number) {
  expect(respuesta.status).toBe(429);
  expect(respuesta.headers['content-type']).toMatch(/^application\/problem\+json/);
  expect(respuesta.body).toEqual({
    type: 'too-many-requests',
    title: 'Demasiadas peticiones',
    status: 429,
    detail: expect.any(String),
  });
  expect(Number(respuesta.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  expect(respuesta.headers['ratelimit-limit']).toBe(String(limite));
  expect(respuesta.headers['ratelimit-remaining']).toBe('0');
  expect(respuesta.headers['ratelimit-reset']).toMatch(/^\d+$/);
  expect(respuesta.headers['x-ratelimit-limit']).toBeUndefined();
}

const usuariosConCorreo = async (correo: string) =>
  (await consultarComoDueno<{ id: string }>('SELECT id FROM usuario WHERE correo = $1', [correo]))
    .length;

describe('rate limit de registro (T-API-14)', () => {
  it('R-1.18 RNF-04: el 6.º registro desde la misma IP responde 429 y no crea el usuario', async () => {
    const { app } = await appReal(dataSource);
    for (let i = 0; i < 5; i++) {
      const respuesta = await registrar(app, { correo: correoNuevo(), contrasena: CONTRASENA });
      expect(respuesta.status).toBe(201);
      expect(respuesta.headers['ratelimit-limit']).toBe('5');
      expect(respuesta.headers['ratelimit-remaining']).toBe(String(4 - i));
    }

    const correo = correoNuevo();
    const sexto = await registrar(app, { correo, contrasena: CONTRASENA });

    esperarDemasiadas(sexto, 5);
    expect(await usuariosConCorreo(correo)).toBe(0);
  });

  it('R-1.18 §11: con TRUST_PROXY=0 un X-Forwarded-For inventado no esquiva el límite', async () => {
    const { app } = await appReal(dataSource, { config: { TRUST_PROXY: 0 } });
    for (let i = 0; i < 5; i++) {
      const respuesta = await registrar(app, { correo: correoNuevo(), contrasena: CONTRASENA });
      expect(respuesta.status).toBe(201);
    }

    const correo = correoNuevo();
    const falsificada = await registrar(
      app,
      { correo, contrasena: CONTRASENA },
      '203.0.113.77',
    );

    esperarDemasiadas(falsificada, 5);
    expect(await usuariosConCorreo(correo)).toBe(0);
  });

  it('R-1.18 §11: una IPv6 cuenta por su subred /56; otra /56 tiene su propio límite', async () => {
    // Detrás de un proxy confiable, la IP del cliente es la última entrada de X-Forwarded-For.
    const { app } = await appReal(dataSource, { config: { TRUST_PROXY: 1 } });
    // Cuerpo inválido: el 400 también cuenta y no cuesta un hash.
    for (let i = 0; i < 5; i++) {
      const respuesta = await registrar(app, {}, `2001:db8:abcd:1200::${i + 1}`);
      expect(respuesta.status).toBe(400);
    }

    const mismaSubred = await registrar(app, {}, '2001:db8:abcd:12ff::9');
    const otraSubred = await registrar(app, {}, '2001:db8:abcd:1300::1');

    esperarDemasiadas(mismaSubred, 5);
    expect(otraSubred.status).toBe(400);
  });
});

describe('rate limit de login (T-API-14)', () => {
  it('R-1.18 RNF-04: la petición 21 desde la misma IP responde 429; sin correo solo cuenta el límite por IP', async () => {
    const { app } = await appReal(dataSource);
    // Sin correo en el cuerpo: si contaran en el límite por correo (5), la 6.ª ya sería 429.
    for (let i = 0; i < 20; i++) {
      const respuesta = await login(app, i % 2 === 0 ? {} : { correo: 123, contrasena: 'x' });
      expect(respuesta.status).toBe(400);
    }

    esperarDemasiadas(await login(app, {}), 20);
  });

  it('R-1.18 §11: 5 fallos con el mismo correo normalizado bloquean el 6.º intento, aunque sea correcto; otro correo no se ve afectado', async () => {
    const { app } = await appReal(dataSource);
    const correo = correoNuevo();
    const otro = correoNuevo();
    for (const c of [correo, otro]) {
      expect((await registrar(app, { correo: c, contrasena: CONTRASENA })).status).toBe(201);
    }

    const variantes = [correo, correo.toUpperCase(), `  ${correo} `, ` ${correo.toUpperCase()}`, correo];
    for (const variante of variantes) {
      const respuesta = await login(app, {
        correo: variante,
        contrasena: 'no es la contraseña',
        cliente: 'movil',
      });
      expect(respuesta.status).toBe(401);
    }

    const correcto = await login(app, { correo, contrasena: CONTRASENA, cliente: 'movil' });
    esperarDemasiadas(correcto, 5);
    expect(correcto.body).not.toHaveProperty('accessToken');

    const ajeno = await login(app, { correo: otro, contrasena: 'tampoco', cliente: 'movil' });
    expect(ajeno.status).toBe(401);
  });

  it('R-1.18 §11: un login correcto no consume el límite por correo (skipSuccessfulRequests)', async () => {
    const { app } = await appReal(dataSource);
    const correo = correoNuevo();
    expect((await registrar(app, { correo, contrasena: CONTRASENA })).status).toBe(201);

    for (let i = 0; i < 5; i++) {
      const ok = await login(app, { correo, contrasena: CONTRASENA, cliente: 'movil' });
      expect(ok.status).toBe(200);
    }
    for (let i = 0; i < 5; i++) {
      const fallo = await login(app, { correo, contrasena: 'equivocada', cliente: 'movil' });
      expect(fallo.status).toBe(401);
    }

    const sexto = await login(app, { correo, contrasena: 'equivocada', cliente: 'movil' });
    esperarDemasiadas(sexto, 5);
  });
});

/** Ruta de prueba con la forma de POST /beneficiarios: autenticar → limitador → 201. */
function altaDePrueba(dependencias: DependenciasApp, atendidas: string[]) {
  return Router().post(
    '/beneficiarios',
    crearAutenticar(dependencias.config),
    limiteAltaBeneficiarios(),
    (req, res) => {
      atendidas.push(req.usuarioId ?? '');
      res.status(201).json({
        id: randomUUID(),
        nombre: 'Beto',
        alias: 'beto',
        clabe: clabeAleatoria(),
        esCuentaPropia: false,
      });
    },
  );
}

describe('rate limit del alta de beneficiarios (T-API-14)', () => {
  it('R-3.9 RNF-04: la 11.ª alta en la hora del mismo usuario responde 429 sin atenderse; otro usuario no se ve afectado', async () => {
    const atendidas: string[] = [];
    const { app } = await appReal(dataSource, {
      // Solo la ruta de prueba: la real (T-API-16) tiene su propia prueba de R-3.9.
      modulos: (deps) => [altaDePrueba(deps, atendidas)],
    });
    const tokens = crearTokens(configDePrueba().JWT_SECRETO);
    const [ana, beto] = [randomUUID(), randomUUID()];
    const access = async (id: string) => `Bearer ${(await tokens.emitirAccess(id)).token}`;
    const alta = async (id: string) => {
      const respuesta = await request(app)
        .post('/api/beneficiarios')
        .set('Authorization', await access(id))
        .send({});
      validarRespuesta(respuesta, 'post', '/beneficiarios');
      return respuesta;
    };

    for (let i = 0; i < 10; i++) expect((await alta(ana)).status).toBe(201);
    const undecima = await alta(ana);
    const deBeto = await alta(beto);

    esperarDemasiadas(undecima, 10);
    expect(deBeto.status).toBe(201);
    expect(atendidas.filter((id) => id === ana)).toHaveLength(10);
  });
});
