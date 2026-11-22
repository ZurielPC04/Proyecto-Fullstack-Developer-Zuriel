import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { crearModuloIdentidad } from '../../../src/modulos/identidad/index.js';
import {
  contrasenasArgon2,
  type Contrasenas,
} from '../../../src/plataforma/seguridad/contrasenas.js';
import { appReal } from '../apoyo/app-real.js';
import { abrirDataSource } from '../apoyo/base.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await abrirDataSource();
});

afterAll(async () => {
  await dataSource.destroy();
});

it('R-1.7 RNF-23: cuando appReal resuelve, el hash ficticio de argon2 ya terminó; ningún trabajo nativo queda en vuelo', async () => {
  const cuenta = { iniciados: 0, terminados: 0 };
  const contrasenas: Contrasenas = {
    hash: async (contrasena) => {
      cuenta.iniciados++;
      const hash = await contrasenasArgon2.hash(contrasena);
      cuenta.terminados++;
      return hash;
    },
    verificar: contrasenasArgon2.verificar,
  };

  await appReal(dataSource, { modulos: (deps) => [crearModuloIdentidad(deps, { contrasenas })] });

  expect(cuenta).toEqual({ iniciados: 1, terminados: 1 });
});
