// Importaciones prohibidas a propósito (DD-08, design.md §2.1). Lo revisa
// `npm run lint:verificar-reglas` como si fuera `api/src/modulos/cuentas/cuentas.dominio.ts`.
// El dominio son reglas puras: sin base de datos, sin HTTP y sin repositorios.
import { EntityManager } from 'typeorm'; // espera: no-restricted-imports
import { Pool } from 'pg'; // espera: no-restricted-imports
import express from 'express'; // espera: no-restricted-imports
import { buscarCuentas } from './cuentas.repositorio.js'; // espera: no-restricted-imports
import { Cuenta } from './cuenta.entidad.js'; // espera: no-restricted-imports

import { formatearMXN } from '@billetera/shared'; // válido
import { otraRegla } from './limites.dominio.js'; // válido

export const usados = [
  EntityManager,
  Pool,
  express,
  buscarCuentas,
  Cuenta,
  formatearMXN,
  otraRegla,
];
