import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { decodeJwt, decodeProtectedHeader, SignJWT } from 'jose';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DependenciasApp } from '../../../src/app.js';
import { crearModuloIdentidad } from '../../../src/modulos/identidad/index.js';
import { crearAutenticar } from '../../../src/plataforma/http/autenticar.js';
import { contextoPeticion } from '../../../src/plataforma/logging/contexto.js';
import { RelojFijo, type Reloj } from '../../../src/plataforma/reloj/index.js';
import { contrasenasArgon2 } from '../../../src/plataforma/seguridad/contrasenas.js';
import { configDePrueba } from '../../apoyo/app.js';
import { appReal } from '../apoyo/app-real.js';
import { abrirDataSource } from '../apoyo/base.js';
import { validarRespuesta } from '../apoyo/contrato.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

const CONTRASENA = 'una frase larga y propia';
const SECRETO = configDePrueba().JWT_SECRETO;
let contador = 0;
const correoNuevo = () => `sesion-${Date.now()}-${contador++}@prueba.mx`;
const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

/** Cuenta las llamadas reales a argon2 (mutación b: sin depender del tiempo). */
function contadorContrasenas() {
  const cuenta = { hashes: 0, verificaciones: 0 };
  return {
    cuenta,
    contrasenas: {
      hash: (c: string) => {
        cuenta.hashes++;
        return contrasenasArgon2.hash(c);
      },
      verificar: (h: string, c: string) => {
        cuenta.verificaciones++;
        return contrasenasArgon2.verificar(h, c);
      },
    },
  };
}

interface Visto {
  usuarioId: string | undefined;
  enContexto: string | undefined;
}

/** Ruta protegida de prueba con la forma de GET /cuentas, para validar su contrato. */
function rutaProtegida(dependencias: DependenciasApp, vistos: Visto[]) {
  return Router().get('/cuentas', crearAutenticar(dependencias.config), (req, res) => {
    vistos.push({ usuarioId: req.usuarioId, enContexto: contextoPeticion.getStore()?.usuarioId });
    res.json({ items: [] });
  });
}

async function armar(opciones: { reloj?: Reloj } = {}) {
  const { cuenta, contrasenas } = contadorContrasenas();
  const vistos: Visto[] = [];
  const { app, salidaLog } = await appReal(dataSource, {
    reloj: opciones.reloj,
    modulos: (deps) => [crearModuloIdentidad(deps, { contrasenas }), rutaProtegida(deps, vistos)],
  });
  return { app, cuenta, vistos, salidaLog };
}

type App = Awaited<ReturnType<typeof armar>>['app'];

interface Envio {
  body?: object;
  cookie?: string;
  xrw?: string;
}

async function enviar(
  app: App,
  ruta: '/auth/login' | '/auth/refresh' | '/auth/logout',
  envio: Envio = {},
) {
  let peticion = request(app).post(`/api${ruta}`);
  if (envio.cookie !== undefined)
    peticion = peticion.set('Cookie', `billetera_refresh=${envio.cookie}`);
  if (envio.xrw !== undefined) peticion = peticion.set('X-Requested-With', envio.xrw);
  const respuesta = envio.body === undefined ? await peticion : await peticion.send(envio.body);
  validarRespuesta(respuesta, 'post', ruta);
  return respuesta;
}

async function protegida(app: App, autorizacion?: string) {
  let peticion = request(app).get('/api/cuentas');
  if (autorizacion !== undefined) peticion = peticion.set('Authorization', autorizacion);
  const respuesta = await peticion;
  validarRespuesta(respuesta, 'get', '/cuentas');
  return respuesta;
}

async function registrar(app: App, correo = correoNuevo()) {
  const respuesta = await request(app)
    .post('/api/auth/registro')
    .send({ correo, contrasena: CONTRASENA });
  validarRespuesta(respuesta, 'post', '/auth/registro');
  expect(respuesta.status).toBe(201);
  return { correo, usuarioId: respuesta.body.id as string };
}

interface CookieRecibida {
  valor: string;
  atributos: string[];
}

function cookieDe(respuesta: { headers: Record<string, unknown> }): CookieRecibida | undefined {
  const crudas = respuesta.headers['set-cookie'] as string[] | undefined;
  const cruda = crudas?.find((c) => c.startsWith('billetera_refresh='));
  if (!cruda) return undefined;
  const [par = '', ...atributos] = cruda.split(';').map((p) => p.trim());
  return { valor: par.slice('billetera_refresh='.length), atributos };
}

async function entrar(app: App, cliente: 'web' | 'movil', correo: string) {
  return enviar(app, '/auth/login', { body: { correo, contrasena: CONTRASENA, cliente } });
}

const sesionesDe = (usuarioId: string) =>
  consultarComoDueno<{
    familia_id: string;
    refresh_hash: string;
    expira_en: string;
    usada: boolean;
    revocada: boolean;
  }>(
    `SELECT familia_id, refresh_hash, expira_en, usada_en IS NOT NULL AS usada,
            revocada_en IS NOT NULL AS revocada
       FROM sesion WHERE usuario_id = $1 ORDER BY creado_en, id`,
    [usuarioId],
  );

const eventos = (tipo: string) =>
  consultarComoDueno<{ usuario_id: string | null; datos: Record<string, unknown> }>(
    'SELECT usuario_id, datos FROM evento_auditoria WHERE tipo = $1 ORDER BY id',
    [tipo],
  );

describe('POST /api/auth/login (T-API-13)', () => {
  it('R-1.6 R-1.13 DD-24: con cliente web el refresh va solo en la cookie HttpOnly, Secure, SameSite=Strict, Path=/api/auth', async () => {
    const { app, salidaLog } = await armar();
    const { correo, usuarioId } = await registrar(app);

    const respuesta = await entrar(app, 'web', correo);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).not.toHaveProperty('refreshToken');
    expect(Object.keys(respuesta.body).sort()).toEqual([
      'accessExpiraEn',
      'accessToken',
      'refreshExpiraEn',
    ]);
    const cookie = cookieDe(respuesta);
    expect(cookie?.valor).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie?.atributos).toEqual(
      expect.arrayContaining([
        'Max-Age=604800',
        'Path=/api/auth',
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
      ]),
    );
    expect(cookie?.atributos.some((a) => /^SameSite=(Lax|None)$/i.test(a))).toBe(false);

    // RNF-02: en la base solo el SHA-256 del refresh.
    const [sesion] = await sesionesDe(usuarioId);
    expect(sesion?.refresh_hash).toBe(sha256(cookie?.valor ?? ''));
    expect(await eventos('sesion-iniciada')).toContainEqual({
      usuario_id: usuarioId,
      datos: { familiaId: sesion?.familia_id, cliente: 'web' },
    });
    // DD-39: ni la contraseña ni los tokens llegan al log.
    for (const secreto of [CONTRASENA, cookie?.valor ?? '-', respuesta.body.accessToken]) {
      expect(salidaLog()).not.toContain(secreto);
    }
  });

  it('R-1.6 DD-29: el access es HS256 con sub, iss, aud y 15 minutos de vida', async () => {
    const { app } = await armar();
    const { correo, usuarioId } = await registrar(app);

    const respuesta = await entrar(app, 'movil', correo);

    const token = respuesta.body.accessToken as string;
    expect(decodeProtectedHeader(token).alg).toBe('HS256');
    const claims = decodeJwt(token);
    expect(claims).toMatchObject({ sub: usuarioId, iss: 'billetera-api', aud: 'billetera' });
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(900);
    expect(respuesta.body.accessExpiraEn).toBe(
      new Date((claims.exp ?? 0) * 1000).toISOString().replace(/\.\d{3}Z$/, '.000000Z'),
    );
  });

  it('R-1.6 DD-24: con cliente movil el refresh va en el cuerpo y no hay cookie', async () => {
    const { app } = await armar();
    const { correo } = await registrar(app);

    const respuesta = await entrar(app, 'movil', correo);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(respuesta.headers['set-cookie']).toBeUndefined();
  });

  it('R-1.7 DD-28: correo inexistente y contraseña incorrecta dan el mismo 401 credenciales-invalidas y verifican argon2 una vez cada uno', async () => {
    const { app, cuenta } = await armar();
    const { correo, usuarioId } = await registrar(app);
    // El hash ficticio se calcula al construir el módulo, antes de cualquier login.
    expect(cuenta.hashes).toBe(2);
    const antes = cuenta.verificaciones;

    const incorrecta = await enviar(app, '/auth/login', {
      body: { correo, contrasena: 'otra frase larga cualquiera', cliente: 'web' },
    });
    expect(cuenta.verificaciones - antes).toBe(1);
    const inexistente = await enviar(app, '/auth/login', {
      body: { correo: 'nadie-registrado@prueba.mx', contrasena: CONTRASENA, cliente: 'web' },
    });
    expect(cuenta.verificaciones - antes).toBe(2);

    expect(incorrecta.status).toBe(401);
    expect(incorrecta.body).toEqual(inexistente.body);
    expect(incorrecta.body.type).toBe('credenciales-invalidas');
    expect(cookieDe(incorrecta)).toBeUndefined();
    expect(await sesionesDe(usuarioId)).toEqual([]);
    const fallidos = await eventos('login-fallido');
    expect(fallidos.slice(-2)).toEqual([
      { usuario_id: null, datos: { correo: `s***@prueba.mx` } },
      { usuario_id: null, datos: { correo: 'n***@prueba.mx' } },
    ]);
  });
});

describe('POST /api/auth/refresh (T-API-13)', () => {
  it('R-1.8 DD-30: rota en la misma familia, marca el anterior como usado y hereda el mismo expira_en', async () => {
    const { app } = await armar();
    const { correo, usuarioId } = await registrar(app);
    const login = await entrar(app, 'movil', correo);
    const r1 = login.body.refreshToken as string;

    const rotado = await enviar(app, '/auth/refresh', { body: { refreshToken: r1 } });

    expect(rotado.status).toBe(200);
    const r2 = rotado.body.refreshToken as string;
    expect(r2).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r2).not.toBe(r1);
    expect(rotado.body.refreshExpiraEn).toBe(login.body.refreshExpiraEn);
    expect(rotado.headers['set-cookie']).toBeUndefined();
    const sesiones = await sesionesDe(usuarioId);
    expect(sesiones.map((s) => [s.refresh_hash, s.usada, s.revocada])).toEqual([
      [sha256(r1), true, false],
      [sha256(r2), false, false],
    ]);
    expect(new Set(sesiones.map((s) => s.familia_id)).size).toBe(1);
    expect(new Set(sesiones.map((s) => s.expira_en)).size).toBe(1);
    expect((await protegida(app, `Bearer ${rotado.body.accessToken}`)).status).toBe(200);
  });

  it('R-1.8 R-1.13 DD-24: por cookie, con X-Requested-With, el refresh nuevo vuelve solo en la cookie', async () => {
    const { app } = await armar();
    const { correo } = await registrar(app);
    const r1 = cookieDe(await entrar(app, 'web', correo))?.valor ?? '';

    const rotado = await enviar(app, '/auth/refresh', { cookie: r1, xrw: 'fetch' });

    expect(rotado.status).toBe(200);
    expect(rotado.body).not.toHaveProperty('refreshToken');
    const r2 = cookieDe(rotado);
    expect(r2?.valor).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r2?.valor).not.toBe(r1);
    expect(r2?.atributos).toEqual(
      expect.arrayContaining(['Path=/api/auth', 'HttpOnly', 'Secure', 'SameSite=Strict']),
    );
  });

  it('R-1.9 RNF-11: el reúso revoca toda la familia, audita refresh-reuse-detected y responde 401; el hijo ya no sirve', async () => {
    const { app } = await armar();
    const { correo, usuarioId } = await registrar(app);
    const r1 = (await entrar(app, 'movil', correo)).body.refreshToken as string;
    const otraFamilia = (await entrar(app, 'movil', correo)).body.refreshToken as string;
    const r2 = (await enviar(app, '/auth/refresh', { body: { refreshToken: r1 } })).body
      .refreshToken as string;

    const reuso = await enviar(app, '/auth/refresh', { body: { refreshToken: r1 } });

    expect(reuso.status).toBe(401);
    expect(reuso.body.type).toBe('unauthorized');
    const sesiones = await sesionesDe(usuarioId);
    const familia = sesiones.find((s) => s.refresh_hash === sha256(r1))?.familia_id;
    expect(sesiones.filter((s) => s.familia_id === familia).every((s) => s.revocada)).toBe(true);
    expect(sesiones.find((s) => s.refresh_hash === sha256(otraFamilia))?.revocada).toBe(false);
    expect(await eventos('refresh-reuse-detected')).toContainEqual({
      usuario_id: usuarioId,
      datos: { familiaId: familia, sesionesRevocadas: 2 },
    });

    const hijo = await enviar(app, '/auth/refresh', { body: { refreshToken: r2 } });
    expect(hijo.status).toBe(401);
    expect(hijo.body).toEqual(reuso.body);
  });

  it('R-1.10: un refresh inexistente o de una familia cerrada responde el mismo 401 unauthorized', async () => {
    const { app } = await armar();
    const { correo } = await registrar(app);
    const r1 = (await entrar(app, 'movil', correo)).body.refreshToken as string;
    expect((await enviar(app, '/auth/logout', { body: { refreshToken: r1 } })).status).toBe(204);

    const revocado = await enviar(app, '/auth/refresh', { body: { refreshToken: r1 } });
    const inexistente = await enviar(app, '/auth/refresh', {
      body: { refreshToken: randomBytes(32).toString('base64url') },
    });

    expect(revocado.status).toBe(401);
    expect(revocado.body).toEqual(inexistente.body);
    expect(inexistente.body.type).toBe('unauthorized');
  });

  it('R-1.10 DD-30: la familia vence 7 días después del login aunque se haya rotado', async () => {
    const reloj = new RelojFijo('2026-11-21 10:00:00+00');
    const { app } = await armar({ reloj });
    const { correo } = await registrar(app);
    const r1 = cookieDe(await entrar(app, 'web', correo))?.valor ?? '';

    reloj.fijar('2026-11-28 09:59:30+00');
    const casi = await enviar(app, '/auth/refresh', { cookie: r1, xrw: 'fetch' });
    expect(casi.status).toBe(200);
    expect(casi.body.refreshExpiraEn).toBe('2026-11-28T10:00:00.000000Z');
    const r2 = cookieDe(casi);
    expect(r2?.atributos).toContain('Max-Age=30');

    reloj.fijar('2026-11-28 10:00:00+00');
    const vencido = await enviar(app, '/auth/refresh', { cookie: r2?.valor ?? '', xrw: 'fetch' });
    expect(vencido.status).toBe(401);
    expect(vencido.body.type).toBe('unauthorized');
  });

  it.each([
    ['sin el header', undefined],
    ['con otro valor', 'XMLHttpRequest'],
  ])(
    'R-1.16: por cookie y %s → 400 en headers.x-requested-with, sin consumir el refresh',
    async (_caso, xrw) => {
      const { app } = await armar();
      const { correo, usuarioId } = await registrar(app);
      const r1 = cookieDe(await entrar(app, 'web', correo))?.valor ?? '';

      const rechazo = await enviar(app, '/auth/refresh', { cookie: r1, xrw });

      expect(rechazo.status).toBe(400);
      expect(rechazo.body.type).toBe('validation-error');
      expect(rechazo.body.errores.map((e: { campo: string }) => e.campo)).toEqual([
        'headers.x-requested-with',
      ]);
      expect((await sesionesDe(usuarioId)).map((s) => s.usada)).toEqual([false]);
      expect((await enviar(app, '/auth/refresh', { cookie: r1, xrw: 'fetch' })).status).toBe(200);
    },
  );

  it('DD-24: con cookie y cuerpo a la vez, o sin ninguno, responde 400 en body.refreshToken', async () => {
    const { app } = await armar();
    const { correo } = await registrar(app);
    const r1 = cookieDe(await entrar(app, 'web', correo))?.valor ?? '';

    const ambos = await enviar(app, '/auth/refresh', {
      cookie: r1,
      xrw: 'fetch',
      body: { refreshToken: r1 },
    });
    const ninguno = await enviar(app, '/auth/refresh');

    for (const respuesta of [ambos, ninguno]) {
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errores.map((e: { campo: string }) => e.campo)).toEqual([
        'body.refreshToken',
      ]);
    }
  });
});

describe('POST /api/auth/logout (T-API-13)', () => {
  it('R-1.12: por cookie revoca la familia, audita sesion-cerrada, borra la cookie y responde 204', async () => {
    const { app } = await armar();
    const { correo, usuarioId } = await registrar(app);
    const r1 = cookieDe(await entrar(app, 'web', correo))?.valor ?? '';

    const salida = await enviar(app, '/auth/logout', { cookie: r1, xrw: 'fetch' });

    expect(salida.status).toBe(204);
    const borrada = cookieDe(salida);
    expect(borrada?.valor).toBe('');
    expect(borrada?.atributos).toEqual(
      expect.arrayContaining([
        'Max-Age=0',
        'Path=/api/auth',
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
      ]),
    );
    const [sesion] = await sesionesDe(usuarioId);
    expect(sesion?.revocada).toBe(true);
    expect(await eventos('sesion-cerrada')).toContainEqual({
      usuario_id: usuarioId,
      datos: { familiaId: sesion?.familia_id },
    });
    expect((await enviar(app, '/auth/refresh', { cookie: r1, xrw: 'fetch' })).status).toBe(401);
  });

  it('R-1.12 DD-24: responde 204 y borra la cookie aunque el refresh sea inválido o no llegue', async () => {
    const { app } = await armar();
    const antes = (await eventos('sesion-cerrada')).length;

    const invalido = await enviar(app, '/auth/logout', {
      body: { refreshToken: randomBytes(32).toString('base64url') },
    });
    const sinNada = await enviar(app, '/auth/logout');

    for (const respuesta of [invalido, sinNada]) {
      expect(respuesta.status).toBe(204);
      expect(cookieDe(respuesta)?.atributos).toContain('Max-Age=0');
    }
    expect(await eventos('sesion-cerrada')).toHaveLength(antes);
  });

  it('R-1.16: por cookie sin X-Requested-With responde 400 y no revoca nada', async () => {
    const { app } = await armar();
    const { correo, usuarioId } = await registrar(app);
    const r1 = cookieDe(await entrar(app, 'web', correo))?.valor ?? '';

    const rechazo = await enviar(app, '/auth/logout', { cookie: r1 });

    expect(rechazo.status).toBe(400);
    expect(rechazo.body.errores.map((e: { campo: string }) => e.campo)).toEqual([
      'headers.x-requested-with',
    ]);
    expect((await sesionesDe(usuarioId)).map((s) => s.revocada)).toEqual([false]);
  });
});

describe('autenticar (T-API-13)', () => {
  const clave = new TextEncoder().encode(SECRETO);
  const ahora = () => Math.trunc(Date.now() / 1000);
  const firmar = (
    claims: Record<string, unknown>,
    { alg = 'HS256', secreto = clave }: { alg?: string; secreto?: Uint8Array } = {},
  ) => new SignJWT(claims).setProtectedHeader({ alg }).sign(secreto);
  const valido = (usuarioId: string, cambios: Record<string, unknown> = {}) => ({
    sub: usuarioId,
    iss: 'billetera-api',
    aud: 'billetera',
    iat: ahora(),
    exp: ahora() + 900,
    ...cambios,
  });

  it('R-1.11 DD-38: con un access válido pasa, pone usuarioId en la petición y en el contexto, y responde no-store', async () => {
    const { app, vistos } = await armar();
    const { correo, usuarioId } = await registrar(app);
    const { accessToken } = (await entrar(app, 'movil', correo)).body as { accessToken: string };

    const respuesta = await protegida(app, `Bearer ${accessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    expect(vistos).toEqual([{ usuarioId, enContexto: usuarioId }]);
  });

  it('DD-29: tolera 5 s de desfase de reloj en exp', async () => {
    const { app } = await armar();
    const token = await firmar(
      valido('00000000-0000-4000-8000-000000000001', { exp: ahora() - 3 }),
    );

    expect((await protegida(app, `Bearer ${token}`)).status).toBe(200);
  });

  it('R-1.11 RNF-02 DD-29: cualquier fallo responde el mismo 401 unauthorized con no-store', async () => {
    const { app, vistos } = await armar();
    const id = '00000000-0000-4000-8000-000000000001';
    const otroSecreto = new TextEncoder().encode('x'.repeat(32));
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const casos: Record<string, string | undefined> = {
      'sin header': undefined,
      'sin Bearer': await firmar(valido(id)),
      'mal formado': 'Bearer no.es.jwt',
      'alg none': `Bearer ${b64({ alg: 'none', typ: 'JWT' })}.${b64(valido(id))}.`,
      'otro secreto': `Bearer ${await firmar(valido(id), { secreto: otroSecreto })}`,
      // Mutación (e): sin algorithms: ['HS256'], jose acepta HS512 con la misma clave.
      'HS512 con el mismo secreto': `Bearer ${await firmar(valido(id), { alg: 'HS512' })}`,
      'otro issuer': `Bearer ${await firmar(valido(id, { iss: 'otro' }))}`,
      'otra audiencia': `Bearer ${await firmar(valido(id, { aud: 'otra' }))}`,
      'vencido hace más de 5 s': `Bearer ${await firmar(valido(id, { exp: ahora() - 10 }))}`,
      'sin sub': `Bearer ${await firmar(valido(id, { sub: undefined }))}`,
    };

    const cuerpos = [];
    for (const [caso, autorizacion] of Object.entries(casos)) {
      const respuesta = await protegida(app, autorizacion);
      expect(respuesta.status, caso).toBe(401);
      expect(respuesta.headers['cache-control'], caso).toBe('no-store');
      cuerpos.push(respuesta.body);
    }
    expect(new Set(cuerpos.map((c) => JSON.stringify(c))).size).toBe(1);
    expect(cuerpos[0].type).toBe('unauthorized');
    expect(vistos).toEqual([]);
  });
});
