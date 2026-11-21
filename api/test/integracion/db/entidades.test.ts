import { randomInt, randomUUID } from 'node:crypto';
import { digitoVerificador } from '@billetera/shared';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Cuenta } from '../../../src/modulos/cuentas/cuenta.entidad.js';
import { Usuario } from '../../../src/modulos/identidad/usuario.entidad.js';
import { abrirDataSource, urlDueno } from '../apoyo/base.js';
import { aplicarTodas } from '../apoyo/migraciones.js';

const FONDEO_ID = '00000000-0000-0000-0000-000000000001';
const TEXTO_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?\+00$/;
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

function clabeAleatoria(): string {
  let primeros = '999180';
  for (let i = 0; i < 11; i++) primeros += String(randomInt(0, 10));
  return `${primeros}${digitoVerificador(primeros)}`;
}

let dataSource: DataSource;

beforeAll(async () => {
  await aplicarTodas();
  // Hasta T-API-08 no hay permisos para billetera_app: se usa el rol dueño.
  dataSource = await abrirDataSource(urlDueno(), 2);
});

afterAll(async () => {
  await dataSource.destroy();
});

async function crearUsuario(): Promise<Usuario> {
  const repo = dataSource.getRepository(Usuario);
  const { identifiers } = await repo.insert({
    correo: `entidad-${randomUUID()}@prueba.mx`,
    hashContrasena: HASH,
  });
  return repo.findOneByOrFail({ id: identifiers[0]?.['id'] as string });
}

describe('entidades', () => {
  it('DD-07 RNF-09: la cuenta Fondeo se lee con creadoEn como texto UTC y saldo como number', async () => {
    const fondeo = await dataSource.getRepository(Cuenta).findOneByOrFail({ id: FONDEO_ID });
    expect(fondeo).toMatchObject({
      tipo: 'SISTEMA',
      nombre: 'Fondeo',
      clabe: '999000000000000001',
      usuarioId: null,
    });
    expect(fondeo.creadoEn).toMatch(TEXTO_UTC);
    expect(typeof fondeo.saldoCentavos).toBe('number');
  });

  it('DD-07: Usuario se inserta y se lee con creadoEn como texto', async () => {
    const usuario = await crearUsuario();
    expect(usuario.creadoEn).toMatch(TEXTO_UTC);
    expect(usuario.hashContrasena).toBe(HASH);
  });

  it('RNF-07 D-01: insertar una Cuenta con saldoCentavos no escribe el saldo (insert: false)', async () => {
    const usuario = await crearUsuario();
    const repo = dataSource.getRepository(Cuenta);
    const { identifiers } = await repo.insert({
      usuarioId: usuario.id,
      tipo: 'USUARIO',
      nombre: 'Principal',
      clabe: clabeAleatoria(),
      saldoCentavos: 999_999,
    });
    const cuenta = await repo.findOneByOrFail({ id: identifiers[0]?.['id'] as string });
    expect(cuenta.saldoCentavos).toBe(0);
  });

  it('RNF-07 D-01: guardar una Cuenta con otro saldo no lo actualiza (update: false)', async () => {
    const usuario = await crearUsuario();
    const repo = dataSource.getRepository(Cuenta);
    const { identifiers } = await repo.insert({
      usuarioId: usuario.id,
      tipo: 'USUARIO',
      nombre: 'Ahorro',
      clabe: clabeAleatoria(),
    });
    const cuenta = await repo.findOneByOrFail({ id: identifiers[0]?.['id'] as string });
    cuenta.saldoCentavos = 123_456;
    await repo.save(cuenta);
    await expect(repo.findOneByOrFail({ id: cuenta.id })).resolves.toMatchObject({
      saldoCentavos: 0,
    });
  });
});
