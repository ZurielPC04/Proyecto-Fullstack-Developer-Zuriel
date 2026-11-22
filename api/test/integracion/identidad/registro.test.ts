import { digitoVerificador, validarClabe } from '@billetera/shared';
import argon2 from 'argon2';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearModuloIdentidad } from '../../../src/modulos/identidad/index.js';
import { abrirDataSource } from '../apoyo/base.js';
import { appReal } from '../apoyo/app-real.js';
import { validarRespuesta } from '../apoyo/contrato.js';
import { crearUsuarioConCuentas, FONDEO_ID } from '../apoyo/fabricas.js';
import { consultarComoDueno } from '../apoyo/migraciones.js';
import { ejecutar, fotografia } from '../apoyo/sql-directo.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

const CONTRASENA = 'una frase larga y propia';
let contador = 0;
const correoNuevo = () => `registro-${Date.now()}-${contador++}@prueba.mx`;

async function registrar(app: Parameters<typeof request>[0], cuerpo: unknown) {
  const respuesta = await request(app)
    .post('/api/auth/registro')
    .send(cuerpo as object);
  validarRespuesta(respuesta, 'post', '/auth/registro');
  return respuesta;
}

interface CuentaFila {
  id: string;
  nombre: string;
  clabe: string;
  saldo: number;
}

const cuentasDe = (usuarioId: string) =>
  consultarComoDueno<CuentaFila>(
    `SELECT id, nombre, clabe, saldo_centavos AS saldo FROM cuenta
      WHERE usuario_id = $1 ORDER BY nombre DESC`,
    [usuarioId],
  );

const eventosDe = (usuarioId: string) =>
  consultarComoDueno<{ tipo: string; datos: Record<string, unknown> }>(
    'SELECT tipo, datos FROM evento_auditoria WHERE usuario_id = $1 ORDER BY id',
    [usuarioId],
  );

describe('POST /api/auth/registro (T-API-12)', () => {
  it('R-1.1 R-1.2 DD-24: crea usuario, Principal y Ahorro con CLABE válida y el fondeo de bienvenida; responde 201 { id, correo } sin sesión', async () => {
    const { app } = await appReal(dataSource, { config: { FONDEO_BIENVENIDA_CENTAVOS: 1_000_000 } });
    const correo = correoNuevo();

    const respuesta = await registrar(app, {
      correo: `  ${correo.toUpperCase()} `,
      contrasena: CONTRASENA,
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({ id: expect.any(String), correo });
    expect(respuesta.headers['set-cookie']).toBeUndefined();
    const id = respuesta.body.id as string;

    const cuentas = await cuentasDe(id);
    expect(cuentas.map((c) => [c.nombre, c.saldo])).toEqual([
      ['Principal', 1_000_000],
      ['Ahorro', 0],
    ]);
    for (const { clabe } of cuentas) {
      expect(validarClabe(clabe).ok).toBe(true);
      expect(clabe.slice(0, 6)).toBe('999180');
    }
    expect(cuentas[0]?.clabe).not.toBe(cuentas[1]?.clabe);

    const [transferencia] = await consultarComoDueno<Record<string, unknown>>(
      `SELECT tipo, estado, concepto, cuenta_origen_id, monto_centavos FROM transferencia
        WHERE cuenta_destino_id = $1`,
      [cuentas[0]?.id],
    );
    expect(transferencia).toEqual({
      tipo: 'FONDEO',
      estado: 'APLICADA',
      concepto: 'Depósito de bienvenida',
      cuenta_origen_id: FONDEO_ID,
      monto_centavos: 1_000_000,
    });

    const eventos = await eventosDe(id);
    expect(eventos.map((e) => e.tipo)).toEqual(['fondeo-aplicado', 'usuario-registrado']);
    expect(eventos[1]?.datos).toEqual({ cuentas: cuentas.map((c) => c.id) });
  });

  it('R-1.1 D-20: con FONDEO_BIENVENIDA_CENTAVOS = 0 no hay fondeo ni su evento', async () => {
    const { app } = await appReal(dataSource, { config: { FONDEO_BIENVENIDA_CENTAVOS: 0 } });

    const respuesta = await registrar(app, { correo: correoNuevo(), contrasena: CONTRASENA });

    expect(respuesta.status).toBe(201);
    const id = respuesta.body.id as string;
    expect((await cuentasDe(id)).map((c) => c.saldo)).toEqual([0, 0]);
    expect((await eventosDe(id)).map((e) => e.tipo)).toEqual(['usuario-registrado']);
  });

  it('RNF-03 DD-28: la contraseña se guarda como argon2id con los parámetros de DD-28, calculada sobre su forma NFC', async () => {
    const { app } = await appReal(dataSource);
    const correo = correoNuevo();
    // "é" descompuesta (e + U+0301); el hash debe verificar con la forma compuesta.
    const descompuesta = 'contraséna muy larga';

    const respuesta = await registrar(app, { correo, contrasena: descompuesta });

    expect(respuesta.status).toBe(201);
    const [{ hash }] = (await consultarComoDueno<{ hash: string }>(
      'SELECT hash_contrasena AS hash FROM usuario WHERE correo = $1',
      [correo],
    )) as [{ hash: string }];
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await argon2.verify(hash, descompuesta.normalize('NFC'))).toBe(true);
    expect(hash).not.toContain(descompuesta);
  });

  it('R-1.4 DD-23: correo duplicado → 409 correo-ya-registrado y no crea nada', async () => {
    const { app } = await appReal(dataSource, { config: { FONDEO_BIENVENIDA_CENTAVOS: 1_000 } });
    const correo = correoNuevo();
    expect((await registrar(app, { correo, contrasena: CONTRASENA })).status).toBe(201);
    const antes = await fotografia();

    const respuesta = await registrar(app, {
      correo: correo.toUpperCase(),
      contrasena: CONTRASENA,
    });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.type).toBe('correo-ya-registrado');
    expect(await fotografia()).toEqual(antes);
  });

  it.each([
    ['contraseña corta', { correo: 'ok@prueba.mx', contrasena: 'corta' }, 'body.contrasena'],
    ['contraseña común', { correo: 'ok@prueba.mx', contrasena: '1qaz2wsx3edc' }, 'body.contrasena'],
    [
      'contraseña igual al correo',
      { correo: 'largo.nombre@prueba.mx', contrasena: 'largo.nombre@prueba.mx' },
      'body.contrasena',
    ],
    ['correo inválido', { correo: 'no-es-correo', contrasena: CONTRASENA }, 'body.correo'],
    ['campo desconocido', { correo: 'ok@prueba.mx', contrasena: CONTRASENA, extra: 1 }, 'body'],
  ])(
    'R-1.5: %s → 400 validation-error con el campo, sin crear nada',
    async (_caso, cuerpo, campo) => {
      const { app } = await appReal(dataSource);
      const antes = await fotografia();

      const respuesta = await registrar(app, cuerpo);

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.type).toBe('validation-error');
      expect(respuesta.body.errores.map((e: { campo: string }) => e.campo)).toContain(campo);
      expect(await fotografia()).toEqual(antes);
    },
  );

  it('R-1.3 DD-40: un fallo forzado después de crear las cuentas y el fondeo no deja nada', async () => {
    const { app } = await appReal(dataSource, { config: { FONDEO_BIENVENIDA_CENTAVOS: 1_000_000 } });
    // El evento usuario-registrado se inserta después de las cuentas y del fondeo (§12.1).
    // Idempotente: si una corrida anterior murió antes del finally, la función ya existe.
    await ejecutar('dueno', async (c) => {
      await c.query('DROP TRIGGER IF EXISTS tg_prueba_falla_registro ON evento_auditoria');
      await c.query(`
        CREATE OR REPLACE FUNCTION prueba_falla_registro() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`);
      await c.query(`
        CREATE TRIGGER tg_prueba_falla_registro BEFORE INSERT ON evento_auditoria
          FOR EACH ROW WHEN (NEW.tipo = 'usuario-registrado')
          EXECUTE FUNCTION prueba_falla_registro()`);
    });
    try {
      const antes = await fotografia();
      const correo = correoNuevo();

      const respuesta = await registrar(app, { correo, contrasena: CONTRASENA });

      expect(respuesta.status).toBe(500);
      expect(respuesta.body.type).toBe('internal-error');
      expect(await fotografia()).toEqual(antes);
    } finally {
      await ejecutar('dueno', async (c) => {
        await c.query('DROP TRIGGER IF EXISTS tg_prueba_falla_registro ON evento_auditoria');
        await c.query('DROP FUNCTION IF EXISTS prueba_falla_registro()');
      });
    }
  });

  it('DD-19: si la CLABE generada ya existe, genera otra y el registro sigue', async () => {
    const existente = await crearUsuarioConCuentas(dataSource);
    const [{ clabe: ocupada }] = (await consultarComoDueno<{ clabe: string }>(
      'SELECT clabe FROM cuenta WHERE id = $1',
      [existente.principalId],
    )) as [{ clabe: string }];
    // Principal choca con la ocupada y toma la primera libre; Ahorro toma la segunda.
    const secuencia = [ocupada, ...libresValidas()];
    const generarClabe = () => secuencia.shift() ?? '';
    const { app } = await appReal(dataSource, {
      modulos: (deps) => [crearModuloIdentidad(deps, { generarClabe })],
    });

    const respuesta = await registrar(app, { correo: correoNuevo(), contrasena: CONTRASENA });

    expect(respuesta.status).toBe(201);
    const cuentas = await cuentasDe(respuesta.body.id as string);
    expect(cuentas.map((c) => c.clabe)).toEqual(libresValidas());
  });

  it('DD-19: si las 5 CLABEs generadas están ocupadas, responde 500 y no deja nada', async () => {
    const existente = await crearUsuarioConCuentas(dataSource);
    const [{ clabe: ocupada }] = (await consultarComoDueno<{ clabe: string }>(
      'SELECT clabe FROM cuenta WHERE id = $1',
      [existente.principalId],
    )) as [{ clabe: string }];
    let llamadas = 0;
    const { app } = await appReal(dataSource, {
      modulos: (deps) => [
        crearModuloIdentidad(deps, {
          generarClabe: () => {
            llamadas++;
            return ocupada;
          },
        }),
      ],
    });
    const antes = await fotografia();

    const respuesta = await registrar(app, { correo: correoNuevo(), contrasena: CONTRASENA });

    expect(respuesta.status).toBe(500);
    expect(llamadas).toBe(5);
    expect(await fotografia()).toEqual(antes);
  });
});

/** Dos CLABEs válidas de plataforma (999, plaza 180) que el generador aleatorio no repetirá. */
function libresValidas(): string[] {
  return ['99918000000000001', '99918000000000002'].map(
    (base) => `${base}${digitoVerificador(base)}`,
  );
}
