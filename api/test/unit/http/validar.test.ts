import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validar, type DatosValidados } from '../../../src/plataforma/http/validar.js';
import { appDePrueba } from '../../apoyo/app.js';

const ID = '0b6f1f8e-4f0c-4b8e-9a51-7d0e0f6a2c11';
const LLAVE = '6f0c2a1e-9b7d-4c3e-8a51-7d0e0f6a2c11';

const esquemas = {
  params: z.object({ id: z.guid() }),
  query: z.object({ limite: z.string().regex(/^\d+$/).transform(Number).default(20) }),
  body: z.object({ montoCentavos: z.number().int().positive() }).strict(),
  headers: z.object({ 'idempotency-key': z.guid() }),
};

function appConRutaValidada() {
  const ruta = Router().post('/cosas/:id', validar(esquemas), (req, res) => {
    const datos = req.validado as DatosValidados<typeof esquemas>;
    res.json(datos);
  });
  return appDePrueba({ modulos: [ruta] }).app;
}

describe('validar', () => {
  it('RNF-01: con datos válidos deja en req.validado las cuatro partes ya transformadas', async () => {
    const respuesta = await request(appConRutaValidada())
      .post(`/api/cosas/${ID}?limite=5`)
      .set('Idempotency-Key', LLAVE)
      .send({ montoCentavos: 1500 });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      params: { id: ID },
      query: { limite: 5 },
      body: { montoCentavos: 1500 },
      headers: { 'idempotency-key': LLAVE },
    });
  });

  it('RNF-01: req.validado.headers solo trae los headers declarados', async () => {
    const respuesta = await request(appConRutaValidada())
      .post(`/api/cosas/${ID}`)
      .set('Idempotency-Key', LLAVE)
      .set('Authorization', 'Bearer x')
      .send({ montoCentavos: 1 });
    expect(Object.keys(respuesta.body.headers)).toEqual(['idempotency-key']);
  });

  it('RNF-01: los errores llevan la ruta prefijada con body., query., params. y headers.', async () => {
    const respuesta = await request(appConRutaValidada())
      .post('/api/cosas/no-es-uuid?limite=abc')
      .send({ montoCentavos: -1 });

    expect(respuesta.status).toBe(400);
    expect(respuesta.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(respuesta.body).toMatchObject({
      type: 'validation-error',
      title: 'Datos inválidos',
      status: 400,
    });
    const campos = (respuesta.body.errores as { campo: string }[]).map((e) => e.campo).sort();
    expect(campos).toEqual([
      'body.montoCentavos',
      'headers.idempotency-key',
      'params.id',
      'query.limite',
    ]);
  });

  it('RNF-01: un campo no declarado en un cuerpo .strict() se rechaza con campo body', async () => {
    const respuesta = await request(appConRutaValidada())
      .post(`/api/cosas/${ID}`)
      .set('Idempotency-Key', LLAVE)
      .send({ montoCentavos: 1, extra: true });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual([{ campo: 'body', mensaje: expect.any(String) }]);
  });

  it('RNF-01: sin cuerpo JSON, el body declarado falla con campo body', async () => {
    const respuesta = await request(appConRutaValidada())
      .post(`/api/cosas/${ID}`)
      .set('Idempotency-Key', LLAVE);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual([{ campo: 'body', mensaje: expect.any(String) }]);
  });
});
