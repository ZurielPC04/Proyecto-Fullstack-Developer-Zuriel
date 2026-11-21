import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../../../src/app.js';
import { configDePrueba } from '../../apoyo/app.js';
import { crearDataSource } from '../../../src/plataforma/db/data-source.js';
import { crearVerificarBase } from '../../../src/plataforma/db/salud.js';
import { crearLogger } from '../../../src/plataforma/logging/logger.js';
import { ProveedorOtpSimulado } from '../../../src/plataforma/otp/index.js';
import { RelojBaseDatos } from '../../../src/plataforma/reloj/index.js';
import { abrirDataSource } from '../apoyo/base.js';
import { validarRespuesta } from '../apoyo/contrato.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

function appReal(verificarBase: () => Promise<void>) {
  return crearApp(
    {
      config: configDePrueba(),
      logger: crearLogger({ nivel: 'silent' }),
      verificarBase,
      dataSource,
      reloj: new RelojBaseDatos(),
      proveedorOtp: new ProveedorOtpSimulado(),
    },
    [],
  );
}

describe('validador del contrato (Ajv, JSON Schema 2020-12)', () => {
  it('RNF-01 DD-27: GET /api/health con la base real cumple el contrato (200)', async () => {
    const respuesta = await request(appReal(crearVerificarBase(dataSource))).get('/api/health');
    expect(respuesta.status).toBe(200);
    expect(() => validarRespuesta(respuesta, 'get', '/health')).not.toThrow();
  });

  it('RNF-01 DD-27: el 503 retryable con la base caída cumple el contrato (Problema)', async () => {
    const caida = crearDataSource({
      url: 'postgresql://billetera_app:x@127.0.0.1:1/billetera_test',
      poolMax: 1,
    });
    const respuesta = await request(appReal(crearVerificarBase(caida))).get('/api/health');
    expect(respuesta.status).toBe(503);
    expect(() => validarRespuesta(respuesta, 'get', '/health')).not.toThrow();
  });

  it('DD-27: una respuesta que no cumple el esquema hace fallar la validación', () => {
    const alterada = {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { estado: 'casi' },
    };
    expect(() => validarRespuesta(alterada, 'get', '/health')).toThrow(/no cumple el contrato/);
  });

  it('DD-27: un problem sin detail no cumple el contrato', () => {
    const sinDetalle = {
      status: 503,
      headers: { 'content-type': 'application/problem+json' },
      body: { type: 'retryable', title: 'Servicio ocupado', status: 503 },
    };
    expect(() => validarRespuesta(sinDetalle, 'get', '/health')).toThrow(/no cumple el contrato/);
  });

  it('DD-27: un código que el contrato no declara hace fallar la validación', () => {
    const inesperada = { status: 418, headers: { 'content-type': 'application/json' }, body: {} };
    expect(() => validarRespuesta(inesperada, 'get', '/health')).toThrow(/no declara/);
  });
});
