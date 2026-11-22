// T-API-24, design.md §10.1 y §10.2: prueba de fugas sobre la salida cruda del logger y
// revisión del catálogo de auditoría contra los eventos que dejan los flujos reales.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enmascararCorreo } from '../../../src/plataforma/logging/enmascarar.js';
import { appReal, type AppReal } from '../apoyo/app-real.js';
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

const CONTRASENA = 'una frase larga para la prueba de fugas';
const COOKIE = 'billetera_refresh';

/** Catálogo de design.md §10.2 (DD-40). */
const CATALOGO = [
  'usuario-registrado',
  'sesion-iniciada',
  'login-fallido',
  'sesion-cerrada',
  'refresh-reuse-detected',
  'beneficiario-creado',
  'fondeo-aplicado',
  'transferencia-pendiente',
  'transferencia-aplicada',
  'transferencia-rechazada',
  'codigo-incorrecto',
];

type App = AppReal['app'];

function cookieDe(respuesta: { headers: Record<string, unknown> }): string {
  const crudas = (respuesta.headers['set-cookie'] as string[] | undefined) ?? [];
  const cruda = crudas.find((c) => c.startsWith(`${COOKIE}=`)) ?? '';
  const valor = cruda.split(';')[0]?.slice(COOKIE.length + 1) ?? '';
  if (valor === '') throw new Error('la respuesta no trajo la cookie de refresh');
  return valor;
}

/** Recorre todos los flujos de §10.1 y §10.2 y devuelve cada secreto que pasó por la API. */
async function recorrerFlujos(app: App) {
  const secretos: string[] = [CONTRASENA];
  const correoAna = `ana-fugas-${Date.now()}@prueba.mx`;
  const correoBeto = `beto-fugas-${Date.now()}@prueba.mx`;
  secretos.push(correoAna, correoBeto);

  const post = async (ruta: string, cuerpo: object, headers: Record<string, string> = {}) => {
    const respuesta = await request(app).post(`/api${ruta}`).set(headers).send(cuerpo);
    validarRespuesta(respuesta, 'post', ruta.replace(/[0-9a-f-]{36}/, '{transferenciaId}'));
    return respuesta;
  };

  // Registro con fondeo de bienvenida (usuario-registrado, fondeo-aplicado).
  for (const correo of [correoAna, correoBeto]) {
    expect((await post('/auth/registro', { correo, contrasena: CONTRASENA })).status).toBe(201);
  }
  // login-fallido.
  const fallido = await post('/auth/login', {
    correo: correoAna,
    contrasena: 'otra frase que no es la buena',
    cliente: 'web',
  });
  expect(fallido.status).toBe(401);

  // Login web: el refresh viaja en Set-Cookie (sesion-iniciada).
  const web = await post('/auth/login', {
    correo: correoAna,
    contrasena: CONTRASENA,
    cliente: 'web',
  });
  const r1 = cookieDe(web);
  secretos.push(web.body.accessToken as string, r1);
  // Refresh por cookie: Cookie de entrada y Set-Cookie de salida.
  const rotada = await post(
    '/auth/refresh',
    {},
    { Cookie: `${COOKIE}=${r1}`, 'X-Requested-With': 'fetch' },
  );
  expect(rotada.status).toBe(200);
  const r2 = cookieDe(rotada);
  const accessAna = rotada.body.accessToken as string;
  secretos.push(accessAna, r2);

  // Login móvil y refresh por cuerpo; después, el reúso (refresh-reuse-detected).
  const movil = await post('/auth/login', {
    correo: correoAna,
    contrasena: CONTRASENA,
    cliente: 'movil',
  });
  const m1 = movil.body.refreshToken as string;
  secretos.push(movil.body.accessToken as string, m1);
  const rotadaMovil = await post('/auth/refresh', { refreshToken: m1 });
  secretos.push(rotadaMovil.body.accessToken as string, rotadaMovil.body.refreshToken as string);
  expect((await post('/auth/refresh', { refreshToken: m1 })).status).toBe(401);

  const beto = await post('/auth/login', {
    correo: correoBeto,
    contrasena: CONTRASENA,
    cliente: 'movil',
  });
  const accessBeto = beto.body.accessToken as string;
  secretos.push(accessBeto, beto.body.refreshToken as string);

  // Todas las peticiones autenticadas llevan Authorization y también la cookie.
  const conSesion = (access: string) => ({
    Authorization: `Bearer ${access}`,
    Cookie: `${COOKIE}=${r2}`,
  });
  const cuentas = async (access: string) => {
    const respuesta = await request(app).get('/api/cuentas').set(conSesion(access));
    validarRespuesta(respuesta, 'get', '/cuentas');
    return respuesta.body.items as { id: string; nombre: string; clabe: string }[];
  };
  const [principalAna] = await cuentas(accessAna);
  const [principalBeto] = await cuentas(accessBeto);
  if (!principalAna || !principalBeto) throw new Error('faltan cuentas');
  secretos.push(principalAna.clabe, principalBeto.clabe);

  // beneficiario-creado.
  const alta = await post(
    '/beneficiarios',
    { nombre: 'Beto Fugas', alias: 'beto', clabe: principalBeto.clabe },
    conSesion(accessAna),
  );
  expect(alta.status).toBe(201);
  const destino = { tipo: 'BENEFICIARIO', beneficiarioId: alta.body.id as string };
  const transferir = (montoCentavos: number) =>
    post(
      '/transferencias',
      {
        cuentaOrigenId: principalAna.id,
        destino,
        montoCentavos,
        concepto: 'Prueba de fugas',
        referencia: '1',
      },
      { ...conSesion(accessAna), 'Idempotency-Key': randomUUID() },
    );

  // transferencia-aplicada.
  expect((await transferir(1_000)).status).toBe(201);
  // transferencia-pendiente, con el código simulado en la respuesta.
  const pendiente = await transferir(150_000);
  expect(pendiente.status).toBe(202);
  const { transferenciaId, codigoSimulado } = pendiente.body as {
    transferenciaId: string;
    codigoSimulado: string;
  };
  secretos.push(codigoSimulado);
  // codigo-incorrecto y después la confirmación correcta.
  const incorrecto = String((Number(codigoSimulado) + 1) % 1_000_000).padStart(6, '0');
  const confirmar = (codigo: string) =>
    post(`/transferencias/${transferenciaId}/confirmar`, { codigo }, conSesion(accessAna));
  expect((await confirmar(incorrecto)).status).toBe(422);
  expect((await confirmar(codigoSimulado)).status).toBe(201);
  // transferencia-rechazada por saldo.
  expect((await transferir(90_000_000)).status).toBe(422);

  // sesion-cerrada, con la cookie vigente.
  const salida = await post(
    '/auth/logout',
    {},
    { Cookie: `${COOKIE}=${r2}`, 'X-Requested-With': 'fetch' },
  );
  expect(salida.status).toBe(204);

  return { secretos, codigo: codigoSimulado, correoAna };
}

describe('logs sin datos sensibles y catálogo de auditoría (T-API-24)', () => {
  it('RNF-12 R-6.16 DD-39: la salida cruda del logger no contiene contraseña, tokens, cookie, Authorization, el código, la CLABE ni el correo; cada línea trae reqId', async () => {
    const { app, salidaLog } = await appReal(dataSource, {
      config: { FONDEO_BIENVENIDA_CENTAVOS: 1_000_000, UMBRAL_CODIGO_CENTAVOS: 100_000 },
    });
    const { secretos, codigo, correoAna } = await recorrerFlujos(app);
    const log = salidaLog();

    expect(secretos.every((s) => s.length >= 6)).toBe(true);
    for (const secreto of secretos) expect(log).not.toContain(secreto);
    // El código son 6 dígitos: se busca como valor aislado, no dentro de un uuid u otro número.
    expect(log).not.toMatch(new RegExp(`(^|[^0-9a-f-])${codigo}([^0-9a-f-]|$)`));
    expect(log).not.toMatch(/Bearer /i);
    expect(log).not.toContain(`${COOKIE}=`);
    expect(log.toLowerCase()).not.toContain('"authorization"');

    const lineas = log
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    // Una línea de cierre por cada una de las 18 peticiones, más el warn del reúso.
    expect(lineas).toHaveLength(19);
    for (const linea of lineas) expect(typeof linea['reqId']).toBe('string');
    // El único warn de estos flujos es el reúso del refresh (§10.1).
    expect(lineas.filter((l) => l['level'] === 40).map((l) => l['msg'])).toEqual([
      'reúso de refresh: familia revocada',
    ]);

    // El correo solo queda en la auditoría de login-fallido, enmascarado.
    const [fallido] = await consultarComoDueno<{ datos: { correo: string } }>(
      "SELECT datos FROM evento_auditoria WHERE tipo = 'login-fallido'",
    );
    expect(fallido?.datos.correo).toBe(enmascararCorreo(correoAna));
    expect(fallido?.datos.correo).toMatch(/^a\*\*\*@prueba\.mx$/);
  });

  it('RNF-11 DD-40: cada flujo de §10.2 deja su evento, todos con request_id y sin secretos en datos', async () => {
    const { app } = await appReal(dataSource, {
      config: { FONDEO_BIENVENIDA_CENTAVOS: 1_000_000, UMBRAL_CODIGO_CENTAVOS: 100_000 },
    });
    const antes = await consultarComoDueno<{ id: number }>(
      'SELECT coalesce(max(id), 0)::bigint AS id FROM evento_auditoria',
    );
    const { secretos } = await recorrerFlujos(app);

    const eventos = await consultarComoDueno<{
      tipo: string;
      request_id: string | null;
      datos: unknown;
    }>('SELECT tipo, request_id, datos FROM evento_auditoria WHERE id > $1 ORDER BY id', [
      antes[0]?.id ?? 0,
    ]);
    expect(new Set(eventos.map((e) => e.tipo))).toEqual(new Set(CATALOGO));
    for (const evento of eventos) {
      expect(evento.request_id).toMatch(/^[0-9a-f-]{36}$/);
      const datos = JSON.stringify(evento.datos);
      for (const secreto of secretos) expect(datos).not.toContain(secreto);
    }
  });
});
