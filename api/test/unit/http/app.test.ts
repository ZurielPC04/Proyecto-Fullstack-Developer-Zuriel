import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { NoEncontrado, Reintentable } from '../../../src/plataforma/http/errores.js';
import { appDePrueba, WEB_ORIGIN } from '../../apoyo/app.js';

const UUID_MINUSCULAS = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('app: problemas RFC 7807', () => {
  it('RNF-01: una ruta inexistente responde 404 not-found como application/problem+json', async () => {
    const { app } = appDePrueba();
    const respuesta = await request(app).get('/api/no-existe');

    expect(respuesta.status).toBe(404);
    expect(respuesta.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(respuesta.body).toEqual({
      type: 'not-found',
      title: 'No encontrado',
      status: 404,
      detail: 'No encontramos lo que buscas.',
    });
    expect(respuesta.headers['x-request-id']).toMatch(UUID_MINUSCULAS);
  });
});

describe('app: errores internos y de dominio', () => {
  const MENSAJE_INTERNO =
    'error: relation "usuario" does not exist\n    at Parser.parseErrorMessage (node_modules/pg-protocol/dist/parser.js:283:98)\n    SELECT * FROM usuario WHERE correo = $1';

  function rutaQueLanza(error: unknown) {
    return Router().get('/falla', () => {
      throw error;
    });
  }

  it('RNF-01: un error con SQL y traza responde 500 solo con type, title, status y detail', async () => {
    const { app } = appDePrueba({ modulos: [rutaQueLanza(new Error(MENSAJE_INTERNO))] });
    const respuesta = await request(app).get('/api/falla');

    expect(respuesta.status).toBe(500);
    expect(respuesta.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(respuesta.body).toEqual({
      type: 'internal-error',
      title: 'Error interno',
      status: 500,
      detail: 'Ocurrió un error inesperado. Inténtalo más tarde.',
    });
    expect(respuesta.text).not.toContain('SELECT');
    expect(respuesta.text).not.toContain('at ');
    expect(respuesta.text).not.toContain('usuario');
  });

  it('RNF-01 RNF-12: la causa del 500 queda en el log como error, con el reqId de la petición', async () => {
    const { app, registros } = appDePrueba({ modulos: [rutaQueLanza(new Error(MENSAJE_INTERNO))] });
    const respuesta = await request(app).get('/api/falla');

    const error = registros().find((r) => r['level'] === 50);
    expect(error).toMatchObject({ reqId: respuesta.headers['x-request-id'] });
    expect(JSON.stringify(error)).toContain('SELECT * FROM usuario');
  });

  it('RNF-01: un ErrorDominio responde con su type del catálogo', async () => {
    const { app } = appDePrueba({ modulos: [rutaQueLanza(new NoEncontrado())] });
    const respuesta = await request(app).get('/api/falla');
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({
      type: 'not-found',
      title: 'No encontrado',
      status: 404,
      detail: 'No encontramos lo que buscas.',
    });
  });

  it('RNF-01 R-4.19: Reintentable responde 503 retryable con Retry-After: 1, sin la causa', async () => {
    const causa = new Error('canceling statement due to lock timeout');
    const { app } = appDePrueba({ modulos: [rutaQueLanza(new Reintentable({ cause: causa }))] });
    const respuesta = await request(app).get('/api/falla');
    expect(respuesta.status).toBe(503);
    expect(respuesta.headers['retry-after']).toBe('1');
    expect(respuesta.body).toMatchObject({
      type: 'retryable',
      title: 'Servicio ocupado',
      status: 503,
    });
    expect(respuesta.text).not.toContain('lock timeout');
  });

  it('RNF-01: un error lanzado en un handler async también llega al manejador', async () => {
    const asincrona = Router().get('/falla', async () => {
      await Promise.resolve();
      throw new Error(MENSAJE_INTERNO);
    });
    const respuesta = await request(appDePrueba({ modulos: [asincrona] }).app).get('/api/falla');
    expect(respuesta.status).toBe(500);
    expect(respuesta.text).not.toContain('SELECT');
  });
});

describe('app: cuerpo JSON', () => {
  it('RNF-01: un JSON mal formado responde 400 validation-error con campo body', async () => {
    const respuesta = await request(appDePrueba().app)
      .post('/api/x')
      .set('Content-Type', 'application/json')
      .send('{"monto": 10,');

    expect(respuesta.status).toBe(400);
    expect(respuesta.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(respuesta.body).toMatchObject({
      type: 'validation-error',
      title: 'Datos inválidos',
      status: 400,
    });
    expect(respuesta.body.errores).toEqual([{ campo: 'body', mensaje: expect.any(String) }]);
  });

  it('RNF-01: un cuerpo de más de 16 kB responde 400 validation-error con campo body, sin 413', async () => {
    const grande = JSON.stringify({ relleno: 'x'.repeat(16 * 1024) });
    const respuesta = await request(appDePrueba().app)
      .post('/api/x')
      .set('Content-Type', 'application/json')
      .send(grande);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toMatchObject({ type: 'validation-error', status: 400 });
    expect(respuesta.body.errores).toEqual([{ campo: 'body', mensaje: expect.any(String) }]);
  });

  it('RNF-01: un JSON de menos de 16 kB llega a la ruta', async () => {
    const eco = Router().post('/eco', (req, res) => {
      res.json(req.body);
    });
    const respuesta = await request(appDePrueba({ modulos: [eco] }).app)
      .post('/api/eco')
      .send({ relleno: 'x'.repeat(15 * 1024) });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.relleno).toHaveLength(15 * 1024);
  });
});

describe('app: salud', () => {
  it('RNF-01: GET /api/health responde 200 {estado: ok} si la base contesta', async () => {
    const respuesta = await request(appDePrueba({ verificarBase: async () => {} }).app).get(
      '/api/health',
    );
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ estado: 'ok' });
  });

  it('RNF-01 R-4.19: GET /api/health responde 503 retryable con Retry-After: 1 si la base no contesta', async () => {
    const verificarBase = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:5433');
    };
    const respuesta = await request(appDePrueba({ verificarBase }).app).get('/api/health');
    expect(respuesta.status).toBe(503);
    expect(respuesta.headers['retry-after']).toBe('1');
    expect(respuesta.body).toMatchObject({ type: 'retryable', status: 503 });
    expect(respuesta.text).not.toContain('ECONNREFUSED');
  });
});

describe('app: documentación navegable', () => {
  it('RNF-28 DD-27: GET /api/docs sirve Swagger UI fuera de producción', async () => {
    // /api/docs redirige (301) a /api/docs/: los recursos de Swagger UI son rutas relativas.
    const respuesta = await request(appDePrueba({ config: { NODE_ENV: 'test' } }).app)
      .get('/api/docs')
      .redirects(1);
    expect(respuesta.redirects).toEqual([expect.stringMatching(/\/api\/docs\/$/)]);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/^text\/html/);
    expect(respuesta.text).toContain('swagger-ui');
  });

  it('RNF-28: GET /api/openapi.yaml sirve el contrato tal cual fuera de producción', async () => {
    const respuesta = await request(appDePrueba({ config: { NODE_ENV: 'development' } }).app).get(
      '/api/openapi.yaml',
    );
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/yaml/);
    expect(respuesta.text).toMatch(/^openapi: 3\.1\.0/);
  });

  it.each(['/api/docs', '/api/docs/', '/api/openapi.yaml'])(
    'RNF-28 DD-27: %s no existe en producción (404 not-found)',
    async (ruta) => {
      const produccion = appDePrueba({
        config: {
          NODE_ENV: 'production',
          OTP_SIMULADO: false,
          WEB_ORIGIN: 'https://billetera.example',
        },
      });
      const respuesta = await request(produccion.app).get(ruta);
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toMatchObject({ type: 'not-found' });
    },
  );
});

describe('app: log de cada petición', () => {
  it('RNF-12 DD-39: la salida cruda del logger no contiene Authorization, Cookie ni el cuerpo', async () => {
    const eco = Router().post('/eco', (req, res) => {
      res.cookie('billetera_refresh', 'TOKEN-SET-COOKIE').json({ ok: true });
    });
    const { app, salidaLog } = appDePrueba({ modulos: [eco] });
    await request(app)
      .post('/api/eco')
      .set('Authorization', 'Bearer TOKEN-ACCESO')
      .set('Cookie', 'billetera_refresh=TOKEN-COOKIE')
      .send({ contrasena: 'CONTRASENA-DEL-CUERPO' });

    expect(salidaLog()).not.toContain('TOKEN-ACCESO');
    expect(salidaLog()).not.toContain('TOKEN-COOKIE');
    expect(salidaLog()).not.toContain('TOKEN-SET-COOKIE');
    expect(salidaLog()).not.toContain('CONTRASENA-DEL-CUERPO');
  });

  it('RNF-12: la línea de cierre trae reqId una vez, método, URL, código y tiempo, sin headers', async () => {
    const { app, salidaLog } = appDePrueba();
    const respuesta = await request(app).get('/api/health?x=1');

    const lineas = salidaLog().trim().split('\n');
    expect(lineas).toHaveLength(1);
    const linea = lineas[0] ?? '';
    expect(linea.match(/"reqId"/g)).toHaveLength(1);
    const registro = JSON.parse(linea) as Record<string, unknown>;
    expect(registro).toMatchObject({
      level: 30,
      reqId: respuesta.headers['x-request-id'],
      req: { method: 'GET', url: '/api/health?x=1' },
      res: { statusCode: 200 },
      responseTime: expect.any(Number),
    });
    expect(registro['req']).toEqual({ method: 'GET', url: '/api/health?x=1' });
    expect(registro['res']).toEqual({ statusCode: 200 });
    expect(registro['time']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('app: seguridad HTTP', () => {
  it('RNF-05: helmet agrega sus headers de seguridad', async () => {
    const respuesta = await request(appDePrueba().app).get('/api/health');
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['content-security-policy']).toBeDefined();
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });

  it('RNF-05 RNF-28: fuera de producción la CSP no trae upgrade-insecure-requests (Swagger UI en http://localhost)', async () => {
    const respuesta = await request(appDePrueba({ config: { NODE_ENV: 'test' } }).app).get(
      '/api/health',
    );
    expect(respuesta.headers['content-security-policy']).toContain("default-src 'self'");
    expect(respuesta.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  it('RNF-05: en producción la CSP conserva upgrade-insecure-requests', async () => {
    const produccion = appDePrueba({
      config: {
        NODE_ENV: 'production',
        OTP_SIMULADO: false,
        WEB_ORIGIN: 'https://billetera.example',
      },
    });
    const respuesta = await request(produccion.app).get('/api/health');
    expect(respuesta.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });

  it('RNF-05: CORS permite WEB_ORIGIN con credenciales', async () => {
    const respuesta = await request(appDePrueba().app).get('/api/health').set('Origin', WEB_ORIGIN);
    expect(respuesta.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(respuesta.headers['access-control-allow-credentials']).toBe('true');
  });

  it('RNF-05: la preflight de WEB_ORIGIN responde sin pasar por las rutas', async () => {
    const respuesta = await request(appDePrueba().app)
      .options('/api/transferencias')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,idempotency-key');
    expect(respuesta.status).toBe(204);
    expect(respuesta.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
  });

  it('RNF-05: CORS no permite otro origen', async () => {
    const respuesta = await request(appDePrueba().app)
      .get('/api/health')
      .set('Origin', 'https://atacante.example');
    expect(respuesta.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('D-06: cookie-parser deja la cookie de refresh en req.cookies', async () => {
    const lee = Router().get('/cookie', (req, res) => {
      res.json({ refresh: (req.cookies as Record<string, string>)['billetera_refresh'] });
    });
    const respuesta = await request(appDePrueba({ modulos: [lee] }).app)
      .get('/api/cookie')
      .set('Cookie', 'billetera_refresh=abc');
    expect(respuesta.body).toEqual({ refresh: 'abc' });
  });
});

describe('app: request ID', () => {
  const ENTRANTE = '6f0c2a1e-9b7d-4c3e-8a51-7d0e0f6a2c11';

  it('DD-09 RNF-12: un X-Request-Id entrante con forma de UUID se reutiliza', async () => {
    const respuesta = await request(appDePrueba().app).get('/api/x').set('X-Request-Id', ENTRANTE);
    expect(respuesta.headers['x-request-id']).toBe(ENTRANTE);
  });

  it('DD-09 RNF-12: uno en mayúsculas se acepta y se devuelve en minúsculas', async () => {
    const respuesta = await request(appDePrueba().app)
      .get('/api/x')
      .set('X-Request-Id', ENTRANTE.toUpperCase());
    expect(respuesta.headers['x-request-id']).toBe(ENTRANTE);
  });

  it.each(['hola', `${ENTRANTE}x`, `{${ENTRANTE}}`, '6f0c2a1e9b7d4c3e8a517d0e0f6a2c11'])(
    'DD-09 RNF-12: %j se reemplaza por un UUID nuevo',
    async (entrante) => {
      const respuesta = await request(appDePrueba().app)
        .get('/api/x')
        .set('X-Request-Id', entrante);
      expect(respuesta.headers['x-request-id']).toMatch(UUID_MINUSCULAS);
      expect(respuesta.headers['x-request-id']).not.toContain(entrante);
    },
  );

  it('DD-09: el request ID no viaja en el cuerpo del problem', async () => {
    const respuesta = await request(appDePrueba().app).get('/api/x').set('X-Request-Id', ENTRANTE);
    expect(JSON.stringify(respuesta.body)).not.toContain(ENTRANTE);
  });
});
