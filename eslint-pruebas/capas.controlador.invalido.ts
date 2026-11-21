// Importaciones prohibidas a propósito (DD-08, design.md §2.1). Lo revisa
// `npm run lint:verificar-reglas` como si fuera `api/src/modulos/cuentas/cuentas.controlador.ts`.
// Un controlador no importa repositorios, entidades, `typeorm` ni `pg`.
import { buscarCuentas } from './cuentas.repositorio.js'; // espera: no-restricted-imports
import { Cuenta } from './cuenta.entidad.js'; // espera: no-restricted-imports
import { EntityManager } from 'typeorm'; // espera: no-restricted-imports
import { DataSource } from 'typeorm/data-source/DataSource.js'; // espera: no-restricted-imports
import { Pool } from 'pg'; // espera: no-restricted-imports

import { consultarCuentas } from './cuentas.casos-uso.js'; // válido
import { Router } from 'express'; // válido
import { validar } from '../../plataforma/http/validar.js'; // válido

export const usados = [
  buscarCuentas,
  Cuenta,
  EntityManager,
  DataSource,
  Pool,
  consultarCuentas,
  Router,
  validar,
];
